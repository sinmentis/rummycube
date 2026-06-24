import fs from 'fs';
import path from 'path';

// T9 (WS-3 / WS-4): pixel layout cannot be measured in jsdom, so these are
// honest CSS-source assertions — they verify the two layout rules exist in the
// stylesheet, not that the browser lays them out a certain way. They guard
// against the gutter or the banner reposition being reverted by a later edit.
const boardCss = fs.readFileSync(
    path.join(__dirname, '../rummikub/components/board.css'),
    'utf8',
);
const chatCss = fs.readFileSync(
    path.join(__dirname, '../rummikub/components/chat.css'),
    'utf8',
);

// Body of the top-level `.turn-banner { ... }` rule (not the indented mobile
// override, nor `.turn-banner .turn-dot`). The leading newline + no indent
// pins it to the desktop base rule.
function turnBannerBaseBody() {
    const m = boardCss.match(/\n\.turn-banner\s*\{([^}]*)\}/);
    if (!m) throw new Error('could not find base .turn-banner rule in board.css');
    return m[1];
}

describe('WS-3 chat gutter', () => {
    test('reserves a right gutter on .board-container at >=821px', () => {
        const m = boardCss.match(
            /@media\s*\(min-width:\s*821px\)\s*\{[^@]*?\.board-container\s*\{[^}]*padding-right:\s*calc\(300px \+ 16px\)/,
        );
        expect(m).not.toBeNull();
    });

    test('gutter floor is the exact complement of the chat fold breakpoint', () => {
        // chat.css folds the always-on panel to a corner FAB at <=820px.
        expect(chatCss).toMatch(/@media\s*\(max-width:\s*820px\)/);
        // The gutter therefore must start at 820 + 1 = 821px so there is no
        // "docked AND overlapping" or "folded AND gutter" dead-band.
        expect(boardCss).toMatch(/@media\s*\(min-width:\s*821px\)/);
        expect(820 + 1).toBe(821);
    });
});

describe('WS-4 turn banner reposition', () => {
    test('desktop banner sits beside the 80px avatar, not on top of it', () => {
        const body = turnBannerBaseBody();
        expect(body).toMatch(/left:\s*92px/);
        expect(body).toMatch(/bottom:\s*calc\(100% \+ 26px\)/);
        // No longer co-anchored with .rack-self (which stays at left: 6px).
        expect(body).not.toMatch(/left:\s*6px/);
    });

    test('desktop banner keeps z-index:7 and white-space:nowrap', () => {
        const body = turnBannerBaseBody();
        expect(body).toMatch(/z-index:\s*7/);
        expect(body).toMatch(/white-space:\s*nowrap/);
    });

    test('mobile (<=820px) re-anchors the banner beside the 46px avatar', () => {
        // The mobile override is the only indented `.turn-banner` rule; the
        // desktop base rule is at column 0. Anchor on the leading indent so we
        // don't accidentally match the base rule that sits between the two
        // `@media (max-width: 820px)` blocks.
        const m = boardCss.match(/\n[ \t]+\.turn-banner\s*\{([^}]*)\}/);
        expect(m).not.toBeNull();
        expect(m[1]).toMatch(/left:\s*58px/);
        expect(m[1]).toMatch(/bottom:\s*calc\(100% \+ 14px\)/);
    });
});
