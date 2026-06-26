import React from 'react';
import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {makeMatch} from "./__helpers__/makeMatch";
import {Client} from 'boardgame.io/client';
import {buildTileObj, getTiles} from "../rummikub/util";
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from "../rummikub/constants";
import {Local} from "boardgame.io/multiplayer";
import {onPlayPhaseBegin} from "../rummikub/turn";
import GameOverModal from '../rummikub/components/GameOverModal';

const red4 = buildTileObj(4, COLOR.red, 0);
const red5 = buildTileObj(5, COLOR.red, 0);
const red6 = buildTileObj(6, COLOR.red, 0);

// ---- Layer (a): server-authoritative data flow on a real win ----------------
test('server builds gameover.highlights from this-game stats when a player clears their hand', () => {
    const tilePositions = {};
    tilePositions[red4] = {id: red4, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    tilePositions[red5] = {id: red5, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    tilePositions[red6] = {id: red6, col: 2, row: 0, gridId: HAND_GRID_ID, playerID: "0"};
    tilePositions[11] = {id: 11, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: "1"};
    const game = makeMatch({
        timePerTurn: 60, tilesPool: getTiles(), tilePositions,
        prevTilePositions: tilePositions, firstMoveDone: [true, true],
        gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [], lastPlay: null,
        // Start the game clock 3s in the past so clearSeconds reflects elapsed time, not 0.
        startedAt: Date.now() - 3000,
        stats: {bestCombo: 0, longestRun: 0},
    });
    const spec = {game, multiplayer: Local()};
    const c0 = Client({...spec, playerID: "0", debug: false});
    const c1 = Client({...spec, playerID: "1", debug: false});
    c0.start();
    c1.start();
    c0.events.endPhase();
    c1.events.endPhase();

    // Player 0 melds the whole hand as one run, emptying it -> checkGameOver -> endGame.
    c0.moves.moveTiles(0, 0, BOARD_GRID_ID, {id: red4}, [red4, red5, red6]);
    c0.moves.endTurn();

    const state = c0.getState();

    // Per-game stats accumulated server-side during the winning play.
    expect(state.G.stats).toBeTruthy();
    expect(state.G.stats.bestCombo).toBe(3);   // 1 group formed * W_GROUP(3)
    expect(state.G.stats.longestRun).toBe(3);  // red4,red5,red6

    // The game is over and the server attached highlights to the gameover payload.
    const {gameover} = state.ctx;
    expect(gameover).toBeTruthy();
    expect(gameover.winner).toBe('0');
    expect(gameover.highlights).toBeTruthy();
    // bestCombo mirrors the manipulation score of that play (recorded in G.lastPlay).
    expect(gameover.highlights.bestCombo).toBe(state.G.lastPlay.manipulation);
    expect(gameover.highlights.bestCombo).toBe(3);
    expect(gameover.highlights.longestRun).toBe(3);
    expect(Number.isFinite(gameover.highlights.clearSeconds)).toBe(true);
    expect(gameover.highlights.clearSeconds).toBeGreaterThanOrEqual(2);
});

// ---- The game clock starts at play-begin, not at match setup ----------------
test('onPlayPhaseBegin stamps the game clock so clear time excludes the lobby wait', () => {
    // setup leaves startedAt null; the clock starts when play actually begins.
    const G = {timePerTurn: 60000, startedAt: null};
    onPlayPhaseBegin({G, ctx: {}});
    expect(typeof G.startedAt).toBe('number');
    expect(G.startedAt).toBeGreaterThan(0);
});

test('onPlayPhaseBegin does not overwrite a start time that is already set', () => {
    const seeded = Date.now() - 5000;
    const G = {timePerTurn: 60000, startedAt: seeded};
    onPlayPhaseBegin({G, ctx: {}});
    expect(G.startedAt).toBe(seeded);
});

// ---- Layer (b): GameOverModal renders highlights + Share --------------------
jest.mock('canvas-confetti', () => () => {});
jest.mock('../rummikub/sound/sfx', () => ({play: () => {}}));

const matchData = [{id: 0, name: 'Al'}, {id: 1, name: 'Bo'}];

test('GameOverModal renders this-game highlights and a Share button', () => {
    const gameover = {winner: '1', points: {0: 5, 1: 40}, highlights: {bestCombo: 7, longestRun: 5, clearSeconds: 134}};
    render(<MemoryRouter><GameOverModal gameover={gameover} matchId="m1" playerID="1" matchData={matchData}/></MemoryRouter>);

    const hl = screen.getByTestId('gameover-highlights');
    expect(hl).toHaveTextContent('Best combo');
    expect(hl).toHaveTextContent('7');
    expect(hl).toHaveTextContent('Longest run');
    expect(hl).toHaveTextContent('5');
    expect(hl).toHaveTextContent('2:14'); // 134s -> m:ss
    expect(screen.getByRole('button', {name: /share/i})).toBeInTheDocument();
});

test('GameOverModal omits the highlights block for a legacy gameover without highlights', () => {
    const gameover = {winner: '1', points: {0: 5, 1: 40}};
    render(<MemoryRouter><GameOverModal gameover={gameover} matchId="m1" playerID="1" matchData={matchData}/></MemoryRouter>);

    expect(screen.queryByTestId('gameover-highlights')).toBeNull();
    expect(screen.queryByRole('button', {name: /share/i})).toBeNull();
    // standings still render (no crash)
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
});
