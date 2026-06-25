import {BOARD_COLS, BOARD_GRID_ID, HAND_COLS, HAND_GRID_ID, HAND_ROWS} from "./constants.js";
import flatten from "lodash/flatten.js";
import some from "lodash/some.js";
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
    countPoints,
    findWinner,
    getSecTs,
    getGameState,
    getTileReadableName, getHandsTilesGrid,
    getTileValue, isJoker, freezeSeqJokers, isSequenceValid,
} from "./util.js";
import {original} from "immer"
import {current} from 'immer';

import {pushTilesToGrid} from "./orderTiles.js";
import {orderTilesBySource, boardRowTiles} from "./dndUtil.js";
import {insertWithPush} from "./insertPush.js";   // explicit .js so node src/server.js boots
import {manipulationScore} from "./juice/comboMath.js";

import { INVALID_MOVE } from 'boardgame.io/dist/cjs/core.js';


function drawTile({G, ctx, playerID, events}, doRollback = true) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE
    if (doRollback) {
        rollbackChanges(G, ctx.currentPlayer, ctx)
    }
    let tiles = []
    let firstMoveDone = G.firstMoveDone[ctx.currentPlayer]
    for (let i = 0; i < (firstMoveDone ? 2 : 1); i++) {
        let tile = G.tilesPool.pop()
        if (!tile) {
            break
        } else {
            tiles.push(tile)
        }
    }
    console.log(`tiles pool: ${current(G.tilesPool)}`)
    console.log(`last circle ${current(G.lastCircle)}`)
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


