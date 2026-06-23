import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import ChatPanel from '../rummikub/components/ChatPanel';

// S2-U8: on narrow screens the always-on chat folds to a tappable FAB. jsdom
// can't evaluate real media queries, so we exercise the open/closed *state*
// instead: a FAB/toggle button must exist, toggle an `open` class on the
// chat root, and the panel's messages must still render when open. Desktop
// (always-on) behaviour is driven by chat.css media queries, not state.

const messages = [
    {id: 'm1', sender: '1', payload: {text: 'hello there'}},
    {id: 'm2', sender: '0', payload: {text: 'hi back'}},
];

const baseProps = {
    chatMessages: messages,
    sendChatMessage: jest.fn(),
    matchData: [{id: 0, name: 'Me'}, {id: 1, name: 'Them'}],
    matchID: 'ROOM1',
    playerID: '0',
};

function root(container) {
    return container.querySelector('.chat-root');
}

test('renders a FAB toggle button and starts collapsed', () => {
    const {container} = render(<ChatPanel {...baseProps} />);
    const fab = screen.getByRole('button', {name: /open chat/i});
    expect(fab).toHaveClass('chat-fab');
    expect(root(container)).not.toHaveClass('open');
});

test('tapping the FAB toggles the open class on the chat root', () => {
    const {container} = render(<ChatPanel {...baseProps} />);
    const fab = screen.getByRole('button', {name: /open chat/i});

    fireEvent.click(fab);
    expect(root(container)).toHaveClass('open');

    fireEvent.click(fab);
    expect(root(container)).not.toHaveClass('open');
});

test('messages still render when the panel is open', () => {
    const {container} = render(<ChatPanel {...baseProps} />);
    fireEvent.click(screen.getByRole('button', {name: /open chat/i}));

    expect(root(container)).toHaveClass('open');
    expect(screen.getByText('hello there')).toBeInTheDocument();
    expect(screen.getByText('hi back')).toBeInTheDocument();
});

test('close affordance collapses the open panel again', () => {
    const {container} = render(<ChatPanel {...baseProps} />);
    fireEvent.click(screen.getByRole('button', {name: /open chat/i}));
    expect(root(container)).toHaveClass('open');

    fireEvent.click(screen.getByRole('button', {name: /close chat/i}));
    expect(root(container)).not.toHaveClass('open');
});
