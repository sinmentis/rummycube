import React from 'react';
import {render, act} from '@testing-library/react';

// Fix #1: a committed play must light up for EVERYONE, not just the player who
// melded. The server broadcasts G.lastPlay {seat, groups:[[ids...]], ts}; the
// board grid flashes those public board tiles via its `newlyAdded` highlight.
// We mock GridContainer to capture the `newlyAdded` array it receives per grid,
// then drive lastPlay.ts changes and assert the BOARD grid lights the flattened
// play tiles while the HAND grid is untouched. lastPlay carries only board tiles,
// so this leaks no hidden hand info.

const captured = {};
jest.mock('../rummikub/components/GridContainer', () => {
    return function GridContainerMock(props) {
        captured[props.gridId] = props.newlyAdded;
        return <div data-testid={`grid-${props.gridId}`}/>;
    };
});
jest.mock('../rummikub/components/ChatPanel', () => function ChatPanelMock() { return <div/>; });
jest.mock('../rummikub/components/ComboOverlay', () => ({
    __esModule: true,
    default: function ComboOverlayMock() { return null; },
}));
jest.mock('../rummikub/juice/effects', () => ({
    celebrateGroups: jest.fn(), burstAt: jest.fn(), kick: jest.fn(), flash: jest.fn(), floatText: jest.fn(),
}));
jest.mock('../rummikub/sound/sfx', () => ({
    play: jest.fn(), place: jest.fn(), milestone: jest.fn(), buzz: jest.fn(),
}));

import Board from '../rummikub/components/Board';
import {BOARD_GRID_ID, HAND_GRID_ID} from '../rummikub/constants';

function makeProps(lastPlay, mode = 'classic') {
    const G = {
        mode,
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

const el = (lastPlay, mode) => <Board {...makeProps(lastPlay, mode)}/>;
const play = (ts, groups, seat = '1') => ({seat, count: 3, points: 12, groups, ts});

describe('Board last-play highlight (#1)', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        for (const k of Object.keys(captured)) delete captured[k];
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    test('the play present at mount/reconnect does NOT light up (no stale highlight)', () => {
        render(el(play(100, [[101, 102, 103]])));
        expect(captured[BOARD_GRID_ID]).toEqual([]);
    });

    test('a NEW play lights the flattened play tiles on the board for everyone', () => {
        const {rerender} = render(el(play(100, [[101, 102, 103]]))); // mount-skip consumes ts=100
        expect(captured[BOARD_GRID_ID]).toEqual([]);

        act(() => { rerender(el(play(200, [[101, 102, 103], [201, 202, 203]]))); });

        // Both groups are flattened onto the board grid's newly-added highlight.
        expect(captured[BOARD_GRID_ID]).toEqual([101, 102, 103, 201, 202, 203]);
        // The hand grid is driven by recentlyDrawnTiles (empty here), never lastPlay.
        expect(captured[HAND_GRID_ID]).toEqual([]);
    });

    test('the highlight fades after a few seconds', () => {
        const {rerender} = render(el(play(100, [[101, 102, 103]])));
        act(() => { rerender(el(play(200, [[101, 102, 103]]))); });
        expect(captured[BOARD_GRID_ID]).toEqual([101, 102, 103]);

        act(() => { jest.advanceTimersByTime(4000); });
        expect(captured[BOARD_GRID_ID]).toEqual([]);
    });

    test('the next play replaces the previous highlight', () => {
        const {rerender} = render(el(play(100, [[101, 102, 103]])));
        act(() => { rerender(el(play(200, [[101, 102, 103]]))); });
        expect(captured[BOARD_GRID_ID]).toEqual([101, 102, 103]);

        act(() => { rerender(el(play(300, [[301, 302, 303]]))); });
        expect(captured[BOARD_GRID_ID]).toEqual([301, 302, 303]);
    });

    test('works in chaos mode too', () => {
        const {rerender} = render(el(play(100, [[101, 102, 103]]), 'chaos'));
        act(() => { rerender(el(play(200, [[401, 402, 403]]), 'chaos')); });
        expect(captured[BOARD_GRID_ID]).toEqual([401, 402, 403]);
    });
});
