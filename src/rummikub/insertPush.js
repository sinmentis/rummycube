// Pure, dependency-free "auto-snap + insert/push" ripple for dropping N tiles
// onto a single board row. Geometric only: it never validates tile numbers or
// colors (run/group validity is a submit-time concern handled elsewhere).
//
//   rowTiles : [{tileId, col}] existing occupants of the target row (NOT the
//              dragged tiles)
//   T        : target column for the first dragged tile
//   N        : number of dragged tiles
//   maxCol   : INCLUSIVE last column (BOARD_COLS - 1 = 31)
//
// Returns {shifts: {tileId: newCol}, newCols: number[]} or null when neither a
// rightward nor a leftward ripple fits. The dragged tiles take newCols and the
// colliding contiguous run is shifted (right primary, left mirror fallback),
// stopping at the first gap. The union of newCols, shifted columns and the
// untouched columns is guaranteed distinct, so the caller can write them without
// an overlap check.
export function insertWithPush(rowTiles, T, N, maxCol) {
    if (T < 0 || T + N - 1 > maxCol) return null;
    const asc = [...rowTiles].sort((a, b) => a.col - b.col);
    const occ = new Set(asc.map(t => t.col));
    let free = true;
    for (let c = T; c < T + N; c++) if (occ.has(c)) { free = false; break; }
    if (free) return {shifts: {}, newCols: cols(T, N)};
    return tryRight(asc, T, N, maxCol) || tryLeft(asc, T, N, maxCol);
}
function cols(T, N) { return Array.from({length: N}, (_, i) => T + i); }
function tryRight(asc, T, N, maxCol) {
    const shifts = {}; let cursor = T + N;
    for (const {tileId, col} of asc) {
        if (col < T) continue;
        if (col < cursor) { if (cursor > maxCol) return null; shifts[tileId] = cursor; cursor += 1; }
        else break;
    }
    return {shifts, newCols: cols(T, N)};
}
function tryLeft(asc, T, N, maxCol) {
    const shifts = {}; let cursor = T - 1;
    for (let i = asc.length - 1; i >= 0; i--) {
        const {tileId, col} = asc[i];
        if (col > T + N - 1) continue;
        if (col > cursor) { if (cursor < 0) return null; shifts[tileId] = cursor; cursor -= 1; }
        else break;
    }
    return {shifts, newCols: cols(T, N)};
}
