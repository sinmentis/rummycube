const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');

test('.slot-over exists and is a restrained semi-transparent fill', () => {
  expect(css).toMatch(/\.grid-item\.slot-over\s*\{/);
  // the over cue fill alpha stays < .3 (restrained, "you can place here")
  const m = css.match(/\.grid-item\.slot-over\s*\{[^}]*background[^;]*rgba\([^)]*,\s*\.(\d+)\)/);
  expect(m).not.toBeNull();
  expect(Number('0.' + m[1])).toBeLessThan(0.3);
});
