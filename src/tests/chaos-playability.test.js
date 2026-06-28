// src/tests/chaos-playability.test.js
import {playAbilityCard} from '../rummikub/abilities/moves';
const INVALID = 'INVALID_MOVE';
function gWith(cards) {
  return {mode: 'chaos', abilityHands: {'0': cards.slice(), '1': []}, abilityDiscard: [], peekGrants: {}, shields: {}};
}
test('peek resolves: grant set, card discarded', () => {
  const G = gWith([{id: 'peek-0', type: 'peek', rarity: 'white'}]);
  const r = playAbilityCard({G, ctx: {currentPlayer: '0'}, playerID: '0'}, 'peek-0', '1');
  expect(r).toBeUndefined();
  expect(G.peekGrants['0']).toBe('1');
  expect(G.abilityHands['0']).toHaveLength(0);
  expect(G.abilityDiscard.map(c => c.id)).toContain('peek-0');
});
test('shield resolves: held flag set, card discarded', () => {
  const G = gWith([{id: 'shield-0', type: 'shield', rarity: 'white'}]);
  playAbilityCard({G, ctx: {currentPlayer: '0'}, playerID: '0'}, 'shield-0');
  expect(G.shields['0']).toBe(true);
  expect(G.abilityHands['0']).toHaveLength(0);
});
test('guards: not your turn / missing card / unimplemented type / peek without target -> INVALID', () => {
  const G = gWith([{id: 'skip-0', type: 'skip', rarity: 'gold'}, {id: 'peek-0', type: 'peek', rarity: 'white'}]);
  expect(playAbilityCard({G, ctx: {currentPlayer: '1'}, playerID: '0'}, 'skip-0')).toBe(INVALID); // not your turn
  expect(playAbilityCard({G, ctx: {currentPlayer: '0'}, playerID: '0'}, 'nope')).toBe(INVALID);   // no such card
  expect(playAbilityCard({G, ctx: {currentPlayer: '0'}, playerID: '0'}, 'skip-0')).toBe(INVALID); // skip not impl in SP1a
  expect(playAbilityCard({G, ctx: {currentPlayer: '0'}, playerID: '0'}, 'peek-0')).toBe(INVALID); // peek needs a target
});
