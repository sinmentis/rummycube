import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import {MemoryRouter, useLocation} from 'react-router-dom';

// canvas-confetti is a pure visual side effect irrelevant to this behaviour and
// would touch the canvas/RAF; stub it so the modal mounts cleanly in jsdom.
jest.mock('canvas-confetti', () => jest.fn());

import GameOverModal from '../rummikub/components/GameOverModal';

function LocationProbe() {
    const {pathname} = useLocation();
    return <div data-testid="pathname">{pathname}</div>;
}

const baseProps = {
    gameover: {winner: '0', points: {0: 30, 1: 12}},
    matchId: 'm1',
    playerID: '0',
    matchData: [{id: 0, name: 'Alice'}, {id: 1, name: 'Bob'}],
};

function renderModal() {
    return render(
        <MemoryRouter initialEntries={['/match/m1']}>
            <GameOverModal {...baseProps}/>
            <LocationProbe/>
        </MemoryRouter>
    );
}

afterEach(() => localStorage.clear());

test('shows a Back to home button', () => {
    renderModal();
    expect(screen.getByRole('button', {name: 'Back to home'})).toBeInTheDocument();
});

test('Back to home clears this match seat creds and navigates home', () => {
    localStorage.setItem('rummycube:match:m1', JSON.stringify({creds: 'tok'}));
    renderModal();

    expect(screen.getByTestId('pathname').textContent).toBe('/match/m1');

    fireEvent.click(screen.getByRole('button', {name: 'Back to home'}));

    // game is over: no auto-rejoin, so this match's creds are cleared
    expect(localStorage.getItem('rummycube:match:m1')).toBeNull();
    expect(screen.getByTestId('pathname').textContent).toBe('/');
});
