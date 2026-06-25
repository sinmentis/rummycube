import {resolveDropDispatch} from '../rummikub/dndUtil';
import {buildTileObj, BlackJoker} from '../rummikub/util';
import {BOARD_COLS, BOARD_GRID_ID, COLOR, HAND_COLS, HAND_GRID_ID} from '../rummikub/constants';

// T6 (WS-D): resolveDropDispatch folds the round-2 snap-vs-insert/push split and
// the classic 1-tile joker-swap into ONE pure decision with a fixed precedence —
// joker-swap -> push -> snap -> reject — returning {kind, args} where args is the
// exact argument array for the matching server move:
//   joker  -> retrieveJoker(jokerId, primaryId)
//   push   -> insertTilesWithPush(T, row, 'b', {id:primaryId}, ordered)
//   snap   -> moveTiles(col, row, gridId, {id:primaryId}, selection)
//   reject -> []  (no move; the caller buzzes)
// It only DECIDES the path; the server move stays authoritative. These tests pin
// the decision and the off-by-one boundaries (round-2): isRunFree/inBounds use the
// EXCLUSIVE column count (BOARD_COLS=32); insertWithPush takes the INCLUSIVE last
// column (BOARD_COLS-1=31).

// Two contiguous player-0 hand tiles; rack reading order is row-then-col.
const handA = buildTileObj(1, COLOR.red, 0);
const handB = buildTileObj(2, COLOR.red, 0);

// A committed board tile at (col,row).
const boardTile = (id, col, row) => ({id, col, row, gridId: BOARD_GRID_ID, tmp: false, playerID: null});
// A player-0 hand tile at (col,row).
const handTile = (id, col, row) => ({id, col, row, gridId: HAND_GRID_ID, playerID: '0', tmp: false});

function dispatch(overrides) {
    return resolveDropDispatch({
        playerID: '0',
        boardCols: BOARD_COLS,
        handCols: HAND_COLS,
        allowJokerSwap: true,
        ...overrides,
    });
}

// --- joker-swap (precedence 1) ----------------------------------------------

// Valid board run red4 [BlackJoker=red5] red6 with the joker settled (tmp:false);
// dropping the matching hand red5 on the joker cell retrieves it.
const red4 = buildTileObj(4, COLOR.red, 0);
const red5 = buildTileObj(5, COLOR.red, 0);
const red6 = buildTileObj(6, COLOR.red, 0);

function jokerRun() {
    return {
        [red4]: boardTile(red4, 0, 0),
        [BlackJoker]: boardTile(BlackJoker, 1, 0),
        [red6]: boardTile(red6, 2, 0),
        [red5]: handTile(red5, 0, 0),
    };
}
const jokerCell = {gridId: BOARD_GRID_ID, col: 1, row: 0};

test('matching hand tile on a settled board joker -> {kind:joker, args:[jokerId, id]}', () => {
    const d = dispatch({tilePositions: jokerRun(), target: jokerCell, primaryId: red5, selection: [red5]});
    expect(d).toEqual({kind: 'joker', args: [BlackJoker, red5]});
});

test('allowJokerSwap:false gates the joker branch -> the drop pushes instead', () => {
    // Same joker cell, but joker-swap disabled: col 1 is occupied, so the single
    // tile routes to push (ripple the joker + red6 aside), never to joker.
    const d = dispatch({tilePositions: jokerRun(), target: jokerCell, primaryId: red5, selection: [red5], allowJokerSwap: false});
    expect(d.kind).toBe('push');
    expect(d.args[0]).toBe(1);
    expect(d.args[1]).toBe(0);
    expect(d.args[2]).toBe(BOARD_GRID_ID);
    expect(d.args[3]).toEqual({id: red5});
    expect(d.args[4]).toEqual([red5]);
});

// --- push vs reject (precedence 2) ------------------------------------------

test('a board drop onto an occupied run -> {kind:push, ...} with the ordered selection', () => {
    // Board tile at col 5, row 0; drop the selected pair starting on col 5.
    const tilePositions = {
        [handA]: handTile(handA, 0, 0),
        [handB]: handTile(handB, 1, 0),
        9001: boardTile(9001, 5, 0),
    };
    const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 5, row: 0}, primaryId: handA, selection: [handA, handB]});
    expect(d.kind).toBe('push');
    expect(d.args[0]).toBe(5);              // target col T
    expect(d.args[1]).toBe(0);              // row
    expect(d.args[2]).toBe(BOARD_GRID_ID);  // destGridId 'b'
    expect(d.args[3]).toEqual({id: handA}); // tileIdObj
    expect(d.args[4]).toEqual([handA, handB]); // orderTilesBySource(selection)
});

test('a board drop onto an occupied run with no room (insertWithPush -> null) -> {kind:reject}', () => {
    // Fill row 0 (cols 0..31); a single tile dropped at col 5 can ripple neither way.
    const tilePositions = {[handA]: handTile(handA, 0, 1)};
    for (let c = 0; c < 32; c++) tilePositions[1000 + c] = boardTile(1000 + c, c, 0);
    const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 5, row: 0}, primaryId: handA, selection: [handA]});
    expect(d).toEqual({kind: 'reject', args: []});
});

// --- snap (precedence 3) ----------------------------------------------------

