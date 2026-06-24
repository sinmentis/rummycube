import React from 'react';
import {render, screen} from '@testing-library/react';

// S3-U2 / WS-13b: the board reads boardgame.io's `isConnected` prop and surfaces
// a non-blocking "Reconnecting…" cue while the socket is down during an in-play
// match. When connected the cue is absent. GridContainer and browser-only
// children are stubbed out — they are irrelevant to the connection cue.

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

function renderBoard(props) {
    const G = {
        tilePositions: {},
        tilesPool: [],
        gameStateStack: [],
        redoMoveStack: [],
        recentlyDrawnTiles: [],
        lastPlay: null,
        timerExpireAt: null,
        timePerTurn: 30,
    };
    const ctx = {
        phase: 'play',
        currentPlayer: '0',
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
            events={{endPhase: () => {}}}
            chatMessages={[]}
            sendChatMessage={() => {}}
            {...props}
        />
    );
}

describe('Board reconnecting cue', () => {
    test('shows the reconnecting cue when isConnected={false} in play', () => {
        renderBoard({isConnected: false});
        expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
    });

    test('hides the reconnecting cue when isConnected={true}', () => {
        renderBoard({isConnected: true});
        expect(screen.queryByText(/Reconnecting/i)).not.toBeInTheDocument();
    });

    test('does not show the reconnecting cue once the game is over', () => {
        const G = {
            tilePositions: {}, tilesPool: [], gameStateStack: [], redoMoveStack: [],
            recentlyDrawnTiles: [], lastPlay: null, timerExpireAt: null, timePerTurn: 30,
        };
        render(
            <Board
                G={G}
                ctx={{phase: 'play', currentPlayer: '0', numPlayers: 2, gameover: {winner: '0'}}}
                moves={{}}
                playerID={'0'}
                matchData={[{id: 0, name: 'Alice'}, {id: 1, name: 'Bob'}]}
                matchID={'m1'}
                events={{endPhase: () => {}}}
                chatMessages={[]}
                sendChatMessage={() => {}}
                isConnected={false}
            />
        );
        expect(screen.queryByText(/Reconnecting/i)).not.toBeInTheDocument();
    });
});
