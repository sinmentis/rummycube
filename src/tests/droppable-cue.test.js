import React from 'react';
import {render} from '@testing-library/react';
import {DndContext} from '@dnd-kit/core';
import GridContainer from '../rummikub/components/GridContainer';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';

// U10: empty cells carry the .slot-valid droppable cue while a drag is active and
// the grid is droppable (canDnD). Cells with a tile never get the cue, and the cue
// is absent when no drag is in flight.

const t1 = buildTileObj(5, COLOR.red, 0);
const tiles2dArray = [[t1, null, null]];

function renderGrid({isDragActive, canDnD, gridId = 'b'}) {
    return render(
        <DndContext>
            <GridContainer
                tiles2dArray={tiles2dArray}
                rows={1}
                cols={3}
                canDnD={canDnD}
                isDragActive={isDragActive}
                gridId={gridId}
                validTiles={[]}
                highlightTiles={false}
                selectedTiles={[]}
                moveTiles={() => {}}
                onTileDragEnd={() => {}}
                onLongPress={() => {}}
                handleTileSelection={() => {}}
                hoverPosition={null}
                setHoverPosition={() => {}}
                newlyAdded={[]}
            />
        </DndContext>
    );
}

test('empty cells show slot-valid during an active drag when canDnD', () => {
    const {container} = renderGrid({isDragActive: true, canDnD: true});
    // 3 cells: one holds a tile, two are empty. Only the two empties get the cue.
    const cells = container.querySelectorAll('.grid-item');
    expect(cells.length).toBe(3);
    const valid = container.querySelectorAll('.grid-item.slot-valid');
    expect(valid.length).toBe(2);
    // the cell containing a tile must not carry the cue
    const tileCell = container.querySelector('.tile').closest('.grid-item');
    expect(tileCell.classList.contains('slot-valid')).toBe(false);
});

test('no cue when no drag is active', () => {
    const {container} = renderGrid({isDragActive: false, canDnD: true});
    expect(container.querySelectorAll('.slot-valid').length).toBe(0);
});

test('no cue when the grid is not droppable', () => {
    const {container} = renderGrid({isDragActive: true, canDnD: false});
    expect(container.querySelectorAll('.slot-valid').length).toBe(0);
});

// WS-D: the cue is board-only. With a live drag and canDnD, an empty BOARD cell
// (gridId 'b') wears .slot-valid, but an empty HAND cell (gridId 'h') never does.
test('cue is board-only: hand empty cells never light up', () => {
    const board = renderGrid({isDragActive: true, canDnD: true, gridId: 'b'});
    const hand = renderGrid({isDragActive: true, canDnD: true, gridId: 'h'});
    // board empty cells light up
    expect(board.container.querySelectorAll('.grid-item.slot-valid').length).toBe(2);
    // hand empty cells never light up
    expect(hand.container.querySelectorAll('.grid-item.slot-valid').length).toBe(0);
});
