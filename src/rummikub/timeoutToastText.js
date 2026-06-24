// T2: pure English announcement for the server-authoritative G.lastTimeout
// transient {seat, drawCount, id} written by forceEndTurn (T1). Turns that
// transient into the short, player-facing "time's up" sentence each client
// shows after a deadline. Kept out of the React tree so the six-branch copy
// table is trivially unit-testable, mirroring submitReasonText / turnBanner.
//
// "Self"  = String(seat) === String(playerID)
// "Solo"  = matchData.length === 1 (single-seat match)
// no name = fall back to "Player {seat+1}"
// plural  = drawCount === 1 ? 'tile' : 'tiles' (drawCount is 0, 1, or 2)
function timeoutToastText(lastTimeout, playerID, matchData) {
    if (!lastTimeout) {
        return '';
    }
    const seat = Number(lastTimeout.seat);
    const n = lastTimeout.drawCount;
    const s = n === 1 ? '' : 's';
    const list = Array.isArray(matchData) ? matchData : [];

    if (list.length === 1) {
        return n >= 1
            ? `⏱ Time's up — you auto-drew ${n} tile${s} (+${n} to your rack).`
            : "⏱ Time's up.";
    }

    if (String(lastTimeout.seat) === String(playerID)) {
        return n >= 1
            ? `⏱ Time's up — you drew ${n} tile${s}, turn passed.`
            : "⏱ Time's up — turn passed.";
    }

    const seatData = list[seat];
    const name = (seatData && seatData.name) || `Player ${seat + 1}`;
    return n >= 1
        ? `⏱ Time's up — ${name} drew ${n} tile${s}, turn passed.`
        : `⏱ Time's up — ${name}'s turn passed.`;
}

export {timeoutToastText};
