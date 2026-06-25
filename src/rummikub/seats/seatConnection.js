// `G.connected` is the WS-12 authoritative per-seat flag array. Matches created
// before WS-12 don't have it (undefined), so fall back to boardgame.io's
// metadata `isConnected`. A seat reads as OFFLINE only on an explicit `false`;
// undefined/missing always reads as online so we never show a false disconnect
// badge.
export function seatConnected(connected, seat, metaConnected) {
    if (Array.isArray(connected) && connected[seat] !== undefined) {
        return connected[seat] !== false;
    }
    return metaConnected !== false;
}
