// Reduce raw match metadata into the three public homepage counters. Pure so it
// can be unit-tested and reused by the server route. `metadatas` is a list of
// boardgame.io match metadata objects ({players: {seatId: {name?, isConnected?}}, gameover?}).
export function computeServerStats(metadatas) {
    let inProgress = 0, waiting = 0, players = 0;
    for (const md of (metadatas || [])) {
        if (!md || (md.gameover !== undefined && md.gameover !== null)) continue; // finished
        const seats = Object.values(md.players || {});
        if (!seats.length) continue;
        const joined = seats.filter(p => p && p.name).length;
        const connected = seats.filter(p => p && p.isConnected).length;
        if (joined === 0) continue; // empty/stale room
        players += connected;
        if (joined === seats.length) inProgress++;
        else waiting++;
    }
    return {inProgress, waiting, players};
}
