import {isSequenceValid} from "../tile/sequence.js";
import {getTileValue, getTileColor, isJoker} from "../tile/codec.js";

// A block is valid iff isSequenceValid accepts it in the given order. Runs must
// arrive in value order with jokers seated in their gap slots; groups are
// order-independent (the predicates skip jokers).
export function isValidBlock(tiles) {
    return tiles.length >= 3 && isSequenceValid(tiles);
}

// Enumerate every valid run/group (in valid order) drawn from `rem` that
// includes the non-joker `anchor`. Jokers in `rem` are used as wild fillers.
// Does NOT generate a 13->1 wrap run (rare; documented v1 limitation).
export function blocksContaining(rem, anchor) {
    const out = [];
    if (isJoker(anchor)) return out;                 // jokers fill other anchors' blocks
    const av = getTileValue(anchor), ac = getTileColor(anchor);
    const jokers = rem.filter(isJoker);

    // ---- GROUPS: same value av, distinct colours (others != anchor colour), +jokers, size 3..4
    const seen = new Set([ac]);
    const others = [];
    for (const tile of rem) {
        if (isJoker(tile) || getTileValue(tile) !== av) continue;
        const c = getTileColor(tile);
        if (seen.has(c)) continue;
        seen.add(c);
        others.push(tile);
    }
    for (const subset of subsetsUpTo(others, 3)) {   // anchor + up to 3 others = max 4 colours
        for (let j = 0; j <= jokers.length; j++) {
            const size = 1 + subset.length + j;
            if (size < 3 || size > 4) continue;
            const block = [anchor, ...subset, ...jokers.slice(0, j)];
            if (isValidBlock(block)) out.push(block);
        }
    }

    // ---- RUNS: same colour ac, consecutive values containing av, jokers fill gaps, len>=3
    const haveVal = new Map();                        // value -> a tile of that colour/value
    for (const tile of rem) {
        if (isJoker(tile) || getTileColor(tile) !== ac) continue;
        const v = getTileValue(tile);
        if (!haveVal.has(v)) haveVal.set(v, tile);
    }
    for (let lo = Math.max(1, av - 12); lo <= av; lo++) {
        for (let hi = av; hi <= Math.min(13, lo + 12); hi++) {
            if (hi - lo + 1 < 3) continue;
            const block = [];
            let used = 0, ok = true;
            for (let v = lo; v <= hi; v++) {
                if (v === av) block.push(anchor);
                else if (haveVal.has(v)) block.push(haveVal.get(v));
                else if (used < jokers.length) block.push(jokers[used++]);
                else { ok = false; break; }
            }
            if (ok && isValidBlock(block)) out.push(block);
        }
    }
    return out;
}

// All subsets of `arr` with size 0..maxSize, deterministic order.
function subsetsUpTo(arr, maxSize) {
    const res = [[]];
    for (let i = 0; i < arr.length; i++) {
        const cur = res.length;
        for (let j = 0; j < cur; j++) {
            if (res[j].length < maxSize) res.push([...res[j], arr[i]]);
        }
    }
    return res;
}
