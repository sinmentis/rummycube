// PURE celebration gating. Decides which juice effects a given G.lastPlay is
// allowed to fire on THIS client, based on who played and whether the local
// player is mid-drag/selection. No DOM, no side effects — see resolve-juice.test.js.
//
//   own play, not dragging  -> everything on, 'full'
//   opponent play           -> no screen shake, no win sting, 'muted'
//                              (subtle burst + group spotlight so you still SEE it)
//   local drag/selection    -> never kick, regardless of seat
export function resolveJuice({lastPlay, localSeat, isDragging} = {}) {
    if (!lastPlay) {
        return {kick: false, flash: false, burst: false, win: false, celebrate: false, intensity: 'muted'};
    }
    const own = String(lastPlay.seat) === String(localSeat);
    if (!own) {
        return {kick: false, flash: false, burst: true, win: false, celebrate: true, intensity: 'muted'};
    }
    return {
        kick: !isDragging,
        flash: true,
        burst: true,
        win: true,
        celebrate: true,
        intensity: 'full',
    };
}
