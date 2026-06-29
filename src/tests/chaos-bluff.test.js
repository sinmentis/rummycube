// src/tests/chaos-bluff.test.js
// SP5-T1 bluff backend. Face-down play defers into G.pendingBluff and hands a
// respondBluff stage to the people allowed to challenge; challengeBluff/passBluff
// + onTurnEnd timeout settle it (06 resolve table). Reuses SP2a's interrupt shape:
// setActivePlayers({currentPlayer:NULL, value:{...}}) + auto-resolve on turn end.
import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {playAbilityCard, challengeBluff, passBluff, drawNormal} from '../rummikub/abilities/moves';
import {getPlayerHandTiles} from '../rummikub/projection';
import {RedJoker} from '../rummikub/util';
import {HAND_GRID_ID} from '../rummikub/constants';

const INVALID = 'INVALID_MOVE';

function card(type, id) {
  return {id: id || `${type}-0`, type, rarity: 'white'};
}

function gWith(cards, opts = {}) {
  return {
    mode: 'chaos',
    abilityHands: {'0': cards.slice(), '1': [], '2': []},
    abilityDiscard: [],
    peekGrants: {},
    shields: opts.shields || {},
    pendingBluff: null,
    tilePositions: opts.tilePositions || {},
    tilesPool: opts.pool || [101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
  };
}

const ctx = {currentPlayer: '0', numPlayers: 3};
const evStub = () => ({setActivePlayers: jest.fn()});

describe('drawNormal (pure, normal-only)', () => {
  test('pops requested count into a seat hand, skipping jokers to bottom', () => {
    const G = {tilePositions: {}, tilesPool: [101, RedJoker, 102, 103]};
    drawNormal(G, ctx, '1', 2);
    expect(getPlayerHandTiles(G, '1')).toHaveLength(2);
    expect(G.tilesPool).toContain(RedJoker); // joker stayed in pool, never drawn
  });
});

describe('face-down play defers into pendingBluff', () => {
  test('sets pendingBluff{actor,real,declared,target,cardId}, discards nothing, no effect yet', () => {
    const G = gWith([card('peek')]);
    const events = evStub();
    const r = playAbilityCard({G, ctx, playerID: '0', events}, 'peek-0', '1', {faceDown: true, declaredType: 'shield'});
    expect(r).toBeUndefined();
    expect(G.pendingBluff).toMatchObject({actor: '0', real: 'peek', declared: 'shield', target: '1', cardId: 'peek-0'});
    expect(G.abilityHands['0']).toHaveLength(0);   // pulled from hand
    expect(G.abilityDiscard).toHaveLength(0);      // discard nothing yet
    expect(G.peekGrants).toEqual({});              // no real effect yet
    expect(events.setActivePlayers).toHaveBeenCalledWith({currentPlayer: null, value: {'1': 'respondBluff'}});
  });

  test('non-single-target declared (wheel) gives ALL opponents respondBluff', () => {
    const G = gWith([card('peek')]);
    const events = evStub();
    playAbilityCard({G, ctx, playerID: '0', events}, 'peek-0', '1', {faceDown: true, declaredType: 'wheel'});
    expect(events.setActivePlayers).toHaveBeenCalledWith({currentPlayer: null, value: {'1': 'respondBluff', '2': 'respondBluff'}});
  });

  test('classic mode ignores faceDown -> INVALID, untouched', () => {
    const G = gWith([card('peek')]); G.mode = 'classic';
    expect(playAbilityCard({G, ctx, playerID: '0', events: evStub()}, 'peek-0', '1', {faceDown: true, declaredType: 'shield'})).toBe(INVALID);
    expect(G.pendingBluff).toBeNull();
  });
});

describe('challengeBluff SUCCESS (declared != real)', () => {
  test('challenger sheds 1 random tile to pool, actor draws 2, card void to discard, no effect', () => {
    const tp = {50: {id: 50, gridId: 'h', playerID: '1', col: 0, row: 0}};
    const G = gWith([card('peek')], {pool: [201, 202], tilePositions: tp});
    playAbilityCard({G, ctx, playerID: '0', events: evStub()}, 'peek-0', '1', {faceDown: true, declaredType: 'shield'});
    const events = evStub();
    challengeBluff({G, ctx, playerID: '1', events, random: {Number: () => 0}});
    expect(getPlayerHandTiles(G, '1')).toHaveLength(0);        // shed reward tile
    expect(getPlayerHandTiles(G, '0')).toHaveLength(2);        // actor penalty draw 2
    expect(G.abilityDiscard.map(c => c.id)).toContain('peek-0'); // voided
    expect(G.peekGrants).toEqual({});                          // declared effect did NOT apply
    expect(G.pendingBluff).toBeNull();
    expect(events.setActivePlayers).toHaveBeenCalledWith({all: null});
  });
});

describe('challengeBluff FAIL (declared == real)', () => {
  test('challenger draws 2, then declared effect applies, card discarded', () => {
    const G = gWith([card('peek')]);
    playAbilityCard({G, ctx, playerID: '0', events: evStub()}, 'peek-0', '1', {faceDown: true, declaredType: 'peek'});
    challengeBluff({G, ctx, playerID: '1', events: evStub(), random: {Number: () => 0}});
    expect(getPlayerHandTiles(G, '1')).toHaveLength(2);   // penalty draw 2
    expect(G.peekGrants['0']).toBe('1');                  // declared peek applied
    expect(G.abilityDiscard.map(c => c.id)).toContain('peek-0');
    expect(G.pendingBluff).toBeNull();
  });
});

describe('passBluff / no challenge', () => {
  test('declared effect applies face-up, card discarded, no penalty', () => {
    const G = gWith([card('shield')]);
    playAbilityCard({G, ctx, playerID: '0', events: evStub()}, 'shield-0', '1', {faceDown: true, declaredType: 'shield'});
    passBluff({G, ctx, playerID: '1', events: evStub()});
    expect(G.shields['0']).toBe(true);   // declared shield applied to actor
    expect(G.abilityDiscard.map(c => c.id)).toContain('shield-0');
    expect(G.pendingBluff).toBeNull();
  });

  test('non-target cannot challenge a single-target bluff', () => {
    const G = gWith([card('peek')]);
    playAbilityCard({G, ctx, playerID: '0', events: evStub()}, 'peek-0', '1', {faceDown: true, declaredType: 'shield'});
    expect(challengeBluff({G, ctx, playerID: '2', events: evStub(), random: {Number: () => 0}})).toBe(INVALID);
    expect(G.pendingBluff).not.toBeNull();
  });
});

// ── full-engine integration: real moves registry + respondBluff stage + onTurnEnd ──
function seedMatch() {
  return makeMatch({
    mode: 'chaos',
    abilityHands: {'0': [{id: 'peek-0', type: 'peek', rarity: 'white'}], '1': []},
    abilityDeck: [], abilityDiscard: [], peekGrants: {}, shields: {}, pendingBluff: null,
    tilePositions: {
      5: {id: 5, gridId: HAND_GRID_ID, playerID: '0', col: 0, row: 0},
      6: {id: 6, gridId: HAND_GRID_ID, playerID: '1', col: 0, row: 0},
    },
    tilesPool: [101, 102, 103, 104, 105, 106],
    firstMoveDone: [true, true],
  });
}
function startA(spec) {
  const c0 = Client({...spec, playerID: '0'});
  const c1 = Client({...spec, playerID: '1'});
  c0.start(); c1.start();
  c0.events.endPhase();
  c1.events.endTurn();
  return {c0, c1};
}

test('integration: face-down peek (declared shield) -> B in respondBluff; challenge SUCCESS', () => {
  const spec = {game: seedMatch(), numPlayers: 2, multiplayer: Local()};
  const {c0, c1} = startA(spec);
  c0.moves.playAbilityCard('peek-0', '1', {faceDown: true, declaredType: 'shield'});
  expect(c0.getState().G.pendingBluff).toMatchObject({actor: '0', declared: 'shield', target: '1'});
  expect(c0.getState().ctx.activePlayers['1']).toBe('respondBluff');
  c1.moves.challengeBluff();
  const G = c0.getState().G;
  expect(G.pendingBluff).toBeFalsy();
  expect(getPlayerHandTiles(G, '0')).toHaveLength(3);   // actor drew 2 (lied)
  expect(G.peekGrants['0']).toBeUndefined();            // voided, no effect
});

test('integration: nobody challenges -> onTurnEnd pass-resolves declared effect', () => {
  const spec = {game: seedMatch(), numPlayers: 2, multiplayer: Local()};
  const {c0, c1} = startA(spec);
  c0.moves.playAbilityCard('peek-0', '1', {faceDown: true, declaredType: 'shield'});
  expect(c1.getState().G.pendingBluff).toBeTruthy();
  c0.events.endTurn();
  const G = c0.getState().G;
  expect(G.pendingBluff).toBeFalsy();        // settled on turn end
  expect(G.shields['0']).toBe(true);         // declared shield applied face-up
});
