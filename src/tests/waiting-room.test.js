import {waitingLabel, isWaitingForPlayers} from '../rummikub/waitingRoom';

// U15 / WS-6: pure helpers for the pre-match waiting overlay. Kept out of the
// React tree so the "{joined} of {n}" copy and the waiting predicate are
// trivially unit-testable.
describe('waitingLabel', () => {
    test('counts named seats as joined out of total seats', () => {
        const matchData = [{name: 'Alice'}, {}];
        expect(waitingLabel(matchData)).toBe('1 of 2');
    });

    test('all joined reads n of n', () => {
        const matchData = [{name: 'Alice'}, {name: 'Bob'}];
        expect(waitingLabel(matchData)).toBe('2 of 2');
    });

    test('nobody joined reads 0 of n', () => {
        const matchData = [{}, {}, {}];
        expect(waitingLabel(matchData)).toBe('0 of 3');
    });

    test('missing/empty matchData reads 0 of 0', () => {
        expect(waitingLabel(undefined)).toBe('0 of 0');
        expect(waitingLabel([])).toBe('0 of 0');
    });
});

describe('isWaitingForPlayers', () => {
    test('true while phase is playersJoin even if all seats filled', () => {
        const ctx = {phase: 'playersJoin'};
        const matchData = [{name: 'Alice'}, {name: 'Bob'}];
        expect(isWaitingForPlayers(ctx, matchData)).toBe(true);
    });

    test('true when a seat is still empty', () => {
        const ctx = {phase: 'play'};
        const matchData = [{name: 'Alice'}, {}];
        expect(isWaitingForPlayers(ctx, matchData)).toBe(true);
    });

    test('false once play has started and every seat is named', () => {
        const ctx = {phase: 'play'};
        const matchData = [{name: 'Alice'}, {name: 'Bob'}];
        expect(isWaitingForPlayers(ctx, matchData)).toBe(false);
    });

    test('true for empty matchData', () => {
        expect(isWaitingForPlayers({phase: 'play'}, [])).toBe(true);
        expect(isWaitingForPlayers({phase: 'play'}, undefined)).toBe(true);
    });
});
