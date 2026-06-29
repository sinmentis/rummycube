// Fix2 P0: LOCK freezes a formed GROUP, not a whole board row. playAbilityCard
// stores the locked group's tile-id set (group signature) on G.lockedSets; any
// move touching one of those ids is rejected until expiry. A tile elsewhere on the
// same row stays movable. Marker rides the group, not the full row.
import {playAbilityCard} from '../rummikub/abilities/moves';
import {moveTiles} from '../rummikub/moves';
import {BOARD_GRID_ID} from '../rummikub/constants';
import React from 'react';
import {render} from '@testing-library/react';
import {DndContext} from '@dnd-kit/core';
import GridContainer from '../rummikub/components/GridContainer';

const INVALID = 'INVALID_MOVE';
const ctx = {currentPlayer: '0', numPlayers: 3, turn: 4};

// Blue 5-6-7 (a real run) on row 1, plus a stray tile far away on the same row.
function boardG(extra = {}) {
  return {
    mode: 'chaos',
    abilityHands: {'0': [{id: 'lock-0', type: 'lock', rarity: 'gold'}], '1': [], '2': []},
    abilityDiscard: [],
    gameStateStack: [],
    tilePositions: {
      31: {id: 31, gridId: BOARD_GRID_ID, row: 1, col: 0},
      32: {id: 32, gridId: BOARD_GRID_ID, row: 1, col: 1},
      33: {id: 33, gridId: BOARD_GRID_ID, row: 1, col: 2},
      99: {id: 99, gridId: BOARD_GRID_ID, row: 1, col: 8}, // separate group, same row
    },
    ...extra,
  };
}

test('lock stores the formed group tile ids, not just the row', () => {
  const G = boardG();
  playAbilityCard({G, ctx, playerID: '0'}, 'lock-0', 1);
  expect(G.lockedSets).toHaveLength(1);
  expect(new Set(G.lockedSets[0].tiles)).toEqual(new Set([31, 32, 33]));
  expect(G.lockedSets[0].until).toBe(6);
});

test('moving a locked group tile is rejected; an off-group tile on the same row is free', () => {
  const produce = require('immer').produce;
  const tp = {
    31: {id: 31, gridId: BOARD_GRID_ID, row: 1, col: 0},
    99: {id: 99, gridId: BOARD_GRID_ID, row: 1, col: 8},
  };
  const G = {mode: 'chaos', gameStateStack: [], prevTilePositions: {}, lockedSets: [{row: 1, tiles: [31, 32, 33], until: 6}], tilePositions: tp};
  expect(moveTiles({G, ctx: {currentPlayer: '0', turn: 4}, playerID: '0'}, 4, 2, BOARD_GRID_ID, {id: 31}, [])).toBe(INVALID);
  const next = produce(G, d => { moveTiles({G: d, ctx: {currentPlayer: '0', turn: 4}, playerID: '0'}, 5, 2, BOARD_GRID_ID, {id: 99}, []); });
  expect(next.tilePositions[99]).toMatchObject({row: 2, col: 5});   // off-group tile moved freely
});

test('lock expires once ctx.turn reaches until', () => {
  const produce = require('immer').produce;
  const base = {mode: 'chaos', gameStateStack: [], prevTilePositions: {}, lockedSets: [{row: 1, tiles: [31], until: 6}],
    tilePositions: {31: {id: 31, gridId: BOARD_GRID_ID, row: 1, col: 0}}};
  const next = produce(base, d => { moveTiles({G: d, ctx: {currentPlayer: '0', turn: 6}, playerID: '0'}, 4, 2, BOARD_GRID_ID, {id: 31}, []); });
  expect(next.tilePositions[31].col).toBe(4);
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
