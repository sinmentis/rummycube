import {BOARD_GRID_ID, HAND_COLS, HAND_GRID_ID, HAND_ROWS} from "./constants.js";
import {
    isBoardHasNewTiles,
    isFirstMoveValid,
    isFirstMove,
    isMoveValid,
    freezeTmpTiles, isBoardValid,
    getFormedGroups,
    extractSeqs,
} from "./moveValidation.js";
import {
    getSecTs,
    getGameState,
    getTileReadableName,
    getTileValue, isJoker, freezeSeqJokers, isSequenceValid,
} from "./util.js";
import {original} from "immer"

import {pushTilesToGrid} from "./orderTiles.js";
import {orderTilesBySource} from "./dndUtil.js";
import {arrangeBoard} from "./arrange/index.js";   // explicit .js so node src/server.js boots
import {computePlayScore} from "./scoring/playScore.js";
import {logger} from './logger.js';

import { INVALID_MOVE } from 'boardgame.io/dist/cjs/core.js';


function drawTile({G, ctx, playerID, events}, doRollback = true) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE
    if (doRollback) {
        rollbackChanges(G, ctx.currentPlayer, ctx)
    }
    let tiles = []
    // Standard Rummikub: a draw always pulls exactly one tile (before and after
    // the first meld alike).
    let tile = G.tilesPool.pop()
    if (tile) {
        tiles.push(tile)
    }
    logger.debug('draw', {poolLeft: G.tilesPool.length})
    if (!G.tilesPool.length) {
        G.lastCircle.push(ctx.currentPlayer)
    }

    pushTilesToGrid(tiles, HAND_ROWS, HAND_COLS, G, {
        gridId: HAND_GRID_ID,
        playerID: ctx.currentPlayer
    }, ctx)
    G.recentlyDrawnTiles = tiles
    events.endTurn()
}


function isOverlap(G, ctx, col, row, destGridId, playerID) {
    for (const tileId in G.tilePositions) {
        const pos = G.tilePositions[tileId];

        if (pos.gridId === destGridId &&
            pos.row === row &&
            pos.col === col &&
            (destGridId !== HAND_GRID_ID || pos.playerID === playerID)) {
            console.debug('TILE OVERLAP');
            return true;
        }
    }
    return false;
}

// SP6 LOCK (fix4): a played lock freezes a formed GROUP for two turns. The entry
// {tiles, row, until} stores the locked group's tile-id signature; every board-
// mutating move is rejected if it would move any of those ids, until ctx.turn
// reaches `until`. Chaos-only — classic has no lockedSets, so this is a no-op there.
function lockedTileIds(G, ctx) {
    if (G.mode !== 'chaos' || !Array.isArray(G.lockedSets) || !G.lockedSets.length) return null;
    const turn = ctx && ctx.turn != null ? ctx.turn : 0;
    const ids = new Set();
    for (const l of G.lockedSets) {
        if (turn < l.until) for (const t of (l.tiles || [])) ids.add(Number(t));
    }
    return ids.size ? ids : null;
}

// True if any of `ids` is currently frozen. Pre-check for the moves that pick tiles
// up directly (moveTiles, an insertTilesWithPush drag, retrieveJoker).
function touchesLockedSet(G, ctx, ids) {
    const locked = lockedTileIds(G, ctx);
    if (!locked) return false;
    for (const id of ids) if (locked.has(Number(id))) return true;
    return false;
}


