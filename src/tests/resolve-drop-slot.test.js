import {resolveDropSlot} from '../rummikub/dndUtil';

// Helper: build an isOccupied predicate for a single row from a set of taken cols.
const occupiedCols = (taken) => (col) => taken.includes(col);

test('single onto empty target returns the target col', () => {
    const isOccupied = occupiedCols([]);
    expect(resolveDropSlot({gridId: 'board', col: 5, row: 0}, isOccupied, 1, 32))
        .toEqual({ok: true, gridId: 'board', row: 0, cols: [5]});
});

test('single onto occupied target picks nearest free, lower col on tie', () => {
    const isOccupied = occupiedCols([5]);
    expect(resolveDropSlot({gridId: 'board', col: 5, row: 0}, isOccupied, 1, 32))
        .toEqual({ok: true, gridId: 'board', row: 0, cols: [4]});
});

test('single with a full row returns ok:false', () => {
    const all = Array.from({length: 32}, (_, i) => i);
    const isOccupied = occupiedCols(all);
    expect(resolveDropSlot({gridId: 'board', col: 5, row: 0}, isOccupied, 1, 32))
        .toEqual({ok: false});
});

test('multi=3 onto 3 contiguous free cells starting at target', () => {
    const isOccupied = occupiedCols([]);
    expect(resolveDropSlot({gridId: 'board', col: 10, row: 2}, isOccupied, 3, 32))
        .toEqual({ok: true, gridId: 'board', row: 2, cols: [10, 11, 12]});
});

test('multi=3 with only 2 free at target picks a nearby 3-gap run', () => {
    // target col 10; cols 12 occupied so [10,11,12] not free. cols 0-5 occupied,
    // 6 occupied, 7 occupied; free run of 3 nearest to 10 is [13,14,15].
    const taken = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12];
    const isOccupied = occupiedCols(taken);
    expect(resolveDropSlot({gridId: 'board', col: 10, row: 0}, isOccupied, 3, 32))
        .toEqual({ok: true, gridId: 'board', row: 0, cols: [13, 14, 15]});
});

test('multi=3 with no 3-contiguous gap anywhere returns ok:false', () => {
    // every third cell occupied -> max contiguous free run is 2.
    const taken = [];
    for (let c = 2; c < 32; c += 3) taken.push(c);
    const isOccupied = occupiedCols(taken);
    expect(resolveDropSlot({gridId: 'board', col: 10, row: 0}, isOccupied, 3, 32))
        .toEqual({ok: false});
});

test('multi run that would exceed maxCols is not chosen', () => {
    // maxCols = 12, target col 10; the run [10,11,12] exceeds bounds (12 is out),
    // so it is rejected and the nearest in-bounds run [9,10,11] is chosen instead.
    const taken = [0, 1, 2, 3, 4, 5, 6];
    const isOccupied = occupiedCols(taken);
    expect(resolveDropSlot({gridId: 'board', col: 10, row: 0}, isOccupied, 3, 12))
        .toEqual({ok: true, gridId: 'board', row: 0, cols: [9, 10, 11]});
});
