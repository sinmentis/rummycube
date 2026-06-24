import {
    getTileValue,
    getTileColor,
    isJoker,
    isSequenceValid,
    isSameColor,
    isDiffColor,
    isSameValue,
    freezeSeqJokers,
} from "./util.js";

// Pure "playable-tile" hint helper (WS-10, highlight-only).
//
// playableTiles(handTiles, boardSeqs) -> Set<tileId>
//   handTiles: the viewer's own rack tile ids.
//   boardSeqs: the board groups (e.g. from extractSeqs(G)); only the valid ones
//              are considered (filtered via isSequenceValid).
//
// A hand tile is "playable" iff dropping it onto an existing valid board group
// keeps that group legal, i.e. it either:
//   1. extends a same-colour run by sitting one below min or one above max
//      (no 13 -> 1 wrap for v1; mirrors the conservative countSeqScore rule), or
//   2. completes a same-number set by adding a colour not already present
//      (sets cap at 4 colours, so a full set cannot be extended).
//
// Joker handling (v1, [待核实]): jokers in HAND are deliberately NOT counted into
// the playable set/count. A joker can extend almost any group, so counting it
// would inflate the "{n} playable" hint and mislead; we keep it conservative
// until the joker-depth work lands. Jokers already on the BOARD are resolved to
// their represented values via freezeSeqJokers so a run/set ending in a joker
// still yields the right adjacent values.

function runExtends(frozenSeq, tile) {
    const runColor = getTileColor(frozenSeq[0]);
    if (getTileColor(tile) !== runColor) {
        return false;
    }
    const values = frozenSeq.map((t) => getTileValue(t));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const v = getTileValue(tile);
    // No wrap: candidate values must stay within 1..13.
    return (v === min - 1 && v >= 1) || (v === max + 1 && v <= 13);
}

function setExtends(frozenSeq, tile) {
    if (frozenSeq.length >= 4) {
        return false;
    }
    const number = getTileValue(frozenSeq[0]);
    if (getTileValue(tile) !== number) {
        return false;
    }
    const presentColors = new Set(frozenSeq.map((t) => getTileColor(t)));
    return !presentColors.has(getTileColor(tile));
}

function playableTiles(handTiles, boardSeqs) {
    const playable = new Set();

    const frozenSeqs = [];
    for (const seq of boardSeqs || []) {
        if (!isSequenceValid(seq)) {
            continue;
        }
        const frozen = freezeSeqJokers(seq);
        if (!frozen) {
            continue;
        }
        const kind = isSameColor(frozen)
            ? "run"
            : (isDiffColor(frozen) && isSameValue(frozen) ? "set" : null);
        if (kind) {
            frozenSeqs.push({frozen, kind});
        }
    }

    for (const tile of handTiles || []) {
        // v1: jokers in hand are excluded from the playable set/count.
        if (isJoker(tile)) {
            continue;
        }
        for (const {frozen, kind} of frozenSeqs) {
            if (kind === "run" ? runExtends(frozen, tile) : setExtends(frozen, tile)) {
                playable.add(tile);
                break;
            }
        }
    }

    return playable;
}

export {playableTiles};
