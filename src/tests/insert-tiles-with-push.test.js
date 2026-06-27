import {makeMatch} from "./__helpers__/makeMatch";
import {Client} from 'boardgame.io/client';
import {getTiles, buildTileObj, RedJoker} from "../rummikub/util";
import {arrangeBoard} from "../rummikub/arrange/index";
import {BOARD_GRID_ID, HAND_GRID_ID, COLOR} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";
import _ from "lodash";

// =============================================================================
// Semantic reflow (§10 worked examples). insertTilesWithPush now WRITES the
// dragged tiles then hands the post-drop board to the pure arrangeBoard engine,
// which reflows the cluster the drop landed in toward valid blocks (auto-snap,
// separate, sort) — server-authoritative, semantic, not geometric. These tests
// drive the move through a real boardgame.io Client+Local() harness and assert
// the §10 outcomes (the spec's test oracle). The old geometric-cascade /
// atomic-overlap / out-of-range / geometric-undo tests asserted the behaviour
// THIS engine deliberately replaced and are gone.
// =============================================================================

const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
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

test('§10 #1: r1..r5 + a duplicate r3 reflows to 123 _ 345 (two valid runs, one-gap split)', () => {
    const tp = {};
    [1, 2, 3, 4, 5].forEach((v, i) => boardTileAt(tp, r(v), i));
    const dup = r(3, 1);
    handTileAt(tp, dup, 0);
    const c0 = playArrange(tp);

    c0.moves.insertTilesWithPush(5, 0, BOARD_GRID_ID, {id: dup}, [dup]);

    const {G} = c0.getState();
    // 1 2 3 _ 3 4 5 : the six tiles occupy 0,1,2,4,5,6 with col 3 the separator.
    expect(sortedColsOf(G, [r(1), r(2), r(3), dup, r(4), r(5)])).toEqual([0, 1, 2, 4, 5, 6]);
});

test('§10 #2: a 789 run dropped next to a committed 123 reflows to 123 _ 789', () => {
    const tp = {};
    [1, 2, 3].forEach((v, i) => boardTileAt(tp, r(v), i));
    const d7 = r(7), d8 = r(8), d9 = r(9);
    handTileAt(tp, d7, 0); handTileAt(tp, d8, 1); handTileAt(tp, d9, 2);
    const c0 = playArrange(tp);

    c0.moves.insertTilesWithPush(3, 0, BOARD_GRID_ID, {id: d7}, [d7, d8, d9]);

    const {G} = c0.getState();
    expect(colsOf(G, [r(1), r(2), r(3)])).toEqual([0, 1, 2]); // 123 stays put
    expect(colsOf(G, [d7, d8, d9])).toEqual([4, 5, 6]);       // 789 seated past the gap
});

test('§10 #3: r4 dropped into the single gap of 123 _ 567 bridges to one contiguous 7-run', () => {
    const tp = {};
    [1, 2, 3].forEach((v, i) => boardTileAt(tp, r(v), i));
    [5, 6, 7].forEach((v, i) => boardTileAt(tp, r(v), 4 + i));
    const d4 = r(4);
    handTileAt(tp, d4, 0);
    const c0 = playArrange(tp);

    c0.moves.insertTilesWithPush(3, 0, BOARD_GRID_ID, {id: d4}, [d4]);

    const {G} = c0.getState();
    expect(sortedColsOf(G, [r(1), r(2), r(3), d4, r(5), r(6), r(7)])).toEqual([0, 1, 2, 3, 4, 5, 6]);
});

test('§10 #7: a joker dropped onto 567 forms a contiguous 4-run (either end of the run)', () => {
    const tp = {};
    [5, 6, 7].forEach((v, i) => boardTileAt(tp, r(v), i));
    handTileAt(tp, RedJoker, 0);
    const c0 = playArrange(tp);

    c0.moves.insertTilesWithPush(3, 0, BOARD_GRID_ID, {id: RedJoker}, [RedJoker]);

    const {G} = c0.getState();
    // The solver may seat the joker on either end; assert contiguity only.
    expect(sortedColsOf(G, [r(5), r(6), r(7), RedJoker])).toEqual([0, 1, 2, 3]);
});

