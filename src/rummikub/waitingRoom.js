// Pure helpers for the pre-match waiting room (U15 / WS-6). A seat in matchData
// is "joined" once it has a name; before the match starts boardgame.io sits in
// the 'playersJoin' phase. Kept out of the React tree so the player-facing copy
// and the "still waiting" predicate are trivially unit-testable.

function seats(matchData) {
    return Array.isArray(matchData) ? matchData : [];
}

function joinedCount(matchData) {
    return seats(matchData).filter((d) => d && d.name).length;
}

// "{joined} of {n}" — e.g. "1 of 2" — for the overlay copy.
function waitingLabel(matchData) {
    const list = seats(matchData);
    return `${joinedCount(matchData)} of ${list.length}`;
}

// True while the board should stay non-interactive: either boardgame.io is
// still in the join phase, or some seat is yet to be filled.
function isWaitingForPlayers(ctx, matchData) {
    const list = seats(matchData);
    const allJoined = list.length > 0 && list.every((d) => d && d.name);
    return (ctx && ctx.phase === 'playersJoin') || !allJoined;
}

export {waitingLabel, isWaitingForPlayers, joinedCount};
