import {buildRowOccupancy} from '../rummikub/dndUtil';

// buildRowOccupancy(tilePositions, gridId, excludeIds, playerID) -> isOccupied(col,row)
// Pure: a cell is occupied iff some NON-excluded tile sits at that gridId/col/row.
// Used by onDragEnd to feed resolveDropSlot, excluding the dragged selection so a
// tile can land where it (or its selection) currently sits. For the hand grid the
// predicate is scoped to playerID (all players share gridId 'h' + col/row ranges).

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
    const handOccupied = buildRowOccupancy(tilePositions, 'h', [], '0');
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

test('hand occupancy is scoped to the current player (no opponent-hand pollution)', () => {
    // Two players have a hand tile at the SAME col/row in HAND_GRID_ID. Without a
    // playerView each client holds both, so the predicate must only count the
    // current player's own tile.
    const positions = {
        p0: {id: 'p0', gridId: 'h', col: 7, row: 1, playerID: '0'},
        p1: {id: 'p1', gridId: 'h', col: 7, row: 1, playerID: '1'},
        p1b: {id: 'p1b', gridId: 'h', col: 2, row: 0, playerID: '1'},
    };
    const forP0 = buildRowOccupancy(positions, 'h', [], '0');
    expect(forP0(7, 1)).toBe(true);  // player 0's own tile occupies the cell
    expect(forP0(2, 0)).toBe(false); // opponent's tile must NOT leak in

    const forP1 = buildRowOccupancy(positions, 'h', [], '1');
    expect(forP1(7, 1)).toBe(true);  // shared coordinate, now via player 1's tile
    expect(forP1(2, 0)).toBe(true);  // player 1's other tile
});

test('board occupancy ignores playerID (shared, unpartitioned grid)', () => {
    // Board tiles have no playerID; scoping must not apply to the board grid.
    const positions = {
        b0: {id: 'b0', gridId: 'b', col: 9, row: 2},
    };
    const board = buildRowOccupancy(positions, 'b', [], '0');
    expect(board(9, 2)).toBe(true);
    const boardOtherSeat = buildRowOccupancy(positions, 'b', [], '3');
    expect(boardOtherSeat(9, 2)).toBe(true); // unchanged regardless of playerID
});
