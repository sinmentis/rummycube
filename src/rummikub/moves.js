import {BOARD_GRID_ID, HAND_COLS, HAND_GRID_ID, HAND_ROWS} from "./constants.js";
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
    getTileValue, isJoker, freezeSeqJokers, isSequenceValid, deactivateTileVariant,
} from "./util.js";
import {original} from "immer"
import {current} from 'immer';

import {pushTilesToGrid} from "./orderTiles.js";
import {orderTilesBySource} from "./dndUtil.js";
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
        const ordered = orderTilesBySource(selectedTiles, G.tilePositions)
        ordered.map(function (id, index) {
            insertTile(id, destGridId, row, col + index)
        })
    } else {
        insertTile(tileId, destGridId, row, col)
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
    if (isBoardHasNewTiles(G)) {
        validatePlayerMove(G, ctx, player, events)
    } else {
        drawTile({G, ctx, playerID: player, events}, !isBoardValid(G))
    }
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

// Owner decision #6: a board joker is reclaimable only by handing over TWO
// physical copies of the tile it represents. Flip to 1 for the classic rule
// (any single matching tile). [待核实] design point — two copies is restrictive
// and may rarely be satisfiable in practice; see report.
const JOKER_RETRIEVE_TILES_NEEDED = 2
// v1 keeps retrieval independent of any meld this turn. Hook for a future rule
// that would require the reclaimed joker to be re-melded in the same turn.
const JOKER_RETRIEVE_REQUIRES_MELD_SAME_TURN = false

// Current-player move: reclaim a frozen board joker by swapping in matching hand
// tiles. Non-destructive — any ineligibility (wrong player, not a joker, missing
// copies, or a swap that would invalidate the board) returns INVALID_MOVE, which
// makes boardgame.io discard the immer draft so G is left untouched (mirrors the
// submitMeld no-op contract). Does NOT end the turn or draw.
function retrieveJoker({G, ctx, playerID}, jokerTileId, tileA, tileB) {
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

    // Exactly TILES_NEEDED distinct hand tiles, all the same face (two physical
    // copies of one tile), all matching the joker's represented value. The
    // represented COLOUR is enforced by the board-validity check below.
    const candidates = [Number(tileA), Number(tileB)].slice(0, JOKER_RETRIEVE_TILES_NEEDED)
    if (new Set(candidates).size !== JOKER_RETRIEVE_TILES_NEEDED) return INVALID_MOVE
    for (const cid of candidates) {
        const pos = G.tilePositions[cid]
        if (!pos || pos.gridId !== HAND_GRID_ID || pos.playerID !== playerID) return INVALID_MOVE
        if (isJoker(cid)) return INVALID_MOVE
        if (getTileValue(cid) !== representedValue) return INVALID_MOVE
    }
    if (new Set(candidates.map(deactivateTileVariant)).size !== 1) return INVALID_MOVE

    // Swap: one copy takes the joker's board slot, the joker takes that copy's
    // freed hand slot. Then the board must still be valid, otherwise no-op.
    const swapTile = candidates[0]
    const swapHand = G.tilePositions[swapTile]
    const swapRow = swapHand.row
    const swapCol = swapHand.col
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