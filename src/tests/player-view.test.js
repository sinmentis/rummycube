import {playerView, buildTileObj} from "../rummikub/util";
import {BOARD_GRID_ID, HAND_GRID_ID, COLOR} from "../rummikub/constants";

function handPos(id, row, col, playerID) {
    return {id, row, col, gridId: HAND_GRID_ID, playerID};
}

function boardPos(id, row, col) {
    return {id, row, col, gridId: BOARD_GRID_ID, playerID: null};
}

function buildG() {
    const p0a = buildTileObj(5, COLOR.red, 0);
    const p0b = buildTileObj(6, COLOR.red, 0);
    const p1a = buildTileObj(9, COLOR.blue, 0);
    const p1b = buildTileObj(10, COLOR.blue, 0);
    const board1 = buildTileObj(3, COLOR.black, 0);
    const board2 = buildTileObj(4, COLOR.black, 0);

    const tilePositions = {
        [p0a]: handPos(p0a, 0, 0, '0'),
        [p0b]: handPos(p0b, 0, 1, '0'),
        [p1a]: handPos(p1a, 0, 0, '1'),
        [p1b]: handPos(p1b, 0, 1, '1'),
        [board1]: boardPos(board1, 0, 0),
        [board2]: boardPos(board2, 0, 1),
    };

    const pool = [
        buildTileObj(1, COLOR.red, 0),
        buildTileObj(2, COLOR.red, 0),
        buildTileObj(7, COLOR.orange, 1),
    ];

    const G = {
        timePerTurn: 30000,
        timerExpireAt: 12345,
        tilesPool: pool,
        tilePositions,
        prevTilePositions: {...tilePositions},
        firstMoveDone: [false, false],
        gameStateStack: [{
            tilePositions: {...tilePositions},
            prevTilePositions: {...tilePositions},
        }],
        redoMoveStack: [{
            tilePositions: {...tilePositions},
            prevTilePositions: {...tilePositions},
        }],
        recentlyDrawnTiles: [p0a],
        lastPlay: null,
    };

    return {G, ids: {p0a, p0b, p1a, p1b, board1, board2}};
}

const CTX = {numPlayers: 2, currentPlayer: '0'};

test('playerView keeps own hand and all board tiles for player 0', () => {
    const {G, ids} = buildG();
    const view = playerView({G, ctx: CTX, playerID: '0'});

    expect(view.tilePositions).toHaveProperty(String(ids.p0a));
    expect(view.tilePositions).toHaveProperty(String(ids.p0b));
    expect(view.tilePositions).toHaveProperty(String(ids.board1));
    expect(view.tilePositions).toHaveProperty(String(ids.board2));
});

test('playerView hides opponent hand tile entries from tilePositions and prevTilePositions', () => {
    const {G, ids} = buildG();
    const view = playerView({G, ctx: CTX, playerID: '0'});

    expect(view.tilePositions).not.toHaveProperty(String(ids.p1a));
    expect(view.tilePositions).not.toHaveProperty(String(ids.p1b));
    expect(view.prevTilePositions).not.toHaveProperty(String(ids.p1a));
    expect(view.prevTilePositions).not.toHaveProperty(String(ids.p1b));
});

test('playerView sanitizes opponent hand tiles from undo/redo snapshots', () => {
    const {G, ids} = buildG();
    const view = playerView({G, ctx: CTX, playerID: '0'});

    for (const snap of view.gameStateStack) {
        expect(snap.tilePositions).not.toHaveProperty(String(ids.p1a));
        expect(snap.tilePositions).not.toHaveProperty(String(ids.p1b));
        expect(snap.prevTilePositions).not.toHaveProperty(String(ids.p1a));
        expect(snap.tilePositions).toHaveProperty(String(ids.p0a));
    }
    for (const snap of view.redoMoveStack) {
        expect(snap.tilePositions).not.toHaveProperty(String(ids.p1a));
        expect(snap.prevTilePositions).not.toHaveProperty(String(ids.p1b));
    }
});

test('playerView preserves per-seat hand counts', () => {
    const {G} = buildG();
    const view = playerView({G, ctx: CTX, playerID: '0'});

    expect(view.handCounts['0']).toBe(2);
    expect(view.handCounts['1']).toBe(2);
});

test('playerView preserves pool length but hides contents', () => {
    const {G} = buildG();
    const view = playerView({G, ctx: CTX, playerID: '0'});

    expect(view.tilesPool.length).toBe(G.tilesPool.length);
    expect(view.tilesPool).not.toEqual(G.tilesPool);
});

test('playerView preserves stack lengths', () => {
    const {G} = buildG();
    const view = playerView({G, ctx: CTX, playerID: '0'});

    expect(view.gameStateStack.length).toBe(G.gameStateStack.length);
    expect(view.redoMoveStack.length).toBe(G.redoMoveStack.length);
});

test('playerView is pure and does not mutate the input G', () => {
    const {G, ids} = buildG();
    playerView({G, ctx: CTX, playerID: '0'});

    expect(G.tilePositions).toHaveProperty(String(ids.p1a));
    expect(G.tilePositions).toHaveProperty(String(ids.p1b));
    expect(G.tilesPool.length).toBe(3);
    expect(G.tilesPool[0]).not.toBe(0);
    expect(G.handCounts).toBeUndefined();
});

test('playerView strips all hands for spectator (null playerID)', () => {
    const {G, ids} = buildG();
    const view = playerView({G, ctx: CTX, playerID: null});

    expect(view.tilePositions).not.toHaveProperty(String(ids.p0a));
    expect(view.tilePositions).not.toHaveProperty(String(ids.p1a));
    expect(view.tilePositions).toHaveProperty(String(ids.board1));
    expect(view.handCounts['0']).toBe(2);
    expect(view.handCounts['1']).toBe(2);
});

test('playerView keeps player 1 own hand when viewing as player 1', () => {
    const {G, ids} = buildG();
    const view = playerView({G, ctx: CTX, playerID: '1'});

    expect(view.tilePositions).toHaveProperty(String(ids.p1a));
    expect(view.tilePositions).toHaveProperty(String(ids.p1b));
    expect(view.tilePositions).not.toHaveProperty(String(ids.p0a));
    expect(view.tilePositions).not.toHaveProperty(String(ids.p0b));
});
