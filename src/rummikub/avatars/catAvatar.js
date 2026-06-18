export const CAT_AVATAR_COUNT = 16;

// Distinct-per-seat stride; coprime to CAT_AVATAR_COUNT so up to 16 seats never
// collide within one match.
const STRIDE = 7;

function hashString(str) {
    let h = 0;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

// A stable, random-looking index 0..CAT_AVATAR_COUNT-1 for a player. Derived from
// the match id (so every client agrees) plus the seat (so players in one match get
// different cats). No game state required.
export function catAvatarIndex(matchId, seatId, count = CAT_AVATAR_COUNT) {
    const seat = Number.isFinite(Number(seatId)) ? Math.abs(Math.trunc(Number(seatId))) : 0;
    return (hashString(matchId) + seat * STRIDE) % count;
}

export function catAvatarUrl(matchId, seatId, count = CAT_AVATAR_COUNT) {
    const n = String(catAvatarIndex(matchId, seatId, count) + 1).padStart(2, '0');
    return `/avatars/cats/cat-${n}.png`;
}
