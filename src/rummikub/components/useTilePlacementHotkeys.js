import {useEffect, useRef} from "react";
import {HAND_GRID_ID} from "../constants";

// True when the event originates from a text-editable element, so a placement
// shortcut must yield to native typing (e.g. Enter to send a chat message). Mirrors
// the guard in useUndoRedoHotkeys.
function isEditableTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    return typeof target.closest === 'function'
        && !!target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]');
}

// Enter or Space — the "activate the focused thing" keys.
function isPlacementKey(e) {
    const key = e && e.key;
    return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

// T8 (WS-G): keyboard tap-to-place. A window keydown handler that places the
// FOCUSED hand tile when Enter/Space is pressed, mirroring useUndoRedoHotkeys
// (same editable-target guard, same enabled gating, same global-listener style).
//
//   enabled     gate matching the placement's preconditions (your turn, not
//               waiting, not gameover). When false no listener is installed.
//   getTilePos  id => the tile's position record ({gridId, col, row, ...}); used
//               to confirm the focused element is a HAND tile.
//   onPlaceTile called with the focused hand tile's id to place it.
//
// v1 is hand -> board only: focusing a board tile (or anything that is not one of
// your hand tiles) is a no-op, and an editable target keeps native behaviour.
// getTilePos/onPlaceTile are read through refs so an inline closure from the caller
// never churns the window listener (only `enabled` toggles re-subscribe).
export function useTilePlacementHotkeys({enabled, getTilePos, onPlaceTile}) {
    const getTilePosRef = useRef(getTilePos);
    const onPlaceTileRef = useRef(onPlaceTile);
    useEffect(() => { getTilePosRef.current = getTilePos; });
    useEffect(() => { onPlaceTileRef.current = onPlaceTile; });

    useEffect(() => {
        if (!enabled) return;
        const handler = (e) => {
            // Typing in a text field (e.g. chat) keeps native Enter/Space.
            if (isEditableTarget(e.target)) return;
            if (!isPlacementKey(e)) return;
            const tileId = e.target && e.target.id;
            if (!tileId) return;
            const pos = getTilePosRef.current(tileId);
            // Only a hand tile is placeable in v1; a board tile / unknown id is a no-op.
            if (!pos || pos.gridId !== HAND_GRID_ID) return;
            e.preventDefault();
            onPlaceTileRef.current(tileId);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [enabled]);
}
