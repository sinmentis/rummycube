import React from 'react';
import {render, screen} from '@testing-library/react';

// Standard Rummikub draws exactly ONE tile (before and after the first meld
// alike), so the Draw button always reads plain "Draw" — no "×2". This guards
// against the reverted draw-2 label reappearing.

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

describe('Draw button draw-count label', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('reads plain "Draw" after the first meld (standard draw-1, no ×2)', () => {
        renderBoard({firstMoveDone: [true, false]});
        expect(screen.getByRole('button', {name: /draw/i})).toHaveTextContent(/^draw$/i);
    });

    test('reads plain "Draw" before the first meld', () => {
        renderBoard({firstMoveDone: [false, false]});
        expect(screen.getByRole('button', {name: /draw/i})).toHaveTextContent(/^draw$/i);
    });
});
