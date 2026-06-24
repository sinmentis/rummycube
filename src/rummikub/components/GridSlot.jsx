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
    return <div
        ref={setNodeRef}
        style={{backgroundColor: (canDnD && isOver) ? 'rgba(71,179,86,0.43)' : ''}}
        className={'grid-item' + (isDragActive && canDnD ? ' slot-valid' : '')}/>
})


export default GridSlot
