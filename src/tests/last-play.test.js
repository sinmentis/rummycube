import {Rummikub} from "../rummikub/Game";
import {Client} from 'boardgame.io/client';
import {buildTileObj, getTiles} from "../rummikub/util";
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";

const red4 = buildTileObj(4, COLOR.red, 0);
const red5 = buildTileObj(5, COLOR.red, 0);
const red6 = buildTileObj(6, COLOR.red, 0);

test('a valid submit records G.lastPlay so every client can celebrate it', () => {
    const game = {
        ...Rummikub,
        setup: () => {
            const tilePositions = {};
            tilePositions[red4] = {id: red4, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
            tilePositions[red5] = {id: red5, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
            tilePositions[red6] = {id: red6, col: 2, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
            tilePositions[11] = {id: 11, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"};
            return {
                timePerTurn: 60, tilesPool: getTiles(), tilePositions,
                prevTilePositions: tilePositions, firstMoveDone: [true, true],
                gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [], lastPlay: null,
            };
        },
    };
    const spec = {game, multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0"});
    const c1 = Client({...spec, playerID: "1"});
    c0.start();
    c1.start();
    c0.events.endPhase();
    c1.events.endPhase();

    c0.moves.moveTiles(0, 0, BOARD_GRID_ID, {id: red4}, [red4, red5, red6]);
    c0.moves.endTurn();

    // read from the OTHER client — the play must be broadcast to everyone
    const {G} = c1.getState();
    expect(G.lastPlay).toBeTruthy();
    expect(G.lastPlay.seat).toBe('0');
    expect(G.lastPlay.count).toBe(3); // manipulation: 3*1 group + 3*0 rearrange + 0*3 placed
    expect(G.lastPlay.manipulation).toBe(3);
    expect(G.lastPlay.placed).toBe(3);
    expect(G.lastPlay.rearranged).toBe(0);
    expect(G.lastPlay.points).toBe(15); // 4 + 5 + 6
    expect(G.lastPlay.groups.length).toBe(1);
    expect(G.lastPlay.groups[0].slice().sort((a, b) => a - b)).toEqual([red4, red5, red6].sort((a, b) => a - b));
});
