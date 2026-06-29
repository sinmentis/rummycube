// src/tests/chaos-final-cards.test.js
// SP6-T1: the last four ability cards become playable in playAbilityCard.
//  SKIP (gold, target)    -> G.skipNext[t]=true; onTurnBegin auto-endTurn + consume.
//  FORCE (blue, target)   -> G.forced[t]=true; onTurnEnd draws 3 if t made no board play.
//  LOCK (gold, row)       -> G.lockedSets=[{row,until:turn+2}]; moves on that row reject.
//  BIGWIND (blue, none)   -> every seat passes 1 random hand tile left, normal-only.
import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {playAbilityCard} from '../rummikub/abilities/moves';
import {PLAYABLE_TYPES} from '../rummikub/abilities/cardMeta';
import {onTurnBegin, onTurnEnd} from '../rummikub/turn';
import {moveTiles, insertTilesWithPush} from '../rummikub/moves';
import {getPlayerHandTiles} from '../rummikub/projection';
import {HAND_GRID_ID, BOARD_GRID_ID} from '../rummikub/constants';
import {RedJoker} from '../rummikub/util';

const INVALID = 'INVALID_MOVE';
const ctx = {currentPlayer: '0', numPlayers: 3, turn: 4};

function card(type, id) {
  return {id: id || `${type}-0`, type, rarity: 'gold'};
}
function gWith(cards, opts = {}) {
  return {
    mode: 'chaos',
    abilityHands: {'0': cards.slice(), '1': [], '2': []},
    abilityDiscard: [],
    peekGrants: {}, shields: {},
    tilePositions: opts.tilePositions || {},
    tilesPool: opts.pool || [101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
  };
}

describe('PLAYABLE set', () => {
  test('all four final cards are now playable', () => {
    for (const t of ['skip', 'lock', 'force', 'bigwind']) expect(PLAYABLE_TYPES.has(t)).toBe(true);
  });
});

describe('SKIP', () => {
  test('sets G.skipNext[target], discards the card', () => {
    const G = gWith([card('skip')]);
    expect(playAbilityCard({G, ctx, playerID: '0'}, 'skip-0', '1')).toBeUndefined();
    expect(G.skipNext['1']).toBe(true);
    expect(G.abilityHands['0']).toHaveLength(0);
    expect(G.abilityDiscard.map(c => c.id)).toContain('skip-0');
  });
  test('skip without a target -> INVALID, untouched', () => {
    const G = gWith([card('skip')]);
    expect(playAbilityCard({G, ctx, playerID: '0'}, 'skip-0')).toBe(INVALID);
    expect(G.abilityHands['0']).toHaveLength(1);
  });
  test('onTurnBegin auto-ends a flagged seat and consumes the flag', () => {
    const produce = require('immer').produce;
    const base = {mode: 'chaos', skipNext: {'1': true}, peekGrants: {}, tilePositions: {},
      lastCircle: [], connected: [], disconnectTurns: [], forfeited: [], turnExtended: []};
    const events = {endTurn: jest.fn()};
    const next = produce(base, d => { onTurnBegin({G: d, ctx: {currentPlayer: '1', turn: 5}, events, random: {Number: () => 1}}); });
    expect(events.endTurn).toHaveBeenCalled();
    expect(next.skipNext['1']).toBeFalsy();
  });
});

describe('FORCE', () => {
  function baseG() {
    return {mode: 'chaos', forced: {'0': true}, tilePositions: {}, prevTilePositions: {},
      tilesPool: [201, 202, 203, 204], lastCircle: [], lastWheel: null};
  }
  test('idle forced seat draws 3 normal on turn end; flag cleared', () => {
    const G = baseG();
    onTurnEnd({G, ctx: {currentPlayer: '0', numPlayers: 2}, events: {endGame: jest.fn()}, random: {Number: () => 0}});
    expect(getPlayerHandTiles(G, '0')).toHaveLength(3);
    expect(G.forced['0']).toBeFalsy();
  });
  test('forced seat that played a tile draws nothing; flag still cleared', () => {
    const G = baseG();
    G.tilePositions = {7: {id: 7, gridId: BOARD_GRID_ID, row: 0, col: 0}};
    onTurnEnd({G, ctx: {currentPlayer: '0', numPlayers: 2}, events: {endGame: jest.fn()}, random: {Number: () => 0}});
    expect(getPlayerHandTiles(G, '0')).toHaveLength(0);
    expect(G.forced['0']).toBeFalsy();
  });
});

describe('LOCK', () => {
  test('records the formed group tile ids + until: turn+2, discards card', () => {
    const tp = {7: {id: 7, gridId: BOARD_GRID_ID, row: 0, col: 0},
      8: {id: 8, gridId: BOARD_GRID_ID, row: 0, col: 1},
      9: {id: 9, gridId: BOARD_GRID_ID, row: 0, col: 2}};
    const G = gWith([card('lock')], {tilePositions: tp});
    playAbilityCard({G, ctx, playerID: '0'}, 'lock-0', 0);
    expect(G.lockedSets[0].until).toBe(6);
    expect(new Set(G.lockedSets[0].tiles)).toEqual(new Set([7, 8, 9]));
    expect(G.abilityDiscard.map(c => c.id)).toContain('lock-0');
  });
  test('moveTiles rejects touching a tile in a locked group until expiry', () => {
    const tp = {9: {id: 9, gridId: BOARD_GRID_ID, row: 1, col: 0}};
    const G = {mode: 'chaos', lockedSets: [{row: 1, tiles: [9], until: 6}], tilePositions: tp, gameStateStack: []};
    expect(moveTiles({G, ctx: {currentPlayer: '0', turn: 4}, playerID: '0'}, 5, 1, BOARD_GRID_ID, {id: 9}, [])).toBe(INVALID);
    expect(insertTilesWithPush({G, ctx: {currentPlayer: '0', turn: 4}, playerID: '0'}, 5, 1, BOARD_GRID_ID, {id: 9}, [])).toBe(INVALID);
  });
  test('lock expires once ctx.turn reaches until', () => {
    const produce = require('immer').produce;
    const tp = {9: {id: 9, gridId: BOARD_GRID_ID, row: 1, col: 2}};
    const base = {mode: 'chaos', lockedSets: [{row: 1, tiles: [9], until: 6}], tilePositions: tp, gameStateStack: [], prevTilePositions: {}};
    const next = produce(base, d => { moveTiles({G: d, ctx: {currentPlayer: '0', turn: 6}, playerID: '0'}, 5, 1, BOARD_GRID_ID, {id: 9}, []); });
    expect(next.tilePositions[9].col).toBe(5);   // moved, lock no longer blocks
  });
});

describe('BIGWIND', () => {
  test('every seat passes 1 normal tile to the left; jokers stay put', () => {
    const tp = {
      11: {id: 11, gridId: HAND_GRID_ID, playerID: '0', row: 0, col: 0},
      22: {id: 22, gridId: HAND_GRID_ID, playerID: '1', row: 0, col: 0},
      33: {id: 33, gridId: HAND_GRID_ID, playerID: '2', row: 0, col: 0},
    };
    const G = gWith([card('bigwind')], {tilePositions: tp});
    playAbilityCard({G, ctx, playerID: '0', random: {Number: () => 0}}, 'bigwind-0');
    // each seat keeps a hand of size 1, but the tile is a neighbour's, not its own
    for (const s of ['0', '1', '2']) expect(getPlayerHandTiles(G, s)).toHaveLength(1);
    const owner = id => G.tilePositions[id].playerID;
    expect(new Set([owner(11), owner(22), owner(33)])).toEqual(new Set(['0', '1', '2']));
    expect(owner(11)).not.toBe('0');
    expect(G.abilityDiscard.map(c => c.id)).toContain('bigwind-0');
  });
  test('a seat holding only a joker passes nothing', () => {
    const tp = {[RedJoker]: {id: RedJoker, gridId: HAND_GRID_ID, playerID: '0', row: 0, col: 0}};
    const G = gWith([card('bigwind')], {tilePositions: tp});
    G.abilityHands = {'0': [card('bigwind')], '1': []};
    playAbilityCard({G, ctx: {currentPlayer: '0', numPlayers: 2, turn: 1}, playerID: '0', random: {Number: () => 0}}, 'bigwind-0');
    expect(getPlayerHandTiles(G, '0')).toHaveLength(1); // joker stayed
  });
});

// integration: skip auto-pass through the real engine
function seedMatch() {
  return makeMatch({
    mode: 'chaos',
    abilityHands: {'0': [{id: 'skip-0', type: 'skip', rarity: 'gold'}], '1': []},
    abilityDeck: [], abilityDiscard: [], peekGrants: {}, shields: {},
    tilePositions: {
      5: {id: 5, gridId: HAND_GRID_ID, playerID: '0', col: 0, row: 0},
      6: {id: 6, gridId: HAND_GRID_ID, playerID: '1', col: 0, row: 0},
    },
    tilesPool: [101, 102, 103, 104, 105, 106],
    firstMoveDone: [true, true],
  });
}
test('integration: skip target turn auto-passes back to actor', () => {
  const spec = {game: seedMatch(), numPlayers: 2, multiplayer: Local()};
  const c0 = Client({...spec, playerID: '0'});
  const c1 = Client({...spec, playerID: '1'});
  c0.start(); c1.start();
  c0.events.endPhase(); c1.events.endTurn();
  c0.moves.playAbilityCard('skip-0', '1');
  expect(c0.getState().G.skipNext['1']).toBe(true);
  c0.events.endTurn();                // seat 1's turn begins, auto-skips
  const st = c0.getState();
  expect(st.ctx.currentPlayer).toBe('0');   // back to actor
  expect(st.G.skipNext['1']).toBeFalsy();    // consumed
});
