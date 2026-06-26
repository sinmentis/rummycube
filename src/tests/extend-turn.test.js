import {Rummikub} from "../rummikub/Game";
import {Client} from 'boardgame.io/client';
import {getTiles} from "../rummikub/util";
import {HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";

// extendTurn adds a fixed +15s to the server-authoritative deadline.
const EXTEND_MS = 15000;

// A roomy timePerTurn so the deadline stays well in the future across the test
// (extendTurn only ever moves it forward; it must never auto-expire here).
function makeGame(timePerTurn = 100000) {
    // NOTE: setup intentionally omits turnExtended so the test also exercises the
    // onTurnBegin defensive default (old matches / fixtures without the field).
    const tilePositions = {
        43: {id: 43, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"},
        11: {id: 11, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"},
    };
    return {
        ...Rummikub,
        setup: () => ({
            timePerTurn,
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
            lastTimeout: null,
        }),
    };
}

function startPlay(timePerTurn = 100000) {
    const spec = {game: makeGame(timePerTurn), multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0"});
    const c1 = Client({...spec, playerID: "1"});
    c0.start();
    c1.start();
    c0.events.endPhase(); // playersJoin -> play; onTurnBegin sets timerExpireAt = now + timePerTurn
    c1.events.endPhase();
    return {c0, c1};
}

test('the current player can extend their turn once, adding a fixed amount to the deadline', () => {
    const {c0} = startPlay();
    expect(c0.getState().ctx.currentPlayer).toBe("0");
    const before = c0.getState().G.timerExpireAt;
    expect(typeof before).toBe('number');

    c0.moves.extendTurn();

    const {G} = c0.getState();
    expect(G.timerExpireAt).toBe(before + EXTEND_MS);
    expect(G.turnExtended[0]).toBe(true);
});

test('a second extend in the same turn is a no-op', () => {
    const {c0} = startPlay();
    const before = c0.getState().G.timerExpireAt;

    c0.moves.extendTurn();
    const afterFirst = c0.getState().G.timerExpireAt;
    expect(afterFirst).toBe(before + EXTEND_MS);

    c0.moves.extendTurn(); // already extended this turn -> INVALID_MOVE, discard draft

    expect(c0.getState().G.timerExpireAt).toBe(afterFirst); // no further increase
    expect(c0.getState().G.turnExtended[0]).toBe(true);
});

test('a non-current player cannot extend the turn', () => {
    const {c0, c1} = startPlay();
    expect(c0.getState().ctx.currentPlayer).toBe("0");
    const before = c0.getState().G.timerExpireAt;

    c1.moves.extendTurn(); // seat 1 is not the current player -> INVALID_MOVE

    expect(c0.getState().G.timerExpireAt).toBe(before); // unchanged
    expect(c0.getState().G.turnExtended[1]).toBeFalsy(); // never set
});

test('the per-turn extend flag resets when the seat starts a new turn', () => {
    const {c0, c1} = startPlay();
    expect(c0.getState().ctx.currentPlayer).toBe("0");

    c0.moves.extendTurn();
    expect(c0.getState().G.turnExtended[0]).toBe(true);

    // Drive a full circle back to seat 0; its onTurnBegin clears turnExtended[0].
    c0.moves.endTurn();
    expect(c0.getState().ctx.currentPlayer).toBe("1");
    c1.moves.endTurn();
    expect(c0.getState().ctx.currentPlayer).toBe("0");
    expect(c0.getState().G.turnExtended[0]).toBe(false);

    // The fresh turn can be extended again.
    const before = c0.getState().G.timerExpireAt;
    c0.moves.extendTurn();
    expect(c0.getState().G.timerExpireAt).toBe(before + EXTEND_MS);
    expect(c0.getState().G.turnExtended[0]).toBe(true);
});
