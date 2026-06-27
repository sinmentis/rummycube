import React from 'react';
import {render, cleanup} from '@testing-library/react';
import ChatBubble from '../rummikub/components/ChatBubble';

// ChatBubble is the presentational speech bubble. Outer .chat-bubble positions
// (per side); inner .chat-bubble-box is the visible, animated box. It is a
// decorative echo of the chat box, so it is aria-hidden.

afterEach(cleanup);

test('renders the text in a side-positioned, aria-hidden bubble', () => {
  const {container} = render(<ChatBubble text="good game" side="left" leaving={false}/>);
  const root = container.querySelector('.chat-bubble');
  expect(root).toBeInTheDocument();
  expect(root).toHaveClass('chat-bubble-left');
  expect(root).not.toHaveClass('leaving');
  expect(root).toHaveAttribute('aria-hidden', 'true');
  expect(root).toHaveTextContent('good game');
  expect(container.querySelector('.chat-bubble-box')).toBeInTheDocument();
});

test('applies the leaving class for the fade-out', () => {
  const {container} = render(<ChatBubble text="hi" side="up" leaving={true}/>);
  expect(container.querySelector('.chat-bubble')).toHaveClass('leaving');
});

test('defaults to side=up', () => {
  const {container} = render(<ChatBubble text="hi"/>);
  expect(container.querySelector('.chat-bubble')).toHaveClass('chat-bubble-up');
});
