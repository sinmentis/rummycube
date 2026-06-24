import React from 'react';
import {render, screen, act} from '@testing-library/react';

// T3 / WS-A: the all-visible "time's up" toast. It turns the server-authoritative
// G.lastTimeout transient {seat, drawCount, id} (T1) into the short English copy
// (timeoutToastText, T2) and shows it to every client for a few seconds, then
// auto-dismisses. De-dupe keys on the transient id so the value already on G at
// mount/reconnect is ignored (no stale toast) and the same id never re-pops.

jest.mock('../rummikub/components/GridContainer', () => {
    return function GridContainerMock(props) {
        return <div data-testid={`grid-${props.gridId}`}/>;
    };
});
jest.mock('../rummikub/components/GameOverModal', () => ({
    __esModule: true,
    default: () => <div data-testid="game-over"/>,
}));
jest.mock('../rummikub/sound/sfx', () => ({
    play: () => {}, place: () => {}, milestone: () => {}, buzz: () => {},
}));
jest.mock('../rummikub/juice/effects', () => ({
    celebrateGroups: () => {}, burstAt: () => {}, kick: () => {}, flash: () => {},
    floatText: () => {},
}));
jest.mock('../rummikub/components/ChatPanel', () => () => <div/>);

import Board from '../rummikub/components/Board';
import TimeoutAnnouncement from '../rummikub/components/TimeoutAnnouncement';
import {timeoutToastText} from '../rummikub/timeoutToastText';

const matchData = [{name: 'Alice'}, {name: 'Bob'}];

// Build a fresh element so each rerender carries the props under test.
const el = (props) => (
    <TimeoutAnnouncement
        lastTimeout={null}
        playerID={'0'}
        matchData={matchData}
        durationMs={3000}
        {...props}
    />
);

describe('TimeoutAnnouncement', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        act(() => {
            jest.runOnlyPendingTimers();
        });
        jest.useRealTimers();
    });

    test('renders nothing when lastTimeout is null', () => {
        render(el());
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    test('ignores a lastTimeout already present at mount (no stale toast on reconnect)', () => {
        render(el({lastTimeout: {seat: 1, drawCount: 2, id: 7}}));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    test('shows the derived text for a new timeout, then auto-dismisses after durationMs', () => {
        const {rerender} = render(el());
        const lastTimeout = {seat: 1, drawCount: 2, id: 7};
        const expected = timeoutToastText(lastTimeout, '0', matchData);

        act(() => {
            rerender(el({lastTimeout}));
        });
        expect(screen.getByText(expected)).toBeInTheDocument();

        act(() => {
            jest.advanceTimersByTime(3000);
        });
        expect(screen.queryByText(expected)).not.toBeInTheDocument();
    });

    test('does not reappear for the same timeout id after it dismissed', () => {
        const lastTimeout = {seat: 1, drawCount: 2, id: 7};
        const expected = timeoutToastText(lastTimeout, '0', matchData);
        const {rerender} = render(el());

        act(() => {
            rerender(el({lastTimeout}));
        });
        expect(screen.getByText(expected)).toBeInTheDocument();

        act(() => {
            jest.advanceTimersByTime(3000);
        });
        expect(screen.queryByText(expected)).not.toBeInTheDocument();

        // A later render carrying the SAME id (new object) must not pop it again.
        act(() => {
            rerender(el({lastTimeout: {...lastTimeout}}));
        });
        expect(screen.queryByText(expected)).not.toBeInTheDocument();
    });

    test('reappears for a new timeout id', () => {
        const {rerender} = render(el());
        const first = {seat: 1, drawCount: 2, id: 7};
        const firstText = timeoutToastText(first, '0', matchData);

        act(() => {
            rerender(el({lastTimeout: first}));
        });
        expect(screen.getByText(firstText)).toBeInTheDocument();

        act(() => {
            jest.advanceTimersByTime(3000);
        });
        expect(screen.queryByText(firstText)).not.toBeInTheDocument();

        const second = {seat: 0, drawCount: 1, id: 8};
        const secondText = timeoutToastText(second, '0', matchData);
        act(() => {
            rerender(el({lastTimeout: second}));
        });
        expect(screen.getByText(secondText)).toBeInTheDocument();
    });

    test('uses assertive aria-live for the local player, polite for others', () => {
        const {rerender} = render(el());

        // Self: playerID '0' === seat 0.
        act(() => {
            rerender(el({lastTimeout: {seat: 0, drawCount: 1, id: 1}}));
        });
        expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'assertive');

        act(() => {
            jest.advanceTimersByTime(3000);
        });

        // Other: seat 1 !== playerID '0'.
        act(() => {
            rerender(el({lastTimeout: {seat: 1, drawCount: 1, id: 2}}));
        });
        expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });
});

// Board-wiring assertions reuse the coach-card Board-mount harness. These run on
// real timers — we only assert presence/absence at render time, not dismissal.
function makeBoardProps(overrides = {}) {
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
        lastTimeout: null,
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
        moves: {},
        playerID: '0',
        matchData: [
            {id: 0, name: 'Alice', isConnected: true},
            {id: 1, name: 'Bob', isConnected: true},
        ],
        matchID: 'm1',
        events: {endPhase: () => {}},
        chatMessages: [],
        sendChatMessage: () => {},
    };
}

describe('Board timeout announcement wiring', () => {
    test('surfaces the toast when a new timeout lands while in play', () => {
        const base = makeBoardProps();
        const {rerender} = render(<Board {...base}/>);
        expect(screen.queryByText(/Time's up/i)).not.toBeInTheDocument();

        const next = makeBoardProps({G: {lastTimeout: {seat: 1, drawCount: 2, id: 5}}});
        rerender(<Board {...next}/>);
        expect(screen.getByText(/Time's up/i)).toBeInTheDocument();
    });

    test('does not render the toast once the game is over', () => {
        const props = makeBoardProps({
            ctx: {gameover: {winner: '0'}},
            G: {lastTimeout: {seat: 1, drawCount: 2, id: 3}},
        });
        render(<Board {...props}/>);
        expect(screen.queryByText(/Time's up/i)).not.toBeInTheDocument();
    });
});
