import {bestPartition} from '../rummikub/arrange/partition';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const b = v => buildTileObj(v, COLOR.blue, 0), k = v => buildTileObj(v, COLOR.black, 0);
const sizes = blocks => blocks.map(bl => bl.length).sort();

test('splits a 5-run + duplicate 3 into two valid runs, zero leftover', () => {
  // {1,2,3,3,4,5} -> 123 + 345
  const p = bestPartition([r(1), r(2), r(3), r(3, 1), r(4), r(5)]);
  expect(p.leftover).toEqual([]);
  expect(sizes(p.blocks)).toEqual([3, 3]);
});

test('covers one run and leaves an unmakeable remainder (size only — leftover identity is a tie)', () => {
  // {r5,r6,r7,b7,k7} has no all-valid partition; max coverage is 3 (a run OR the
  // 7-group), leaving 2 loose. WHICH 3 it keeps is a tie -> assert sizes only.
  // The "keep the pre-drop run" guarantee is partitionCluster's Pass 2 job (Task 4).
  const p = bestPartition([r(5), r(6), r(7), b(7), k(7)]);
  expect(p.blocks).toHaveLength(1);
  expect(p.blocks[0].length).toBe(3);
  expect(p.leftover).toHaveLength(2);
});

import {partitionCluster} from '../rummikub/arrange/partition';

test('Pass1: all-valid split is taken even though it breaks the pre-drop 5-run', () => {
  const pre = [[r(1), r(2), r(3), r(4), r(5)]];
  const p = partitionCluster([r(1), r(2), r(3), r(3, 1), r(4), r(5)], pre);
  expect(p.leftover).toEqual([]);
  expect(sizes(p.blocks)).toEqual([3, 3]);   // 123 + 345
});

test('Pass2: no all-valid -> pre-drop run preserved, new tiles leftover', () => {
  const pre = [[r(5), r(6), r(7)]];
  const p = partitionCluster([r(5), r(6), r(7), b(7), k(7)], pre);
  expect(p.blocks).toEqual([[r(5), r(6), r(7)]]);     // run kept intact
  expect(new Set(p.leftover)).toEqual(new Set([b(7), k(7)]));
});
