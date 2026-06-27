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