test('§10 #7b: a joker dropped into the gap of r5 _ r7 fills the hole -> r5 J r7', () => {
    const tp = {};
    boardTileAt(tp, r(5), 0);
    boardTileAt(tp, r(7), 2);
    handTileAt(tp, RedJoker, 0);
    const c0 = playArrange(tp);

    c0.moves.insertTilesWithPush(1, 0, BOARD_GRID_ID, {id: RedJoker}, [RedJoker]);

    const {G} = c0.getState();
    expect(G.tilePositions[r(5)].col).toBe(0);
    expect(G.tilePositions[RedJoker].col).toBe(1);
    expect(G.tilePositions[r(7)].col).toBe(2);
});

test('§10 #11: a source cluster of r5 r7 (after r6 is dragged out) re-tidies to 2 gap-separated loose tiles', () => {
    // §10 #11 is a SOURCE re-tidy: dragging r6 out of r5 r6 r7 leaves r5 and r7,
    // which cannot form a run, so they settle as two loose tiles one gap apart.
    // No move wires source re-tidy today (drag-out is moveTiles, which does not
    // re-arrange), so this pins the engine outcome directly via arrangeBoard.
    const tp = {};
    boardTileAt(tp, r(5), 5);
    boardTileAt(tp, r(7), 7);

    const out = arrangeBoard(tp, {droppedIds: [r(5)], row: 0, col: 5});

    expect(out.ok).toBe(true);
    expect(Math.abs(out.placements[r(5)].col - out.placements[r(7)].col)).toBe(2);
});

test('a single undo reverts the WHOLE insert-with-push reflow (one snapshot)', () => {
    const tp = {};
    [1, 2, 3].forEach((v, i) => boardTileAt(tp, r(v), i));
    const d7 = r(7), d8 = r(8), d9 = r(9);
    handTileAt(tp, d7, 0); handTileAt(tp, d8, 1); handTileAt(tp, d9, 2);
    const c0 = playArrange(tp);

    c0.moves.insertTilesWithPush(3, 0, BOARD_GRID_ID, {id: d7}, [d7, d8, d9]);
    // The move reflowed (123 _ 789) and pushed exactly one undo snapshot.
    expect(c0.getState().G.tilePositions[d7].gridId).toBe(BOARD_GRID_ID);
    expect(c0.getState().G.gameStateStack.length).toBe(1);

    c0.moves.undo();

    const {G} = c0.getState();
    // One undo restores the entire pre-drop arrangement in a single step.
    expect(colsOf(G, [r(1), r(2), r(3)])).toEqual([0, 1, 2]);
    [d7, d8, d9].forEach(id => expect(G.tilePositions[id].gridId).toBe(HAND_GRID_ID));
    expect(G.gameStateStack.length).toBe(0);
    const tmpOnBoard = Object.values(G.tilePositions).filter(p => p && p.gridId === BOARD_GRID_ID && p.tmp);
    expect(tmpOnBoard.length).toBe(0);
});

// =============================================================================
// Move guards (reducer-level). These pin the authoritative move's ownership /
// turn / phase / destination checks, which sit BEFORE the engine and are
// unaffected by the semantic reflow above.
// =============================================================================

// Reducer-level fixture for the move's guard tests below. The move never
// validates tile numbers/colors, so the ids here are arbitrary but distinct.
// Both seats get a symmetric two-tile hand so the guard tests work whichever
// seat boardgame.io makes current.
function buildPositions() {
    const board = (id, col) => ({id, col, row: 2, gridId: BOARD_GRID_ID, tmp: false, playerID: null});
    const hand = (id, col, playerID) => ({id, col, row: 0, gridId: HAND_GRID_ID, playerID, tmp: false});
    return {
        201: board(201, 0), 202: board(202, 1), 203: board(203, 2),
        207: board(207, 4), 208: board(208, 5), 209: board(209, 6),
        10: hand(10, 0, "0"), 11: hand(11, 1, "0"),
        20: hand(20, 0, "1"), 21: hand(21, 1, "1"),
    };
}

// fullView drops playerView's hand-stripping. The ownership tests need the current
// player to drive the authoritative reducer against a tile they do NOT own; under the
// real playerView that tile is stripped from the mover's optimistic client (it would
// diverge from the server, and moveTiles' un-guarded currPos access would even throw).
// Full visibility makes the optimistic and authoritative runs identical, so the test
// deterministically exercises the server-side ownership check itself.
function makeGame(fullView = false) {
    const tilePositions = buildPositions();
    const game = makeMatch({
        timePerTurn: 100000, // ms, far-future deadline (no ×1000 here, setup is overridden)
        timerExpireAt: null,
        tilesPool: getTiles(),
        tilePositions,
        prevTilePositions: tilePositions,
        firstMoveDone: [false, false],
        gameStateStack: [],
        redoMoveStack: [],
        lastCircle: [],
        recentlyDrawnTiles: [],
        lastPlay: null,
    });
    if (fullView) game.playerView = ({G}) => G;
    return game;
}

