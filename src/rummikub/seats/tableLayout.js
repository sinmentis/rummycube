// Opponent edge slots, in the order players are seated after you (turn goes to
// your right, mahjong style). Self is always at the bottom.
const OPP_SLOTS = {
    2: ['top'],
    3: ['right', 'left'],
    4: ['right', 'top', 'left'],
};

// Map every seat id to a table position ('self' | 'top' | 'left' | 'right'),
// rotated so the local player ('selfSeat') sits at the bottom.
export function tablePositions(numPlayers, selfSeat) {
    const n = Number(numPlayers) || 1;
    const self = Number(selfSeat) || 0;
    const map = {[self]: 'self'};
    const slots = OPP_SLOTS[n] || OPP_SLOTS[4];
    let s = 0;
    for (let k = 1; k < n; k++) {
        const seat = (self + k) % n;
        map[seat] = slots[s++] || 'top';
    }
    return map;
}
