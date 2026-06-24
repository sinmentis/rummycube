import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import {MemoryRouter, useLocation} from 'react-router-dom';
import ExitButton from '../rummikub/components/ExitButton';

// The Exit button lives in the always-mounted global navbar. It must only show
// while the user is inside a match (path starts with /match/) and a single,
// non-destructive click must take them home WITHOUT wiping their seat creds, so
// they can rejoin. We assert the real router behaviour via a useLocation probe.

function LocationProbe() {
    const {pathname} = useLocation();
    return <div data-testid="pathname">{pathname}</div>;
}

function renderAt(path) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <ExitButton/>
            <LocationProbe/>
        </MemoryRouter>
    );
}

afterEach(() => localStorage.clear());

test('renders the Exit button on a /match/ route', () => {
    renderAt('/match/m1');
    expect(screen.getByRole('button', {name: 'Exit'})).toBeInTheDocument();
});

test('does not render outside a match route', () => {
    renderAt('/');
    expect(screen.queryByRole('button', {name: 'Exit'})).not.toBeInTheDocument();
});

test('a single click navigates home and keeps the seat creds', () => {
    localStorage.setItem('rummycube:match:m1', JSON.stringify({creds: 'tok'}));
    renderAt('/match/m1');

    fireEvent.click(screen.getByRole('button', {name: 'Exit'}));

    expect(screen.getByTestId('pathname').textContent).toBe('/');
    // non-destructive: creds survive so the player can rejoin from home
    expect(localStorage.getItem('rummycube:match:m1')).not.toBeNull();
});