function moveTiles({G, ctx, playerID}, col, row, destGridId, tileIdObj, selectedTiles) {
    const movingIds = (selectedTiles.length && selectedTiles.indexOf(tileIdObj.id) !== -1) ? selectedTiles : [tileIdObj.id];
    if (touchesLockedSet(G, ctx, movingIds)) return INVALID_MOVE;
    if (ctx.currentPlayer === playerID) {
        G.gameStateStack.push(getGameState(G))
    }
    console.debug('MOVE TILE:', col, row, destGridId, tileIdObj, selectedTiles)
    let tileId = tileIdObj.id

    function insertTile(tileId, destGridId, destRow, destCol) {
        if (isOverlap(G, ctx, destCol, destRow, destGridId, playerID)) {
            console.debug('overlap detected!')
            return INVALID_MOVE;
        }
        let currPos = G.tilePositions[tileId]
        if (!currPos) return INVALID_MOVE
        let currPlayer = playerID
        let fromHandToBoard = currPos.gridId === HAND_GRID_ID && destGridId === BOARD_GRID_ID
        let fromHandToHand = currPos.gridId === HAND_GRID_ID && destGridId === HAND_GRID_ID
        let fromBoardToBoard = currPos.gridId === BOARD_GRID_ID && destGridId === BOARD_GRID_ID
        let fromBoardToHand = currPos.gridId === BOARD_GRID_ID && destGridId === HAND_GRID_ID && currPos.tmp
        let sourceRow = currPos.row
        let sourceCol = currPos.col
        let flags = null

        if (fromHandToBoard) {
            if (playerID !== ctx.currentPlayer || ctx.phase === 'playersJoin') return INVALID_MOVE
            if (String(currPos.playerID) !== String(playerID)) return INVALID_MOVE
            flags = {tmp: true, playerID: null}
        } else if (fromHandToHand) {
            flags = {tmp: false, playerID: currPos.playerID}
        } else if (fromBoardToBoard) {
            if (playerID !== ctx.currentPlayer) return INVALID_MOVE
            flags = {tmp: currPos.tmp, playerID: currPos.playerID}
        } else if (fromBoardToHand) {
            if (playerID !== ctx.currentPlayer) return INVALID_MOVE
            flags = {tmp: false, playerID: currPlayer}
        } else {
            return INVALID_MOVE
        }
        console.debug("INSERT TILE:", getTileReadableName(tileId), sourceRow, sourceCol, destRow, destCol, flags, selectedTiles)
        G.tilePositions[tileId] = {id: tileId, col: destCol, row: destRow, gridId: destGridId, ...flags}
    }

    if (selectedTiles.length > 0 && selectedTiles.indexOf(tileId) !== -1) {
        // Place the selection in rack reading order (row then col), not tap order,
        // so a run you sorted lands in the same order it looks. Shared with the
        // drag preview via orderTilesBySource.
        // A for-loop (not .map) so a rejected insert can early-return INVALID_MOVE,
        // discarding the whole immer draft, including the gameStateStack snapshot
        // pushed above and any tiles already placed earlier in this selection.
        const ordered = orderTilesBySource(selectedTiles, G.tilePositions)
        for (let index = 0; index < ordered.length; index++) {
            if (insertTile(ordered[index], destGridId, row, col + index) === INVALID_MOVE) {
                return INVALID_MOVE
            }
        }
    } else {
        if (insertTile(tileId, destGridId, row, col) === INVALID_MOVE) {
            return INVALID_MOVE
        }
    }
}

// Authoritative board drop: write the dragged tiles to the landing columns, then
// hand the post-drop board to the pure arrangeBoard engine to reflow the cluster the
// drop landed in toward valid blocks (server-authoritative, semantic — not geometric).
// Mirrors moveTiles' signature. The whole cascade is one reducer pass and one undo
// entry; an INVALID_MOVE discards the immer draft so G is untouched.
function insertTilesWithPush({G, ctx, playerID}, col, row, destGridId, tileIdObj, selectedTiles) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
    if (destGridId !== BOARD_GRID_ID) return INVALID_MOVE;

    const tileId = tileIdObj.id;
    const selection = (selectedTiles.length && selectedTiles.indexOf(tileId) !== -1)
        ? orderTilesBySource(selectedTiles, G.tilePositions)
        : [tileId];
    if (touchesLockedSet(G, ctx, selection)) return INVALID_MOVE;

    // 1) write the dropped tiles to the landing columns (col, col+1, ...) as tmp.
    for (let i = 0; i < selection.length; i++) {
        const id = selection[i];
        const p = G.tilePositions[id];
        if (!p) return INVALID_MOVE;
        let flags;
        if (p.gridId === HAND_GRID_ID) {
            if (String(p.playerID) !== String(playerID)) return INVALID_MOVE;
            if (ctx.phase === 'playersJoin') return INVALID_MOVE;
            flags = {tmp: true, playerID: null};
        } else if (p.gridId === BOARD_GRID_ID) {
            flags = {tmp: p.tmp, playerID: p.playerID};
        } else {
            return INVALID_MOVE;
        }
        G.tilePositions[id] = {id, col: col + i, row, gridId: BOARD_GRID_ID, ...flags};
    }

    // 2) reflow the cluster the drop landed in (pure, server-authoritative).
    const result = arrangeBoard(G.tilePositions, {droppedIds: selection, row, col});
    if (!result.ok) return INVALID_MOVE;   // immer discards the draft -> non-destructive snap-back

    // Fix4 LOCK: the reflow can shift tiles that weren't dragged. Reject the whole
    // move if it would relocate any frozen tile (placement differs from where it
    // currently sits). Chaos-only — lockedTileIds is null in classic, so this skips.
    const locked = lockedTileIds(G, ctx);
    if (locked) {
        for (const id in result.placements) {
            if (!locked.has(Number(id))) continue;
            const cur = G.tilePositions[id];
            const {row: nr, col: nc} = result.placements[id];
            if (!cur || cur.row !== nr || cur.col !== nc) return INVALID_MOVE;
        }
    }

    // 3) one snapshot so a single undo restores the whole arrangement.
    if (ctx.currentPlayer === playerID) G.gameStateStack.push(getGameState(G));

    for (const id in result.placements) {
        const p = G.tilePositions[id];
        const {row: nr, col: nc} = result.placements[id];
        G.tilePositions[id] = {...p, row: nr, col: nc};
    }
}

