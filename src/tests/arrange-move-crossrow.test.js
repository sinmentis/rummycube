import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {buildTileObj} from '../rummikub/util';
import {COLOR, BOARD_GRID_ID, HAND_GRID_ID} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const b = v => buildTileObj(v, COLOR.blue, 0);

test('a drop that overflows the row slides the neighbour, and one undo restores it', () => {
  const tilePositions = {};
  for (let v = 1; v <= 9; v++) { const id = r(v); tilePositions[id] = {id, col: v - 1, row: 0, gridId: BOARD_GRID_ID}; }
  [b(1), b(2), b(3)].forEach((id, i) => { tilePositions[id] = {id, col: 11 + i, row: 0, gridId: BOARD_GRID_ID}; });
  const dup = r(5, 1);
  tilePositions[dup] = {id: dup, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
  const game = makeMatch({tilePositions, prevTilePositions: tilePositions, firstMoveDone: [true, true]});
  // give player 1 a spare tile + make player 0 current (mirror arrange-move.test.js harness)
  tilePositions[b(9)] = {id: b(9), col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '1'};
  const c0 = Client({game, multiplayer: Local(), playerID: '0'});
  const c1 = Client({game, multiplayer: Local(), playerID: '1'});
  c0.start(); c1.start();
  c0.events.endPhase(); c1.events.endPhase();
  // ensure player 0 is current: if not, end player 1's turn first (harness detail)
  if (c0.getState().ctx.currentPlayer !== '0') { c1.moves.endTurn?.(); }

  const before = c0.getState().G.tilePositions[b(1)].col;            // 11
  c0.moves.insertTilesWithPush(4, 0, BOARD_GRID_ID, {id: dup}, [dup]); // drop dup-5 INSIDE the run (col 4)
  const after = c0.getState().G.tilePositions[b(1)];
  expect(after.col).toBeGreaterThan(before);                          // b-block slid right (separate neighbour)
  expect(after.row).toBe(0);

  c0.moves.undo();
  expect(c0.getState().G.tilePositions[b(1)].col).toBe(before);       // one undo restores the whole arrangement
});

// Added by Task 5: restore the move-level coverage of arrangeBoard's genuine
// reject. Task 4 turned the old overflow->reject path into relocate-commit, which
// removed the only end-to-end check that a true engine reject snaps the move back
// atomically. This drives insertTilesWithPush against an R1-style FULL board (same
// fixture shape as arrange-space-board.test.js's "R1 reject"): the cluster must
// grow but the wide neighbour cannot fit row 0's remainder and every other row is
// full, so relocateForCluster rejects -> arrangeBoard returns {ok:false} -> the
// move returns INVALID_MOVE and immer discards the draft. The harness, player and
// drop are identical to the success test above; only the board is full, so the
// INVALID_MOVE can only originate from arrangeBoard's reject, not an earlier guard.
test('a drop the engine rejects (full board) is an atomic no-op the move snaps back', () => {
  const tilePositions = {};
  // row 0: red run 1..9 at cols 0-8 (the cluster the drop lands in)
  for (let v = 1; v <= 9; v++) { const id = r(v); tilePositions[id] = {id, col: v - 1, row: 0, gridId: BOARD_GRID_ID}; }
  // row 0: a wide blue neighbour filling cols 11..31 (width 21), separated from the
  // run by a 2-col gap. b(1) is its first tile (col 11); the rest are distinct
  // filler ids so extractBlocks sees one contiguous 21-wide block.
  tilePositions[b(1)] = {id: b(1), col: 11, row: 0, gridId: BOARD_GRID_ID};
  for (let c = 12; c <= 31; c++) { const id = 2000 + c; tilePositions[id] = {id, col: c, row: 0, gridId: BOARD_GRID_ID}; }
  // rows 1..8: completely full (32 wide each) -> no cross-row room for the neighbour
  for (let row = 1; row <= 8; row++) for (let c = 0; c < 32; c++) { const id = 3000 + row * 100 + c; tilePositions[id] = {id, col: c, row, gridId: BOARD_GRID_ID}; }
  // the duplicate r5 lives in player 0's HAND, not on the board
  const dup = r(5, 1);
  tilePositions[dup] = {id: dup, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
  const game = makeMatch({tilePositions, prevTilePositions: tilePositions, firstMoveDone: [true, true]});
  // give player 1 a spare tile + make player 0 current (mirror arrange-move.test.js harness)
  const keep = buildTileObj(8, COLOR.black, 0);
  tilePositions[keep] = {id: keep, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '1'};
  const c0 = Client({game, multiplayer: Local(), playerID: '0'});
  const c1 = Client({game, multiplayer: Local(), playerID: '1'});
  c0.start(); c1.start();
  c0.events.endPhase(); c1.events.endPhase();
  if (c0.getState().ctx.currentPlayer !== '0') { c1.moves.endTurn?.(); }

  // The move's own guards pass (player 0 is current, and we are past the
  // playersJoin phase so a hand->board drop is allowed, dup being player 0's hand
  // tile), so the INVALID_MOVE below can only come from arrangeBoard's reject --
  // exactly as the identical-harness success test above proves.
  expect(c0.getState().ctx.currentPlayer).toBe('0');
  expect(c0.getState().ctx.phase).not.toBe('playersJoin');

  const before = c0.getState().G;
  const neighbourColBefore = before.tilePositions[b(1)].col;          // 11
  expect(before.gameStateStack.length).toBe(0);

  c0.moves.insertTilesWithPush(4, 0, BOARD_GRID_ID, {id: dup}, [dup]); // engine rejects -> INVALID_MOVE

  const after = c0.getState().G;
  expect(after.tilePositions[dup].gridId).toBe(HAND_GRID_ID);         // dup never left the hand
  expect(after.tilePositions[b(1)].col).toBe(neighbourColBefore);     // the neighbour did not move
  expect(after.gameStateStack.length).toBe(0);                        // nothing was snapshotted (Undo stays disabled)
  expect(after).toEqual(before);                                      // whole G is unchanged -> atomic snap-back
});
