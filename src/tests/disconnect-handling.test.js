import {makeMatch} from "./__helpers__/makeMatch";
import {Client} from 'boardgame.io/client';
import {getTiles} from "../rummikub/util";
import {HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";
import {GRACE_MS, N_FORFEIT_TURNS} from "../rummikub/moves";

// A long turn so we can tell a collapsed (grace) deadline apart from a full one.
const TIME_PER_TURN_MS = 100000;

function makeGame() {
    const tilePositions = {
        43: {id: 43, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"},
        44: {id: 44, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "0"},
        11: {id: 11, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"},
        12: {id: 12, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "1"},
    };
    return makeMatch({
        timePerTurn: TIME_PER_TURN_MS,
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
    });
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
    return {c0, c1, current, cur, other};
}

function clientOf(c0, c1, seat) {
    return seat === "0" ? c0 : c1;
}

test('onTurnBegin keeps the full turn budget for a connected seat', () => {
    const {c0, current} = startPlay('m-conn-full');
    const G = c0.getState().G;
    const remaining = G.timerExpireAt - Date.now();
    // Connected seat gets ~timePerTurn (allow scheduling slack).
    expect(remaining).toBeGreaterThan(TIME_PER_TURN_MS - 10000);
    expect(G.connected[Number(current)]).toBe(true);
});

test('onTurnBegin collapses the deadline to the grace window for a disconnected seat', () => {
    const {c0, c1, current, cur, other} = startPlay('m-conn-grace');

    // Server-authoritative mirror: the disconnected seat marks itself offline.
    cur.moves._setConnection(false);
    expect(c0.getState().G.connected[Number(current)]).toBe(false);

    // Cycle a full round so onTurnBegin runs again for the disconnected seat.
    cur.moves.endTurn();     // -> other's turn
    other.moves.endTurn();   // -> back to the disconnected seat

    const G = c0.getState().G;
    expect(G.ctx?.currentPlayer ?? c0.getState().ctx.currentPlayer).toBe(current);
    const remaining = G.timerExpireAt - Date.now();
    // Grace is far smaller than a full turn.
    expect(remaining).toBeLessThanOrEqual(GRACE_MS + 1000);
    expect(remaining).toBeLessThan(TIME_PER_TURN_MS / 2);
    expect(G.disconnectTurns[Number(current)]).toBe(1);
});

test('_setConnection only writes the caller seat, never another seat', () => {
    const {c0, current, cur} = startPlay('m-conn-scope');
    const other = current === "0" ? "1" : "0";
    // The current player tries to mark itself offline; it must not touch the other seat.
    cur.moves._setConnection(false);
    const G = c0.getState().G;
    expect(G.connected[Number(current)]).toBe(false);
    expect(G.connected[Number(other)]).toBe(true);
});

test('reconnect resets the disconnect counter', () => {
    const {c0, current, cur, other} = startPlay('m-conn-reset');

    cur.moves._setConnection(false);
    cur.moves.endTurn();
    other.moves.endTurn();   // disconnected seat begins a turn: disconnectTurns = 1
    expect(c0.getState().G.disconnectTurns[Number(current)]).toBe(1);

    // Reconnect: counter resets immediately.
    cur.moves._setConnection(true);
    expect(c0.getState().G.disconnectTurns[Number(current)]).toBe(0);
    expect(c0.getState().G.connected[Number(current)]).toBe(true);
});

test('a seat is forfeited after N disconnected turns and the survivor wins', () => {
    const {c0, c1, current, cur, other} = startPlay('m-conn-forfeit');
    const otherSeat = current === "0" ? "1" : "0";

    cur.moves._setConnection(false);

    // Drive the disconnected seat through N_FORFEIT_TURNS turn-begins. Each loop:
    // disconnected seat ends its turn, the survivor ends theirs, control returns.
    for (let i = 0; i < N_FORFEIT_TURNS; i++) {
        const state = c0.getState();
        if (state.ctx.gameover) break;
        const curSeat = state.ctx.currentPlayer;
        if (curSeat === current) {
            clientOf(c0, c1, current).moves.endTurn();
            const next = c0.getState();
            if (!next.ctx.gameover && next.ctx.currentPlayer === otherSeat) {
                clientOf(c0, c1, otherSeat).moves.endTurn();
            }
        } else {
            clientOf(c0, c1, otherSeat).moves.endTurn();
        }
    }

    const after = c0.getState();
    expect(after.G.forfeited[Number(current)]).toBe(true);
    // Two-player match: forfeiting one leaves a single survivor, so the game ends.
    expect(after.ctx.gameover).toBeDefined();
    expect(after.ctx.gameover.winner).toBe(otherSeat);
});