function endTurn({G, ctx, playerID, events}) {
    if (ctx.currentPlayer !== playerID) {
        console.log('>>>>> invalid move endTurn')
        return INVALID_MOVE
    }
    console.debug('END TURN CALLED', ctx.currentPlayer)
    if (isBoardHasNewTiles(G)) {
        console.debug('BOARD IS DIRTY')
        validatePlayerMove(G, ctx, playerID, events)
    } else {
        console.debug('BOARD IS CLEAN')
        drawTile({G, ctx, playerID, events}, !isBoardValid(G))
    }
}

function forceEndTurn({G, ctx, events}) {
    // Any player may force-end the current turn, but ONLY after the server-set
    // deadline has passed. G.timerExpireAt is written server-side in
    // onTurnBegin/onPlayPhaseBegin, so a client cannot extend its own turn by
    // suppressing its local timer — an honest opponent ends it and the server
    // rejects any force-end before the real deadline.
    if (!G.timerExpireAt || getSecTs() < G.timerExpireAt) {
        return INVALID_MOVE
    }
    const player = ctx.currentPlayer
    const poolBefore = G.tilesPool.length
    if (isBoardHasNewTiles(G)) {
        validatePlayerMove(G, ctx, player, events)
    } else {
        drawTile({G, ctx, playerID: player, events}, !isBoardValid(G))
    }
    // Server-authoritative "time's up" announcement, written ONLY after the
    // deadline guard so a pre-deadline force-end returns INVALID_MOVE above and
    // leaves G untouched (the immer draft is discarded). drawCount is the real
    // pool delta: 2 after the player's first meld, 1 before it, 0 for a kept
    // submit. Every client renders it via playerView; onTurnBegin clears it once
    // a whole turn has passed (staleness guard there).
    G.lastTimeout = {seat: Number(player), drawCount: poolBefore - G.tilesPool.length, id: ctx.turn}
}

function forfeitTurn({G, ctx, playerID, events}) {
    // Explicit, intentional "give up my turn": unlike the timeout-only
    // forceEndTurn, this is gated solely on being the current player. Reuses
    // drawTile with doRollback=true to revert staged tmp tiles, draw the
    // penalty, and end the turn.
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE
    drawTile({G, ctx, playerID, events}, true)
}

function rollbackChanges(G, player, ctx) {
    let tilesToReturnBack = []
    for (const [tile, tilePos] of Object.entries(G.tilePositions)) {
        if (tilePos.gridId === BOARD_GRID_ID) {
            if (tilePos.tmp) {
                tilesToReturnBack.push(tile)
                G.tilePositions[tile] = null
            } else {
                G.tilePositions[tile] = G.prevTilePositions[tile]
            }
        }
    }
    pushTilesToGrid(tilesToReturnBack, HAND_ROWS, HAND_COLS, G, {gridId: HAND_GRID_ID, playerID: player}, ctx)
    freezeTmpTiles(G)
}

function undo({G, ctx, playerID}) {
    if (ctx.currentPlayer !== playerID) return INVALID_MOVE
    let currPlayer = playerID
    let lastGameState = G.gameStateStack.pop()
    if (!lastGameState) {
        console.log('No moves to undo')
        return INVALID_MOVE
    }
    let currentState = getGameState(G)
    G.redoMoveStack.push(currentState)
    for (const [key, value] of Object.entries(lastGameState.tilePositions)) {
        if (value.gridId === BOARD_GRID_ID || (value.gridId === HAND_GRID_ID && value.playerID === currPlayer)) {
            G.tilePositions[value.id] = original(value)
        }
    }
    for (const [key, value] of Object.entries(lastGameState.prevTilePositions)) {
        if (value.gridId === BOARD_GRID_ID || (value.gridId === HAND_GRID_ID && value.playerID === currPlayer)) {
            G.prevTilePositions[value.id] = original(value)
        }
    }
    console.log('undo done')
}