test('a free board target -> {kind:snap, ...} at the target col', () => {
    const tilePositions = {[handA]: handTile(handA, 0, 0)};
    const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 3, row: 0}, primaryId: handA, selection: [handA]});
    expect(d.kind).toBe('snap');
    expect(d.args[0]).toBe(3);              // snapped col
    expect(d.args[1]).toBe(0);              // row
    expect(d.args[2]).toBe(BOARD_GRID_ID);
    expect(d.args[3]).toEqual({id: handA});
    expect(d.args[4]).toEqual([handA]);
});

test('an OUT-OF-BOUNDS board drop (T+N>32) snaps (NOT reject) via resolveDropSlot', () => {
    // A 2-tile run at col 31 overflows (31+2 > 32); the free row snaps it back to
    // the nearest legal run [30,31] instead of pushing or rejecting.
    const tilePositions = {
        [handA]: handTile(handA, 0, 0),
        [handB]: handTile(handB, 1, 0),
    };
    const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 31, row: 0}, primaryId: handA, selection: [handA, handB]});
    expect(d.kind).toBe('snap');
    expect(d.args[0]).toBe(30);             // snapped back to 30,31
    expect(d.args[1]).toBe(0);
    expect(d.args[2]).toBe(BOARD_GRID_ID);
    expect(d.args[4]).toEqual([handA, handB]);
});

test('a hand-row drop -> {kind:snap, ...}; the hand never pushes', () => {
    // Even with the target cell occupied, a hand grid drop snaps to a free col and
    // never routes to push (the push guard is the board grid only).
    const tilePositions = {
        [handA]: handTile(handA, 5, 0), // dragged tile
        [handB]: handTile(handB, 1, 0), // occupies the dropped target cell
    };
    const d = dispatch({tilePositions, target: {gridId: HAND_GRID_ID, col: 1, row: 0}, primaryId: handA, selection: [handA]});
    expect(d.kind).toBe('snap');
    expect(d.args[2]).toBe(HAND_GRID_ID);
    expect(d.args[3]).toEqual({id: handA});
    expect(d.args[4]).toEqual([handA]);
});

// --- WS-E bridge routing (precedence 2, free-target case) --------------------

// A free in-bounds span whose immediate left AND right board neighbours are both
// occupied is plugging the only gap between two runs. It must route to push so
// insertWithPush re-opens a 1-col separator (and to reject when there is no room),
// instead of snapping the tiles in and fusing the two runs into one sequence.
describe('WS-E bridge routing', () => {
    // a b c | gap@3 | d e f on board row 0; one hand tile dropped on col 3 bridges.
    test('a free board target bridging two runs (both neighbours occupied) -> {kind:push}', () => {
        const tilePositions = {
            8001: boardTile(8001, 0, 0), 8002: boardTile(8002, 1, 0), 8003: boardTile(8003, 2, 0),
            8004: boardTile(8004, 4, 0), 8005: boardTile(8005, 5, 0), 8006: boardTile(8006, 6, 0),
            [handA]: handTile(handA, 0, 0),
        };
        const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 3, row: 0}, primaryId: handA, selection: [handA]});
        expect(d.kind).toBe('push');
    });

    // Same bridge against the right wall: a b c @25..27 | gap@28 | d e f @29..31. The
    // right run cannot ripple past col 31, so insertWithPush returns null -> reject.
    test('a bridge with no room to re-open the separator (right wall) -> {kind:reject}', () => {
        const tilePositions = {
            8001: boardTile(8001, 25, 0), 8002: boardTile(8002, 26, 0), 8003: boardTile(8003, 27, 0),
            8004: boardTile(8004, 29, 0), 8005: boardTile(8005, 30, 0), 8006: boardTile(8006, 31, 0),
            [handA]: handTile(handA, 0, 0),
        };
        const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 28, row: 0}, primaryId: handA, selection: [handA]});
        expect(d).toEqual({kind: 'reject', args: []});
    });

    // A 2-wide gap is NOT a bridge: dropping at col 3 leaves col 4 free on the right,
    // so the span is a plain free target and snaps in place.
    test('a free non-bridge target (2-wide gap, right neighbour free) -> {kind:snap}', () => {
        const tilePositions = {
            8001: boardTile(8001, 0, 0), 8002: boardTile(8002, 1, 0), 8003: boardTile(8003, 2, 0),
            8004: boardTile(8004, 5, 0), 8005: boardTile(8005, 6, 0), 8006: boardTile(8006, 7, 0),
            [handA]: handTile(handA, 0, 0),
        };
        const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 3, row: 0}, primaryId: handA, selection: [handA]});
        expect(d.kind).toBe('snap');
    });

    // The bridge term is board-only: the very same neighbour pattern on the hand grid
    // snaps (the hand never pushes).
    test('a hand-grid gap with both neighbours occupied never bridges -> {kind:snap}', () => {
        const dragId = 7009;
        const tilePositions = {
            [handA]: handTile(handA, 1, 0), [handB]: handTile(handB, 3, 0),
            [dragId]: handTile(dragId, 9, 0),
        };
        const d = dispatch({tilePositions, target: {gridId: HAND_GRID_ID, col: 2, row: 0}, primaryId: dragId, selection: [dragId]});
        expect(d.kind).toBe('snap');
    });
});
