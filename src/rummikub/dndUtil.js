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

// Order tile ids by where they sit in their source grid (row then col), i.e. the
// reading order you see in the rack. Used for both placement and the drag preview
// so a multi-selection lands and previews in the same order it looks, regardless
// of the order the tiles were tapped. Non-mutating; tiles with no known position
// keep their relative order.
export function orderTilesBySource(tileIds, tilePositions) {
    return [...tileIds].sort((a, b) => {
        const pa = tilePositions[a];
        const pb = tilePositions[b];
        if (!pa || !pb) return 0;
        return (pa.row - pb.row) || (pa.col - pb.col);
    });
}
