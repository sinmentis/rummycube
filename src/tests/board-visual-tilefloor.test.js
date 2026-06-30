const fs = require('fs');
const path = require('path');

// Board-tile size floor. jsdom can't measure pixels, so (like the other
// board-visual-*.test.js) these are CSS-source assertions. The owner wants a
// placed BOARD tile to read at roughly hand-tile card size in BOTH classic and
// chaos — not collapse into a tiny grid cell — so the rack-size floor lives on the
// base `.ref div.tile` / `.ref .tile-text` (no `.board.chaos` scope) and the row
// floor (--board-row-min) is lifted for every mode. On very short windows the 9
// floored rows exceed the tray cap and .ref's overflow:auto scrolls (the existing
// minmax fallback): match-hand size is chosen over no-scroll. The mobile block
// (asserted in board-visual-mobile.test.js) resets min-* so the phone board fits.
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

test('board tiles fill their cell flush (choice B) — no min-size floor that overflows', () => {
    const body = ruleBody('.ref div.tile');
    expect(body).toMatch(/width:\s*100%/);
    expect(body).toMatch(/height:\s*100%/);
    // The old overflow-causing floor is gone: tile must fit its 1fr cell exactly.
    expect(body).not.toMatch(/min-width:\s*var\(--board-tile-min\)/);
    expect(board).not.toMatch(/\.board\.chaos\s+\.ref\s+div\.tile\s*\{/);
});

test('board columns share the width evenly (32 x 1fr) so tiles align to gridlines, no h-scroll', () => {
    expect(board).toMatch(/grid-template-columns:\s*repeat\(32,\s*minmax\(0,\s*1fr\)\)/);
    // cell lines divide evenly to match the 1fr cells
    expect(board).toMatch(/background-size:\s*calc\(100%\s*\/\s*32\)\s*calc\(100%\s*\/\s*9\)/);
});

test('board tile-text keeps the larger legibility floor (clamp 13..24px) in both modes', () => {
    const body = ruleBody('.ref .tile-text');
    expect(body).toMatch(/font-size:\s*clamp\(\s*13px\s*,\s*1\.5vw\s*,\s*24px\s*\)/);
    // The old shrunken classic floor (clamp 9..18) is gone.
    expect(board).not.toMatch(/clamp\(9px,\s*1\.4vw,\s*18px\)/);
    expect(board).not.toMatch(/\.board\.chaos\s+\.ref\s+\.tile-text\s*\{/);
});

test('board rows lift to the tile height for every mode (--board-row-min: 5.4vh)', () => {
    // Lifted on the grid container itself, no longer gated behind `.board.chaos`.
    expect(ruleBody('.ref .grid-container')).toMatch(/--board-row-min:\s*5\.4vh/);
    expect(board).not.toMatch(/\.board\.chaos\s*\{\s*--board-row-min/);
    // The 9-row grid template still reads the floored row-min.
    expect(board).toMatch(/repeat\(9,\s*minmax\(var\(--board-row-min[^)]*\),\s*1fr\)\)/);
});
