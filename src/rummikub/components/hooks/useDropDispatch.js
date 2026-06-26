import {useState, useCallback} from "react";
import {parseSlotId, resolveDropDispatch} from "../../dndUtil";
import {BOARD_COLS, HAND_COLS} from "../../constants";
import {play, buzz} from "../../sound/sfx";

// T10 (ARCH-1): the drag/drop/tap PLACEMENT pipeline, extracted out of Board so
// Board is mostly a layout shell. Behaviour is identical to the inlined version.
//
// THE INVARIANT: dispatchDrop reads `gRef.current.tilePositions` at DROP time, not
// a closed-over prop `G`. Board owns gRef/stateRef and their write effects and
// passes the refs in; the callbacks here read `.current` so a multi-drag during a
// rapid server update still dispatches against the LIVE board (correct push/snap/
// joker decision) instead of a stale snapshot. Likewise onDragEnd/onCellTap read
// `stateRef.current.selectedTiles` (live), never a captured selection.
export function useDropDispatch({moves, playerID, gRef, stateRef, setState, markSyncing}) {
    const [activeTile, setActiveTile] = useState(null);
    // True between onDragStart and onDragEnd. Threaded down so empty board cells
    // can show the .slot-valid droppable cue while a drag is in flight.
    const [isDragActive, setIsDragActive] = useState(false);
    // T7 (WS-B/WS-D): the single drop dispatch shared by drag (onDragEnd) and
    // empty-cell tap (onCellTap). resolveDropDispatch folds joker-swap -> push ->
    // snap -> reject into one pure decision; the client only chooses the path while
    // the server move stays authoritative (a wrong guess snaps back as INVALID_MOVE,
    // not a desync). allowJokerSwap is on, but a retrieve only ever fires on a drag:
    // GridSlot wires onCellTap on EMPTY cells, so a tap target never holds a joker.
    //   target    = {gridId, col, row} (a parseSlotId product)
    //   primaryId = the dragged/primary tile id
    //   selection = the tiles being placed (rack reading order restored downstream)
    const dispatchDrop = useCallback((target, primaryId, selection) => {
        const d = resolveDropDispatch({
            tilePositions: gRef.current.tilePositions,
            target, primaryId, selection,
            playerID, boardCols: BOARD_COLS, handCols: HAND_COLS, allowJokerSwap: true,
        });
        switch (d.kind) {
            case 'joker':
                moves.retrieveJoker(...d.args);
                break;
            case 'push':
                moves.insertTilesWithPush(...d.args);
                break;
            case 'snap':
                moves.moveTiles(...d.args);
                break;
            default:
                // reject: no legal landing / a hopeless push. Non-destructive — a
                // light buzz, no server call, selection cleared.
                buzz();
                setState({selectedTiles: [], lastSelectedTileId: null});
                return;
        }
        markSyncing();
        play('place');
        setState({selectedTiles: [], lastSelectedTileId: null});
        // gRef/setState are stable (ref + useState setter); reading gRef.current
        // live at drop time is the whole point — never add it as a dep.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [moves, playerID, markSyncing]);
    const onDragStart = useCallback((e) => {
        const id = e.active.id;
        setActiveTile(id);
        setIsDragActive(true);
        setState(prev => prev.selectedTiles.includes(id) ? prev : {selectedTiles: [id], lastSelectedTileId: id});
        // setState is a stable useState setter.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const onDragEnd = useCallback((e) => {
        setActiveTile(null);
        setIsDragActive(false);
        if (!e.over) return;
        const target = parseSlotId(String(e.over.id));
        const id = e.active.id;
        // A bare single-tile drag carries no selection; normalize to the dragged id
        // so the dispatch always has the tiles being placed.
        const selectedTiles = stateRef.current.selectedTiles;
        const selection = selectedTiles.length ? selectedTiles : [id];
        dispatchDrop(target, id, selection);
        // stateRef is a stable ref; reading stateRef.current.selectedTiles live is intentional.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatchDrop]);
    // Tap-to-place (S3-U8): the non-drag placement path. When a selection is live
    // and the player taps an empty droppable cell, route it through the SAME
    // dispatchDrop the drag uses. GridSlot only wires this onto empty cells when
    // canDnD, so turn/phase gating matches the drag cue and the tap target is always
    // empty — joker-swap (drag-only) never fires here. An empty selection is a no-op.
    const onCellTap = useCallback((gridId, col, row) => {
        const selectedTiles = stateRef.current.selectedTiles;
        if (!selectedTiles.length) return;
        dispatchDrop({gridId, col, row}, selectedTiles[0], selectedTiles);
        // stateRef is a stable ref; reading stateRef.current.selectedTiles live is intentional.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatchDrop])
    // TODO(S3-U8 stretch): keyboard placement — arrow-key a cursor over empty
    // cells and Enter to call onCellTap on the focused cell. Deferred: it needs a
    // focusable cell/roving-tabindex grid + a visible focus ring, which is more
    // than the "only if cheap" bar. The tap path above is the touch on-ramp; the
    // keyboard cursor is a follow-up.
    return {activeTile, isDragActive, onDragStart, onDragEnd, onCellTap, dispatchDrop};
}
