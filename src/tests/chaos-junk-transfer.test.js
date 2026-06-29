// src/tests/chaos-junk-transfer.test.js
// SP2a-T2 spike: prove pendingJunk transfer interrupt. A junks B -> hand goes to B
// (respondJunk stage). B accepts -> draws now. Timeout -> auto-accept (default).
import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {getPlayerHandTiles} from '../rummikub/projection';
import {HAND_GRID_ID} from '../rummikub/constants';
import {playAbilityCard, transferJunk, acceptJunk} from '../rummikub/abilities/moves';

function seedMatch() {
  return makeMatch({
    mode: 'chaos',
    abilityHands: {'0': [{id: 'junk2-0', type: 'junk2', rarity: 'white'}], '1': []},
    abilityDiscard: [], peekGrants: {}, shields: {},
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
  c0.events.endPhase();   // playersJoin -> play (opens on seat 1)
  c1.events.endTurn();    // seat 0 (A) is now current
  return {c0, c1};
}

test('A junks B -> pendingJunk set, B active in respondJunk; B accepts -> drew 2, pendingJunk cleared', () => {
  const spec = {game: seedMatch(), numPlayers: 2, multiplayer: Local()};
  const {c0, c1} = startA(spec);

  c0.moves.playAbilityCard('junk2-0', '1');
  expect(c0.getState().G.pendingJunk).toEqual({amount: 2, target: '1', from: '0'});
  expect(getPlayerHandTiles(c1.getState().G, '1')).toHaveLength(1);  // not drawn yet
  expect(c0.getState().ctx.activePlayers['1']).toBe('respondJunk');

  c1.moves.acceptJunk();
  const G = c1.getState().G;
  expect(getPlayerHandTiles(G, '1')).toHaveLength(3);           // started 1, drew 2
  expect(G.tilesPool).toHaveLength(4);
  expect(G.pendingJunk).toBeFalsy();
});

test('timeout default: an unanswered junk auto-accepts when A turn ends', () => {
  const spec = {game: seedMatch(), numPlayers: 2, multiplayer: Local()};
  const {c0, c1} = startA(spec);

  c0.moves.playAbilityCard('junk2-0', '1');
  expect(c0.getState().G.pendingJunk.target).toBe('1');
  c0.moves.endTurn();
  const G = c1.getState().G;
  expect(getPlayerHandTiles(G, '1')).toHaveLength(3);           // auto-accepted: 1 + 2
  expect(G.pendingJunk).toBeFalsy();
});

// SP2a-T3: a target holding their own junk card may stack+pass instead of accepting.
// Each transfer adds JUNK_AMOUNT to the pending stack and retargets; the final
// acceptJunk draws the whole chain. Shield on the holder absorbs the whole chain.
const INVALID = 'INVALID_MOVE';
const junk = (id, type) => ({id, type, rarity: type === 'junk4' ? 'blue' : 'white'});
const ctx = {currentPlayer: '0'};

function chainG(hands, opts = {}) {
  return {
    mode: 'chaos',
    abilityHands: hands,
    abilityDiscard: [], peekGrants: {},
    shields: opts.shields || {},
    tilePositions: {},
    tilesPool: opts.pool || [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112],
  };
}

test('A+2 -> B transfers junk3 (+3) -> C; C accept draws full 5, card discarded', () => {
  const G = chainG({'0': [junk('j2', 'junk2')], '1': [junk('j3', 'junk3')], '2': []});
  playAbilityCard({G, ctx, playerID: '0'}, 'j2', '1');
  expect(G.pendingJunk).toEqual({amount: 2, target: '1', from: '0'});

  const r = transferJunk({G, playerID: '1'}, 'j3', '2');
  expect(r).toBeUndefined();
  expect(G.pendingJunk).toEqual({amount: 5, target: '2', from: '1'});
  expect(G.abilityHands['1']).toHaveLength(0);
  expect(G.abilityDiscard.map(c => c.id)).toContain('j3');

  acceptJunk({G, ctx, playerID: '2'});
  expect(getPlayerHandTiles(G, '2')).toHaveLength(5);   // 2 + 3
  expect(G.pendingJunk).toBeFalsy();
});

test('shield on final target absorbs the whole chain: C draws 0, shield spent', () => {
  const G = chainG({'0': [junk('j2', 'junk2')], '1': [junk('j3', 'junk3')], '2': []}, {shields: {'2': true}});
  playAbilityCard({G, ctx, playerID: '0'}, 'j2', '1');
  transferJunk({G, playerID: '1'}, 'j3', '2');
  acceptJunk({G, ctx, playerID: '2'});
  expect(getPlayerHandTiles(G, '2')).toHaveLength(0);   // whole 5-stack absorbed
  expect(G.shields['2']).toBeFalsy();
  expect(G.pendingJunk).toBeFalsy();
});

test('chain is uncapped: A+2, B+3, D+4 stack to draw 9', () => {
  const G = chainG({'0': [junk('j2', 'junk2')], '1': [junk('j3', 'junk3')], '2': [junk('j4', 'junk4')], '3': []});
  playAbilityCard({G, ctx, playerID: '0'}, 'j2', '1');
  transferJunk({G, playerID: '1'}, 'j3', '2');
  transferJunk({G, playerID: '2'}, 'j4', '3');
  expect(G.pendingJunk).toEqual({amount: 9, target: '3', from: '2'});
  acceptJunk({G, ctx, playerID: '3'});
  expect(getPlayerHandTiles(G, '3')).toHaveLength(9);   // 2 + 3 + 4
  expect(G.pendingJunk).toBeFalsy();
});

test('transfer bound: nextTarget >= numPlayers (phantom seat) -> INVALID, chain untouched', () => {
  const G = chainG({'0': [junk('j2', 'junk2')], '1': [junk('j3', 'junk3')], '2': []});
  playAbilityCard({G, ctx, playerID: '0'}, 'j2', '1');
  const ctx3 = {currentPlayer: '0', numPlayers: 3};
  expect(transferJunk({G, ctx: ctx3, playerID: '1'}, 'j3', '3')).toBe(INVALID);  // seat 3 doesn't exist
  expect(transferJunk({G, ctx: ctx3, playerID: '1'}, 'j3', '9')).toBe(INVALID);  // way out of range
  expect(G.pendingJunk).toEqual({amount: 2, target: '1', from: '0'});            // untouched
  expect(G.abilityHands['1']).toHaveLength(1);                                   // card kept
});

test('transfer guards: only the target, only a junk card, never self -> INVALID', () => {
  const base = () => chainG({'0': [junk('j2', 'junk2')], '1': [junk('j3', 'junk3'), junk('s', 'shield')], '2': []});
  let G = base();
  playAbilityCard({G, ctx, playerID: '0'}, 'j2', '1');
  expect(transferJunk({G, playerID: '2'}, 'j3', '0')).toBe(INVALID);   // not the target
  expect(transferJunk({G, playerID: '1'}, 's', '2')).toBe(INVALID);    // not a junk card
  expect(transferJunk({G, playerID: '1'}, 'j3', '1')).toBe(INVALID);   // self
  expect(G.pendingJunk).toEqual({amount: 2, target: '1', from: '0'});       // untouched
});
