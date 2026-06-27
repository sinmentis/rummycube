import React from 'react';
import {render, cleanup} from '@testing-library/react';
import TableSeats from '../rummikub/components/TableSeats';

// TableSeats threads each opponent seat's bubble to its avatar with a per-seat
// side. Self (the viewer) is rendered by Board, not here, so it is excluded.

afterEach(cleanup);

const matchData = [{id: 0, name: 'Al'}, {id: 1, name: 'Bo'}];

test('threads an opponent bubble to that seat with a side class', () => {
  const {container} = render(
    <TableSeats currentPlayer="0" playerID="0" matchData={matchData} matchID="m1"
      hands={[[], []]} handCounts={{0: 5, 1: 5}} connected={[true, true]}
      timerExpireAt={null} timePerTurn={30} showTurnTimer={false}
      bubbles={{'1': {id: 9, text: 'hey', leaving: false}}}/>
  );
  const bubble = container.querySelector('.chat-bubble');
  expect(bubble).toBeInTheDocument();
  expect(bubble).toHaveTextContent('hey');
  expect(bubble.className).toMatch(/chat-bubble-(up|down|left|right)/);
});

test('renders no bubble for a seat without one (and never for self)', () => {
  const {container} = render(
    <TableSeats currentPlayer="0" playerID="0" matchData={matchData} matchID="m1"
      hands={[[], []]} handCounts={{0: 5, 1: 5}} connected={[true, true]}
      timerExpireAt={null} timePerTurn={30} showTurnTimer={false}
      bubbles={{'0': {id: 1, text: 'self-should-not-show', leaving: false}}}/>
  );
  expect(container.querySelector('.chat-bubble')).toBeNull();
});
