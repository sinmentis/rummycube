// src/tests/chaos-junk-integration.test.js
// SP2a-T4: full-engine junk transfer. Two Local clients on a seeded chaos match,
// arrange-move pattern: A plays junk2 on B through the real moves registry/stages,
// pendingJunk lands, B's acceptJunk draws the stack. Locks Game.js wiring end to end.
import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {getPlayerHandTiles} from '../rummikub/projection';
import {HAND_GRID_ID} from '../rummikub/constants';

function seedMatch() {
  return makeMatch({
    mode: 'chaos',
    abilityHands: {'0': [{id: 'junk2-0', type: 'junk2', rarity: 'white'}], '1': []},
    abilityDeck: [], abilityDiscard: [], peekGrants: {}, shields: {},
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
  c0.events.endPhase();   // playersJoin -> play
  c1.events.endTurn();    // seat 0 (A) is now current
  return {c0, c1};
}

test('A plays junk2 on B via real engine -> pendingJunk set; B acceptJunk -> drew 2, cleared', () => {
  const spec = {game: seedMatch(), numPlayers: 2, multiplayer: Local()};
  const {c0, c1} = startA(spec);

  c0.moves.playAbilityCard('junk2-0', '1');
  expect(c0.getState().G.pendingJunk).toEqual({amount: 2, target: '1', from: '0'});
  expect(c0.getState().ctx.activePlayers['1']).toBe('respondJunk');   // B owes a response
  expect(getPlayerHandTiles(c1.getState().G, '1')).toHaveLength(1);    // not drawn yet

  c1.moves.acceptJunk();
  const G = c1.getState().G;
  expect(getPlayerHandTiles(G, '1')).toHaveLength(3);   // started 1, drew 2
  expect(G.tilesPool).toHaveLength(4);
  expect(G.pendingJunk).toBeFalsy();
});
