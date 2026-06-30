import React from 'react';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import ReportBugButton from '../rummikub/components/ReportBugButton';
import {installBugLog, snapshotBugLog} from '../rummikub/bugLog';

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({filename: 'bug.json'}),
  }));
});

afterEach(() => {
  delete global.fetch;
});

test('report button posts current game snapshot to the bug-report endpoint', async () => {
  render(<ReportBugButton
    matchID="m1"
    playerID="0"
    G={{mode: 'chaos'}}
    ctx={{turn: 7}}
  />);

  fireEvent.click(screen.getByRole('button', {name: /report bug/i}));

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('/api/bug-report');
  expect(options.method).toBe('POST');
  const body = JSON.parse(options.body);
  expect(body.matchID).toBe('m1');
  expect(body.playerID).toBe('0');
  expect(body.snapshot.G.mode).toBe('chaos');
  expect(body.snapshot.ctx.turn).toBe(7);
  expect(body.client.url).toBe(window.location.href);
  await waitFor(() => expect(screen.getByText(/saved bug\.json/i)).toBeInTheDocument());
});

test('bug log never breaks console.error for unserializable objects', () => {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  installBugLog();

  const bad = {toJSON() { throw new Error('boom'); }};
  expect(() => console.error(bad)).not.toThrow();
  expect(calls).toHaveLength(1);
  expect(snapshotBugLog().at(-1).message).toContain('[unserializable]');

  console.error = original;
});
