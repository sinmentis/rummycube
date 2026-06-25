import {Rummikub} from "../rummikub/Game";
import {Client} from 'boardgame.io/client';
import {getTiles} from "../rummikub/util";
import {BOARD_GRID_ID, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";
import _ from "lodash";

// T5: moveTiles must PROPAGATE an inner insertTile rejection. moveTiles pushes a
// gameStateStack undo snapshot, then calls insertTile per tile. If it ignores
// insertTile's INVALID_MOVE return, a rejected insert "succeeds" anyway: the pushed
// snapshot survives (a phantom undo) and a multi-tile selection can be left half-placed.
// The fix returns INVALID_MOVE so immer discards the whole draft (snapshot + writes).
//
// Geometry-only ids: the move only needs distinct tiles plus one public board tile to
// collide with via isOverlap. Two hand tiles per seat so the test runs whichever seat
// boardgame.io makes current.
function buildPositions() {
    const board = (id, col, row) => ({id, col, row, gridId: BOARD_GRID_ID, tmp: false, playerID: null});
    const hand = (id, col, playerID) => ({id, col, row: 0, gridId: HAND_GRID_ID, playerID, tmp: false});
    return {
        500: board(500, 0, 0), // occupies (row 0, col 0)
        501: board(501, 6, 0), // occupies (row 0, col 6)
        10: hand(10, 0, "0"), 11: hand(11, 1, "0"),
        20: hand(20, 0, "1"), 21: hand(21, 1, "1"),
    };
}

function makeGame() {
    return {
        ...Rummikub,
        setup: () => {
            const tilePositions = buildPositions();
            return {
                timePerTurn: 100000, // ms, far-future deadline (setup overridden, no ×1000 here)
                timerExpireAt: null,
                tilesPool: getTiles(),
                tilePositions,
                prevTilePositions: tilePositions,
                firstMoveDone: [true, true],
                gameStateStack: [],
                redoMoveStack: [],
                lastCircle: [],
                recentlyDrawnTiles: [],
                lastPlay: null,
            };
        },
    };
}

function startPlay(matchID) {
    const spec = {game: makeGame(), multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0", matchID});
    const c1 = Client({...spec, playerID: "1", matchID});
    c0.start();
    c1.start();
    c0.events.endPhase(); // playersJoin -> play
    const current = c0.getState().ctx.currentPlayer;
    const cur = current === "0" ? c0 : c1;
    const curHand = current === "0" ? [10, 11] : [20, 21]; // current seat's two hand tiles
    return {c0, c1, current, cur, curHand};
}

test('a moveTiles whose only insert overlaps is rejected: G unchanged, no phantom undo snapshot', () => {
    const {cur, curHand} = startPlay('m-mt-overlap');
    const before = _.cloneDeep(cur.getState().G);
    expect(before.gameStateStack.length).toBe(0);

    // Drop the current seat's hand tile onto (row 0, col 0), already held by 500.
    cur.moves.moveTiles(0, 0, BOARD_GRID_ID, {id: curHand[0]}, [curHand[0]]);

    const after = cur.getState().G;
    // The colliding insert returned INVALID_MOVE; the whole draft (including the snapshot
    // pushed before the loop) must be discarded.
    expect(after.gameStateStack.length).toBe(0);                       // no phantom undo
    expect(after.tilePositions[curHand[0]].gridId).toBe(HAND_GRID_ID); // tile never moved
    expect(after).toEqual(before);                                     // nothing changed at all
});

test('a legal moveTiles still places the tile and pushes exactly one undo snapshot', () => {
    const {cur, curHand} = startPlay('m-mt-legal');
    expect(cur.getState().G.gameStateStack.length).toBe(0);

    // Drop the current seat's hand tile onto an empty board cell (row 0, col 3).
    cur.moves.moveTiles(3, 0, BOARD_GRID_ID, {id: curHand[0]}, [curHand[0]]);

    const after = cur.getState().G;
    expect(after.tilePositions[curHand[0]]).toEqual({
        id: curHand[0], col: 3, row: 0, gridId: BOARD_GRID_ID, tmp: true, playerID: null,
    });
    expect(after.gameStateStack.length).toBe(1); // one snapshot for one accepted move
});

test('a multi-tile moveTiles whose later insert overlaps is fully discarded (no partial placement, no phantom undo)', () => {
    const {cur, curHand} = startPlay('m-mt-multi');
    const before = _.cloneDeep(cur.getState().G);

    // Selection [A,B] placed from col 5: A -> col 5 (free, the first insert succeeds and
    // mutates the draft), B -> col 6 (held by 501, the second insert overlaps). Propagation
    // must roll BOTH back together with the pushed undo snapshot.
    cur.moves.moveTiles(5, 0, BOARD_GRID_ID, {id: curHand[0]}, curHand);

    const after = cur.getState().G;
    expect(after.tilePositions[curHand[0]].gridId).toBe(HAND_GRID_ID); // first tile NOT left on board
    expect(after.tilePositions[curHand[1]].gridId).toBe(HAND_GRID_ID);
    expect(after.gameStateStack.length).toBe(0); // no phantom undo
    expect(after).toEqual(before);
});

test('a moveTiles for a tile missing from G rejects cleanly (no throw) and changes nothing', () => {
    const {cur} = startPlay('m-mt-missing');
    const before = _.cloneDeep(cur.getState().G);

    // 99999 is in neither hand nor board: insertTile dereferences currPos.gridId today and
    // throws; the missing-tile guard must turn that into a clean INVALID_MOVE.
    expect(() => cur.moves.moveTiles(3, 0, BOARD_GRID_ID, {id: 99999}, [])).not.toThrow();

    expect(cur.getState().G).toEqual(before);
});
