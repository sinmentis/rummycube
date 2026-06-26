import {BOARD_COLS, BOARD_GRID_ID, BOARD_ROWS, HAND_COLS, HAND_GRID_ID, HAND_ROWS} from "./constants.js";

function count2dArrItems(arr2d) {
    let counter = 0
    for (let row of arr2d) {
        for (let item of row) {
            if (item) {
                counter++
            }
        }
    }
    return counter
}

function buildGridsFromTilePositions(tilePositions, numPlayers) {
    const board = Array.from({length: BOARD_ROWS}, () => Array(BOARD_COLS).fill(null));
    const hands = Array.from({length: numPlayers}, () =>
        Array.from({length: HAND_ROWS}, () => Array(HAND_COLS).fill(null))
    );

    for (const tileId in tilePositions) {
        const pos = tilePositions[tileId];
        const {row, col, gridId, playerID} = pos;

        if (gridId === BOARD_GRID_ID) {
            if (row < BOARD_ROWS && col < BOARD_COLS) {
                board[row][col] = tileId;
            }
        } else if (gridId === HAND_GRID_ID && playerID != null) {
            const pId = parseInt(playerID);
            if (pId < numPlayers && row < HAND_ROWS && col < HAND_COLS) {
                hands[pId][row][col] = tileId;
            }
        }
    }

    return {board, hands};
}

function getPlayerHandTiles(G, playerID) {
    return Object.entries(G.tilePositions)
        .filter(([_, pos]) =>
            pos.gridId === HAND_GRID_ID && pos.playerID === playerID
        )
        .map(([tileId, _]) => tileId);
}

function getHandsTilesGrid(G, numPlayers) {
    const hands = Array.from({ length: numPlayers }, () =>
        Array.from({ length: HAND_ROWS }, () => Array(HAND_COLS).fill(null))
    );

    for (const [tileId, pos] of Object.entries(G.tilePositions)) {
        if (pos.gridId === HAND_GRID_ID && pos.playerID != null) {
            const playerIndex = parseInt(pos.playerID);
            if (!isNaN(playerIndex)) {
                hands[playerIndex][pos.row][pos.col] = tileId;
            }
        }
    }

    return hands;
}

export {
    count2dArrItems,
    buildGridsFromTilePositions,
    getPlayerHandTiles,
    getHandsTilesGrid,
}
