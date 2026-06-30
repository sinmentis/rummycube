import fs from 'fs';
import os from 'os';
import path from 'path';
import {saveBugReport} from '../rummikub/bugReport';

test('saveBugReport writes timestamped JSON with sanitized match/player ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rummy-bug-'));
  const now = () => new Date('2026-06-30T02:03:04.005Z');

  const result = saveBugReport({
    matchID: '../bad/match',
    playerID: 'p/0',
    snapshot: {ctx: {turn: 3}, G: {mode: 'chaos'}},
  }, {dir, now});

  expect(result.filename).toMatch(/^2026-06-30T02-03-04-005Z-bad-match-p-p-0\.json$/);
  const written = JSON.parse(fs.readFileSync(path.join(dir, result.filename), 'utf8'));
  expect(written.matchID).toBe('../bad/match');
  expect(written.playerID).toBe('p/0');
  expect(written.savedAt).toBe('2026-06-30T02:03:04.005Z');
  expect(written.snapshot.ctx.turn).toBe(3);
});
