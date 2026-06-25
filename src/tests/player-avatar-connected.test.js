import React from 'react';
import {render} from '@testing-library/react';

// T10 / WS-E: the per-seat disconnect badge (🔌 + .avatar.offline) must read from
// the authoritative WS-12 G.connected array, falling back to boardgame.io
// metadata isConnected only when G.connected lacks an entry. PlayerAvatar stays a
// pure display component; only the value flowing into its isConnected prop
// changes. This renders the real Board (which renders TableSeats) so the actual
// wiring is exercised. The viewer is seat 0, so seat 1 is the opponent rendered
// inside .table-seats — that is the avatar we assert on.

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

function renderBoard({connected, matchData} = {}) {
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
    };
    if (connected !== undefined) G.connected = connected;
    const ctx = {
        phase: 'play',
        currentPlayer: '0',
        numPlayers: 2,
        gameover: null,
    };
    const md = matchData || [
        {id: 0, name: 'Alice', isConnected: true},
        {id: 1, name: 'Bob', isConnected: true},
    ];
    return render(
        <Board
            G={G}
            ctx={ctx}
            moves={{}}
            playerID={'0'}
            matchData={md}
            matchID={'m1'}
            events={{endPhase: jest.fn()}}
            chatMessages={[]}
            sendChatMessage={() => {}}
        />
    );
}

// Scope every assertion to .table-seats so we only inspect the opponent (seat 1);
// the viewer's own avatar lives in .rack-self, outside this container.
function opponentSeats(container) {
    const seats = container.querySelector('.table-seats');
    expect(seats).not.toBeNull();
    return seats;
}

describe('Disconnect badge reads authoritative G.connected', () => {
    test('G.connected[seat] === false → opponent shows the disconnect badge', () => {
        const {container} = renderBoard({connected: [true, false]});
        const seats = opponentSeats(container);
        expect(seats.querySelector('.avatar.offline')).not.toBeNull();
        expect(seats.querySelector('[aria-label="Disconnected"]')).not.toBeNull();
    });

    test('G.connected absent → falls back to metadata isConnected (badge still shows)', () => {
        const {container} = renderBoard({
            matchData: [
                {id: 0, name: 'Alice', isConnected: true},
                {id: 1, name: 'Bob', isConnected: false},
            ],
        });
        const seats = opponentSeats(container);
        expect(seats.querySelector('.avatar.offline')).not.toBeNull();
        expect(seats.querySelector('[aria-label="Disconnected"]')).not.toBeNull();
    });

    test('both seats online → no disconnect badge', () => {
        const {container} = renderBoard({connected: [true, true]});
        const seats = opponentSeats(container);
        expect(seats.querySelector('.avatar.offline')).toBeNull();
        expect(seats.querySelector('[aria-label="Disconnected"]')).toBeNull();
    });
});
