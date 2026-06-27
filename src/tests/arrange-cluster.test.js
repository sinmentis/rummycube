import {identifyCluster} from '../rummikub/arrange/cluster';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';

const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
// 在一行里铺牌:cols 是 {col: tileId}
function row(map) {
  const tp = {};
  for (const [col, id] of Object.entries(map)) {
    tp[id] = {id: Number(id), col: Number(col), row: 2, gridId: 'b'};
  }
  return tp;
}

test('cluster spans a single ≤1 gap but stops at a ≥2 gap', () => {
  // cols: 0,1,2 then gap at 3, tile at 4 (≤1 gap -> in); gap 5,6, tile at 7 (≥2 gap -> out)
  const tp = row({0: r(1), 1: r(2), 2: r(3), 4: r(5), 7: r(8)});
  const c = identifyCluster(tp, 2, [r(5)]);     // dropped tile sits at col 4
  expect(new Set(c.tiles)).toEqual(new Set([r(1), r(2), r(3), r(5)]));
  expect(c.span).toEqual({left: 0, right: 4});
});

test('pre-drop valid blocks EXCLUDE the just-dropped tile', () => {
  // 1-2-3 is a committed run; r5 (col 4) is the tile just dropped -> excluded
  const tp = row({0: r(1), 1: r(2), 2: r(3), 4: r(5)});
  const c = identifyCluster(tp, 2, [r(5)]);
  expect(c.preDropValidBlocks).toEqual([[r(1), r(2), r(3)]]);
});
