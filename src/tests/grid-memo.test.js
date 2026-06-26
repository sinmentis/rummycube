import React from 'react';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import GridContainer from '../rummikub/components/GridContainer';
import * as codec from '../rummikub/tile/codec';
import * as dndUtil from '../rummikub/dndUtil';
import { buildTileObj, RedJoker } from '../rummikub/util';
import { COLOR } from '../rummikub/constants';

// WS-4 / U12: React.memo on the tile cells is only effective once GridContainer
// passes PRIMITIVE props (isSelected/isValid/isNewlyAdded booleans) instead of
// the whole selectedTiles array (new ref each render). These tests prove a
// selection change re-renders only the affected tiles, not all of them.
//
// Render counting: every Tile render renders TilePreview, which calls
// getTileColor(tile) exactly once. Every GridSlot render calls
// makeSlotId(gridId,col,row). Spying on those lets us count per-cell renders
// without instrumenting production code. getTileColor is spied on its home
// module (tile/codec); Tile.jsx reaches it through the util barrel.

const t1 = buildTileObj(5, COLOR.red, 0);
const t2 = buildTileObj(7, COLOR.blue, 0);
const joker = RedJoker;

const tiles2dArray = [[t1, t2, joker, null, null, null]];

const handleTileSelection = () => {};
const onLongPress = () => {};

function renderGrid(selectedTiles) {
  return (
    <DndContext>
      <GridContainer
        tiles2dArray={tiles2dArray}
        rows={1}
        cols={6}
        canDnD={true}
        gridId="board"
        validTiles={[]}
        highlightTiles={false}
        selectedTiles={selectedTiles}
        moveTiles={() => {}}
        onTileDragEnd={() => {}}
        onLongPress={onLongPress}
        handleTileSelection={handleTileSelection}
        hoverPosition={null}
        setHoverPosition={() => {}}
        newlyAdded={[]}
      />
    </DndContext>
  );
}

describe('GridContainer memo via boolean props', () => {
  let colorSpy;
  let slotSpy;

  beforeEach(() => {
    colorSpy = jest.spyOn(codec, 'getTileColor');
    slotSpy = jest.spyOn(dndUtil, 'makeSlotId');
  });

  afterEach(() => {
    colorSpy.mockRestore();
    slotSpy.mockRestore();
  });

  const tileRenders = (tile) =>
    colorSpy.mock.calls.filter((c) => c[0] === tile).length;

  test('re-rendering parent with same selection does not re-render memoized cells', () => {
    const { rerender } = render(renderGrid([]));

    expect(tileRenders(t1)).toBe(1);
    expect(tileRenders(t2)).toBe(1);
    expect(tileRenders(joker)).toBe(1);
    const slotCallsAfterMount = slotSpy.mock.calls.length;

    // Re-render with a fresh (different ref) but value-identical empty selection.
    rerender(renderGrid([]));

    // memo'd cells skip: no additional Tile or GridSlot renders.
    expect(tileRenders(t1)).toBe(1);
    expect(tileRenders(t2)).toBe(1);
    expect(tileRenders(joker)).toBe(1);
    expect(slotSpy.mock.calls.length).toBe(slotCallsAfterMount);
  });

  test('selecting one tile re-renders only that tile (and the previously selected one)', () => {
    const { rerender } = render(renderGrid([]));

    expect(tileRenders(t1)).toBe(1);
    expect(tileRenders(t2)).toBe(1);
    expect(tileRenders(joker)).toBe(1);

    // Select t1 only.
    rerender(renderGrid([t1]));

    expect(tileRenders(t1)).toBe(2); // changed -> re-rendered
    expect(tileRenders(t2)).toBe(1); // unchanged -> skipped
    expect(tileRenders(joker)).toBe(1); // unchanged -> skipped

    // Move selection from t1 to t2: only the two affected tiles re-render.
    rerender(renderGrid([t2]));

    expect(tileRenders(t1)).toBe(3); // deselected -> re-rendered
    expect(tileRenders(t2)).toBe(2); // selected -> re-rendered
    expect(tileRenders(joker)).toBe(1); // unchanged -> still skipped
  });

  test('joker tile exposes an accessible "Joker (wildcard)" label', () => {
    render(renderGrid([]));
    expect(screen.getByLabelText('Joker (wildcard)')).toBeInTheDocument();
    expect(screen.getByTitle('Joker (wildcard)')).toBeInTheDocument();
  });
});
