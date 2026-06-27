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
