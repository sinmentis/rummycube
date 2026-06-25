import React, {useEffect, useReducer} from 'react';
import {render, screen, fireEvent, cleanup} from '@testing-library/react';
import {Client} from 'boardgame.io/client';
import {Rummikub} from '../rummikub/Game';
import {onPlayPhaseBegin} from '../rummikub/moves';
import {buildTileObj, getTiles} from '../rummikub/util';
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from '../rummikub/constants';
import {useTilePlacementHotkeys} from '../rummikub/components/useTilePlacementHotkeys';

// T8 (WS-G): keyboard tap-to-place. A focused HAND tile + Enter/Space places it on
// the first free board cell with NO pointer, routing through the same validated
// dispatchDrop the drag/tap paths use. Two layers of coverage: a focused hook test
// (mirroring keyboard-undo-redo.test.js) and an integrated test on the REAL Board
// over a headless boardgame.io client (mirroring tap-to-place.test.js) so the
// gameStateStack (Undo), the move dispatch, and the DOM all behave authentically.

const mockBuzz = jest.fn();
const mockPlay = jest.fn();
jest.mock('../rummikub/sound/sfx', () => ({
    play: (...a) => mockPlay(...a),
    place: () => {},
    milestone: () => {},
    buzz: (...a) => mockBuzz(...a),
}));
jest.mock('../rummikub/juice/effects', () => ({
    celebrateGroups: () => {}, burstAt: () => {}, kick: () => {}, flash: () => {},
    floatText: () => {},
}));
jest.mock('../rummikub/components/ChatPanel', () => () => <div/>);

import Board from '../rummikub/components/Board';

// ----------------------------------------------------------------------------
// Focused hook tests
// ----------------------------------------------------------------------------

function Harness(props) {
    useTilePlacementHotkeys(props);
    return null;
}

function keyOn(el, opts) {
    const ev = new KeyboardEvent('keydown', {bubbles: true, cancelable: true, ...opts});
    el.dispatchEvent(ev);
    return ev;
}

describe('useTilePlacementHotkeys (hook)', () => {
    let handTileEl, boardTileEl, input;
    const handPos = {gridId: HAND_GRID_ID, col: 0, row: 0, playerID: '0'};
    const boardPos = {gridId: BOARD_GRID_ID, col: 5, row: 0};
    // '5' is a hand tile, '39' a board tile; anything else is unknown.
    const getTilePos = (id) => (id === '5' ? handPos : id === '39' ? boardPos : undefined);

    beforeEach(() => {
        handTileEl = document.createElement('div');
        handTileEl.id = '5';
        document.body.appendChild(handTileEl);
        boardTileEl = document.createElement('div');
        boardTileEl.id = '39';
        document.body.appendChild(boardTileEl);
        input = document.createElement('input');
        input.type = 'text';
        document.body.appendChild(input);
    });

    afterEach(() => {
        cleanup();
        [handTileEl, boardTileEl, input].forEach((el) => el && el.parentNode && el.parentNode.removeChild(el));
    });

    test('Enter on a focused hand tile places it (onPlaceTile with the tile id)', () => {
        const onPlaceTile = jest.fn();
        render(<Harness enabled getTilePos={getTilePos} onPlaceTile={onPlaceTile}/>);
        keyOn(handTileEl, {key: 'Enter'});
        expect(onPlaceTile).toHaveBeenCalledTimes(1);
        expect(onPlaceTile).toHaveBeenCalledWith('5');
    });

    test('Space on a focused hand tile places it', () => {
        const onPlaceTile = jest.fn();
        render(<Harness enabled getTilePos={getTilePos} onPlaceTile={onPlaceTile}/>);
        keyOn(handTileEl, {key: ' '});
        expect(onPlaceTile).toHaveBeenCalledWith('5');
    });

    test('does NOT place when disabled (not your turn / waiting / gameover)', () => {
        const onPlaceTile = jest.fn();
        render(<Harness enabled={false} getTilePos={getTilePos} onPlaceTile={onPlaceTile}/>);
        keyOn(handTileEl, {key: 'Enter'});
        expect(onPlaceTile).not.toHaveBeenCalled();
    });

    test('focusing a board tile is a no-op (v1: hand -> board only)', () => {
        const onPlaceTile = jest.fn();
        render(<Harness enabled getTilePos={getTilePos} onPlaceTile={onPlaceTile}/>);
        const ev = keyOn(boardTileEl, {key: 'Enter'});
        expect(onPlaceTile).not.toHaveBeenCalled();
        expect(ev.defaultPrevented).toBe(false);
    });

    test('an editable target (input) is ignored even when it would map to a hand tile', () => {
        const onPlaceTile = jest.fn();
        // getTilePos returns a hand position for ANY id, so only the editable guard
        // can stop a placement here — proving the guard short-circuits first.
        render(<Harness enabled getTilePos={() => handPos} onPlaceTile={onPlaceTile}/>);
        const ev = keyOn(input, {key: 'Enter'});
        expect(onPlaceTile).not.toHaveBeenCalled();
        expect(ev.defaultPrevented).toBe(false); // native Enter (e.g. send chat) untouched
    });

    test('an unrelated key does nothing and is not prevented', () => {
        const onPlaceTile = jest.fn();
        render(<Harness enabled getTilePos={getTilePos} onPlaceTile={onPlaceTile}/>);
        const ev = keyOn(handTileEl, {key: 'a'});
        expect(onPlaceTile).not.toHaveBeenCalled();
        expect(ev.defaultPrevented).toBe(false);
    });

    test('preventDefault is called for a handled placement', () => {
        render(<Harness enabled getTilePos={getTilePos} onPlaceTile={jest.fn()}/>);
        const ev = keyOn(handTileEl, {key: 'Enter'});
        expect(ev.defaultPrevented).toBe(true);
    });

    test('removes the listener on unmount', () => {
        const onPlaceTile = jest.fn();
        const {unmount} = render(<Harness enabled getTilePos={getTilePos} onPlaceTile={onPlaceTile}/>);
        unmount();
        keyOn(handTileEl, {key: 'Enter'});
        expect(onPlaceTile).not.toHaveBeenCalled();
    });
});

