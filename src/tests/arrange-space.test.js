import {extractBlocks} from '../rummikub/arrange/space';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const b = v => buildTileObj(v, COLOR.blue, 0);

function tp(entries) { // entries: [tileId, col, row]
  const o = {};
  for (const [id, col, row] of entries) o[id] = {id, col, row, gridId: 'b'};
  return o;
}

test('extractBlocks splits each row into contiguous segments, excluding cluster tiles', () => {
  // row 2: r1 r2 r3 (cols 0-2) | gap | r5 (col 4);  row 3: b1 b2 (cols 10-11)
  const positions = tp([[r(1), 0, 2], [r(2), 1, 2], [r(3), 2, 2], [r(5), 4, 2], [b(1), 10, 3], [b(2), 11, 3]]);
  const blocks = extractBlocks(positions, [r(5)]); // r5 is the cluster, excluded
  // remaining: [r1 r2 r3] @row2 start0 w3 ; [b1 b2] @row3 start10 w2
  const norm = blocks.map(x => ({row: x.row, start: x.start, width: x.width, tiles: x.tiles}))
    .sort((a, c) => a.row - c.row || a.start - c.start);
  expect(norm).toEqual([
    {row: 2, start: 0, width: 3, tiles: [r(1), r(2), r(3)]},
    {row: 3, start: 10, width: 2, tiles: [b(1), b(2)]},
  ]);
});

import {__test} from '../rummikub/arrange/space';
const {findSlot} = __test;
const blk = (row, start, width) => ({row, start, width, tiles: Array.from({length: width}, (_, i) => 1000 + i)});

test('findSlot slides within the block row to the nearest free slot (>=1 gap from finalized)', () => {
  // cluster finalized at row 2 cols [0,10]; a width-3 block originally at col 11
  const finalized = new Map([[2, [[0, 10]]]]);
  const slot = findSlot(blk(2, 11, 3), finalized, 4, 9, 32);
  // free in row 2 is [12,31] (cols 0..11 blocked by [0,10] expanded to [0,11]); nearest to 11 -> 12
  expect(slot).toEqual({row: 2, start: 12});
});

test('findSlot relocates toward centre when the own row has no room', () => {
  // row 2 fully blocked; centre row 4 free
  const finalized = new Map([[2, [[0, 31]]]]);
  const slot = findSlot(blk(2, 5, 3), finalized, 4, 9, 32);
  expect(slot).toEqual({row: 4, start: 0});   // own row none -> nearest-to-centre row 4, leftmost
});

test('findSlot returns null when nothing fits anywhere', () => {
  const finalized = new Map();
  for (let r = 0; r < 9; r++) finalized.set(r, [[0, 31]]); // every row full
  expect(findSlot(blk(2, 5, 3), finalized, 4, 9, 32)).toBeNull();
});
