import React from 'react';
import {render, screen} from '@testing-library/react';

// U15 / WS-6: render the real Board in a `playersJoin` ctx with 2 seats but only
// 1 named, and assert (a) the waiting overlay shows "1 of 2" and (b) BOTH grids
// are handed canDnD=false so no tile can be dragged while we wait. GridContainer
// is mocked to a stub that records the canDnD it received per gridId.

const captured = {};
jest.mock('../rummikub/components/GridContainer', () => {
    return function GridContainerMock(props) {
        captured[props.gridId] = props.canDnD;
        return <div data-testid={`grid-${props.gridId}`}/>;
    };
});

// Keep the noisy / browser-only children out of the way; they are irrelevant to
// the waiting overlay and pull in audio/canvas APIs.
jest.mock('../rummikub/sound/sfx', () => ({
    play: () => {}, place: () => {}, milestone: () => {}, buzz: () => {},
}));
jest.mock('../rummikub/juice/effects', () => ({
    celebrateGroups: () => {}, burstAt: () => {}, kick: () => {}, flash: () => {},
    floatText: () => {},
}));
jest.mock('../rummikub/components/ChatPanel', () => () => <div/>);

import Board from '../rummikub/components/Board';
import {BOARD_GRID_ID, HAND_GRID_ID} from '../rummikub/constants';

function renderWaitingBoard() {
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
        phase: 'playersJoin',
        currentPlayer: '0',
        numPlayers: 2,
        gameover: null,
    };
    const matchData = [{id: 0, name: 'Alice', isConnected: true}, {id: 1}];
    const moves = {};
    const events = {endPhase: jest.fn()};
    return render(
        <Board
            G={G}
            ctx={ctx}
            moves={moves}
            playerID={'0'}
            matchData={matchData}
            matchID={'m1'}
            events={events}
            chatMessages={[]}
            sendChatMessage={() => {}}
        />
    );
}

describe('Board waiting overlay', () => {
    beforeEach(() => {
        for (const k of Object.keys(captured)) delete captured[k];
    });

    test('shows "1 of 2" while in playersJoin', () => {
        renderWaitingBoard();
        expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
        expect(screen.getByText(/Waiting for players/i)).toBeInTheDocument();
    });

    test('disables drag on BOTH the board and hand grids while waiting', () => {
        renderWaitingBoard();
        expect(captured[BOARD_GRID_ID]).toBe(false);
        expect(captured[HAND_GRID_ID]).toBe(false);
    });
});
