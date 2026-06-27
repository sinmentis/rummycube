import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {buildTileObj} from '../rummikub/util';
import {COLOR, BOARD_GRID_ID, HAND_GRID_ID} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);

test('dropping a duplicate 3 onto a board 1-2-3-4-5 reflows to 123 _ 345', () => {
  const tilePositions = {};
  // committed red run 1..5 on the board, row 0, cols 0..4
  [1, 2, 3, 4, 5].forEach((v, i) => { const id = r(v); tilePositions[id] = {id, col: i, row: 0, gridId: BOARD_GRID_ID}; });
  // a duplicate red 3 in player 0's hand
  const dup = r(3, 1);
  tilePositions[dup] = {id: dup, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
  // a spare tile in player 1's hand: keeps player 1 from "clearing" their hand, so
  // ending their turn below doesn't trigger the checkGameOver end-of-game (which
  // would freeze the board and reject the drop).
  const keep = buildTileObj(8, COLOR.black, 0);
  tilePositions[keep] = {id: keep, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '1'};
  const game = makeMatch({tilePositions, prevTilePositions: tilePositions, firstMoveDone: [true, true]});
  const spec = {game, multiplayer: Local()};
  const c0 = Client({...spec, playerID: '0'});
  const c1 = Client({...spec, playerID: '1'});
  c0.start();
  c1.start();
  // The play phase opens on the second seat (player 1); end that turn so player 0 —
  // the dup's owner — is current and clears the move's playerID-vs-currentPlayer guard.
  c0.events.endPhase();
  c1.events.endTurn();

  c0.moves.insertTilesWithPush(5, 0, BOARD_GRID_ID, {id: dup}, [dup]); // drop the dup at col 5

  const {G} = c0.getState();
  const cols = [r(1), r(2), r(3), dup, r(4), r(5)].map(id => G.tilePositions[id].col).sort((a, b) => a - b);
  expect(cols).toEqual([0, 1, 2, 4, 5, 6]); // 1 2 3 _ 3 4 5
});
