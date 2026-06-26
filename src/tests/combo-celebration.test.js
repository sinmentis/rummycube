import React from 'react';
import {render, screen} from '@testing-library/react';

// T9 characterization pin (ARCH-1, backbone §2.10-iv). Board's combo-celebration
// machine is an imperative effect that reads G.lastPlay and, off a NEW lastPlay.ts,
// fires the combo overlay + fx.*/sound side effects (scaled by who played and
// whether we're mid-drag, via the pure resolveJuice gate). Its existing coverage is
// weak: resolve-juice.test.js pins the pure gate and last-play.test.js pins the
// server payload, but nothing asserts the client effect fires (or skips on mount).
// This test pins the CURRENT behavior so the useSyncingCue + useComboCelebration
// extraction can be proven behavior-preserving.
//
// We mock fx (juice/effects) and sfx (sound/sfx) with jest.fn()s so we can assert
// exactly which effects fire per branch, stub the heavy/browser children, and stub
// the lazy ComboOverlay with its real `combo < 2 -> null` gate so combo/comboBy flow
// to the overlay synchronously (no Suspense async).

jest.mock('../rummikub/components/GridContainer', () => {
    return function GridContainerMock(props) {
        return <div data-testid={`grid-${props.gridId}`}/>;
    };
});
jest.mock('../rummikub/components/ChatPanel', () => () => <div/>);
jest.mock('../rummikub/components/ComboOverlay', () => ({
    __esModule: true, // ComboOverlay is consumed via React.lazy(() => import(...)), which reads .default
    default: function ComboOverlayMock({combo, by}) {
        if (!combo || combo < 2) return null;
        return <div data-testid="combo-overlay" data-combo={combo} data-by={by}/>;
    },
}));
jest.mock('../rummikub/juice/effects', () => ({
    celebrateGroups: jest.fn(),
    burstAt: jest.fn(),
    kick: jest.fn(),
    flash: jest.fn(),
    floatText: jest.fn(),
}));
jest.mock('../rummikub/sound/sfx', () => ({
    play: jest.fn(),
    place: jest.fn(),
    milestone: jest.fn(),
    buzz: jest.fn(),
}));

import * as fx from '../rummikub/juice/effects';
import * as sfx from '../rummikub/sound/sfx';
import Board from '../rummikub/components/Board';

function makeProps(lastPlay) {
    const G = {
        tilePositions: {},
        tilesPool: [],
        gameStateStack: [],
        redoMoveStack: [],
        recentlyDrawnTiles: [],
        lastPlay,
        timerExpireAt: null,
        timePerTurn: 30,
    };
    return {
        G,
        ctx: {phase: 'play', currentPlayer: '0', numPlayers: 2, gameover: null},
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
        isConnected: true,
    };
}

const el = (lastPlay) => <Board {...makeProps(lastPlay)}/>;

// An own play (seat '0' == local '0'), not dragging, count>=3 with groups present:
// resolveJuice -> full intensity (kick, flash, burst, win, celebrate all on).
const ownPlay = (ts) => ({seat: '0', count: 3, points: 10, groups: [[101, 102, 103]], ts});
// An opponent play (seat '1' != local '0'): muted -> burst + celebrate only.
const oppPlay = (ts) => ({seat: '1', count: 3, points: 5, groups: [[201, 202, 203]], ts});

function expectNoEffects() {
    expect(fx.celebrateGroups).not.toHaveBeenCalled();
    expect(fx.burstAt).not.toHaveBeenCalled();
    expect(fx.kick).not.toHaveBeenCalled();
    expect(fx.flash).not.toHaveBeenCalled();
    expect(fx.floatText).not.toHaveBeenCalled();
    expect(sfx.play).not.toHaveBeenCalled();
    expect(sfx.place).not.toHaveBeenCalled();
    expect(sfx.milestone).not.toHaveBeenCalled();
}

describe('Board combo celebration (characterization)', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });
    afterEach(() => {
        // Don't flush the pending 1800ms comboTimer here: the combo effect has no
        // unmount cleanup (preserved verbatim), so firing it post-test would setState
        // outside act(). Switching back to real timers just discards the fake timer.
        jest.useRealTimers();
    });

    test('does NOT fire on mount/reconnect when a lastPlay is already present (seenPlayRef skip)', () => {
        render(el(ownPlay(100)));
        // The play present at mount is the reconnect snapshot; the seenPlayRef===undefined
        // guard records its ts and returns, firing nothing and showing no combo.
        expectNoEffects();
        expect(screen.queryByTestId('combo-overlay')).not.toBeInTheDocument();
    });

    test('fires combo overlay + full fx/sfx on a NEW lastPlay.ts (own play, not dragging)', () => {
        const {rerender} = render(el(ownPlay(100))); // mount-skip consumes ts=100
        expectNoEffects();

        rerender(el(ownPlay(200))); // a new authoritative play

        // Overlay reflects the play: count (combo) and player name (comboBy).
        const overlay = screen.getByTestId('combo-overlay');
        expect(overlay).toHaveAttribute('data-combo', '3');
        expect(overlay).toHaveAttribute('data-by', 'Alice');

        // Full-intensity own play branch (resolveJuice: kick/flash/burst/win/celebrate):
        expect(fx.celebrateGroups).toHaveBeenCalledWith([[101, 102, 103]]); // celebrate && groups
        expect(sfx.place).toHaveBeenCalledWith(3);                          // intensity === 'full'
        expect(fx.flash).toHaveBeenCalledWith('combo');                     // flash && n>=3
        expect(sfx.milestone).toHaveBeenCalledTimes(1);                     // flash branch && win
        expect(fx.kick).toHaveBeenCalledWith(3);                            // kick
        expect(fx.floatText).toHaveBeenCalledWith('+10', expect.any(Number), expect.any(Number));
        expect(sfx.play).toHaveBeenCalledWith('win');                       // win sting
        // flash branch is taken, so the burst alternative must NOT fire (never both).
        expect(fx.burstAt).not.toHaveBeenCalled();
    });

    test('does NOT re-fire when the lastPlay.ts is unchanged (dedupe via the [ts] dep)', () => {
        const {rerender} = render(el(ownPlay(100)));
        rerender(el(ownPlay(200))); // fires once
        expect(fx.floatText).toHaveBeenCalledTimes(1);

        jest.clearAllMocks();
        rerender(el(ownPlay(200))); // a NEW lastPlay object, SAME ts -> dep unchanged -> no run

        expectNoEffects();
    });

    test('opponent play fires the muted branch: burst + celebrate, no flash/kick/place/win', () => {
        const {rerender} = render(el(oppPlay(100)));
        rerender(el(oppPlay(200)));

        const overlay = screen.getByTestId('combo-overlay');
        expect(overlay).toHaveAttribute('data-combo', '3');
        expect(overlay).toHaveAttribute('data-by', 'Bob'); // matchData[1].name

        // Muted branch (resolveJuice for an opponent): burst + group spotlight only.
        expect(fx.celebrateGroups).toHaveBeenCalledWith([[201, 202, 203]]); // celebrate && groups
        expect(fx.burstAt).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 3);
        expect(fx.floatText).toHaveBeenCalledWith('+5', expect.any(Number), expect.any(Number));
        // No screen flash, no kick, no win sting, no 'full' place sound.
        expect(fx.flash).not.toHaveBeenCalled();
        expect(fx.kick).not.toHaveBeenCalled();
        expect(sfx.place).not.toHaveBeenCalled();
        expect(sfx.milestone).not.toHaveBeenCalled();
        expect(sfx.play).not.toHaveBeenCalledWith('win');
    });
});
