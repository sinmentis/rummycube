// src/tests/chaos-setup.test.js
import {Rummikub} from '../rummikub/Game';
const mkRandom = () => ({Shuffle: a => a, Number: () => 0.99}); // deterministic stub

test('chaos setup deals 2 ability cards each and tracks the deck', () => {
  const G = Rummikub.setup({ctx: {numPlayers: 3}, random: mkRandom()}, {timePerTurn: 10, chaos: true});
  expect(G.mode).toBe('chaos');
  expect(Object.keys(G.abilityHands)).toEqual(['0', '1', '2']);
  for (const pid of ['0', '1', '2']) expect(G.abilityHands[pid]).toHaveLength(2);
  expect(G.abilityDeck).toHaveLength(28 - 3 * 2);
  expect(G.abilityDiscard).toEqual([]);
});

test('chaos setup initializes empty jokerHeat; classic has none', () => {
  const chaos = Rummikub.setup({ctx: {numPlayers: 2}, random: mkRandom()}, {timePerTurn: 10, chaos: true});
  expect(chaos.jokerHeat).toEqual({});
  const classic = Rummikub.setup({ctx: {numPlayers: 2}, random: mkRandom()}, {timePerTurn: 10});
  expect(classic.jokerHeat).toBeUndefined();
});

test('classic setup is unchanged: no ability fields', () => {
  const G = Rummikub.setup({ctx: {numPlayers: 2}, random: mkRandom()}, {timePerTurn: 10});
  expect(G.mode).toBe('classic');
  expect(G.abilityDeck).toBeUndefined();
  expect(G.abilityHands).toBeUndefined();
});
