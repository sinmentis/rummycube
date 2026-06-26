const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');
const avatar = fs.readFileSync(path.join(__dirname, '../rummikub/components/PlayerAvatar.jsx'), 'utf8');

test('timer ring no longer starts at pure blue #00f', () => {
  expect(avatar).not.toMatch(/useState\(["']#00f["']\)/);
});
test('turn banner / button base no longer use Segoe UI', () => {
  // these three rules previously declared font-family: 'Segoe UI'
  expect(css).not.toMatch(/Segoe UI/);
});
