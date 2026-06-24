import {timeoutToastText} from '../rummikub/timeoutToastText';

// T2: pure English announcement for a G.lastTimeout transient {seat, drawCount}.
// Kept out of the React tree so the six-branch copy table is trivially
// unit-testable. "Self" = String(seat)===String(playerID); solo =
// matchData.length===1; an unnamed seat falls back to "Player {seat+1}".
describe('timeoutToastText', () => {
    const solo = [{name: 'Alice'}];
    const multi = [{name: 'Alice'}, {name: 'Bob'}];

    // --- Solo (matchData.length === 1) ---
    test('solo + drew tiles: auto-drew copy with (+n to your rack)', () => {
        expect(timeoutToastText({seat: 0, drawCount: 2}, '0', solo))
            .toBe("⏱ Time's up — you auto-drew 2 tiles (+2 to your rack).");
    });

    test('solo + drawCount 0: bare time\'s up', () => {
        expect(timeoutToastText({seat: 0, drawCount: 0}, '0', solo))
            .toBe("⏱ Time's up.");
    });

    // --- Multiplayer, self ---
    test('multi + self + drew tiles: you drew, turn passed', () => {
        expect(timeoutToastText({seat: 0, drawCount: 2}, '0', multi))
            .toBe("⏱ Time's up — you drew 2 tiles, turn passed.");
    });

    test('multi + self + drawCount 0: turn passed', () => {
        expect(timeoutToastText({seat: 0, drawCount: 0}, '0', multi))
            .toBe("⏱ Time's up — turn passed.");
    });

    // --- Multiplayer, other ---
    test('multi + other + drew tiles: {name} drew, turn passed', () => {
        expect(timeoutToastText({seat: 1, drawCount: 2}, '0', multi))
            .toBe("⏱ Time's up — Bob drew 2 tiles, turn passed.");
    });

    test('multi + other + drawCount 0: {name}\'s turn passed', () => {
        expect(timeoutToastText({seat: 1, drawCount: 0}, '0', multi))
            .toBe("⏱ Time's up — Bob's turn passed.");
    });

    // --- Plural distinction: drawCount 1 -> "tile", otherwise "tiles" ---
    test('singular "tile" when drawCount === 1 across every drawing branch', () => {
        expect(timeoutToastText({seat: 0, drawCount: 1}, '0', solo))
            .toBe("⏱ Time's up — you auto-drew 1 tile (+1 to your rack).");
        expect(timeoutToastText({seat: 0, drawCount: 1}, '0', multi))
            .toBe("⏱ Time's up — you drew 1 tile, turn passed.");
        expect(timeoutToastText({seat: 1, drawCount: 1}, '0', multi))
            .toBe("⏱ Time's up — Bob drew 1 tile, turn passed.");
    });

    // --- Name fallback: unnamed seat -> "Player {seat+1}" ---
    test('falls back to "Player {seat+1}" when the seat has no name', () => {
        const noName = [{name: 'Alice'}, {}];
        expect(timeoutToastText({seat: 1, drawCount: 2}, '0', noName))
            .toBe("⏱ Time's up — Player 2 drew 2 tiles, turn passed.");
        expect(timeoutToastText({seat: 1, drawCount: 0}, '0', noName))
            .toBe("⏱ Time's up — Player 2's turn passed.");
        expect(timeoutToastText({seat: 1, drawCount: 2}, '0', []))
            .toBe("⏱ Time's up — Player 2 drew 2 tiles, turn passed.");
    });

    // --- "Self" is string-equality on seat vs playerID (mirrors turnBanner) ---
    test('treats seat as self regardless of string/number type', () => {
        expect(timeoutToastText({seat: 1, drawCount: 0}, 1, multi))
            .toBe("⏱ Time's up — turn passed.");
        expect(timeoutToastText({seat: '1', drawCount: 0}, '1', multi))
            .toBe("⏱ Time's up — turn passed.");
    });
});
