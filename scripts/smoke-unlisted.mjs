#!/usr/bin/env node
// Smoke test for SEC-1 (Task U2): matches created via the lobby must be
// "unlisted" — absent from the public GET /games/RummyCube list — while still
// being directly joinable by ID.
//
// Run against a locally started server:
//   node src/server.js   (or: npm run serve)  on PORT (default 9119)
//   node scripts/smoke-unlisted.mjs            (BASE defaults to localhost:9119)
//
// Usage: node scripts/smoke-unlisted.mjs [BASE_URL]

const BASE = process.argv[2] || `http://127.0.0.1:${process.env.PORT || 9119}`;
const GAME = 'RummyCube';

const j = async (res) => {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
};

const assert = (cond, msg) => {
    if (!cond) { console.error(`ASSERT FAILED: ${msg}`); process.exit(1); }
    console.log(`OK: ${msg}`);
};

(async () => {
    // 1) create a match (unlisted is set server-side via lobbyClient; the REST
    //    create route accepts the same `unlisted` flag, so we send it here to
    //    exercise the exact path the client uses).
    const created = await j(await fetch(`${BASE}/games/${GAME}/create`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({numPlayers: 2, setupData: {timePerTurn: 60}, unlisted: true}),
    }));
    const matchID = created.matchID;
    assert(typeof matchID === 'string' && matchID.length > 0, `created match has an ID (${matchID})`);

    // 2) public list must NOT contain the created match.
    const list = await j(await fetch(`${BASE}/games/${GAME}`));
    const ids = (list.matches || []).map((m) => m.matchID);
    assert(!ids.includes(matchID), `public GET /games/${GAME} does NOT list the match`);

    // 3) direct getMatch by ID must STILL work (join path intact).
    const match = await j(await fetch(`${BASE}/games/${GAME}/${matchID}`));
    assert(match && match.matchID === matchID, `GET /games/${GAME}/<id> still returns the match`);
    assert(Array.isArray(match.players), 'getMatch returns the seat list (listSeats path)');

    // 4) join still works on the unlisted match.
    const joined = await j(await fetch(`${BASE}/games/${GAME}/${matchID}/join`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({playerID: '0', playerName: 'alice'}),
    }));
    assert(typeof joined.playerCredentials === 'string', 'join seat 0 returns credentials');

    // 5) "Play again": boardgame.io's playAgain reads `unlisted` from the
    //    REQUEST BODY, not the parent match metadata, so the next match would
    //    be LISTED unless we thread the flag through. Exercise the exact body
    //    the client now sends and assert the next match is ALSO unlisted.
    const again = await j(await fetch(`${BASE}/games/${GAME}/${matchID}/playAgain`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({playerID: '0', credentials: joined.playerCredentials, unlisted: true}),
    }));
    const nextMatchID = again.nextMatchID;
    assert(typeof nextMatchID === 'string' && nextMatchID.length > 0, `playAgain returns a next match ID (${nextMatchID})`);
    assert(nextMatchID !== matchID, 'playAgain creates a distinct next match');

    // 6) public list must NOT contain the next match either.
    const listAfter = await j(await fetch(`${BASE}/games/${GAME}`));
    const idsAfter = (listAfter.matches || []).map((m) => m.matchID);
    assert(!idsAfter.includes(nextMatchID), `public GET /games/${GAME} does NOT list the playAgain match`);

    // 7) the next match is still reachable by ID (players can move on).
    const nextMatch = await j(await fetch(`${BASE}/games/${GAME}/${nextMatchID}`));
    assert(nextMatch && nextMatch.matchID === nextMatchID, `GET /games/${GAME}/<nextId> still returns the match`);
    assert(Array.isArray(nextMatch.players), 'next match returns the seat list (join path intact)');

    console.log('SMOKE OK: unlisted matches (incl. playAgain) are private but joinable by ID');
})().catch((e) => { console.error('SMOKE ERROR', e); process.exit(1); });
