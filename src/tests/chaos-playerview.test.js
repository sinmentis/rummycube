import {playerView} from '../rummikub/playerView';
import {HAND_GRID_ID} from '../rummikub/constants';

const baseG = () => ({
  mode: 'chaos',
  tilePositions: {
    5: {id: 5, gridId: HAND_GRID_ID, playerID: '0', col: 0, row: 0},
    6: {id: 6, gridId: HAND_GRID_ID, playerID: '1', col: 0, row: 0},
  },
  abilityHands: {'0': [{id: 'peek-0', type: 'peek', rarity: 'white'}], '1': [{id: 'shield-0', type: 'shield', rarity: 'white'}, {id: 'skip-0', type: 'skip', rarity: 'gold'}]},
  abilityDeck: [{id: 'x'}], abilityDiscard: [],
});

test('opponent ability hands + counts are hidden; presence only', () => {
  const v = playerView({G: baseG(), ctx: {currentPlayer: '0'}, playerID: '0'});
  expect(v.abilityHands['0']).toHaveLength(1);     // own kept
  expect(v.abilityHands['1']).toBeUndefined();     // opponent content hidden
  expect(v.abilityPresence).toEqual({'1': true});  // presence, NO count, self omitted
  expect(v.abilityDeck).toEqual([]);               // deck hidden
});

test('peek grant lets the viewer see the target hand tiles', () => {
  const G = baseG(); G.peekGrants = {'0': '1'};   // player 0 peeked player 1
  const v = playerView({G, ctx: {currentPlayer: '0'}, playerID: '0'});
  expect(v.tilePositions['6']).toBeDefined();      // player 1's hand tile now visible
});

test('peek widens only the granted target: own visible, non-granted hidden, prev peek-free', () => {
  const G = baseG();
  G.tilePositions['7'] = {id: 7, gridId: HAND_GRID_ID, playerID: '2', col: 0, row: 0};
  G.prevTilePositions = {6: {id: 6, gridId: HAND_GRID_ID, playerID: '1', col: 0, row: 0}};
  G.peekGrants = {'0': '1'};
  const v = playerView({G, ctx: {currentPlayer: '0'}, playerID: '0'});
  expect(v.tilePositions['5']).toBeDefined();      // own tile still visible (peek widens, never narrows)
  expect(v.tilePositions['6']).toBeDefined();      // granted opponent revealed
  expect(v.tilePositions['7']).toBeUndefined();    // non-granted opponent stays hidden
  expect(v.prevTilePositions['6']).toBeUndefined(); // prior snapshot stays peek-free while grant active
});

// SP2a: pendingJunk is public board state (who owes how many) — cloneDeep must pass
// it through to every seat unstripped so both junker and target render it, while
// opponent ability hands stay hidden. The incoming-junk alert UI is SP2b.
test('pendingJunk passes through unstripped to both target and a third party', () => {
  const pending = {amount: 5, target: '1', from: '0'};
  for (const viewer of ['0', '1']) {
    const G = baseG(); G.pendingJunk = pending;
    const v = playerView({G, ctx: {currentPlayer: '0'}, playerID: viewer});
    const opponent = viewer === '0' ? '1' : '0';
    expect(v.pendingJunk).toEqual(pending);             // exposed, not stripped
    expect(v.abilityHands[opponent]).toBeUndefined();   // opponent hands still hidden
  }
});
