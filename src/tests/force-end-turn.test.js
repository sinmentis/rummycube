import {Rummikub} from "../rummikub/Game";
import {Client} from 'boardgame.io/client';
import {getTiles} from "../rummikub/util";
import {HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";

function makeGame(timePerTurn) {
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
        }),
    };
}

function startPlay(timePerTurn, matchID) {
    const spec = {game: makeGame(timePerTurn), multiplayer: Local()};
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
});
