const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');

test('.tile-selected has a static second channel and a reduced-motion-gated lift', () => {
  // base rule carries the motion-off second channel (shadow/z-index), always present
  expect(css).toMatch(/\.tile\.tile-selected\s*\{[^}]*box-shadow/);

  // The lift MUST stay reduced-motion gated: the ungated BASE rule (the
  // column-0 `.tile.tile-selected { ... }`, not the `div.tile.tile-selected`
  // nested inside the @media block) must NOT carry the transform. Without this,
  // the test below is a near-tautology. It would still pass if the lift
  // regressed into the base rule, because lastIndexOf would latch onto an
  // earlier unrelated reduced-motion gate.
  const baseRule = css.match(/(?:^|\n)\.tile\.tile-selected\s*\{([^}]*)\}/);
  expect(baseRule).not.toBeNull();
  const baseBody = baseRule[1];
  expect(baseBody).toMatch(/box-shadow/);
  expect(baseBody).not.toMatch(/transform|translateY/);

  // the lift transform exists ...
  const tIdx = css.search(/transform:\s*translateY\(\s*-6px\s*\)\s+scale\(\s*1\.04\s*\)/);
  expect(tIdx).toBeGreaterThanOrEqual(0);
  // ... and sits under a prefers-reduced-motion: no-preference gate, in a .tile-selected rule
  const gateIdx = css.lastIndexOf('@media (prefers-reduced-motion: no-preference)', tIdx);
  expect(gateIdx).toBeGreaterThanOrEqual(0);
  const selIdx = css.lastIndexOf('.tile-selected', tIdx);
  expect(selIdx).toBeGreaterThan(gateIdx);
});
