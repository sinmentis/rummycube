import React from 'react';
import {render, act} from '@testing-library/react';

// T4 (WS-6): the client board-drop / empty-cell-tap dispatch split. A board drop
// (onDragEnd) or empty-cell tap (onCellTap) whose N-wide run lands IN BOUNDS on an
// occupied span routes to the authoritative moves.insertTilesWithPush (auto-snap +
// push). Free board targets, the hand, and OUT-OF-BOUNDS runs keep the existing
// resolveDropSlot + moves.moveTiles near-edge-snap path. insertWithPush returning
// null is non-destructive: a buzz, no move, selection cleared.
//
// jsdom has no layout for @dnd-kit's pointer measurement, so we mock @dnd-kit/core
// to capture the DndContext's onDragStart/onDragEnd and drive them directly, and
// mock GridContainer (the coach-card harness style) to capture onCellTap/onLongPress
// off the board grid. moves is mocked so we assert which move the client dispatches.

const mockDnd = {};
jest.mock('@dnd-kit/core', () => {
    const React = require('react');
    return {
        DndContext: ({children, onDragStart, onDragEnd}) => {
            mockDnd.onDragStart = onDragStart;
            mockDnd.onDragEnd = onDragEnd;
            return React.createElement(React.Fragment, null, children);
        },
        DragOverlay: ({children}) => React.createElement(React.Fragment, null, children),
        MouseSensor: function MouseSensor() {},
        TouchSensor: function TouchSensor() {},
        useSensor: () => undefined,
        useSensors: () => [],
        useDraggable: () => ({attributes: {}, listeners: {}, setNodeRef: () => {}, isDragging: false}),
        useDroppable: () => ({isOver: false, setNodeRef: () => {}}),
    };
});

const mockGrid = {};
jest.mock('../rummikub/components/GridContainer', () => {
    const React = require('react');
    return function GridContainerMock(props) {
        mockGrid[props.gridId] = {onCellTap: props.onCellTap, onLongPress: props.onLongPress};
        return React.createElement('div', {'data-testid': `grid-${props.gridId}`});
    };
});

const mockBuzz = jest.fn();
const mockPlay = jest.fn();
jest.mock('../rummikub/sound/sfx', () => ({
    play: (...a) => mockPlay(...a), place: () => {}, milestone: () => {}, buzz: (...a) => mockBuzz(...a),
}));
jest.mock('../rummikub/juice/effects', () => ({
    celebrateGroups: () => {}, burstAt: () => {}, kick: () => {}, flash: () => {}, floatText: () => {},
}));
jest.mock('../rummikub/components/ChatPanel', () => () => <div/>);

import Board from '../rummikub/components/Board';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';

// Two contiguous hand tiles for player 0 — long-pressing one selects the pair.
const handA = buildTileObj(1, COLOR.red, 0);
const handB = buildTileObj(2, COLOR.red, 0);

const matchData = [
    {id: 0, name: 'Alice', isConnected: true},
    {id: 1, name: 'Bob', isConnected: true},
];

function makeMoves() {
    return {moveTiles: jest.fn(), insertTilesWithPush: jest.fn(), clearRecentlyDrawnTiles: jest.fn()};
}

function renderBoard(tilePositions) {
    const moves = makeMoves();
    const G = {
        tilePositions,
        tilesPool: [],
        gameStateStack: [],
        redoMoveStack: [],
        recentlyDrawnTiles: [],
        lastPlay: null,
        timerExpireAt: null,
        timePerTurn: 30,
        handCounts: {'0': 14, '1': 14},
        firstMoveDone: [true, true],
    };
    const ctx = {phase: 'play', currentPlayer: '0', numPlayers: 2, gameover: null};
    render(
        <Board
            G={G}
            ctx={ctx}
            moves={moves}
            playerID={'0'}
            matchData={matchData}
            matchID={'m1'}
            events={{endPhase: jest.fn()}}
            chatMessages={[]}
            sendChatMessage={() => {}}
            isConnected={true}
        />
    );
    return moves;
}

// A committed board tile sitting at (col,row).
function boardTile(id, col, row) {
    return {id, col, row, gridId: 'b', playerID: null, tmp: false};
}
// A hand tile for player 0 at (col,row).
function handTile(id, col, row) {
    return {id, col, row, gridId: 'h', playerID: '0'};
}

beforeEach(() => {
    mockBuzz.mockClear();
    mockPlay.mockClear();
});

test('board drop onto an OCCUPIED run routes to insertTilesWithPush with the snapped args', () => {
    // Two hand tiles selected (long-press the pair); the board has a committed tile
    // at col 5, row 0. Dropping the pair so its run starts on col 5 hits that tile.
    const tilePositions = {
        [handA]: handTile(handA, 0, 0),
        [handB]: handTile(handB, 1, 0),
        [9001]: boardTile(9001, 5, 0),
    };
    const moves = renderBoard(tilePositions);

    act(() => { mockGrid['b'].onLongPress(handA); });
    act(() => { mockDnd.onDragEnd({active: {id: handA}, over: {id: 'b:5:0'}}); });

    expect(moves.insertTilesWithPush).toHaveBeenCalledTimes(1);
    const a = moves.insertTilesWithPush.mock.calls[0];
    expect(a[0]).toBe(5);            // target col T
    expect(a[1]).toBe(0);            // row
    expect(a[2]).toBe('b');          // destGridId
    expect(String(a[3].id)).toBe(String(handA)); // tileIdObj
    expect(a[4].map(String)).toEqual([String(handA), String(handB)]); // ordered selection
    expect(moves.moveTiles).not.toHaveBeenCalled();
    expect(mockBuzz).not.toHaveBeenCalled();
    expect(mockPlay).toHaveBeenCalledWith('place');
});

