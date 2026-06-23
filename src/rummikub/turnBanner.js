// S2-U4: pure label for the "whose turn" banner near the rack. Kept out of the
// React tree so the "Your turn" / "{name}'s turn" copy is trivially
// unit-testable. The text itself is the cue (a non-color channel), so it stays
// colorblind-safe. Returns null when there is no active player to announce.
function turnBannerLabel(currentPlayer, playerID, matchData) {
    if (currentPlayer === null || currentPlayer === undefined || currentPlayer === '') {
        return null;
    }
    if (String(currentPlayer) === String(playerID)) {
        return 'Your turn';
    }
    const list = Array.isArray(matchData) ? matchData : [];
    const seat = list[Number(currentPlayer)];
    const name = (seat && seat.name) || `Player ${Number(currentPlayer) + 1}`;
    return `${name}'s turn`;
}

export {turnBannerLabel};
