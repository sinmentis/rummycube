import {useDroppable} from '@dnd-kit/core'
import {Tile} from "./Tile";
import {makeSlotId} from "../dndUtil";


const GridSlot = ({
                      tile,
                      col,
                      row,
                      gridId,
                      validTiles,
                      highlightTiles,
                      canDnD,
                      selectedTiles,
                      handleTileSelection,
                      newlyAdded
                  }) => {
    const {setNodeRef, isOver} = useDroppable({id: makeSlotId(gridId, col, row)})
    const isSelected = tile && selectedTiles.indexOf(tile) !== -1 ? true : false

    if (tile) {
        let isValid
        if (highlightTiles) {
            isValid = validTiles.indexOf(tile) !== -1
        }
        return (
            <div ref={setNodeRef} className='grid-item' key={tile}>
                <Tile
                    tile={tile}
                    canDnD={canDnD}
                    isValid={isValid}
                    isSelected={isSelected}
                    handleTileSelection={handleTileSelection}
                    selectedTiles={selectedTiles}
                    newlyAdded={newlyAdded}
                />
            </div>
        )
    }
    return <div
        ref={setNodeRef}
        style={{backgroundColor: (canDnD && isOver) ? 'rgba(71,179,86,0.43)' : ''}}
        className='grid-item'/>
}


export default GridSlot
