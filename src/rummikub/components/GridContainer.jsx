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
                                    onLongPress,
                                    newlyAdded,
                                    jokerHeat,
                                    lockedTiles,
                                    className
                                }) {

    let colWidth = 2.2
    const selectedSet = new Set(selectedTiles)
    const playableSet = new Set(playableTiles)
    const lockedSet = new Set((lockedTiles || []).map(Number))
    let firstLocked = true
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
            // Chaos: only the board grid is passed jokerHeat, and only joker cells
            // have an entry — heat is per-cell so the danger meter is board-only.
            let tileHeat = tile ? jokerHeat?.[tile]?.heat : undefined
            const isLockedCell = tile != null && lockedSet.has(Number(tile))
            const isLockHead = isLockedCell && firstLocked
            if (isLockedCell) firstLocked = false
            let gridTile = <GridSlot
                canDnD={canDnD}
                isDragActive={isDragActive}
                hasSelection={hasSelection}
                onCellTap={onCellTap}
                handleTileSelection={handleTileSelection}
                onLongPress={onLongPress}
                gridId={gridId}
                row={y}
                col={x}
                key={key}
                tile={tile}
                isSelected={isSelected}
                isValid={isValid}
                isPlayable={isPlayable}
                isNewlyAdded={isNewlyAdded}
                jokerHeat={tileHeat}
                isLocked={isLockedCell}
                isLockHead={isLockHead}
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