function startPlay(matchID, fullView = false) {
    const spec = {game: makeGame(fullView), multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0", matchID});
    const c1 = Client({...spec, playerID: "1", matchID});
    c0.start();
    c1.start();
    c0.events.endPhase(); // playersJoin -> play
    const current = c0.getState().ctx.currentPlayer;
    const cur = current === "0" ? c0 : c1;
    const other = current === "0" ? c1 : c0;
    const curDrop = current === "0" ? [10, 11] : [20, 21]; // current seat's two hand tiles
    const oppHand = current === "0" ? [20, 21] : [10, 11]; // the OTHER seat's hand tiles
    const oppSeat = current === "0" ? "1" : "0";
    return {c0, c1, current, cur, other, curDrop, oppHand, oppSeat};
}

test('insertTilesWithPush from a non-current player is INVALID_MOVE and does not advance the turn', () => {
    const {cur, other, current, oppHand} = startPlay('m-itwp-noncurrent');
    const before = _.cloneDeep(cur.getState().G);
    // `other` is not the current player; even a geometrically-fine drop must be rejected.
    other.moves.insertTilesWithPush(10, 2, BOARD_GRID_ID, {id: oppHand[0]}, oppHand);
    const after = cur.getState();
    expect(after.G).toEqual(before);
    expect(after.ctx.currentPlayer).toBe(current);
});

test('the current player cannot insert an opponent hand tile (ownership enforced)', () => {
    const {cur, current, oppHand} = startPlay('m-itwp-steal', true); // full view: exercise the ownership check directly
    const before = _.cloneDeep(cur.getState().G);
    // Geometrically a pure snap onto an empty col, but the dragged tile belongs to the
    // opponent's hand -> the hand->board ownership check rejects and immer discards.
    cur.moves.insertTilesWithPush(12, 2, BOARD_GRID_ID, {id: oppHand[0]}, [oppHand[0]]);
    const after = cur.getState();
    expect(after.G).toEqual(before);
    expect(after.ctx.currentPlayer).toBe(current);
});

test('insertTilesWithPush with a non-board destGridId is INVALID_MOVE', () => {
    const {cur, curDrop} = startPlay('m-itwp-dest');
    const before = _.cloneDeep(cur.getState().G);
    cur.moves.insertTilesWithPush(0, 0, HAND_GRID_ID, {id: curDrop[0]}, curDrop);
    expect(cur.getState().G).toEqual(before);
});

test('insertTilesWithPush is blocked during the playersJoin phase', () => {
    const spec = {game: makeGame(), multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0", matchID: 'm-itwp-join'});
    const c1 = Client({...spec, playerID: "1", matchID: 'm-itwp-join'});
    c0.start();
    c1.start();
    // Do NOT endPhase: stay in playersJoin, where the push move is not enabled.
    expect(c0.getState().ctx.phase).toBe('playersJoin');
    const before = _.cloneDeep(c0.getState().G);
    c0.moves.insertTilesWithPush(3, 2, BOARD_GRID_ID, {id: 10}, [10, 11]);
    const after = c0.getState().G;
    expect(after).toEqual(before);
    // The hand tile never reached the board.
    expect(after.tilePositions[10]).toMatchObject({gridId: HAND_GRID_ID, playerID: "0"});
});

test('moveTiles cannot relocate another player hand tile onto the board (ownership hardening)', () => {
    const {cur, oppHand, oppSeat} = startPlay('m-mt-steal', true); // full view: the mover must "see" the victim tile
    // Current player tries to drag the OPPONENT's hand tile to an empty board cell.
    cur.moves.moveTiles(12, 2, BOARD_GRID_ID, {id: oppHand[0]}, [oppHand[0]]);
    const {G} = cur.getState();
    // The tile must still be in the opponent's hand, never written to the board.
    expect(G.tilePositions[oppHand[0]]).toMatchObject({gridId: HAND_GRID_ID, playerID: oppSeat});
    expect(G.tilePositions[oppHand[0]].tmp).toBeFalsy();
    // And nothing tmp showed up on the board.
    const tmpOnBoard = Object.values(G.tilePositions)
        .filter(p => p && p.gridId === BOARD_GRID_ID && p.tmp);
    expect(tmpOnBoard.length).toBe(0);
});
