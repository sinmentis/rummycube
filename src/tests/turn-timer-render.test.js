import React from 'react';
import { render, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import GridContainer from '../rummikub/components/GridContainer';
import PlayerAvatarWithTimer from '../rummikub/components/PlayerAvatar';
import TurnDeadlineWatcher from '../rummikub/components/TurnDeadlineWatcher';
import * as dndUtil from '../rummikub/dndUtil';
import { getSecTs, buildTileObj } from '../rummikub/util';
import { COLOR } from '../rummikub/constants';

// WS-4 / U13: the 400ms turn-timer tick must re-render ONLY the active avatar's
// subtree, never Board / GridContainer (the ~330-cell tile tree). The countdown
// now lives inside PlayerAvatar (its own useCountdown) and the deadline/timeout
// firing lives in a null-rendering TurnDeadlineWatcher.
//
// Render counting: every GridSlot render calls dndUtil.makeSlotId(gridId,col,row).
// Spying on it lets us count tile-tree renders without instrumenting production.

const t1 = buildTileObj(5, COLOR.red, 0);
const t2 = buildTileObj(7, COLOR.blue, 0);
const tiles2dArray = [[t1, t2, null, null, null, null]];

function Grid() {
  return (
    <GridContainer
      tiles2dArray={tiles2dArray}
      rows={1}
      cols={6}
      canDnD={true}
      gridId="board"
      validTiles={[]}
      highlightTiles={false}
      selectedTiles={[]}
      moveTiles={() => {}}
      onTileDragEnd={() => {}}
      onLongPress={() => {}}
      handleTileSelection={() => {}}
      hoverPosition={null}
      setHoverPosition={() => {}}
      newlyAdded={[]}
    />
  );
}

// A minimal stand-in for Board: a parent that renders the heavy tile tree
// alongside the active avatar (with its own countdown) and the deadline watcher.
// The parent itself holds no timer state, so a tick must not re-render it.
function Harness({ timerExpireAt, totalTime, onTimeout }) {
  return (
    <DndContext>
      <Grid />
      <PlayerAvatarWithTimer
        isActive={true}
        showTurnTimer={true}
        name="P0"
        matchId="m1"
        seatId={0}
        tiles={3}
        isConnected={true}
        timerExpireAt={timerExpireAt}
        totalTime={totalTime}
      />
      <TurnDeadlineWatcher timerExpireAt={timerExpireAt} onTimeout={onTimeout} />
    </DndContext>
  );
}

describe('U13 turn timer extraction', () => {
  let slotSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    slotSpy = jest.spyOn(dndUtil, 'makeSlotId');
  });

  afterEach(() => {
    slotSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('a timer tick does NOT re-render GridContainer (tile tree)', () => {
    const totalTime = 10000;
    const timerExpireAt = getSecTs() + 5000;
    const { container } = render(
      <Harness timerExpireAt={timerExpireAt} totalTime={totalTime} onTimeout={() => {}} />
    );

    const slotCallsAfterMount = slotSpy.mock.calls.length;
    const ring = container.querySelector('.timer-circle');
    const offsetBefore = ring.getAttribute('stroke-dashoffset');

    act(() => {
      jest.advanceTimersByTime(400);
    });

    // The tile tree must not re-render on a tick.
    expect(slotSpy.mock.calls.length).toBe(slotCallsAfterMount);

    // The active avatar's ring DOES update as time elapses.
    const offsetAfter = container.querySelector('.timer-circle').getAttribute('stroke-dashoffset');
    expect(offsetAfter).not.toBe(offsetBefore);
  });

  // WS-F: the watcher no longer fires once at the raw deadline. It waits
  // FIRE_SLACK_MS past the deadline (so a client running slightly ahead does not
  // pre-fire) and then RETRIES every REFIRE_INTERVAL_MS, because a nudge can be
  // rejected by the server's deadline guard under clock skew. Advances are on the
  // 400ms tick grid: deadline 1000 + 500 slack = 1500 threshold, first tick >=
  // threshold is 1600. The single-fire/throttle details are covered exhaustively
  // in turn-deadline-watcher.test.js.
  test('TurnDeadlineWatcher fires after deadline+slack, then retries while still past the deadline', () => {
    const onTimeout = jest.fn();
    const timerExpireAt = getSecTs() + 1000; // deadline 1000; threshold 1500; first eligible tick 1600

    render(
      <TurnDeadlineWatcher timerExpireAt={timerExpireAt} onTimeout={onTimeout} />
    );

    // Past the deadline but before deadline+slack: no pre-firing on skew.
    act(() => {
      jest.advanceTimersByTime(1200); // ticks 400/800/1200 -> still before the 1500 threshold
    });
    expect(onTimeout).not.toHaveBeenCalled();

    // Just past deadline+slack: first fire.
    act(() => {
      jest.advanceTimersByTime(600); // clock 1800 -> tick 1600 fires
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);

    // A rejected nudge (timerExpireAt unchanged) is retried, not latched.
    act(() => {
      jest.advanceTimersByTime(3400); // clock 5200 -> further fires at ticks ~3200, ~4800
    });
    expect(onTimeout.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('TurnDeadlineWatcher does nothing when there is no deadline', () => {
    const onTimeout = jest.fn();
    render(<TurnDeadlineWatcher timerExpireAt={null} onTimeout={onTimeout} />);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  test('a non-active avatar does not render the timer ring', () => {
    const { container } = render(
      <PlayerAvatarWithTimer
        isActive={false}
        showTurnTimer={true}
        name="P1"
        matchId="m1"
        seatId={1}
        tiles={5}
        isConnected={true}
        timerExpireAt={getSecTs() + 5000}
        totalTime={10000}
      />
    );
    expect(container.querySelector('.timer-circle')).toBeNull();
  });
});
