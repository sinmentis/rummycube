import React from 'react';
import {render, act} from '@testing-library/react';

// T7 (WS-B/WS-D): the Board drop dispatch consolidation + the classic 1-tile
// joker retrieve via drag. onDragEnd / onCellTap now route through the pure
// resolveDropDispatch (T6) and act on the returned {kind, args}:
//   joker  -> moves.retrieveJoker(jokerId, id)
//   push   -> moves.insertTilesWithPush(...)
//   snap   -> moves.moveTiles(...)
//   reject -> buzz()  (no move)
// joker-swap precedes push (a settled joker cell is occupied, so without the
// earlier branch the push ripple would shove the joker aside instead of
// retrieving it). joker-swap is DRAG-ONLY — GridSlot only wires onCellTap on
// EMPTY cells, so a tap target is always empty and never triggers a retrieve.
//
// jsdom has no layout for @dnd-kit's pointer measurement, so we mock @dnd-kit/core
// to capture the DndContext's onDragEnd and drive it directly, mock GridContainer
// to capture onLongPress/onCellTap off the grid, and mock moves so we assert which
// move the client dispatches.

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
import {buildTileObj, BlackJoker} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';

// Valid board run red4 [BlackJoker = red5] red6 — the settled joker represents 5.
const red4 = buildTileObj(4, COLOR.red, 0);
const red5 = buildTileObj(5, COLOR.red, 0); // matching hand tile (value == 5)
const red6 = buildTileObj(6, COLOR.red, 0);
const red7 = buildTileObj(7, COLOR.red, 0); // value-mismatched hand tile (value 7)

const matchData = [
    {id: 0, name: 'Alice', isConnected: true},
    {id: 1, name: 'Bob', isConnected: true},
];

function makeMoves() {
    return {moveTiles: jest.fn(), insertTilesWithPush: jest.fn(), retrieveJoker: jest.fn(), clearRecentlyDrawnTiles: jest.fn()};
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

// A settled board tile at (col,row).
function boardTile(id, col, row) {
    return {id, col, row, gridId: 'b', playerID: null, tmp: false};
}
// A hand tile for player 0 at (col,row).
function handTile(id, col, row) {
    return {id, col, row, gridId: 'h', playerID: '0'};
}

// red4@0 [BlackJoker@1 settled] red6@2 on row 0 — a currently-valid run whose
// joker freezes to red 5. `handTiles` are placed into player 0's hand.
function jokerBoard(handTiles) {
    const tp = {
        [red4]: boardTile(red4, 0, 0),
        [BlackJoker]: boardTile(BlackJoker, 1, 0),
        [red6]: boardTile(red6, 2, 0),
    };
    handTiles.forEach((tid, i) => { tp[tid] = handTile(tid, i, 0); });
    return tp;
}

const jokerCell = 'b:1:0';

beforeEach(() => {
    mockBuzz.mockClear();
    mockPlay.mockClear();
});

test('dragging a value-MATCHING hand tile onto a board joker retrieves it via moves.retrieveJoker', () => {
    const moves = renderBoard(jokerBoard([red5]));

    act(() => { mockDnd.onDragEnd({active: {id: red5}, over: {id: jokerCell}}); });

    expect(moves.retrieveJoker).toHaveBeenCalledTimes(1);
    const a = moves.retrieveJoker.mock.calls[0];
    expect(a[0]).toBe(BlackJoker);   // the board joker being retrieved
    expect(a[1]).toBe(red5);         // the matching hand tile swapped in
    // joker-swap precedes push/snap — neither geometric move fires.
    expect(moves.insertTilesWithPush).not.toHaveBeenCalled();
    expect(moves.moveTiles).not.toHaveBeenCalled();
    expect(mockBuzz).not.toHaveBeenCalled();
    expect(mockPlay).toHaveBeenCalledWith('place');
});

test('dragging a value-MISMATCHED hand tile onto the joker falls through to insertTilesWithPush', () => {
    // red7 (value 7) does not match the joker's represented 5, so jokerSwapTarget
    // rejects and the occupied joker cell routes to the push ripple instead.
    const moves = renderBoard(jokerBoard([red7]));

    act(() => { mockDnd.onDragEnd({active: {id: red7}, over: {id: jokerCell}}); });

    expect(moves.insertTilesWithPush).toHaveBeenCalledTimes(1);
    const a = moves.insertTilesWithPush.mock.calls[0];
    expect(a[0]).toBe(1);            // target col (the joker cell)
    expect(a[1]).toBe(0);            // row
    expect(a[2]).toBe('b');          // destGridId
    expect(String(a[3].id)).toBe(String(red7));
    expect(moves.retrieveJoker).not.toHaveBeenCalled();
    expect(moves.moveTiles).not.toHaveBeenCalled();
    expect(mockBuzz).not.toHaveBeenCalled();
    expect(mockPlay).toHaveBeenCalledWith('place');
});

test('dragging onto a FREE board cell routes to moveTiles', () => {
    const moves = renderBoard(jokerBoard([red5]));

    // col 6 is empty; a single tile there snaps and moves, no push, no retrieve.
    act(() => { mockDnd.onDragEnd({active: {id: red5}, over: {id: 'b:6:0'}}); });

    expect(moves.moveTiles).toHaveBeenCalledTimes(1);
    expect(moves.moveTiles.mock.calls[0][0]).toBe(6); // snapped col
    expect(moves.moveTiles.mock.calls[0][1]).toBe(0); // row
    expect(moves.moveTiles.mock.calls[0][2]).toBe('b');
    expect(moves.retrieveJoker).not.toHaveBeenCalled();
    expect(moves.insertTilesWithPush).not.toHaveBeenCalled();
    expect(mockBuzz).not.toHaveBeenCalled();
});

test('dragging onto a board run with no room to push (insertWithPush -> null) buzzes and sends no move', () => {
    // Fill row 0 completely so the colliding run can shift neither way.
    const tilePositions = {[red5]: handTile(red5, 0, 1)};
    for (let c = 0; c < 32; c++) tilePositions[1000 + c] = boardTile(1000 + c, c, 0);
    const moves = renderBoard(tilePositions);

    act(() => { mockDnd.onDragEnd({active: {id: red5}, over: {id: 'b:5:0'}}); });

    expect(mockBuzz).toHaveBeenCalled();
    expect(moves.retrieveJoker).not.toHaveBeenCalled();
    expect(moves.insertTilesWithPush).not.toHaveBeenCalled();
    expect(moves.moveTiles).not.toHaveBeenCalled();
});
