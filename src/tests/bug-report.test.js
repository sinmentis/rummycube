import fs from 'fs';
import os from 'os';
import path from 'path';
import {enrichBugReport, saveBugReport} from '../rummikub/bugReport';

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

test('saveBugReport never defaults inside FLATFILE_DIR', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'rummy-cwd-'));
  const flatfile = fs.mkdtempSync(path.join(os.tmpdir(), 'rummy-flatfile-'));
  const old = process.env.FLATFILE_DIR;
  const oldCwd = process.cwd();
  process.env.FLATFILE_DIR = flatfile;
  try {
    process.chdir(cwd);
    const result = saveBugReport({matchID: 'm2', playerID: '1'}, {
      now: () => new Date('2026-06-30T03:00:00.000Z'),
    });
    expect(result.path).toBe(path.join(cwd, 'bug-reports', result.filename));
    expect(result.path.startsWith(flatfile)).toBe(false);
    expect(fs.existsSync(result.path)).toBe(true);
  } finally {
    process.chdir(oldCwd);
    if (old === undefined) delete process.env.FLATFILE_DIR;
    else process.env.FLATFILE_DIR = old;
  }
});

test('saveBugReport uses BUG_REPORT_DIR when provided', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rummy-bug-dir-'));
  const old = process.env.BUG_REPORT_DIR;
  process.env.BUG_REPORT_DIR = dir;
  try {
    const result = saveBugReport({matchID: 'm3', playerID: '2'}, {
      now: () => new Date('2026-06-30T03:30:00.000Z'),
    });
    expect(result.path).toBe(path.join(dir, result.filename));
    expect(fs.existsSync(result.path)).toBe(true);
  } finally {
    if (old === undefined) delete process.env.BUG_REPORT_DIR;
    else process.env.BUG_REPORT_DIR = old;
  }
});

test('enrichBugReport adds boardgame.io state, metadata, log and initialState', async () => {
  const db = {
    fetch: jest.fn(async () => ({
      state: {G: {mode: 'chaos'}, ctx: {turn: 4}},
      metadata: {players: {'0': {name: 'A'}}},
      log: [{action: {type: 'MAKE_MOVE', payload: {type: 'drawTile'}}}],
      initialState: {G: {mode: 'classic'}, ctx: {turn: 0}},
    })),
  };

  const enriched = await enrichBugReport({matchID: 'm1', snapshot: {client: true}}, {db});

  expect(db.fetch).toHaveBeenCalledWith('m1', {
    state: true,
    metadata: true,
    log: true,
    initialState: true,
  });
  expect(enriched.snapshot.client).toBe(true);
  expect(enriched.server.state.ctx.turn).toBe(4);
  expect(enriched.server.metadata.players['0'].name).toBe('A');
  expect(enriched.server.log[0].action.payload.type).toBe('drawTile');
  expect(enriched.server.initialState.ctx.turn).toBe(0);
});

test('enrichBugReport records fetch errors without blocking snapshot save', async () => {
  const db = {fetch: jest.fn(async () => { throw 'disk sad'; })};
  const enriched = await enrichBugReport({matchID: 'm2'}, {db});
  expect(enriched.server.error).toMatch(/disk sad/);
});
