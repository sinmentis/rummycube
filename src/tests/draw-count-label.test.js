import React from 'react';
import {render, screen} from '@testing-library/react';

// R5b-T5: the Draw button must surface the hidden draw-2 rule. The server draws
// 2 tiles once G.firstMoveDone[currentPlayer] is true (moves.js: i<(firstMoveDone?2:1)),
// but the UI never said so. This DISPLAY-ONLY label reads "Draw ×2" after your
// first meld and plain "Draw" before it. Reuses the coach-card real-Board harness.

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

    test('shows ×2 after the first meld is done', () => {
        renderBoard({firstMoveDone: [true, false]});
        expect(screen.getByRole('button', {name: /draw/i})).toHaveTextContent(/draw\s*[×x]\s*2/i);
    });

    test('shows plain "Draw" before the first meld', () => {
        renderBoard({firstMoveDone: [false, false]});
        expect(screen.getByRole('button', {name: /draw/i})).toHaveTextContent(/^draw$/i);
    });
});
