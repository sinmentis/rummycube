import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {buildTileObj, getTiles} from '../rummikub/util';
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from '../rummikub/constants';

// A run 1..8 (sum 36 >= 30 first meld) is 8 board tiles in one turn -> > 7 -> wheel.
const run = [1, 2, 3, 4, 5, 6, 7, 8].map(n => buildTileObj(n, COLOR.red, 0));
const keep = buildTileObj(10, COLOR.red, 0); // seat0 holds one back so the turn isn't a win

function seed(mode) {
  const tilePositions = {};
  run.forEach((id, i) => {
    tilePositions[id] = {id, col: i, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
  });
  tilePositions[keep] = {id: keep, col: 8, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
  tilePositions[11] = {id: 11, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '1'};
  return makeMatch({
    mode, timePerTurn: 60000, tilesPool: getTiles(), tilePositions,
    abilityHands: {'0': [], '1': []}, abilityDeck: [], abilityDiscard: [], peekGrants: {}, shields: {},
    firstMoveDone: [true, true],
  });
}

test('chaos: a >7-tile board turn fires the wheel once and sets G.lastWheel, no crash', () => {
  const game = seed('chaos');
  const c0 = Client({game, numPlayers: 2, playerID: '0', multiplayer: Local()});
  const c1 = Client({game, numPlayers: 2, playerID: '1', multiplayer: Local()});
  c0.start(); c1.start();
  c0.events.endPhase(); c1.events.endPhase();

  c0.moves.moveTiles(0, 0, BOARD_GRID_ID, {id: run[0]}, run);
  c0.moves.endTurn();

  const {G} = c1.getState();
  expect(G.lastWheel).toBeTruthy();
  expect(['player', 'table', 'all']).toContain(G.lastWheel.object);
});

test('classic: a >7-tile board turn never spins the wheel', () => {
  const game = seed('classic');
  const c0 = Client({game, numPlayers: 2, playerID: '0', multiplayer: Local()});
  const c1 = Client({game, numPlayers: 2, playerID: '1', multiplayer: Local()});
  c0.start(); c1.start();
  c0.events.endPhase(); c1.events.endPhase();

  c0.moves.moveTiles(0, 0, BOARD_GRID_ID, {id: run[0]}, run);
  c0.moves.endTurn();

  expect(c1.getState().G.lastWheel == null).toBe(true);
});
