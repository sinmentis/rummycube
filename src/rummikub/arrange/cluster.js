import {isSequenceValid} from "../tile/sequence.js";

// Identify the cluster a drop lands in: the maximal set of same-row tiles
// reachable from the dropped tiles' columns across gaps of <=1 empty column.
// Tiles separated by >=2 empty columns are a different region and excluded.
// Also returns the cluster's occupied column span and the contiguous sub-runs
// that were already valid runs/groups BEFORE this drop — computed by EXCLUDING
// the just-dropped tiles, so an adjacent drop can't hide a committed set.
export function identifyCluster(tilePositions, row, droppedIds) {
    const dropped = new Set(droppedIds.map(Number));
    const inRow = [];
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (p && p.gridId === "b" && p.row === row) inRow.push({id: Number(id), col: p.col});
    }
    inRow.sort((a, b) => a.col - b.col);
    if (!inRow.length) return {tiles: [], span: {left: null, right: null}, preDropValidBlocks: []};

    const dropCols = inRow.filter(t => dropped.has(t.id)).map(t => t.col);
    if (!dropCols.length) return {tiles: [], span: {left: null, right: null}, preDropValidBlocks: []};

    // grow left and right from the dropped columns across <=1 gaps
    let lo = Math.min(...dropCols), hi = Math.max(...dropCols);
    let changed = true;
    while (changed) {
        changed = false;
        for (const {col} of inRow) {
            if (col < lo && col >= lo - 2) { lo = col; changed = true; }      // <=1 empty col between
            if (col > hi && col <= hi + 2) { hi = col; changed = true; }
        }
    }
    const members = inRow.filter(t => t.col >= lo && t.col <= hi);
    const tiles = members.map(t => t.id);
    const left = members[0].col, right = members[members.length - 1].col;

    // pre-drop valid blocks: contiguous (no-gap) runs among the NON-dropped
    // members that pass isSequenceValid (the board as it was before this drop).
    const pre = members.filter(t => !dropped.has(t.id));
    const preDropValidBlocks = [];
    if (pre.length) {
        let seg = [pre[0]];
        for (let i = 1; i < pre.length; i++) {
            if (pre[i].col === pre[i - 1].col + 1) seg.push(pre[i]);
            else { pushIfValid(seg, preDropValidBlocks); seg = [pre[i]]; }
        }
        pushIfValid(seg, preDropValidBlocks);
    }
    return {tiles, span: {left, right}, preDropValidBlocks};
}

function pushIfValid(seg, out) {
    if (seg.length >= 3) {
        const ids = seg.map(t => t.id);
        if (isSequenceValid(ids)) out.push(ids);
    }
}
