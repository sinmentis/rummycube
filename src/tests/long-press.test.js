import React from 'react';
import {render, fireEvent, createEvent, act} from '@testing-library/react';
import {DndContext} from '@dnd-kit/core';
import {Tile} from '../rummikub/components/Tile';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';

// WS-5 (T6): Tile carries a local pointer press-timer. A ~250ms hold (with <6px
// movement) fires onLongPress(tile) so Board can select the whole contiguous
// group; a firedRef suppresses the click that follows a long-press so the group
// isn't toggled back to a single tile. A short tap still single-selects, and any
// movement >6px or a pointer up/cancel/leave clears the timer.
//
// jsdom has no PointerEvent and drops clientX/clientY off the synthetic event,
// so for movement assertions we build the event and pin the coords onto it.
function pointerEventWithCoords(type, node, x, y) {
    const ev = createEvent[type](node, {clientX: x, clientY: y});
    Object.defineProperty(ev, 'clientX', {value: x});
    Object.defineProperty(ev, 'clientY', {value: y});
    return ev;
}

function renderTile(extra = {}) {
    const onLongPress = jest.fn();
    const handleTileSelection = jest.fn();
    const tile = buildTileObj(5, COLOR.red, 0);
    const utils = render(
        <DndContext>
            <Tile
                tile={tile}
                canDnD={true}
                onLongPress={onLongPress}
                handleTileSelection={handleTileSelection}
                {...extra}
            />
        </DndContext>
    );
    const node = document.getElementById(String(tile));
    return {...utils, node, tile, onLongPress, handleTileSelection};
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
});

test('holding for >=250ms fires onLongPress with the tile', () => {
    const {node, tile, onLongPress} = renderTile();
    fireEvent.pointerDown(node);
    act(() => jest.advanceTimersByTime(250));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith(tile);
});

test('a short press (<250ms) does not fire onLongPress and a tap still single-selects', () => {
    const {node, tile, onLongPress, handleTileSelection} = renderTile();
    fireEvent.pointerDown(node);
    act(() => jest.advanceTimersByTime(200));
    fireEvent.pointerUp(node);
    act(() => jest.advanceTimersByTime(100)); // past 250ms total — timer must be cleared
    expect(onLongPress).not.toHaveBeenCalled();
    fireEvent.click(node);
    expect(handleTileSelection).toHaveBeenCalledTimes(1);
    expect(handleTileSelection).toHaveBeenCalledWith(tile, false, false);
});

test('the click that follows a long-press is suppressed, then selection resumes', () => {
    const {node, onLongPress, handleTileSelection} = renderTile();
    fireEvent.pointerDown(node);
    act(() => jest.advanceTimersByTime(250));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(node);
    // The browser fires a click right after pointerup; it must NOT re-select.
    fireEvent.click(node);
    expect(handleTileSelection).not.toHaveBeenCalled();
    // A later, independent tap selects normally again (firedRef is one-shot).
    fireEvent.click(node);
    expect(handleTileSelection).toHaveBeenCalledTimes(1);
});

test('a move beyond 6px cancels the long-press timer', () => {
    const {node, onLongPress} = renderTile();
    fireEvent(node, pointerEventWithCoords('pointerDown', node, 0, 0));
    fireEvent(node, pointerEventWithCoords('pointerMove', node, 20, 20)); // ~28px
    act(() => jest.advanceTimersByTime(250));
    expect(onLongPress).not.toHaveBeenCalled();
});

test('a small move within 6px does not cancel the long-press', () => {
    const {node, tile, onLongPress} = renderTile();
    fireEvent(node, pointerEventWithCoords('pointerDown', node, 0, 0));
    fireEvent(node, pointerEventWithCoords('pointerMove', node, 3, 3)); // ~4.2px
    act(() => jest.advanceTimersByTime(250));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith(tile);
});

test('a pointer leaving the tile mid-hold cancels the long-press', () => {
    const {node, onLongPress} = renderTile();
    fireEvent.pointerDown(node);
    fireEvent.pointerLeave(node);
    act(() => jest.advanceTimersByTime(250));
    expect(onLongPress).not.toHaveBeenCalled();
});

test('a pointer cancel mid-hold cancels the long-press', () => {
    const {node, onLongPress} = renderTile();
    fireEvent.pointerDown(node);
    fireEvent.pointerCancel(node);
    act(() => jest.advanceTimersByTime(250));
    expect(onLongPress).not.toHaveBeenCalled();
});

test('a non-draggable tile does not arm the long-press timer but still single-selects', () => {
    const {node, tile, onLongPress, handleTileSelection} = renderTile({canDnD: false});
    fireEvent.pointerDown(node);
    act(() => jest.advanceTimersByTime(250));
    expect(onLongPress).not.toHaveBeenCalled();
    fireEvent.click(node);
    expect(handleTileSelection).toHaveBeenCalledWith(tile, false, false);
});
