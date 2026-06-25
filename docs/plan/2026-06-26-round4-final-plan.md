# RummyCube Round-4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two real bugs (insert-push "leave a gap", countdown stuck-at-0) and land four feel/UX polish items (progressive long-press pickup, lift-on-select animation, grab cursor, board-only softer drop cue).

**Architecture:** All changes are client-side or pure-geometry; the boardgame.io server stays the sole authority and its `forceEndTurn` deadline guard / move ownership checks are untouched. WS-E changes one geometry function (`insertWithPush`) that BOTH the client drag preview and the server `insertTilesWithPush` move call, so a single edit fixes both consistently. WS-F rewrites a null-rendering watcher to retry instead of firing once.

**Tech Stack:** React 18 + Vite, @dnd-kit, boardgame.io 0.50, Jest + React Testing Library (jsdom), pure JS modules.

**Source docs:** spec `docs/optimization/2026-06-25-round4-spec.md`; expert reports `docs/optimization/2026-06-25-round4-review-1-game-design.md` (WS-E rule + TDD case table) and `…-review-2-frontend.md` (verified signatures + backbone code).

## Global Constraints

- The server is the sole authority. Do NOT change `moves.js` `forceEndTurn` deadline guard, move `playerID===ctx.currentPlayer` checks, or any board-validity logic. WS-E edits geometry only; WS-F edits the client watcher only.
- `insertPush.js` keeps its contract: geometric only, never reads tile values/colours.
- Every animation/transform is gated under `@media (prefers-reduced-motion: no-preference)` and keeps a non-motion second channel (border/background) so the state is still distinguishable with motion off.
- Code, comments, identifiers, test names, and commit messages are English. Conventional Commits. Append trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` to every commit.
- After each task: the full `npx jest` suite stays green; `npm run build` succeeds with NO new `console.log`; `node src/server.js` boots and `/games` returns `["RummyCube"]`.
- Constants are tuning levers, exact values below: `LONG_PRESS_MS=250`, `LONG_PRESS_STEP_MS=250` (game-design suggested ~180 for steps 2+; keep 250 per owner, leave a tunable comment), lift `translateY(-6px) scale(1.04)`, `FIRE_SLACK_MS=500`, `REFIRE_INTERVAL_MS=1500`, watcher `TICK_MS=400`. Board grid `maxCol` INCLUSIVE `31`; dispatch `boardCols` EXCLUSIVE `32`. `BOARD_GRID_ID='b'`, `HAND_GRID_ID='h'`.

**Recommended order:** T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. Serial hotspots: `Tile.jsx` (T5→T6→T7), `board.css` (T6→T8), `dndUtil.js` depends on `insertPush.js` (T2 after T1), Board accumulation depends on `tilesRightward` (T5 after T4).

---

### Task T1: WS-E geometry — `insertWithPush` bridge (leave a 1-col separator)

**Files:**
- Modify: `src/rummikub/insertPush.js` (the `free` short-circuit ~`:17-23`; add `openSeparatorRight` helper)
- Test: `src/tests/insert-push.test.js` (extend; keep all existing cases green)

**Interfaces:**
- Consumes: existing `insertWithPush(rowTiles, T, N, maxCol)` returning `{shifts:{tileId:newCol}, newCols:number[]} | null`.
- Produces: same signature; new behavior when the dropped span plugs the only gap between two runs.

**Background:** Board `123_456` (cols `0,1,2 | gap3 | 4,5,6`), drop `4`@T=3 currently takes the `free` short-circuit → `{shifts:{}, newCols:[3]}` → cols `0..6` all occupied → parsed as ONE invalid run `1234456`. Fix: when `occ.has(T-1) && occ.has(T+N)` (the span bridges a left AND a right run), re-open a 1-col separator by rippling the right run one column right (stop at first gap). No room → `null` (caller rejects); NEVER fall back to the plain free placement.

- [ ] **Step 1: Write the failing tests**

Add to `src/tests/insert-push.test.js` (use the existing import of `insertWithPush`):

```js
describe('WS-E bridge: leave a 1-col separator', () => {
  const row = (pairs) => pairs.map(([tileId, col]) => ({tileId, col}));

  test('owner case 123_456 drop @gap pushes right run, opens separator', () => {
    const rt = row([['a',0],['b',1],['c',2],['d',4],['e',5],['f',6]]);
    expect(insertWithPush(rt, 3, 1, 31))
      .toEqual({shifts: {d:5, e:6, f:7}, newCols: [3]});
  });

  test('multi-tile span bridging a 2-wide-needed boundary', () => {
    const rt = row([['a',0],['b',1],['c',2],['g',5],['h',6],['i',7]]);
    expect(insertWithPush(rt, 3, 2, 31))
      .toEqual({shifts: {g:6, h:7, i:8}, newCols: [3,4]});
  });

  test('ripple stops at an inner gap', () => {
    const rt = row([['a',24],['b',25],['c',26],['d',28],['e',29],['f',31]]);
    expect(insertWithPush(rt, 27, 1, 31))
      .toEqual({shifts: {d:29, e:30}, newCols: [27]});
  });

  test('no room at right wall returns null (caller rejects)', () => {
    const rt = row([['a',25],['b',26],['c',27],['d',29],['e',30],['f',31]]);
    expect(insertWithPush(rt, 28, 1, 31)).toBeNull();
  });

  test('NOT a bridge: T+N free with a 2-wide gap, plain placement', () => {
    const rt = row([['a',0],['b',1],['c',2],['d',5],['e',6],['f',7]]);
    expect(insertWithPush(rt, 3, 1, 31)).toEqual({shifts: {}, newCols: [3]});
  });

  test('NOT a bridge: append left of a run (left neighbour empty)', () => {
    const rt = row([['b',1],['c',2],['d',3]]);
    expect(insertWithPush(rt, 0, 1, 31)).toEqual({shifts: {}, newCols: [0]});
  });

  test('NOT a bridge: append right of a run (right neighbour empty)', () => {
    const rt = row([['a',0],['b',1],['c',2]]);
    expect(insertWithPush(rt, 3, 1, 31)).toEqual({shifts: {}, newCols: [3]});
  });

  test('within-run insert (occupied target) unchanged, stays contiguous', () => {
    const rt = row([['a',0],['b',1],['c',2],['e',3]]);
    expect(insertWithPush(rt, 3, 1, 31)).toEqual({shifts: {e:4}, newCols: [3]});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/tests/insert-push.test.js -t "WS-E bridge"`
Expected: FAIL — the owner case returns `{shifts:{}, newCols:[3]}` (no push) instead of pushing `d,e,f`.

- [ ] **Step 3: Implement the bridge branch**

In `src/rummikub/insertPush.js`, replace the `free` short-circuit body so a bridging free span re-opens a separator. The current code is:

```js
  let free = true;
  for (let c = T; c < T + N; c++) if (occ.has(c)) { free = false; break; }
  if (free) return {shifts: {}, newCols: cols(T, N)};
  return tryRight(asc, T, N, maxCol) || tryLeft(asc, T, N, maxCol);
}
```

Change it to:

```js
  let free = true;
  for (let c = T; c < T + N; c++) if (occ.has(c)) { free = false; break; }
  if (free) {
    // WS-E bridge: the dropped block fills the ONLY gap between a left and a
    // right run (both immediate neighbours occupied). A plain free placement
    // would fuse them into one (illegal) contiguous sequence, so re-open a
    // 1-col separator by rippling the right run one column right (stop at the
    // first gap). No room -> null, which the dispatch turns into a reject;
    // NEVER fall back to the plain free placement (that is the original bug).
    if (occ.has(T - 1) && occ.has(T + N)) {
      const shifts = openSeparatorRight(asc, T + N, maxCol);
      return shifts === null ? null : {shifts, newCols: cols(T, N)};
    }
    return {shifts: {}, newCols: cols(T, N)};
  }
  return tryRight(asc, T, N, maxCol) || tryLeft(asc, T, N, maxCol);
}

// Vacate column G by cascading the contiguous occupied run starting at G one
// column right, stopping at the first gap. Returns the shift map, or null if a
// tile would pass maxCol (INCLUSIVE). Same ripple shape as tryRight.
function openSeparatorRight(asc, G, maxCol) {
  const shifts = {}; let cursor = G + 1;
  for (const {tileId, col} of asc) {
    if (col < G) continue;
    if (col < cursor) { if (cursor > maxCol) return null; shifts[tileId] = cursor; cursor += 1; }
    else break;
  }
  return shifts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/tests/insert-push.test.js`
Expected: PASS — the new `WS-E bridge` block AND all pre-existing `insert-push` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/insertPush.js src/tests/insert-push.test.js
git commit -m "fix(board): insert into a group boundary keeps a 1-col separator

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T2: WS-E routing — `resolveDropDispatch` bridge branch

**Files:**
- Modify: `src/rummikub/dndUtil.js` (`resolveDropDispatch` push predicate ~`:222-229`)
- Test: `src/tests/resolve-drop-dispatch.test.js` (extend; keep existing green)

**Interfaces:**
- Consumes: `insertWithPush` (T1, now bridge-aware); existing `isRunFree`, `boardRowTiles`, `buildRowOccupancy`, `orderTilesBySource`, `BOARD_GRID_ID`, `boardCols=32`.
- Produces: `resolveDropDispatch(...) → {kind:'joker'|'push'|'snap'|'reject', args}` — now routes a free in-bounds span whose left AND right neighbours are occupied to `push` (so `insertWithPush` opens the separator), and to `reject` when `insertWithPush` returns null.

**Background:** Today push fires only when the target run is occupied (`occupiedInRun`). A bridging drop has a FREE target (`runIsFree` true) so it currently routes to `snap` (plain placement) — reproducing the bug. Add a `bridge` term. The occupancy source already excludes the dragged `sel` on BOTH sides (`buildRowOccupancy` and `boardRowTiles` both drop `sel`), so `isOccupied(T-1)&&isOccupied(T+N)` (dispatch) and `occ.has(T-1)&&occ.has(T+N)` (geometry) are identical — no split-brain.

- [ ] **Step 1: Write the failing tests**

Add to `src/tests/resolve-drop-dispatch.test.js`, mirroring the existing harness in that file (reuse its `tilePositions` builders). Cover the routing table:

```js
describe('WS-E bridge routing', () => {
  // 123_456 on board row 0: a0 b1 c2  gap3  d4 e5 f6 ; drop one HAND tile z @ col 3
  test('bridge free target routes to push', () => {
    const tp = {
      a:{gridId:'b',row:0,col:0}, b:{gridId:'b',row:0,col:1}, c:{gridId:'b',row:0,col:2},
      d:{gridId:'b',row:0,col:4}, e:{gridId:'b',row:0,col:5}, f:{gridId:'b',row:0,col:6},
      z:{gridId:'h',row:0,col:0,playerID:'0'},
    };
    const out = resolveDropDispatch({
      tilePositions: tp, cell: {gridId:'b', col:3, row:0},
      primaryId: 'z', selection: ['z'], draggedTileId: 'z', allowJokerSwap: true,
    });
    expect(out.kind).toBe('push');
  });

  test('bridge with no room at the right wall routes to reject', () => {
    const tp = {
      a:{gridId:'b',row:0,col:25}, b:{gridId:'b',row:0,col:26}, c:{gridId:'b',row:0,col:27},
      d:{gridId:'b',row:0,col:29}, e:{gridId:'b',row:0,col:30}, f:{gridId:'b',row:0,col:31},
      z:{gridId:'h',row:0,col:0,playerID:'0'},
    };
    const out = resolveDropDispatch({
      tilePositions: tp, cell: {gridId:'b', col:28, row:0},
      primaryId: 'z', selection: ['z'], draggedTileId: 'z', allowJokerSwap: true,
    });
    expect(out.kind).toBe('reject');
  });

  test('free non-bridge target (2-wide gap) still snaps', () => {
    const tp = {
      a:{gridId:'b',row:0,col:0}, b:{gridId:'b',row:0,col:1}, c:{gridId:'b',row:0,col:2},
      d:{gridId:'b',row:0,col:5}, e:{gridId:'b',row:0,col:6}, f:{gridId:'b',row:0,col:7},
      z:{gridId:'h',row:0,col:0,playerID:'0'},
    };
    const out = resolveDropDispatch({
      tilePositions: tp, cell: {gridId:'b', col:3, row:0},
      primaryId: 'z', selection: ['z'], draggedTileId: 'z', allowJokerSwap: true,
    });
    expect(out.kind).toBe('snap');
  });

  test('hand grid never bridges (board-only guard)', () => {
    const tp = {
      a:{gridId:'h',row:0,col:0,playerID:'0'}, b:{gridId:'h',row:0,col:1,playerID:'0'},
      c:{gridId:'h',row:0,col:3,playerID:'0'}, d:{gridId:'h',row:0,col:4,playerID:'0'},
      z:{gridId:'h',row:0,col:9,playerID:'0'},
    };
    const out = resolveDropDispatch({
      tilePositions: tp, cell: {gridId:'h', col:2, row:0},
      primaryId: 'z', selection: ['z'], draggedTileId: 'z', allowJokerSwap: true,
    });
    expect(out.kind).toBe('snap');
  });
});
```

> If `resolveDropDispatch`'s parameter shape in the existing file differs (e.g. positional args), match the existing tests in `resolve-drop-dispatch.test.js` exactly — read them first and copy their call style. The assertions on `out.kind` are what matter.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/tests/resolve-drop-dispatch.test.js -t "WS-E bridge routing"`
Expected: FAIL — the bridge case returns `snap` (and the no-room case returns `snap`) because the push predicate doesn't yet consider bridges.

- [ ] **Step 3: Implement the bridge term**

In `src/rummikub/dndUtil.js` `resolveDropDispatch`, locate the push decision (currently roughly):

```js
  const inBounds = col >= 0 && col + N <= maxCols;
  const runIsFree = inBounds && isRunFree(isOccupied, col, N, row, maxCols);
  const occupiedInRun = inBounds && !runIsFree;
  if (isBoard && occupiedInRun) {
    const rowTiles = boardRowTiles(tilePositions, row, sel);
    const plan = insertWithPush(rowTiles, col, N, boardCols - 1);
    if (!plan) return {kind: 'reject', args: []};
    return {kind: 'push', args: [col, row, BOARD_GRID_ID, {id: primaryId}, orderTilesBySource(sel, tilePositions)]};
  }
```

Add the `bridge` term and widen the guard:

```js
  const inBounds = col >= 0 && col + N <= maxCols;
  const runIsFree = inBounds && isRunFree(isOccupied, col, N, row, maxCols);
  const occupiedInRun = inBounds && !runIsFree;
  // WS-E: a free in-bounds span whose immediate left AND right neighbours are
  // both occupied is plugging the only gap between two runs -> route to push so
  // insertWithPush re-opens a 1-col separator instead of fusing them.
  const bridge = isBoard && runIsFree && isOccupied(col - 1, row) && isOccupied(col + N, row);
  if (isBoard && (occupiedInRun || bridge)) {
    const rowTiles = boardRowTiles(tilePositions, row, sel);
    const plan = insertWithPush(rowTiles, col, N, boardCols - 1);
    if (!plan) return {kind: 'reject', args: []};
    return {kind: 'push', args: [col, row, BOARD_GRID_ID, {id: primaryId}, orderTilesBySource(sel, tilePositions)]};
  }
```

> Keep the rest of `resolveDropDispatch` (joker precedence, snap, reject) byte-identical. `isOccupied` is the `buildRowOccupancy` closure already in scope; it excludes `sel`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/tests/resolve-drop-dispatch.test.js`
Expected: PASS — new `WS-E bridge routing` cases plus all pre-existing routing cases green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/dndUtil.js src/tests/resolve-drop-dispatch.test.js
git commit -m "fix(board): route boundary-gap drops through push so the separator opens

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T3: WS-F — `TurnDeadlineWatcher` retry + slack (countdown stuck-at-0)

**Files:**
- Modify: `src/rummikub/components/TurnDeadlineWatcher.jsx` (replace component body)
- Test: Create `src/tests/turn-deadline-watcher.test.js`; Modify `src/tests/turn-timer-render.test.js` (migrate the now-obsolete single-fire case — see R-F1)

**Interfaces:**
- Consumes: `getSecTs()` (ms), prop `timerExpireAt` (absolute ms) + `onTimeout` (fires `moves.forceEndTurn()` in Board). Server guard `forceEndTurn`: `if (!G.timerExpireAt || getSecTs() < G.timerExpireAt) return INVALID_MOVE` — UNCHANGED.
- Produces: a watcher that fires `onTimeout` once the local clock is `FIRE_SLACK_MS` past the deadline, then RE-fires every `REFIRE_INTERVAL_MS` while still past the (unchanged) deadline, and re-arms when `timerExpireAt` changes.

**Background:** Server on the VM, browser on the laptop → different wall clocks. The old watcher fired once then latched (`firedRef`+`clearInterval`); when the laptop clock ran ahead, that single `forceEndTurn` was rejected by the server's deadline guard and never retried → stuck at 0. Retry + slack makes an honest client keep nudging until the server accepts; duplicate nudges that land on an already-advanced turn are rejected pre-deadline (harmless).

- [ ] **Step 1: Write the failing tests**

Create `src/tests/turn-deadline-watcher.test.js` (mirror `turn-timer-render.test.js` setup: `jest.useFakeTimers()` also mocks `Date`):

```js
import React from 'react';
import {render, act} from '@testing-library/react';
import TurnDeadlineWatcher from '../rummikub/components/TurnDeadlineWatcher';

const FIRE_SLACK_MS = 500;
const REFIRE_INTERVAL_MS = 1500;

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

const now = () => Date.now();

test('normal path: fires once at deadline + slack, then throttled', () => {
  const onTimeout = jest.fn();
  const expireAt = now() + 1000;
  render(<TurnDeadlineWatcher timerExpireAt={expireAt} onTimeout={onTimeout}/>);
  act(() => jest.advanceTimersByTime(1000));           // at deadline, slack not yet reached
  expect(onTimeout).toHaveBeenCalledTimes(0);
  act(() => jest.advanceTimersByTime(FIRE_SLACK_MS));  // deadline + slack
  expect(onTimeout).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1000));           // within refire throttle window
  expect(onTimeout).toHaveBeenCalledTimes(1);
});

test('client-ahead skew: keeps retrying when onTimeout has no effect', () => {
  const onTimeout = jest.fn();                          // simulate server INVALID_MOVE: turn never advances
  const expireAt = now() + 1000;
  render(<TurnDeadlineWatcher timerExpireAt={expireAt} onTimeout={onTimeout}/>);
  act(() => jest.advanceTimersByTime(1000 + FIRE_SLACK_MS));   // first fire
  act(() => jest.advanceTimersByTime(REFIRE_INTERVAL_MS));     // second fire
  act(() => jest.advanceTimersByTime(REFIRE_INTERVAL_MS));     // third fire
  expect(onTimeout.mock.calls.length).toBeGreaterThanOrEqual(3);
});

test('timerExpireAt change re-arms and clears the old throttle', () => {
  const onTimeout = jest.fn();
  const t1 = now() + 1000;
  const {rerender} = render(<TurnDeadlineWatcher timerExpireAt={t1} onTimeout={onTimeout}/>);
  act(() => jest.advanceTimersByTime(1000 + FIRE_SLACK_MS));   // fires for t1
  const firedForT1 = onTimeout.mock.calls.length;
  const t2 = now() + 1000;                                     // new turn, future deadline
  rerender(<TurnDeadlineWatcher timerExpireAt={t2} onTimeout={onTimeout}/>);
  act(() => jest.advanceTimersByTime(500));                    // before t2 deadline
  expect(onTimeout.mock.calls.length).toBe(firedForT1);        // no premature fire
  act(() => jest.advanceTimersByTime(500 + FIRE_SLACK_MS));    // past t2 + slack
  expect(onTimeout.mock.calls.length).toBe(firedForT1 + 1);
});

test('null deadline never fires', () => {
  const onTimeout = jest.fn();
  render(<TurnDeadlineWatcher timerExpireAt={null} onTimeout={onTimeout}/>);
  act(() => jest.advanceTimersByTime(5000));
  expect(onTimeout).toHaveBeenCalledTimes(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/tests/turn-deadline-watcher.test.js`
Expected: FAIL — current watcher fires immediately at the deadline (no slack) and never refires, so the slack and the retry tests fail.

- [ ] **Step 3: Rewrite the watcher**

Replace the entire body of `src/rummikub/components/TurnDeadlineWatcher.jsx` with:

```js
import {useEffect, useRef} from "react";
import {getSecTs} from "../util";

// Null-rendering watcher that nudges the server-side turn timeout. The server
// `forceEndTurn` deadline guard is the real authority; this just makes an honest
// client end the turn at/after the deadline. It RETRIES (not fire-once) so a
// nudge rejected by the guard — e.g. when the client clock runs ahead of the
// server's — is followed by another until the server accepts and the turn
// advances. Its 400ms ticking renders null, so it never re-renders Board's tiles.
const TICK_MS = 400;
const FIRE_SLACK_MS = 500;          // wait ~500ms past the local deadline before firing,
                                    // so a client running slightly ahead doesn't pre-fire.
const REFIRE_INTERVAL_MS = 1500;    // throttle re-fires while past the deadline.

const TurnDeadlineWatcher = ({timerExpireAt, onTimeout}) => {
    const intervalRef = useRef(null);
    const lastFireRef = useRef(0);
    const onTimeoutRef = useRef(onTimeout);
    useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

    useEffect(() => {
        lastFireRef.current = 0;        // new turn: reset throttle (natural re-arm)
        if (!timerExpireAt) return;

        const check = () => {
            const now = getSecTs();
            if (timerExpireAt - now > -FIRE_SLACK_MS) return;       // not past deadline + slack yet
            if (now - lastFireRef.current < REFIRE_INTERVAL_MS) return; // throttled
            lastFireRef.current = now;
            onTimeoutRef.current();      // do NOT clearInterval — retry next window if rejected
        };

        check();
        intervalRef.current = setInterval(check, TICK_MS);
        return () => clearInterval(intervalRef.current);   // unmount / turn change: no cross-turn leak
    }, [timerExpireAt]);

    return null;
};

export default TurnDeadlineWatcher;
```

- [ ] **Step 4: Run the new tests; then handle R-F1**

Run: `npx jest src/tests/turn-deadline-watcher.test.js`
Expected: PASS.

Now run the existing watcher test: `npx jest src/tests/turn-timer-render.test.js`
The case asserting "fires onTimeout exactly once, at/after the deadline and not before" (≈ lines 105-130) will FAIL — it expects a fire 200ms after the deadline (now needs +500ms slack) and expects exactly one fire after +5000ms (now retries). Migrate it: in `src/tests/turn-timer-render.test.js`, update that single test so it reflects the new contract — first fire at deadline+`FIRE_SLACK_MS`, and ≥2 fires after advancing several `REFIRE_INTERVAL_MS` windows (or delete the obsolete assertions there if they are now fully covered by `turn-deadline-watcher.test.js`, leaving the render-isolation assertions intact). Keep any assertion that the watcher renders null / does not re-render Board.

- [ ] **Step 5: Run the full timer suites + commit**

Run: `npx jest src/tests/turn-deadline-watcher.test.js src/tests/turn-timer-render.test.js`
Expected: PASS for both.

```bash
git add src/rummikub/components/TurnDeadlineWatcher.jsx src/tests/turn-deadline-watcher.test.js src/tests/turn-timer-render.test.js
git commit -m "fix(timer): retry the turn-timeout nudge so clock skew can't stick at 0

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T4: WS-A geometry — `tilesRightward` pure helper

**Files:**
- Modify: `src/rummikub/boardUtil.js` (add `tilesRightward`; keep `contiguousGroup` until T5 removes its last caller)
- Test: Create `src/tests/tiles-rightward.test.js`

**Interfaces:**
- Produces: `tilesRightward(tilePositions, pressedTileId) → string[]|number[]` = `[pressedId, ...contiguous tiles to the RIGHT]` in ascending column order, same grid + row; HAND isolated per playerID, board not; stops at the first gap; left side never included.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/tiles-rightward.test.js`:

```js
import {tilesRightward} from '../rummikub/boardUtil';

test('includes pressed + right contiguous, excludes left', () => {
  const tp = {
    a:{gridId:'b',row:0,col:0}, b:{gridId:'b',row:0,col:1},
    c:{gridId:'b',row:0,col:2}, d:{gridId:'b',row:0,col:3},
  };
  expect(tilesRightward(tp, 'b')).toEqual(['b','c','d']);  // 'a' (left) excluded
});

test('stops at a gap', () => {
  const tp = {
    a:{gridId:'b',row:0,col:0}, b:{gridId:'b',row:0,col:1},
    d:{gridId:'b',row:0,col:3}, // gap at col 2
  };
  expect(tilesRightward(tp, 'a')).toEqual(['a','b']);
});

test('single tile with no right neighbour returns just itself', () => {
  const tp = {a:{gridId:'b',row:0,col:5}};
  expect(tilesRightward(tp, 'a')).toEqual(['a']);
});

test('HAND grid isolates by playerID', () => {
  const tp = {
    a:{gridId:'h',row:0,col:0,playerID:'0'},
    b:{gridId:'h',row:0,col:1,playerID:'1'}, // different player, must not chain
  };
  expect(tilesRightward(tp, 'a')).toEqual(['a']);
});

test('board grid does not isolate by player', () => {
  const tp = {
    a:{gridId:'b',row:0,col:0,playerID:null},
    b:{gridId:'b',row:0,col:1,playerID:null},
  };
  expect(tilesRightward(tp, 'a')).toEqual(['a','b']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/tests/tiles-rightward.test.js`
Expected: FAIL — `tilesRightward is not a function`.

- [ ] **Step 3: Implement `tilesRightward`**

In `src/rummikub/boardUtil.js`, add next to `contiguousGroup` (it is `contiguousGroup` minus the left-extension loop):

```js
// Pure: the pressed tile plus the contiguous run to its RIGHT (ascending cols),
// same grid + row; a gap stops the run. The left side is never included. HAND
// runs are isolated per playerID; board tiles (playerID:null) are not.
export function tilesRightward(tilePositions, pressedTileId) {
    const p = tilePositions[pressedTileId];
    if (!p) return [pressedTileId];
    const {gridId, row, col, playerID} = p;
    const byCol = {};
    for (const id in tilePositions) {
        const q = tilePositions[id];
        if (!q || q.gridId !== gridId || q.row !== row) continue;
        if (gridId === HAND_GRID_ID && String(q.playerID) !== String(playerID)) continue;
        byCol[q.col] = id;
    }
    const group = [pressedTileId];
    for (let c = col + 1; byCol[c] != null; c++) group.push(byCol[c]);
    return group;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/tests/tiles-rightward.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/boardUtil.js src/tests/tiles-rightward.test.js
git commit -m "feat(board): add tilesRightward pure helper for right-only pickup

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T5: WS-A interaction — progressive long-press (Tile tick + Board accumulation)

**Files:**
- Modify: `src/rummikub/components/Tile.jsx` (replace the single `setTimeout` with a repeating `setInterval`; pass a tick count)
- Modify: `src/rummikub/components/Board.jsx` (`onLongPressCb(tileId, count)` accumulates the first-N of `tilesRightward`; swap import)
- Test: `src/tests/long-press.test.js` (extend with the progressive-accumulation case)

**Interfaces:**
- Consumes: `tilesRightward` (T4).
- Produces: `onLongPress(tile, count)` contract — Tile fires it once per `LONG_PRESS_STEP_MS` tick with an incrementing `count`; Board selects `tilesRightward(...).slice(0, min(count, len))`.

- [ ] **Step 1: Write the failing test**

Extend `src/tests/long-press.test.js` (reuse its existing Board/RTL or Tile harness; if it drives `onLongPress` directly, assert Board's selection growth). Add a progressive case using fake timers — press a tile in a 3-long board run and assert selection grows right-only, one tile per `LONG_PRESS_STEP_MS`:

```js
test('progressive long-press accumulates rightward one tile per step', () => {
  jest.useFakeTimers();
  // ... render the existing harness with board tiles a@col0 b@col1 c@col2 (row 0),
  // press tile 'b' (pointerDown on its element), then advance timers.
  // After 1 step: selection == ['b']; after 2: ['b','c']; after 3 (exhausted): still ['b','c'].
  // 'a' (to the left) is never selected.
  // Assert via the harness's exposed selectedTiles (match how long-press.test.js reads it).
  jest.useRealTimers();
});
```

> Read `long-press.test.js` first and copy its exact harness/assertion style (how it mounts, fires `pointerDown`, and inspects `selectedTiles`). The behavioral assertions to encode: (1) first step selects only the pressed tile; (2) each subsequent `LONG_PRESS_STEP_MS` adds the next RIGHT tile; (3) a left-adjacent tile is never added; (4) once the right run is exhausted, extra ticks don't change the selection.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/long-press.test.js -t "progressive"`
Expected: FAIL — the current one-shot long-press selects the whole bi-directional group at once (includes the left tile, not progressive).

- [ ] **Step 3: Implement Tile tick + Board accumulation**

In `src/rummikub/components/Tile.jsx`:
- Add constant near `LONG_PRESS_MS`: `const LONG_PRESS_STEP_MS = 250;` (same as `LONG_PRESS_MS`; game-design suggested ~180 for steps 2+ — tunable).
- Add `const tickRef = useRef(0);` with the other refs.
- Replace the `onPointerDown` timer body (currently a single `setTimeout(onLongPress, LONG_PRESS_MS)`):

```js
  const onPointerDown = useCallback((e) => {
    if (!canDnD) return;
    firedRef.current = false;
    tickRef.current = 0;
    startXY.current = {x: e.clientX, y: e.clientY};
    clearPressTimer();
    pressTimer.current = setInterval(() => {
      firedRef.current = true;          // first tick onward swallows the trailing click
      tickRef.current += 1;
      onLongPress?.(tile, tickRef.current);
    }, LONG_PRESS_STEP_MS);
  }, [canDnD, tile, onLongPress, clearPressTimer]);
```

- In `clearPressTimer`, change `clearTimeout(pressTimer.current)` to `clearInterval(pressTimer.current)` (interval now). Leave `onPointerMove` cancel, `onPointerUp/Cancel/Leave={clearPressTimer}`, and the unmount cleanup unchanged.

In `src/rummikub/components/Board.jsx`:
- Change the import from `contiguousGroup` to `tilesRightward`.
- Replace `onLongPressCb` with the count-aware accumulator (reads the live `gRef.current`):

```js
  const onLongPressCb = useCallback((tileId, count) => {
    const seq = tilesRightward(gRef.current.tilePositions, tileId).map(String);
    const n = Math.min(count, seq.length);
    setState(prev => {
      const next = seq.slice(0, n);
      if (prev.selectedTiles.length === next.length &&
          prev.selectedTiles.every((id, i) => id === next[i])) return prev; // idempotent: exhausted ticks no-op
      return {selectedTiles: next, lastSelectedTileId: String(tileId)};
    });
  }, []);
```

> If `onLongPressCb` is passed down under a different prop name, keep that wiring; only its body + signature change. `setState` here is the Board selection state setter already used by `onLongPressCb` — match its existing shape.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/tests/long-press.test.js`
Expected: PASS — progressive case green; existing long-press cases still green (adjust any existing assertion that expected bidirectional selection, since the contract is now right-only — update those assertions to the right-only expectation).

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/Tile.jsx src/rummikub/components/Board.jsx src/tests/long-press.test.js
git commit -m "feat(board): progressive rightward long-press pickup, one tile per step

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T6: WS-B — lift-on-select animation

**Files:**
- Modify: `src/rummikub/components/Tile.jsx` (append `tile-selected` class on the `TilePreview` face when `isSelected`)
- Modify: `src/rummikub/components/board.css` (`.tile.tile-selected` rule)
- Test: Create `src/tests/board-visual-ws-b.test.js` (CSS source assertion, same style as `board-visual-ws-f.test.js`)

**Interfaces:**
- Consumes: `isSelected` already threaded into `TilePreview`.
- Produces: a `.tile.tile-selected` lift (transform + shadow) gated by reduced-motion, with the existing `#c0c0c0`/`#6416ff` inline as the static fallback.

- [ ] **Step 1: Write the failing test**

Create `src/tests/board-visual-ws-b.test.js`:

```js
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');

function ruleBody(selector) {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

test('.tile-selected lifts via transform under reduced-motion gate', () => {
  const body = ruleBody('.tile.tile-selected');
  expect(body).toMatch(/translateY\(\s*-6px\s*\)/);
  expect(body).toMatch(/scale\(\s*1\.04\s*\)/);
  // transform must sit inside a prefers-reduced-motion: no-preference block
  const idx = css.indexOf('.tile.tile-selected');
  const prefersIdx = css.lastIndexOf('@media (prefers-reduced-motion: no-preference)', idx);
  expect(prefersIdx).toBeGreaterThanOrEqual(0);
});
```

> If the project keeps the lift transform in a dedicated reduced-motion block while a base `.tile.tile-selected` holds the static border, scope the `ruleBody` lookup to the block that contains the transform. The assertion intent: transform present AND under a `prefers-reduced-motion: no-preference` media query.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/board-visual-ws-b.test.js`
Expected: FAIL — `.tile.tile-selected` does not exist yet.

- [ ] **Step 3: Implement the lift**

In `src/rummikub/components/Tile.jsx`, append the class to the `TilePreview` face `className` (currently `"tile tile-clickable border-dark" + (newlyAdded ...) + (isPlayable ...)`) by adding `+ (isSelected === true ? " tile-selected" : "")`.

In `src/rummikub/components/board.css`, add (place the transform inside a reduced-motion gate; keep a static base so motion-off users still see a lifted border):

```css
/* WS-B: selected tiles read as "picked up". The inline #c0c0c0/#6416ff in
   getTileStyle stays as the static (reduced-motion) second channel. */
.tile.tile-selected {
    z-index: 5;
    box-shadow: 0 8px 16px rgba(0, 0, 0, .35);
}
@media (prefers-reduced-motion: no-preference) {
    .tile.tile-selected {
        transform: translateY(-6px) scale(1.04);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/tests/board-visual-ws-b.test.js`
Expected: PASS. Also `npx jest src/tests/long-press.test.js` stays green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/Tile.jsx src/rummikub/components/board.css src/tests/board-visual-ws-b.test.js
git commit -m "feat(ui): lift-on-select animation for picked-up tiles

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T7: WS-C — grab/grabbing cursor (drop the four-arrow move cursor)

**Files:**
- Modify: `src/rummikub/components/Tile.jsx` (`getTileStyle` face cursor; thread `canDnD`/`isDragging` into `TilePreview`)
- Modify: `src/rummikub/components/Board.jsx` (DragOverlay clone passes `isDragging` so it shows `grabbing`)
- Test: Create `src/tests/tile-cursor.test.js` (RTL render assertion)

**Interfaces:**
- Consumes: `canDnD`, `isDragging` in `TilePreview`/`getTileStyle`.
- Produces: face `cursor` = `default` when `!canDnD`, `grabbing` while `isDragging`, else `grab`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/tile-cursor.test.js`:

```js
import React from 'react';
import {render} from '@testing-library/react';
import {TilePreview} from '../rummikub/components/Tile';

test('draggable tile face shows grab, dragging shows grabbing', () => {
  const {container, rerender} = render(<TilePreview tile={5} canDnD={true} isDragging={false}/>);
  const face = container.querySelector('.tile');
  expect(face.style.cursor).toBe('grab');
  rerender(<TilePreview tile={5} canDnD={true} isDragging={true}/>);
  expect(container.querySelector('.tile').style.cursor).toBe('grabbing');
});

test('non-draggable tile face is not a grab cursor', () => {
  const {container} = render(<TilePreview tile={5} canDnD={false} isDragging={false}/>);
  expect(container.querySelector('.tile').style.cursor).toBe('default');
});
```

> `TilePreview` is already exported from `Tile.jsx`. If it doesn't currently accept `canDnD`, this task adds it (see Step 3).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/tile-cursor.test.js`
Expected: FAIL — face cursor is currently the constant `'move'`.

- [ ] **Step 3: Implement the cursor**

In `src/rummikub/components/Tile.jsx`:
- Thread `canDnD` and `isDragging` into `TilePreview`'s props and into `getTileStyle`. Change the `getTileStyle` signature to accept them (or compute cursor in `TilePreview` and pass through). Replace the face style `cursor: 'move'` with:

```js
  cursor: !canDnD ? 'default' : (isDragging ? 'grabbing' : 'grab'),
```

- Ensure the real `Tile` render passes `canDnD={canDnD}` and `isDragging={isDragging}` (from `useDraggable`) into its `<TilePreview>`.

In `src/rummikub/components/Board.jsx`, the DragOverlay clone (`<TilePreview tile={id}/>`) should pass `isDragging={true}` (and `canDnD={true}`) so the dragged clone shows `grabbing` and doesn't fight the existing `.tile-lift .tile{cursor:grabbing}`:

```jsx
  <TilePreview tile={id} canDnD={true} isDragging={true}/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/tests/tile-cursor.test.js`
Expected: PASS. Also re-run `npx jest src/tests/long-press.test.js src/tests/board-visual-ws-b.test.js` to confirm no Tile regression.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/Tile.jsx src/rummikub/components/Board.jsx src/tests/tile-cursor.test.js
git commit -m "feat(ui): grab/grabbing cursor on tiles instead of the move cursor

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T8: WS-D — drop cue board-only + softer affordance

**Files:**
- Modify: `src/rummikub/components/GridSlot.jsx` (gate the cue to `gridId===BOARD_GRID_ID`; replace the inline `isOver` green with a `.slot-over` class)
- Modify: `src/rummikub/components/board.css` (soften `.slot-valid`; add `.slot-over`)
- Test: `src/tests/droppable-cue.test.js` (extend: board cell lights, hand cell does not) + `src/tests/board-visual-ws-d.test.js` (CSS source assertion)

**Interfaces:**
- Consumes: `gridId`, `BOARD_GRID_ID` (already imported region / from `constants.js`), `isOver`, `isDragActive`, `hasSelection`, `canDnD` already in GridSlot.
- Produces: cue classes only on board empty cells; `tap-to-place` (`onCellTap`) behavior unchanged.

- [ ] **Step 1: Write the failing tests**

Extend `src/tests/droppable-cue.test.js` (reuse its harness). Assert that with a live selection, a board empty cell carries `slot-valid` while a hand empty cell does not:

```js
test('cue is board-only: hand empty cells never light up', () => {
  // render the harness with hasSelection=true / isDragActive=true and canDnD=true,
  // for one empty cell with gridId='b' and one with gridId='h'.
  // board cell -> classList contains 'slot-valid'; hand cell -> does NOT.
  // (Match how droppable-cue.test.js renders GridSlot and reads className.)
});
```

Create `src/tests/board-visual-ws-d.test.js` (CSS source assertion):

```js
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');

test('.slot-over exists and is a restrained semi-transparent fill', () => {
  expect(css).toMatch(/\.grid-item\.slot-over\s*\{/);
  // the over cue fill alpha stays < .3 (restrained, "you can place here")
  const m = css.match(/\.grid-item\.slot-over\s*\{[^}]*background[^;]*rgba\([^)]*,\s*\.(\d+)\)/);
  expect(m).not.toBeNull();
  expect(Number('0.' + m[1])).toBeLessThan(0.3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/tests/droppable-cue.test.js src/tests/board-visual-ws-d.test.js`
Expected: FAIL — hand cells currently also get `slot-valid`; `.slot-over` does not exist.

- [ ] **Step 3: Implement board-only gate + softer cue**

In `src/rummikub/components/GridSlot.jsx`, gate the empty-cell cue to the board grid and move the inline `isOver` green to a class. Replace the empty-cell return:

```jsx
  const isBoard = gridId === BOARD_GRID_ID;
  const isTapTarget = isBoard && (isDragActive || hasSelection) && canDnD;
  const onClick = (hasSelection && canDnD && onCellTap)
    ? (e) => { e.stopPropagation(); onCellTap(gridId, col, row); }
    : undefined;
  return <div
    ref={setNodeRef}
    onClick={onClick}
    className={'grid-item'
      + (isTapTarget ? ' slot-valid' : '')
      + (isBoard && canDnD && isOver ? ' slot-over' : '')}/>;
```

> Import `BOARD_GRID_ID` from `../constants` if not already in scope. Do NOT change the `onCellTap` wiring — tap-to-place still works on board cells.

In `src/rummikub/components/board.css`, soften `.slot-valid` and add `.slot-over` (semi-transparent, inviting, not an alarm):

```css
.grid-item.slot-valid {
    border-radius: 6px;
    /* softer "you can place here" — faint fill + thin inset outline, no loud glow */
    background-color: rgba(120, 200, 130, .08);
    box-shadow: inset 0 0 0 1.5px rgba(150, 210, 120, .35);
}
.grid-item.slot-over {
    border-radius: 6px;
    /* hovered cell: a touch stronger than slot-valid but still restrained (< .3) */
    background-color: rgba(120, 200, 130, .22);
    box-shadow: inset 0 0 0 2px rgba(150, 210, 120, .55);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/tests/droppable-cue.test.js src/tests/board-visual-ws-d.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/GridSlot.jsx src/rummikub/components/board.css src/tests/droppable-cue.test.js src/tests/board-visual-ws-d.test.js
git commit -m "feat(ui): board-only, softer drop-target cue

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Final verification (after T8, before merge/deploy)

- [ ] `npx jest` — full suite green (expect ~430+).
- [ ] `npm run build` — succeeds; `grep -rn "console.log" src/rummikub/{insertPush.js,dndUtil.js,boardUtil.js,components/TurnDeadlineWatcher.jsx,components/Tile.jsx,components/GridSlot.jsx}` shows no NEW logs.
- [ ] `node src/server.js` boots on a free PORT; `curl 127.0.0.1:PORT/games` → `["RummyCube"]`.
- [ ] Whole-branch review (superpowers:requesting-code-review) on the most capable model, then superpowers:finishing-a-development-branch (ff-merge, push) and DEPLOY (podman build + bake sanity-check `game.shunlyu.com>0`/`127.0.0.1=0` + restart + live `/games` 200 + new strings present). Live smoke: drop a tile into a `123_456` gap → `1234_456`; let a turn time out → it auto-draws (no stick at 0); long-press accumulates rightward; selected tiles lift; cursor is grab/grabbing; only board cells show the (softer) cue.
