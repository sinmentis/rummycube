# Chat Bubbles — Design Spec

**Date:** 2026-06-27
**Status:** Approved (design), pending implementation plan
**Owner decision:** scope = all players (self + opponents); rapid messages = replace latest (reset timer); duration = 5s; position = per-seat (tail toward avatar); keep the existing chat box (bubbles are additive).

## Goal

When a player sends a text chat message, show a transient speech bubble next to that player's avatar on the board — as if they are speaking — in addition to the existing chat box. This makes table talk feel alive instead of being buried in the top-right chat panel.

## Background (current system)

- **Chat data:** boardgame.io's built-in chat. `Board` receives `chatMessages` (append-only array of `{id, sender, payload}`) and `sendChatMessage`. Text messages carry `payload.text` (string, `MAX_CHAT_LEN = 200`); "typing" pings carry `payload.typing` + `ts` and are NOT text. (`ChatPanel.jsx`)
- **Avatars:** one shared component `PlayerAvatarWithTimer` (`PlayerAvatar.jsx`) renders `<div class="player"><div class="avatar">…username…tilecount…</div></div>`. `.avatar` is an 80px circle, `position: relative`, overflow visible.
  - **Self** avatar: rendered in `.rack-self` (bottom-left) directly by `Board.jsx`.
  - **Opponents:** rendered by `TableSeats.jsx` as `.seat-slot.seat-{top|left|right}` around the felt (`tablePositions`), inside a `.table-seats` overlay that is `pointer-events: none`.

## Non-goals (v1, YAGNI)

- No bubble for "typing" state (the chat box already shows the typing indicator).
- No stacking/queueing — one bubble per seat, latest wins.
- No emoji-only enlargement, no per-message sound, no bubble for system/quick-phrase distinction (quick phrases are text → they bubble normally).
- No history/scrollback in bubbles — the chat box remains the source of truth and accessible record.

## Architecture

Three small, independently testable units:

### 1. `useChatBubbles(chatMessages, { ttlMs }) -> { [seatId]: { id, text, leaving } }`

New hook at `src/rummikub/hooks/useChatBubbles.js` (sibling of the existing `useCountdown.jsx`).

**Contract:**
- Reads the append-only `chatMessages`. Considers only entries with a non-empty `payload.text` (ignores typing pings and any non-text payload).
- Returns a map of the currently-visible bubble per seat: `{ [String(seat)]: { id, text, leaving } }`. `leaving` is a boolean the view uses to play the fade-out.
- **Latest-wins (replace):** a new text message for a seat overwrites that seat's bubble and resets its TTL.
- **TTL:** a bubble is shown for `ttlMs` (default 5000), then enters `leaving` for `EXIT_MS` (200ms) so CSS can fade it out, then is removed. Driven by `setTimeout` (robust under `prefers-reduced-motion`, unlike relying on `animationend`).
- **No reconnect/mount storm:** on the hook's first effect run, the messages already present are marked seen (not bubbled). Only messages appended *after* mount produce bubbles. (Assumption: a fresh mount receives prior history as the initial `chatMessages`; a socket reconnect retains the existing array rather than replaying from length 0. Worst case if history ever re-arrives post-mount: because of latest-wins, the residual is bounded to at most one stale bubble per seat for `ttlMs` — acceptable, not a storm.)
- Cleans up all pending timers on unmount.

**Reference implementation:**

