import React from 'react';
import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import CreateGameForm from '../rummikub/components/CreateGame';

test('Create button keeps the branded primary class even with empty username', () => {
  render(<MemoryRouter><CreateGameForm/></MemoryRouter>);
  const btn = screen.getByRole('button', {name: /create/i});
  expect(btn).toHaveClass('lobby-btn-primary'); // branded, not the grey disabled-only look
  // username input is autofocused
  expect(screen.getByLabelText(/username/i)).toHaveFocus();
});
