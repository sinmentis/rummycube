import {makeMatch} from "./__helpers__/makeMatch";
import {Client} from 'boardgame.io/client';
import {getTiles} from "../rummikub/util";
import {BOARD_GRID_ID, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";
import _ from "lodash";

// Reducer-level tests for the authoritative insert-with-push move. Geometry only:
// the move never validates tile numbers/colors, so the ids below are arbitrary but
// distinct. Board row 2 starts as `[L L L _ 7 7 7]` at cols 0,1,2,_,4,5,6; dropping
// two tiles at col 3 must ripple the three "7"s right to 5,6,7 and seat the dragged
// pair at 3,4. Both seats get a symmetric two-tile hand so the test works whichever
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

test('insertTilesWithPush cascades the colliding run right and seats the dragged pair as tmp', () => {
    const {cur, curDrop} = startPlay('m-itwp-cascade');

    cur.moves.insertTilesWithPush(3, 2, BOARD_GRID_ID, {id: curDrop[0]}, curDrop);

    const {G} = cur.getState();
    // Dragged pair -> board tmp tiles at newCols [3,4], ownership cleared (public tmp).
    expect(G.tilePositions[curDrop[0]]).toEqual({id: curDrop[0], col: 3, row: 2, gridId: BOARD_GRID_ID, tmp: true, playerID: null});
    expect(G.tilePositions[curDrop[1]]).toEqual({id: curDrop[1], col: 4, row: 2, gridId: BOARD_GRID_ID, tmp: true, playerID: null});
    // The three 7s shifted right by one; col is the ONLY field that changed.
    expect(G.tilePositions[207]).toEqual({id: 207, col: 5, row: 2, gridId: BOARD_GRID_ID, tmp: false, playerID: null});
    expect(G.tilePositions[208]).toEqual({id: 208, col: 6, row: 2, gridId: BOARD_GRID_ID, tmp: false, playerID: null});
    expect(G.tilePositions[209]).toEqual({id: 209, col: 7, row: 2, gridId: BOARD_GRID_ID, tmp: false, playerID: null});
    // Left block untouched.
    expect(G.tilePositions[201].col).toBe(0);
    expect(G.tilePositions[203].col).toBe(2);
});

test('insertTilesWithPush is atomic: a dragged tile may land on a column occupied before the shift', () => {
    const {cur, curDrop} = startPlay('m-itwp-atomic');
    // 7a sits at col4 BEFORE the move and the dragged pair targets [3,4]; a naive
    // "reject on overlap" would refuse. Applied in one reducer pass, 7a slides to col5
    // and the dragged tile takes col4.
    expect(cur.getState().G.tilePositions[207].col).toBe(4);

    cur.moves.insertTilesWithPush(3, 2, BOARD_GRID_ID, {id: curDrop[0]}, curDrop);

    const {G} = cur.getState();
    expect(G.tilePositions[curDrop[1]].col).toBe(4); // dragged tile took the formerly-occupied col
    expect(G.tilePositions[207].col).toBe(5);        // 7a moved out of the way in the same move
    const cols = Object.values(G.tilePositions)
        .filter(p => p && p.gridId === BOARD_GRID_ID && p.row === 2)
        .map(p => p.col);
    expect(new Set(cols).size).toBe(cols.length); // no two row-2 tiles share a column
    expect(cols.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

test('insertTilesWithPush with an out-of-range plan is INVALID_MOVE and leaves G unchanged', () => {
    const {cur, curDrop} = startPlay('m-itwp-null');
    const before = _.cloneDeep(cur.getState().G);
    // T=31,N=2 -> T+N-1=32 > maxCol(31): insertWithPush returns null, move rejects.
    cur.moves.insertTilesWithPush(31, 2, BOARD_GRID_ID, {id: curDrop[0]}, curDrop);
    expect(cur.getState().G).toEqual(before);
});

test('a single undo reverts the whole insert-with-push (run back + dragged tiles back in hand)', () => {
    const {cur, current, curDrop} = startPlay('m-itwp-undo');
    cur.moves.insertTilesWithPush(3, 2, BOARD_GRID_ID, {id: curDrop[0]}, curDrop);
    expect(cur.getState().G.tilePositions[207].col).toBe(5); // sanity: push happened

    cur.moves.undo();

    const {G} = cur.getState();
    // Run restored to 4,5,6.
    expect(G.tilePositions[207].col).toBe(4);
    expect(G.tilePositions[208].col).toBe(5);
    expect(G.tilePositions[209].col).toBe(6);
    // Dragged tiles back in the current seat's hand (read from the owner's view).
    expect(G.tilePositions[curDrop[0]]).toEqual({id: curDrop[0], col: 0, row: 0, gridId: HAND_GRID_ID, playerID: current, tmp: false});
    expect(G.tilePositions[curDrop[1]]).toEqual({id: curDrop[1], col: 1, row: 0, gridId: HAND_GRID_ID, playerID: current, tmp: false});
    // No tmp tile left on the board.
    const tmpOnBoard = Object.values(G.tilePositions).filter(p => p && p.gridId === BOARD_GRID_ID && p.tmp);
    expect(tmpOnBoard.length).toBe(0);
});

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
