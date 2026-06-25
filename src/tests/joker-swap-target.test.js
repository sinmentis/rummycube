import {jokerSwapTarget} from '../rummikub/dndUtil';
import {buildTileObj, BlackJoker, RedJoker} from '../rummikub/util';
import {BOARD_GRID_ID, COLOR, HAND_GRID_ID} from '../rummikub/constants';

// jokerSwapTarget(tilePositions, cell, draggedTileId)
//   -> {ok:true, jokerId, representedValue} | {ok:false}
//
// Pure detector for the classic 1-tile joker retrieve via drag: returns ok ONLY
// when `cell` holds a settled (non-tmp) board joker that sits in a currently-valid
// sequence, and the dragged HAND tile's value equals the joker's represented value
// (computed with the SAME pure path the server's retrieveJoker uses:
// extractSeqs -> freezeSeqJokers -> getTileValue). Never mutates. Colour mismatch
// is left for the server's post-swap isBoardValid, so this only checks value.

// Valid board run red4 _ red6 (red) with BlackJoker in the middle representing red 5.
const red4 = buildTileObj(4, COLOR.red, 0);
const red5 = buildTileObj(5, COLOR.red, 0); // matching hand tile (value == 5)
const red6 = buildTileObj(6, COLOR.red, 0);
const red7 = buildTileObj(7, COLOR.red, 0); // value-mismatched hand tile (value 7)

// Build the board run. jokerTmp toggles settled (false) vs this-turn (true).
// red6Col lets a test open a gap (joker at col 1, red6 at col 3) that breaks the
// joker's contiguous sequence down to [red4, joker] (length 2, invalid).
function boardRun({jokerTmp = false, red6Col = 2} = {}) {
    const tp = {};
    tp[red4] = {id: red4, col: 0, row: 0, gridId: BOARD_GRID_ID, tmp: false, playerID: null};
    tp[BlackJoker] = {id: BlackJoker, col: 1, row: 0, gridId: BOARD_GRID_ID, tmp: jokerTmp, playerID: null};
    tp[red6] = {id: red6, col: red6Col, row: 0, gridId: BOARD_GRID_ID, tmp: false, playerID: null};
    return tp;
}

// Add player-0 hand tiles (gridId 'h'); position within the hand is irrelevant.
function withHand(tp, ...handTiles) {
    handTiles.forEach((tid, i) => {
        tp[tid] = {id: tid, col: i, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
    });
    return tp;
}

// The cell sitting on the joker (row 0, col 1).
const jokerCell = {gridId: BOARD_GRID_ID, col: 1, row: 0};

test('matching hand tile on a settled board joker -> {ok, jokerId, representedValue}', () => {
    const tp = withHand(boardRun(), red5);
    expect(jokerSwapTarget(tp, jokerCell, red5)).toEqual({
        ok: true,
        jokerId: BlackJoker,
        representedValue: 5,
    });
});

test('does not mutate tilePositions', () => {
    const tp = withHand(boardRun(), red5);
    const snapshot = JSON.parse(JSON.stringify(tp));
    jokerSwapTarget(tp, jokerCell, red5);
    expect(tp).toEqual(snapshot);
});

test('value-mismatched hand tile -> {ok:false}', () => {
    const tp = withHand(boardRun(), red7); // joker represents 5, red7 is 7
    expect(jokerSwapTarget(tp, jokerCell, red7)).toEqual({ok: false});
});

test('cell holds a non-joker tile -> {ok:false}', () => {
    const tp = withHand(boardRun(), red5);
    const red4Cell = {gridId: BOARD_GRID_ID, col: 0, row: 0};
    expect(jokerSwapTarget(tp, red4Cell, red5)).toEqual({ok: false});
});

test('this-turn (tmp) board joker -> {ok:false}', () => {
    const tp = withHand(boardRun({jokerTmp: true}), red5);
    expect(jokerSwapTarget(tp, jokerCell, red5)).toEqual({ok: false});
});

test('joker not in a valid sequence (a gap breaks it) -> {ok:false}', () => {
    // red4@0, joker@1, gap@2, red6@3 -> joker's run is [red4, joker] (length 2).
    const tp = withHand(boardRun({red6Col: 3}), red5);
    expect(jokerSwapTarget(tp, jokerCell, red5)).toEqual({ok: false});
});

test('dragged tile is a joker itself -> {ok:false}', () => {
    const tp = withHand(boardRun(), RedJoker);
    expect(jokerSwapTarget(tp, jokerCell, RedJoker)).toEqual({ok: false});
});

test('dragged tile is a board tile, not a hand tile -> {ok:false}', () => {
    const tp = withHand(boardRun(), red5);
    expect(jokerSwapTarget(tp, jokerCell, red6)).toEqual({ok: false});
});

test('cell is on the hand grid -> {ok:false}', () => {
    const tp = withHand(boardRun(), red5);
    expect(jokerSwapTarget(tp, {gridId: HAND_GRID_ID, col: 0, row: 0}, red5)).toEqual({ok: false});
});

test('cell is an empty board slot -> {ok:false}', () => {
    const tp = withHand(boardRun(), red5);
    expect(jokerSwapTarget(tp, {gridId: BOARD_GRID_ID, col: 7, row: 0}, red5)).toEqual({ok: false});
});
