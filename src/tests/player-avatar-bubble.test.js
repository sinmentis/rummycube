import React from 'react';
import {render, cleanup} from '@testing-library/react';
import PlayerAvatarWithTimer from '../rummikub/components/PlayerAvatar';

// PlayerAvatar renders a ChatBubble inside the .avatar circle when a `bubble`
// prop is supplied, on the side given by `bubbleSide`. No bubble prop -> nothing.

afterEach(cleanup);

test('renders a chat bubble on the avatar when a bubble is supplied', () => {
  const {container} = render(
    <PlayerAvatarWithTimer name="Al" matchId="m1" seatId={0} tiles={5}
      isActive={false} isConnected={true} showTurnTimer={false} totalTime={30000}
      bubble={{id: 7, text: 'your turn!', leaving: false}} bubbleSide="right"/>
  );
  const bubble = container.querySelector('.chat-bubble');
  expect(bubble).toBeInTheDocument();
  expect(bubble).toHaveClass('chat-bubble-right');
  expect(bubble).toHaveTextContent('your turn!');
  // bubble lives inside the avatar circle
  expect(container.querySelector('.avatar .chat-bubble')).toBeInTheDocument();
});

test('renders no bubble when bubble is null', () => {
  const {container} = render(
    <PlayerAvatarWithTimer name="Al" matchId="m1" seatId={0} tiles={5}
      isActive={false} isConnected={true} showTurnTimer={false} totalTime={30000} bubble={null}/>
  );
  expect(container.querySelector('.chat-bubble')).toBeNull();
});
