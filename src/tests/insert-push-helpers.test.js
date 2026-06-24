import {isRunFree, boardRowTiles} from '../rummikub/dndUtil';

// isOccupied built from a set of "col:row" keys, matching buildRowOccupancy's
// verified (col,row)=>bool contract. The row arg is load-bearing: isRunFree must
// forward it to isOccupied, otherwise occupied cells on other rows would query
// "col:undefined" and read as free.
const occupiedSet = (keys) => {
    const set = new Set(keys);
    return (col, row) => set.has(col + ':' + row);
};

describe('isRunFree', () => {
    test('negative start column is out of bounds', () => {
        const isOccupied = occupiedSet([]);
        expect(isRunFree(isOccupied, -1, 2, 0, 32)).toBe(false);
    });

    test('a run extending past maxCols (exclusive) is out of bounds', () => {
        const isOccupied = occupiedSet([]);
        // maxCols=32 is the exclusive count; cols 31,32 -> 31+2 = 33 > 32.
        expect(isRunFree(isOccupied, 31, 2, 0, 32)).toBe(false);
    });

    test('a run ending exactly at maxCols (exclusive) is in bounds', () => {
        const isOccupied = occupiedSet([]);
        // cols 30,31 -> 30+2 = 32, not > 32, so in range when all cells are free.
        expect(isRunFree(isOccupied, 30, 2, 0, 32)).toBe(true);
    });

    test('a run that hits an occupied cell is not free', () => {
        // col 6 row 0 occupied; run [5,6,7] at row 0 collides on its middle cell.
        const isOccupied = occupiedSet(['6:0']);
        expect(isRunFree(isOccupied, 5, 3, 0, 32)).toBe(false);
    });

    test('an all-free run is free', () => {
        const isOccupied = occupiedSet(['0:0', '20:0']);
        expect(isRunFree(isOccupied, 5, 3, 0, 32)).toBe(true);
    });

    test('forwards row to isOccupied: occupancy on another row does not block', () => {
        // The same columns are occupied on row 1; a run on row 0 must stay free,
        // and the identical run on row 1 must be blocked. This pins the two-arg
        // isOccupied(col,row) contract.
        const isOccupied = occupiedSet(['5:1', '6:1', '7:1']);
        expect(isRunFree(isOccupied, 5, 3, 0, 32)).toBe(true);
        expect(isRunFree(isOccupied, 5, 3, 1, 32)).toBe(false);
    });
});

describe('boardRowTiles', () => {
    test('collects only this row\'s board tiles', () => {
        const positions = {
            a: {gridId: 'b', col: 3, row: 0},
            b: {gridId: 'b', col: 5, row: 0},
            c: {gridId: 'b', col: 7, row: 1},                 // other row
            d: {gridId: 'h', col: 3, row: 0, playerID: '0'},  // hand grid
        };
        expect(boardRowTiles(positions, 0, [])).toEqual([
            {tileId: 'a', col: 3},
            {tileId: 'b', col: 5},
        ]);
    });

    test('honors excludeIds', () => {
        const positions = {
            a: {gridId: 'b', col: 3, row: 0},
            b: {gridId: 'b', col: 5, row: 0},
            c: {gridId: 'b', col: 9, row: 0},
        };
        expect(boardRowTiles(positions, 0, ['b'])).toEqual([
            {tileId: 'a', col: 3},
            {tileId: 'c', col: 9},
        ]);
    });

    test('excludeIds match regardless of string/number type', () => {
        const positions = {
            7: {gridId: 'b', col: 1, row: 0},
            8: {gridId: 'b', col: 2, row: 0},
        };
        // numeric exclude 7 must drop the tile keyed '7'.
        expect(boardRowTiles(positions, 0, [7])).toEqual([
            {tileId: '8', col: 2},
        ]);
    });

    test('skips null position entries', () => {
        const positions = {
            a: {gridId: 'b', col: 3, row: 0},
            bad: null,
        };
        expect(boardRowTiles(positions, 0, [])).toEqual([{tileId: 'a', col: 3}]);
    });

    test('defaults excludeIds to empty when omitted', () => {
        const positions = {a: {gridId: 'b', col: 3, row: 0}};
        expect(boardRowTiles(positions, 0)).toEqual([{tileId: 'a', col: 3}]);
    });

    test('returns empty when nothing matches the row', () => {
        const positions = {a: {gridId: 'b', col: 3, row: 2}};
        expect(boardRowTiles(positions, 0, [])).toEqual([]);
    });
});
