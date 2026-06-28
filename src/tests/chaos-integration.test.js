// src/tests/chaos-integration.test.js
import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {HAND_GRID_ID} from '../rummikub/constants';

test('a seeded peek, played through the registered move, resolves + discards (wiring)', () => {
  const seeded = makeMatch({
    mode: 'chaos',
    abilityHands: {'0': [{id: 'peek-0', type: 'peek', rarity: 'white'}], '1': []},
    abilityDiscard: [], peekGrants: {}, shields: {},
    tilePositions: {
      5: {id: 5, gridId: HAND_GRID_ID, playerID: '0', col: 0, row: 0},
      6: {id: 6, gridId: HAND_GRID_ID, playerID: '1', col: 0, row: 0},
    },
    firstMoveDone: [true, true],
  });
  const c0 = Client({game: seeded, numPlayers: 2, playerID: '0', multiplayer: Local()});
  const c1 = Client({game: seeded, numPlayers: 2, playerID: '1', multiplayer: Local()});
  c0.start(); c1.start();
  c0.events.endPhase();   // playersJoin -> play (the play phase opens on seat 1)
  c1.events.endTurn();    // end player 1's turn -> player 0 current (EVENT, unconditional, like arrange-move.test.js)

  c0.moves.playAbilityCard('peek-0', '1');                   // proves the move is registered + dispatchable
  const {G} = c0.getState();
  expect(G.peekGrants['0']).toBe('1');                       // resolved end-to-end
  expect(G.abilityHands['0']).toHaveLength(0);               // card spent
  expect(G.abilityDiscard.map(c => c.id)).toContain('peek-0'); // moved to discard
});
