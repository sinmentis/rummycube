const fs = require('fs');
const path = require('path');
test('util.js (server-imported) references no DOM globals', () => {
  const src = fs.readFileSync(path.join(__dirname, '../rummikub/util.js'), 'utf8');
  expect(src).not.toMatch(/\b(document|navigator|window)\b/);
});
