import React from 'react';
import {render} from '@testing-library/react';
import {DndContext} from '@dnd-kit/core';
import GridContainer from '../rummikub/components/GridContainer';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';

// WS-10 highlight-only: a rack tile flagged as playable renders the colorblind-safe
// marker (.tile-playable-mark) and an accessible label; non-playable tiles do not.

const blue4 = buildTileObj(4, COLOR.blue, 0);
const red7 = buildTileObj(7, COLOR.red, 0);
const tiles2dArray = [[blue4, red7, null]];

function renderHand(playableTiles) {
    return render(
        <DndContext>
            <GridContainer
                tiles2dArray={tiles2dArray}
                rows={1}
                cols={3}
                canDnD={true}
                isDragActive={false}
                gridId="h"
                validTiles={[]}
                highlightTiles={false}
                playableTiles={playableTiles}
                selectedTiles={[]}
                moveTiles={() => {}}
                onTileDragEnd={() => {}}
                onLongPressMouseUp={() => {}}
                handleLongPress={() => {}}
                handleTileSelection={() => {}}
                hoverPosition={null}
                setHoverPosition={() => {}}
                newlyAdded={[]}
            />
        </DndContext>
    );
}

test('only the playable tile renders the marker', () => {
    const {container} = renderHand([blue4]);
    const marks = container.querySelectorAll('.tile-playable-mark');
    expect(marks.length).toBe(1);
    const playableTile = container.querySelector('.tile-playable');
    expect(playableTile).not.toBeNull();
});

test('no marker when no tile is playable', () => {
    const {container} = renderHand([]);
    expect(container.querySelectorAll('.tile-playable-mark').length).toBe(0);
    expect(container.querySelectorAll('.tile-playable').length).toBe(0);
});

test('the playable tile carries an accessible label', () => {
    const {container} = renderHand([blue4]);
    const labelled = container.querySelector('[aria-label="Playable: can extend a board group"]');
    expect(labelled).not.toBeNull();
});
