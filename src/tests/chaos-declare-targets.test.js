// 06 §3: all 10 ability types are bluffable; target-kind decides who may challenge.
// shield=self, wheel/bigwind=table, lock=board -> table-wide; peek/junk/skip/force
// aim at a player -> only that player. SINGLE_TARGET_DECLARES mirrors moves.js.
import {DECLARE_TYPES, SINGLE_TARGET_DECLARES, CARD_META} from '../rummikub/abilities/cardMeta';

test('every dealt card type is a bluffable declare (10 total)', () => {
  expect(DECLARE_TYPES).toHaveLength(10);
  expect([...DECLARE_TYPES].sort()).toEqual(
    ['bigwind', 'force', 'junk2', 'junk3', 'junk4', 'lock', 'peek', 'shield', 'skip', 'wheel'].sort(),
  );
  for (const t of DECLARE_TYPES) expect(CARD_META[t]).toBeTruthy();
});

test('only player-aimed cards are single-target; self/table/board are table-wide', () => {
  for (const t of ['peek', 'junk2', 'junk3', 'junk4', 'skip', 'force']) expect(SINGLE_TARGET_DECLARES.has(t)).toBe(true);
  for (const t of ['shield', 'wheel', 'bigwind', 'lock']) expect(SINGLE_TARGET_DECLARES.has(t)).toBe(false);
});

test('Lock copy says 2 turns, not a round', () => {
  expect(CARD_META.lock.effect).toMatch(/2 turns/);
  expect(CARD_META.lock.effect).not.toMatch(/round/i);
});
