import {buildTileObj, RedJoker, BlackJoker} from '../rummikub/util';
import {playableTiles} from '../rummikub/planning';
import {COLOR} from '../rummikub/constants';

const blue = (v, variant = 0) => buildTileObj(v, COLOR.blue, variant);
const red = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const black = (v, variant = 0) => buildTileObj(v, COLOR.black, variant);
const orange = (v, variant = 0) => buildTileObj(v, COLOR.orange, variant);

describe('playableTiles - run extension', () => {
    const run = [blue(5), blue(6), blue(7)];

    test('a same-colour tile one below the run end is playable', () => {
        const hand = [blue(4)];
        expect([...playableTiles(hand, [run])]).toEqual([blue(4)]);
    });

    test('a same-colour tile one above the run end is playable', () => {
        const hand = [blue(8)];
        expect([...playableTiles(hand, [run])]).toEqual([blue(8)]);
    });

    test('extends both above and below in the same hand', () => {
        const hand = [blue(4), blue(8)];
        const set = playableTiles(hand, [run]);
        expect(set.has(blue(4))).toBe(true);
        expect(set.has(blue(8))).toBe(true);
        expect(set.size).toBe(2);
    });

    test('a wrong-colour tile of a matching value is not playable', () => {
        const hand = [red(4), orange(8)];
        expect(playableTiles(hand, [run]).size).toBe(0);
    });

    test('a same-colour but non-adjacent value is not playable', () => {
        const hand = [blue(2), blue(10)];
        expect(playableTiles(hand, [run]).size).toBe(0);
    });

    test('does not wrap 13 -> 1', () => {
        const highRun = [blue(11), blue(12), blue(13)];
        const hand = [blue(1)];
        expect(playableTiles(hand, [highRun]).size).toBe(0);
    });
});

describe('playableTiles - set extension', () => {
    const set9 = [red(9), black(9), orange(9)];

    test('a tile of the group number in a missing colour is playable', () => {
        const hand = [blue(9)];
        expect([...playableTiles(hand, [set9])]).toEqual([blue(9)]);
    });

    test('a tile whose colour already appears in the set is not playable', () => {
        const hand = [red(9, 1)];
        expect(playableTiles(hand, [set9]).size).toBe(0);
    });

    test('a tile of a different number is not playable', () => {
        const hand = [blue(8)];
        expect(playableTiles(hand, [set9]).size).toBe(0);
    });

    test('a full 4-colour set cannot be extended', () => {
        const fullSet = [red(9), black(9), orange(9), blue(9)];
        const hand = [red(9, 1)];
        expect(playableTiles(hand, [fullSet]).size).toBe(0);
    });
});

describe('playableTiles - jokers', () => {
    const run = [blue(5), blue(6), blue(7)];

    test('jokers in hand are excluded from the playable set (v1)', () => {
        const hand = [RedJoker, BlackJoker, blue(4)];
        const set = playableTiles(hand, [run]);
        expect(set.has(RedJoker)).toBe(false);
        expect(set.has(BlackJoker)).toBe(false);
        expect(set.has(blue(4))).toBe(true);
        expect(set.size).toBe(1);
    });
});

describe('playableTiles - guards', () => {
    test('an invalid board group contributes no playable tiles', () => {
        const broken = [blue(5), red(9), orange(2)];
        const hand = [blue(4), blue(8)];
        expect(playableTiles(hand, [broken]).size).toBe(0);
    });

    test('empty board yields an empty set', () => {
        expect(playableTiles([blue(4)], []).size).toBe(0);
    });
});
