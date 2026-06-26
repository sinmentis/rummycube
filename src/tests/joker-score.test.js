import {makeMatch} from "./__helpers__/makeMatch";
import {Client} from 'boardgame.io/client';
import {buildTileObj, getTiles, BlackJoker} from "../rummikub/util";
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";

const red4 = buildTileObj(4, COLOR.red, 0);
const red6 = buildTileObj(6, COLOR.red, 0);

// A run 4 _ 6 with a joker in the middle: the joker represents red 5.
test('a joker scores its REPRESENTED value (not 0) in lastPlay.points', () => {
    const tilePositions = {};
    tilePositions[red4] = {id: red4, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    tilePositions[BlackJoker] = {id: BlackJoker, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    tilePositions[red6] = {id: red6, col: 2, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    tilePositions[11] = {id: 11, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"};
    const game = makeMatch({
        timePerTurn: 60, tilesPool: getTiles(), tilePositions,
        prevTilePositions: tilePositions, firstMoveDone: [true, true],
        gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [], lastPlay: null,
    });
    const spec = {game, multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0"});
    const c1 = Client({...spec, playerID: "1"});
    c0.start();
    c1.start();
    c0.events.endPhase();
    c1.events.endPhase();

    c0.moves.moveTiles(0, 0, BOARD_GRID_ID, {id: red4}, [red4, BlackJoker, red6]);
    c0.moves.endTurn();

    const {G} = c1.getState();
    expect(G.lastPlay).toBeTruthy();
    // 4 + (joker -> 5) + 6 = 15, NOT 4 + 0 + 6 = 10
    expect(G.lastPlay.points).toBe(15);
});
