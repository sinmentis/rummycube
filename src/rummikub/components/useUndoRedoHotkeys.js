import {useEffect} from "react";

// S2-U6: map a keydown event to an undo/redo intent.
// Ctrl/Cmd+Z -> undo, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y -> redo.
// Returns 'undo', 'redo', or null when the event is not a hotkey.
export function resolveUndoRedoIntent(e) {
    if (!e || (!e.ctrlKey && !e.metaKey)) return null;
    const key = (e.key || '').toLowerCase();
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (key === 'y') return 'redo';
    return null;
}

// Window keydown handler for keyboard undo/redo. Fires onUndo/onRedo only when
// the matching action is enabled (caller mirrors the button disabled guards:
// stack length, not gameover, your turn, not waiting). preventDefault stops the
// browser from hijacking Ctrl+Z. The listener is cleaned up on unmount.
export function useUndoRedoHotkeys({canUndo, canRedo, onUndo, onRedo}) {
    useEffect(() => {
        const handler = (e) => {
            const intent = resolveUndoRedoIntent(e);
            if (!intent) return;
            if (intent === 'undo') {
                if (!canUndo) return;
                e.preventDefault();
                onUndo();
            } else {
                if (!canRedo) return;
                e.preventDefault();
                onRedo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [canUndo, canRedo, onUndo, onRedo]);
}
