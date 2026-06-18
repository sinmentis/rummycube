import _ from "lodash";
import {
    getTileColor,
    getTileValue,
    groupValidSequences,
    getGameState,
    getPlayerHandTiles
} from "./util.js";
import {HAND_COLS, HAND_GRID_ID, HAND_ROWS} from "./constants.js";

function isTileSlotEmpty(G, gridId, row, col, playerID = null) {
    return !Object.values(G.tilePositions).some(pos =>
        pos &&
        pos.gridId === gridId &&
        pos.row === row &&
        pos.col === col &&
        (playerID === null || pos.playerID === playerID)
    );
}

function pushTilesToGrid(tiles, grid_rows, grid_cols, G, flags, ctx, override) {
    let tilesCopy = tiles.slice()
    for (let row = 0; row < grid_rows; row++) {
        for (let col = 0; col < grid_cols; col++) {
            if (isTileSlotEmpty(G, flags.gridId, row, col, flags.playerID) || override) {
                let tile = tilesCopy.shift()
                if (tile) {
                    G.tilePositions[tile] = {
                        id: tile,
                        col: col,
                        row: row,
                        ...flags,
                    }
                }
            }
        }
    }
}

function compareTilesByColorVal(a, b) {
    const aColor = getTileColor(a);
    const aValue = getTileValue(a);
    const bColor = getTileColor(b);
    const bValue = getTileValue(b);

    if (aColor === bColor) {
        return aValue - bValue;
    }
    return aColor - bColor;
};

function compareTilesByValColor(a, b) {
    const aColor = getTileColor(a);
    const aValue = getTileValue(a);
    const bColor = getTileColor(b);
    const bValue = getTileValue(b);

    if (aValue === bValue) {
        return aColor - bColor;
    }
    return aValue - bValue;
};


function orderByFunc(tiles, sortingFunc) {
    let flattened = _.compact(_.flatten(tiles))
    flattened.sort(sortingFunc);
    return flattened
}

function orderBy(G, ctx, sortingFunc, playerID) {
    if (playerID == ctx.currentPlayer) {
        G.gameStateStack.push(getGameState(G))
    }
    let tiles = getPlayerHandTiles(G, playerID)
    let sorted = orderByFunc(tiles, sortingFunc)

    pushTilesToGrid(groupValidSequences(sorted), HAND_ROWS, HAND_COLS, G,
        {gridId: HAND_GRID_ID, playerID: playerID}, ctx, true)
}

function orderByColorVal({G, ctx, playerID}) {
    orderBy(G, ctx, compareTilesByColorVal, playerID);
}

function orderByValColor({G, ctx, playerID}) {
    orderBy(G, ctx, compareTilesByValColor, playerID);
}

export {
    orderByValColor,
    orderByColorVal,
    pushTilesToGrid,
    orderByFunc,
    compareTilesByColorVal,
    compareTilesByValColor,
}