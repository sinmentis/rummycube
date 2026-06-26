# RummyCube Round-5a Implementation Plan (P0 + P1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed bugs + pay down low-risk health debt (P0), and make the friend-only core loop — invite → join → rematch → identity — frictionless (P1).

**Architecture:** All client-side or pure-module changes plus one tiny server-side logging utility; the boardgame.io server stays the rules authority and no Rummikub rule changes. Scope is from `docs/optimization/2026-06-26-review5-recommendations.md` (P0 + P1 only; P2/P3 + the architecture refactor track are a later wave).

**Tech Stack:** React 18 + Vite, boardgame.io 0.50 (+ LobbyClient), @dnd-kit, Jest + React Testing Library (jsdom). ~442 tests, all green.

## Global Constraints

- Server authority + Rummikub rules unchanged. No new runtime dependencies beyond dev-only ESLint tooling (P0-4). English code/comments/tests/UI copy. Conventional Commits + trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- After each task: full `npx jest` green; `npm run build` succeeds; `node src/server.js` boots and `/games` returns `["RummyCube"]`. No new `console.log` in the Vite-built frontend bundle (the build strips `console.*` via `dropConsolePlugin`, but the server runs raw — see P0-2).
- The frontend bakes `REACT_APP_*` at build time; do NOT introduce `.env*.local`. Match data `playerID`/seat ids are strings in some paths, numbers in others — keep existing coercions.

**Recommended order:** T1 → T9 (P0 first, then P1). Serial hotspots: `GameOverModal.jsx` (T1, T9), `CreateGame.jsx` (T5, T8), `constants.js` (T3).

---

### Task T1: Fix GameOverModal standings sort (sort by score, not seat-id)

**Files:**
- Modify: `src/rummikub/components/GameOverModal.jsx:74-81` (the standings `.sort`)
- Modify: `src/rummikub/components/GameOverModal.css` (optional medal styling)
- Test: Create `src/tests/gameover-standings.test.js`

**Interfaces:**
- Consumes: `gameover.points` (object `{seatId: score}`), `matchData` (array of `{id,name}`), `gameover.winner`.
- Produces: standings list rendered in descending score order, winner first.

**Background:** `GameOverModal.jsx:75` is `.sort((a,b)=>b[0]-a[0])` — `a[0]/b[0]` are the seat-id KEYS from `Object.entries`, so the list sorts by seat number, not score. Winner can render last.

- [ ] **Step 1: Write the failing test**

```jsx
import React from 'react';
import {render, screen, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import GameOverModal from '../rummikub/components/GameOverModal';

jest.mock('canvas-confetti', () => () => {});
jest.mock('../rummikub/sound/sfx', () => ({play: () => {}}));

test('standings are sorted by score descending, winner first', () => {
  // seat 0 scored 5, seat 1 scored 40 (winner), seat 2 scored 12
  const gameover = {winner: '1', points: {0: 5, 1: 40, 2: 12}};
  const matchData = [{id: 0, name: 'Al'}, {id: 1, name: 'Bo'}, {id: 2, name: 'Cy'}];
  render(<MemoryRouter><GameOverModal gameover={gameover} matchId="m1" playerID="1" matchData={matchData}/></MemoryRouter>);
  const items = screen.getAllByRole('listitem').map(li => li.textContent);
  expect(items[0]).toMatch(/Bo/);   // 40 pts first
  expect(items[1]).toMatch(/Cy/);   // 12 pts
  expect(items[2]).toMatch(/Al/);   // 5 pts last
  expect(items[0]).toMatch(/40/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/gameover-standings.test.js`
Expected: FAIL — current order is by seat-id (Al, Bo, Cy or reverse), not by score.

- [ ] **Step 3: Implement the fix**

In `GameOverModal.jsx`, change the sort to compare the VALUE (score) descending, and add medals for the top 3:

```jsx
                    {Object.entries(gameover.points)
                        .sort((a, b) => b[1] - a[1])
                        .map(([seat, pts], i) => (
                            <li key={seat} className="gameover-score-item">
                                <span className="gameover-rank">{['🥇','🥈','🥉'][i] || ''}</span>
                                {matchData[parseInt(seat)].name} <strong>{pts} pts</strong>
                            </li>
                        ))}
```

