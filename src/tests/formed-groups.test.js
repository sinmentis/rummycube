import {buildTileObj} from '../rummikub/util';
import {getFormedGroups} from '../rummikub/moveValidation';
import {COLOR, BOARD_GRID_ID} from '../rummikub/constants';

function board(tiles) {
    const tilePositions = {};
    tiles.forEach(({t, row, col, tmp}) => {
        tilePositions[t] = {id: t, gridId: BOARD_GRID_ID, row, col, tmp};
    });
    return {tilePositions};
}

test('getFormedGroups returns only valid sequences that include a newly placed tile', () => {
    const fresh = [buildTileObj(4, COLOR.red, 0), buildTileObj(5, COLOR.red, 0), buildTileObj(6, COLOR.red, 0)];
    const old = [buildTileObj(7, COLOR.blue, 0), buildTileObj(8, COLOR.blue, 0), buildTileObj(9, COLOR.blue, 0)];
    const G = board([
        ...fresh.map((t, i) => ({t, row: 0, col: i, tmp: true})),
        ...old.map((t, i) => ({t, row: 1, col: i, tmp: false})),
    ]);
    const groups = getFormedGroups(G);
    expect(groups.length).toBe(1);
    expect(groups[0].map(Number).sort((a, b) => a - b)).toEqual(fresh.map(Number).sort((a, b) => a - b));
});

test('getFormedGroups ignores an invalid row even if it has new tiles', () => {
    const broken = [buildTileObj(4, COLOR.red, 0), buildTileObj(9, COLOR.blue, 0), buildTileObj(2, COLOR.orange, 0)];
    const G = board(broken.map((t, i) => ({t, row: 0, col: i, tmp: true})));
    expect(getFormedGroups(G)).toEqual([]);
});
