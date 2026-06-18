import {orderTilesBySource} from '../rummikub/dndUtil';

test('orderTilesBySource sorts ids by source row then col (reading order)', () => {
    const tp = {
        100: {row: 0, col: 2},
        101: {row: 0, col: 0},
        102: {row: 1, col: 0},
        103: {row: 0, col: 1},
    };
    expect(orderTilesBySource([100, 101, 102, 103], tp)).toEqual([101, 103, 100, 102]);
});

test('orderTilesBySource does not mutate its input', () => {
    const tp = {1: {row: 0, col: 1}, 2: {row: 0, col: 0}};
    const input = [1, 2];
    orderTilesBySource(input, tp);
    expect(input).toEqual([1, 2]);
});

test('orderTilesBySource leaves order unchanged when a position is missing', () => {
    const tp = {5: {row: 0, col: 0}};
    expect(orderTilesBySource([5, 9], tp)).toEqual([5, 9]);
});
