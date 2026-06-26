import React from 'react';
import {render, screen, fireEvent, cleanup} from '@testing-library/react';

import IconButton from '../rummikub/components/IconButton';

// T6 (WS-D): the text Undo/Redo buttons become ↶/↷ icon buttons and move OUT of
// the controls row into a corner .rack-tools cluster (top-right of the rack,
// mirroring the avatar). The glyph's direction is the colour-blind-safe channel;
// the accessible name comes from aria-label + title. The disabled conditions
// reuse the existing canUndo/canRedo booleans (same source as the keyboard
// shortcuts) and must not change.

afterEach(cleanup);

describe('IconButton (WS-D)', () => {
    test('renders a type=button with the glyph, accessible name, and tooltip', () => {
        render(<IconButton glyph="↶" label="Undo" onClick={() => {}} disabled={false}/>);
        const btn = screen.getByRole('button', {name: 'Undo'});
        expect(btn).toHaveClass('icon-button');
        expect(btn).toHaveAttribute('type', 'button');
        expect(btn).toHaveAttribute('title', 'Undo');
        expect(btn.textContent).toBe('↶');
        expect(btn).toBeEnabled();
    });

    test('the glyph span is aria-hidden so the name is the label only', () => {
        render(<IconButton glyph="↷" label="Redo" onClick={() => {}} disabled={false}/>);
        const btn = screen.getByRole('button', {name: 'Redo'});
        const span = btn.querySelector('span');
        expect(span).toHaveAttribute('aria-hidden', 'true');
        expect(span.textContent).toBe('↷');
    });

    test('reflects the disabled prop and swallows clicks while disabled', () => {
        const onClick = jest.fn();
        render(<IconButton glyph="↶" label="Undo" onClick={onClick} disabled={true}/>);
        const btn = screen.getByRole('button', {name: 'Undo'});
        expect(btn).toBeDisabled();
        fireEvent.click(btn);
        expect(onClick).not.toHaveBeenCalled();
    });

    test('fires onClick when enabled', () => {
        const onClick = jest.fn();
        render(<IconButton glyph="↷" label="Redo" onClick={onClick} disabled={false}/>);
        fireEvent.click(screen.getByRole('button', {name: 'Redo'}));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});

// ---- Board integration harness (mirrors primary-actions.test.js) ------------
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
    gameStateStack = [],
    redoMoveStack = [],
    gameover = null,
    phase = 'play',
    moves = {},
    matchData = [
        {id: 0, name: 'Alice', isConnected: true},
        {id: 1, name: 'Bob', isConnected: true},
    ],
} = {}) {
    mockHasNewTiles = false;
    mockSubmitAccepted = false;
    const G = {
        tilePositions: {},
        tilesPool: ['a', 'b'],
        gameStateStack,
        redoMoveStack,
        recentlyDrawnTiles: [],
        lastPlay: null,
        lastTimeout: null,
        timerExpireAt: null,
        timePerTurn: 30,
        handCounts: {'0': 14, '1': 14},
        firstMoveDone: [true, true],
    };
    const ctx = {phase, currentPlayer, numPlayers: 2, gameover};
    return render(
        <Board
            G={G}
            ctx={ctx}
            moves={moves}
            playerID={'0'}
            matchData={matchData}
            matchID={'m1'}
            events={{endPhase: jest.fn()}}
            chatMessages={[]}
            sendChatMessage={() => {}}
        />
    );
}

describe('Undo/Redo corner icon buttons (WS-D)', () => {
    test('expose accessible names Undo and Redo', () => {
        renderBoard({gameStateStack: ['s'], redoMoveStack: ['r']});
        expect(screen.getByRole('button', {name: /undo/i})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /redo/i})).toBeInTheDocument();
    });

    test('are icon buttons carrying the ↶/↷ glyph, not text buttons', () => {
        renderBoard({gameStateStack: ['s'], redoMoveStack: ['r']});
        const undo = screen.getByRole('button', {name: /undo/i});
        const redo = screen.getByRole('button', {name: /redo/i});
        expect(undo).toHaveClass('icon-button');
        expect(redo).toHaveClass('icon-button');
        expect(undo.textContent).toBe('↶');
        expect(redo.textContent).toBe('↷');
    });

    test('live in the .rack-tools corner cluster, away from the controls row', () => {
        const {container} = renderBoard({gameStateStack: ['s'], redoMoveStack: ['r']});
        const tools = container.querySelector('.rack-tools');
        expect(tools).toBeInTheDocument();
        expect(tools).toContainElement(screen.getByRole('button', {name: /undo/i}));
        expect(tools).toContainElement(screen.getByRole('button', {name: /redo/i}));
        const controlsTools = container.querySelector('.controls-tools');
        if (controlsTools) {
            expect(controlsTools).not.toContainElement(screen.getByRole('button', {name: /undo/i}));
            expect(controlsTools).not.toContainElement(screen.getByRole('button', {name: /redo/i}));
        }
    });

    test('both disabled when the undo/redo stacks are empty (canUndo/canRedo false)', () => {
        renderBoard({gameStateStack: [], redoMoveStack: []});
        expect(screen.getByRole('button', {name: /undo/i})).toBeDisabled();
        expect(screen.getByRole('button', {name: /redo/i})).toBeDisabled();
    });

    test('Undo enabled when there is something to undo on your turn', () => {
        renderBoard({gameStateStack: ['s'], redoMoveStack: []});
        expect(screen.getByRole('button', {name: /undo/i})).toBeEnabled();
        expect(screen.getByRole('button', {name: /redo/i})).toBeDisabled();
    });

    test('Redo enabled when there is something to redo on your turn', () => {
        renderBoard({gameStateStack: [], redoMoveStack: ['r']});
        expect(screen.getByRole('button', {name: /redo/i})).toBeEnabled();
        expect(screen.getByRole('button', {name: /undo/i})).toBeDisabled();
    });

    test('both disabled when it is not your turn', () => {
        renderBoard({currentPlayer: '1', gameStateStack: ['s'], redoMoveStack: ['r']});
        expect(screen.getByRole('button', {name: /undo/i})).toBeDisabled();
        expect(screen.getByRole('button', {name: /redo/i})).toBeDisabled();
    });

    test('both disabled when the game is over', () => {
        renderBoard({gameover: {winner: '0'}, gameStateStack: ['s'], redoMoveStack: ['r']});
        expect(screen.getByRole('button', {name: /undo/i})).toBeDisabled();
        expect(screen.getByRole('button', {name: /redo/i})).toBeDisabled();
    });

    test('both disabled while waiting for players (join phase)', () => {
        renderBoard({phase: 'playersJoin', gameStateStack: ['s'], redoMoveStack: ['r']});
        expect(screen.getByRole('button', {name: /undo/i})).toBeDisabled();
        expect(screen.getByRole('button', {name: /redo/i})).toBeDisabled();
    });

    test('clicking Undo/Redo calls moves.undo/redo', () => {
        const undo = jest.fn();
        const redo = jest.fn();
        renderBoard({gameStateStack: ['s'], redoMoveStack: ['r'], moves: {undo, redo}});
        fireEvent.click(screen.getByRole('button', {name: /undo/i}));
        fireEvent.click(screen.getByRole('button', {name: /redo/i}));
        expect(undo).toHaveBeenCalledTimes(1);
        expect(redo).toHaveBeenCalledTimes(1);
    });
});
