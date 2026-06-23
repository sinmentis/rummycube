// Pure code->English text map for a rejected manual submit. The server's
// submitRejectReason(G, ctx) returns a reason object {code, score?, ...}; this
// renders it as a short, English, player-facing sentence. Kept separate from the
// React tree so it is trivially unit-testable.
//
// Emitted codes (post-U3): NO_NEW_TILE | BELOW_30 | MIXED_FIRST_MOVE |
// INVALID_GROUP. RUN_TOO_SHORT is reserved (collapsed into INVALID_GROUP) but
// kept here so the map stays exhaustive and harmless.
function submitReasonText(reason) {
    if (!reason || !reason.code) {
        return '';
    }
    switch (reason.code) {
        case 'NO_NEW_TILE':
            return 'Place at least one tile from your rack first.';
        case 'BELOW_30':
            return `First meld must total at least 30 — you have ${reason.score}.`;
        case 'MIXED_FIRST_MOVE':
            return 'Your first meld must use only your own tiles.';
        case 'INVALID_GROUP':
            return "That isn't a valid run or set.";
        case 'RUN_TOO_SHORT':
            return 'A run needs at least 3 tiles in a row.';
        default:
            return '';
    }
}

export {submitReasonText};
