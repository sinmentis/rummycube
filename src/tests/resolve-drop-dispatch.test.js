import {resolveDropDispatch} from '../rummikub/dndUtil';
import {buildTileObj, BlackJoker} from '../rummikub/util';
import {BOARD_COLS, BOARD_GRID_ID, COLOR, HAND_COLS, HAND_GRID_ID} from '../rummikub/constants';

// resolveDropDispatch folds the 1-tile joker-swap and the board-vs-hand routing
// into ONE pure decision with a fixed precedence — joker-swap -> push -> snap ->
// reject — returning {kind, args} where args is the exact argument array for the
// matching server move:
//   joker  -> retrieveJoker(jokerId, primaryId)
//   push   -> insertTilesWithPush(col, row, 'b', {id:primaryId}, ordered)
//   snap   -> moveTiles(col, row, gridId, {id:primaryId}, selection)
//   reject -> []  (no move; the caller buzzes)
// The client makes NO geometric occupancy decision on the board: ANY in-bounds
// board drop routes to push — the semantic insertTilesWithPush move owns the
// reflow, and a hopeless landing snaps back server-side as INVALID_MOVE, not a
// desync. Only an out-of-bounds board run and hand drops fall through to snap.

const handA = buildTileObj(1, COLOR.red, 0);
const handB = buildTileObj(2, COLOR.red, 0);

const boardTile = (id, col, row) => ({id, col, row, gridId: BOARD_GRID_ID, tmp: false, playerID: null});
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

test('allowJokerSwap:false skips the joker branch -> the in-bounds board cell pushes', () => {
    // Same joker cell, but joker-swap disabled: the cell is on the board and in
    // bounds, so the single tile routes to push (the move reflows), never to joker.
    const d = dispatch({tilePositions: jokerRun(), target: jokerCell, primaryId: red5, selection: [red5], allowJokerSwap: false});
    expect(d.kind).toBe('push');
    expect(d.args[0]).toBe(1);
    expect(d.args[1]).toBe(0);
    expect(d.args[2]).toBe(BOARD_GRID_ID);
    expect(d.args[3]).toEqual({id: red5});
    expect(d.args[4]).toEqual([red5]);
});

// --- push: every in-bounds board drop (precedence 2) ------------------------

test('an in-bounds board drop onto an OCCUPIED run -> {kind:push} with the ordered selection', () => {
    const tilePositions = {
        [handA]: handTile(handA, 0, 0),
        [handB]: handTile(handB, 1, 0),
        9001: boardTile(9001, 5, 0),
    };
    const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 5, row: 0}, primaryId: handA, selection: [handA, handB]});
    expect(d.kind).toBe('push');
    expect(d.args[0]).toBe(5);              // target col T forwarded to the move
    expect(d.args[1]).toBe(0);              // row
    expect(d.args[2]).toBe(BOARD_GRID_ID);  // destGridId 'b'
    expect(d.args[3]).toEqual({id: handA}); // tileIdObj
    expect(d.args[4]).toEqual([handA, handB]); // orderTilesBySource(selection)
});

test('an in-bounds board drop onto a FREE target also -> {kind:push} (no client-side snap)', () => {
    // The old client snapped a free board target; the new client pushes it too, so
    // the engine can re-tidy the cluster the tile lands in.
    const tilePositions = {[handA]: handTile(handA, 0, 0)};
    const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 3, row: 0}, primaryId: handA, selection: [handA]});
    expect(d.kind).toBe('push');
    expect(d.args[0]).toBe(3);
    expect(d.args[2]).toBe(BOARD_GRID_ID);
    expect(d.args[4]).toEqual([handA]);
});

test('a full-row in-bounds board drop still -> {kind:push} (the server decides feasibility, not the client)', () => {
    // Fill row 0 (cols 0..31). The old client geometry rejected up-front; the new
    // client routes to push and lets the authoritative move snap back if hopeless.
    const tilePositions = {[handA]: handTile(handA, 0, 1)};
    for (let c = 0; c < 32; c++) tilePositions[1000 + c] = boardTile(1000 + c, c, 0);
    const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 5, row: 0}, primaryId: handA, selection: [handA]});
    expect(d.kind).toBe('push');
    expect(d.args[0]).toBe(5);
});

test('a board drop bridging two runs (both neighbours occupied) -> {kind:push}, like any board cell', () => {
    // a b c | gap@3 | d e f. The old client had a special "bridge" route; now it is
    // just another in-bounds board cell -> push (the engine re-opens the separator).
    const tilePositions = {
        8001: boardTile(8001, 0, 0), 8002: boardTile(8002, 1, 0), 8003: boardTile(8003, 2, 0),
        8004: boardTile(8004, 4, 0), 8005: boardTile(8005, 5, 0), 8006: boardTile(8006, 6, 0),
        [handA]: handTile(handA, 0, 0),
    };
    const d = dispatch({tilePositions, target: {gridId: BOARD_GRID_ID, col: 3, row: 0}, primaryId: handA, selection: [handA]});
    expect(d.kind).toBe('push');
    expect(d.args[0]).toBe(3);
});

// --- snap / reject: out-of-bounds board + hand (precedence 3) ----------------

test('an OUT-OF-BOUNDS board drop (col+N > 32) falls through to {kind:snap} at the nearest legal run', () => {
    // A 2-tile run at col 31 overflows (31+2 > 32); it cannot route to push, so the
    // free row snaps it back to the nearest legal run [30,31].
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

test('a hand-row drop -> {kind:snap}; the hand never pushes', () => {
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

test('a hand-row drop whose row has no contiguous landing -> {kind:reject}', () => {
    // Fill the player-0 hand row 0; a 2-tile selection finds no contiguous run ->
    // the snap path rejects non-destructively (the caller buzzes, no move sent).
    const tilePositions = {};
    for (let c = 0; c < HAND_COLS; c++) tilePositions[2000 + c] = handTile(2000 + c, c, 0);
    const d = dispatch({tilePositions, target: {gridId: HAND_GRID_ID, col: 5, row: 0}, primaryId: 2000, selection: [2000, 2001]});
    expect(d).toEqual({kind: 'reject', args: []});
});
