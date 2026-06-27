import {renderHook, act} from '@testing-library/react';
import {useChatBubbles} from '../rummikub/hooks/useChatBubbles';

// useChatBubbles turns boardgame.io's append-only chat log into a transient
// per-seat "speech bubble" map. Only text messages that ARRIVE after mount
// bubble (history present at mount is skipped so a reconnect replay can't storm
// the table); the latest message per seat replaces the previous one and resets a
// 5s TTL, after which the bubble goes `leaving` for 200ms and is removed.

const txt = (id, sender, text) => ({id, sender, payload: {text}});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup(initial = []) {
  return renderHook(({messages}) => useChatBubbles(messages, {ttlMs: 5000}), {
    initialProps: {messages: initial},
  });
}

test('history already present at mount produces no bubbles (no reconnect storm)', () => {
  const {result} = setup([txt(1, '0', 'old')]);
  expect(result.current).toEqual({});
});

test('a new text message creates a bubble for its sender', () => {
  const {result, rerender} = setup([]);
  rerender({messages: [txt(1, '0', 'hi')]});
  expect(result.current['0']).toMatchObject({id: 1, text: 'hi', leaving: false});
});

test('a typing ping (no text payload) is ignored', () => {
  const {result, rerender} = setup([]);
  rerender({messages: [{id: 1, sender: '0', payload: {typing: true, ts: Date.now()}}]});
  expect(result.current).toEqual({});
});

test('a second message from the same seat replaces the first (latest wins)', () => {
  const {result, rerender} = setup([]);
  rerender({messages: [txt(1, '0', 'hi')]});
  rerender({messages: [txt(1, '0', 'hi'), txt(2, '0', 'gg')]});
  expect(result.current['0']).toMatchObject({id: 2, text: 'gg'});
  expect(Object.keys(result.current)).toEqual(['0']);
});

test('after the TTL the bubble goes leaving, then is removed', () => {
  const {result, rerender} = setup([]);
  rerender({messages: [txt(1, '0', 'hi')]});
  expect(result.current['0'].leaving).toBe(false);
  act(() => { jest.advanceTimersByTime(5000); });
  expect(result.current['0'].leaving).toBe(true);
  act(() => { jest.advanceTimersByTime(200); });
  expect(result.current['0']).toBeUndefined();
});
