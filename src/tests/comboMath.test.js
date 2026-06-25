import {comboLabel, particleCount, manipulationScore} from '../rummikub/juice/comboMath';

test('manipulationScore weights groups + rearrange over raw tile count', () => {
    // A surgical 1-tile play that forms 2 groups beats a 3-tile flat dump.
    expect(manipulationScore({groups: 2, rearranged: 0, placed: 1}))
        .toBeGreaterThan(manipulationScore({groups: 1, rearranged: 0, placed: 3}));
    // A rearrange-heavy play also beats a flat dump of the same tile count.
    expect(manipulationScore({groups: 1, rearranged: 3, placed: 1}))
        .toBeGreaterThan(manipulationScore({groups: 1, rearranged: 0, placed: 1}));
    // Rebalanced weights: W_GROUP=3, W_INTEG=3, W_PLACE=0 (placed no longer scores).
    expect(manipulationScore({groups: 2, rearranged: 0, placed: 1})).toBe(6);
    expect(manipulationScore({groups: 1, rearranged: 0, placed: 3})).toBe(3);
    // Defaults to 0 when given nothing.
    expect(manipulationScore({})).toBe(0);
});

test('a single-group dump scores exactly 3 (NICE) regardless of tile count', () => {
    // ON FIRE must be earned by manipulation, not by dumping a long run from hand:
    // a lone group is always score 3 whether it places 1 tile or 13.
    for (let placed = 1; placed <= 13; placed++) {
        const score = manipulationScore({groups: 1, rearranged: 0, placed});
        expect(score).toBe(3);
        expect(comboLabel(score)).toBe('NICE');
    }
});

test('two groups, or a group plus a rearrange, earns COMBO (6)', () => {
    expect(manipulationScore({groups: 2, rearranged: 0, placed: 2})).toBe(6);
    expect(manipulationScore({groups: 1, rearranged: 1, placed: 5})).toBe(6);
    expect(comboLabel(manipulationScore({groups: 2, rearranged: 0, placed: 2}))).toBe('COMBO');
    expect(comboLabel(manipulationScore({groups: 1, rearranged: 1, placed: 5}))).toBe('COMBO');
});

test('a multi-group play with a rearrange earns ON FIRE (>= 9)', () => {
    const score = manipulationScore({groups: 2, rearranged: 1, placed: 4});
    expect(score).toBe(9);
    expect(comboLabel(score)).toBe('ON FIRE');
    expect(manipulationScore({groups: 3, rearranged: 2, placed: 7})).toBeGreaterThanOrEqual(9);
});

test('an empty play scores 0 and earns no label', () => {
    expect(manipulationScore({})).toBe(0);
    expect(comboLabel(0)).toBe('');
});

test('comboLabel tiers at 3/6/9', () => {
  expect(comboLabel(0)).toBe('');
  expect(comboLabel(2)).toBe('');
  expect(comboLabel(3)).toBe('NICE');
  expect(comboLabel(5)).toBe('NICE');
  expect(comboLabel(6)).toBe('COMBO');
  expect(comboLabel(8)).toBe('COMBO');
  expect(comboLabel(9)).toBe('ON FIRE');
  expect(comboLabel(99)).toBe('ON FIRE');
});
test('particleCount scales with intensity', () => {
  expect(particleCount('subtle')).toBeLessThan(particleCount('balanced'));
  expect(particleCount('balanced')).toBeLessThan(particleCount('max'));
});

import {countPlacedThisTurn, submitComboCount} from '../rummikub/juice/comboMath';

test('countPlacedThisTurn counts only tmp tiles on the board grid', () => {
    const tp = {
        10: {id: 10, gridId: 'board', tmp: true},
        11: {id: 11, gridId: 'board', tmp: true},
        12: {id: 12, gridId: 'board', tmp: false}, // committed on an earlier turn
        13: {id: 13, gridId: 'hand', tmp: true},   // sitting in hand
        14: null,
    };
    expect(countPlacedThisTurn(tp, 'board')).toBe(2);
});

test('submitComboCount is the placed count only when the move was accepted', () => {
    expect(submitComboCount(true, 4)).toBe(4);
    expect(submitComboCount(false, 4)).toBe(0); // invalid submit -> no combo
    expect(submitComboCount(true, 0)).toBe(0);
});

import {buildTileObj} from '../rummikub/util';
import {isMoveValid} from '../rummikub/moveValidation';
import {COLOR, BOARD_GRID_ID} from '../rummikub/constants';

function boardOf(tiles) {
    const tilePositions = {};
    tiles.forEach((t, i) => {
        tilePositions[t] = {id: t, gridId: BOARD_GRID_ID, row: 0, col: i, tmp: true};
    });
    return {tilePositions};
}
const ctx0 = {currentPlayer: '0'};

test('a valid submitted run earns a combo equal to the tiles placed', () => {
    const G = boardOf([
        buildTileObj(1, COLOR.red, 0),
        buildTileObj(2, COLOR.red, 0),
        buildTileObj(3, COLOR.red, 0),
    ]);
    const placed = countPlacedThisTurn(G.tilePositions, BOARD_GRID_ID);
    const accepted = placed > 0 && isMoveValid(G, ctx0);
    expect(submitComboCount(accepted, placed)).toBe(3);
});

test('invalid submitted tiles earn no combo', () => {
    const G = boardOf([
        buildTileObj(1, COLOR.red, 0),
        buildTileObj(5, COLOR.blue, 0),
        buildTileObj(9, COLOR.orange, 0),
    ]);
    const placed = countPlacedThisTurn(G.tilePositions, BOARD_GRID_ID);
    const accepted = placed > 0 && isMoveValid(G, ctx0);
    expect(submitComboCount(accepted, placed)).toBe(0);
});