test('board drop onto a FREE target routes to moveTiles, not insertTilesWithPush', () => {
    const tilePositions = {[handA]: handTile(handA, 0, 0)};
    const moves = renderBoard(tilePositions);

    act(() => { mockDnd.onDragEnd({active: {id: handA}, over: {id: 'b:3:0'}}); });

    expect(moves.moveTiles).toHaveBeenCalledTimes(1);
    expect(moves.moveTiles.mock.calls[0][0]).toBe(3); // snapped col
    expect(moves.moveTiles.mock.calls[0][1]).toBe(0); // row
    expect(moves.moveTiles.mock.calls[0][2]).toBe('b');
    expect(moves.insertTilesWithPush).not.toHaveBeenCalled();
    expect(mockBuzz).not.toHaveBeenCalled();
});

test('an OUT-OF-BOUNDS board drop (T+N>32) stays on the resolveDropSlot/moveTiles near-edge snap', () => {
    // A 2-tile run dropped at col 31 would overflow (31+2 > 32). The row is free,
    // so the existing path snaps it to the nearest legal run, NOT push and NOT reject.
    const tilePositions = {
        [handA]: handTile(handA, 0, 0),
        [handB]: handTile(handB, 1, 0),
    };
    const moves = renderBoard(tilePositions);

    act(() => { mockGrid['b'].onLongPress(handA); });
    act(() => { mockDnd.onDragEnd({active: {id: handA}, over: {id: 'b:31:0'}}); });

    expect(moves.moveTiles).toHaveBeenCalledTimes(1);
    expect(moves.moveTiles.mock.calls[0][0]).toBe(30); // snapped back to 30,31
    expect(moves.insertTilesWithPush).not.toHaveBeenCalled();
    expect(mockBuzz).not.toHaveBeenCalled();
});

test('an occupied board drop whose push has no room (insertWithPush -> null) buzzes and sends no move', () => {
    // Fill board row 0 completely so the colliding run can shift neither way.
    const tilePositions = {[handA]: handTile(handA, 0, 1)};
    for (let c = 0; c < 32; c++) tilePositions[1000 + c] = boardTile(1000 + c, c, 0);
    const moves = renderBoard(tilePositions);

    act(() => { mockDnd.onDragEnd({active: {id: handA}, over: {id: 'b:5:0'}}); });

    expect(mockBuzz).toHaveBeenCalled();
    expect(moves.insertTilesWithPush).not.toHaveBeenCalled();
    expect(moves.moveTiles).not.toHaveBeenCalled();
});

test('a hand-row drop keeps moveTiles even when the target cell is occupied', () => {
    // The guard is gridId === 'b'; a hand target whose run is occupied must NOT push.
    const tilePositions = {
        [handA]: handTile(handA, 5, 0), // dragged tile
        [handB]: handTile(handB, 1, 0), // occupies the tapped/dropped target cell
    };
    const moves = renderBoard(tilePositions);

    act(() => { mockDnd.onDragEnd({active: {id: handA}, over: {id: 'h:1:0'}}); });

    expect(moves.moveTiles).toHaveBeenCalledTimes(1);
    expect(moves.moveTiles.mock.calls[0][2]).toBe('h');
    expect(moves.insertTilesWithPush).not.toHaveBeenCalled();
});

test('onCellTap on a free cell whose run overlaps an occupied neighbour routes to insertTilesWithPush', () => {
    // The tapped cell (col 5) is empty but the 2-wide run overlaps a committed tile
    // at col 6 — the same occupied-run split applies to tap placement.
    const tilePositions = {
        [handA]: handTile(handA, 0, 0),
        [handB]: handTile(handB, 1, 0),
        [9002]: boardTile(9002, 6, 0),
    };
    const moves = renderBoard(tilePositions);

    act(() => { mockGrid['b'].onLongPress(handA); });
    act(() => { mockGrid['b'].onCellTap('b', 5, 0); });

    expect(moves.insertTilesWithPush).toHaveBeenCalledTimes(1);
    const a = moves.insertTilesWithPush.mock.calls[0];
    expect(a[0]).toBe(5);
    expect(a[1]).toBe(0);
    expect(a[2]).toBe('b');
    expect(a[4].map(String)).toEqual([String(handA), String(handB)]);
    expect(moves.moveTiles).not.toHaveBeenCalled();
    expect(mockBuzz).not.toHaveBeenCalled();
    expect(mockPlay).toHaveBeenCalledWith('place');
});

test('onCellTap on a fully free board run routes to moveTiles, not insertTilesWithPush', () => {
    const tilePositions = {
        [handA]: handTile(handA, 0, 0),
        [handB]: handTile(handB, 1, 0),
    };
    const moves = renderBoard(tilePositions);

    act(() => { mockGrid['b'].onLongPress(handA); });
    act(() => { mockGrid['b'].onCellTap('b', 3, 0); });

    expect(moves.moveTiles).toHaveBeenCalledTimes(1);
    expect(moves.moveTiles.mock.calls[0][0]).toBe(3);
    expect(moves.insertTilesWithPush).not.toHaveBeenCalled();
    expect(mockBuzz).not.toHaveBeenCalled();
});
