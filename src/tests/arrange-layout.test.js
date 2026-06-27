import {layoutCluster} from '../rummikub/arrange/layout';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const b = v => buildTileObj(v, COLOR.blue, 0), k = v => buildTileObj(v, COLOR.black, 0), y = v => buildTileObj(v, COLOR.yellow, 0);

// helper: render cols map to a compact "a b _ c" string by column
function renderRow(cols) {
  const byCol = Object.entries(cols).map(([id, c]) => ({id: Number(id), c})).sort((x, y) => x.c - y.c);
  let out = [], prev = byCol[0].c;
  for (const {id, c} of byCol) { while (c > prev) { out.push('_'); prev++; } out.push(String(id)); prev = c + 1; }
  return out.join(' ');
}

test('two valid blocks are separated by exactly one gap, ascending', () => {
  const part = {blocks: [[r(1), r(2), r(3)], [r(3, 1), r(4), r(5)]], leftover: []};
  const res = layoutCluster(part, 'right', {left: 0, right: 5}, {left: 0, right: 31});
  // 1 2 3 _ 3 4 5
  expect(renderRow(res.cols)).toBe(`${r(1)} ${r(2)} ${r(3)} _ ${r(3, 1)} ${r(4)} ${r(5)}`);
});

test('leftover sits >=1 gap on the drop side (right)', () => {
  const part = {blocks: [[r(5), r(6), r(7)]], leftover: [b(7), k(7)]};
  const res = layoutCluster(part, 'right', {left: 0, right: 2}, {left: 0, right: 31});
  // r5 r6 r7 _ b7 k7
  expect(renderRow(res.cols)).toBe(`${r(5)} ${r(6)} ${r(7)} _ ${b(7)} ${k(7)}`);
});

test('leftover sits on the LEFT when dropSide is left', () => {
  const part = {blocks: [[r(5), r(6), r(7)]], leftover: [b(7), k(7)]};
  const res = layoutCluster(part, 'left', {left: 0, right: 2}, {left: 0, right: 31});
  // b7 k7 _ r5 r6 r7
  expect(renderRow(res.cols)).toBe(`${b(7)} ${k(7)} _ ${r(5)} ${r(6)} ${r(7)}`);
});

test('unrelated leftover tiles are gap-separated', () => {
  const part = {blocks: [[r(5), r(6), r(7)]], leftover: [b(7), y(2)]};
  const res = layoutCluster(part, 'right', {left: 0, right: 2}, {left: 0, right: 31});
  // r5 r6 r7 _ b7 _ y2  (order of the two singleton leftovers is deterministic by tile int)
  expect(renderRow(res.cols)).toMatch(/_ \d+ _ \d+$/);
});

test('rejects when the window is too narrow to fit the layout', () => {
  const part = {blocks: [[r(1), r(2), r(3)], [r(3, 1), r(4), r(5)]], leftover: []};
  const res = layoutCluster(part, 'right', {left: 30, right: 31}, {left: 30, right: 31}); // width 7 > 2
  expect(res.reject).toBe(true);
});
