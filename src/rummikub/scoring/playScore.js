// Pure scoring for a play: the celebration payload minus seat+ts. Client-importable
// (no immer/events/G), so client and server share one implementation instead of
// duplicating the math and risking divergence. Operates on still-`tmp` tiles, so the
// caller must pass tilePositions BEFORE freezeTmpTiles.
import {isJoker, getTileValue} from "../tile/codec.js";
import {freezeSeqJokers} from "../tile/sequence.js";
import {manipulationScore} from "../juice/comboMath.js";
import {BOARD_GRID_ID} from "../constants.js";

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
    const rearranged = Object.values(tilePositions).filter(p => {
        if (!p || p.gridId !== BOARD_GRID_ID || p.tmp) return false
        const prev = baseline[p.id]
        return prev && prev.gridId === BOARD_GRID_ID && (prev.col !== p.col || prev.row !== p.row)
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
