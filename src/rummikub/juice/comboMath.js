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
