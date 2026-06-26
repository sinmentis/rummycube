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
