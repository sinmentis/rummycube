import {BOARD_COLS, BOARD_GRID_ID} from "../constants.js";
import {identifyCluster} from "./cluster.js";
import {partitionCluster} from "./partition.js";
import {layoutCluster} from "./layout.js";

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
    const window = freeWindow(tilePositions, row, cluster.tiles, cluster.span);
    const laid = layoutCluster(part, dropSide, cluster.span, window);
    if (laid.reject) return {placements: {}, ok: false};

    const placements = {};
    for (const id in laid.cols) {
        placements[id] = {gridId: BOARD_GRID_ID, row, col: laid.cols[id]};
    }
    return {placements, ok: true};
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
