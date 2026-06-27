import {BOARD_COLS, BOARD_ROWS, BOARD_GRID_ID} from "../constants.js";
import {identifyCluster} from "./cluster.js";
import {partitionCluster} from "./partition.js";
import {layoutCluster} from "./layout.js";
import {extractBlocks, relocateForCluster} from "./space.js";

// Pure, deterministic. Given the board after the dropped tiles were written at
// (row, col..), reflow the cluster they landed in toward valid blocks. Returns
// {placements: {tileId: {gridId:'b', row, col}}, ok}. ok:false => reject (the
// move turns it into INVALID_MOVE, a non-destructive snap-back).
export function arrangeBoard(tilePositions, drop) {
    const {droppedIds, row, col} = drop;
    const cluster = identifyCluster(tilePositions, row, droppedIds);
    if (!cluster.tiles.length) return {placements: {}, ok: true};

    const part = partitionCluster(cluster.tiles, cluster.preDropValidBlocks);
    const dropSide = col <= cluster.span.left ? "left" : "right";
    const bounds = freeWindow(tilePositions, row, cluster.tiles, cluster.span);
    const inRow = layoutCluster(part, dropSide, cluster.span, bounds);
    if (!inRow.reject) {
        return {placements: toPlacements(inRow.cols, row), ok: true};   // common path: fits, no relocation
    }

    // Space management: re-lay the cluster across the whole row, relocate neighbours.
    const full = layoutCluster(part, dropSide, cluster.span, {left: 0, right: BOARD_COLS - 1});
    if (full.reject) return {placements: {}, ok: false};               // cluster wider than the board
    const clCols = Object.values(full.cols);
    const clStart = Math.min(...clCols), clEnd = Math.max(...clCols);
    const others = extractBlocks(tilePositions, cluster.tiles);
    const reloc = relocateForCluster(others, {row, start: clStart, end: clEnd}, BOARD_ROWS, BOARD_COLS);
    if (reloc.reject) return {placements: {}, ok: false};
    return {placements: {...toPlacements(full.cols, row), ...reloc.placements}, ok: true};
}

function toPlacements(cols, row) {
    const placements = {};
    for (const id in cols) placements[id] = {gridId: BOARD_GRID_ID, row, col: cols[id]};
    return placements;
}

// The column range [left, right] the cluster may occupy without touching a
// non-cluster tile in the same row (one empty column kept between them, or the
// board edge). Guarantees the layout never collides with or fuses into a
// neighbour set.
function freeWindow(tilePositions, row, clusterTiles, span) {
    const inCluster = new Set(clusterTiles);
    let leftNeighbor = -2, rightNeighbor = BOARD_COLS + 1;
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (!p || p.gridId !== BOARD_GRID_ID || p.row !== row || inCluster.has(Number(id))) continue;
        if (p.col < span.left && p.col > leftNeighbor) leftNeighbor = p.col;
        if (p.col > span.right && p.col < rightNeighbor) rightNeighbor = p.col;
    }
    return {left: leftNeighbor + 2, right: rightNeighbor - 2};
}
