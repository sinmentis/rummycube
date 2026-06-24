import React from 'react';
import GridSlot from "./GridSlot";

const Centered = function ({cols, colWidth, className, children}) {
    return <div
        className={className}
        style={{
            "width": `${cols * colWidth}vw`,
            "margin": `0 auto`,
        }}
    >{children}</div>
}

const Grid = function ({cols, colWidth, rows, children}) {
    return <div
        className='grid-container'
        style={{
            "gridTemplateColumns": `repeat(${cols}, ${colWidth}vw)`,
            "gridTemplateRows": `repeat(${rows}, 7vh)`,
        }}>{children}</div>
}

const GridContainer = function ({
                                    tiles2dArray,
                                    rows,
                                    cols,
                                    canDnD,
                                    isDragActive,
                                    gridId,
                                    validTiles,
                                    highlightTiles,
                                    playableTiles,
                                    selectedTiles,
                                    onCellTap,
                                    handleTileSelection,
                                    newlyAdded,
                                    className
                                }) {

    let colWidth = 2.2
    const selectedSet = new Set(selectedTiles)
    const playableSet = new Set(playableTiles)
    const hasSelection = selectedSet.size > 0
    let gridItems = []
    let key = 0
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            let tile = tiles2dArray[y] && tiles2dArray[y][x]
            let isSelected = tile ? selectedSet.has(tile) : false
            let isPlayable = tile ? playableSet.has(tile) : false
            let isValid
            if (tile && highlightTiles) {
                isValid = validTiles.indexOf(tile) !== -1
            }
            let isNewlyAdded = Array.isArray(newlyAdded)
                ? newlyAdded.includes(parseInt(tile))
                : !!newlyAdded
            let gridTile = <GridSlot
                canDnD={canDnD}
                isDragActive={isDragActive}
                hasSelection={hasSelection}
                onCellTap={onCellTap}
                handleTileSelection={handleTileSelection}
                gridId={gridId}
                row={y}
                col={x}
                key={key}
                tile={tile}
                isSelected={isSelected}
                isValid={isValid}
                isPlayable={isPlayable}
                isNewlyAdded={isNewlyAdded}
            />
            gridItems.push(gridTile)
            key++
        }
    }
    return (
        <Centered cols={cols} colWidth={colWidth} className={className}>
            <Grid colWidth={colWidth} cols={cols} rows={rows}>{gridItems}</Grid>
        </Centered>
    )
}


export default GridContainer
