import {insertWithPush} from '../rummikub/insertPush';

// maxCol is the INCLUSIVE last board column (BOARD_COLS - 1 = 31).
const MAX = 31;

// Final column of every tile after applying a result: dragged tiles land on
// newCols, shifted existing tiles move to shifts[tileId], everyone else stays.
function finalCols(rowTiles, result) {
    const cols = [...result.newCols];
    for (const {tileId, col} of rowTiles) {
        cols.push(result.shifts[tileId] !== undefined ? result.shifts[tileId] : col);
    }
    return cols;
}

// The server later writes these columns with no overlap check, so the union of
// dragged + shifted + untouched columns must be provably distinct and in range.
function expectAllDistinct(rowTiles, result, maxCol) {
    const cols = finalCols(rowTiles, result);
    expect(new Set(cols).size).toBe(cols.length);
    for (const c of cols) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(maxCol);
    }
}

test('all-free target range snaps in place with no shifts', () => {
    const row = [{tileId: 'a', col: 0}, {tileId: 'b', col: 1}];
    const result = insertWithPush(row, 5, 2, MAX);
    expect(result).toEqual({shifts: {}, newCols: [5, 6]});
    expectAllDistinct(row, result, MAX);
});

test('single-layer right push moves one colliding tile right by one', () => {
    const row = [{tileId: 'a', col: 5}, {tileId: 'b', col: 8}];
    const result = insertWithPush(row, 5, 1, MAX);
    expect(result).toEqual({shifts: {a: 6}, newCols: [5]});
    expectAllDistinct(row, result, MAX);
});

test('cascade right push: 1 2 3 _ 7 7 7 + drop 2 at T=3 shifts the three right tiles +1', () => {
    const row = [
        {tileId: 'a', col: 0}, {tileId: 'b', col: 1}, {tileId: 'c', col: 2},
        {tileId: 'd', col: 4}, {tileId: 'e', col: 5}, {tileId: 'f', col: 6},
    ];
    const result = insertWithPush(row, 3, 2, MAX);
    expect(result).toEqual({shifts: {d: 5, e: 6, f: 7}, newCols: [3, 4]});
    expectAllDistinct(row, result, MAX);
});

test('right overflow falls back to a left push', () => {
    // cols 2..5 packed, maxCol 5 leaves no room on the right; left has 0,1 free.
    const row = [
        {tileId: 'a', col: 2}, {tileId: 'b', col: 3},
        {tileId: 'c', col: 4}, {tileId: 'd', col: 5},
    ];
    const result = insertWithPush(row, 3, 1, 5);
    expect(result).toEqual({shifts: {b: 2, a: 1}, newCols: [3]});
    expectAllDistinct(row, result, 5);
});

test('a fully packed row returns null (both directions full)', () => {
    // cols 0..4 all taken, maxCol 4 -> no room either way.
    const row = [
        {tileId: 'a', col: 0}, {tileId: 'b', col: 1}, {tileId: 'c', col: 2},
        {tileId: 'd', col: 3}, {tileId: 'e', col: 4},
    ];
    expect(insertWithPush(row, 2, 1, 4)).toBeNull();
});

test('N=1 insert pushes a contiguous run right by one', () => {
    const row = [{tileId: 'a', col: 10}, {tileId: 'b', col: 11}, {tileId: 'c', col: 13}];
    const result = insertWithPush(row, 10, 1, MAX);
    expect(result).toEqual({shifts: {a: 11, b: 12}, newCols: [10]});
    expectAllDistinct(row, result, MAX);
});

test('a gap absorbs the ripple and stops the cascade early', () => {
    // push at 5: 5,6 shift to 6,7; col 8 is free so the run stops and 9 never moves.
    const row = [{tileId: 'a', col: 5}, {tileId: 'b', col: 6}, {tileId: 'c', col: 9}];
    const result = insertWithPush(row, 5, 1, MAX);
    expect(result).toEqual({shifts: {a: 6, b: 7}, newCols: [5]});
    expectAllDistinct(row, result, MAX);
});

