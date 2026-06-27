import {blocksContaining} from "./blocks.js";

// Best partition of a tile multiset into valid blocks: maximise covered tiles,
// then fewest blocks, deterministically. Memoised DFS over the remaining sorted
// multiset; at each node either drop the smallest tile to leftover or use it as
// the anchor of a valid block.
export function bestPartition(tiles) {
    const memo = new Map();
    function go(rem) {                       // rem: sorted tileId[]
        if (rem.length < 3) return {blocks: [], leftover: rem.slice(), covered: 0, n: 0};
        const key = rem.join(",");
        const hit = memo.get(key);
        if (hit) return hit;
        // baseline: rem[0] is leftover
        const dropSub = go(rem.slice(1));
        let best = {blocks: dropSub.blocks, leftover: [rem[0], ...dropSub.leftover],
                    covered: dropSub.covered, n: dropSub.n};
        // try rem[0] as the anchor of each candidate block
        for (const block of blocksContaining(rem, rem[0])) {
            const sub = go(removeAll(rem, block));
            const cand = {blocks: [block, ...sub.blocks], leftover: sub.leftover,
                          covered: block.length + sub.covered, n: 1 + sub.n};
            if (cand.covered > best.covered || (cand.covered === best.covered && cand.n < best.n)) {
                best = cand;
            }
        }
        memo.set(key, best);
        return best;
    }
    const res = go([...tiles].sort((a, b) => a - b));
    return {blocks: res.blocks, leftover: res.leftover};
}

// Remove one occurrence of each id in `block` from sorted `rem`, return a new sorted array.
function removeAll(rem, block) {
    const out = rem.slice();
    for (const id of block) {
        const i = out.indexOf(id);
        if (i !== -1) out.splice(i, 1);
    }
    return out;
}

// Two-pass cluster partition encoding the owner's rule: break an existing valid
// block only if the whole cluster ends all-valid (Pass 1); otherwise keep every
// pre-drop valid block and arrange only the rest (Pass 2).
export function partitionCluster(clusterTiles, preDropValidBlocks) {
    const all = bestPartition(clusterTiles);
    if (all.leftover.length === 0) return all;          // Pass 1: all-valid, breaking allowed

    // Pass 2: fix pre-drop valid blocks, partition the remainder.
    const fixed = preDropValidBlocks.map(b => b.slice());
    let rest = clusterTiles.slice();
    for (const block of fixed) rest = removeOnce(rest, block);
    const sub = bestPartition(rest);
    return {blocks: [...fixed, ...sub.blocks], leftover: sub.leftover};
}

function removeOnce(arr, block) {
    const out = arr.slice();
    for (const id of block) { const i = out.indexOf(id); if (i !== -1) out.splice(i, 1); }
    return out;
}
