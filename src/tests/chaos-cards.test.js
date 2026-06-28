// src/tests/chaos-cards.test.js
import {buildAbilityDeck, CARD_RARITY, DECK_COUNTS} from '../rummikub/abilities/cards';

test('deck has 28 cards with the v1 rarity mix', () => {
  const deck = buildAbilityDeck();
  expect(deck).toHaveLength(28);
  const byType = {};
  for (const c of deck) {
    expect(c).toHaveProperty('id');
    expect(c.rarity).toBe(CARD_RARITY[c.type]);
    byType[c.type] = (byType[c.type] || 0) + 1;
  }
  expect(byType).toEqual(DECK_COUNTS);
  const rarityCount = deck.reduce((a, c) => (a[c.rarity]++, a), {white: 0, blue: 0, gold: 0});
  expect(rarityCount).toEqual({white: 13, blue: 9, gold: 6});
  expect(new Set(deck.map(c => c.id)).size).toBe(28); // ids unique
});
