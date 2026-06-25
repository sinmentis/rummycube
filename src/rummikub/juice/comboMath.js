// Manipulation weights — rebalanced (round-3 T1) so the "ON FIRE" tier is *earned*
// by real board manipulation (forming groups, rearranging the board) rather than by
// dumping a long run out of hand. `placed` stays in the signature as a tuning knob
// but currently contributes 0, so a play's score == 3 * (groups + rearranged):
//   single-group dump (any size) => 3*1      = 3   -> NICE
//   2 groups OR 1 group+1 rearrange => 3*2    = 6   -> COMBO
//   multi-group + rearrange      => 3*(>=3)  >= 9   -> ON FIRE
//
// Guardrail — why ComboOverlay.jsx and Board.jsx are deliberately NOT touched:
// reachable scores are always multiples of 3 {3,6,9,...}. So ComboOverlay's
// hardcoded colour tiers (warm n>=3 / hot n>=5 / fire n>=7) and this label word
// (NICE n>=3 / COMBO n>=6 / ON FIRE n>=9) always land in the same band even though
// the numeric thresholds differ: 3 -> warm/NICE, 6 -> hot/COMBO, 9+ -> fire/ON FIRE.
// Board.jsx's flash gate (n>=3) likewise fires on every real play. If a future weight
// change can yield an in-between score (4/5/7/8), those tiers and the flash gate MUST
// be revisited so colour and label stay aligned.
export const W_GROUP = 3; // per valid run/set formed or extended
export const W_INTEG = 3; // per existing board tile rearranged
export const W_PLACE = 0; // per tile placed from hand (tuning knob; currently 0)

// Pure score for a play, weighting board manipulation over raw tile count.
export function manipulationScore({groups = 0, rearranged = 0, placed = 0} = {}) {
    return W_GROUP * groups + W_INTEG * rearranged + W_PLACE * placed;
}

export function comboLabel(n) {
    if (n >= 9) return 'ON FIRE';
    if (n >= 6) return 'COMBO';
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
