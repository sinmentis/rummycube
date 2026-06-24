import {contiguousGroup} from '../rummikub/boardUtil';
import {buildTileObj} from '../rummikub/util';
import {COLOR, BOARD_GRID_ID, HAND_GRID_ID} from '../rummikub/constants';

// contiguousGroup(tilePositions, pressedTileId) -> tileId[]
// Pure: the whole contiguous run (extend left + right) sharing the pressed tile's
// grid + row, returned in reading order (cols ascending) and including the pressed
// tile. A gap (a column with no tile) stops the extension. HAND_GRID_ID runs are
// isolated per playerID; board tiles (playerID:null) are shared, so a whole-table run
// can form. Tile ids are object keys, which JS stringifies, so the helper normalizes
// both sides with String() before comparing.

const tid = (value, color, variant = 0) => buildTileObj(value, color, variant);

function expectGroup(positions, pressed, expected) {
    expect(contiguousGroup(positions, pressed).map(String)).toEqual(expected.map(String));
}

test('extends both left and right to cover the whole contiguous run', () => {
    const a = tid(1, COLOR.red), b = tid(2, COLOR.red), c = tid(3, COLOR.red),
          d = tid(4, COLOR.red), e = tid(5, COLOR.red);
    const positions = {
        [a]: {id: a, gridId: BOARD_GRID_ID, row: 0, col: 10, playerID: null},
        [b]: {id: b, gridId: BOARD_GRID_ID, row: 0, col: 11, playerID: null},
        [c]: {id: c, gridId: BOARD_GRID_ID, row: 0, col: 12, playerID: null},
        [d]: {id: d, gridId: BOARD_GRID_ID, row: 0, col: 13, playerID: null},
        [e]: {id: e, gridId: BOARD_GRID_ID, row: 0, col: 14, playerID: null},
    };
    // pressing the middle tile extends left to col 10 and right to col 14
    expectGroup(positions, c, [a, b, c, d, e]);
    // pressing an end tile still returns the full run in reading order
    expectGroup(positions, a, [a, b, c, d, e]);
});

test('a gap (empty column) breaks the group', () => {
    const a = tid(1, COLOR.blue), b = tid(2, COLOR.blue), far = tid(6, COLOR.blue);
    const positions = {
        [a]: {id: a, gridId: BOARD_GRID_ID, row: 0, col: 3, playerID: null},
        [b]: {id: b, gridId: BOARD_GRID_ID, row: 0, col: 4, playerID: null},
        // gap at col 5
        [far]: {id: far, gridId: BOARD_GRID_ID, row: 0, col: 6, playerID: null},
    };
    expectGroup(positions, b, [a, b]);     // stops at the col-5 gap; 'far' is excluded
    expectGroup(positions, far, [far]);    // 'far' is isolated on the other side of the gap
});

test('hand runs are isolated by playerID (adjacent tiles of two players do not merge)', () => {
    const p0 = tid(1, COLOR.red), p1a = tid(2, COLOR.red), p1b = tid(3, COLOR.red);
    const positions = {
        [p0]:  {id: p0,  gridId: HAND_GRID_ID, row: 0, col: 3, playerID: '0'},
        [p1a]: {id: p1a, gridId: HAND_GRID_ID, row: 0, col: 4, playerID: '1'},
        [p1b]: {id: p1b, gridId: HAND_GRID_ID, row: 0, col: 5, playerID: '1'},
    };
    // player 0's tile sits directly left of player 1's run; they must NOT merge
    expectGroup(positions, p0, [p0]);
    // player 1's own contiguous run forms, ignoring the adjacent player-0 tile at col 3
    expectGroup(positions, p1a, [p1a, p1b]);
});

test('board tiles (playerID null) are not isolated, forming a whole-table run', () => {
    const x = tid(1, COLOR.orange), y = tid(2, COLOR.orange), z = tid(3, COLOR.orange);
    const positions = {
        // null playerIDs simulate tiles played by different players onto the shared board
        [x]: {id: x, gridId: BOARD_GRID_ID, row: 2, col: 7, playerID: null},
        [y]: {id: y, gridId: BOARD_GRID_ID, row: 2, col: 8, playerID: null},
        [z]: {id: z, gridId: BOARD_GRID_ID, row: 2, col: 9, playerID: null},
    };
    expectGroup(positions, y, [x, y, z]);
});

test('an isolated tile with no neighbors returns just itself', () => {
    const solo = tid(7, COLOR.black);
    const positions = {
        [solo]: {id: solo, gridId: BOARD_GRID_ID, row: 0, col: 5, playerID: null},
    };
    expectGroup(positions, solo, [solo]);
});

test('a pressed id missing from tilePositions degrades to just that id', () => {
    const present = tid(1, COLOR.red);
    const positions = {
        [present]: {id: present, gridId: BOARD_GRID_ID, row: 0, col: 0, playerID: null},
    };
    const missing = tid(13, COLOR.orange, 1); // never placed anywhere
    expectGroup(positions, missing, [missing]);
});
