import {applyChaosTurnStart} from '../rummikub/turn';

const baseG = () => ({
  mode: 'chaos', abilityDeck: [{id: 'a'}, {id: 'b'}], abilityHands: {'0': [], '1': []},
  peekGrants: {'0': '1'},
});

test('drip deals 1 card when the roll passes (chaos)', () => {
  const G = baseG();
  applyChaosTurnStart({G, seat: '0', random: {Number: () => 0.1}}); // <0.3 → deal
  expect(G.abilityHands['0']).toHaveLength(1);
  expect(G.abilityDeck).toHaveLength(1);
  expect(G.peekGrants['0']).toBeUndefined(); // own peek grant expired on own turn
});

test('drip deals nothing when the roll fails, but peek still expires', () => {
  const G = baseG();
  applyChaosTurnStart({G, seat: '0', random: {Number: () => 0.9}}); // >=0.3 → none
  expect(G.abilityHands['0']).toHaveLength(0);
  expect(G.peekGrants['0']).toBeUndefined();
});

test('non-chaos is a no-op and never throws', () => {
  const G = {mode: 'classic', abilityHands: {'0': []}, abilityDeck: [{id: 'a'}], peekGrants: {}};
  expect(() => applyChaosTurnStart({G, seat: '0', random: {Number: () => 0.1}})).not.toThrow();
  expect(G.abilityHands['0']).toHaveLength(0);
  expect(G.abilityDeck).toHaveLength(1);
});
