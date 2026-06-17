export function makeSlotId(gridId, col, row) {
    return `${gridId}:${col}:${row}`;
}

export function parseSlotId(id) {
    const [gridId, col, row] = id.split(':');
    return {gridId, col: parseInt(col, 10), row: parseInt(row, 10)};
}

export function toggleSelection(selectedTiles, tileId) {
    return selectedTiles.includes(tileId)
        ? selectedTiles.filter(id => id !== tileId)
        : [...selectedTiles, tileId];
}
