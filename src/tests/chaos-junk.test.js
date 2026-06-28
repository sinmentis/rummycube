// src/tests/chaos-junk.test.js
import {playAbilityCard} from '../rummikub/abilities/moves';
import {getPlayerHandTiles} from '../rummikub/projection';

const INVALID = 'INVALID_MOVE';

function junk(type) {
  return {id: `${type}-0`, type, rarity: type === 'junk4' ? 'blue' : 'white'};
}

// Plain G: target '1' starts with an empty hand; pool has 10 normal tiles.
function gWith(cards, opts = {}) {
  return {
    mode: 'chaos',
    abilityHands: {'0': cards.slice(), '1': []},
    abilityDiscard: [],
    peekGrants: {},
    shields: opts.shields || {},
    tilePositions: {},
    tilesPool: opts.pool || [101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
  };
}

const ctx = {currentPlayer: '0'};

test.each([['junk2', 2], ['junk3', 3], ['junk4', 4]])(
  '%s forces target to draw N tiles, pool shrinks by N, card discarded',
  (type, n) => {
    const G = gWith([junk(type)]);
    const before = G.tilesPool.length;
    const r = playAbilityCard({G, ctx, playerID: '0'}, `${type}-0`, '1');
    expect(r).toBeUndefined();
    expect(getPlayerHandTiles(G, '1')).toHaveLength(n);
    expect(G.tilesPool.length).toBe(before - n);
    expect(G.abilityHands['0']).toHaveLength(0);
    expect(G.abilityDiscard.map(c => c.id)).toContain(`${type}-0`);
  },
);

test('shield on target cancels the draw: shield consumed, target draws 0, card discarded', () => {
  const G = gWith([junk('junk4')], {shields: {'1': true}});
  const before = G.tilesPool.length;
  const r = playAbilityCard({G, ctx, playerID: '0'}, 'junk4-0', '1');
  expect(r).toBeUndefined();
  expect(getPlayerHandTiles(G, '1')).toHaveLength(0);   // drew nothing
  expect(G.tilesPool.length).toBe(before);              // pool untouched
  expect(G.shields['1']).toBeFalsy();                   // shield spent
  expect(G.abilityDiscard.map(c => c.id)).toContain('junk4-0'); // junk card discarded
});

test('missing target -> INVALID, no mutation', () => {
  const G = gWith([junk('junk2')]);
  expect(playAbilityCard({G, ctx, playerID: '0'}, 'junk2-0')).toBe(INVALID);
  expect(G.abilityHands['0']).toHaveLength(1);
  expect(G.abilityDiscard).toHaveLength(0);
  expect(G.tilesPool).toHaveLength(10);
});

test('not your turn -> INVALID, no mutation', () => {
  const G = gWith([junk('junk3')]);
  expect(playAbilityCard({G, ctx: {currentPlayer: '1'}, playerID: '0'}, 'junk3-0', '1')).toBe(INVALID);
  expect(G.abilityHands['0']).toHaveLength(1);
  expect(G.abilityDiscard).toHaveLength(0);
  expect(G.tilesPool).toHaveLength(10);
});

test('pool shorter than N: draws up to what remains', () => {
  const G = gWith([junk('junk4')], {pool: [201, 202]});
  playAbilityCard({G, ctx, playerID: '0'}, 'junk4-0', '1');
  expect(getPlayerHandTiles(G, '1')).toHaveLength(2);
  expect(G.tilesPool).toHaveLength(0);
});
