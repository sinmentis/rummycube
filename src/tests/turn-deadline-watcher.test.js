import React from 'react';
import {render, act} from '@testing-library/react';
import TurnDeadlineWatcher from '../rummikub/components/TurnDeadlineWatcher';

beforeEach(() => jest.useFakeTimers());           // modern fake timers also mock Date, so getSecTs() advances
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

const now = () => Date.now();                      // equals new Date().getTime() under fake timers

test('normal path: no fire before deadline+slack, fires shortly after, then throttled', () => {
  const onTimeout = jest.fn();
  const expireAt = now() + 1000;                   // deadline 1000; threshold = 1500; first eligible tick = 1600
  render(<TurnDeadlineWatcher timerExpireAt={expireAt} onTimeout={onTimeout}/>);
  act(() => jest.advanceTimersByTime(1200));       // past deadline, before threshold -> ticks 400/800/1200, no fire
  expect(onTimeout).toHaveBeenCalledTimes(0);
  act(() => jest.advanceTimersByTime(600));         // clock 1800 -> tick 1600 fires
  expect(onTimeout).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1000));        // clock 2800 -> ticks 2000/2400/2800 all within 1500ms throttle
  expect(onTimeout).toHaveBeenCalledTimes(1);
});

test('client-ahead skew: keeps retrying when onTimeout has no effect', () => {
  const onTimeout = jest.fn();                      // no effect -> server keeps rejecting, timerExpireAt unchanged
  const expireAt = now() + 1000;
  render(<TurnDeadlineWatcher timerExpireAt={expireAt} onTimeout={onTimeout}/>);
  act(() => jest.advanceTimersByTime(5200));        // fires at ticks ~1600, ~3200, ~4800
  expect(onTimeout.mock.calls.length).toBeGreaterThanOrEqual(3);
});

test('timerExpireAt change re-arms and clears the old throttle', () => {
  const onTimeout = jest.fn();
  const t1 = now() + 1000;
  const {rerender} = render(<TurnDeadlineWatcher timerExpireAt={t1} onTimeout={onTimeout}/>);
  act(() => jest.advanceTimersByTime(1800));        // fires once for t1 (tick 1600)
  expect(onTimeout).toHaveBeenCalledTimes(1);
  const t2 = now() + 1000;                           // clock now ~1800 -> t2 ~2800, threshold ~3300
  rerender(<TurnDeadlineWatcher timerExpireAt={t2} onTimeout={onTimeout}/>);
  act(() => jest.advanceTimersByTime(600));          // clock ~2400, before t2 threshold -> no new fire
  expect(onTimeout).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1200));         // clock ~3600, past t2 threshold -> fires again (throttle reset)
  expect(onTimeout).toHaveBeenCalledTimes(2);
});

test('null deadline never fires', () => {
  const onTimeout = jest.fn();
  render(<TurnDeadlineWatcher timerExpireAt={null} onTimeout={onTimeout}/>);
  act(() => jest.advanceTimersByTime(5000));
  expect(onTimeout).toHaveBeenCalledTimes(0);
});
