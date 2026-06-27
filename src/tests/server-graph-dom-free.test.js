const fs = require('fs');
const path = require('path');

// The server process (node src/server.js) imports the game kernel, which must
// never reference DOM globals — there is no document/navigator/window in Node.
// T2 evicted the two DOM helpers (copyToClipboard/stringToColor) to
// components/domUtil.js; T3/T4/T5/T6 then split util.js/moves.js into the pure
// modules below, and T7/T8 added the arrange/ auto-arrange engine. This guard
// locks the whole server-imported kernel DOM-free, so a future edit that pulls a
// DOM call into any split module is caught here.
const SERVER_GRAPH_MODULES = [
  '../rummikub/util.js',
  '../rummikub/moves.js',
  '../rummikub/turn.js',
  '../rummikub/Game.js',
  '../rummikub/playerView.js',
  '../rummikub/moveValidation.js',
  '../rummikub/tile/codec.js',
  '../rummikub/tile/sequence.js',
  '../rummikub/scoring.js',
  '../rummikub/scoring/playScore.js',
  '../rummikub/projection.js',
  '../rummikub/juice/comboMath.js',
  '../rummikub/arrange/cluster.js',
  '../rummikub/arrange/blocks.js',
  '../rummikub/arrange/partition.js',
  '../rummikub/arrange/layout.js',
  '../rummikub/arrange/space.js',
  '../rummikub/arrange/index.js',
];

test.each(SERVER_GRAPH_MODULES)('%s (server-imported) references no DOM globals', (rel) => {
  const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
  expect(src).not.toMatch(/\b(document|navigator|window)\b/);
});
