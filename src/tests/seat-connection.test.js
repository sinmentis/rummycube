import {seatConnected} from '../rummikub/seats/seatConnection';

// seatConnected(connected, seat, metaConnected) -> boolean
//
// Resolves a seat's connection state. `G.connected` is the WS-12 authoritative
// per-seat flag array (server-set). Matches created before WS-12 lack it, so we
// fall back to boardgame.io's metadata `isConnected`. A seat is OFFLINE only on
// an explicit `false`; any undefined/missing value reads as online so we never
// show a false disconnect badge.

describe('seatConnected', () => {
    test('authoritative false -> disconnected (false)', () => {
        expect(seatConnected([true, false], 1, true)).toBe(false);
    });

    test('authoritative true -> connected (true), overriding metadata', () => {
        // metadata says offline, but the authoritative flag wins.
        expect(seatConnected([true, false], 0, false)).toBe(true);
    });

    test('connected[seat] === undefined -> falls back to metaConnected', () => {
        expect(seatConnected([true], 1, false)).toBe(false);
        expect(seatConnected([true], 1, true)).toBe(true);
    });

    test('connected not an array -> falls back to metaConnected', () => {
        expect(seatConnected(undefined, 0, false)).toBe(false);
        expect(seatConnected(undefined, 0, true)).toBe(true);
        expect(seatConnected(null, 0, false)).toBe(false);
    });

    test('sparse array hole at seat -> falls back to metaConnected', () => {
        const sparse = [];
        sparse[0] = true;
        sparse[2] = false; // index 1 is a hole (=== undefined)
        expect(seatConnected(sparse, 1, false)).toBe(false);
        expect(seatConnected(sparse, 1, true)).toBe(true);
    });

    test('metaConnected undefined fallback -> online (true), never false offline', () => {
        expect(seatConnected(undefined, 0, undefined)).toBe(true);
        expect(seatConnected([true], 1, undefined)).toBe(true);
    });

    test('does not mutate the connected array', () => {
        const connected = [true, false];
        const snapshot = [...connected];
        seatConnected(connected, 1, true);
        expect(connected).toEqual(snapshot);
    });
});