function moveTiles({G, ctx, playerID}, col, row, destGridId, tileIdObj, selectedTiles) {
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

// Authoritative "auto-snap + insert/push": drop N dragged tiles onto a single board
// row, rippling the colliding run aside (T1's insertWithPush). Mirrors moveTiles'
// signature. Geometric only — it never calls isOverlap/isBoardValid; run/group
// validity stays a submit-time concern. The whole cascade is one reducer pass and one
// undo entry; an INVALID_MOVE discards the immer draft so G is untouched.
function insertTilesWithPush({G, ctx, playerID}, col, row, destGridId, tileIdObj, selectedTiles) {
    const T = col;
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
    if (destGridId !== BOARD_GRID_ID) return INVALID_MOVE;

    const tileId = tileIdObj.id;
    const selection = (selectedTiles.length && selectedTiles.indexOf(tileId) !== -1)
        ? orderTilesBySource(selectedTiles, G.tilePositions)
        : [tileId];
    const N = selection.length;

    // The target row's existing occupants, excluding the dragged selection
    // (shared with the client's drop dispatch via dndUtil.boardRowTiles).
    const rowTiles = boardRowTiles(G.tilePositions, row, selection);

    const plan = insertWithPush(rowTiles, T, N, BOARD_COLS - 1);
    if (!plan) return INVALID_MOVE;

    // Only push after a feasible plan: one snapshot => one undo restores the whole
    // arrangement (mirrors moveTiles:79 semantics).
    if (ctx.currentPlayer === playerID) G.gameStateStack.push(getGameState(G));

    // (1) Pushed board tiles: change ONLY col, keep id/row/gridId/tmp/playerID.
    for (const id in plan.shifts) {
        const p = G.tilePositions[id];
        G.tilePositions[id] = {...p, col: plan.shifts[id]};
    }
    // (2) Dragged tiles land at newCols with moveTiles' flags (no isOverlap call).
    for (let i = 0; i < selection.length; i++) {
        const id = selection[i];
        const p = G.tilePositions[id];
        if (!p) return INVALID_MOVE;
        let flags;
        if (p.gridId === HAND_GRID_ID) {            // hand -> board
            if (String(p.playerID) !== String(playerID)) return INVALID_MOVE;   // must: reject moving an opponent's hand tile
            if (ctx.phase === 'playersJoin') return INVALID_MOVE;   // same as moveTiles
            flags = {tmp: true, playerID: null};
        } else if (p.gridId === BOARD_GRID_ID) {    // board -> board (re-arrange committed/tmp tiles)
            flags = {tmp: p.tmp, playerID: p.playerID};
        } else {
            return INVALID_MOVE;
        }
        G.tilePositions[id] = {id: p.id, col: plan.newCols[i], row, gridId: BOARD_GRID_ID, ...flags};
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
    G.firstMoveDone[player] = true
    // Record the play so EVERY client can celebrate the combo (not just the
    // player who made it). Computed before freezing while tiles are still tmp.
    const groups = getFormedGroups(G)
    const tmp = Object.values(G.tilePositions).filter(p => p && p.gridId === BOARD_GRID_ID && p.tmp)
    // A joker scores the value it REPRESENTS inside its run/group, not 0. Map each
    // tmp joker to its frozen value via the formed (valid) sequence that holds it.
    const jokerValueById = {}
    for (const seq of groups) {
        const frozen = freezeSeqJokers(seq)
        if (!frozen) continue
        seq.forEach((tid, i) => {
            if (isJoker(tid)) {
                jokerValueById[Number(tid)] = getTileValue(frozen[i])
            }
        })
    }
    const points = tmp.reduce((s, p) => s + (isJoker(p.id) ? (jokerValueById[p.id] || 0) : getTileValue(p.id)), 0)
    // Manipulation score rewards groups formed + existing board tiles rearranged
    // this turn over a raw tile dump. prevTilePositions is the turn-start baseline
    // and is reset next turn, so this must run here, pre-freeze.
    const placed = tmp.length
    const baseline = G.prevTilePositions || {}
    const rearranged = Object.values(G.tilePositions).filter(p => {
        if (!p || p.gridId !== BOARD_GRID_ID || p.tmp) return false
        const prev = baseline[p.id]
        return prev && prev.gridId === BOARD_GRID_ID && (prev.col !== p.col || prev.row !== p.row)
    }).length
    const score = manipulationScore({groups: groups.length, rearranged, placed})
    G.lastPlay = {
        seat: player,
        count: score,
        points: points,
        manipulation: score,
        groups: groups.map(seq => seq.map(Number)),
        rearranged: rearranged,
        placed: placed,
        ts: getSecTs(),
    }
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

// Disconnected-seat tuning. Both are [PLACEHOLDER] pending Game Design / Product:
// GRACE_MS is the (short) deadline a disconnected seat's turn gets instead of the
// full timePerTurn, so an honest opponent's forceEndTurn nudge advances it fast.
// N_FORFEIT_TURNS is how many consecutive disconnected turn-begins a seat may rack
// up before it is forfeited (its hand scored, the seat skipped).
const GRACE_MS = 5000
const N_FORFEIT_TURNS = 3

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

function onPlayPhaseBegin({G, ctx}) {
    console.log('PLAY PHASE BEGIN', new Date())
    G.timerExpireAt = getSecTs() + G.timePerTurn
    return G
}

// When a seat reaches N_FORFEIT_TURNS disconnected turn-begins, retire it: mark it
// forfeited and, if only one seat is still in play, end the match scoring remaining
// hands with the standard helper (reuses countPoints/findWinner; no rule relaxed).
function forfeitSeat(G, ctx, seat, events) {
    if (!Array.isArray(G.forfeited)) G.forfeited = []
    G.forfeited[seat] = true
    const remaining = []
    for (let i = 0; i < ctx.numPlayers; i++) {
        if (!G.forfeited[i]) remaining.push(i)
    }
    if (remaining.length <= 1 && events) {
        const hands = getHandsTilesGrid(G, ctx.numPlayers)
        const winner = remaining.length === 1 ? remaining[0] : findWinner(hands)
        const points = countPoints(hands, winner)
        events.endGame({winner: winner.toString(), points: points})
    }
}

function onTurnBegin({G, ctx, events}) {
    console.log('ON TURN BEGIN', new Date())
    const seat = ctx.currentPlayer
    const seatIdx = Number(seat)
    // Defensive defaults so matches created before WS-12 (no connected arrays) still run.
    if (!Array.isArray(G.connected)) G.connected = []
    if (!Array.isArray(G.disconnectTurns)) G.disconnectTurns = []
    if (!Array.isArray(G.forfeited)) G.forfeited = []

    if (G.forfeited[seatIdx]) {
        // Already retired: nothing to wait for, let an opponent force-advance at once.
        G.timerExpireAt = getSecTs()
    } else if (G.connected[seatIdx] === false) {
        G.disconnectTurns[seatIdx] = (G.disconnectTurns[seatIdx] ?? 0) + 1
        if (G.disconnectTurns[seatIdx] >= N_FORFEIT_TURNS) {
            forfeitSeat(G, ctx, seatIdx, events)
            G.timerExpireAt = getSecTs()
        } else {
            // Collapse the deadline: the disconnected seat's turn ends within GRACE_MS,
            // not the full timePerTurn. The forceEndTurn deadline guard is untouched.
            G.timerExpireAt = getSecTs() + GRACE_MS
        }
    } else {
        // Connected (or reconnected): full budget, and clear any accrued disconnect count.
        G.disconnectTurns[seatIdx] = 0
        G.timerExpireAt = getSecTs() + G.timePerTurn
    }

    G.gameStateStack = []
    G.redoMoveStack = []
    if (G.lastCircle.length) {
        G.lastCircle.push(seat)
    }
    G.prevTilePositions = original(G.tilePositions)

    // forceEndTurn writes G.lastTimeout then its own endTurn fires the NEXT
    // onTurnBegin inside the SAME state update, where G.lastTimeout.id ===
    // ctx.turn - 1. An unconditional clear would wipe the transient before any
    // client renders it, so keep it for a full turn and drop it only once stale.
    if (G.lastTimeout && typeof G.lastTimeout.id === 'number' && G.lastTimeout.id <= ctx.turn - 2) {
        G.lastTimeout = null
    }

    return G
}

function onTurnEnd({G, ctx, events}) {
    console.log('ON TURN END', new Date())
    G.timerExpireAt = null
    checkGameOver(G, ctx, events)
}

function checkGameOver(G, ctx, events) {
    let hands = getHandsTilesGrid(G, ctx.numPlayers)
    if (G.lastCircle.length >= ctx.numPlayers) {
        let winner = findWinner(hands)
        let points = countPoints(hands, winner)
        events.endGame({winner: winner.toString(), points: points})
    }

    let flattened = flatten(hands[ctx.currentPlayer])
    let tilesLeft = some(flattened, Boolean)
    if (!tilesLeft && isBoardValid(G)) {
        let points = countPoints(hands, ctx.currentPlayer)
        events.endGame({winner: ctx.currentPlayer, points: points})
    }
    return G
}

export {
    endTurn,
    forceEndTurn,
    forfeitTurn,
    moveTiles,
    insertTilesWithPush,
    validatePlayerMove,
    submitMeld,
    retrieveJoker,
    onTurnBegin,
    onTurnEnd,
    onPlayPhaseBegin,
    drawTile,
    undo,
    redo,
    checkGameOver,
    _setConnection,
    GRACE_MS,
    N_FORFEIT_TURNS,
}