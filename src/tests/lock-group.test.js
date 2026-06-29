// Fix4: LOCK freezes a real FORMED GROUP for two turns, and the freeze is enforced
// against EVERY board-mutating move. On play the targeted row must resolve to a
// non-empty, isSequenceValid group; otherwise the move is rejected BEFORE the card
// is consumed (no fizzle that still eats the card). While active the locked tile
// ids cannot be moved via moveTiles, insertTilesWithPush (including an arrangeBoard
// reflow that would shift them), or retrieveJoker. Classic mode has no lockedSets,
// so all of this is a chaos-only no-op.
import {playAbilityCard} from '../rummikub/abilities/moves';
import {moveTiles, insertTilesWithPush, retrieveJoker} from '../rummikub/moves';
import {buildTileObj, BlackJoker} from '../rummikub/util';
import {BOARD_GRID_ID, HAND_GRID_ID, COLOR} from '../rummikub/constants';
import {produce} from 'immer';
import React from 'react';
import {render} from '@testing-library/react';
import {DndContext} from '@dnd-kit/core';
import GridContainer from '../rummikub/components/GridContainer';

const INVALID = 'INVALID_MOVE';
const ctx = {currentPlayer: '0', numPlayers: 3, turn: 4};

const blue = (v, variant = 0) => buildTileObj(v, COLOR.blue, variant);
const red = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);

const boardTile = (tp, id, col, row = 1) => { tp[id] = {id, col, row, gridId: BOARD_GRID_ID, tmp: false, playerID: null}; };
const handTile = (tp, id, col, row = 0) => { tp[id] = {id, col, row, gridId: HAND_GRID_ID, playerID: '0'}; };

// Board with a real blue 5-6-7 run on row 1 plus a stray off-group tile far away
// on the same row. `groupTiles` swaps in a different on-row group for the lock test.
function boardG(groupTiles = [blue(5), blue(6), blue(7)]) {
  const tp = {};
  groupTiles.forEach((id, i) => boardTile(tp, id, i, 1));
  boardTile(tp, blue(11), 8, 1); // separate group, same row, never part of the lock
  return {
    mode: 'chaos',
    abilityHands: {'0': [{id: 'lock-0', type: 'lock', rarity: 'gold'}], '1': [], '2': []},
    abilityDiscard: [],
    gameStateStack: [],
    prevTilePositions: {},
    tilePositions: tp,
  };
}

test('lock on a real formed group stores its tile ids (not the whole row) and consumes the card', () => {
  const G = boardG();
  playAbilityCard({G, ctx, playerID: '0'}, 'lock-0', 1);
  expect(G.lockedSets).toHaveLength(1);
  expect(new Set(G.lockedSets[0].tiles)).toEqual(new Set([blue(5), blue(6), blue(7)]));
  expect(G.lockedSets[0].until).toBe(6); // turn 4 + 2
  expect(G.abilityHands['0']).toHaveLength(0); // card consumed
});

test('lock REJECTS an invalid group and does not consume the card', () => {
  // blue 5,7,9 are contiguous on the board but not a valid run (gaps).
  const G = boardG([blue(5), blue(7), blue(9)]);
  expect(playAbilityCard({G, ctx, playerID: '0'}, 'lock-0', 1)).toBe(INVALID);
  expect(G.lockedSets).toBeUndefined();
  expect(G.abilityHands['0']).toHaveLength(1); // NOT discarded
});

test('lock REJECTS an empty row and does not consume the card', () => {
  const G = boardG();
  expect(playAbilityCard({G, ctx, playerID: '0'}, 'lock-0', 5)).toBe(INVALID); // row 5 is empty
  expect(G.lockedSets).toBeUndefined();
  expect(G.abilityHands['0']).toHaveLength(1);
});

test('moveTiles: moving a locked tile is rejected; an off-group tile on the same row stays free', () => {
  const tp = {};
  boardTile(tp, blue(5), 0, 1);
  boardTile(tp, blue(11), 8, 1);
  const G = {mode: 'chaos', gameStateStack: [], prevTilePositions: {},
    lockedSets: [{row: 1, tiles: [blue(5), blue(6), blue(7)], until: 6}], tilePositions: tp};
  expect(moveTiles({G, ctx, playerID: '0'}, 4, 2, BOARD_GRID_ID, {id: blue(5)}, [])).toBe(INVALID);
  const next = produce(G, d => { moveTiles({G: d, ctx, playerID: '0'}, 5, 2, BOARD_GRID_ID, {id: blue(11)}, []); });
  expect(next.tilePositions[blue(11)]).toMatchObject({row: 2, col: 5}); // off-group tile moved freely
});

