import {isValidBlock, blocksContaining} from '../rummikub/arrange/blocks';
import {buildTileObj, RedJoker} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';

const t = (v, c, variant = 0) => buildTileObj(v, c, variant);
const r = v => t(v, COLOR.red), b = v => t(v, COLOR.blue), k = v => t(v, COLOR.black);

test('isValidBlock accepts a run, a group, and a joker run; rejects junk', () => {
  expect(isValidBlock([r(1), r(2), r(3)])).toBe(true);     // run
  expect(isValidBlock([r(5), b(5), k(5)])).toBe(true);     // group
  expect(isValidBlock([r(5), RedJoker, r(7)])).toBe(true); // run with mid joker = 5,6,7
  expect(isValidBlock([r(1), r(2)])).toBe(false);          // too short
  expect(isValidBlock([r(1), b(2), k(9)])).toBe(false);    // nonsense
});

test('blocksContaining finds the run and group through the anchor', () => {
  // rem has a red run 4-5-6 and a 5-group; anchor red 5 sits in both
  const rem = [r(4), r(5), r(6), b(5), k(5)];
  const blocks = blocksContaining(rem, r(5));
  const asSets = blocks.map(bl => new Set(bl));
  expect(asSets).toContainEqual(new Set([r(4), r(5), r(6)]));
  expect(asSets).toContainEqual(new Set([r(5), b(5), k(5)]));
});

test('blocksContaining uses a joker to fill a run gap', () => {
  const rem = [r(5), r(7), RedJoker];
  const blocks = blocksContaining(rem, r(5));
  // expect a run 5,(J=6),7 in value order with the joker in the middle slot
  expect(blocks.some(bl => bl.length === 3 && bl[0] === r(5) && bl[2] === r(7))).toBe(true);
});
