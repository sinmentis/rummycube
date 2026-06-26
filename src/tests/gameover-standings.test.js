import React from 'react';
import {render, screen, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import GameOverModal from '../rummikub/components/GameOverModal';

jest.mock('canvas-confetti', () => () => {});
jest.mock('../rummikub/sound/sfx', () => ({play: () => {}}));

test('standings are sorted by score descending, winner first', () => {
  // seat 0 scored 5, seat 1 scored 40 (winner), seat 2 scored 12
  const gameover = {winner: '1', points: {0: 5, 1: 40, 2: 12}};
  const matchData = [{id: 0, name: 'Al'}, {id: 1, name: 'Bo'}, {id: 2, name: 'Cy'}];
  render(<MemoryRouter><GameOverModal gameover={gameover} matchId="m1" playerID="1" matchData={matchData}/></MemoryRouter>);
  const items = screen.getAllByRole('listitem').map(li => li.textContent);
  expect(items[0]).toMatch(/Bo/);   // 40 pts first
  expect(items[1]).toMatch(/Cy/);   // 12 pts
  expect(items[2]).toMatch(/Al/);   // 5 pts last
  expect(items[0]).toMatch(/40/);
});
