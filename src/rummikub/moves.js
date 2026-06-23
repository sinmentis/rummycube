import {BOARD_GRID_ID, HAND_COLS, HAND_GRID_ID, HAND_ROWS} from "./constants.js";
import _ from "lodash";
import {
    isBoardHasNewTiles,
    isFirstMoveValid,
    isFirstMove,
    isMoveValid,
    freezeTmpTiles, isBoardValid,
    getFormedGroups,
} from "./moveValidation.js";
import {
    countPoints,
    findWinner,
    getSecTs,
    getGameState,
    getTileReadableName, getHandsTilesGrid,
    getTileValue, isJoker,
} from "./util.js";
import {original} from "immer"
import {current} from 'immer';

import {pushTilesToGrid} from "./orderTiles.js";
import {orderTilesBySource} from "./dndUtil.js";

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
    const points = tmp.reduce((s, p) => s + (isJoker(p.id) ? 0 : getTileValue(p.id)), 0)
    G.lastPlay = {
        seat: player,
        count: tmp.length,
        points: points,
        groups: groups.map(seq => seq.map(Number)),
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

function onPlayPhaseBegin({G, ctx}) {
    console.log('PLAY PHASE BEGIN', new Date())
    G.timerExpireAt = getSecTs() + G.timePerTurn
    return G
}

function onTurnBegin({G, ctx}) {
    console.log('ON TURN BEGIN', new Date())
    G.timerExpireAt = getSecTs() + G.timePerTurn
    G.gameStateStack = []
    G.redoMoveStack = []
    if (G.lastCircle.length) {
        G.lastCircle.push(ctx.currentPlayer)
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

    let flattened = _.flatten(hands[ctx.currentPlayer])
    let tilesLeft = _.some(flattened, Boolean)
    if (!tilesLeft && isBoardValid(G)) {
        let points = countPoints(hands, ctx.currentPlayer)
        events.endGame({winner: ctx.currentPlayer, points: points})
    }
    return G
}

export {
    endTurn,
    forceEndTurn,
    moveTiles,
    validatePlayerMove,
    submitMeld,
    onTurnBegin,
    onTurnEnd,
    onPlayPhaseBegin,
    drawTile,
    undo,
    redo,
    checkGameOver
}