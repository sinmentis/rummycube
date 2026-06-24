import React, {useCallback} from 'react';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faSmileBeam} from "@fortawesome/free-solid-svg-icons";
import {getTileValue, isJoker, getTileColor} from "../util";
import {useDraggable} from '@dnd-kit/core';
import {COLORS, TILE_WIDTH} from "../constants";


function getAbsolutePosition(relativePosition) {
    return {
        x: relativePosition.x * window.innerWidth,
        y: relativePosition.y * window.innerHeight,
    };
}

function TilePreview({tile, isSelected, isDragging, isValid, isPlayable, position, boardGriBoundingBox, index, newlyAdded}) {
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
            style={getTileStyle(isSelected, isDragging, isValid, position, index, newlyAdded)}
            className={"tile tile-clickable border-dark" + (newlyAdded === true ? " tile-drawn" : "") + (isPlayable === true ? " tile-playable" : "")}>
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

function getTileStyle(selected, isDragging, isValid, position, index, newlyAdded) {
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
        cursor: 'move',
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

const Tile = React.memo(function Tile({tile, canDnD, isSelected, isValid, isPlayable, handleTileSelection, isNewlyAdded}) {
    const {attributes, listeners, setNodeRef, isDragging} = useDraggable({id: tile, disabled: !canDnD});

    const onClick = useCallback((e) => {
        handleTileSelection(tile, e.shiftKey, e.ctrlKey || e.metaKey)
    }, [tile, handleTileSelection])

    const jokerLabel = isJoker(tile) ? 'Joker (wildcard)' : undefined
    const playableLabel = isPlayable === true ? 'Playable: can extend a board group' : undefined
    const ariaLabel = [jokerLabel, playableLabel].filter(Boolean).join('. ') || undefined

    return (
        <div ref={setNodeRef} {...listeners} {...attributes} onClick={onClick} id={tile}
             aria-label={ariaLabel} title={ariaLabel}
             style={{touchAction: 'none', opacity: isDragging ? 0.4 : 1, cursor: canDnD ? 'grab' : 'default'}}>
            <TilePreview
                tile={tile}
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
