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
