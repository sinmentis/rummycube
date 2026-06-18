import {tablePositions} from '../rummikub/seats/tableLayout';

test('solo: just self at the bottom', () => {
    expect(tablePositions(1, 0)).toEqual({0: 'self'});
});

test('2 players: opponent across the top', () => {
    expect(tablePositions(2, 0)).toEqual({0: 'self', 1: 'top'});
    expect(tablePositions(2, 1)).toEqual({1: 'self', 0: 'top'});
});

test('3 players: opponents flank left and right', () => {
    expect(tablePositions(3, 0)).toEqual({0: 'self', 1: 'right', 2: 'left'});
});

test('4 players: mahjong order (turn goes to your right)', () => {
    expect(tablePositions(4, 0)).toEqual({0: 'self', 1: 'right', 2: 'top', 3: 'left'});
    expect(tablePositions(4, 2)).toEqual({2: 'self', 3: 'right', 0: 'top', 1: 'left'});
});

test('self is always bottom regardless of seat', () => {
    for (const n of [2, 3, 4]) {
        for (let s = 0; s < n; s++) {
            expect(tablePositions(n, s)[s]).toBe('self');
        }
    }
});
