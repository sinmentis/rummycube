const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');

test('radius tokens are defined and used', () => {
  expect(css).toMatch(/--r-(sm|md|lg)\s*:/);
});
test('rack tiles are centred (not left-aligned only)', () => {
  // the hand grid container should centre its tiles
  expect(css).toMatch(/\.hand-buttons[^}]*(justify-content:\s*center|margin:\s*0\s*auto)/);
});
test('undo/redo icon buttons are more visible than the old .42 felt wash', () => {
  const m = css.match(/\.icon-button\s*\{[^}]*background[^;]*rgba\([^)]*\)/);
  expect(m).not.toBeNull();
  expect(m[0]).not.toMatch(/rgba\(20,\s*16,\s*10,\s*\.42\)/); // old near-invisible value gone
});
test('rack-centring is scoped to desktop (min-width: 821px), not base/mobile scope', () => {
  // Guard against the mobile regression: at base scope this justify-content:
  // center centres the overflow-x:auto hand scroller, pushing the left columns
  // off-screen (unreachable at scrollLeft 0). It must live inside the desktop
  // media query so mobile keeps the default (start) alignment.
  const centringIdx = css.search(
    /\.hand-buttons\s+\.grid-container\s*\{[^}]*justify-content:\s*center/,
  );
  expect(centringIdx).toBeGreaterThan(-1);

  // Find the @media block whose braces actually enclose the centring rule
  // (mere "nearest preceding @media" would falsely pass, as the T1 desktop
  // block precedes this rule even when it sits at base scope).
  const mediaRe = /@media([^{]*)\{/g;
  let enclosing = null;
  let m;
  while ((m = mediaRe.exec(css)) !== null) {
    const openBrace = mediaRe.lastIndex - 1;
    let depth = 1;
    let i = openBrace + 1;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    const closeBrace = i - 1;
    if (openBrace < centringIdx && centringIdx < closeBrace) {
      enclosing = m[1];
      break;
    }
  }
  expect(enclosing).not.toBeNull();
  expect(enclosing).toMatch(/min-width:\s*821px/);
});
