import {arrangeBoard} from '../rummikub/arrange/index';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);

function rowAt(map, row = 2) {
  const tp = {};
  for (const [col, id] of Object.entries(map)) tp[id] = {id: Number(id), col: Number(col), row, gridId: 'b'};
  return tp;
}
const colOf = (res, id) => res.placements[id].col;

test('inserting a duplicate 3 into 1-2-3-4-5 yields 123 _ 345', () => {
  // existing run at cols 0..4, the dropped duplicate-3 already written at col 5 by the move
  const tp = rowAt({0: r(1), 1: r(2), 2: r(3), 3: r(4), 4: r(5), 5: r(3, 1)});
  const res = arrangeBoard(tp, {droppedIds: [r(3, 1)], row: 2, col: 5});
  expect(res.ok).toBe(true);
  // the six tiles occupy 0..6 as 1 2 3 _ 3 4 5 (some order); assert the gap pattern via columns
  const cols = [r(1), r(2), r(3), r(3, 1), r(4), r(5)].map(id => colOf(res, id)).sort((a, b) => a - b);
  expect(cols).toEqual([0, 1, 2, 4, 5, 6]);   // exactly one gap at col 3
});
