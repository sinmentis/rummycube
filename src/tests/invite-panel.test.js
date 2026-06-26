import React from 'react';
import {render, screen, fireEvent, act} from '@testing-library/react';
import Sidebar from '../rummikub/components/Sidebar';
import {copyToClipboard} from '../rummikub/components/domUtil';

// S2-U10: invite panel polish. The panel shows a warm relabeled header, a
// prominent room code, and a large Copy-link button while waiting for players
// (!allJoined). Copy behaviour and the visibility condition must stay
// identical: it copies `${origin}/join-match/${matchID}` and flashes "Copied!"
// for ~1.5s, and only renders while waiting.
jest.mock('../rummikub/components/domUtil', () => ({
    copyToClipboard: jest.fn(),
}));

const baseProps = {
    tilesOnPool: 42,
    matchData: [{name: 'Alice'}, {}],
    matchID: 'ROOM7',
    gameover: false,
    allJoined: false,
};

beforeEach(() => {
    jest.useFakeTimers();
    copyToClipboard.mockClear();
});

afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
});

test('shows the relabeled invite header, room code and copy button while waiting', () => {
    render(<Sidebar {...baseProps} />);

    expect(screen.getByText(/need more players\?/i)).toBeInTheDocument();
    expect(screen.getByText(/share this room/i)).toBeInTheDocument();
    expect(screen.getByText('ROOM7')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /copy link/i})).toBeInTheDocument();
});

test('copy button copies the join link and flashes Copied! for ~1.5s', () => {
    render(<Sidebar {...baseProps} />);

    const button = screen.getByRole('button', {name: /copy link/i});
    fireEvent.click(button);

    expect(copyToClipboard).toHaveBeenCalledWith(
        `${window.location.origin}/join-match/ROOM7`,
    );
    expect(screen.getByRole('button', {name: /copied!/i})).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1500));
    expect(screen.getByRole('button', {name: /copy link/i})).toBeInTheDocument();
});

test('clicking the room code also copies the join link', () => {
    render(<Sidebar {...baseProps} />);

    fireEvent.click(screen.getByText('ROOM7'));
    expect(copyToClipboard).toHaveBeenCalledWith(
        `${window.location.origin}/join-match/ROOM7`,
    );
});

test('the invite panel is hidden once all players have joined', () => {
    render(<Sidebar {...baseProps} allJoined={true} />);

    expect(screen.queryByText(/need more players\?/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /copy link/i})).not.toBeInTheDocument();
});
