import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import {buildTileObj} from '../rummikub/util';
import {COLOR, BOARD_GRID_ID, HAND_GRID_ID} from '../rummikub/constants';

// T4 (WS-B): the playable-tile assist (rack markers + count pill) is opt-in.
// It is OFF by default and only turns on when the '💡' toggle is pressed (or the
// localStorage flag is already set). This reuses the coach-card Board-mount
// harness, but keeps the REAL GridContainer so the actual `.tile-playable`
// markers render — the whole point of the test is that they appear/disappear.

jest.mock('../rummikub/sound/sfx', () => ({
    play: () => {}, place: () => {}, milestone: () => {}, buzz: () => {},
}));
jest.mock('../rummikub/juice/effects', () => ({
    celebrateGroups: () => {}, burstAt: () => {}, kick: () => {}, flash: () => {},
    floatText: () => {},
}));
jest.mock('../rummikub/components/ChatPanel', () => () => <div/>);

import Board from '../rummikub/components/Board';

const HINTS_KEY = 'rummycube:hintsOn';
const blue = (v) => buildTileObj(v, COLOR.blue, 0);

// A valid blue 5-6-7 run on the board, with blue 4 in the viewer's hand — that
// hand tile extends the run, so it is "playable" and should carry the marker
// once hints are on (see planning.js / playable-tiles.test.js). With
// `secondPlayable`, blue 8 is also in hand and extends the run above, so two
// tiles are playable — exercising the pill's plural copy.
function makeG({secondPlayable = false} = {}) {
    const tilePositions = {
        [blue(5)]: {gridId: BOARD_GRID_ID, row: 0, col: 0},
        [blue(6)]: {gridId: BOARD_GRID_ID, row: 0, col: 1},
        [blue(7)]: {gridId: BOARD_GRID_ID, row: 0, col: 2},
        [blue(4)]: {gridId: HAND_GRID_ID, playerID: '0', row: 0, col: 0},
    };
    if (secondPlayable) {
        tilePositions[blue(8)] = {gridId: HAND_GRID_ID, playerID: '0', row: 0, col: 1};
    }
    return {
        tilePositions,
        tilesPool: ['x', 'y'],
        gameStateStack: [],
        redoMoveStack: [],
        recentlyDrawnTiles: [],
        lastPlay: null,
        timerExpireAt: null,
        timePerTurn: 30,
        handCounts: {'0': secondPlayable ? 2 : 1, '1': 14},
        firstMoveDone: [true, true],
    };
}

function renderBoard(opts = {}) {
    const ctx = {phase: 'play', currentPlayer: '0', numPlayers: 2, gameover: null};
    const matchData = [
        {id: 0, name: 'Alice', isConnected: true},
        {id: 1, name: 'Bob', isConnected: true},
    ];
    return render(
        <Board
            G={makeG(opts)}
            ctx={ctx}
            moves={{}}
            playerID={'0'}
            matchData={matchData}
            matchID={'m1'}
            events={{endPhase: jest.fn()}}
            chatMessages={[]}
            sendChatMessage={() => {}}
        />
    );
}

describe('Opt-in playable-tile hints', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('with no stored flag, no rack markers and no pill even when a tile is playable', () => {
        const {container} = renderBoard();
        expect(container.querySelector('.playable-hint')).toBeNull();
        expect(container.querySelector('.tile-playable')).toBeNull();
        // The toggle is offered, in its "off" state.
        const toggle = screen.getByRole('button', {name: /show hints/i});
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    test('clicking the toggle reveals the markers + pill and persists the flag', () => {
        const {container} = renderBoard();
        const toggle = screen.getByRole('button', {name: /show hints/i});
        expect(toggle).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(toggle);

        expect(container.querySelector('.tile-playable')).not.toBeNull();
        const pill = container.querySelector('.playable-hint');
        expect(pill).not.toBeNull();
        // Exactly one tile is playable here -> singular copy.
        expect(pill).toHaveTextContent('💡 1 tile fits the table');
        expect(localStorage.getItem(HINTS_KEY)).toBe('1');
        // The toggle now reads as pressed/on.
        expect(screen.getByRole('button', {name: /hints on/i}))
            .toHaveAttribute('aria-pressed', 'true');
    });

    test('the pill pluralizes the count: singular for one, plural for many', () => {
        localStorage.setItem(HINTS_KEY, '1');

        const single = renderBoard();
        const singlePill = single.container.querySelector('.playable-hint');
        expect(singlePill).toHaveTextContent('💡 1 tile fits the table');
        expect(singlePill).not.toHaveTextContent(/tiles fit/i);
        single.unmount();

        const many = renderBoard({secondPlayable: true});
        const manyPill = many.container.querySelector('.playable-hint');
        expect(manyPill).toHaveTextContent('💡 2 tiles fit the table');
    });

    test('with the flag already set, hints are on at mount', () => {
        localStorage.setItem(HINTS_KEY, '1');
        const {container} = renderBoard();
        expect(container.querySelector('.tile-playable')).not.toBeNull();
        expect(container.querySelector('.playable-hint')).not.toBeNull();
        expect(screen.getByRole('button', {name: /hints on/i}))
            .toHaveAttribute('aria-pressed', 'true');
    });
});
