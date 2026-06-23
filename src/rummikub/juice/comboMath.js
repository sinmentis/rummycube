// Manipulation weights [PLACEHOLDER] — starting point. Tuned so a surgical play
// (forming groups / rearranging the board) beats a flat tile dump:
//   1-tile play forming 2 groups => 3*2 + 0 + 1 = 7
//   3-tile flat dump (1 group)   => 3*1 + 0 + 3 = 6   (7 > 6)
export const W_GROUP = 3; // [PLACEHOLDER] per valid run/set formed or extended
export const W_INTEG = 2; // [PLACEHOLDER] per existing board tile rearranged
export const W_PLACE = 1; // [PLACEHOLDER] per tile placed from hand

// Pure score for a play, weighting board manipulation over raw tile count.
export function manipulationScore({groups = 0, rearranged = 0, placed = 0} = {}) {
    return W_GROUP * groups + W_INTEG * rearranged + W_PLACE * placed;
}

export function comboLabel(n) {
    if (n >= 7) return 'ON FIRE';
    if (n >= 5) return 'COMBO';
    if (n >= 3) return 'NICE';
    return '';
}

export function particleCount(intensity) {
    return intensity === 'max' ? 40 : intensity === 'subtle' ? 8 : 18;
}

export function countPlacedThisTurn(tilePositions, boardGridId) {
    return Object.values(tilePositions).filter(p => p && p.gridId === boardGridId && p.tmp).length;
}

export function submitComboCount(accepted, placedCount) {
    return accepted && placedCount > 0 ? placedCount : 0;
}
