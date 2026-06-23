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

// Snap a drop to legal slot(s) in the target row. Pure: no mutation, deterministic.
// SINGLE (selectionLength <= 1): use the target cell if free, else the nearest free
// col in the same row (tie -> lower col). MULTI (>= 2): need that many contiguous
// free cells; prefer the run starting at target.col, else the contiguous run of
// exactly that length whose start is nearest target.col (tie -> lower start); never
// place partially. Returns cols strictly within [0, maxCols), or {ok:false}.
export function resolveDropSlot(target, isOccupied, selectionLength, maxCols) {
    const {gridId, col, row} = target;
    const len = Math.max(1, selectionLength);

    if (len <= 1) {
        if (col >= 0 && col < maxCols && !isOccupied(col, row)) {
            return {ok: true, gridId, row, cols: [col]};
        }
        for (let d = 1; d < maxCols; d++) {
            const lo = col - d;
            const hi = col + d;
            if (lo >= 0 && lo < maxCols && !isOccupied(lo, row)) {
                return {ok: true, gridId, row, cols: [lo]};
            }
            if (hi >= 0 && hi < maxCols && !isOccupied(hi, row)) {
                return {ok: true, gridId, row, cols: [hi]};
            }
        }
        return {ok: false};
    }

    const runFree = (start) => {
        if (start < 0 || start + len > maxCols) return false;
        for (let c = start; c < start + len; c++) {
            if (isOccupied(c, row)) return false;
        }
        return true;
    };

    if (runFree(col)) {
        return {ok: true, gridId, row, cols: Array.from({length: len}, (_, i) => col + i)};
    }

    let best = -1;
    for (let start = 0; start + len <= maxCols; start++) {
        if (!runFree(start)) continue;
        if (best === -1 || Math.abs(start - col) < Math.abs(best - col)) {
            best = start;
        }
    }
    if (best === -1) return {ok: false};
    return {ok: true, gridId, row, cols: Array.from({length: len}, (_, i) => best + i)};
}
