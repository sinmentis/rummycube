import {Rummikub} from "../rummikub/Game";
import {Client} from 'boardgame.io/client';
import {buildTileObj, getTiles, BlackJoker} from "../rummikub/util";
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";
import _ from "lodash";

// Board run 4 _ 6 (red) with a frozen BlackJoker in the middle representing red 5.
const red4 = buildTileObj(4, COLOR.red, 0);
const red6 = buildTileObj(6, COLOR.red, 0);
const red5a = buildTileObj(5, COLOR.red, 0);   // matches the joker (red 5): value + colour
const red7 = buildTileObj(7, COLOR.red, 0);    // right colour, wrong value
const blue5a = buildTileObj(5, COLOR.blue, 0); // right value, wrong colour

function makeGame(handTilesForP0, opts = {}) {
    const {jokerTmp = false, jokerInHand = false} = opts;
    const tilePositions = {};
    // pre-existing valid board run with a frozen joker (tmp: false)
    tilePositions[red4] = {id: red4, col: 0, row: 0, gridId: BOARD_GRID_ID, tmp: false, playerID: null};
    if (jokerInHand) {
        // joker sits in player 0's hand instead of on the board (edge-case setup)
        tilePositions[BlackJoker] = {id: BlackJoker, col: 9, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    } else {
        tilePositions[BlackJoker] = {id: BlackJoker, col: 1, row: 0, gridId: BOARD_GRID_ID, tmp: jokerTmp, playerID: null};
    }
    tilePositions[red6] = {id: red6, col: 2, row: 0, gridId: BOARD_GRID_ID, tmp: false, playerID: null};
    handTilesForP0.forEach((tid, i) => {
        tilePositions[tid] = {id: tid, col: i, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    });
    // player 1 needs a tile so the match is well formed
    tilePositions[11] = {id: 11, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"};
    return {
        ...Rummikub,
        setup: () => ({
            timePerTurn: 100000, timerExpireAt: null, tilesPool: getTiles(), tilePositions,
            prevTilePositions: tilePositions, firstMoveDone: [true, true],
            gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [], lastPlay: null,
        }),
    };
}

function startPlay(game) {
    const spec = {game, multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0"});
    const c1 = Client({...spec, playerID: "1"});
    c0.start();
    c1.start();
    c0.events.endPhase();
    c1.events.endPhase();
    return {c0, c1};
}

test('eligible retrieveJoker swaps the single hand tile for the board joker and keeps the board valid', () => {
    const {c0} = startPlay(makeGame([red5a]));
    expect(c0.getState().ctx.currentPlayer).toBe("0");

    c0.moves.retrieveJoker(BlackJoker, red5a);

    const {G, ctx} = c0.getState();
    // joker is back in player 0's hand, at the tile's freed hand slot (row 0, col 0)
    expect(G.tilePositions[BlackJoker].gridId).toBe(HAND_GRID_ID);
    expect(G.tilePositions[BlackJoker].playerID).toBe("0");
    expect(G.tilePositions[BlackJoker].row).toBe(0);
    expect(G.tilePositions[BlackJoker].col).toBe(0);
    // the represented tile now sits in the joker's old board slot (row 0, col 1)
    expect(G.tilePositions[red5a].gridId).toBe(BOARD_GRID_ID);
    expect(G.tilePositions[red5a].row).toBe(0);
    expect(G.tilePositions[red5a].col).toBe(1);
    expect(G.tilePositions[red5a].tmp).toBe(false);
    expect(G.tilePositions[red5a].playerID).toBe(null);
    // the turn did NOT end
    expect(ctx.currentPlayer).toBe("0");
});

test('retrieveJoker is a no-op when the hand tile value does not match the represented value', () => {
    // red 7: right colour but the wrong value (joker represents red 5)
    const {c0} = startPlay(makeGame([red7]));
    const before = _.cloneDeep(c0.getState().G.tilePositions);

    c0.moves.retrieveJoker(BlackJoker, red7);

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(before);
    expect(after.G.tilePositions[BlackJoker].gridId).toBe(BOARD_GRID_ID);
    expect(after.ctx.currentPlayer).toBe("0");
});

test('retrieveJoker is a no-op when the swap would break the board', () => {
    // blue 5: value matches the joker but the colour breaks the red run
    const {c0} = startPlay(makeGame([blue5a]));
    const before = _.cloneDeep(c0.getState().G.tilePositions);

    c0.moves.retrieveJoker(BlackJoker, blue5a);

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(before);
    expect(after.G.tilePositions[BlackJoker].gridId).toBe(BOARD_GRID_ID);
    expect(after.ctx.currentPlayer).toBe("0");
});

test('retrieveJoker is a no-op for a non-current player', () => {
    const {c1, c0} = startPlay(makeGame([red5a]));
    const before = _.cloneDeep(c0.getState().G.tilePositions);

    c1.moves.retrieveJoker(BlackJoker, red5a);

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(before);
    expect(after.G.tilePositions[BlackJoker].gridId).toBe(BOARD_GRID_ID);
    expect(after.ctx.currentPlayer).toBe("0");
});

test('retrieveJoker is a no-op when the target joker is not on the board', () => {
    const {c0} = startPlay(makeGame([red5a], {jokerInHand: true}));
    const before = _.cloneDeep(c0.getState().G.tilePositions);

    c0.moves.retrieveJoker(BlackJoker, red5a);

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(before);
    expect(after.G.tilePositions[BlackJoker].gridId).toBe(HAND_GRID_ID);
    expect(after.ctx.currentPlayer).toBe("0");
});

test('retrieveJoker is a no-op when the target joker is only a tmp board tile', () => {
    const {c0} = startPlay(makeGame([red5a], {jokerTmp: true}));
    const before = _.cloneDeep(c0.getState().G.tilePositions);

    c0.moves.retrieveJoker(BlackJoker, red5a);

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(before);
    expect(after.G.tilePositions[BlackJoker].tmp).toBe(true);
    expect(after.ctx.currentPlayer).toBe("0");
});

test('retrieveJoker is a no-op when the target tile is not a joker', () => {
    // red4 is a settled board tile in the run, but it is not a joker
    const {c0} = startPlay(makeGame([red5a]));
    const before = _.cloneDeep(c0.getState().G.tilePositions);

    c0.moves.retrieveJoker(red4, red5a);

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(before);
    expect(after.ctx.currentPlayer).toBe("0");
});
