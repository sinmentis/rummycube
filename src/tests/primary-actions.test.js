import React from 'react';
import {render, screen} from '@testing-library/react';

// T5 (WS-C): visual hierarchy of the turn controls. Draw / Submit meld / End are
// the dominant PRIMARY actions (.primary-action); Sort: runs / Sort: colours are
// demoted to SECONDARY (.secondary-action). This test pins the class wiring and
// guards the colour-blind-safe Submit channel (end-valid/end-invalid + ✓/✕) plus
// the existing disabled logic, none of which T5 may change.

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

// Drive the two validity predicates that gate the staged/submit state without
// having to hand-build a real valid board layout. Everything else stays real.
let mockHasNewTiles = false;
let mockSubmitAccepted = false;
jest.mock('../rummikub/moveValidation', () => {
    const actual = jest.requireActual('../rummikub/moveValidation');
    return {
        ...actual,
        isBoardHasNewTiles: () => mockHasNewTiles,
        isSubmitAccepted: () => mockSubmitAccepted,
    };
});

import Board from '../rummikub/components/Board';

function renderBoard({
    currentPlayer = '0',
    tilesPool = ['a', 'b'],
    hasNewTiles = false,
    submitAccepted = false,
} = {}) {
    mockHasNewTiles = hasNewTiles;
    mockSubmitAccepted = submitAccepted;
    const G = {
        tilePositions: {},
        tilesPool,
        gameStateStack: [],
        redoMoveStack: [],
        recentlyDrawnTiles: [],
        lastPlay: null,
        lastTimeout: null,
        timerExpireAt: null,
        timePerTurn: 30,
        handCounts: {'0': 14, '1': 14},
        firstMoveDone: [true, true],
    };
    const ctx = {phase: 'play', currentPlayer, numPlayers: 2, gameover: null};
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

describe('Primary/secondary action button hierarchy (WS-C)', () => {
    test('Draw is a primary action on your turn', () => {
        renderBoard({hasNewTiles: false, tilesPool: ['a', 'b']});
        const draw = screen.getByRole('button', {name: /draw/i});
        expect(draw).toHaveClass('rummikub-button', 'primary-action');
    });

    test('End (pass) is a primary action when the pool is empty and nothing is staged', () => {
        renderBoard({hasNewTiles: false, tilesPool: []});
        const end = screen.getByRole('button', {name: /^end$/i});
        expect(end).toHaveClass('rummikub-button', 'primary-action');
    });

    test('Submit meld is a primary action and keeps the valid ✓ channel', () => {
        renderBoard({hasNewTiles: true, submitAccepted: true});
        const submit = screen.getByRole('button', {name: /submit meld/i});
        expect(submit).toHaveClass('rummikub-button', 'primary-action', 'end-valid');
        expect(submit).not.toHaveClass('end-invalid');
        expect(submit.textContent).toContain('✓');
    });

    test('Submit meld is a primary action and keeps the invalid ✕ channel', () => {
        renderBoard({hasNewTiles: true, submitAccepted: false});
        const submit = screen.getByRole('button', {name: /submit meld/i});
        expect(submit).toHaveClass('rummikub-button', 'primary-action', 'end-invalid');
        expect(submit).not.toHaveClass('end-valid');
        expect(submit.textContent).toContain('✕');
    });

    test('Sort: runs and Sort: colours are secondary actions', () => {
        renderBoard();
        expect(screen.getByRole('button', {name: /sort: runs/i}))
            .toHaveClass('rummikub-button', 'secondary-action');
        expect(screen.getByRole('button', {name: /sort: colours/i}))
            .toHaveClass('rummikub-button', 'secondary-action');
    });

    test('does not regress disabled logic: Draw is disabled when it is not your turn', () => {
        renderBoard({currentPlayer: '1'});
        expect(screen.getByRole('button', {name: /draw/i})).toBeDisabled();
    });

    test('does not regress draw behavior: Draw is enabled on your turn', () => {
        renderBoard({currentPlayer: '0'});
        expect(screen.getByRole('button', {name: /draw/i})).toBeEnabled();
    });
});
