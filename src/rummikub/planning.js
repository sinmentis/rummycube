import {
    getTileValue,
    getTileColor,
    isJoker,
    isSequenceValid,
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
// their represented values via freezeSeqJokers, but a frozen joker keeps its
// encoded (black/red) colour, so all colour logic anchors on the non-joker
// tiles (runColor / presentColors), never on the joker itself.

function runExtends(runColor, values, tile) {
    if (getTileColor(tile) !== runColor) {
        return false;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const v = getTileValue(tile);
    // No wrap: candidate values must stay within 1..13.
    return (v === min - 1 && v >= 1) || (v === max + 1 && v <= 13);
}

function setExtends(number, presentColors, fullSize, tile) {
    // A 4-tile set is full (jokers already fill the missing colours).
    if (fullSize >= 4) {
        return false;
    }
    if (getTileValue(tile) !== number) {
        return false;
    }
    return !presentColors.has(getTileColor(tile));
}

function playableTiles(handTiles, boardSeqs) {
    const playable = new Set();

    const groups = [];
    for (const seq of boardSeqs || []) {
        if (!isSequenceValid(seq)) {
            continue;
        }
        const frozen = freezeSeqJokers(seq);
        if (!frozen) {
            continue;
        }
        // A frozen joker keeps its encoded (black/red) colour, so anchor all
        // colour logic on the real (non-joker) tiles, never on the joker.
        const realTiles = seq.filter((t) => !isJoker(t));
        if (isSameValue(frozen)) {
            // All values equal -> a set; presentColors are the real colours only.
            const number = getTileValue(frozen[0]);
            const presentColors = new Set(realTiles.map((t) => getTileColor(t)));
            groups.push({
                kind: "set",
                number,
                presentColors,
                fullSize: frozen.length,
            });
        } else {
            // Distinct values -> a run; runColor is a real tile's colour.
            const realColors = realTiles.map((t) => getTileColor(t));
            const allSameColor = realColors.every((c) => c === realColors[0]);
            if (!allSameColor) {
                continue;
            }
            const values = frozen.map((t) => getTileValue(t));
            groups.push({kind: "run", runColor: realColors[0], values});
        }
    }

    for (const tile of handTiles || []) {
        // v1: jokers in hand are excluded from the playable set/count.
        if (isJoker(tile)) {
            continue;
        }
        for (const g of groups) {
            const ok = g.kind === "run"
                ? runExtends(g.runColor, g.values, tile)
                : setExtends(g.number, g.presentColors, g.fullSize, tile);
            if (ok) {
                playable.add(tile);
                break;
            }
        }
    }

    return playable;
}

export {playableTiles};
