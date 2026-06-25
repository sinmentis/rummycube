import fs from 'fs';
import path from 'path';

// T11 (WS-F): four small visual / a11y CSS polish items. jsdom cannot measure
// pixels, so — like board-layout-css.test.js — these are honest CSS-source
// assertions: they verify the rules exist in the stylesheet, not that the
// browser paints them. They guard the action-button focus rings, the rack-tools
// breakpoint, the toast wrap, and the gutter-seam fix against a later revert.
const boardCss = fs.readFileSync(
    path.join(__dirname, '../rummikub/components/board.css'),
    'utf8',
);

// Body of the FIRST rule matching `selector { ... }`. The base (column-0) rules
// always precede their indented media-query overrides, so scoping to the first
// match keeps unrelated lines elsewhere (other nowrap / padding declarations,
// the reduced-motion override) from producing false matches.
function ruleBody(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = boardCss.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
    if (!m) throw new Error(`could not find rule ${selector} in board.css`);
    return m[1];
}

describe('WS-F.1 action-button focus rings', () => {
    test('.primary-action:focus-visible carries the dual-ring colours', () => {
        const body = ruleBody('.primary-action:focus-visible');
        expect(body).toMatch(/#0b1f3a/i);
        expect(body).toMatch(/#8fc7ff/i);
        // keeps its brass 3D shadow so the lift isn't lost on keyboard focus
        expect(body).toMatch(/#9c7a33/i);
        expect(body).toMatch(/outline:\s*none/);
    });

    test('.secondary-action:focus-visible carries the dual-ring colours', () => {
        const body = ruleBody('.secondary-action:focus-visible');
        expect(body).toMatch(/#0b1f3a/i);
        expect(body).toMatch(/#8fc7ff/i);
        expect(body).toMatch(/outline:\s*none/);
    });
});

describe('WS-F.2 rack-tools breakpoint aligns with the controls reflow', () => {
    test('the .rack-tools { right: 4px } tweak lives under max-width: 820px', () => {
        expect(boardCss).toMatch(
            /@media\s*\(\s*max-width:\s*820px\s*\)\s*\{\s*\.rack-tools\s*\{\s*right:\s*4px/,
        );
    });

    test('no max-width: 560px block remains (the only one was this tweak)', () => {
        expect(boardCss).not.toMatch(/max-width:\s*560px/);
    });
});

describe('WS-F.3 timeout-toast wraps on very narrow screens', () => {
    test('.timeout-toast allows wrapping and is width-capped + centred', () => {
        const body = ruleBody('.timeout-toast');
        expect(body).toMatch(/white-space:\s*normal/);
        expect(body).not.toMatch(/white-space:\s*nowrap/);
        expect(body).toMatch(/max-width:\s*min\(\s*92vw\s*,\s*360px\s*\)/);
        expect(body).toMatch(/text-align:\s*center/);
    });
});

describe('WS-F.4 board-container gutter seam', () => {
    test('.board-container base background uses the felt gradient, not the flat base', () => {
        const body = ruleBody('.board-container');
        expect(body).toMatch(/background:\s*var\(--felt\)/);
        expect(body).not.toMatch(/--felt-base/);
    });
});
