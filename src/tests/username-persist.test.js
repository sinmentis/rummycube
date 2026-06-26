import React from 'react';
import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import CreateGameForm from '../rummikub/components/CreateGame';

const KEY = 'rummycube:username';
beforeEach(() => localStorage.clear());

test('prefills the username from localStorage and greets the returning player', () => {
  localStorage.setItem(KEY, 'Robin');
  render(<MemoryRouter><CreateGameForm/></MemoryRouter>);
  expect(screen.getByLabelText(/username/i)).toHaveValue('Robin');
  expect(screen.getByText(/welcome back/i)).toHaveTextContent(/Robin/);
});
