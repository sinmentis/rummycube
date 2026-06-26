const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');

test('mobile board columns fit the viewport (no fixed 48px floor forcing horizontal scroll)', () => {
  // the mobile board grid should size columns to fit 32 across the viewport,
  // not max(8.4vw, 48px) which forces a >1500px track.
  const m = css.match(/grid-template-columns:\s*repeat\(32,[^;]*\)\s*!important/);
  expect(m).not.toBeNull();
  expect(m[0]).not.toMatch(/max\(8\.4vw,\s*48px\)/); // no 48px floor on mobile
});
