import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {RedJoker} from '../rummikub/util';
import {BOARD_GRID_ID, HAND_GRID_ID} from '../rummikub/constants';

// Seed a chaos board with a joker run 5-J-7 already on the table, jokerHeat empty.
test('a planted joker arms (heat 0) after a turn settles through the real onTurnEnd', () => {
  const seeded = makeMatch({
    mode: 'chaos', jokerHeat: {},
    abilityHands: {'0': [], '1': []}, abilityDeck: [], abilityDiscard: [], peekGrants: {}, shields: {},
    tilePositions: {
      5: {id: 5, gridId: BOARD_GRID_ID, row: 0, col: 0},
      [RedJoker]: {id: RedJoker, gridId: BOARD_GRID_ID, row: 0, col: 1},
      7: {id: 7, gridId: BOARD_GRID_ID, row: 0, col: 2},
      // each seat keeps a hand tile so ending a turn doesn't trigger checkGameOver
      90: {id: 90, gridId: HAND_GRID_ID, playerID: '0', col: 0, row: 0},
      91: {id: 91, gridId: HAND_GRID_ID, playerID: '1', col: 0, row: 0},
    },
    firstMoveDone: [true, true],
  });
  const c0 = Client({game: seeded, numPlayers: 2, playerID: '0', multiplayer: Local()});
  const c1 = Client({game: seeded, numPlayers: 2, playerID: '1', multiplayer: Local()});
  c0.start(); c1.start();
  c0.events.endPhase();   // -> play (opens seat 1)
  c1.events.endTurn();    // end player 1's turn -> onTurnEnd settles, then player 0 current

  // The joker was on the board through a full settlement and was NOT modified -> armed at heat 0.
  const G = c0.getState().G;
  expect(G.jokerHeat[String(RedJoker)]).toEqual({heat: 0, members: [5, 7]});
});

test('a modified joker group is rolled through the real onTurnEnd (random reaches the hook)', () => {
  // Seed a baseline mismatch: jokerHeat says members were [5,7], but the board run is 5-J-7-8.
  // The first settlement (player 1's onTurnEnd) sees the change -> increments + rolls. Outcome is
  // non-deterministic (p<=80%, can't force from the Client), but it MUST consume random without
  // crashing, proving random is threaded into onTurnEnd. Either it boomed (entry gone, group in
  // pool) or it survived (heat 2, baseline updated).
  const seeded = makeMatch({
    mode: 'chaos', jokerHeat: {[String(RedJoker)]: {heat: 1, members: [5, 7]}},
    abilityHands: {'0': [], '1': []}, abilityDeck: [], abilityDiscard: [], peekGrants: {}, shields: {},
    tilePositions: {
      5: {id: 5, gridId: BOARD_GRID_ID, row: 0, col: 0},
      [RedJoker]: {id: RedJoker, gridId: BOARD_GRID_ID, row: 0, col: 1},
      7: {id: 7, gridId: BOARD_GRID_ID, row: 0, col: 2},
      8: {id: 8, gridId: BOARD_GRID_ID, row: 0, col: 3}, // the added tile (baseline was [5,7])
      90: {id: 90, gridId: HAND_GRID_ID, playerID: '0', col: 0, row: 0},
      91: {id: 91, gridId: HAND_GRID_ID, playerID: '1', col: 0, row: 0},
    },
    tilesPool: [101, 102, 103, 104],
    firstMoveDone: [true, true],
  });
  const c0 = Client({game: seeded, numPlayers: 2, playerID: '0', multiplayer: Local()});
  const c1 = Client({game: seeded, numPlayers: 2, playerID: '1', multiplayer: Local()});
  c0.start(); c1.start();
  c0.events.endPhase();
  c1.events.endTurn(); // onTurnEnd settles the modified joker -> rolls (consumes random)

  const e = c0.getState().G.jokerHeat[String(RedJoker)];
  // boomed -> undefined; survived -> heat 2 with updated baseline. No crash == random was passed.
  expect(e === undefined || (e.heat === 2 && e.members.join(',') === '5,7,8')).toBe(true);
});
