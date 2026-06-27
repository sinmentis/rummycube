import {Client} from 'boardgame.io/client';
import {Local} from "boardgame.io/multiplayer";
import {makeMatch} from "./__helpers__/makeMatch";
import {resolveDropDispatch} from "../rummikub/dndUtil";
import {buildTileObj, BlackJoker} from "../rummikub/util";
import {BOARD_COLS, HAND_COLS, BOARD_GRID_ID, HAND_GRID_ID, COLOR} from "../rummikub/constants";

// =============================================================================
// Board drop -> semantic reflow (§10 worked examples #5, #5b, #8, #10). The
// client no longer makes a geometric occupancy decision: any in-bounds board
// drop routes to moves.insertTilesWithPush, which writes the dragged tiles then
// reflows the cluster they land in via the pure arrangeBoard engine. These tests
// drive the move through a real boardgame.io Client+Local() harness and assert
// the §10 outcomes (loose-tile separation, drop-side placement, protected runs),
// then pin the two routing decisions (board -> push, hand -> snap) directly.
// =============================================================================

const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const blue = (v, variant = 0) => buildTileObj(v, COLOR.blue, variant);
const black = (v, variant = 0) => buildTileObj(v, COLOR.black, variant);
const orange = (v, variant = 0) => buildTileObj(v, COLOR.orange, variant);

const boardTileAt = (tp, id, col, row = 0) => { tp[id] = {id, col, row, gridId: BOARD_GRID_ID, tmp: false, playerID: null}; };
const handTileAt = (tp, id, col, row = 0) => { tp[id] = {id, col, row, gridId: HAND_GRID_ID, playerID: '0'}; };
const colsOf = (G, ids) => ids.map(id => G.tilePositions[id].col);
const sortedColsOf = (G, ids) => colsOf(G, ids).slice().sort((a, b) => a - b);

// A match whose start state is `tilePositions`, driven so player 0 is current.
// A spare tile is parked in player 1's hand so ending their turn (to pass the
// turn to seat 0) doesn't empty their rack and trip checkGameOver.
function playArrange(tilePositions) {
    const tp = {...tilePositions};
    const keep = buildTileObj(13, COLOR.black, 1);
    tp[keep] = {id: keep, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '1'};
    const game = makeMatch({tilePositions: tp, prevTilePositions: tp, firstMoveDone: [true, true]});
    const spec = {game, multiplayer: Local()};
    const c0 = Client({...spec, playerID: '0'});
    const c1 = Client({...spec, playerID: '1'});
    c0.start();
    c1.start();
    c0.events.endPhase(); // playersJoin -> play (opens on seat 1)
    if (c0.getState().ctx.currentPlayer !== '0') c1.events.endTurn(); // hand the turn to seat 0
    return c0;
}

test('§10 #5: b7 k7 dropped to the right of 567 -> 567 _ {7s} (run kept, loose 7s on the drop side)', () => {
    const tp = {};
    [5, 6, 7].forEach((v, i) => boardTileAt(tp, r(v), i)); // committed run 5 6 7 at cols 0,1,2
    const b7 = blue(7), k7 = black(7);
    handTileAt(tp, b7, 0); handTileAt(tp, k7, 1);
    const c0 = playArrange(tp);

    c0.moves.insertTilesWithPush(3, 0, BOARD_GRID_ID, {id: b7}, [b7, k7]); // drop just right of the run

    const {G} = c0.getState();
    expect(colsOf(G, [r(5), r(6), r(7)])).toEqual([0, 1, 2]); // no full-valid solution -> Pass 2 keeps the run
    expect(sortedColsOf(G, [b7, k7])).toEqual([4, 5]);        // same-value loose 7s together, past the gap
});

test('§10 #5b: b7 k7 dropped to the left of 567 -> {7s} _ 567 (loose 7s follow the drop side)', () => {
    const tp = {};
    [5, 6, 7].forEach((v, i) => boardTileAt(tp, r(v), 5 + i)); // run 5 6 7 at cols 5,6,7
    const b7 = blue(7), k7 = black(7);
    handTileAt(tp, b7, 0); handTileAt(tp, k7, 1);
    const c0 = playArrange(tp);

    c0.moves.insertTilesWithPush(3, 0, BOARD_GRID_ID, {id: b7}, [b7, k7]); // drop to the left

    const {G} = c0.getState();
    expect(colsOf(G, [r(5), r(6), r(7)])).toEqual([5, 6, 7]); // run intact
    expect(sortedColsOf(G, [b7, k7])).toEqual([2, 3]);        // loose 7s on the left, one gap before the run
});