// ----------------------------------------------------------------------------
// Integrated tests on the real Board
// ----------------------------------------------------------------------------

const red5 = buildTileObj(5, COLOR.red, 0);     // id 5  (a hand tile)
const blue7 = buildTileObj(7, COLOR.blue, 0);   // id 39 (a settled board tile)

const matchData = [
    {id: 0, name: 'Alice', isConnected: true},
    {id: 1, name: 'Bob', isConnected: true},
];

function makeG(tilePositions) {
    return {
        timePerTurn: 600000, tilesPool: getTiles(), tilePositions,
        prevTilePositions: tilePositions, firstMoveDone: [true, true],
        gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [], lastPlay: null,
    };
}

// A live <Board> bound to a headless client: re-render on every state update so a
// keydown that fires a move is reflected back into the DOM.
function ClientBoard({client}) {
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => client.subscribe(() => force()), [client]);
    const {G, ctx} = client.getState();
    return (
        <Board
            G={G}
            ctx={ctx}
            moves={client.moves}
            events={client.events}
            playerID={'0'}
            matchData={matchData}
            matchID={'m1'}
            chatMessages={[]}
            sendChatMessage={() => {}}
            isConnected={true}
        />
    );
}

function startClient(setup) {
    const game = {...Rummikub, phases: {play: {start: true, onBegin: onPlayPhaseBegin}}, setup};
    const client = Client({game, numPlayers: 2, playerID: '0'});
    client.start();
    return client;
}

describe('keyboard tap-to-place (integrated Board)', () => {
    beforeEach(() => {
        mockBuzz.mockClear();
        mockPlay.mockClear();
    });

    test('focusing a hand tile and pressing Enter places it on the board, enabling Undo', () => {
        const client = startClient(() => {
            const tilePositions = {};
            tilePositions[red5] = {id: red5, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
            return makeG(tilePositions);
        });

        render(<ClientBoard client={client}/>);

        // Undo starts disabled — nothing placed yet.
        expect(screen.getByRole('button', {name: 'Undo'})).toBeDisabled();

        const tileEl = document.getElementById(String(red5));
        expect(tileEl).toBeTruthy();
        tileEl.focus();
        fireEvent.keyDown(tileEl, {key: 'Enter'});

        // The tile landed on the board's first free cell (row 0, col 0), the
        // gameStateStack grew by 1 (Undo enabled), and the place sound fired.
        const movedPos = client.getState().G.tilePositions[red5];
        expect(movedPos.gridId).toBe(BOARD_GRID_ID);
        expect(movedPos.row).toBe(0);
        expect(movedPos.col).toBe(0);
        expect(client.getState().G.gameStateStack.length).toBe(1);
        expect(screen.getByRole('button', {name: 'Undo'})).not.toBeDisabled();
        expect(mockPlay).toHaveBeenCalledWith('place');
    });

    test('does not place when it is not your turn', () => {
        const tilePositions = {};
        tilePositions[red5] = {id: red5, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
        const G = {
            ...makeG(tilePositions),
            lastTimeout: null, timerExpireAt: null, handCounts: {'0': 1, '1': 14},
        };
        const ctx = {phase: 'play', currentPlayer: '1', numPlayers: 2, gameover: null, turn: 2};
        const moves = {
            moveTiles: jest.fn(), insertTilesWithPush: jest.fn(),
            retrieveJoker: jest.fn(), clearRecentlyDrawnTiles: jest.fn(),
        };

        render(
            <Board
                G={G}
                ctx={ctx}
                moves={moves}
                events={{endPhase: jest.fn()}}
                playerID={'0'}
                matchData={matchData}
                matchID={'m1'}
                chatMessages={[]}
                sendChatMessage={() => {}}
                isConnected={true}
            />
        );

        const tileEl = document.getElementById(String(red5));
        expect(tileEl).toBeTruthy();
        tileEl.focus();
        fireEvent.keyDown(tileEl, {key: 'Enter'});

        expect(moves.moveTiles).not.toHaveBeenCalled();
        expect(moves.insertTilesWithPush).not.toHaveBeenCalled();
    });

    test('focusing a settled board tile and pressing Enter is a no-op', () => {
        const client = startClient(() => {
            const tilePositions = {};
            tilePositions[red5] = {id: red5, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
            tilePositions[blue7] = {id: blue7, col: 5, row: 0, gridId: BOARD_GRID_ID, playerID: null, tmp: false};
            return makeG(tilePositions);
        });

        render(<ClientBoard client={client}/>);

        const before = JSON.stringify(client.getState().G.tilePositions);
        const boardEl = document.getElementById(String(blue7));
        expect(boardEl).toBeTruthy();
        boardEl.focus();
        fireEvent.keyDown(boardEl, {key: 'Enter'});

        expect(client.getState().G.tilePositions).toEqual(JSON.parse(before));
        expect(client.getState().G.gameStateStack.length).toBe(0);
        expect(mockPlay).not.toHaveBeenCalledWith('place');
    });
});
