import {Rummikub} from "../rummikub/Game";
import {Client} from 'boardgame.io/client';
import {buildTileObj, getTiles, BlackJoker} from "../rummikub/util";
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";
import _ from "lodash";

// Board run 4 _ 6 (red) with a frozen BlackJoker in the middle representing red 5.
const red4 = buildTileObj(4, COLOR.red, 0);
const red6 = buildTileObj(6, COLOR.red, 0);
const red5a = buildTileObj(5, COLOR.red, 0);   // the represented tile (copy A)
const red5b = buildTileObj(5, COLOR.red, 1);   // the represented tile (copy B)
const blue5a = buildTileObj(5, COLOR.blue, 0); // right value, wrong colour
const blue5b = buildTileObj(5, COLOR.blue, 1);

function makeGame(handTilesForP0) {
    const tilePositions = {};
    // pre-existing valid board run with a frozen joker (tmp: false)
    tilePositions[red4] = {id: red4, col: 0, row: 0, gridId: BOARD_GRID_ID, tmp: false, playerID: null};
    tilePositions[BlackJoker] = {id: BlackJoker, col: 1, row: 0, gridId: BOARD_GRID_ID, tmp: false, playerID: null};
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

test('eligible retrieveJoker swaps the joker back to hand and keeps the board valid', () => {
    const {c0} = startPlay(makeGame([red5a, red5b]));
    expect(c0.getState().ctx.currentPlayer).toBe("0");

    c0.moves.retrieveJoker(BlackJoker, red5a, red5b);

    const {G, ctx} = c0.getState();
    // joker is back in player 0's hand
    expect(G.tilePositions[BlackJoker].gridId).toBe(HAND_GRID_ID);
    expect(G.tilePositions[BlackJoker].playerID).toBe("0");
    // one red 5 now sits in the joker's old board slot (row 0, col 1)
    expect(G.tilePositions[red5a].gridId).toBe(BOARD_GRID_ID);
    expect(G.tilePositions[red5a].row).toBe(0);
    expect(G.tilePositions[red5a].col).toBe(1);
    // the second copy stays in hand
    expect(G.tilePositions[red5b].gridId).toBe(HAND_GRID_ID);
    // the turn did NOT end
    expect(ctx.currentPlayer).toBe("0");
});

test('retrieveJoker is a no-op when the player is missing a second copy', () => {
    // holds only one red 5; second arg points at a tile not in hand
    const {c0} = startPlay(makeGame([red5a]));
    const before = _.cloneDeep(c0.getState().G.tilePositions);

    c0.moves.retrieveJoker(BlackJoker, red5a, red5b);

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(before);
    expect(after.G.tilePositions[BlackJoker].gridId).toBe(BOARD_GRID_ID);
    expect(after.ctx.currentPlayer).toBe("0");
});

test('retrieveJoker is a no-op when the swap would break the board', () => {
    // two copies of blue 5: value matches the joker but colour breaks the red run
    const {c0} = startPlay(makeGame([blue5a, blue5b]));
    const before = _.cloneDeep(c0.getState().G.tilePositions);

    c0.moves.retrieveJoker(BlackJoker, blue5a, blue5b);

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(before);
    expect(after.G.tilePositions[BlackJoker].gridId).toBe(BOARD_GRID_ID);
    expect(after.ctx.currentPlayer).toBe("0");
});

test('retrieveJoker is a no-op for a non-current player', () => {
    const {c1, c0} = startPlay(makeGame([red5a, red5b]));
    const before = _.cloneDeep(c0.getState().G.tilePositions);

    c1.moves.retrieveJoker(BlackJoker, red5a, red5b);

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(before);
    expect(after.G.tilePositions[BlackJoker].gridId).toBe(BOARD_GRID_ID);
});
