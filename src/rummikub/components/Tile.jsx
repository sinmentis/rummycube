import React, {useCallback, useEffect, useRef} from 'react';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faSmileBeam} from "@fortawesome/free-solid-svg-icons";
import {getTileValue, isJoker, getTileColor} from "../util";
import {useDraggable} from '@dnd-kit/core';
import {COLORS, TILE_WIDTH} from "../constants";

// Long-press to progressively pick up a tile and the contiguous run to its RIGHT
// (WS-A). The press-timer is kept entirely local to the leaf Tile so cancellation
// never has to reach across the tree: a hold of LONG_PRESS_MS with movement under
// MOVE_CANCEL_PX arms a repeating tick that fires onLongPress(tile, count) every
// LONG_PRESS_STEP_MS with an incrementing count, so Board grows the selection one
// tile per step. MOVE_CANCEL_PX matches the dnd-kit activation distance (6) so a
// real drag and a long-press never both win.
const LONG_PRESS_MS = 250;
// Tunable: one more tile is picked up every LONG_PRESS_STEP_MS (the first tick lands
// at LONG_PRESS_MS). Game-design suggested ~180ms for steps 2+; kept at 250 for now.
const LONG_PRESS_STEP_MS = LONG_PRESS_MS;
const MOVE_CANCEL_PX = 6;


function getAbsolutePosition(relativePosition) {
    return {
        x: relativePosition.x * window.innerWidth,
        y: relativePosition.y * window.innerHeight,
    };
}

function TilePreview({tile, canDnD, isSelected, isDragging, isValid, isPlayable, position, boardGriBoundingBox, index, newlyAdded}) {
    if (!tile) return null
    if (position && boardGriBoundingBox) {
        let absPos = getAbsolutePosition(position);
        const left = boardGriBoundingBox.left;
        const top = boardGriBoundingBox.top;
        const right = boardGriBoundingBox.right;
        const bottom = boardGriBoundingBox.bottom;

        const isXWithinBounds = absPos.x >= left && absPos.x <= right;
        const isYWithinBounds = absPos.y >= top && absPos.y <= bottom;

        if (!(isXWithinBounds && isYWithinBounds)) return null
    }
    let val = isJoker(tile) ? <FontAwesomeIcon icon={faSmileBeam}/> : getTileValue(tile)
    let validGlyph = isValid === true ? '✓' : isValid === false ? '✕' : ''
    return (
        <div
            style={getTileStyle(isSelected, isDragging, isValid, position, index, newlyAdded, canDnD)}
            className={"tile tile-clickable border-dark" + (newlyAdded === true ? " tile-drawn" : "") + (isPlayable === true ? " tile-playable" : "") + (isSelected === true ? " tile-selected" : "")}>
            {isPlayable === true &&
                <span className="tile-playable-mark" aria-hidden="true"/>}
            <div className={"tile-text tile-" + COLORS[getTileColor(tile)]}>{val}</div>
            <div className={"tile-subscript"} aria-hidden="true">{validGlyph}</div>
        </div>
    )
}

function getTileWidth() {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    return (TILE_WIDTH * viewportWidth) / 100;
}

function getTileStyle(selected, isDragging, isValid, position, index, newlyAdded, canDnD) {
    let backgroundColor = ''
    let border = ''
    let borderColor = ''
    if (isValid === true) {
        backgroundColor = 'rgba(159,255,113,0.68)'
    } else if (isValid === false) {
        backgroundColor = 'rgba(255,174,174,0.88)'
    }

    if (selected) {
        backgroundColor = '#c0c0c0'
        border = '2px solid'
        borderColor = '#6416ff'
    }

    if (newlyAdded === true) {
        backgroundColor = 'rgba(255,199,78,0.88)'
    }

    let result = {
        backgroundColor: backgroundColor,
        opacity: isDragging ? 0.5 : 1,
        fontSize: 25,
        fontWeight: 'bold',
        cursor: !canDnD ? 'default' : (isDragging ? 'grabbing' : 'grab'),
        border: border,
        borderColor: borderColor,
    }
    if (position) {
        let absPos = getAbsolutePosition(position)
        result.position = 'absolute'
        result.left = absPos.x + index * getTileWidth()
        result.top = absPos.y
    }

    return result
}

const Tile = React.memo(function Tile({tile, canDnD, isSelected, isValid, isPlayable, handleTileSelection, isNewlyAdded, onLongPress}) {
    const {attributes, listeners, setNodeRef, isDragging} = useDraggable({id: tile, disabled: !canDnD});

    const pressTimer = useRef(null);
    const startXY = useRef(null);
    const firedRef = useRef(false);
    const tickRef = useRef(0);

    const clearPressTimer = useCallback(() => {
        if (pressTimer.current) {
            clearInterval(pressTimer.current);
            pressTimer.current = null;
        }
    }, []);

    // Pointer events (not onMouseDown/onTouchStart, which are the dnd-kit
    // Mouse/Touch sensor activators in {...listeners}); pointer handlers coexist
    // without clobbering them. On a still hold we arm a repeating tick that picks up
    // the tile then one more of its rightward run per step; the firedRef then
    // swallows the click that the OS sends after pointerup so the selection isn't
    // immediately toggled back to a single tile.
    const onPointerDown = useCallback((e) => {
        if (!canDnD) return;
        firedRef.current = false;
        tickRef.current = 0;
        startXY.current = {x: e.clientX, y: e.clientY};
        clearPressTimer();
        pressTimer.current = setInterval(() => {
            firedRef.current = true;          // first tick onward swallows the trailing click
            tickRef.current += 1;
            onLongPress?.(tile, tickRef.current);
        }, LONG_PRESS_STEP_MS);
    }, [canDnD, tile, onLongPress, clearPressTimer]);

    const onPointerMove = useCallback((e) => {
        if (!pressTimer.current || !startXY.current) return;
        const dx = e.clientX - startXY.current.x;
        const dy = e.clientY - startXY.current.y;
        if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
            clearPressTimer();
        }
    }, [clearPressTimer]);

    const onClick = useCallback((e) => {
        if (firedRef.current) {
            firedRef.current = false;
            return;
        }
        handleTileSelection(tile, e.shiftKey, e.ctrlKey || e.metaKey)
    }, [tile, handleTileSelection])

    useEffect(() => () => clearPressTimer(), [clearPressTimer]);

    const jokerLabel = isJoker(tile) ? 'Joker (wildcard)' : undefined
    const playableLabel = isPlayable === true ? 'Playable: can extend a board group' : undefined
    const ariaLabel = [jokerLabel, playableLabel].filter(Boolean).join('. ') || undefined

    return (
        <div ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
             onPointerDown={onPointerDown} onPointerMove={onPointerMove}
             onPointerUp={clearPressTimer} onPointerCancel={clearPressTimer}
             onPointerLeave={clearPressTimer} id={tile}
             aria-label={ariaLabel} title={ariaLabel}
             style={{touchAction: 'none', opacity: isDragging ? 0.4 : 1, cursor: canDnD ? 'grab' : 'default'}}>
            <TilePreview
                tile={tile}
                canDnD={canDnD}
                isDragging={isDragging}
                isSelected={isSelected}
                isValid={isValid}
                isPlayable={isPlayable}
                newlyAdded={isNewlyAdded}
            />
        </div>
    )
})


export {Tile, TilePreview}
export default Tile
