import {tryOrderTiles} from "./util";
import {HAND_GRID_ID} from "./constants.js";
import {toggleSelection} from "./dndUtil";

// Pure: the whole contiguous run (extend left + right) sharing the pressed tile's
// grid + row, in reading order (cols ascending) and including the pressed tile. A gap
// stops the run. HAND_GRID_ID runs are isolated per playerID; board tiles (playerID:null)
// are not, so a whole-table run can form.
export function contiguousGroup(tilePositions, pressedTileId) {
    const p = tilePositions[pressedTileId];
    if (!p) return [pressedTileId];
    const {gridId, row, col, playerID} = p;
    const byCol = {};
    for (const id in tilePositions) {
        const q = tilePositions[id];
        if (!q || q.gridId !== gridId || q.row !== row) continue;
        if (gridId === HAND_GRID_ID && String(q.playerID) !== String(playerID)) continue;
        byCol[q.col] = id;
    }
    const group = [pressedTileId];
    for (let c = col - 1; byCol[c] != null; c--) group.unshift(byCol[c]);
    for (let c = col + 1; byCol[c] != null; c++) group.push(byCol[c]);
    return group;
}

// Pure: the pressed tile plus the contiguous run to its RIGHT (ascending cols),
// same grid + row; a gap stops the run. The left side is never included. HAND
// runs are isolated per playerID; board tiles (playerID:null) are not.
export function tilesRightward(tilePositions, pressedTileId) {
    const p = tilePositions[pressedTileId];
    if (!p) return [pressedTileId];
    const {gridId, row, col, playerID} = p;
    const byCol = {};
    for (const id in tilePositions) {
        const q = tilePositions[id];
        if (!q || q.gridId !== gridId || q.row !== row) continue;
        if (gridId === HAND_GRID_ID && String(q.playerID) !== String(playerID)) continue;
        byCol[q.col] = id;
    }
    const group = [pressedTileId];
    for (let c = col + 1; byCol[c] != null; c++) group.push(byCol[c]);
    return group;
}



function getTilesInSameRow(G, tilePos) {
    return Object.entries(G.tilePositions)
        .filter(([id, pos]) =>
            pos.gridId === tilePos.gridId &&
            pos.row === tilePos.row &&
            (tilePos.playerID === undefined || pos.playerID === tilePos.playerID)
        )
        .sort((a, b) => a[1].col - b[1].col); // Sort by column
}

function getTilesInSameCol(G, tilePos) {
    return Object.entries(G.tilePositions)
        .filter(([id, pos]) =>
            pos.gridId === tilePos.gridId &&
            pos.col === tilePos.col &&
            (tilePos.playerID === undefined || pos.playerID === tilePos.playerID)
        )
        .sort((a, b) => a[1].row - b[1].row); // Sort by row
}


function handleTileSelection(G, state, setState, playerID, tileId, shiftKey, ctrlKey) {
    const tilePos = G.tilePositions[tileId];
    console.debug('HANDLING CLICK ON TILE:', tileId, tilePos);

    if (ctrlKey) {
        setState((prevState) => {
            const isSelected = prevState.selectedTiles.includes(tileId);
            const newSelected = isSelected
                ? prevState.selectedTiles.filter(id => id !== tileId)
                : tryOrderTiles([...prevState.selectedTiles, tileId]);
            return {
                selectedTiles: newSelected,
                lastSelectedTileId: prevState.lastSelectedTileId,
            };
        });
        return;
    }

    if (!shiftKey || !state.lastSelectedTileId) {
        setState(prev => ({
            selectedTiles: toggleSelection(prev.selectedTiles, tileId),
            lastSelectedTileId: tileId,
        }));
        return;
    }

    const lastSelectedId = state.lastSelectedTileId;
    const lastPos = G.tilePositions[lastSelectedId];

    if (!lastPos || lastPos.gridId !== tilePos.gridId || (tilePos.playerID !== undefined && lastPos.playerID !== tilePos.playerID)) {
        console.debug('SELECTION CANCELED: GRID ID MISMATCH');
        return;
    }

    let selectedTiles = [];

    if (lastPos.row === tilePos.row) {
        const tilesInRow = getTilesInSameRow(G, tilePos);
        const minCol = Math.min(lastPos.col, tilePos.col);
        const maxCol = Math.max(lastPos.col, tilePos.col);

        selectedTiles = tilesInRow
            .filter(([_, pos]) => pos.col >= minCol && pos.col <= maxCol)
            .map(([id, _]) => id);

    } else if (lastPos.col === tilePos.col) {
        const tilesInCol = getTilesInSameCol(G, tilePos);
        const minRow = Math.min(lastPos.row, tilePos.row);
        const maxRow = Math.max(lastPos.row, tilePos.row);

        selectedTiles = tilesInCol
            .filter(([_, pos]) => pos.row >= minRow && pos.row <= maxRow)
            .map(([id, _]) => id);
    } else {
        console.debug('SELECTION CANCELED: NOT SAME ROW OR COLUMN');
        return;
    }

    setState({selectedTiles: tryOrderTiles(selectedTiles), lastSelectedTileId: null});
}


export {
    handleTileSelection,
}