```js
import { useEffect, useRef, useState } from "react";

const DEFAULT_TTL_MS = 5000;
const EXIT_MS = 200; // CSS fade-out window before the bubble is removed

// Derives the transient per-seat "speech bubble" from boardgame.io's chat log.
// Only text messages that ARRIVE while mounted bubble (history present at mount
// is marked seen, so a reconnect/replay never storms the table). The latest
// message for a seat replaces any earlier one and resets its TTL.
export function useChatBubbles(chatMessages, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const messages = chatMessages || [];
  const [bubbles, setBubbles] = useState({}); // {[seat]: {id, text, leaving}}
  const seenRef = useRef(null);               // # of messages already processed
  const timersRef = useRef({});               // {[seat]: {hide, remove}}

  useEffect(() => {
    if (seenRef.current === null) {            // first run: skip existing history
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
      setBubbles(b => ({ ...b, [seat]: { id: m.id, text: p.text, leaving: false } }));
      const hide = setTimeout(() => {
        setBubbles(b => (b[seat] ? { ...b, [seat]: { ...b[seat], leaving: true } } : b));
      }, ttlMs);
      const remove = setTimeout(() => {
        setBubbles(b => { const n = { ...b }; delete n[seat]; return n; });
        delete timersRef.current[seat];
      }, ttlMs + EXIT_MS);
      timersRef.current[seat] = { hide, remove };
    }
    seenRef.current = messages.length;
  }, [messages.length, ttlMs]);

  useEffect(() => () => {
    Object.values(timersRef.current).forEach(t => { clearTimeout(t.hide); clearTimeout(t.remove); });
  }, []);

  return bubbles;
}
```

### 2. `ChatBubble` component

New component at `src/rummikub/components/ChatBubble.jsx`.

```jsx
import React from "react";

// A transient speech bubble anchored to a player's avatar circle. `side` is the
// side of the avatar the bubble sits on and the direction its tail points:
// up = above (tail down), down = below, left = to the avatar's left, right = to
// the avatar's right. Decorative duplicate of the chat box → aria-hidden, never
// intercepts pointer events.
export default function ChatBubble({ text, side = "up", leaving = false }) {
  return (
    <div className={`chat-bubble chat-bubble-${side} ${leaving ? "leaving" : ""}`} aria-hidden="true">
      <div className="chat-bubble-box">{text}</div>
    </div>
  );
}
```

Two elements on purpose: the **outer** `.chat-bubble` is the positioned anchor (absolute offset + centering `transform` per side); the **inner** `.chat-bubble-box` is the visible rounded box that carries the enter/exit animation. Splitting them keeps the centering `transform` off the animated element, so the scale-in never fights the positioning transform.

`aria-hidden` because the chat box already exposes messages to assistive tech; the bubble is a visual echo and must not double-announce.

### 3. Wiring

- **`PlayerAvatar.jsx`** gains two props: `bubble` (`{id, text, leaving} | null`) and `bubbleSide` (`'up'|'down'|'left'|'right'`, default `'up'`). When `bubble` is set, render `<ChatBubble key={bubble.id} text={bubble.text} side={bubbleSide} leaving={bubble.leaving} />` **inside `.avatar`** (which is already `position: relative`, overflow visible). Keying by `bubble.id` remounts the element on a new message so the enter animation replays.
- **`Board.jsx`**:
  - `const chatBubbles = useChatBubbles(chatMessages, { ttlMs: CHAT_BUBBLE_TTL_MS });` (define `CHAT_BUBBLE_TTL_MS = 5000` locally or in `constants.js`).
  - Self avatar: pass `bubble={chatBubbles[String(playerID)] || null}` and `bubbleSide="up"`.
  - Pass `bubbles={chatBubbles}` into `TableSeats`.
- **`TableSeats.jsx`**: map seat position → bubble side and pass through per seat:
  - `const SIDE_BY_POS = { top: 'down', left: 'right', right: 'left', bottom: 'up' };`
  - `bubble={(bubbles && bubbles[String(data.id)]) || null}` and `bubbleSide={SIDE_BY_POS[pos] || 'down'}`.

