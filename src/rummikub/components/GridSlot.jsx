import React from 'react';
import {useDroppable} from '@dnd-kit/core'
import {Tile} from "./Tile";
import {makeSlotId} from "../dndUtil";
import {BOARD_GRID_ID} from "../constants";


const GridSlot = React.memo(({
                                 tile,
                                 col,
                                 row,
                                 gridId,
                                 canDnD,
                                 isDragActive,
                                 hasSelection,
                                 onCellTap,
                                 isSelected,
                                 isValid,
                                 isPlayable,
                                 isNewlyAdded,
                                 jokerHeat,
                                 isLockedRow,
                                 handleTileSelection,
                                 onLongPress
                             }) => {
    const {setNodeRef, isOver} = useDroppable({id: makeSlotId(gridId, col, row)})

    if (tile) {
        return (
            <div ref={setNodeRef} className={'grid-item' + (isLockedRow ? ' locked-row' : '')}>
                {isLockedRow && col === 0 && <span className="lock-mark" aria-hidden="true">🔒</span>}
                <Tile
                    tile={tile}
                    canDnD={canDnD}
                    isValid={isValid}
                    isSelected={isSelected}
                    isPlayable={isPlayable}
                    isNewlyAdded={isNewlyAdded}
                    jokerHeat={jokerHeat}
                    handleTileSelection={handleTileSelection}
                    onLongPress={onLongPress}
                />
            </div>
        )
    }
    // Tap-to-place (S3-U8): while a selection is live and the grid is droppable,
    // an empty cell is a tap-target — it wears the same .slot-valid cue as a live
    // drag and, on click, hands its coords to onCellTap to place the selection
    // through the same validated path as drag. stopPropagation keeps the board's
    // click-to-clear-selection handler from firing on a placement.
    // WS-D: the cue is board-only — hand empty cells never light up.
    const isBoard = gridId === BOARD_GRID_ID
    const isTapTarget = isBoard && (isDragActive || hasSelection) && canDnD
    const onClick = (hasSelection && canDnD && onCellTap)
        ? (e) => { e.stopPropagation(); onCellTap(gridId, col, row); }
        : undefined
    return <div
        ref={setNodeRef}
        onClick={onClick}
        className={'grid-item'
            + (isTapTarget ? ' slot-valid' : '')
            + (isLockedRow ? ' locked-row' : '')
            + (isBoard && canDnD && isOver ? ' slot-over' : '')}>
        {isLockedRow && col === 0 && <span className="lock-mark" aria-hidden="true">🔒</span>}
    </div>
})


export default GridSlot
