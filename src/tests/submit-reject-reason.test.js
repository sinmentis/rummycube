import {buildTileObj} from '../rummikub/util';
import {submitRejectReason} from '../rummikub/moveValidation';
import {COLOR, BOARD_GRID_ID} from '../rummikub/constants';

// Build a board from tiles. Each entry may carry its own row/col/tmp, otherwise
// tiles are laid out left-to-right on row 0 as newly placed (tmp) tiles.
function boardOf(tiles, {firstMoveDone = {'0': true}} = {}) {
    const tilePositions = {};
    tiles.forEach((tile, i) => {
        const {t, row = 0, col = i, tmp = true} =
            typeof tile === 'object' ? tile : {t: tile};
        tilePositions[t] = {id: t, gridId: BOARD_GRID_ID, row, col, tmp};
    });
    return {tilePositions, firstMoveDone};
}
const ctx0 = {currentPlayer: '0'};

test('NO_NEW_TILE when nothing was placed this turn', () => {
    const G = boardOf([
        {t: buildTileObj(4, COLOR.red, 0), tmp: false},
        {t: buildTileObj(5, COLOR.red, 0), tmp: false},
        {t: buildTileObj(6, COLOR.red, 0), tmp: false},
    ]);
    expect(submitRejectReason(G, ctx0).code).toBe('NO_NEW_TILE');
});

test('OK for a valid regular move with newly placed tiles', () => {
    const G = boardOf([
        buildTileObj(4, COLOR.red, 0),
        buildTileObj(5, COLOR.red, 0),
        buildTileObj(6, COLOR.red, 0),
    ]);
    expect(submitRejectReason(G, ctx0).code).toBe('OK');
});

test('INVALID_GROUP for an invalid regular move, carrying the offending group', () => {
    const tiles = [
        buildTileObj(4, COLOR.red, 0),
        buildTileObj(8, COLOR.blue, 0),
        buildTileObj(13, COLOR.orange, 0),
    ];
    const G = boardOf(tiles);
    const reason = submitRejectReason(G, ctx0);
    expect(reason.code).toBe('INVALID_GROUP');
    expect(reason.group.slice().sort((a, b) => a - b)).toEqual(
        tiles.map(Number).sort((a, b) => a - b)
    );
});

test('MIXED_FIRST_MOVE when a first-move sequence mixes old and new tiles', () => {
    const tiles = [
        {t: buildTileObj(4, COLOR.red, 0), col: 0, tmp: false},
        {t: buildTileObj(5, COLOR.red, 0), col: 1, tmp: true},
        {t: buildTileObj(6, COLOR.red, 0), col: 2, tmp: true},
    ];
    const G = boardOf(tiles, {firstMoveDone: {'0': false}});
    const reason = submitRejectReason(G, ctx0);
    expect(reason.code).toBe('MIXED_FIRST_MOVE');
    expect(reason.group.slice().sort((a, b) => a - b)).toEqual(
        tiles.map(t => Number(t.t)).sort((a, b) => a - b)
    );
});

test('INVALID_GROUP for an invalid first-move sequence', () => {
    const tiles = [
        buildTileObj(4, COLOR.red, 0),
        buildTileObj(9, COLOR.blue, 0),
        buildTileObj(2, COLOR.orange, 0),
    ];
    const G = boardOf(tiles, {firstMoveDone: {'0': false}});
    const reason = submitRejectReason(G, ctx0);
    expect(reason.code).toBe('INVALID_GROUP');
    expect(reason.group.slice().sort((a, b) => a - b)).toEqual(
        tiles.map(Number).sort((a, b) => a - b)
    );
});

// FIRST_MOVE_SCORE_LIMIT is parsed from REACT_APP_FIRST_MOVE_SCORE_LIMIT at module
// load time; jest provides no .env so it defaults to NaN. To exercise BELOW_30 we
// set the env and reload the module graph in isolation.
function withScoreLimit(limit, fn) {
    const prev = process.env.REACT_APP_FIRST_MOVE_SCORE_LIMIT;
    process.env.REACT_APP_FIRST_MOVE_SCORE_LIMIT = String(limit);
    jest.resetModules();
    try {
        jest.isolateModules(() => {
            const mv = require('../rummikub/moveValidation');
            const util = require('../rummikub/util');
            const consts = require('../rummikub/constants');
            fn({
                submitRejectReason: mv.submitRejectReason,
                buildTileObj: util.buildTileObj,
                COLOR: consts.COLOR,
                BOARD_GRID_ID: consts.BOARD_GRID_ID,
            });
        });
    } finally {
        if (prev === undefined) {
            delete process.env.REACT_APP_FIRST_MOVE_SCORE_LIMIT;
        } else {
            process.env.REACT_APP_FIRST_MOVE_SCORE_LIMIT = prev;
        }
        jest.resetModules();
    }
}

test('BELOW_30 carries the score and the required limit', () => {
    withScoreLimit(30, ({submitRejectReason, buildTileObj, COLOR, BOARD_GRID_ID}) => {
        const tiles = [
            buildTileObj(1, COLOR.red, 0),
            buildTileObj(2, COLOR.red, 0),
            buildTileObj(3, COLOR.red, 0),
        ];
        const tilePositions = {};
        tiles.forEach((t, i) => {
            tilePositions[t] = {id: t, gridId: BOARD_GRID_ID, row: 0, col: i, tmp: true};
        });
        const G = {tilePositions, firstMoveDone: {'0': false}};
        const reason = submitRejectReason(G, {currentPlayer: '0'});
        expect(reason.code).toBe('BELOW_30');
        expect(reason.score).toBe(6);
        expect(reason.required).toBe(30);
    });
});

test('OK for a valid first move at or above the score limit', () => {
    withScoreLimit(30, ({submitRejectReason, buildTileObj, COLOR, BOARD_GRID_ID}) => {
        const tiles = [
            buildTileObj(10, COLOR.red, 0),
            buildTileObj(11, COLOR.red, 0),
            buildTileObj(12, COLOR.red, 0),
            buildTileObj(13, COLOR.red, 0),
        ];
        const tilePositions = {};
        tiles.forEach((t, i) => {
            tilePositions[t] = {id: t, gridId: BOARD_GRID_ID, row: 0, col: i, tmp: true};
        });
        const G = {tilePositions, firstMoveDone: {'0': false}};
        expect(submitRejectReason(G, {currentPlayer: '0'}).code).toBe('OK');
    });
});
