import {arrangeBoard} from '../rummikub/arrange/index';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const b = v => buildTileObj(v, COLOR.blue, 0);

function tp(entries) { const o = {}; for (const [id, col, row] of entries) o[id] = {id, col, row, gridId: 'b'}; return o; }

test('#0 zero-regression: a drop that fits the row triggers no relocation', () => {
  // r1 r2 r3 at row 0 cols 0-2; neighbour b far at col 20; drop r4 at col 3 (fits)
  const positions = tp([[r(1), 0, 0], [r(2), 1, 0], [r(3), 2, 0], [r(4), 3, 0], [b(1), 20, 0], [b(2), 21, 0], [b(3), 22, 0]]);
  const res = arrangeBoard(positions, {droppedIds: [r(4)], row: 0, col: 3});
  expect(res.ok).toBe(true);
  // only the cluster (r1..r4) is placed; the far b-block is untouched (no placement entry)
  expect(res.placements[b(1)]).toBeUndefined();
  expect(res.placements[r(4)].row).toBe(0);
});

test('#9 slide: cluster needs 11 cols, neighbour 2 gaps away slides right', () => {
  // row 0: red run 1..9 at cols 0-8 (valid); b1 b2 b3 at cols 11-13.
  // Drop the second r5 INSIDE the run (col 4, on top of r5). Dropping it at the right edge
  // (col 9) would bridge the 1-col gap to b1 (col 11) and pull b1..b3 into the cluster, so the
  // slide path never runs. Col 4 keeps the cluster span [0,8] -> 2-col gap -> b1..b3 stay separate.
  const entries = [];
  for (let v = 1; v <= 9; v++) entries.push([r(v), v - 1, 0]);
  entries.push([b(1), 11, 0], [b(2), 12, 0], [b(3), 13, 0], [r(5, 1), 4, 0]); // dup-5 dropped inside the run
  const res = arrangeBoard(tp(entries), {droppedIds: [r(5, 1)], row: 0, col: 4});
  expect(res.ok).toBe(true);
  // cluster {r1..r9,dup5} -> 12345 _ 56789 occupies cols 0-10; b1 b2 b3 slide to 12-14 (>=1 gap)
  const bcols = [res.placements[b(1)].col, res.placements[b(2)].col, res.placements[b(3)].col].sort((x, y) => x - y);
  expect(bcols).toEqual([12, 13, 14]);
  expect(res.placements[b(1)].row).toBe(0);
});

test('R1 reject: cluster must grow but no row can absorb the displaced neighbour -> ok:false', () => {
  const entries = [];
  // row 0: red run 1..9 (cols 0-8) + a wide blue neighbour filling cols 11..31 (width 21, separate by a 2-col gap)
  for (let v = 1; v <= 9; v++) entries.push([r(v), v - 1, 0]);
  for (let c = 11; c <= 31; c++) entries.push([2000 + c, c, 0]);
  // rows 1..8: completely full (32 wide each) -> no cross-row room
  for (let row = 1; row <= 8; row++) for (let c = 0; c < 32; c++) entries.push([3000 + row * 100 + c, c, row]);
  entries.push([r(5, 1), 4, 0]);                       // drop dup-5 inside the run -> cluster {r1..r9,dup5}
  const res = arrangeBoard(tp(entries), {droppedIds: [r(5, 1)], row: 0, col: 4});
  // cluster reflows to 11 cols (0-10); the 21-wide neighbour cannot fit row 0's 20-col remainder
  // and every other row is full -> 9 blocks competing for 8 free rows -> pigeonhole -> reject.
  expect(res.ok).toBe(false);
});
