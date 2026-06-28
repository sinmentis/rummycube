// src/tests/ability-presence-beam.test.js
// SP1b T6 (juice): the opponent "has-a-card" presence dot and the peek cast beam.
// Behaviour tests use RTL (jsdom); layout/animation is asserted against the CSS
// source (jsdom can't measure pixels or media queries) like board-visual-*.test.js.
import React from 'react';
import {render, cleanup} from '@testing-library/react';
import CastBeam from '../rummikub/components/CastBeam';
import TableSeats from '../rummikub/components/TableSeats';

afterEach(cleanup);

test('CastBeam renders a line from caster to target', () => {
  const {container} = render(<CastBeam from={{x: 10, y: 20}} to={{x: 100, y: 60}} />);
  const line = container.querySelector('line, .beam-core');
  expect(line).toBeInTheDocument();
});

const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/abilities.css'), 'utf8');

test('presence dot exists and beam respects reduced-motion', () => {
  expect(css).toMatch(/\.ability-presence|\.has-ability/);
  expect(css).toMatch(/prefers-reduced-motion/);
});

// Presence is "only opponents, never a count" — proven at the seats level. The
// viewer's own seat is never rendered by TableSeats, so even when the map carries
// the viewer's id the dot must not appear for self, and a dot must never hold a
// digit (privacy: presence only, never how many).
const seatsProps = {
  currentPlayer: '0', playerID: '0', matchID: 'm1',
  timerExpireAt: null, timePerTurn: 30, showTurnTimer: false,
};

test('opponent presence shows a single dot per opponent — never for self, never a count', () => {
  const matchData = [{id: 0, name: 'Al'}, {id: 1, name: 'Bo'}, {id: 2, name: 'Cy'}];
  const {container} = render(
    <TableSeats {...seatsProps} matchData={matchData}
      hands={[[], [], []]} handCounts={{0: 5, 1: 5, 2: 5}} connected={[true, true, true]}
      abilityPresence={{'0': true, '1': true, '2': true}} />  // self '0' included on purpose
  );
  const dots = container.querySelectorAll('.ability-presence');
  expect(dots).toHaveLength(2);                                  // two opponents, self omitted
  dots.forEach(dot => expect(dot).not.toHaveTextContent(/\d/));  // presence only — no number
});

test('no presence dot without abilityPresence (classic / backward compatible)', () => {
  const matchData = [{id: 0, name: 'Al'}, {id: 1, name: 'Bo'}];
  const {container} = render(
    <TableSeats {...seatsProps} matchData={matchData}
      hands={[[], []]} handCounts={{0: 5, 1: 5}} connected={[true, true]} />
  );
  expect(container.querySelector('.ability-presence')).toBeNull();
});
