import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import CreateGameForm from '../rummikub/components/CreateGame';

// Stub the lobby client so we can assert the chaos flag without a server.
// NOTE: jest.mock factories may only reference vars prefixed with `mock`.
const mockCreateGame = jest.fn(() => new Promise(() => {})); // never resolves -> stays on form
jest.mock('../rummikub/lobbyClient', () => function () { return {createGame: mockCreateGame, joinGame: jest.fn()}; });

function fill() {
  render(<MemoryRouter><CreateGameForm /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText(/username/i), {target: {value: 'me'}});
}

beforeEach(() => mockCreateGame.mockClear());

test('defaults to Classic and creates with chaos=false', () => {
  fill();
  fireEvent.click(screen.getByRole('button', {name: /^create/i}));
  expect(mockCreateGame).toHaveBeenCalledWith(expect.anything(), expect.anything(), false);
});

test('selecting Chaos reveals the intro and creates with chaos=true', () => {
  fill();
  fireEvent.click(screen.getByRole('button', {name: /chaos/i}));
  expect(screen.getByText(/what.?s new|ability cards/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: /^create/i}));
  expect(mockCreateGame).toHaveBeenCalledWith(expect.anything(), expect.anything(), true);
});
