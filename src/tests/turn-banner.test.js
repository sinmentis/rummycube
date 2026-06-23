import {turnBannerLabel} from '../rummikub/turnBanner';

// S2-U4: pure label for the "whose turn" banner near the rack. Kept out of the
// React tree so the "Your turn" / "{name}'s turn" copy is trivially unit-testable.
describe('turnBannerLabel', () => {
    const matchData = [{name: 'Alice'}, {name: 'Bob'}];

    test('reads "Your turn" when the current player is me', () => {
        expect(turnBannerLabel('0', '0', matchData)).toBe('Your turn');
        expect(turnBannerLabel(0, 0, matchData)).toBe('Your turn');
    });

    test('reads "{name}\'s turn" for another seat', () => {
        expect(turnBannerLabel('1', '0', matchData)).toBe("Bob's turn");
    });

    test('falls back to "Player {n+1}" when the seat has no name', () => {
        expect(turnBannerLabel('1', '0', [{name: 'Alice'}, {}])).toBe("Player 2's turn");
        expect(turnBannerLabel('1', '0', [])).toBe("Player 2's turn");
    });

    test('returns null when there is no current player', () => {
        expect(turnBannerLabel(null, '0', matchData)).toBeNull();
        expect(turnBannerLabel(undefined, '0', matchData)).toBeNull();
    });
});
