// Pure scoring for a play: the celebration payload minus seat+ts. Client-importable
// (no immer/events/G), so client and server share one implementation instead of
// duplicating the math and risking divergence. Operates on still-`tmp` tiles, so the
// caller must pass tilePositions BEFORE freezeTmpTiles.
import {isJoker, getTileValue} from "../tile/codec.js";
import {freezeSeqJokers} from "../tile/sequence.js";
import {manipulationScore} from "../juice/comboMath.js";
import {extractSeqs} from "../moveValidation.js";
import {BOARD_GRID_ID} from "../constants.js";

// Map each EXISTING (non-tmp) board tile to {row, members}, where members is the
// sorted ids of the non-tmp tiles sharing its contiguous run. Newly placed tmp
// tiles are excluded so appending/inserting a played tile into a run does not look
// like the existing tiles being restructured. Mirrors jokerBomb's "membership, not
// position": the arrange engine nudges columns but preserves which existing ids
// share a run, so two snapshots compared this way ignore a cosmetic reshuffle.
function existingRunMembership(tilePositions) {
    const byTile = {};
    for (const seq of extractSeqs({tilePositions})) {
        const members = seq
            .map(Number)
            .filter(id => { const p = tilePositions[id]; return p && !p.tmp; })
            .sort((a, b) => a - b);
        for (const id of members) {
            byTile[id] = {row: tilePositions[id].row, members};
        }
    }
    return byTile;
}

function sameMembers(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

export function computePlayScore({tilePositions, formedGroups, prevTilePositions}) {
    const tmp = Object.values(tilePositions).filter(p => p && p.gridId === BOARD_GRID_ID && p.tmp)
    // A joker scores the value it REPRESENTS inside its run/group, not 0. Map each
    // tmp joker to its frozen value via the formed (valid) sequence that holds it.
    const jokerValueById = {}
    for (const seq of formedGroups) {
        const frozen = freezeSeqJokers(seq)
        if (!frozen) continue
        seq.forEach((tid, i) => {
            if (isJoker(tid)) {
                jokerValueById[Number(tid)] = getTileValue(frozen[i])
            }
        })
    }
    const points = tmp.reduce((s, p) => s + (isJoker(p.id) ? (jokerValueById[p.id] || 0) : getTileValue(p.id)), 0)
    // Manipulation score rewards groups formed + existing board tiles rearranged
    // this turn over a raw tile dump. prevTilePositions is the turn-start baseline
    // and is reset next turn, so this must run here, pre-freeze.
    const placed = tmp.length
    const baseline = prevTilePositions || {}
    // Count an existing board tile as rearranged ONLY when the player genuinely
    // restructured it: it changed ROW, or the set of existing tiles it shares a
    // contiguous run with changed (it moved into/out of a group). A pure column
    // nudge from the auto-arrange engine (same row, same existing co-members) is
    // cosmetic and must not inflate the combo.
    const baseRuns = existingRunMembership(baseline)
    const curRuns = existingRunMembership(tilePositions)
    const rearranged = Object.values(tilePositions).filter(p => {
        if (!p || p.gridId !== BOARD_GRID_ID || p.tmp) return false
        const prev = baseline[p.id]
        if (!prev || prev.gridId !== BOARD_GRID_ID) return false
        const base = baseRuns[p.id]
        const cur = curRuns[p.id]
        if (!base || !cur) return true
        return base.row !== cur.row || !sameMembers(base.members, cur.members)
    }).length
    const score = manipulationScore({groups: formedGroups.length, rearranged, placed})
    return {
        count: score,
        points: points,
        manipulation: score,
        groups: formedGroups.map(seq => seq.map(Number)),
        rearranged: rearranged,
        placed: placed,
    }
}
