import {BOARD_GRID_ID} from "../constants.js";

// Every maximal contiguous-column segment of board tiles, one per row, excluding
// the cluster's tiles. tiles are in ascending-column order, so tile index i sits
// at column start+i (used to shift a whole block when it relocates).
export function extractBlocks(tilePositions, excludeIds) {
    const exclude = new Set([...excludeIds].map(Number));
    const byRow = new Map();
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (!p || p.gridId !== BOARD_GRID_ID || exclude.has(Number(id))) continue;
        if (!byRow.has(p.row)) byRow.set(p.row, []);
        byRow.get(p.row).push({id: Number(id), col: p.col});
    }
    const blocks = [];
    for (const [row, tiles] of byRow) {
        tiles.sort((a, b) => a.col - b.col);
        let seg = [tiles[0]];
        for (let i = 1; i < tiles.length; i++) {
            if (tiles[i].col === tiles[i - 1].col + 1) seg.push(tiles[i]);
            else { blocks.push(toBlock(row, seg)); seg = [tiles[i]]; }
        }
        blocks.push(toBlock(row, seg));
    }
    return blocks;
}

function toBlock(row, seg) {
    return {row, start: seg[0].col, width: seg.length, tiles: seg.map(s => s.id)};
}

// Free column intervals [gs,ge] of [0,cols-1] after removing each finalized
// interval expanded by one column on each side (so a placed block keeps >=1
// empty column from every finalized block; board edges need no margin).
function freeGaps(occ, cols) {
    const blocked = occ
        .map(([s, e]) => [Math.max(0, s - 1), Math.min(cols - 1, e + 1)])
        .sort((a, b) => a[0] - b[0]);
    const gaps = [];
    let cur = 0;
    for (const [s, e] of blocked) {
        if (s > cur) gaps.push([cur, s - 1]);
        cur = Math.max(cur, e + 1);
    }
    if (cur <= cols - 1) gaps.push([cur, cols - 1]);
    return gaps;
}

// All rows except `exclude`, ordered by distance to the board centre then row.
function rowsByCenter(rows, exclude, centerRow) {
    const rs = [];
    for (let r = 0; r < rows; r++) if (r !== exclude) rs.push(r);
    rs.sort((a, b) => Math.abs(a - centerRow) - Math.abs(b - centerRow) || a - b);
    return rs;
}

// Find a landing slot for `block`: its own row first (nearest to its current
// start = least horizontal move), then rows toward the board centre (leftmost
// free slot). Avoids only FINALIZED occupancy (so cascade can push not-yet-
// placed blocks). Returns {row, start} or null.
function findSlot(block, finalized, centerRow, rows, cols) {
    const candidates = [block.row, ...rowsByCenter(rows, block.row, centerRow)];
    for (const r of candidates) {
        const occ = finalized.get(r) || [];
        const gaps = freeGaps(occ, cols);
        if (r === block.row) {
            let best = null, bestDist = Infinity;
            for (const [gs, ge] of gaps) {
                if (ge - gs + 1 < block.width) continue;
                const s = Math.max(gs, Math.min(block.start, ge - block.width + 1));
                const d = Math.abs(s - block.start);
                if (d < bestDist) { best = s; bestDist = d; }
            }
            if (best !== null) return {row: r, start: best};
        } else {
            for (const [gs, ge] of gaps) {
                if (ge - gs + 1 >= block.width) return {row: r, start: gs};
            }
        }
    }
    return null;
}

// Test-only handle so the pure helpers can be unit-tested without exporting them
// into the module's public surface.
export const __test = {findSlot, freeGaps, rowsByCenter};

// Sequential cluster-priority placement. The cluster is fixed (highest
// priority); every other block is placed once, in a deterministic order (nearest
// to the cluster first), into space free of FINALIZED blocks, then finalized.
// Cascade emerges: placing a block over a not-yet-finalized block forces that
// block to relocate when its turn comes. Finalized region only grows, each block
// is placed once -> terminates. Unmovable block -> reject. Only blocks that
// actually moved get a placement entry.
export function relocateForCluster(blocks, cluster, rows, cols) {
    const centerRow = (rows - 1) / 2;
    const clusterCenter = (cluster.start + cluster.end) / 2;
    const finalized = new Map([[cluster.row, [[cluster.start, cluster.end]]]]);

    const ordered = blocks.slice().sort((a, b) => {
        const ra = Math.abs(a.row - cluster.row), rb = Math.abs(b.row - cluster.row);
        if (ra !== rb) return ra - rb;
        const ca = Math.abs(a.start + a.width / 2 - clusterCenter);
        const cb = Math.abs(b.start + b.width / 2 - clusterCenter);
        if (ca !== cb) return ca - cb;
        if (a.row !== b.row) return a.row - b.row;
        return a.start - b.start;
    });

    const placements = {};
    for (const block of ordered) {
        const slot = findSlot(block, finalized, centerRow, rows, cols);
        if (!slot) return {reject: true};
        if (!finalized.has(slot.row)) finalized.set(slot.row, []);
        finalized.get(slot.row).push([slot.start, slot.start + block.width - 1]);
        if (slot.row === block.row && slot.start === block.start) continue; // no move
        for (let i = 0; i < block.tiles.length; i++) {
            placements[block.tiles[i]] = {gridId: BOARD_GRID_ID, row: slot.row, col: slot.start + i};
        }
    }
    return {placements};
}