function redo({G, ctx, playerID}) {
    if (ctx.currentPlayer !== playerID) return INVALID_MOVE
    let currPlayer = playerID
    let nextGameState = G.redoMoveStack.pop()
    if (!nextGameState) {
        console.log('No moves to redo')
        return INVALID_MOVE
    }
    for (const [key, value] of Object.entries(nextGameState.tilePositions)) {
        if (value.gridId === BOARD_GRID_ID || (value.gridId === HAND_GRID_ID && value.playerID === currPlayer)) {
            G.tilePositions[value.id] = value
        }
    }
    for (const [key, value] of Object.entries(nextGameState.prevTilePositions)) {
        if (value.gridId === BOARD_GRID_ID || (value.gridId === HAND_GRID_ID && value.playerID === currPlayer)) {
            G.prevTilePositions[value.id] = value
        }
    }
    console.log('redo done')
}

function applyValidMove({G, ctx, events}) {
    let player = ctx.currentPlayer
    // Record the play so EVERY client can celebrate the combo (not just the
    // player who made it). Computed before freezing while tiles are still tmp.
    const groups = getFormedGroups(G)
    const s = computePlayScore({tilePositions: G.tilePositions, formedGroups: groups, prevTilePositions: G.prevTilePositions})
    // T11: accumulate this-game highlights (guard legacy matches with no G.stats).
    // applyValidMove only runs on a valid move, so mutating G.stats here is the
    // success path and atomic with the rest of the play.
    if (G.stats) {
        const runLen = s.groups && s.groups.length ? Math.max(...s.groups.map(g => g.length)) : 0
        G.stats.bestCombo = Math.max(G.stats.bestCombo, s.manipulation)
        G.stats.longestRun = Math.max(G.stats.longestRun, runLen)
    }
    G.firstMoveDone[player] = true
    G.lastPlay = {seat: player, ...s, ts: getSecTs()}
    freezeTmpTiles(G)
    events.endTurn()
}

function validatePlayerMove(G, ctx, playerID, events) {
    let player = ctx.currentPlayer
    console.debug('VALIDATE PLAYER MOVE', player)
    let moveValid = false
    if (isFirstMove(G, ctx)) {
        console.debug("FIRST MOVE")
        moveValid = isFirstMoveValid(G, ctx)
    } else {
        console.debug("NOT FIRST MOVE")
        moveValid = isMoveValid(G, ctx)
    }
    if (moveValid) {
        console.debug('MOVE VALID')
        applyValidMove({G, ctx, events})
    } else {
        console.debug('MOVE INVALID')
        drawTile({G, ctx, playerID, events})
    }
}

// Classic rule: a board joker is reclaimed by handing over a single hand tile
// matching the value it represents (its colour is enforced by the post-swap
// board-validity check). The joker returns to the player's hand.
const JOKER_RETRIEVE_TILES_NEEDED = 1
// v1 keeps retrieval independent of any meld this turn. Hook for a future rule
// that would require the reclaimed joker to be re-melded in the same turn.
const JOKER_RETRIEVE_REQUIRES_MELD_SAME_TURN = false