(Optional `GameOverModal.css`: `.gameover-rank { margin-right: 6px; }`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/tests/gameover-standings.test.js`
Expected: PASS. Then `npx jest` whole suite green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/GameOverModal.jsx src/rummikub/components/GameOverModal.css src/tests/gameover-standings.test.js
git commit -m "fix(gameover): sort standings by score, not seat id

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T2: Level-gated server logging (stop printing the deck order every draw)

**Files:**
- Create: `src/rummikub/logger.js`
- Modify: `src/rummikub/moves.js` (replace hot-path `console.log`/`console.debug` — esp. the per-draw deck dump `~:47-48` and the per-turn `new Date()` logs in `onTurnBegin`/`onTurnEnd`/`onPlayPhaseBegin`)
- Test: Create `src/tests/logger.test.js`

**Interfaces:**
- Produces: `logger` with `.debug/.info/.warn/.error` gated by a level read from `process.env.LOG_LEVEL` (default `warn` in production, so `debug`/`info` are silent by default).

**Background:** `src/server.js` runs raw Node (no console stripping); `moves.js` has ~22 `console.*`, including `drawTile` logging the entire remaining `tilesPool` order on every draw, and per-turn timestamps. This floods prod logs (512M container) and needlessly externalizes state.

- [ ] **Step 1: Write the failing test**

```js
const {makeLogger} = require('../rummikub/logger');

test('logger gates by level: debug silent at warn, error always logs', () => {
  const calls = [];
  const sink = (level, args) => calls.push([level, args.join(' ')]);
  const warnLogger = makeLogger('warn', sink);
  warnLogger.debug('deck', 'a,b,c');
  warnLogger.info('turn began');
  warnLogger.warn('low');
  warnLogger.error('boom');
  expect(calls.map(c => c[0])).toEqual(['warn', 'error']); // debug+info suppressed at warn
  const debugLogger = makeLogger('debug', sink);
  debugLogger.debug('x');
  expect(calls.some(c => c[0] === 'debug')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/logger.test.js`
Expected: FAIL — `makeLogger` not defined.

- [ ] **Step 3: Implement the logger + swap hot-path logs**

Create `src/rummikub/logger.js`:

```js
// Tiny level-gated logger for the server-side game module (src/server.js runs
// raw Node, so console.* there is NOT stripped by the Vite build). Default level
// is 'warn' so per-move/per-turn debug noise (e.g. the deck order) stays silent
// in production; set LOG_LEVEL=debug to see it.
const LEVELS = {debug: 10, info: 20, warn: 30, error: 40};

export function makeLogger(level = 'warn', sink = null) {
  const min = LEVELS[level] ?? LEVELS.warn;
  const emit = sink || ((lvl, args) => (console[lvl] || console.log)(...args));
  const at = (lvl) => (...args) => { if (LEVELS[lvl] >= min) emit(lvl, args); };
  return {debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error')};
}

export const logger = makeLogger(
  (typeof process !== 'undefined' && process.env && process.env.LOG_LEVEL) || 'warn'
);
```

In `src/rummikub/moves.js`: `import {logger} from './logger.js';` and replace the noisy hot-path logs — the per-draw `console.log(\`tiles pool: ...\`)` (~:47-48) and the per-turn `console.log('ON TURN BEGIN'/'ON TURN END'/...)` with `logger.debug(...)` (drop the raw deck array from the message — log only a count, e.g. `logger.debug('draw', {poolLeft: G.tilesPool.length})`). Leave genuine warnings/errors as `logger.warn/error`. Do NOT change move logic.

- [ ] **Step 4: Run tests**

Run: `npx jest src/tests/logger.test.js` then `npx jest`
Expected: PASS; whole suite green. Boot check: `node src/server.js` starts without the per-draw deck dump (set `LOG_LEVEL` unset → warn).

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/logger.js src/rummikub/moves.js src/tests/logger.test.js
git commit -m "chore(server): level-gated logger; stop dumping deck order per draw

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T3: Validate env-derived game rules + delete dead code

**Files:**
- Modify: `src/rummikub/constants.js` (`:3` dead `HAND_ROWS` ternary; `:6-7` env `parseInt`)
- Test: Create `src/tests/constants-env.test.js`

**Interfaces:**
- Produces: `TILES_TO_DRAW`, `FIRST_MOVE_SCORE_LIMIT` guaranteed finite numbers (module throws at import if the env yields `NaN`).

**Background:** `constants.js:6-7` does `parseInt(process.env.REACT_APP_TILES_TO_DRAW)` with no validation → a missing/typo'd var silently becomes `NaN` and is baked into the bundle, corrupting deal size / first-meld threshold. `HAND_ROWS = IS_DEV ? 2 : 2` is a dead ternary.

- [ ] **Step 1: Write the failing test**

```js
test('constants exports finite TILES_TO_DRAW and FIRST_MOVE_SCORE_LIMIT', () => {
  const c = require('../rummikub/constants');
  expect(Number.isFinite(c.TILES_TO_DRAW)).toBe(true);
  expect(Number.isFinite(c.FIRST_MOVE_SCORE_LIMIT)).toBe(true);
});

test('requireFiniteInt throws on NaN-producing env', () => {
  const {requireFiniteInt} = require('../rummikub/constants');
  expect(() => requireFiniteInt('REACT_APP_X', undefined)).toThrow(/REACT_APP_X/);
  expect(requireFiniteInt('REACT_APP_X', '14')).toBe(14);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/constants-env.test.js`
Expected: FAIL — `requireFiniteInt` not exported.

- [ ] **Step 3: Implement validation + delete dead code**

In `src/rummikub/constants.js`: delete the `HAND_ROWS = IS_DEV ? 2 : 2` ternary, replace with `const HAND_ROWS = 2`. Add and use a validator:

```js
export function requireFiniteInt(name, raw) {
  const n = parseInt(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Config error: ${name} must be an integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}
const TILES_TO_DRAW = requireFiniteInt('REACT_APP_TILES_TO_DRAW', process.env.REACT_APP_TILES_TO_DRAW);
const FIRST_MOVE_SCORE_LIMIT = requireFiniteInt('REACT_APP_FIRST_MOVE_SCORE_LIMIT', process.env.REACT_APP_FIRST_MOVE_SCORE_LIMIT);
```

> The test env must define these (jest reads `.env`/`.env.test` via the existing setup, or they default in `.env.production`). If the jest run doesn't have them set, add them to the jest setup/`.env.test` so the suite imports cleanly — verify how the existing tests get `REACT_APP_*` (they already import `constants` indirectly) and follow that path; do NOT introduce `.env*.local`.

- [ ] **Step 4: Run tests**

Run: `npx jest src/tests/constants-env.test.js` then `npx jest`
Expected: PASS; whole suite green (existing tests still import constants fine).

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/constants.js src/tests/constants-env.test.js
git commit -m "fix(config): validate env-derived rule constants; drop dead HAND_ROWS ternary

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T4: Add ESLint + react-hooks (non-blocking baseline)

**Files:**
- Create: `.eslintrc.cjs`, `.eslintignore`
- Modify: `package.json` (devDeps + `lint` script)

**Interfaces:**
- Produces: `npm run lint` runs ESLint over `src/`; `react-hooks/rules-of-hooks` is an ERROR (real bugs), `react-hooks/exhaustive-deps` is a WARNING (surfaces the `gRef` deps foot-guns without blocking).

**Background:** Zero static analysis today. exhaustive-deps mechanically surfaces the dependency-array issues the later Board refactor must fix. Adding it must NOT turn the existing codebase red on `build`/`test` — it's a separate `lint` script, hooks-deps as warnings.

- [ ] **Step 1: Install + configure**

```bash
npm install --save-dev eslint@^8 eslint-plugin-react@^7 eslint-plugin-react-hooks@^4
```

Create `.eslintrc.cjs`:

```js
module.exports = {
  root: true,
  env: {browser: true, node: true, es2022: true, jest: true},
  parserOptions: {ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: {jsx: true}},
  settings: {react: {version: 'detect'}},
  plugins: ['react', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  rules: {
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'no-unused-vars': 'warn',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
```

Create `.eslintignore`:

```
node_modules
build
dist
.playwright-mcp
```

Add to `package.json` scripts: `"lint": "eslint src --ext .js,.jsx"`.

- [ ] **Step 2: Run lint, confirm it runs (warnings OK, no errors that block)**

Run: `npm run lint`
Expected: it executes and reports warnings; if it reports `rules-of-hooks` ERRORS, those are real bugs — fix the minimal offending hook calls (do not silence the rule). Warnings (`exhaustive-deps`, `no-unused-vars`) are acceptable for this baseline.

- [ ] **Step 3: Verify build + tests unaffected**

Run: `npx jest && npm run build`
Expected: both green (lint is a separate script, not wired into build/test).

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.cjs .eslintignore package.json package-lock.json
git commit -m "build: add ESLint + react-hooks baseline (exhaustive-deps as warning)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T5: Landing — Create no longer defaults to a broken-looking disabled grey

**Files:**
- Modify: `src/rummikub/components/CreateGame.jsx:101-106` (the Create button) + autofocus username
- Modify: `src/rummikub/components/lobby.css` (a `.lobby-btn-primary` that stays branded; an inline hint style)
- Test: Create `src/tests/create-cta.test.js`

**Background:** With an empty username the Create button renders in the grey `.lobby-btn:disabled` skin (`lobby.css:169`), so the hero's primary CTA looks broken. Keep the branded green skin; nudge the user to fill the name instead of greying out.

- [ ] **Step 1: Write the failing test**

```jsx
import React from 'react';
import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import CreateGameForm from '../rummikub/components/CreateGame';

test('Create button keeps the branded primary class even with empty username', () => {
  render(<MemoryRouter><CreateGameForm/></MemoryRouter>);
  const btn = screen.getByRole('button', {name: /create/i});
  expect(btn).toHaveClass('lobby-btn-primary'); // branded, not the grey disabled-only look
  // username input is autofocused
  expect(screen.getByLabelText(/username/i)).toHaveFocus();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/create-cta.test.js`
Expected: FAIL — username not autofocused (and/or the disabled greying logic).

- [ ] **Step 3: Implement**

In `CreateGame.jsx`: add `autoFocus` to the username input. Keep the button enabled-looking: instead of `disabled={!username || !numPlayers}` giving the grey skin, keep `disabled` for the submit guard but ensure the class stays `lobby-btn lobby-btn-primary` (it already does) and show an inline hint when empty:

```jsx
            <button
                type="submit"
                className="lobby-btn lobby-btn-primary"
                disabled={!username || !numPlayers}>
                Create
            </button>
            {!username && <p className="lobby-hint">Enter a username to start.</p>}
```

In `lobby.css`, soften the disabled state so the primary button stays visibly branded (not 50%-faded grey) when disabled — e.g. keep the green gradient at reduced opacity with `cursor: not-allowed`, rather than the `#ddd2b4→#cabd98` grey:

```css
.lobby-btn-primary:disabled {
    background: linear-gradient(#3a7d50, #205233);
    color: rgba(255, 255, 255, .75);
    opacity: .7;
    cursor: not-allowed;
}
.lobby-hint { margin: 6px 0 0; font-size: .85rem; color: var(--ink-soft, #6b5d42); text-align: center; }
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/tests/create-cta.test.js` then `npx jest`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/CreateGame.jsx src/rummikub/components/lobby.css src/tests/create-cta.test.js
git commit -m "fix(lobby): keep Create CTA branded (no broken-looking grey) + autofocus username

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T6: Put the invite (code + Copy link) inside the waiting card

**Files:**
- Modify: `src/rummikub/components/Board.jsx` (the `.waiting-card` overlay ~`:679-682`)
- Modify: `src/rummikub/components/board.css` (waiting-card invite styling)
- Test: Create `src/tests/waiting-invite.test.js` (reuse the coach-card RTL Board harness)

**Background:** The invite (code + Copy link) currently lives only in the top-left `Sidebar` (`Sidebar.jsx:22-36`); the central "Waiting for players…" card (`Board.jsx:679`) has no share control, so hosts don't know how to invite. Surface the same copy-link inside the waiting card with a confirmation toast.

- [ ] **Step 1: Write the failing test**

Reuse the real-Board RTL harness (copy the mock/`renderBoard` setup from `src/tests/coach-card.test.js`; render a 2-player match with only seat 0 named so `isWaitingForPlayers` is true). Assert the waiting card shows the room code and a Copy-link button:

```jsx
// in waiting state (2 players, seat 1 unnamed): the waiting card contains the
// match code and a "Copy link" button.
test('waiting card surfaces the invite (code + copy link)', () => {
  // ... render Board in waiting state with matchID="m1" ...
  const card = screen.getByRole('status'); // .waiting-overlay role="status"
  expect(within(card).getByText('m1')).toBeInTheDocument();
  expect(within(card).getByRole('button', {name: /copy link/i})).toBeInTheDocument();
});
```

> Match how `coach-card.test.js` mounts Board and what props carry `matchID`. Assert presence of the code + a copy button within the waiting overlay.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/waiting-invite.test.js`
Expected: FAIL — no invite in the waiting card.

- [ ] **Step 3: Implement**

In `Board.jsx`, inside the `.waiting-card`, add an invite block reusing the Sidebar copy pattern (`copyToClipboard(\`${window.location.origin}/join-match/${matchID}\`)` with a 1.5s "Copied!" toast via local state). Render the `matchID` and a `Copy link` button. Keep the existing spinner + "Waiting… N of M joined" text. Style `.waiting-card .invite-*` in `board.css` to match the existing `.invite-panel`.

- [ ] **Step 4: Run tests**

Run: `npx jest src/tests/waiting-invite.test.js` then `npx jest`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/Board.jsx src/rummikub/components/board.css src/tests/waiting-invite.test.js
git commit -m "feat(lobby): show invite link inside the waiting card

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T7: Join accepts a pasted invite link + unified copy

**Files:**
- Create: `src/rummikub/matchId.js` (pure `extractMatchId`)
- Modify: `src/rummikub/components/JoinGame.jsx` (`:74` placeholder, `:13` use the helper)
- Test: Create `src/tests/match-id.test.js`

**Background:** Join's field is labelled "Room code" but the placeholder says "Enter match ID", and pasting the full invite link a friend sends (`/join-match/<id>`) fails `listSeats`. Accept both.

- [ ] **Step 1: Write the failing test**

```js
import {extractMatchId} from '../rummikub/matchId';

test('extractMatchId accepts a bare code or a full invite link', () => {
  expect(extractMatchId('abc123')).toBe('abc123');
  expect(extractMatchId('  abc123  ')).toBe('abc123');
  expect(extractMatchId('https://game.shunlyu.com/join-match/abc123')).toBe('abc123');
  expect(extractMatchId('https://game.shunlyu.com/match/abc123')).toBe('abc123');
  expect(extractMatchId('https://game.shunlyu.com/join-match/abc123?x=1')).toBe('abc123');
  expect(extractMatchId('')).toBe('');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/match-id.test.js`
Expected: FAIL — `extractMatchId` not defined.

- [ ] **Step 3: Implement helper + wire into Join**

Create `src/rummikub/matchId.js`:

```js
// Accept either a bare room code or a full invite/match URL and return the id.
export function extractMatchId(input) {
  const s = (input || '').trim();
  if (!s) return '';
  const m = s.match(/\/(?:join-match|match)\/([^/?#]+)/);
  if (m) return m[1];
  // strip any query/hash if someone pasted a partial; otherwise it's a bare code
  return s.split(/[?#]/)[0];
}
```

In `JoinGame.jsx`: import it; in `onMatchIDChange`, set the field to the raw value but call `client.listSeats(extractMatchId(matchID))` and use `extractMatchId(matchID)` in `onJoinMatch` too; change the placeholder `"Enter match ID"` → `"Room code or invite link"`. (Store the extracted id for the actual join so a pasted link resolves.)

- [ ] **Step 4: Run tests**

Run: `npx jest src/tests/match-id.test.js` then `npx jest`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/matchId.js src/rummikub/components/JoinGame.jsx src/tests/match-id.test.js
git commit -m "feat(lobby): join accepts a pasted invite link; unify room-code wording

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T8: Remember the player's username across sessions

**Files:**
- Modify: `src/rummikub/components/CreateGame.jsx` (username initial state + persist on create + "Welcome back")
- Test: Create `src/tests/username-persist.test.js`

**Background:** Username is retyped every visit (`useState(IS_DEV?'test':'')`). Persist it in `localStorage` (the same store reconnect uses) so returning players don't re-enter it.

- [ ] **Step 1: Write the failing test**

```jsx
import React from 'react';
import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import CreateGameForm from '../rummikub/components/CreateGame';

const KEY = 'rummycube:username';
beforeEach(() => localStorage.clear());

test('prefills the username from localStorage and greets the returning player', () => {
  localStorage.setItem(KEY, 'Robin');
  render(<MemoryRouter><CreateGameForm/></MemoryRouter>);
  expect(screen.getByLabelText(/username/i)).toHaveValue('Robin');
  expect(screen.getByText(/welcome back/i)).toHaveTextContent(/Robin/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/username-persist.test.js`
Expected: FAIL — no prefill/greeting.

- [ ] **Step 3: Implement**

In `CreateGame.jsx`: initialise username from `localStorage['rummycube:username']` (falling back to the existing `IS_DEV?'test':''`), write it back in `onGameCreate` before navigating, and render `{savedName && <p className="lobby-welcome">Welcome back, {savedName} 👋</p>}` near the username field. Guard all `localStorage` access in try/catch (private mode).

- [ ] **Step 4: Run tests**

Run: `npx jest src/tests/username-persist.test.js` then `npx jest`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/CreateGame.jsx src/tests/username-persist.test.js
git commit -m "feat(lobby): remember username across sessions + welcome-back greeting

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T9: Rematch keeps your own seat (drop the random shuffle)

**Files:**
- Modify: `src/rummikub/components/GameOverModal.jsx:37-45` (the seat selection in `onPlayAgain`)
- Test: Create `src/tests/rematch-seat.test.js`

**Background:** `onPlayAgain` joins the next match (boardgame.io `playAgain` gives every player the SAME `nextMatchID`, so a group reconverges) but picks a seat via `shuffle(matchData.players)` → first empty — randomising who lands where and discarding the player's original seat. Prefer the player's ORIGINAL seat when it's free (deterministic, group stays in place), else the first free seat.

- [ ] **Step 1: Write the failing test**

Extract the seat-choice into a pure helper so it's testable:

```js
import {chooseRematchSeat} from '../rummikub/components/GameOverModal';

test('chooseRematchSeat keeps your own seat when free, else first free', () => {
  const seats = [{id: 0, name: null}, {id: 1, name: 'X'}, {id: 2, name: null}];
  expect(chooseRematchSeat(seats, '2')).toBe(2);   // own seat (2) free → keep it
  expect(chooseRematchSeat(seats, '1')).toBe(0);   // own seat taken → first free (0)
  expect(chooseRematchSeat([{id:0,name:'A'}], '0')).toBe(0); // none free → fall back to own id
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/tests/rematch-seat.test.js`
Expected: FAIL — `chooseRematchSeat` not exported.

- [ ] **Step 3: Implement**

In `GameOverModal.jsx`, add and export:

```js
export function chooseRematchSeat(players, ownPlayerID) {
  const own = parseInt(ownPlayerID);
  const ownFree = players.find(p => p.id === own && !p.name);
  if (ownFree) return own;
  const firstFree = players.find(p => !p.name);
  return firstFree ? firstFree.id : own;
}
```

Replace the `shuffle(...)` seat loop in `onPlayAgain` with `const seat = chooseRematchSeat(matchData.players, playerID);` (remove the `lodash/shuffle` import if now unused).

- [ ] **Step 4: Run tests**

Run: `npx jest src/tests/rematch-seat.test.js` then `npx jest`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/GameOverModal.jsx src/tests/rematch-seat.test.js
git commit -m "fix(rematch): keep your own seat on Play Again instead of a random shuffle

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Final verification (after T9, before deploy)

- [ ] `npx jest` — full suite green (expect ~455+).
- [ ] `npm run build` — succeeds; `npm run lint` runs (warnings ok, no rules-of-hooks errors).
- [ ] `node src/server.js` boots on a free PORT; `/games` → `["RummyCube"]`; no per-draw deck dump in stdout.
- [ ] Whole-branch review → finishing-a-development-branch (ff-merge, push) → DEPLOY (podman build + bake sanity-check `game.shunlyu.com>0`/`127.0.0.1=0` + restart + live `/games` 200 + new strings present, e.g. the GameOver medal/standings or the waiting-card invite copy).

> **Wave 2 (next):** P2 (table layout/visual/mobile) + P3 (timer clarity) get their own plan after this ships.
