# RummyCube Round-5b Implementation Plan (P2 + P3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Polish the live table (rebalance the wasted-space layout, fix mobile, tighten the visual system) and make the turn timer clearer (surface the hidden draw-2 rule; add a thinking-clock relief).

**Architecture:** Client-only CSS + small component changes. No Rummikub rule changes (P3-1 only *displays* the existing draw-2 behavior; P3-2 adds a one-time client time-extension request that goes through the existing server move path). Scope from `docs/optimization/2026-06-26-review5-recommendations.md` (P2 + P3; P2-4 game-over highlights is deferred as it needs server-side data plumbing).

**Tech Stack:** React 18 + Vite, @dnd-kit, boardgame.io 0.50, Jest + RTL (CSS source-assertion tests in the `board-visual-*` style + RTL). ~452 tests green.

## Global Constraints

- No Rummikub rule changes; server stays authority. All animation under `@media (prefers-reduced-motion: no-preference)` with a non-motion fallback. English code/comments/tests/UI copy. Conventional Commits + trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. No new runtime deps. No new `console.log`. After each task: `npx jest` green; `npm run build` OK; `npm run lint` no new errors; `node src/server.js` boots (with the env vars — see Round-5a). CSS work is verified by source-assertion tests PLUS a final live Playwright visual smoke (jsdom can't measure pixels).
- Palette CSS vars live in `board.css` (`--felt`, `--rack`, `--c-red`, brass tones). `BOARD_COLS=32`. Chat FAB markup/logic already exists (`chat.css:55 .chat-fab`, shown only `@media (max-width:820px)`); the desktop gutter is `board.css:33 .board-container{padding-right:calc(300px+16px)}` under `@media (min-width:821px)`.

**Recommended order:** T1 → T6. Serial hotspot: `board.css` (T1, T3, T4) and `Board.jsx` (T1, T5, T6).

---

### Task T1: Rebalance the table — collapse chat to a FAB on desktop, reclaim the gutter, lift the rack

**Files:**
- Modify: `src/rummikub/components/board.css` (`:32-34` desktop gutter; `.board`/`.ref` empty-board height; `.hand-buttons` top offset)
- Modify: `src/rummikub/components/chat.css` (`.chat-fab` / panel media queries so the FAB + collapsible panel apply on desktop too)
- Modify: `src/rummikub/components/Board.jsx` and/or `ChatPanel.jsx` (a `chatOpen` toggle that works at all widths; default closed on desktop)
- Test: Create `src/tests/board-visual-layout.test.js` (CSS source assertions) + extend `src/tests/chat-fab.test.js` (FAB toggles the panel on desktop)

**Background:** On ≥821px the board permanently reserves a 316px right gutter for a chat panel that is ~60% empty, while the 9×32 board tray (~63vh) sits mostly empty early-game and pushes the rack/controls into the bottom third. Make chat a collapsible FAB at ALL widths (reuse the existing mobile FAB), drop the always-on gutter, and let the empty board be less tall so the rack rises toward the visual centre.

- [ ] **Step 1: Write the failing tests**

`src/tests/board-visual-layout.test.js` (mirror `src/tests/board-visual-ws-f.test.js` style — `fs.readFileSync` + regex):

```js
const fs = require('fs');
const path = require('path');
const board = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');
const chat = fs.readFileSync(path.join(__dirname, '../rummikub/components/chat.css'), 'utf8');

test('desktop no longer reserves the always-on 316px chat gutter', () => {
  // the old rule was: @media (min-width:821px){ .board-container{ padding-right: calc(300px + 16px) } }
  expect(board).not.toMatch(/padding-right:\s*calc\(300px\s*\+\s*16px\)/);
});

test('chat FAB is available on desktop (not gated to <=820px only)', () => {
  // the FAB display must NOT be confined to a max-width:820px block; it should show by default
  expect(chat).toMatch(/\.chat-fab\s*\{[^}]*display:\s*(inline-flex|flex)/);
});
```

Extend `chat-fab.test.js`: assert that at desktop width the FAB toggles the panel open/closed (render the chat with the FAB, click → panel visible, click → hidden). Match the existing harness.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/tests/board-visual-layout.test.js src/tests/chat-fab.test.js`
Expected: FAIL — gutter rule still present; FAB still gated to mobile.

- [ ] **Step 3: Implement**

- `board.css`: remove (or neutralise) the `@media (min-width:821px){ .board-container{ padding-right: calc(300px+16px) } }` gutter so the board uses the full width. Reduce the empty-board tray height: add a rule so the board grid container has a smaller `max-height` (e.g. `~52vh`) when empty and grows when tiles exist (if a pure-CSS empty detection isn't available, cap the tray `max-height` and let it scroll/grow — keep it from dominating). Nudge `.hand-buttons`/rack upward (raise its `margin-top`) so it sits nearer the vertical centre.
- `chat.css`: make `.chat-fab` display at all widths (move it out of the `@media (max-width:820px)` exclusivity); make the opened `.chat-panel` an overlay (fixed/absolute, above the felt) rather than an inline column that needs the gutter.
- `Board.jsx`/`ChatPanel.jsx`: ensure a `chatOpen` state controls the panel, defaulting CLOSED on desktop; the FAB toggles it; unread-message dot logic (if present) stays.

> Keep the existing chat functionality (messages, quick phrases, emoji, send) intact — only the container/positioning + toggle behaviour change.

- [ ] **Step 4: Run tests + lint/build**

Run: `npx jest src/tests/board-visual-layout.test.js src/tests/chat-fab.test.js` then `npx jest`, `npm run build`, `npm run lint`
Expected: PASS; suite green; build OK; no new lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/board.css src/rummikub/components/chat.css src/rummikub/components/Board.jsx src/rummikub/components/ChatPanel.jsx src/tests/board-visual-layout.test.js src/tests/chat-fab.test.js
git commit -m "feat(ui): collapsible chat FAB at all widths; reclaim the chat gutter; lift the rack

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T2: Mobile — fit the board to the viewport (no horizontal scroll)

**Files:**
- Modify: `src/rummikub/components/board.css` (`:1070` mobile board grid `repeat(32, max(8.4vw, 48px))`)
- Test: Create `src/tests/board-visual-mobile.test.js`

**Background:** On phones the board is `repeat(32, max(8.4vw, 48px))` ≈ ≥1536px wide → the player must scroll horizontally to reach cells. Fit the 32 columns to the viewport width so the first meld is reachable without horizontal scroll (smaller cells on mobile; the tiles already scale).

- [ ] **Step 1: Write the failing test**

```js
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');

test('mobile board columns fit the viewport (no fixed 48px floor forcing horizontal scroll)', () => {
  // the mobile board grid should size columns to fit 32 across the viewport,
  // not max(8.4vw, 48px) which forces a >1500px track.
  const m = css.match(/grid-template-columns:\s*repeat\(32,[^;]*\)\s*!important/);
  expect(m).not.toBeNull();
  expect(m[0]).not.toMatch(/max\(8\.4vw,\s*48px\)/); // no 48px floor on mobile
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/board-visual-mobile.test.js`
Expected: FAIL — the `max(8.4vw,48px)` floor is still there.

- [ ] **Step 3: Implement**

In `board.css` (the `@media (max-width:820px)` block ~`:1070`), change the board grid columns to fit 32 across the viewport, e.g. `grid-template-columns: repeat(32, minmax(0, 1fr)) !important;` (or `calc((100vw - <padding>) / 32)`), so the whole board fits the screen width without horizontal scroll; verify the hand grid (`:1098`, 22 cols) and tile rendering still read (tiles shrink with the cells). Keep `!important` (it overrides the desktop track). Aim: no horizontal scrollbar on a 390px-wide viewport.

- [ ] **Step 4: Run tests + build**

Run: `npx jest src/tests/board-visual-mobile.test.js` then `npx jest`, `npm run build`
Expected: PASS; suite green; build OK.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/board.css src/tests/board-visual-mobile.test.js
git commit -m "fix(mobile): fit the board to the viewport (no horizontal scroll)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T3: Visual system A — timer-ring brand ramp, Poppins everywhere, one wordmark colour

**Files:**
- Modify: `src/rummikub/components/PlayerAvatar.jsx:15,~30` (ring colour)
- Modify: `src/rummikub/components/board.css` (`.turn-banner`/`.timer-seconds`/`.rummikub-button` font → Poppins)
- Modify: `src/rummikub/components/index.css` + `lobby.css` (wordmark colour unify)
- Test: Create `src/tests/visual-system-a.test.js`

**Background:** The timer ring interpolates raw `rgb(redIntensity,0,blueIntensity)` from `#00f` (pure blue→red) — the only high-saturation primary in a low-sat felt/brass/ivory palette. Three components still use `'Segoe UI'` instead of the brand Poppins. The wordmark is cream in the nav but brass on the landing.

- [ ] **Step 1: Write the failing test**

```js
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');
const avatar = fs.readFileSync(path.join(__dirname, '../rummikub/components/PlayerAvatar.jsx'), 'utf8');

test('timer ring no longer starts at pure blue #00f', () => {
  expect(avatar).not.toMatch(/useState\(["']#00f["']\)/);
});
test('turn banner / button base no longer use Segoe UI', () => {
  // these three rules previously declared font-family: 'Segoe UI'
  expect(css).not.toMatch(/Segoe UI/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/visual-system-a.test.js`
Expected: FAIL — `#00f` and `Segoe UI` still present.

- [ ] **Step 3: Implement**

- `PlayerAvatar.jsx`: replace the ring colour model with a brand ramp — plenty of time = brass/green, past half = amber, final ~5s = alert red (`var(--c-red)` ≈ `#b3162a`). Concretely, map the remaining fraction to discrete brand colours (e.g. `frac > .5 ? '#cda24b' : frac > .2 ? '#e0a64b' : '#b3162a'`), and change the `useState("#00f")` initial to the brass start. Keep the existing `.timer-low` final-state hook.
- `board.css`: change `.turn-banner`, `.timer-seconds`, `.rummikub-button` `font-family: 'Segoe UI'` → `'Poppins', system-ui, sans-serif` (the brand stack used elsewhere).
- `index.css`/`lobby.css`: make the `RummyCube` wordmark a single consistent treatment (pick the nav cream `#f5edd8` for both, or cream + thin brass — apply the same to the landing hero wordmark).

- [ ] **Step 4: Run tests + build**

Run: `npx jest src/tests/visual-system-a.test.js` then `npx jest`, `npm run build`, `npm run lint`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/PlayerAvatar.jsx src/rummikub/components/board.css src/rummikub/components/index.css src/rummikub/components/lobby.css src/tests/visual-system-a.test.js
git commit -m "style(ui): brand-ramped timer ring, Poppins everywhere, unified wordmark

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T4: Visual system B — centre the rack tiles, seat the avatar/undo-redo, radius/elevation tokens

**Files:**
- Modify: `src/rummikub/components/board.css` (`.hand-buttons` centring; `.rack-self` + `.rack-tools` seating; `.icon-button` visibility; add `--r-*`/`--elev-*` tokens and apply)
- Test: Create `src/tests/visual-system-b.test.js`

**Background:** The rack's 14–15 tiles are left-aligned in a wider panel → big empty wood on the right. The avatar + timer-ring + Your-turn banner + Undo/Redo float on the felt/rack seam like clipped-on overlays; the Undo/Redo `.icon-button` (`rgba(20,16,10,.42)`) are nearly invisible on the felt. Corner radii span 7 ad-hoc values.

- [ ] **Step 1: Write the failing test**

```js
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');

test('radius tokens are defined and used', () => {
  expect(css).toMatch(/--r-(sm|md|lg)\s*:/);
});
test('rack tiles are centred (not left-aligned only)', () => {
  // the hand grid container should centre its tiles
  expect(css).toMatch(/\.hand-buttons[^}]*(justify-content:\s*center|margin:\s*0\s*auto)/);
});
test('undo/redo icon buttons are more visible than the old .42 felt wash', () => {
  const m = css.match(/\.icon-button\s*\{[^}]*background[^;]*rgba\([^)]*\)/);
  expect(m).not.toBeNull();
  expect(m[0]).not.toMatch(/rgba\(20,\s*16,\s*10,\s*\.42\)/); // old near-invisible value gone
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/visual-system-b.test.js`
Expected: FAIL — no radius tokens; rack not centred; old icon-button wash.

- [ ] **Step 3: Implement**

- Centre the rack: give `.hand-buttons` (or the hand grid container) `justify-content: center` / `margin: 0 auto` so the tiles sit centred and the wood reads symmetric.
- Seat the avatar group: give `.rack-self` (avatar + name + turn dot) a small wood-toned nameplate base (reuse `--rack`) so it reads as part of the rack rather than floating; fold the `Your turn` banner into the nameplate (keep it, just contained). Make `.rack-tools` Undo/Redo sit on a more solid base — bump the `.icon-button` background from `rgba(20,16,10,.42)` to a more visible `rgba(40,30,16,.62)` + a 1px brass inset so they're discoverable but still quiet.
- Tokens: add `:root { --r-sm:6px; --r-md:10px; --r-lg:14px; --r-xl:18px; }` and 2 elevation shadows; replace the ad-hoc `border-radius` hardcodes on the major surfaces (tile/grid-item/icon/primary/chat/rack/lobby-card) with the nearest token. (Keep `999px` for pills.)

> Keep the T2 (round-4) lift-on-select + cursor + cue work intact. Don't regress the avatar offline badge / timer ring.

- [ ] **Step 4: Run tests + build**

Run: `npx jest src/tests/visual-system-b.test.js` then `npx jest`, `npm run build`, `npm run lint`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/board.css src/tests/visual-system-b.test.js
git commit -m "style(ui): centre rack tiles, seat avatar/undo-redo, radius/elevation tokens

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T5: Surface the hidden draw-2 rule on the Draw button

**Files:**
- Modify: `src/rummikub/components/Board.jsx` (the Draw button `~:499`)
- Test: Create `src/tests/draw-count-label.test.js`

**Background:** `moves.js` draws **2** tiles once `G.firstMoveDone[currentPlayer]` is true (`for i<(firstMoveDone?2:1)`), and the UI never says so — a timeout/draw after your first meld silently adds 2. Surface it: the Draw button shows the count it will draw. (This is DISPLAY only — NO rule change. Whether to keep the draw-2 variant or revert to draw-1 is an owner decision, flagged separately; this task does not change the rule.)

- [ ] **Step 1: Write the failing test**

Reuse the real-Board RTL harness (`coach-card.test.js` style). Render a match where it's the player's turn; with `G.firstMoveDone[playerID]` false the Draw button reads "Draw", with it true the button reads "Draw ×2".

```jsx
// firstMoveDone[playerID] === true on the player's turn → the draw button shows the ×2 count
test('Draw button shows ×2 after the first meld is done', () => {
  // ... render Board, your turn, firstMoveDone=[true,...] for playerID '0' ...
  expect(screen.getByRole('button', {name: /draw/i})).toHaveTextContent(/draw\s*[×x]\s*2/i);
});
test('Draw button shows plain "Draw" before the first meld', () => {
  // ... firstMoveDone=[false,...] ...
  expect(screen.getByRole('button', {name: /draw/i})).toHaveTextContent(/^draw$/i);
});
```

> Match the coach-card harness for how Board is mounted and how `G.firstMoveDone`/`playerID`/turn are set.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/draw-count-label.test.js`
Expected: FAIL — the button always reads "Draw".

- [ ] **Step 3: Implement**

In `Board.jsx`, compute `const drawCount = G.firstMoveDone[playerID] ? 2 : 1;` (mirror the server's `firstMoveDone?2:1`) and render the Draw button label as `Draw${drawCount > 1 ? ' ×2' : ''}` (and add a `title`/tooltip: `"After your first meld you draw 2 tiles"`). Don't change any move logic. Keep the existing draw `onClick`.

- [ ] **Step 4: Run tests + build**

Run: `npx jest src/tests/draw-count-label.test.js` then `npx jest`, `npm run build`, `npm run lint`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/Board.jsx src/tests/draw-count-label.test.js
git commit -m "feat(ui): surface the draw-2-after-first-meld rule on the Draw button

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T6: Thinking-clock relief — a one-time +15s per turn

**Files:**
- Modify: `src/rummikub/moves.js` (a new `extendTurn` move that adds a fixed amount to `G.timerExpireAt`, once per turn, only by the current player before the deadline)
- Modify: `src/rummikub/Game.js` (register `extendTurn`)
- Modify: `src/rummikub/components/Board.jsx` (a "+15s" button, enabled on your turn while not yet used this turn)
- Test: Create `src/tests/extend-turn.test.js` (reducer test, boardgame.io Client harness)

**Background:** A fixed 10–60s clock is harsh for a planning game; a single small relief lets a player who needs a few more seconds avoid a forced pass. Server-authoritative (the deadline lives in `G.timerExpireAt`; the existing `forceEndTurn` guard is unchanged).

- [ ] **Step 1: Write the failing test**

Reuse the boardgame.io `Client` + `Local()` reducer harness (like `retrieve-joker.test.js`). Assert: the current player can extend once (`G.timerExpireAt` increases by the fixed amount, `G.turnExtended[seat]` set); a second extend in the same turn is rejected (no further increase); a non-current player is rejected; `onTurnBegin` resets the per-turn used-flag.

```js
test('extendTurn adds time once per turn for the current player', () => {
  // ... set up a 2-player Local client, it's seat 0's turn, timerExpireAt = T ...
  // moves.extendTurn() → timerExpireAt === T + EXTEND_MS ; second call → unchanged
  // opponent extendTurn → INVALID_MOVE (unchanged)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/extend-turn.test.js`
Expected: FAIL — `extendTurn` not defined.

- [ ] **Step 3: Implement**

- `moves.js`: add `const EXTEND_TURN_MS = 15000;` and a move:

```js
function extendTurn({G, ctx, playerID}) {
  if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
  if (!Array.isArray(G.turnExtended)) G.turnExtended = [];
  const seat = Number(ctx.currentPlayer);
  if (G.turnExtended[seat]) return INVALID_MOVE;          // once per turn
  if (!G.timerExpireAt) return INVALID_MOVE;
  G.turnExtended[seat] = true;
  G.timerExpireAt = G.timerExpireAt + EXTEND_TURN_MS;
}
```

In `onTurnBegin`, clear the flag for the new seat: `if (Array.isArray(G.turnExtended)) G.turnExtended[Number(ctx.currentPlayer)] = false;` (or reset the array). Export + register `extendTurn` in `Game.js` `moves`.
- `Board.jsx`: add a small "+15s" button near the timer/controls, enabled when `isMyTurn && !waiting && !G.turnExtended?.[Number(playerID)]`, calling `moves.extendTurn()`.

- [ ] **Step 4: Run tests + build/boot**

Run: `npx jest src/tests/extend-turn.test.js` then `npx jest`, `npm run build`, `node src/server.js` boot check.
Expected: PASS; suite green; server boots.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/moves.js src/rummikub/Game.js src/rummikub/components/Board.jsx src/tests/extend-turn.test.js
git commit -m "feat(timer): one-time +15s turn extension (server-authoritative)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Final verification (after T6, before deploy)

- [ ] `npx jest` — full suite green (expect ~465+). `npm run build` OK; `npm run lint` no new errors; `node src/server.js` boots (with env) → `/games` == `["RummyCube"]`.
- [ ] Whole-branch review → finishing-a-development-branch (ff-merge, push) → DEPLOY (podman build + bake sanity-check + restart + verify container boots with env + live `/games` 200).
- [ ] **LIVE VISUAL SMOKE (required for the CSS work):** Playwright screenshots of the live game — confirm the chat is a FAB (no empty right gutter), the rack sits higher / tiles centred, the timer ring uses brand colours, the Draw button shows ×2 after a meld, the +15s button works, and the board fits a 390px mobile viewport without horizontal scroll. Iterate on any rule that didn't land visually.

> **draw-2 rule (owner decision, not in this plan):** T5 only *surfaces* the existing draw-2-after-first-meld behavior. Whether to KEEP it (a house variant) or REVERT to standard draw-1 is an owner call — raise it after this ships.