Direction rationale (tail always points back at the avatar, bubble grows toward the open felt so it doesn't fall off-screen): self at the bottom → bubble **up**; top seat → bubble **down**; left-edge seat → bubble **right** (inward); right-edge seat → bubble **left** (inward).

## Styling (`chat.css` additions)

The outer `.chat-bubble` only positions; the inner `.chat-bubble-box` is the visible, animated box.

- `.chat-bubble`: `position: absolute; z-index: 5; pointer-events: none;` + the per-side offset/centering below.
- `.chat-bubble-box`: `max-width: 220px; padding: 6px 10px; border-radius: var(--r-lg); background: var(--bubble-bg, #fbf3df); color: #2a2118; box-shadow: var(--elev-2); font-size: .8rem; line-height: 1.25; word-break: break-word; overflow-wrap: anywhere;` plus a 4-line clamp (`display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;`) so a 200-char message can't balloon. Carries the enter animation + exit transition.
- Tail: a small rotated square via `.chat-bubble-box::after` (inherits the box background), positioned per side toward the avatar.
- Position per side on the OUTER `.chat-bubble`, anchored to the 80px `.avatar` circle:
  - `.chat-bubble-up { bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 10px; }` (tail bottom-center).
  - `.chat-bubble-down { top: 100%; left: 50%; transform: translateX(-50%); margin-top: 10px; }` (tail top-center).
  - `.chat-bubble-right { left: 100%; top: 50%; transform: translateY(-50%); margin-left: 10px; }` (tail left-center).
  - `.chat-bubble-left { right: 100%; top: 50%; transform: translateY(-50%); margin-right: 10px; }` (tail right-center).
- Animation (on the inner `.chat-bubble-box`, so it never conflicts with the outer centering transform):
  - Enter: `@keyframes chat-bubble-in { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }` for ~150ms ease-out on mount. Set `transform-origin` per side so it grows out of the avatar (up → bottom center, down → top center, right → left center, left → right center) — set the origin in each `.chat-bubble-{side} .chat-bubble-box` rule.
  - Exit: base `.chat-bubble-box { transition: opacity .2s ease; }` and `.chat-bubble.leaving .chat-bubble-box { opacity: 0; }`.
  - `@media (prefers-reduced-motion: reduce)`: replace the enter keyframe with an opacity-only fade (no scale). Mirrors the existing motion-gating used for confetti and the timer pulse.
- v1 keeps one bubble style for everyone (the avatar identifies the speaker); no own-vs-others tint.

## Testing

- **`src/tests/use-chat-bubbles.test.js`** (fake timers; drive the hook via `renderHook` from `@testing-library/react`, or a thin harness component if `renderHook` is unavailable):
  1. History present at mount → `bubbles` is empty (first-run skip, no reconnect storm).
  2. A new text message → `bubbles[seat]` has its `text`/`id`.
  3. A typing ping (`{payload:{typing:true,ts}}`) → ignored, no bubble.
  4. A second message from the same seat → that seat's bubble shows the latest `text`/`id` (replace).
  5. After `ttlMs` → `leaving` is true; after a further `EXIT_MS` → the seat is removed.
- **`src/tests/chat-bubble.test.js`**: `<ChatBubble text="hi" side="left" leaving />` renders the text, the `chat-bubble-left` class, and the `leaving` class; the root is `aria-hidden`.
- **Integration (lighter than a full board mount):** render `PlayerAvatarWithTimer` with a `bubble` prop and assert the bubble text appears with the right side class next to the avatar. (A `TableSeats` test mapping `pos → side` is optional.)

## Files

- **Create:** `src/rummikub/hooks/useChatBubbles.js`, `src/rummikub/components/ChatBubble.jsx`, tests `src/tests/use-chat-bubbles.test.js` + `src/tests/chat-bubble.test.js`.
- **Modify:** `src/rummikub/components/Board.jsx` (call the hook, pass self bubble), `src/rummikub/components/TableSeats.jsx` (pass per-seat bubble + side), `src/rummikub/components/PlayerAvatar.jsx` (render `ChatBubble`), `src/rummikub/components/chat.css` (bubble styles).

## Risks / notes

- The reconnect-storm guard rests on the assumption above; if QA ever sees stale bubbles on reconnect, the fallback (latest-wins) already bounds it to ≤1 per seat for 5s, and a follow-up could add a per-message arrival timestamp.
- `.avatar` overflow is visible (it relies on box-shadow rims and absolutely-positioned username/tile-count), so the bubble can extend outside the circle without clipping — verify no ancestor sets `overflow: hidden` on the seat slots during implementation.
- Keep the bubble `pointer-events: none` (consistent with the `.table-seats` overlay) so it never blocks tile dragging.
