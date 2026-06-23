import {Rummikub} from "../rummikub/Game";
import {Client} from 'boardgame.io/client';
import {getTiles} from "../rummikub/util";
import {BOARD_GRID_ID, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";
import _ from "lodash";

// 43,44,45 and 11,12,13 each form a valid set worth >= 30 points (a legal first move).
const TRIPLE = {"0": [43, 44, 45], "1": [11, 12, 13]};

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
            timePerTurn: 100000,
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
    return {c0, c1, current, cur, tiles: TRIPLE[current]};
}

function handTiles(G, playerID) {
    return Object.values(G.tilePositions)
        .filter(p => p && p.gridId === HAND_GRID_ID && p.playerID === playerID);
}

test('submitMeld on an INVALID board is a no-op (no rollback, no penalty draw, no endTurn)', () => {
    const {c0, current, cur, tiles} = startPlay('m-invalid');

    // Stage a single tile on the board: present (isBoardHasNewTiles) but not a valid group.
    cur.moves.moveTiles(0, 0, BOARD_GRID_ID, {id: tiles[0]}, [tiles[0]]);

    const before = c0.getState();
    const tilesBefore = _.cloneDeep(before.G.tilePositions);
    const handSizeBefore = handTiles(before.G, current).length;
    const poolLenBefore = before.G.tilesPool.length;

    cur.moves.submitMeld();

    const after = c0.getState();
    expect(after.G.tilePositions).toEqual(tilesBefore); // no rollback, tiles stay in place
    expect(handTiles(after.G, current).length).toBe(handSizeBefore); // no tile added to hand
    expect(after.G.tilesPool.length).toBe(poolLenBefore); // no penalty draw
    expect(after.ctx.currentPlayer).toBe(current); // turn did NOT end
    expect(after.G.lastPlay).toBeNull();
});

test('submitMeld on a VALID board freezes tiles, sets lastPlay, and advances the turn', () => {
    const {c0, current, cur, tiles} = startPlay('m-valid');

    // Stage a valid set as tmp tiles on the board.
    cur.moves.moveTiles(0, 0, BOARD_GRID_ID, {id: tiles[0]}, tiles);

    const staged = c0.getState().G.tilePositions;
    expect(tiles.every(id => staged[id].gridId === BOARD_GRID_ID && staged[id].tmp)).toBe(true);

    cur.moves.submitMeld();

    const after = c0.getState();
    // tmp tiles become frozen (tmp:false)
    expect(tiles.every(id => after.G.tilePositions[id].tmp === false)).toBe(true);
    expect(after.G.lastPlay).not.toBeNull();
    expect(after.G.lastPlay.seat).toBe(current);
    expect(after.ctx.currentPlayer).not.toBe(current); // turn advanced
});
