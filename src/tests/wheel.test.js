import {spinWheel} from '../rummikub/abilities/wheel';
import {playAbilityCard} from '../rummikub/abilities/moves';

// random.Number() returns these in order; one stub per spin hits exact buckets.
function seq(...nums) {
  let i = 0;
  return {Number: () => nums[i++]};
}
const hand = (G, seat) => Object.values(G.tilePositions).filter(p => p.gridId === 'h' && p.playerID === seat);
const board = (G) => Object.values(G.tilePositions).filter(p => p.gridId === 'b');
const ctx = {currentPlayer: '0', numPlayers: 2};

function handTile(id, seat = '0', col = 0) { return {id, gridId: 'h', playerID: seat, row: 0, col}; }
function boardTile(id, col) { return {id, gridId: 'b', playerID: null, row: 0, col}; }

test('classic: no-op, returns null, nothing moves', () => {
  const G = {mode: 'classic', tilePositions: {}, tilesPool: [101, 102, 103]};
  expect(spinWheel({G, ctx, random: seq(0.1, 0.1, 0.1)})).toBeNull();
  expect(G.tilesPool).toHaveLength(3);
  expect(G.lastWheel).toBeUndefined();
});

test('player draw1: pool->hand, count 1', () => {
  const G = {mode: 'chaos', tilePositions: {}, tilesPool: [101, 102, 103]};
  const r = spinWheel({G, ctx, random: seq(0.1, 0.1, 0.1)}); // player, draw, count=1
  expect(r).toEqual({object: 'player', action: 'draw', detail: {seat: '0', count: 1}});
  expect(hand(G, '0')).toHaveLength(1);
  expect(G.tilesPool).toHaveLength(2);
  expect(G.lastWheel).toBe(r);
});

test('player draw3: count 3', () => {
  const G = {mode: 'chaos', tilePositions: {}, tilesPool: [101, 102, 103, 104]};
  spinWheel({G, ctx, random: seq(0.1, 0.1, 0.9)}); // player, draw, count=3
  expect(hand(G, '0')).toHaveLength(3);
  expect(G.tilesPool).toHaveLength(1);
});

test('player discard: random hand tile -> pool', () => {
  const G = {mode: 'chaos', tilePositions: {201: handTile(201, '0', 0), 202: handTile(202, '0', 1)}, tilesPool: []};
  const r = spinWheel({G, ctx, random: seq(0.1, 0.5, 0.0)}); // player, discard, pick idx0
  expect(r.action).toBe('discard');
  expect(hand(G, '0')).toHaveLength(1);
  expect(G.tilesPool).toHaveLength(1);
});

test('player reshuffle: same hand count kept', () => {
  const G = {mode: 'chaos', tilePositions: {201: handTile(201, '0', 0), 202: handTile(202, '0', 1)}, tilesPool: [101, 102]};
  spinWheel({G, ctx, random: seq(0.1, 0.9)}); // player, reshuffle
  expect(hand(G, '0')).toHaveLength(2);
  expect(G.tilesPool).toHaveLength(2);
});

test('table add-set: ~3 pool -> board row', () => {
  const G = {mode: 'chaos', tilePositions: {}, tilesPool: [101, 102, 103, 104]};
  const r = spinWheel({G, ctx, random: seq(0.6, 0.1)}); // table, add
  expect(r.object).toBe('table');
  expect(board(G)).toHaveLength(3);
  expect(G.tilesPool).toHaveLength(1);
});

test('add-set conserves tiles: skipped jokers stay in pool, none vanish', () => {
  // pool has 2 jokers (14,30); they must be skipped onto board yet returned to pool.
  const G = {mode: 'chaos', tilePositions: {}, tilesPool: [101, 14, 102, 30, 103]};
  const before = G.tilesPool.length;
  spinWheel({G, ctx, random: seq(0.6, 0.1)}); // table, add
  expect(board(G)).toHaveLength(3);            // 3 normal tiles on board
  const total = board(G).length + G.tilesPool.length;
  expect(total).toBe(before);                  // 2 jokers preserved -> nothing leaked
  expect(G.tilesPool.filter(t => t === 14 || t === 30).sort()).toEqual([14, 30]);
});

test('table remove-set: a board run -> pool', () => {
  const G = {mode: 'chaos', tilePositions: {5: boardTile(5, 0), 6: boardTile(6, 1), 7: boardTile(7, 2)}, tilesPool: []};
  spinWheel({G, ctx, random: seq(0.6, 0.9, 0.0)}); // table, remove, run0
  expect(board(G)).toHaveLength(0);
  expect(G.tilesPool).toHaveLength(3);
});

test('never scatters a joker set: remove-set skips joker run -> no-op', () => {
  const G = {mode: 'chaos', tilePositions: {14: boardTile(14, 0), 30: boardTile(30, 1)}, tilesPool: []};
  const r = spinWheel({G, ctx, random: seq(0.6, 0.9, 0.0)}); // table, remove
  expect(r.detail.count).toBe(0);
  expect(board(G)).toHaveLength(2);
  expect(G.tilesPool).toHaveLength(0);
});

test('all: every seat draws', () => {
  const G = {mode: 'chaos', tilePositions: {}, tilesPool: [101, 102, 103, 104]};
  const r = spinWheel({G, ctx, random: seq(0.95, 0.1, 0.1, 0.1)}); // all, draw, count1 x2
  expect(r.object).toBe('all');
  expect(hand(G, '0')).toHaveLength(1);
  expect(hand(G, '1')).toHaveLength(1);
});

test('wheel card triggers an immediate spin + records lastWheel', () => {
  const G = {
    mode: 'chaos', abilityHands: {'0': [{id: 'wheel-0', type: 'wheel', rarity: 'blue'}]},
    abilityDiscard: [], tilePositions: {}, tilesPool: [101, 102, 103],
  };
  const r = playAbilityCard({G, ctx, playerID: '0', random: seq(0.1, 0.1, 0.1)}, 'wheel-0');
  expect(r).toBeUndefined();
  expect(G.lastWheel.object).toBe('player');
  expect(hand(G, '0')).toHaveLength(1);
  expect(G.abilityDiscard.map(c => c.id)).toContain('wheel-0');
});
