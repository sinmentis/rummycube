import {Rummikub} from "../rummikub/Game";
import {Client} from 'boardgame.io/client';
import {getTiles} from "../rummikub/util";
import {BOARD_GRID_ID, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";
import _ from "lodash";

// Each player holds three tiles; we only need a tile to stage, validity is irrelevant for forfeit.
const HAND = {"0": [43, 44, 45], "1": [11, 12, 13]};

function makeGame() {
    const tilePositions = {
        43: {id: 43, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"},
        44: {id: 44, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "0"},
        45: {id: 45, col: 2, row: 0, gridId: HAND_GRID_ID, playerID: "0"},
        11: {id: 11, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"},
        12: {id: 12, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "1"},
        13: {id: 13, col: 2, row: 0, gridId: HAND_GRID_ID, playerID: "1"},
    };
    return {
        ...Rummikub,
        setup: () => ({
            timePerTurn: 100000, // far-future deadline: forfeit must NOT depend on the timer
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
        }),
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
    const other = current === "0" ? c1 : c0;
    return {c0, c1, current, cur, other, tiles: HAND[current]};
}

function handTiles(G, playerID) {
    return Object.values(G.tilePositions)
        .filter(p => p && p.gridId === HAND_GRID_ID && p.playerID === playerID);
}

test('forfeitTurn by the current player rolls back staged tiles, draws a penalty, and ends the turn', () => {
    const {c0, current, cur, tiles} = startPlay('m-forfeit');

    // Stage a tile on the board as tmp (a started-but-abandoned move).
    cur.moves.moveTiles(0, 0, BOARD_GRID_ID, {id: tiles[0]}, [tiles[0]]);
    const staged = c0.getState().G;
    expect(staged.tilePositions[tiles[0]].gridId).toBe(BOARD_GRID_ID);
    expect(staged.tilePositions[tiles[0]].tmp).toBe(true);
    const poolLenBefore = staged.tilesPool.length;

    cur.moves.forfeitTurn();

    // Read from the forfeiting player's own client: playerView hides a player's hand
    // (and recentlyDrawnTiles) from everyone else, so the rolled-back tile is only
    // visible in the owner's view. Board tiles, tilesPool.length and ctx stay public.
    const after = cur.getState();
    // Staged tile is returned to the current player's hand (no tmp tile left on board).
    const tmpOnBoard = Object.values(after.G.tilePositions)
        .filter(p => p && p.gridId === BOARD_GRID_ID && p.tmp);
    expect(tmpOnBoard.length).toBe(0);
    expect(after.G.tilePositions[tiles[0]].gridId).toBe(HAND_GRID_ID);
    expect(after.G.tilePositions[tiles[0]].playerID).toBe(current);
    // A penalty tile was drawn (firstMoveDone false => exactly one): the pool shrank by
    // one and the forfeiting player now holds 4 tiles (3 staged-back + 1 penalty).
    expect(after.G.tilesPool.length).toBe(poolLenBefore - 1);
    expect(handTiles(after.G, current).length).toBe(4);
    // Turn advanced.
    expect(after.ctx.currentPlayer).not.toBe(current);
});

test('forfeitTurn by a non-current player is INVALID_MOVE and changes nothing', () => {
    const {c0, current, other} = startPlay('m-forfeit-noncurrent');

    const before = c0.getState();
    const tilesBefore = _.cloneDeep(before.G.tilePositions);
    const poolLenBefore = before.G.tilesPool.length;

    other.moves.forfeitTurn();

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(tilesBefore);
    expect(after.G.tilesPool.length).toBe(poolLenBefore);
    expect(after.ctx.currentPlayer).toBe(current); // turn did NOT advance
});
