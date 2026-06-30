import {Rummikub} from "../rummikub/Game";
import {Client} from 'boardgame.io/client';
import {buildTileObj, getTiles} from "../rummikub/util";
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";

const red1 = buildTileObj(1, COLOR.red, 0);
const red2 = buildTileObj(2, COLOR.red, 0);
const red3 = buildTileObj(3, COLOR.red, 0);
const red4 = buildTileObj(4, COLOR.red, 0);
const red5 = buildTileObj(5, COLOR.red, 0);
const red6 = buildTileObj(6, COLOR.red, 0);
const blue1 = buildTileObj(1, COLOR.blue, 0);
const blue2 = buildTileObj(2, COLOR.blue, 0);
const blue3 = buildTileObj(3, COLOR.blue, 0);

function spawn(setup) {
    const game = {...Rummikub, setup};
    const spec = {game, multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0"});
    const c1 = Client({...spec, playerID: "1"});
    c0.start();
    c1.start();
    c0.events.endPhase();
    c1.events.endPhase();
    return {c0, c1};
}

test('combo count is the net number of tiles added to the board, scored pre-freeze', () => {
    // --- Play A: complete two separate runs (2 groups formed). ---
    const setupTwoGroups = () => {
        const tilePositions = {};
        // committed (frozen) board fragments, each one tile short of a valid run
        tilePositions[red1] = {id: red1, col: 0, row: 0, gridId: BOARD_GRID_ID};
        tilePositions[red2] = {id: red2, col: 1, row: 0, gridId: BOARD_GRID_ID};
        tilePositions[blue1] = {id: blue1, col: 5, row: 0, gridId: BOARD_GRID_ID};
        tilePositions[blue2] = {id: blue2, col: 6, row: 0, gridId: BOARD_GRID_ID};
        // the bridging tiles sit in hand until played
        tilePositions[red3] = {id: red3, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
        tilePositions[blue3] = {id: blue3, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
        return {
            timePerTurn: 60, tilesPool: getTiles(), tilePositions,
            prevTilePositions: tilePositions, firstMoveDone: [true, true],
            gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [], lastPlay: null,
        };
    };
    const {c0, c1} = spawn(setupTwoGroups);
    c0.moves.moveTiles(2, 0, BOARD_GRID_ID, {id: red3}, [red3]);   // red1-2-3
    c0.moves.moveTiles(7, 0, BOARD_GRID_ID, {id: blue3}, [blue3]); // blue1-2-3
    // pre-freeze sanity: the placed tiles are still tmp on the board at compute time
    const {G: Gmid} = c0.getState();
    expect(Object.values(Gmid.tilePositions)
        .filter(p => p && p.gridId === BOARD_GRID_ID && p.tmp).length).toBe(2);
    c0.moves.endTurn();
    const twoGroups = c1.getState().G.lastPlay;
    expect(twoGroups).toBeTruthy();
    expect(twoGroups.groups.length).toBe(2);
    expect(twoGroups.placed).toBe(2);
    expect(twoGroups.rearranged).toBe(0);
    expect(twoGroups.manipulation).toBe(twoGroups.count);
    expect(twoGroups.count).toBe(2); // net +2 board tiles

    // --- Play B: flat-dump a single 3-tile run. ---
    const setupFlatDump = () => {
        const tilePositions = {};
        tilePositions[red4] = {id: red4, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
        tilePositions[red5] = {id: red5, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
        tilePositions[red6] = {id: red6, col: 2, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
        tilePositions[blue1] = {id: blue1, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"};
        return {
            timePerTurn: 60, tilesPool: getTiles(), tilePositions,
            prevTilePositions: tilePositions, firstMoveDone: [true, true],
            gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [], lastPlay: null,
        };
    };
    const {c0: d0, c1: d1} = spawn(setupFlatDump);
    d0.moves.moveTiles(0, 1, BOARD_GRID_ID, {id: red4}, [red4, red5, red6]);
    d0.moves.endTurn();
    const flatDump = d1.getState().G.lastPlay;
    expect(flatDump).toBeTruthy();
    expect(flatDump.groups.length).toBe(1);
    expect(flatDump.placed).toBe(3);
    expect(flatDump.count).toBe(3); // net +3 board tiles
    expect(flatDump.manipulation).toBe(flatDump.count);

    // Combo now means "how many tiles did you add to the table?", not how many
    // groups were manipulated. A larger flat dump correctly has the larger number.
    expect(flatDump.count).toBeGreaterThan(twoGroups.count);
});
