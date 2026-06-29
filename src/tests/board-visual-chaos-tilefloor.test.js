const fs = require('fs');
const path = require('path');

// Chaos UX fix T2 — board tiles must not shrink when placed. jsdom can't measure
// pixels, so (like the other board-visual-*.test.js) these are CSS-source
// assertions guarding the rack-size floor: chaos board cells get a tile floor
// near the rack tile (2.0vw × 5.4vh) so a placed tile stays ~>=90% of a hand
// tile. Classic stays on the 100%/100% fill + clamp(9px..18px) and must not be
// touched here. Very short windows fall back to the existing minmax scroll.
const board = fs.readFileSync(
    path.join(__dirname, '../rummikub/components/board.css'),
    'utf8',
);

function ruleBody(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = board.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
    if (!m) throw new Error(`could not find rule ${selector} in board.css`);
    return m[1];
}

test('board tile floor token sits at the rack-tile size (max(2.0vw, 40px))', () => {
    // 40px is >= 90% of the rack tile width (2.0vw ~= 38.4px @1920) so a placed
    // tile never shrinks below the hand tile.
    expect(board).toMatch(/--board-tile-min:\s*max\(\s*2\.0vw\s*,\s*40px\s*\)/);
});

test('chaos board cells floor the tile to the rack size (no shrink)', () => {
    const body = ruleBody('.board.chaos .ref div.tile');
    expect(body).toMatch(/min-width:\s*var\(--board-tile-min\)/);
    expect(body).toMatch(/min-height:\s*var\(--board-tile-min\)/);
});

test('chaos board tile-text keeps a legibility floor (clamp 13..24px)', () => {
    const body = ruleBody('.board.chaos .ref .tile-text');
    expect(body).toMatch(/font-size:\s*clamp\(\s*13px\s*,\s*1\.5vw\s*,\s*24px\s*\)/);
});

test('classic board tiles are untouched (fill cell, small text floor)', () => {
    expect(ruleBody('.ref div.tile')).toMatch(/width:\s*100%/);
    expect(ruleBody('.ref .tile-text')).toMatch(/clamp\(9px,\s*1\.4vw,\s*18px\)/);
});
