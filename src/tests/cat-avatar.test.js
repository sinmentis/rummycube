import {catAvatarIndex, catAvatarUrl, CAT_AVATAR_COUNT} from '../rummikub/avatars/catAvatar';

test('catAvatarIndex is deterministic and within range', () => {
    const a = catAvatarIndex('ROOM42', 0);
    expect(a).toBe(catAvatarIndex('ROOM42', 0));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(CAT_AVATAR_COUNT);
});

test('players in the same match get distinct cats (up to 4 seats)', () => {
    const idx = [0, 1, 2, 3].map(s => catAvatarIndex('ROOM42', s));
    expect(new Set(idx).size).toBe(4);
});

test('match codes spread across the whole avatar pool', () => {
    const codes = Array.from({length: 60}, (_, i) => 'ROOM' + i);
    const distinct = new Set(codes.map(c => catAvatarIndex(c, 0)));
    expect(distinct.size).toBeGreaterThanOrEqual(8); // good spread across 16 cats
});

test('catAvatarUrl points to a local zero-padded png', () => {
    expect(catAvatarUrl('ROOM42', 0)).toMatch(/^\/avatars\/cats\/cat-\d{2}\.png$/);
    expect(catAvatarUrl('ROOM42', 2)).toBe(`/avatars/cats/cat-${String(catAvatarIndex('ROOM42', 2) + 1).padStart(2, '0')}.png`);
});

test('handles a missing/odd seat id without throwing', () => {
    expect(() => catAvatarUrl('ROOM42', undefined)).not.toThrow();
    expect(catAvatarIndex('ROOM42', undefined)).toBeGreaterThanOrEqual(0);
});
