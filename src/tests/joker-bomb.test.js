import {settleJokerBombs, fuseProb, jokerGroups} from '../rummikub/abilities/jokerBomb';
import {RedJoker} from '../rummikub/util';

const J = RedJoker; // joker tile id (=14, verified); 5/7/8/90/91/101.. are non-joker
// helper: place tiles on board row 0 starting col c
function boardRow(ids, row = 0, startCol = 0) {
  const tp = {};
  ids.forEach((id, i) => { tp[id] = {id, gridId: 'b', row, col: startCol + i}; });
  return tp;
}
const ctx = {currentPlayer: '0'};
const noBoom = {Number: () => 0.99};   // never < p
const alwaysBoom = {Number: () => 0.0}; // always < p
const events = {};

test('fuseProb: 20/35/50/65/80 cap', () => {
  expect(fuseProb(1)).toBeCloseTo(0.20);
  expect(fuseProb(2)).toBeCloseTo(0.35);
  expect(fuseProb(3)).toBeCloseTo(0.50);
  expect(fuseProb(4)).toBeCloseTo(0.65);
  expect(fuseProb(5)).toBeCloseTo(0.80);
  expect(fuseProb(9)).toBeCloseTo(0.80); // cap
});

test('jokerGroups: finds the joker run + its non-joker members', () => {
  const tp = boardRow([5, J, 7]); // a run 5-J-7
  const g = jokerGroups(tp);
  expect(Object.keys(g)).toEqual([String(J)]);
  expect(g[String(J)].members).toEqual([5, 7]);
  expect(g[String(J)].seqIds.map(Number).sort((a,b)=>a-b)).toEqual([5, 7, J].sort((a,b)=>a-b));
});

test('plant: a brand-new board joker arms at heat 0 and never rolls', () => {
  const G = {mode: 'chaos', tilePositions: boardRow([5, J, 7]), tilesPool: [], jokerHeat: {}};
  settleJokerBombs({G, ctx, random: alwaysBoom, events});
  expect(G.jokerHeat[String(J)]).toEqual({heat: 0, members: [5, 7]});
  expect(G.tilePositions[String(J)]).toBeDefined(); // not boomed
});

test('unchanged group: no roll even with alwaysBoom', () => {
  const G = {mode: 'chaos', tilePositions: boardRow([5, J, 7]), tilesPool: [], jokerHeat: {[String(J)]: {heat: 3, members: [5, 7]}}};
  settleJokerBombs({G, ctx, random: alwaysBoom, events});
  expect(G.jokerHeat[String(J)].heat).toBe(3); // untouched
  expect(G.tilePositions[String(J)]).toBeDefined();
});

test('modified + survive: heat++ and baseline updates (noBoom)', () => {
  // baseline members [5,7]; now run is 5-J-7-8 (added 8)
  const G = {mode: 'chaos', tilePositions: boardRow([5, J, 7, 8]), tilesPool: [], jokerHeat: {[String(J)]: {heat: 1, members: [5, 7]}}};
  settleJokerBombs({G, ctx, random: noBoom, events});
  expect(G.jokerHeat[String(J)]).toEqual({heat: 2, members: [5, 7, 8]});
});

test('modified + boom: group scatters to pool + toucher draws 3', () => {
  const hand = {}; // current player's hand starts empty
  const G = {mode: 'chaos', tilePositions: boardRow([5, J, 7, 8]), tilesPool: [101, 102, 103, 104],
             jokerHeat: {[String(J)]: {heat: 4, members: [5, 7]}}}; // heat will become 5 -> 80%
  settleJokerBombs({G, ctx, random: alwaysBoom, events});
  // group [5,J,7,8] removed from board, pushed to pool; heat entry deleted
  for (const id of [5, J, 7, 8]) expect(G.tilePositions[String(id)]).toBeUndefined();
  expect(G.jokerHeat[String(J)]).toBeUndefined();
  // toucher drew 3 normal tiles from pool into hand grid
  const handTiles = Object.values(G.tilePositions).filter(p => p.gridId === 'h' && p.playerID === '0');
  expect(handTiles).toHaveLength(3);
  // pool: had 4, drew 3, gained 4 scattered (5,J,7,8) => 4-3+4 = 5
  expect(G.tilesPool).toHaveLength(5);
});

test('retrieve to hand: joker gone from board -> heat reset', () => {
  // jokerHeat had an entry for J, but J is no longer on the board
  const G = {mode: 'chaos', tilePositions: boardRow([5, 6, 7]), tilesPool: [], jokerHeat: {[String(J)]: {heat: 3, members: [5, 7]}}};
  settleJokerBombs({G, ctx, random: alwaysBoom, events});
  expect(G.jokerHeat[String(J)]).toBeUndefined();
});

test('two jokers in one run boom once (dedupe)', () => {
  // run [5,J,7,J,9] holds two jokers (14=red, 30=black). Both share one run;
  // baseline [5,7] differs from current members [5,7,9] so each is "modified".
  // Without dedupe both jokers boom: scatter twice + draw 6. With dedupe: draw 3.
  const G = {mode: 'chaos',
    tilePositions: (() => {const tp = {}; [5, 14, 7, 30, 9].forEach((id, i) => tp[id] = {id, gridId: 'b', row: 0, col: i}); return tp;})(),
    tilesPool: [101, 102, 103, 104, 105, 106],
    jokerHeat: {'14': {heat: 4, members: [5, 7]}, '30': {heat: 4, members: [5, 7]}}};
  settleJokerBombs({G, ctx, random: {Number: () => 0}, events: {}});
  const hand = Object.values(G.tilePositions).filter(p => p.gridId === 'h' && p.playerID === '0');
  expect(hand).toHaveLength(3); // not 6
});

test('classic: no-op', () => {
  const G = {mode: 'classic', tilePositions: boardRow([5, J, 7]), tilesPool: [], jokerHeat: {}};
  settleJokerBombs({G, ctx, random: alwaysBoom, events});
  expect(G.jokerHeat).toEqual({}); // untouched, no arming
  expect(G.tilePositions[String(J)]).toBeDefined();
});
