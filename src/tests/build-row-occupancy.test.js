import {buildRowOccupancy} from '../rummikub/dndUtil';

// buildRowOccupancy(tilePositions, gridId, excludeIds) -> isOccupied(col,row)
// Pure: a cell is occupied iff some NON-excluded tile sits at that gridId/col/row.
// Used by onDragEnd to feed resolveDropSlot, excluding the dragged selection so a
// tile can land where it (or its selection) currently sits.

const tilePositions = {
    a: {id: 'a', gridId: 'b', col: 3, row: 0},
    b: {id: 'b', gridId: 'b', col: 4, row: 0},
    c: {id: 'c', gridId: 'b', col: 5, row: 1},
    d: {id: 'd', gridId: 'h', col: 3, row: 0, playerID: '0'},
};

test('marks a cell occupied when a non-excluded tile sits there', () => {
    const isOccupied = buildRowOccupancy(tilePositions, 'b', []);
    expect(isOccupied(3, 0)).toBe(true);
    expect(isOccupied(4, 0)).toBe(true);
    expect(isOccupied(5, 1)).toBe(true);
});

test('empty cells are not occupied', () => {
    const isOccupied = buildRowOccupancy(tilePositions, 'b', []);
    expect(isOccupied(0, 0)).toBe(false);
    expect(isOccupied(3, 1)).toBe(false);
});

test('only counts tiles of the requested grid', () => {
    const isOccupied = buildRowOccupancy(tilePositions, 'b', []);
    // tile d is in the hand grid, so board col 3 row 0 (only tile a) is the hit;
    // hand col 3 row 0 must not leak into the board predicate.
    const handOccupied = buildRowOccupancy(tilePositions, 'h', []);
    expect(handOccupied(3, 0)).toBe(true);
    expect(handOccupied(4, 0)).toBe(false);
    expect(isOccupied(3, 0)).toBe(true);
});

test('excluded tiles do not count as occupied', () => {
    const isOccupied = buildRowOccupancy(tilePositions, 'b', ['a', 'b']);
    expect(isOccupied(3, 0)).toBe(false);
    expect(isOccupied(4, 0)).toBe(false);
    // a non-excluded tile is still occupied
    expect(isOccupied(5, 1)).toBe(true);
});
