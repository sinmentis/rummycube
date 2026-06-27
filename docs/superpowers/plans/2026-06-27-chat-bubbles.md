# Chat Bubbles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a transient speech bubble next to a player's avatar when they send a text chat message, additive to the existing chat box.

**Architecture:** A `useChatBubbles` hook derives the latest-per-seat text message (5s TTL, latest-wins, no reconnect storm) from boardgame.io's `chatMessages`. A presentational `ChatBubble` component is rendered inside the shared `PlayerAvatar` (`.avatar` circle), fed per-seat by `Board` (self) and `TableSeats` (opponents), with the tail pointing back at the avatar.

**Tech Stack:** React 18, @testing-library/react 14 (`render`, `renderHook`, `act`), jest 29, plain CSS (`chat.css`).

**Spec:** `docs/superpowers/specs/2026-06-27-chat-bubbles-design.md`

## Global Constraints

- Behavior-preserving for all existing features; chat bubbles are purely additive (the chat box stays).
- No new dependencies — React + the already-installed @testing-library/react only.
- English for all code, comments, and commit messages. Conventional Commits; every commit ends with the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Bubbles are decorative: `pointer-events: none` and `aria-hidden="true"` (the chat box is the accessible record).
- Motion gating: under `@media (prefers-reduced-motion: reduce)` the enter animation is opacity-only (no scale), matching the existing confetti / timer-pulse gating.
- Lint gate: no NEW errors beyond the 2 known pre-existing (`App.jsx:29` no-debugger, `Hand.jsx:11` no-undef `hand`).
- Test suite must stay green (currently 492 jest / 96 suites) and grow with the new tests; `npm run build` must pass.
- Constants: `DEFAULT_TTL_MS = 5000`, `EXIT_MS = 200`, `MAX_CHAT_LEN = 200` (existing). Bubble TTL = 5000ms.

## File Structure

- **Create** `src/rummikub/hooks/useChatBubbles.js` — the data hook (latest text message per seat, TTL lifecycle). One responsibility: turn the chat log into a per-seat bubble map.
- **Create** `src/rummikub/components/ChatBubble.jsx` — the presentational bubble (outer positioned anchor + inner animated box). Imports `./chat.css`.
- **Modify** `src/rummikub/components/chat.css` — bubble styles (position per side, tail, enter/exit animation, reduced-motion).
- **Modify** `src/rummikub/components/PlayerAvatar.jsx` — render `ChatBubble` inside `.avatar` from new `bubble`/`bubbleSide` props.
- **Modify** `src/rummikub/components/TableSeats.jsx` — accept a `bubbles` map, pass each opponent its bubble + per-seat side.
- **Modify** `src/rummikub/components/Board.jsx` — call `useChatBubbles`, feed the self avatar and `TableSeats`.
- **Create tests** `src/tests/use-chat-bubbles.test.js`, `src/tests/chat-bubble.test.js`, `src/tests/player-avatar-bubble.test.js`, `src/tests/table-seats-bubble.test.js`.

---

## Task 1: `useChatBubbles` hook

**Files:**
- Create: `src/rummikub/hooks/useChatBubbles.js`
- Test: `src/tests/use-chat-bubbles.test.js`

**Interfaces:**
- Produces: `useChatBubbles(chatMessages, { ttlMs = 5000 } = {}) -> { [seatId: string]: { id, text, leaving: boolean } }`. Only `payload.text` messages count; latest-per-seat replaces and resets the 5s TTL; messages present at mount are skipped (no reconnect storm); after `ttlMs` the entry is marked `leaving`, and `EXIT_MS=200` later it is removed.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/use-chat-bubbles.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/tests/use-chat-bubbles.test.js`
Expected: FAIL — "Cannot find module '../rummikub/hooks/useChatBubbles'".

- [ ] **Step 3: Implement the hook**

Create `src/rummikub/hooks/useChatBubbles.js`:

```js
import {useEffect, useRef, useState} from "react";

const DEFAULT_TTL_MS = 5000;
const EXIT_MS = 200; // CSS fade-out window before the bubble is removed