test('T+N-1 beyond maxCol returns null (rightmost-column boundary)', () => {
    expect(insertWithPush([], 31, 2, MAX)).toBeNull();
});

test('a single tile at the last column snaps in place', () => {
    const row = [{tileId: 'a', col: 0}];
    const result = insertWithPush(row, 31, 1, MAX);
    expect(result).toEqual({shifts: {}, newCols: [31]});
    expectAllDistinct(row, result, MAX);
});

test('left overflow returns null when neither side has room near col 0', () => {
    // cols 0..3 packed, maxCol 3, drop at the left edge: right overflows past 3,
    // left overflows below 0.
    const row = [
        {tileId: 'a', col: 0}, {tileId: 'b', col: 1},
        {tileId: 'c', col: 2}, {tileId: 'd', col: 3},
    ];
    expect(insertWithPush(row, 1, 1, 3)).toBeNull();
});

test('negative target column returns null', () => {
    expect(insertWithPush([{tileId: 'a', col: 0}], -1, 1, MAX)).toBeNull();
});

test('output columns are provably distinct after a long cascade', () => {
    const row = [];
    for (let c = 0; c < 10; c++) row.push({tileId: `t${c}`, col: c});
    const result = insertWithPush(row, 3, 2, MAX);
    expect(result).not.toBeNull();
    const cols = finalCols(row, result);
    expect(new Set(cols).size).toBe(cols.length);
});

describe('WS-E bridge: leave a 1-col separator', () => {
  const row = (pairs) => pairs.map(([tileId, col]) => ({tileId, col}));

  test('owner case 123_456 drop @gap pushes right run, opens separator', () => {
    const rt = row([['a',0],['b',1],['c',2],['d',4],['e',5],['f',6]]);
    expect(insertWithPush(rt, 3, 1, 31))
      .toEqual({shifts: {d:5, e:6, f:7}, newCols: [3]});
  });

  test('multi-tile span bridging a 2-wide-needed boundary', () => {
    const rt = row([['a',0],['b',1],['c',2],['g',5],['h',6],['i',7]]);
    expect(insertWithPush(rt, 3, 2, 31))
      .toEqual({shifts: {g:6, h:7, i:8}, newCols: [3,4]});
  });

  test('ripple stops at an inner gap', () => {
    const rt = row([['a',24],['b',25],['c',26],['d',28],['e',29],['f',31]]);
    expect(insertWithPush(rt, 27, 1, 31))
      .toEqual({shifts: {d:29, e:30}, newCols: [27]});
  });

  test('no room at right wall returns null (caller rejects)', () => {
    const rt = row([['a',25],['b',26],['c',27],['d',29],['e',30],['f',31]]);
    expect(insertWithPush(rt, 28, 1, 31)).toBeNull();
  });

  test('NOT a bridge: T+N free with a 2-wide gap, plain placement', () => {
    const rt = row([['a',0],['b',1],['c',2],['d',5],['e',6],['f',7]]);
    expect(insertWithPush(rt, 3, 1, 31)).toEqual({shifts: {}, newCols: [3]});
  });

  test('NOT a bridge: append left of a run (left neighbour empty)', () => {
    const rt = row([['b',1],['c',2],['d',3]]);
    expect(insertWithPush(rt, 0, 1, 31)).toEqual({shifts: {}, newCols: [0]});
  });

  test('NOT a bridge: append right of a run (right neighbour empty)', () => {
    const rt = row([['a',0],['b',1],['c',2]]);
    expect(insertWithPush(rt, 3, 1, 31)).toEqual({shifts: {}, newCols: [3]});
  });

  test('within-run insert (occupied target) unchanged, stays contiguous', () => {
    const rt = row([['a',0],['b',1],['c',2],['e',3]]);
    expect(insertWithPush(rt, 3, 1, 31)).toEqual({shifts: {e:4}, newCols: [3]});
  });
});