test('insertTilesWithPush: a drop whose reflow would shift a locked tile is rejected', () => {
  // red 1..5 is a single valid run; lock it all. Dropping a duplicate red 3 would
  // reflow to "123 _ 345", shifting red4/red5 right -> must be rejected.
  const make = () => {
    const tp = {};
    [1, 2, 3, 4, 5].forEach((v, i) => boardTile(tp, red(v), i, 0));
    handTile(tp, red(3, 1), 0);
    return {mode: 'chaos', gameStateStack: [], prevTilePositions: {},
      lockedSets: [{row: 0, tiles: [red(1), red(2), red(3), red(4), red(5)], until: 6}], tilePositions: tp};
  };
  const dup = red(3, 1);

  const locked = make();
  expect(insertTilesWithPush({G: locked, ctx, playerID: '0'}, 5, 0, BOARD_GRID_ID, {id: dup}, [dup]))
    .toBe(INVALID);
  expect(locked.tilePositions[red(4)].col).toBe(3); // locked tiles never moved
  expect(locked.tilePositions[red(5)].col).toBe(4);

  // Same drop with the lock expired (turn 6 >= until) reflows as normal.
  const free = produce(make(), d => {
    insertTilesWithPush({G: d, ctx: {...ctx, turn: 6}, playerID: '0'}, 5, 0, BOARD_GRID_ID, {id: dup}, [dup]);
  });
  expect(free.tilePositions[red(4)].col).toBe(5);
  expect(free.tilePositions[red(5)].col).toBe(6);
});

test('insertTilesWithPush: directly dragging a locked tile is rejected', () => {
  const tp = {};
  [1, 2, 3].forEach((v, i) => boardTile(tp, red(v), i, 0));
  const G = {mode: 'chaos', gameStateStack: [], prevTilePositions: {},
    lockedSets: [{row: 0, tiles: [red(1), red(2), red(3)], until: 6}], tilePositions: tp};
  expect(insertTilesWithPush({G, ctx, playerID: '0'}, 6, 0, BOARD_GRID_ID, {id: red(2)}, [red(2)]))
    .toBe(INVALID);
});

test('retrieveJoker: reclaiming a joker that sits in a locked group is rejected', () => {
  // red 4 _ red 6 with a frozen BlackJoker (represents red 5) in the middle.
  const red5 = red(5);
  const tp = {};
  boardTile(tp, red(4), 0, 0);
  tp[BlackJoker] = {id: BlackJoker, col: 1, row: 0, gridId: BOARD_GRID_ID, tmp: false, playerID: null};
  boardTile(tp, red(6), 2, 0);
  handTile(tp, red5, 0);
  const G = {mode: 'chaos', gameStateStack: [], prevTilePositions: {},
    lockedSets: [{row: 0, tiles: [red(4), BlackJoker, red(6)], until: 6}], tilePositions: tp};
  expect(retrieveJoker({G, ctx, playerID: '0'}, BlackJoker, red5)).toBe(INVALID);
  expect(G.tilePositions[BlackJoker].gridId).toBe(BOARD_GRID_ID); // joker untouched
});

test('lock expires once ctx.turn reaches until', () => {
  const base = {mode: 'chaos', gameStateStack: [], prevTilePositions: {},
    lockedSets: [{row: 1, tiles: [blue(5)], until: 6}],
    tilePositions: {[blue(5)]: {id: blue(5), gridId: BOARD_GRID_ID, row: 1, col: 0}}};
  const next = produce(base, d => { moveTiles({G: d, ctx: {...ctx, turn: 6}, playerID: '0'}, 4, 2, BOARD_GRID_ID, {id: blue(5)}, []); });
  expect(next.tilePositions[blue(5)].col).toBe(4);
});

test('the locked group cells carry the lock marker; off-group cells do not', () => {
  const {container} = render(
    <DndContext>
      <GridContainer tiles2dArray={[[101, 102, 103, null, 104]]} rows={1} cols={5}
        canDnD={false} isDragActive={false} gridId={BOARD_GRID_ID} validTiles={[]}
        highlightTiles={false} playableTiles={[]} selectedTiles={[]}
        handleTileSelection={() => {}} onLongPress={() => {}} newlyAdded={[]}
        lockedTiles={[101, 102, 103]}/>
    </DndContext>
  );
  expect(container.querySelectorAll('.locked-cell')).toHaveLength(3);
  expect(container.querySelectorAll('.lock-mark')).toHaveLength(1); // one marker on the group
});