// Derives the transient per-seat "speech bubble" from boardgame.io's chat log.
// Only text messages that ARRIVE while mounted bubble (history present at mount
// is marked seen, so a reconnect/replay never storms the table). The latest
// message for a seat replaces any earlier one and resets its TTL.
export function useChatBubbles(chatMessages, {ttlMs = DEFAULT_TTL_MS} = {}) {
    const messages = chatMessages || [];
    const [bubbles, setBubbles] = useState({}); // {[seat]: {id, text, leaving}}
    const seenRef = useRef(null);               // # of messages already processed
    const timersRef = useRef({});               // {[seat]: {hide, remove}}

    useEffect(() => {
        if (seenRef.current === null) {          // first run: skip existing history
            seenRef.current = messages.length;
            return;
        }
        for (let i = seenRef.current; i < messages.length; i++) {
            const m = messages[i];
            const p = (m && m.payload) || {};
            if (typeof p.text !== "string" || !p.text) continue; // ignore typing/non-text
            const seat = String(m.sender);
            const prev = timersRef.current[seat];
            if (prev) { clearTimeout(prev.hide); clearTimeout(prev.remove); }
            setBubbles(b => ({...b, [seat]: {id: m.id, text: p.text, leaving: false}}));
            const hide = setTimeout(() => {
                setBubbles(b => (b[seat] ? {...b, [seat]: {...b[seat], leaving: true}} : b));
            }, ttlMs);
            const remove = setTimeout(() => {
                setBubbles(b => { const n = {...b}; delete n[seat]; return n; });
                delete timersRef.current[seat];
            }, ttlMs + EXIT_MS);
            timersRef.current[seat] = {hide, remove};
        }
        seenRef.current = messages.length;
    }, [messages.length, ttlMs]);

    useEffect(() => () => {
        Object.values(timersRef.current).forEach(t => { clearTimeout(t.hide); clearTimeout(t.remove); });
    }, []);

    return bubbles;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/tests/use-chat-bubbles.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/hooks/useChatBubbles.js src/tests/use-chat-bubbles.test.js
git commit -m "feat(chat): add useChatBubbles hook (latest text per seat, 5s TTL)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: `ChatBubble` component + styles

**Files:**
- Create: `src/rummikub/components/ChatBubble.jsx`
- Modify: `src/rummikub/components/chat.css`
- Test: `src/tests/chat-bubble.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 (props only).
- Produces: `<ChatBubble text side="up|down|left|right" leaving={boolean} />` rendering `div.chat-bubble.chat-bubble-{side}[.leaving][aria-hidden] > div.chat-bubble-box` containing `text`. Default `side="up"`, `leaving=false`.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/chat-bubble.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/tests/chat-bubble.test.js`
Expected: FAIL — "Cannot find module '../rummikub/components/ChatBubble'".

- [ ] **Step 3: Create the component**

Create `src/rummikub/components/ChatBubble.jsx`:

```jsx
import React from "react";
import "./chat.css";

// A transient speech bubble anchored to a player's avatar circle. `side` is the
// side of the avatar the bubble sits on and the direction its tail points:
// up = above (tail down), down = below, left = to the avatar's left, right = to
// the avatar's right. The outer .chat-bubble only positions; the inner
// .chat-bubble-box is the visible, animated box (so the enter scale never fights
// the positioning transform). Decorative echo of the chat box -> aria-hidden and
// never intercepts pointer events.
export default function ChatBubble({text, side = "up", leaving = false}) {
    return (
        <div className={`chat-bubble chat-bubble-${side} ${leaving ? "leaving" : ""}`} aria-hidden="true">
            <div className="chat-bubble-box">{text}</div>
        </div>
    );
}
```

- [ ] **Step 4: Add the styles**

Append to `src/rummikub/components/chat.css`:

```css
/* ── Chat bubbles ─────────────────────────────────────────────────────────
   Transient speech bubble anchored to a player's .avatar circle. The outer
   .chat-bubble positions (per side); the inner .chat-bubble-box is the visible,
   animated box. Display-only: never blocks tile dragging. */
.chat-bubble {
    position: absolute;
    z-index: 5;
    pointer-events: none;
}
.chat-bubble-box {
    max-width: 220px;
    width: max-content;
    padding: 6px 10px;
    border-radius: var(--r-lg, 14px);
    background: var(--bubble-bg, #fbf3df);
    color: #2a2118;
    box-shadow: var(--elev-2, 0 14px 26px rgba(0, 0, 0, .42));
    font-size: .8rem;
    line-height: 1.25;
    text-align: left;
    word-break: break-word;
    overflow-wrap: anywhere;
    /* clamp a long (up to 200-char) message so the bubble can't balloon */
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    position: relative;
    animation: chat-bubble-in .15s ease-out;
    transition: opacity .2s ease;
}
.chat-bubble.leaving .chat-bubble-box { opacity: 0; }

/* tail: a small rotated square sharing the box background */
.chat-bubble-box::after {
    content: "";
    position: absolute;
    width: 10px;
    height: 10px;
    background: var(--bubble-bg, #fbf3df);
    transform: rotate(45deg);
}

/* per-side placement on the OUTER anchor + tail position + grow origin */
.chat-bubble-up    { bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 10px; }
.chat-bubble-up    .chat-bubble-box { transform-origin: bottom center; }
.chat-bubble-up    .chat-bubble-box::after { bottom: -4px; left: 50%; margin-left: -5px; }

.chat-bubble-down  { top: 100%; left: 50%; transform: translateX(-50%); margin-top: 10px; }
.chat-bubble-down  .chat-bubble-box { transform-origin: top center; }
.chat-bubble-down  .chat-bubble-box::after { top: -4px; left: 50%; margin-left: -5px; }

.chat-bubble-right { left: 100%; top: 50%; transform: translateY(-50%); margin-left: 10px; }
.chat-bubble-right .chat-bubble-box { transform-origin: left center; }
.chat-bubble-right .chat-bubble-box::after { left: -4px; top: 50%; margin-top: -5px; }

.chat-bubble-left  { right: 100%; top: 50%; transform: translateY(-50%); margin-right: 10px; }
.chat-bubble-left  .chat-bubble-box { transform-origin: right center; }
.chat-bubble-left  .chat-bubble-box::after { right: -4px; top: 50%; margin-top: -5px; }

@keyframes chat-bubble-in {
    from { opacity: 0; transform: scale(.85); }
    to   { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
    .chat-bubble-box { animation-name: chat-bubble-fade; }
}
@keyframes chat-bubble-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/tests/chat-bubble.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/rummikub/components/ChatBubble.jsx src/rummikub/components/chat.css src/tests/chat-bubble.test.js
git commit -m "feat(chat): add ChatBubble component + bubble styles

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Wire bubbles into the avatars (PlayerAvatar, TableSeats, Board)

**Files:**
- Modify: `src/rummikub/components/PlayerAvatar.jsx`
- Modify: `src/rummikub/components/TableSeats.jsx`
- Modify: `src/rummikub/components/Board.jsx`
- Test: `src/tests/player-avatar-bubble.test.js`, `src/tests/table-seats-bubble.test.js`

**Interfaces:**
- Consumes: `useChatBubbles` (Task 1) → `{ [seat]: {id, text, leaving} }`; `ChatBubble` (Task 2).
- Produces: `PlayerAvatarWithTimer` accepts `bubble` (`{id, text, leaving} | null`) + `bubbleSide` (`'up'|'down'|'left'|'right'`, default `'up'`), rendering `<ChatBubble>` inside `.avatar`. `TableSeats` accepts a `bubbles` map and maps seat position → side via `SIDE_BY_POS = {top:'down', left:'right', right:'left', bottom:'up'}`.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/player-avatar-bubble.test.js`:

```js
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
```

Create `src/tests/table-seats-bubble.test.js`:

```js
import React from 'react';
import {render, cleanup} from '@testing-library/react';
import TableSeats from '../rummikub/components/TableSeats';

// TableSeats threads each opponent seat's bubble to its avatar with a per-seat
// side. Self (the viewer) is rendered by Board, not here, so it is excluded.

afterEach(cleanup);

const matchData = [{id: 0, name: 'Al'}, {id: 1, name: 'Bo'}];

test('threads an opponent bubble to that seat with a side class', () => {
  const {container} = render(
    <TableSeats currentPlayer="0" playerID="0" matchData={matchData} matchID="m1"
      hands={[[], []]} handCounts={{0: 5, 1: 5}} connected={[true, true]}
      timerExpireAt={null} timePerTurn={30} showTurnTimer={false}
      bubbles={{'1': {id: 9, text: 'hey', leaving: false}}}/>
  );
  const bubble = container.querySelector('.chat-bubble');
  expect(bubble).toBeInTheDocument();
  expect(bubble).toHaveTextContent('hey');
  expect(bubble.className).toMatch(/chat-bubble-(up|down|left|right)/);
});

test('renders no bubble for a seat without one (and never for self)', () => {
  const {container} = render(
    <TableSeats currentPlayer="0" playerID="0" matchData={matchData} matchID="m1"
      hands={[[], []]} handCounts={{0: 5, 1: 5}} connected={[true, true]}
      timerExpireAt={null} timePerTurn={30} showTurnTimer={false}
      bubbles={{'0': {id: 1, text: 'self-should-not-show', leaving: false}}}/>
  );
  expect(container.querySelector('.chat-bubble')).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/tests/player-avatar-bubble.test.js src/tests/table-seats-bubble.test.js`
Expected: FAIL — no `.chat-bubble` rendered (props not wired yet).

- [ ] **Step 3: Wire `PlayerAvatar`**

In `src/rummikub/components/PlayerAvatar.jsx`, add the import at the top (after the existing imports):

```jsx
import ChatBubble from "./ChatBubble";
```

Add `bubble` and `bubbleSide` to the destructured props:

```jsx
const PlayerAvatarWithTimer = ({name, matchId, seatId, tiles, isActive, isConnected, timerExpireAt, totalTime, showTurnTimer, bubble, bubbleSide = "up"}) => {
```

Render the bubble inside `.avatar`, immediately after the `<span className="tile-count">{tiles}</span>` line (still inside the `.avatar` div):

```jsx
                <span className="tile-count">{tiles}</span>
                {bubble && <ChatBubble key={bubble.id} text={bubble.text} side={bubbleSide} leaving={bubble.leaving}/>}
```

- [ ] **Step 4: Wire `TableSeats`**

Replace the contents of `src/rummikub/components/TableSeats.jsx` with:

```jsx
import React from "react";
import {count2dArrItems} from "../util";
import PlayerAvatarWithTimer from "./PlayerAvatar";
import {tablePositions} from "../seats/tableLayout";
import {seatConnected} from "../seats/seatConnection";

// Opponent avatars laid out around the felt like a mahjong table (top/left/right
// by seat order). Self is rendered next to the rack, not here. Renders as a
// non-interactive overlay inside .board so it never blocks tile dragging.
// A chat bubble (if any) points back at its seat: top seat -> bubble below,
// left-edge seat -> bubble to the right (inward), right-edge -> to the left.
const SIDE_BY_POS = {top: 'down', left: 'right', right: 'left', bottom: 'up'};

const TableSeats = function ({currentPlayer, playerID, matchData, matchID, hands, handCounts, connected, timerExpireAt, timePerTurn, showTurnTimer, bubbles}) {
    const positions = tablePositions(matchData.length, Number(playerID));

    return (
        <div className="table-seats">
            {matchData.map((data, index) => {
                if (Number(data.id) === Number(playerID)) return null; // self lives by the rack
                const pos = positions[data.id] || 'top';
                const tiles = handCounts && handCounts[data.id] != null
                    ? handCounts[data.id]
                    : count2dArrItems(hands[data.id]);
                return (
                    <div key={data.id} className={`seat-slot seat-${pos}`}>
                        {data.name
                            ? <PlayerAvatarWithTimer isActive={index == currentPlayer}
                                                     name={data.name}
                                                     matchId={matchID}
                                                     seatId={data.id}
                                                     tiles={tiles}
                                                     isConnected={seatConnected(connected, data.id, data.isConnected)}
                                                     timerExpireAt={timerExpireAt}
                                                     totalTime={timePerTurn}
                                                     showTurnTimer={showTurnTimer}
                                                     bubble={(bubbles && bubbles[String(data.id)]) || null}
                                                     bubbleSide={SIDE_BY_POS[pos] || 'down'}/>
                            : <div className="player-pending">Seat {data.id + 1}<br/>waiting…</div>}
                    </div>
                );
            })}
        </div>
    );
};

export default TableSeats;
```

- [ ] **Step 5: Wire `Board`**

In `src/rummikub/components/Board.jsx`:

(a) Add the import near the other hook imports (e.g. after `import {seatConnected} from "../seats/seatConnection";`):

```jsx
import {useChatBubbles} from "../hooks/useChatBubbles";
```

(b) Call the hook alongside the other top-level hooks (place it next to the existing `useSyncingCue`/`useComboCelebration` hook calls, near the top of the component body):

```jsx
    const chatBubbles = useChatBubbles(chatMessages, {ttlMs: 5000});
```

(c) On the self avatar (the `<PlayerAvatarWithTimer ...>` inside `<div className="rack-self">`), append these two props to that element (e.g. after its `isConnected={...}` prop):

```jsx
                                   bubble={chatBubbles[String(playerID)] || null}
                                   bubbleSide="up"
```

(d) On the `<TableSeats ... />` element, add the `bubbles` prop:

```jsx
            bubbles={chatBubbles}
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `npx jest src/tests/player-avatar-bubble.test.js src/tests/table-seats-bubble.test.js`
Expected: PASS (4 tests).

- [ ] **Step 7: Run the full suite, build, and lint**

Run: `npx jest 2>&1 | tail -4`
Expected: all green (≈ 504 tests / 99 suites — 492 prior + 12 new across the 4 new files; exact count may vary slightly).

Run: `npm run build 2>&1 | tail -2`
Expected: `✓ built` with no error.

Run: `npm run lint 2>&1 | tail -3`
Expected: `2 errors` (only the known `App.jsx:29` + `Hand.jsx:11`), no NEW errors.

- [ ] **Step 8: Commit**

```bash
git add src/rummikub/components/PlayerAvatar.jsx src/rummikub/components/TableSeats.jsx src/rummikub/components/Board.jsx src/tests/player-avatar-bubble.test.js src/tests/table-seats-bubble.test.js
git commit -m "feat(chat): show chat bubbles on player avatars

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Final verification (before merge/deploy)

- [ ] **Visual smoke (local):** build, then preview against a local backend and eyeball a bubble.

```bash
# build/ bakes 127.0.0.1:9143 via .env.production.local, so run a local backend too:
PORT=9143 REACT_APP_TILES_TO_DRAW=14 REACT_APP_FIRST_MOVE_SCORE_LIMIT=30 node --env-file=.env src/server.js &
npx vite preview --port 4178
# open two browser tabs into a 2-player match, send a chat message from one,
# confirm a bubble pops from that player's avatar (above for self, below/side for
# the opponent) and fades after ~5s. Check prefers-reduced-motion (no scale).
```

- [ ] **Deploy (after owner OK):** mirrors prior rounds —
  `podman build -t shunlyu-rummycube:latest .` → bake-check (`game.shunlyu.com` baked, 0× `127.0.0.1`) → `systemctl --user restart shunlyu-rummycube.service` → verify container boots + `curl https://game.shunlyu.com/games` == `["RummyCube"]` → live smoke a bubble.

---

## Notes for the implementer

- `.avatar` is already `position: relative` with visible overflow (it uses box-shadow rims and absolutely-positioned `.username`/`.tile-count`), so the bubble extends outside the circle without clipping. If a bubble looks clipped, check no ancestor `.seat-slot`/`.rack-self` sets `overflow: hidden` — none should be added.
- Keep the bubble `pointer-events: none` and `aria-hidden` (Global Constraints) so it never blocks dragging or double-announces to screen readers.
- The hook keys the rendered `ChatBubble` by `bubble.id`, so a new message remounts it and replays the enter animation — do not remove the `key`.
- Do not modify `ChatPanel.jsx`; the chat box stays exactly as-is (bubbles are additive).
