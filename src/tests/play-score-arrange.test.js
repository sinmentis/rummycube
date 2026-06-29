import {computePlayScore} from "../rummikub/scoring/playScore";
import {arrangeBoard} from "../rummikub/arrange/index";
import {buildTileObj} from "../rummikub/util";
import {BOARD_GRID_ID, COLOR} from "../rummikub/constants";

const r = (v) => buildTileObj(v, COLOR.red, 0);

// Snapshot a tilePositions map by value so prev and current never alias.
function clone(tp) {
    const out = {};
    for (const k of Object.keys(tp)) out[k] = {...tp[k]};
    return out;
}

// Bug #2: the auto-arrange engine (insertTilesWithPush -> arrangeBoard) only
// nudges existing tiles' COLUMNS to make room for a played tile. computePlayScore
// must not mistake that cosmetic shift for a manipulation: `rearranged` counts a
// tile only when the player genuinely restructured it (row change or a change in
// which contiguous run its EXISTING co-members form), not a within-run column
// nudge. Mirrors the jokerBomb "membership, not position" rule.
test('an insert that triggers an auto-arrange cascade does not inflate rearranged/combo', () => {
    // Turn start: a committed run red4-5-6 at cols 0,1,2.
    const prev = {};
    [4, 5, 6].forEach((v, i) => {
        const id = r(v);
        prev[id] = {id, col: i, row: 0, gridId: BOARD_GRID_ID, tmp: false, playerID: null};
    });

    // Player drops red3 at col 0 (extending the run on the left). This is exactly
    // what insertTilesWithPush does: write the dropped tile as tmp, then reflow.
    const red3 = r(3);
    const cur = clone(prev);
    cur[red3] = {id: red3, col: 0, row: 0, gridId: BOARD_GRID_ID, tmp: true, playerID: null};
    const {placements, ok} = arrangeBoard(cur, {droppedIds: [red3], row: 0, col: 0});
    expect(ok).toBe(true);
    for (const id in placements) cur[id] = {...cur[id], ...placements[id]};

    // Sanity: the cascade really did shift the existing tiles' columns.
    expect([r(4), r(5), r(6)].map((id) => cur[id].col)).toEqual([1, 2, 3]);

    const formedGroups = [[red3, r(4), r(5), r(6)]]; // the valid run formed/extended
    const s = computePlayScore({tilePositions: cur, formedGroups, prevTilePositions: prev});

    // The player only appended one tile to one run. No existing tile changed row
    // or run membership, so the column cascade must NOT register as a rearrange.
    expect(s.rearranged).toBe(0);
    expect(s.placed).toBe(1);
    expect(s.groups.length).toBe(1);
    // 3*1 group + 3*0 rearrange + 0*1 placed = 3 (NICE), NOT 12 (3 phantom shifts).
    expect(s.count).toBe(3);
});

// A real manipulation still scores: relocating an EXISTING tile to a new row is a
// genuine restructure, so the fix narrows false positives without silencing real
// board manipulation.
test('relocating an existing tile to a new row still counts as a rearrange', () => {
    // Turn start: a stray committed tile red6 parked at row 0, col 10.
    const prev = {};
    prev[r(6)] = {id: r(6), col: 10, row: 0, gridId: BOARD_GRID_ID, tmp: false, playerID: null};

    // Player relocates red6 to row 1 and melds red4,red5 (from hand) to build
    // red4-5-6 there. red6 genuinely changed row -> it is a real rearrange.
    const cur = clone(prev);
    cur[r(6)] = {...cur[r(6)], col: 2, row: 1};
    cur[r(4)] = {id: r(4), col: 0, row: 1, gridId: BOARD_GRID_ID, tmp: true, playerID: null};
    cur[r(5)] = {id: r(5), col: 1, row: 1, gridId: BOARD_GRID_ID, tmp: true, playerID: null};

    const formedGroups = [[r(4), r(5), r(6)]];
    const s = computePlayScore({tilePositions: cur, formedGroups, prevTilePositions: prev});

    expect(s.rearranged).toBe(1);          // red6 changed row
    expect(s.placed).toBe(2);              // red4, red5 played from hand
    expect(s.count).toBe(3 * 1 + 3 * 1);   // 1 group + 1 rearrange = 6 (COMBO)
});
