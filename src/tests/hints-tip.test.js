import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';

// T9 (WS-H): the FIRST time a player flips the 💡 Hints toggle from off->on, a
// one-time, non-blocking tooltip explains what the highlights mean. A persisted
// flag (rummycube:hintsTipSeen) and a "Got it" dismiss keep it from reappearing.
// Reuses the coach-card Board mount harness, but with the first move already done
// so the first-turn coach card (which carries its own "Got it") is never shown.

jest.mock('../rummikub/components/GridContainer', () => {
    return function GridContainerMock(props) {
        return <div data-testid={`grid-${props.gridId}`}/>;
    };
});
jest.mock('../rummikub/sound/sfx', () => ({
    play: () => {}, place: () => {}, milestone: () => {}, buzz: () => {},
}));
jest.mock('../rummikub/juice/effects', () => ({
    celebrateGroups: () => {}, burstAt: () => {}, kick: () => {}, flash: () => {},
    floatText: () => {},
}));
jest.mock('../rummikub/components/ChatPanel', () => () => <div/>);

import Board from '../rummikub/components/Board';

const HINTS_TIP_KEY = 'rummycube:hintsTipSeen';
const TIP_COPY = 'These highlight tiles you can add to a group already on the table. You still need your 30-point opening meld first.';

function renderBoard() {
    const G = {
        tilePositions: {},
        tilesPool: ['a', 'b'],
        gameStateStack: [],
        redoMoveStack: [],
        recentlyDrawnTiles: [],
        lastPlay: null,
        timerExpireAt: null,
        timePerTurn: 30,
        handCounts: {'0': 14, '1': 14},
        firstMoveDone: [true, true],
    };
    const ctx = {phase: 'play', currentPlayer: '0', numPlayers: 2, gameover: null};
    const matchData = [
        {id: 0, name: 'Alice', isConnected: true},
        {id: 1, name: 'Bob', isConnected: true},
    ];
    return render(
        <Board
            G={G}
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

describe('First-Hints-enable one-time tooltip', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('first off->on flip shows the tooltip and persists the seen flag', () => {
        renderBoard();
        // Nothing before the toggle is ever pressed.
        expect(screen.queryByText(TIP_COPY)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: /show hints/i}));

        expect(screen.getByText(TIP_COPY)).toBeInTheDocument();
        expect(localStorage.getItem(HINTS_TIP_KEY)).toBe('1');
    });

    test('with the seen flag already set, flipping hints on shows no tooltip', () => {
        localStorage.setItem(HINTS_TIP_KEY, '1');
        renderBoard();

        fireEvent.click(screen.getByRole('button', {name: /show hints/i}));

        expect(screen.queryByText(TIP_COPY)).not.toBeInTheDocument();
    });

    test('clicking "Got it" removes the tooltip', () => {
        renderBoard();
        fireEvent.click(screen.getByRole('button', {name: /show hints/i}));
        expect(screen.getByText(TIP_COPY)).toBeInTheDocument();

        fireEvent.click(screen.getByText('Got it'));

        expect(screen.queryByText(TIP_COPY)).not.toBeInTheDocument();
    });
});
