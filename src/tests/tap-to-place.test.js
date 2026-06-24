import React, {useEffect, useReducer} from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import {Client} from 'boardgame.io/client';
import {Rummikub} from '../rummikub/Game';
import {onPlayPhaseBegin} from '../rummikub/moves';
import {buildTileObj, getTiles} from '../rummikub/util';
import {BOARD_COLS, BOARD_GRID_ID, COLOR, HAND_GRID_ID} from '../rummikub/constants';

// S3-U8: tap-to-place. A tile is placed by two taps (select a tile, then tap an
// empty board cell) with NO drag, reusing the same validated resolveDropSlot path
// as drag. We render the REAL Board on top of a real (headless) boardgame.io
// client so moveTiles, the gameStateStack (Undo-enabled), and the DOM all behave
// authentically — only the audio/juice side effects are stubbed.

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

const red5 = buildTileObj(5, COLOR.red, 0);

const matchData = [
    {id: 0, name: 'Alice', isConnected: true},
    {id: 1, name: 'Bob', isConnected: true},
];

// A live <Board> bound to a headless client: re-render on every state update so a
// click that fires client.moves.moveTiles is reflected back into the DOM.
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
    // Start directly in the 'play' phase so seat 0 is the active player — the
    // condition the board's drag/tap droppable cue gates on (canDnD).
    const game = {...Rummikub, phases: {play: {start: true, onBegin: onPlayPhaseBegin}}, setup};
    const client = Client({game, numPlayers: 2, playerID: '0'});
    client.start();
    return client;
}

beforeEach(() => {
    mockBuzz.mockClear();
    mockPlay.mockClear();
});

test('two taps (select tile, then tap empty board cell) place the tile with no drag, enabling Undo', () => {
    const client = startClient(() => {
        const tilePositions = {};
        tilePositions[red5] = {id: red5, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
        return {
            timePerTurn: 600000, tilesPool: getTiles(), tilePositions,
            prevTilePositions: tilePositions, firstMoveDone: [true, true],
            gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [], lastPlay: null,
        };
    });

    render(<ClientBoard client={client}/>);

    // Undo starts disabled — nothing placed yet.
    const undoBtn = screen.getByRole('button', {name: 'Undo'});
    expect(undoBtn).toBeDisabled();

    // Tap the tile face to select it (a click, not a drag).
    const tileEl = document.getElementById(String(red5));
    expect(tileEl).toBeTruthy();
    fireEvent.click(tileEl.querySelector('.tile-text'));

    // The tile is now still in the hand; tap an empty BOARD cell to place it.
    // GridSlot cells have no id, so we locate the empty board cell by position:
    // the board grid is the first .grid-container; its 4th cell (row 0, col 3) is
    // empty. While a selection is live, empty droppable cells carry .slot-valid.
    const grids = document.querySelectorAll('.grid-container');
    const boardGrid = grids[0];
    const cells = boardGrid.querySelectorAll('.grid-item');
    expect(boardGrid.querySelectorAll('.grid-item.slot-valid').length).toBeGreaterThan(0);
    fireEvent.click(cells[3]); // row 0, col 3 — empty

    // Tile moved onto the board, and Undo is now enabled.
    const movedPos = client.getState().G.tilePositions[red5];
    expect(movedPos.gridId).toBe(BOARD_GRID_ID);
    expect(movedPos.row).toBe(0);
    expect(movedPos.col).toBe(3);
    expect(client.getState().G.gameStateStack.length).toBe(1);
    expect(screen.getByRole('button', {name: 'Undo'})).not.toBeDisabled();
    expect(mockPlay).toHaveBeenCalledWith('place');
    expect(mockBuzz).not.toHaveBeenCalled();
});

test('a multi-select onto a row with no contiguous space is rejected — no move, no Undo, a buzz', () => {
    const t1 = buildTileObj(6, COLOR.red, 0);
    const t2 = buildTileObj(7, COLOR.red, 0);
    const client = startClient(() => {
        const tilePositions = {};
        // Two selectable tiles in player 0's hand.
        tilePositions[t1] = {id: t1, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
        tilePositions[t2] = {id: t2, col: 1, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
        // Fill board row 0 completely EXCEPT an isolated empty at col 10, so a
        // 2-tile selection has no contiguous run anywhere in that row -> reject.
        let id = 5000;
        for (let c = 0; c < BOARD_COLS; c++) {
            if (c === 10) continue;
            tilePositions[id] = {id, col: c, row: 0, gridId: BOARD_GRID_ID, playerID: null, tmp: false};
            id++;
        }
        return {
            timePerTurn: 600000, tilesPool: getTiles(), tilePositions,
            prevTilePositions: tilePositions, firstMoveDone: [true, true],
            gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [], lastPlay: null,
        };
    });

    render(<ClientBoard client={client}/>);

    // Select both hand tiles (ctrl-click to add to the selection).
    fireEvent.click(document.getElementById(String(t1)).querySelector('.tile-text'));
    const t2El = document.getElementById(String(t2));
    fireEvent.click(t2El.querySelector('.tile-text'), {ctrlKey: true});

    // Tap the only empty board cell (row 0, col 10). It is isolated, so the
    // contiguous-run rule rejects the 2-tile selection.
    const boardGrid = document.querySelectorAll('.grid-container')[0];
    const cells = boardGrid.querySelectorAll('.grid-item');
    fireEvent.click(cells[10]);

    // Nothing moved, Undo stays disabled, and a light buzz fired.
    expect(client.getState().G.tilePositions[t1].gridId).toBe(HAND_GRID_ID);
    expect(client.getState().G.tilePositions[t2].gridId).toBe(HAND_GRID_ID);
    expect(client.getState().G.gameStateStack.length).toBe(0);
    expect(screen.getByRole('button', {name: 'Undo'})).toBeDisabled();
    expect(mockBuzz).toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalledWith('place');
});
