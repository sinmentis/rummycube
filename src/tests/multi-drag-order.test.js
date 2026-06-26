import {makeMatch} from "./__helpers__/makeMatch";
import {Client} from 'boardgame.io/client';
import {buildTileObj, getTiles} from "../rummikub/util";
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";

const red4 = buildTileObj(4, COLOR.red, 0);
const red5 = buildTileObj(5, COLOR.red, 0);
const red6 = buildTileObj(6, COLOR.red, 0);

function startGame() {
    const tilePositions = {};
    // a sorted run sitting left-to-right in the rack: 4,5,6
    tilePositions[red4] = {id: red4, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    tilePositions[red5] = {id: red5, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    tilePositions[red6] = {id: red6, col: 2, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    tilePositions[11] = {id: 11, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"};
    const game = makeMatch({
        timePerTurn: 60, tilesPool: getTiles(), tilePositions,
        prevTilePositions: tilePositions, firstMoveDone: [true, true],
        gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [],
    });
    const spec = {game, multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0"});
    const c1 = Client({...spec, playerID: "1"});
    c0.start();
    c1.start();
    c0.events.endPhase();
    c1.events.endPhase();
    return c0;
}

test('a multi-tile run lands in rack order even when selected out of order', () => {
    const c0 = startGame();
    // grab red6 and drop on the board; selection in scrambled tap order [6,4,5]
    c0.moves.moveTiles(5, 0, BOARD_GRID_ID, {id: red6}, [red6, red4, red5]);
    const {G} = c0.getState();
    const at = id => G.tilePositions[id];
    expect(at(red4).gridId).toBe(BOARD_GRID_ID);
    expect(at(red5).gridId).toBe(BOARD_GRID_ID);
    expect(at(red6).gridId).toBe(BOARD_GRID_ID);
    // placed contiguously, ascending left-to-right (4,5,6) -> a valid run
    expect([at(red4).col, at(red5).col, at(red6).col]).toEqual([5, 6, 7]);
    expect([at(red4).row, at(red5).row, at(red6).row]).toEqual([0, 0, 0]);
});
