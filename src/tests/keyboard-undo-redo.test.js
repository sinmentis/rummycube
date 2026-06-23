import React from 'react';
import {render, cleanup} from '@testing-library/react';
import {resolveUndoRedoIntent, useUndoRedoHotkeys} from '../rummikub/components/useUndoRedoHotkeys';

// S2-U6: keyboard Undo/Redo. The window keydown handler must mirror the Undo/Redo
// button disabled guards: only fire on your turn when the action is available.

function Harness({canUndo, canRedo, onUndo, onRedo}) {
    useUndoRedoHotkeys({canUndo, canRedo, onUndo, onRedo});
    return null;
}

function key(opts) {
    return new KeyboardEvent('keydown', {bubbles: true, cancelable: true, ...opts});
}

afterEach(cleanup);

describe('resolveUndoRedoIntent', () => {
    test('Ctrl+Z -> undo', () => {
        expect(resolveUndoRedoIntent({ctrlKey: true, key: 'z'})).toBe('undo');
    });
    test('Cmd+Z -> undo', () => {
        expect(resolveUndoRedoIntent({metaKey: true, key: 'Z'})).toBe('undo');
    });
    test('Ctrl+Y -> redo', () => {
        expect(resolveUndoRedoIntent({ctrlKey: true, key: 'y'})).toBe('redo');
    });
    test('Ctrl+Shift+Z -> redo', () => {
        expect(resolveUndoRedoIntent({ctrlKey: true, shiftKey: true, key: 'z'})).toBe('redo');
    });
    test('plain z (no modifier) -> null', () => {
        expect(resolveUndoRedoIntent({key: 'z'})).toBeNull();
    });
    test('Ctrl+A (unrelated) -> null', () => {
        expect(resolveUndoRedoIntent({ctrlKey: true, key: 'a'})).toBeNull();
    });
});

describe('useUndoRedoHotkeys', () => {
    test('Ctrl+Z calls onUndo when undo is available', () => {
        const onUndo = jest.fn();
        const onRedo = jest.fn();
        render(<Harness canUndo canRedo={false} onUndo={onUndo} onRedo={onRedo}/>);
        window.dispatchEvent(key({ctrlKey: true, key: 'z'}));
        expect(onUndo).toHaveBeenCalledTimes(1);
        expect(onRedo).not.toHaveBeenCalled();
    });

    test('Ctrl+Y calls onRedo when redo is available', () => {
        const onUndo = jest.fn();
        const onRedo = jest.fn();
        render(<Harness canUndo={false} canRedo onUndo={onUndo} onRedo={onRedo}/>);
        window.dispatchEvent(key({ctrlKey: true, key: 'y'}));
        expect(onRedo).toHaveBeenCalledTimes(1);
        expect(onUndo).not.toHaveBeenCalled();
    });

    test('Ctrl+Shift+Z calls onRedo when redo is available', () => {
        const onRedo = jest.fn();
        render(<Harness canUndo canRedo onUndo={jest.fn()} onRedo={onRedo}/>);
        window.dispatchEvent(key({ctrlKey: true, shiftKey: true, key: 'z'}));
        expect(onRedo).toHaveBeenCalledTimes(1);
    });

    test('does NOT call onUndo when undo is unavailable (not your turn / empty stack)', () => {
        const onUndo = jest.fn();
        render(<Harness canUndo={false} canRedo={false} onUndo={onUndo} onRedo={jest.fn()}/>);
        window.dispatchEvent(key({ctrlKey: true, key: 'z'}));
        expect(onUndo).not.toHaveBeenCalled();
    });

    test('does NOT call onRedo when redo is unavailable', () => {
        const onRedo = jest.fn();
        render(<Harness canUndo canRedo={false} onUndo={jest.fn()} onRedo={onRedo}/>);
        window.dispatchEvent(key({ctrlKey: true, key: 'y'}));
        expect(onRedo).not.toHaveBeenCalled();
    });

    test('preventDefault is called for a handled hotkey', () => {
        render(<Harness canUndo canRedo={false} onUndo={jest.fn()} onRedo={jest.fn()}/>);
        const ev = key({ctrlKey: true, key: 'z'});
        window.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
    });

    test('does not preventDefault for an unrelated key', () => {
        render(<Harness canUndo canRedo onUndo={jest.fn()} onRedo={jest.fn()}/>);
        const ev = key({ctrlKey: true, key: 'a'});
        window.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(false);
    });

    test('removes the listener on unmount', () => {

        const onUndo = jest.fn();
        const {unmount} = render(<Harness canUndo canRedo={false} onUndo={onUndo} onRedo={jest.fn()}/>);
        unmount();
        window.dispatchEvent(key({ctrlKey: true, key: 'z'}));
        expect(onUndo).not.toHaveBeenCalled();
    });

    test('does NOT call onUndo when Ctrl+Z is typed in a text input (chat)', () => {
        const onUndo = jest.fn();
        render(<Harness canUndo canRedo={false} onUndo={onUndo} onRedo={jest.fn()}/>);
        const input = document.createElement('input');
        input.type = 'text';
        document.body.appendChild(input);
        const ev = key({ctrlKey: true, key: 'z'});
        input.dispatchEvent(ev);
        expect(onUndo).not.toHaveBeenCalled();
        // native text undo must be left alone
        expect(ev.defaultPrevented).toBe(false);
        document.body.removeChild(input);
    });

    test('does NOT call onUndo when Ctrl+Z is typed in a textarea', () => {
        const onUndo = jest.fn();
        render(<Harness canUndo canRedo={false} onUndo={onUndo} onRedo={jest.fn()}/>);
        const ta = document.createElement('textarea');
        document.body.appendChild(ta);
        const ev = key({ctrlKey: true, key: 'z'});
        ta.dispatchEvent(ev);
        expect(onUndo).not.toHaveBeenCalled();
        expect(ev.defaultPrevented).toBe(false);
        document.body.removeChild(ta);
    });
});