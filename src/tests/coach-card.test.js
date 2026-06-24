import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';

// S2-U11 / T2-2: the one-time first-turn coach card. On the player's FIRST turn
// of a match (their first move not yet done, their turn, match underway) a small
// dismissible card explains the objective + the >=30 first-meld rule. Dismiss
// writes a localStorage flag so it never reappears on later turns/matches.

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

const COACH_SEEN_KEY = 'rummycube.coachSeen';

function renderBoard({firstMoveDone = [false, false], currentPlayer = '0'} = {}) {
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
        firstMoveDone,
    };
    const ctx = {
        phase: 'play',
        currentPlayer,
        numPlayers: 2,
        gameover: null,
    };
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

describe('First-turn coach card', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('shows the >=30 rule on the first turn when no flag is set', () => {
        renderBoard();
        expect(screen.getByText(/30/)).toBeInTheDocument();
    });

    test('dismiss sets the localStorage flag and removes the card', () => {
        renderBoard();
        const card = screen.getByText(/30/);
        expect(card).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: /got it/i}));
        expect(localStorage.getItem(COACH_SEEN_KEY)).toBe('1');
        expect(screen.queryByText(/30/)).not.toBeInTheDocument();
    });

    test('is not shown when the flag is already set', () => {
        localStorage.setItem(COACH_SEEN_KEY, '1');
        renderBoard();
        expect(screen.queryByText(/30/)).not.toBeInTheDocument();
    });

    test('is not shown once the first move is done', () => {
        renderBoard({firstMoveDone: [true, true]});
        expect(screen.queryByText(/first meld/i)).not.toBeInTheDocument();
    });

    test('is not shown when it is not the player turn', () => {
        renderBoard({currentPlayer: '1'});
        expect(screen.queryByText(/first meld/i)).not.toBeInTheDocument();
    });
});
