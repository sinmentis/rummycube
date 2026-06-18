import {buildTileObj} from '../rummikub/util';
import {isSubmitAccepted} from '../rummikub/moveValidation';
import {COLOR, BOARD_GRID_ID} from '../rummikub/constants';

function boardOf(tiles, {tmp = true} = {}) {
    const tilePositions = {};
    tiles.forEach((t, i) => {
        tilePositions[t] = {id: t, gridId: BOARD_GRID_ID, row: 0, col: i, tmp};
    });
    // firstMoveDone marks the player past their initial meld, so the non-first-move
    // path (isMoveValid) runs and we don't depend on the score-limit env var.
    return {tilePositions, firstMoveDone: {'0': true}};
}
const ctx0 = {currentPlayer: '0'};

test('isSubmitAccepted is true for a valid run with newly placed tiles', () => {
    const G = boardOf([
        buildTileObj(4, COLOR.red, 0),
        buildTileObj(5, COLOR.red, 0),
        buildTileObj(6, COLOR.red, 0),
    ]);
    expect(isSubmitAccepted(G, ctx0)).toBe(true);
});

test('isSubmitAccepted is false for an invalid board with newly placed tiles', () => {
    const G = boardOf([
        buildTileObj(4, COLOR.red, 0),
        buildTileObj(8, COLOR.blue, 0),
        buildTileObj(13, COLOR.orange, 0),
    ]);
    expect(isSubmitAccepted(G, ctx0)).toBe(false);
});

test('isSubmitAccepted is false when nothing new was placed this turn', () => {
    const G = boardOf([
        buildTileObj(4, COLOR.red, 0),
        buildTileObj(5, COLOR.red, 0),
        buildTileObj(6, COLOR.red, 0),
    ], {tmp: false});
    expect(isSubmitAccepted(G, ctx0)).toBe(false);
});