// Current-player move: reclaim a frozen board joker by swapping in the single
// hand tile it represents. Non-destructive — any ineligibility (wrong player,
// not a settled board joker, a hand tile of the wrong value, or a swap that
// would invalidate the board) returns INVALID_MOVE, which makes boardgame.io
// discard the immer draft so G is left untouched (mirrors the submitMeld no-op
// contract). Does NOT end the turn or draw.
function retrieveJoker({G, ctx, playerID}, jokerTileId, tileId) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE

    const jokerId = Number(jokerTileId)
    const jokerPos = G.tilePositions[jokerId]
    // Must be a settled (non-tmp) joker on the board.
    if (!jokerPos || jokerPos.gridId !== BOARD_GRID_ID || jokerPos.tmp || !isJoker(jokerId)) {
        return INVALID_MOVE
    }
    const jokerRow = jokerPos.row
    const jokerCol = jokerPos.col

    // Fix4 LOCK: a frozen board joker inside a locked group can't be reclaimed —
    // the swap would split the frozen set. Chaos-only (classic has no lockedSets).
    if (touchesLockedSet(G, ctx, [jokerId])) return INVALID_MOVE
    // The joker must live in a currently-valid run/group; its represented value
    // comes from freezing that sequence.
    const seq = extractSeqs(G).find(s => s.some(t => Number(t) === jokerId))
    if (!seq || !isSequenceValid(seq)) return INVALID_MOVE
    const frozen = freezeSeqJokers(seq)
    if (!frozen) return INVALID_MOVE
    const jokerIndex = seq.findIndex(t => Number(t) === jokerId)
    const representedValue = getTileValue(frozen[jokerIndex])

    // The swap tile must be one of the current player's hand tiles, a non-joker,
    // and match the joker's represented value. Its COLOUR is enforced by the
    // board-validity check below.
    const swapTile = Number(tileId)
    const swapPos = G.tilePositions[swapTile]
    if (!swapPos || swapPos.gridId !== HAND_GRID_ID || String(swapPos.playerID) !== String(playerID)) return INVALID_MOVE
    if (isJoker(swapTile)) return INVALID_MOVE
    if (getTileValue(swapTile) !== representedValue) return INVALID_MOVE

    // Swap: the hand tile takes the joker's board slot, the joker takes that
    // tile's freed hand slot. Then the board must still be valid, otherwise no-op.
    const swapRow = swapPos.row
    const swapCol = swapPos.col
    G.tilePositions[swapTile] = {id: swapTile, col: jokerCol, row: jokerRow, gridId: BOARD_GRID_ID, tmp: false, playerID: null}
    G.tilePositions[jokerId] = {id: jokerId, col: swapCol, row: swapRow, gridId: HAND_GRID_ID, tmp: false, playerID}

    if (!isBoardValid(G)) {
        return INVALID_MOVE
    }
}

const EXTEND_TURN_MS = 15000;

// One-time per-turn "+15s" relief. Server-authoritative: the deadline lives in
// G.timerExpireAt and this move only ever moves it FORWARD, only for the current
// player (the playerID guard), and only once per turn (onTurnBegin re-arms the
// flag). The forceEndTurn deadline guard is untouched, so this can never shorten
// a turn; a reject returns INVALID_MOVE and the immer draft is discarded (no-op).
function extendTurn({G, ctx, playerID}) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE
    if (!Array.isArray(G.turnExtended)) G.turnExtended = []
    const seat = Number(ctx.currentPlayer)
    if (G.turnExtended[seat]) return INVALID_MOVE          // already extended this turn
    if (!G.timerExpireAt) return INVALID_MOVE
    G.turnExtended[seat] = true
    G.timerExpireAt = G.timerExpireAt + EXTEND_TURN_MS
}

function submitMeld({G, ctx, playerID, events}) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE
    if (!isBoardHasNewTiles(G)) return INVALID_MOVE
    const valid = isFirstMove(G, ctx) ? isFirstMoveValid(G, ctx) : isMoveValid(G, ctx)
    if (!valid) {
        // NO-OP: returning INVALID_MOVE makes the framework discard the immer
        // draft, so G (tiles, hands, pool) and currentPlayer stay unchanged.
        // No rollback, no penalty draw, no endTurn — unlike the timeout path.
        return INVALID_MOVE
    }
    applyValidMove({G, ctx, events})
}

// SERVER-AUTHORITATIVE connection mirror. The seat is ALWAYS the authenticated
// caller (playerID, resolved by the server transport from the socket) — never a
// move argument — so a client can only ever flip its OWN flag, and a genuine
// socket disconnect/sync event (server.js) overrides it. Marking yourself offline
// only shortens your own turn (self-harm, not an exploit); marking yourself online
// is corrected by the next real disconnect event. This satisfies global-constraints:
// never trust a client-supplied connection flag.
function _setConnection({G, ctx, playerID}, connected) {
    if (playerID === undefined || playerID === null) return INVALID_MOVE
    const seat = Number(playerID)
    if (!Array.isArray(G.connected)) G.connected = []
    if (!Array.isArray(G.disconnectTurns)) G.disconnectTurns = []
    G.connected[seat] = !!connected
    // Reconnect clears any accrued disconnect penalty immediately (brief: reset on reconnect).
    if (connected) G.disconnectTurns[seat] = 0
}

export {
    endTurn,
    forceEndTurn,
    forfeitTurn,
    moveTiles,
    insertTilesWithPush,
    validatePlayerMove,
    submitMeld,
    extendTurn,
    retrieveJoker,
    drawTile,
    undo,
    redo,
    _setConnection,
}

export {GRACE_MS, N_FORFEIT_TURNS, checkGameOver, onPlayPhaseBegin, onTurnBegin, onTurnEnd} from './turn.js';