test('§10 #8: b6 o6 dropped right of the joker run 5 J 7 -> 5 J 7 _ {6s} (formed joker run protected)', () => {
    const tp = {};
    boardTileAt(tp, r(5), 0);
    boardTileAt(tp, BlackJoker, 1); // settled joker representing red 6
    boardTileAt(tp, r(7), 2);
    const b6 = blue(6), o6 = orange(6);
    handTileAt(tp, b6, 0); handTileAt(tp, o6, 1);
    const c0 = playArrange(tp);

    c0.moves.insertTilesWithPush(3, 0, BOARD_GRID_ID, {id: b6}, [b6, o6]);

    const {G} = c0.getState();
    expect(G.tilePositions[r(5)].col).toBe(0);
    expect(G.tilePositions[BlackJoker].col).toBe(1); // joker stays inside its protected run
    expect(G.tilePositions[r(7)].col).toBe(2);
    expect(sortedColsOf(G, [b6, o6])).toEqual([4, 5]); // loose 6s on the drop side
});

test('§10 #10: an unrelated b2 dropped beside k7 -> k7 _ b2 (unrelated loose tiles stay gap-separated)', () => {
    const tp = {};
    const k7 = black(7), b2 = blue(2);
    boardTileAt(tp, k7, 5); // a single loose tile on the board
    handTileAt(tp, b2, 0);
    const c0 = playArrange(tp);

    c0.moves.insertTilesWithPush(6, 0, BOARD_GRID_ID, {id: b2}, [b2]); // drop right next to it

    const {G} = c0.getState();
    // Different value and colour -> not related -> exactly one empty column between them.
    expect(Math.abs(G.tilePositions[k7].col - G.tilePositions[b2].col)).toBe(2);
});

// =============================================================================
// Client routing (pure resolveDropDispatch). The path that reaches the move
// above: the board routes to push, the hand still snaps.
// =============================================================================

const boardTile = (id, col, row) => ({id, col, row, gridId: BOARD_GRID_ID, tmp: false, playerID: null});
const handTile = (id, col, row) => ({id, col, row, gridId: HAND_GRID_ID, playerID: '0', tmp: false});

function dispatch(overrides) {
    return resolveDropDispatch({
        playerID: '0', boardCols: BOARD_COLS, handCols: HAND_COLS, allowJokerSwap: true, ...overrides,
    });
}

test('an in-bounds board drop routes to {kind:push} -> insertTilesWithPush (no client-side geometry)', () => {
    const a = blue(7), b = black(7);
    const tp = {[a]: handTile(a, 0, 0), [b]: handTile(b, 1, 0), 9001: boardTile(9001, 5, 0)};
    const d = dispatch({tilePositions: tp, target: {gridId: BOARD_GRID_ID, col: 5, row: 0}, primaryId: a, selection: [a, b]});
    expect(d.kind).toBe('push');
    expect(d.args[0]).toBe(5);             // target col forwarded to the move
    expect(d.args[1]).toBe(0);             // row
    expect(d.args[2]).toBe(BOARD_GRID_ID); // destGridId 'b'
    expect(d.args[3]).toEqual({id: a});    // tileIdObj
    expect(d.args[4]).toEqual([a, b]);     // ordered selection
});

test('a hand-row drop still routes to {kind:snap} -> moveTiles (the hand never pushes)', () => {
    const a = blue(7);
    const tp = {[a]: handTile(a, 5, 0)};
    const d = dispatch({tilePositions: tp, target: {gridId: HAND_GRID_ID, col: 1, row: 0}, primaryId: a, selection: [a]});
    expect(d.kind).toBe('snap');
    expect(d.args[2]).toBe(HAND_GRID_ID);
    expect(d.args[3]).toEqual({id: a});
});
