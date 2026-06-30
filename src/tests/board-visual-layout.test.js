const fs = require('fs');
const path = require('path');

// R5b-T1: rebalance the in-game table. jsdom can't measure pixels, so — like
// board-layout-css.test.js and board-visual-ws-*.test.js — these are honest
// CSS-source assertions. They guard the four layout decisions against a later
// revert: (1) the always-on 316px chat gutter is gone, (2) the chat FAB shows
// at every width, (3) the panel collapses by default and reveals via .open,
// (4) the desktop board tray is height-capped so it no longer dominates.
const board = fs.readFileSync(
    path.join(__dirname, '../rummikub/components/board.css'),
    'utf8',
);
const chat = fs.readFileSync(
    path.join(__dirname, '../rummikub/components/chat.css'),
    'utf8',
);

// Body of the FIRST `selector { ... }` match. The base (column-0) rules always
// precede their indented media-query overrides, so the first match is the
// desktop base rule. This is what lets us tell "shows by default" apart from
// "shows only inside @media (max-width:820px)" with a plain source assertion.
function firstRuleBody(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
    if (!m) throw new Error(`could not find rule ${selector}`);
    return m[1];
}

test('desktop no longer reserves the always-on 316px chat gutter', () => {
    // the old rule was: @media (min-width:821px){ .board-container{ padding-right: calc(300px + 16px) } }
    expect(board).not.toMatch(/padding-right:\s*calc\(300px\s*\+\s*16px\)/);
});

test('chat FAB shows by default (its base rule, not only inside max-width:820px)', () => {
    // the base .chat-fab rule itself must be visible; it must NOT rely on the
    // mobile media query to flip display away from none
    const body = firstRuleBody(chat, '.chat-fab');
    expect(body).toMatch(/display:\s*(inline-flex|flex)/);
    expect(body).not.toMatch(/display:\s*none/);
});

test('chat panel collapses by default and reveals via .chat-root.open', () => {
    // base panel is hidden; opening the root swaps the FAB out for the panel overlay
    const panel = firstRuleBody(chat, '.chat-panel');
    expect(panel).toMatch(/display:\s*none/);
    expect(chat).toMatch(/\.chat-root\.open\s+\.chat-panel\s*\{[^}]*display:\s*flex/);
    expect(chat).toMatch(/\.chat-root\.open\s+\.chat-fab\s*\{[^}]*display:\s*none/);
});

test('desktop caps the board tray height so it no longer dominates the felt', () => {
    // the 9-row grid is intrinsically ~63vh; on desktop we cap the .ref scroll
    // region's max-height so the empty tray stops pushing the rack to the bottom
    expect(board).toMatch(
        /@media\s*\(min-width:\s*821px\)[\s\S]*?\.ref\s*\{[^}]*max-height:/,
    );
});

test('rack keeps a stable desktop width when Submit meld appears', () => {
    expect(board).toContain('width: min(94vw, 960px);');
    expect(board).not.toMatch(/\.hand-buttons\s*\{[^}]*width:\s*fit-content/);
});

test('hand tile numbers are larger than the inherited 25px inline size', () => {
    expect(board).toMatch(
        /\.hand-buttons\s+\.hand-grid\s+\.tile-text\s*\{[^}]*font-size:\s*clamp\(18px,\s*2vw,\s*30px\)/,
    );
});
