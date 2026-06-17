import {makeSlotId, parseSlotId, toggleSelection} from '../rummikub/dndUtil';

test('slot id round-trips', () => {
  expect(makeSlotId('b', 3, 5)).toBe('b:3:5');
  expect(parseSlotId('b:3:5')).toEqual({gridId: 'b', col: 3, row: 5});
  const r = parseSlotId(makeSlotId('h', 0, 1));
  expect(r).toEqual({gridId: 'h', col: 0, row: 1});
});

test('toggleSelection adds and removes immutably', () => {
  expect(toggleSelection([], '42')).toEqual(['42']);
  expect(toggleSelection(['42'], '42')).toEqual([]);
  const start = ['1', '2'];
  const out = toggleSelection(start, '3');
  expect(out).toEqual(['1', '2', '3']);
  expect(start).toEqual(['1', '2']); // not mutated
});
