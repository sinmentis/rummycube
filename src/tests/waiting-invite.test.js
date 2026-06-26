import React from 'react';
import {render, screen, fireEvent, within, act} from '@testing-library/react';

// Round-5a / T6: the invite (room code + Copy link) now also lives inside the
// central "Waiting for players" card, so a host who never looks at the top-left
// Sidebar can still share the room. Reuses the real-Board RTL harness from
// coach-card.test.js, rendered in a waiting state (2 seats, only seat 0 named).
// copyToClipboard is stubbed (the rest of util stays real for the Board) so the
// copied link can be asserted without touching the jsdom clipboard.

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
jest.mock('../rummikub/util', () => ({
    ...jest.requireActual('../rummikub/util'),
    copyToClipboard: jest.fn(),
}));

import Board from '../rummikub/components/Board';
import {copyToClipboard} from '../rummikub/util';

function renderWaitingBoard({matchID = 'm1'} = {}) {
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
        firstMoveDone: [false, false],
    };
    const ctx = {
        phase: 'playersJoin',
        currentPlayer: '0',
        numPlayers: 2,
        gameover: null,
    };
    // Only seat 0 is named, so isWaitingForPlayers(ctx, matchData) is true.
    const matchData = [
        {id: 0, name: 'Alice', isConnected: true},
        {id: 1},
    ];
    return render(
        <Board
            G={G}
            ctx={ctx}
            moves={{}}
            playerID={'0'}
            matchData={matchData}
            matchID={matchID}
            events={{endPhase: jest.fn()}}
            chatMessages={[]}
            sendChatMessage={() => {}}
        />
    );
}

describe('Waiting card invite', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        act(() => jest.runOnlyPendingTimers());
        jest.useRealTimers();
    });

    test('waiting card surfaces the invite (code + copy link)', () => {
        renderWaitingBoard({matchID: 'm1'});
        const card = screen.getByRole('status', {name: /waiting for players/i});
        expect(within(card).getByText('m1')).toBeInTheDocument();
        expect(within(card).getByRole('button', {name: /copy link/i})).toBeInTheDocument();
    });

    test('copy button copies the join link and flashes Copied! for ~1.5s', () => {
        renderWaitingBoard({matchID: 'm1'});
        const card = screen.getByRole('status', {name: /waiting for players/i});
        const button = within(card).getByRole('button', {name: /copy link/i});

        fireEvent.click(button);

        expect(copyToClipboard).toHaveBeenCalledWith(
            `${window.location.origin}/join-match/m1`,
        );
        expect(within(card).getByRole('button', {name: /copied!/i})).toBeInTheDocument();

        act(() => jest.advanceTimersByTime(1500));
        expect(within(card).getByRole('button', {name: /copy link/i})).toBeInTheDocument();
    });
});
