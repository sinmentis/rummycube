const fs = require('fs');
const path = require('path');

// Board-tile sizing. jsdom can't measure pixels, so (like the other
// board-visual-*.test.js) these are CSS-source assertions. Owner choice B: a board
// tile fills its grid cell EXACTLY and aligns to the gridlines with NO horizontal
// scroll. The 32 columns share the width evenly (32 x minmax(0,1fr)), the cell
// carries no padding, and `.ref div.tile` fills 100% with no min-size floor (which
// previously overflowed the narrow columns). Rows keep the legibility floor.
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

test('board cells carry no padding so tiles reach the gridlines', () => {
    const body = ruleBody('.ref .grid-item');
    expect(body).toMatch(/display:\s*block/);
    expect(body).toMatch(/padding:\s*0/);
    const wrapper = ruleBody('.ref .grid-item > div');
    expect(wrapper).toMatch(/width:\s*100%/);
    expect(wrapper).toMatch(/height:\s*100%/);
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
