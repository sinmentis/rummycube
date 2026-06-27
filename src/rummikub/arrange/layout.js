import {getTileValue, getTileColor, isJoker} from "../tile/codec.js";

// Lay the cluster's blocks + leftover into columns (row unchanged). Valid blocks
// keep their solver order, are ordered left-to-right by smallest value, and are
// separated by one empty column. Leftover keeps >=1 gap from blocks; related
// loose tiles (same value, or same colour & adjacent value) stay together,
// unrelated ones are gap-separated. Leftover units sit on the `dropSide`. The
// run of units is anchored to `span` on the drop side and clamped into `bounds`
// (the columns the cluster may occupy without touching a non-cluster tile);
// overflowing the bounds rejects (never moves a non-cluster tile).
export function layoutCluster({blocks, leftover}, dropSide, span, bounds) {
    const orderedBlocks = blocks.slice().sort((a, b) => minVal(a) - minVal(b));
    const groups = groupLeftover(leftover);
    const units = dropSide === "left" ? [...groups, ...orderedBlocks] : [...orderedBlocks, ...groups];
    if (!units.length) return {cols: {}};

    const width = units.reduce((s, u) => s + u.length, 0) + (units.length - 1);
    if (width > bounds.right - bounds.left + 1) return {reject: true};

    let start = dropSide === "left" ? span.right - width + 1 : span.left;
    start = Math.max(bounds.left, Math.min(start, bounds.right - width + 1)); // clamp into bounds
    const cols = {};
    let c = start;
    for (const unit of units) { for (const id of unit) cols[id] = c++; c++; /* one gap */ }
    return {cols};
}

// Smallest non-joker value in a block (jokers don't anchor ordering).
function minVal(block) {
    let m = 99;
    for (const id of block) if (!isJoker(id)) m = Math.min(m, getTileValue(id));
    return m === 99 ? 0 : m;
}

// Cluster leftover into "related" groups: same value (partial group) OR same
// colour & adjacent value (partial run). Union-find over the loose tiles.
function groupLeftover(leftover) {
    const n = leftover.length;
    const parent = leftover.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const related = (a, b) => {
        if (isJoker(a) || isJoker(b)) return true;     // a joker pairs with anything loose
        const sameVal = getTileValue(a) === getTileValue(b);
        const sameColAdj = getTileColor(a) === getTileColor(b) && Math.abs(getTileValue(a) - getTileValue(b)) === 1;
        return sameVal || sameColAdj;
    };
    for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
            if (related(leftover[i], leftover[j])) parent[find(i)] = find(j);
    const groups = new Map();
    for (let i = 0; i < n; i++) {
        const r = find(i);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(leftover[i]);
    }
    return [...groups.values()];
}
