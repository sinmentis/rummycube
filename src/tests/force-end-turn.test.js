import {makeMatch} from "./__helpers__/makeMatch";
import {Client} from 'boardgame.io/client';
import {buildTileObj, getTiles} from "../rummikub/util";
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";

const red4 = buildTileObj(4, COLOR.red, 0);
const red5 = buildTileObj(5, COLOR.red, 0);
const red6 = buildTileObj(6, COLOR.red, 0);

function makeGame(timePerTurn, opts = {}) {
    const tilePositions = opts.tilePositions ?? {
        43: {id: 43, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"},
        11: {id: 11, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"},
    };
    const firstMoveDone = opts.firstMoveDone ?? [false, false];
    return makeMatch({
        timePerTurn,
        timerExpireAt: null,
        tilesPool: getTiles(),
        tilePositions,
        prevTilePositions: tilePositions,
        firstMoveDone,
        gameStateStack: [],
        redoMoveStack: [],
        lastCircle: [],
        recentlyDrawnTiles: [],
        lastPlay: null,
        lastTimeout: null,
    });
}

function startPlay(timePerTurn, matchID, opts = {}) {
    const spec = {game: makeGame(timePerTurn, opts), multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0", matchID});
    const c1 = Client({...spec, playerID: "1", matchID});
    c0.start();
    c1.start();
    c0.events.endPhase(); // playersJoin -> play; onTurnBegin sets timerExpireAt = now + timePerTurn
    return {c0, c1};
}

test('forceEndTurn ends an expired turn when called by a non-current player', () => {
    // negative timePerTurn => deadline is already in the past
    const {c0, c1} = startPlay(-100000, 'm-expired');
    const before = c0.getState().ctx.currentPlayer;
    const nonCurrent = before === '0' ? c1 : c0; // a player who is NOT the current one
    nonCurrent.moves.forceEndTurn();
    expect(c0.getState().ctx.currentPlayer).not.toBe(before); // turn advanced
});

test('forceEndTurn is rejected before the deadline passes', () => {
    // large timePerTurn => deadline far in the future
    const {c0, c1} = startPlay(100000, 'm-fresh');
    const before = c0.getState().ctx.currentPlayer;
    const nonCurrent = before === '0' ? c1 : c0;
    nonCurrent.moves.forceEndTurn(); // deadline not reached -> INVALID_MOVE, no-op
    expect(c0.getState().ctx.currentPlayer).toBe(before); // unchanged
    // anti-cheat: nothing is written to G.lastTimeout before the real deadline
    expect(c0.getState().G.lastTimeout).toBeNull();
});

test('forceEndTurn records a server-authoritative G.lastTimeout on an expired clean-board timeout', () => {
    const {c0, c1} = startPlay(-100000, 'm-timeout-draw1');
    const before = c0.getState().ctx.currentPlayer;
    const currentClient = before === '0' ? c0 : c1; // the timed-out player
    const otherClient = before === '0' ? c1 : c0;   // the opponent who force-ends
    const turnAtTimeout = currentClient.getState().ctx.turn;

    otherClient.moves.forceEndTurn();

    // every client sees the announcement: read it from the timed-out player's client
    const G = currentClient.getState().G;
    // clean board before the first meld => drawTile pulls exactly one penalty tile
    expect(G.lastTimeout).toEqual({seat: Number(before), drawCount: 1, id: turnAtTimeout});
});

test('forceEndTurn records drawCount 1 even once the timed-out player has made their first meld (standard draw-1)', () => {
    const {c0, c1} = startPlay(-100000, 'm-timeout-draw2', {firstMoveDone: [true, true]});
    const before = c0.getState().ctx.currentPlayer;
    const currentClient = before === '0' ? c0 : c1;
    const otherClient = before === '0' ? c1 : c0;
    const turnAtTimeout = currentClient.getState().ctx.turn;

    otherClient.moves.forceEndTurn();

    const G = currentClient.getState().G;
    // standard Rummikub draws exactly one tile, before and after the first meld
    expect(G.lastTimeout).toEqual({seat: Number(before), drawCount: 1, id: turnAtTimeout});
});

test('forceEndTurn records drawCount 0 when the timed-out player has a valid staged meld', () => {
    const stagedHand = {
        [red4]: {id: red4, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"},
        [red5]: {id: red5, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "1"},
        [red6]: {id: red6, col: 2, row: 0, gridId: HAND_GRID_ID, playerID: "1"},
        43: {id: 43, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"},
    };
    const {c0, c1} = startPlay(-100000, 'm-timeout-draw0', {
        firstMoveDone: [true, true],
        tilePositions: stagedHand,
    });
    const before = c0.getState().ctx.currentPlayer;
    expect(before).toBe('1'); // current player holds the run
    const turnAtTimeout = c1.getState().ctx.turn;

    // current player stages a valid run; the opponent then force-ends the expired turn
    c1.moves.moveTiles(0, 0, BOARD_GRID_ID, {id: red4}, [red4, red5, red6]);
    const poolBefore = c1.getState().G.tilesPool.length;
    c0.moves.forceEndTurn();

    const G = c0.getState().G;
    // a valid submit is kept (applyValidMove), so there is no penalty draw
    expect(G.lastTimeout).toEqual({seat: 1, drawCount: 0, id: turnAtTimeout});
    expect(G.tilesPool.length).toBe(poolBefore);
    expect(G.lastPlay).toBeTruthy();
    expect(G.lastPlay.seat).toBe('1');
});

test('G.lastTimeout survives the timeout turn and is cleared one full turn later', () => {
    const {c0, c1} = startPlay(-100000, 'm-timeout-clear');
    const before = c0.getState().ctx.currentPlayer;
    const currentClient = before === '0' ? c0 : c1;
    const otherClient = before === '0' ? c1 : c0;
    const turnAtTimeout = currentClient.getState().ctx.turn;

    otherClient.moves.forceEndTurn();

    // still the announced turn (next onTurnBegin ran in the same update): must be non-null
    const mid = c0.getState();
    expect(mid.ctx.turn).toBe(turnAtTimeout + 1);
    expect(mid.G.lastTimeout).toEqual({seat: Number(before), drawCount: 1, id: turnAtTimeout});

    // drive one more full turn; the staleness guard (id <= ctx.turn - 2) then clears it
    const nextCurrent = mid.ctx.currentPlayer === '0' ? c0 : c1;
    nextCurrent.moves.endTurn();

    const after = c0.getState();
    expect(after.ctx.turn).toBe(turnAtTimeout + 2);
    expect(after.G.lastTimeout).toBeNull();
});
