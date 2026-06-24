import React from 'react';
import {render, screen, fireEvent, act} from '@testing-library/react';

// T8 (WS-2): the "Give up turn" control no longer pops a browser window.confirm.
// It is a two-click in-game confirm instead: the first click ARMS the button
// (warning style, label -> "Click again to confirm"); a second click after a
// short rage-guard (GIVEUP_ARM_GUARD_MS) and within the confirm window
// (GIVEUP_CONFIRM_MS) fires moves.forfeitTurn(); otherwise it auto-reverts. The
// arm also clears when the turn changes. These tests reuse the coach-card Board
// mount harness, mock moves with jest.fn, and drive the state machine with fake
// timers.

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

// Force the staged-tiles predicate true so the "Give up turn" button is enabled
// and rendered without hand-building a real valid board. isSubmitAccepted is
// controllable per-test so the submit-accept branch can be exercised. Everything
// else in moveValidation stays real.
let mockSubmitAccepted = false;
jest.mock('../rummikub/moveValidation', () => {
    const actual = jest.requireActual('../rummikub/moveValidation');
    return {...actual, isBoardHasNewTiles: () => true, isSubmitAccepted: () => mockSubmitAccepted};
});

import Board from '../rummikub/components/Board';

function makeProps(overrides = {}) {
    const G = {
        tilePositions: {},
        tilesPool: ['a', 'b'],
        gameStateStack: [],
        redoMoveStack: [],
        recentlyDrawnTiles: [],
        lastPlay: null,
        lastTimeout: null,
        timerExpireAt: null,
        timePerTurn: 30,
        handCounts: {'0': 14, '1': 14},
        firstMoveDone: [true, true],
        ...(overrides.G || {}),
    };
    const ctx = {
        phase: 'play',
        currentPlayer: '0',
        numPlayers: 2,
        gameover: null,
        ...(overrides.ctx || {}),
    };
    return {
        G,
        ctx,
        moves: overrides.moves || {forfeitTurn: jest.fn()},
        playerID: '0',
        matchData: [
            {id: 0, name: 'Alice', isConnected: true},
            {id: 1, name: 'Bob', isConnected: true},
        ],
        matchID: 'm1',
        events: {endPhase: jest.fn()},
        chatMessages: [],
        sendChatMessage: () => {},
    };
}

// Stable handle to the forfeit button across armed/disarmed states: the title is
// unchanged by the state machine, only the label and the is-arming class flip.
const forfeitBtn = () => screen.getByTitle(/return your tiles and draw/i);

describe('Two-click in-game give-up confirm (T8)', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockSubmitAccepted = false;
    });
    afterEach(() => {
        act(() => {
            jest.runOnlyPendingTimers();
        });
        jest.useRealTimers();
    });

    test('first click arms the button without forfeiting', () => {
        const props = makeProps();
        render(<Board {...props}/>);

        const btn = forfeitBtn();
        expect(btn).toHaveTextContent('Give up turn');
        expect(btn).not.toHaveClass('is-arming');

        fireEvent.click(btn);

        expect(props.moves.forfeitTurn).not.toHaveBeenCalled();
        expect(forfeitBtn()).toHaveTextContent('Click again to confirm');
        expect(forfeitBtn()).toHaveClass('is-arming');
    });

    test('second click after the rage-guard confirms the forfeit once', () => {
        const props = makeProps();
        render(<Board {...props}/>);

        fireEvent.click(forfeitBtn());
        act(() => {
            jest.advanceTimersByTime(500); // past GIVEUP_ARM_GUARD_MS (400), before GIVEUP_CONFIRM_MS (3000)
        });
        fireEvent.click(forfeitBtn());

        expect(props.moves.forfeitTurn).toHaveBeenCalledTimes(1);
    });

    test('a rage double-click inside the guard window does not confirm', () => {
        const props = makeProps();
        render(<Board {...props}/>);

        fireEvent.click(forfeitBtn());
        act(() => {
            jest.advanceTimersByTime(100); // still inside GIVEUP_ARM_GUARD_MS (400)
        });
        fireEvent.click(forfeitBtn());

        expect(props.moves.forfeitTurn).not.toHaveBeenCalled();
        expect(forfeitBtn()).toHaveTextContent('Click again to confirm'); // still armed
    });

    test('auto-reverts after the confirm window with no second click', () => {
        const props = makeProps();
        render(<Board {...props}/>);

        fireEvent.click(forfeitBtn());
        expect(forfeitBtn()).toHaveTextContent('Click again to confirm');

        act(() => {
            jest.advanceTimersByTime(3000); // GIVEUP_CONFIRM_MS elapses
        });

        expect(forfeitBtn()).toHaveTextContent('Give up turn');
        expect(forfeitBtn()).not.toHaveClass('is-arming');
        expect(props.moves.forfeitTurn).not.toHaveBeenCalled();
    });

    test('changing the current player disarms the button', () => {
        const base = makeProps();
        const {rerender} = render(<Board {...base}/>);

        fireEvent.click(forfeitBtn());
        expect(forfeitBtn()).toHaveTextContent('Click again to confirm');

        // Turn passes to the other player (button hides), then comes back to us.
        act(() => {
            rerender(<Board {...base} ctx={{...base.ctx, currentPlayer: '1'}}/>);
        });
        act(() => {
            rerender(<Board {...base} ctx={{...base.ctx, currentPlayer: '0'}}/>);
        });

        // Re-armed state would have survived the round trip; disarm-on-turn-change
        // means it is back to the neutral label.
        expect(forfeitBtn()).toHaveTextContent('Give up turn');
        expect(forfeitBtn()).not.toHaveClass('is-arming');
        expect(base.moves.forfeitTurn).not.toHaveBeenCalled();
    });

    test('does not use a browser confirm dialog', () => {
        const props = makeProps();
        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
        render(<Board {...props}/>);

        fireEvent.click(forfeitBtn());

        expect(confirmSpy).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
    });

    test('a successful submit disarms an armed give-up button', () => {
        mockSubmitAccepted = true;
        const props = makeProps({moves: {forfeitTurn: jest.fn(), submitMeld: jest.fn()}});
        render(<Board {...props}/>);

        fireEvent.click(forfeitBtn());
        expect(forfeitBtn()).toHaveTextContent('Click again to confirm');

        fireEvent.click(screen.getByRole('button', {name: /submit meld/i}));

        expect(props.moves.submitMeld).toHaveBeenCalledTimes(1);
        expect(forfeitBtn()).toHaveTextContent('Give up turn');
        expect(forfeitBtn()).not.toHaveClass('is-arming');
    });
});
