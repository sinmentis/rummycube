import React from 'react';
import {useDroppable} from '@dnd-kit/core'
import {Tile} from "./Tile";
import {makeSlotId} from "../dndUtil";


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
                                 handleTileSelection
                             }) => {
    const {setNodeRef, isOver} = useDroppable({id: makeSlotId(gridId, col, row)})

    if (tile) {
        return (
            <div ref={setNodeRef} className='grid-item'>
                <Tile
                    tile={tile}
                    canDnD={canDnD}
                    isValid={isValid}
                    isSelected={isSelected}
                    isPlayable={isPlayable}
                    isNewlyAdded={isNewlyAdded}
                    handleTileSelection={handleTileSelection}
                />
            </div>
        )
    }
    // Tap-to-place (S3-U8): while a selection is live and the grid is droppable,
    // an empty cell is a tap-target — it wears the same .slot-valid cue as a live
    // drag and, on click, hands its coords to onCellTap to place the selection
    // through the same validated path as drag. stopPropagation keeps the board's
    // click-to-clear-selection handler from firing on a placement.
    const isTapTarget = (isDragActive || hasSelection) && canDnD
    const onClick = (hasSelection && canDnD && onCellTap)
        ? (e) => { e.stopPropagation(); onCellTap(gridId, col, row); }
        : undefined
    return <div
        ref={setNodeRef}
        onClick={onClick}
        style={{backgroundColor: (canDnD && isOver) ? 'rgba(71,179,86,0.43)' : ''}}
        className={'grid-item' + (isTapTarget ? ' slot-valid' : '')}/>
})


export default GridSlot
