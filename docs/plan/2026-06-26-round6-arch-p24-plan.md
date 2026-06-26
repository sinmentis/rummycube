# RummyCube Round-6 Implementation Plan (Architecture track + P2-4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Pay down the architecture debt — split the three god-files (`Board.jsx` 798, `moves.js` 587, `util.js` 661) into focused, single-responsibility modules + Board hooks, document the invariants, and harden the test seams — WITHOUT changing any behavior. Plus P2-4: surface this-game highlights at game-over.

**Architecture:** Behavior-preserving refactor pinned by the existing **471-test** suite (the spec). The key safety device is the **barrel re-export**: for every pure split of `util.js`/`moves.js`, move the bodies to new modules and `export … from` the new path in the old file, so all ~40 import sites stay valid (zero rewiring, green by construction). The ONE deliberate exception is the DOM eviction (drops its re-export to keep the server module graph DOM-free). Board hooks ride behind the ESLint `react-hooks/exhaustive-deps` guard (landed in Round-5a). Detailed seam map: `docs/optimization/2026-06-26-review6-arch-backbone.md` — **every task cites a section; read it for exact line ranges, signatures, importers, and footguns.**

**Tech Stack:** React 18 + Vite, boardgame.io 0.50 (server-authoritative), @dnd-kit, Jest + RTL, immer.

## Global Constraints

- **Behavior-preserving:** no Rummikub rule / move / scoring / playerView / turn-logic change. Move bodies **verbatim** — do NOT "clean up" while moving. The whole `npx jest` suite (471) must stay green after EVERY task; that is the primary gate. Server stays authority.
- **Barrel rule:** util/moves splits keep the old file as a re-export barrel (zero import rewiring). The DOM eviction (T2) is the only split that REMOVES its re-export.
- **Five invariants every task preserves** (backbone §5): (1) move atomicity (INVALID_MOVE ⇒ immer draft discarded ⇒ G untouched; pure `computePlayScore` must not mutate G); (2) privacy seam (`playerView` strips opponent hands, zeroes `tilesPool`, clears non-current `recentlyDrawnTiles`); (3) DOM-free server graph after T2; (4) shared client/server kernel stays pure; (5) connection state written only by the server transport.
- No new runtime deps. No new `console.log`. English code/comments/tests/commit. Conventional Commits + trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. After each task: `npx jest` green; `npm run build` OK; `npm run lint` no NEW errors (the 2 pre-existing App.jsx/Hand.jsx remain); `node src/server.js` boots (with env).

**Order (dependency-safe, lowest-risk first — backbone §3):** T1 docs → T2 DOM eviction → T3 util pure splits → T4 playerView → T5 playScore → T6 turn.js → T7 makeMatch → T8/T9/T10 Board hooks → T11 P2-4. Serial hotspots: `util.js` (T2,T3,T4), `moves.js` (T5,T6), `Board.jsx` (T8,T9,T10), `GameOverModal.jsx`/`moves.js` (T11).

---

### Task T1: ARCHITECTURE.md + pin boardgame.io (ARCH-3 + ARCH-5 version-pin)

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Modify: `package.json` (`"boardgame.io"` caret → exact)

**Background:** No doc captures the non-obvious invariants new contributors must not violate. And `connTransport.js` couples boardgame.io private internals, so a patch bump could silently break it.

- [ ] **Step 1: Write `docs/ARCHITECTURE.md`** (backbone §2.1) covering: (a) the **G field table + invariants** (`tilePositions`/`prevTilePositions` turn-start baseline reset in `onTurnBegin`, `tilesPool` zeroed by playerView, `firstMoveDone[]`, `gameStateStack`/`redoMoveStack` cleared each turn-begin, `lastCircle`, `recentlyDrawnTiles` stripped for non-current viewer, `lastPlay`, `lastTimeout` transient staleness-cleared, `connected`/`disconnectTurns`/`forfeited`/`turnExtended` server-authoritative arrays); (b) the **move-atomicity contract** (INVALID_MOVE ⇒ immer draft discarded ⇒ no-op; cite the for-loop early-return, submitMeld no-op, forceEndTurn deadline guard); (c) the **module map** (who is pure / server-importable / the privacy boundary) + the **client/server shared-kernel list**; (d) the **connection seam** (`connTransport` mirrors socket connect/disconnect into `G.connected` via `_setConnection`, seat server-resolved). Keep it terse; link to line ranges.
- [ ] **Step 2: Pin boardgame.io** — in `package.json`, change the `boardgame.io` dependency from `"^0.50.x"` to the exact installed version (drop the caret) so a patch bump can't break the `connTransport.js` private-internals assumptions. Run `npm install` to update the lockfile to match (no version change, just removes the caret range). Document this pin + the `connTransport` fragility in ARCHITECTURE.md.
- [ ] **Step 3: Verify** — `npx jest` green (no code change), `npm run build` OK, `node src/server.js` boots.
- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md package.json package-lock.json
git commit -m "docs: add ARCHITECTURE.md (G invariants, move contract, module map); pin boardgame.io

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T2: Evict DOM utils → `components/domUtil.js` (ARCH-2, backbone §2.7)

**Files:**
- Create: `src/rummikub/components/domUtil.js`
- Modify: `src/rummikub/util.js` (remove `copyToClipboard`/`stringToColor` bodies AND their export — NO barrel re-export here)
- Modify (rewire imports): `components/Board.jsx`, `components/Sidebar.jsx`, `components/CreateGame.jsx`, `components/GameOverModal.jsx` (`copyToClipboard`), `components/PlayerAvatar.jsx` (`stringToColor`); tests `src/tests/waiting-invite.test.js`, `src/tests/invite-panel.test.js` (import from `../rummikub/components/domUtil`)
- Test: Create `src/tests/server-graph-dom-free.test.js`

**Background:** `util.js` defines `copyToClipboard` (touches document/navigator/window) + `stringToColor` and is imported by `Game.js`/`moves.js` — so DOM symbols sit in the server's module graph (never called, but present). This is the ONE split that REMOVES the re-export so the server graph genuinely stops referencing DOM.

- [ ] **Step 1: Write the failing guard test** — `src/tests/server-graph-dom-free.test.js`:

```js
const fs = require('fs');
const path = require('path');
test('util.js (server-imported) references no DOM globals', () => {
  const src = fs.readFileSync(path.join(__dirname, '../rummikub/util.js'), 'utf8');
  expect(src).not.toMatch(/\b(document|navigator|window)\b/);
});
```

- [ ] **Step 2: Run it → FAIL** (`util.js` still has `copyToClipboard`'s `document`/`navigator`).
- [ ] **Step 3: Implement** — create `components/domUtil.js` with `copyToClipboard(textToCopy)` + `stringToColor(str)` (move `util.js:466-490, 492-499` VERBATIM). Delete them from `util.js` and DO NOT re-export. Rewire the 5 prod + 2 test importers to `./domUtil` / `../components/domUtil` / `../rummikub/components/domUtil`.
- [ ] **Step 4: Run tests** — `npx jest src/tests/server-graph-dom-free.test.js` PASS; `npx jest` whole suite green; `grep -n "document\|navigator\|window" src/rummikub/util.js` → empty; `npm run build` OK.
- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/domUtil.js src/rummikub/util.js src/rummikub/components/Board.jsx src/rummikub/components/Sidebar.jsx src/rummikub/components/CreateGame.jsx src/rummikub/components/GameOverModal.jsx src/rummikub/components/PlayerAvatar.jsx src/tests/waiting-invite.test.js src/tests/invite-panel.test.js src/tests/server-graph-dom-free.test.js
git commit -m "refactor: evict DOM utils to components/domUtil.js (keep server graph DOM-free)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T3: Split util.js pure domains via barrel — codec, sequence, scoring, projection (ARCH-2, backbone §2.2-2.5)

**Files:**
- Create: `src/rummikub/tile/codec.js`, `src/rummikub/tile/sequence.js`, `src/rummikub/scoring.js`, `src/rummikub/projection.js`
- Modify: `src/rummikub/util.js` (becomes a barrel — move bodies out, `export … from` each new module)
- Test: none new (the existing suite is the guard)

**Background:** Mechanical move + barrel re-export, ordered by dependency (codec is the root). Zero import rewiring — every existing `from '../rummikub/util'` stays valid via the barrel. Green by construction.

- [ ] **Step 1: `tile/codec.js`** — move `util.js:47-113` + `RedJoker`/`BlackJoker` (`buildTileObj`,`deactivateTileVariant`,`getTileValue`,`getTileColor`,`getTileReadableName`,`setTileValue`,`setTileColor`,`getTiles`,`isJoker`,`RedJoker`,`BlackJoker`) VERBATIM. Deps: `constants`, `lodash/range`, `lodash/invert`. In `util.js`: `export {buildTileObj, deactivateTileVariant, getTileValue, getTileColor, getTileReadableName, setTileValue, setTileColor, getTiles, isJoker, RedJoker, BlackJoker} from './tile/codec.js';`
- [ ] **Step 2: `tile/sequence.js`** — move `util.js:115-149,152-158,160-162,164-236,238-246,255-266,268-327,329-332,378-402,404-453` VERBATIM (`isSameColor/isDiffColor/isSameValue`,`extractJoker`,`freezeJokerProp`,`freezeJokersInRun`,`freezeJokersInGroup`,`freezeSeqJokers`,`countSeqScore`,`isSequenceValid`,`tryOrderTiles`,`groupValidSequences`). **Do NOT clean up `freezeJokersInRun`** (dense recursion + edge `null`s — move exactly). Deps: `tile/codec.js`, lodash. Barrel re-export from `util.js`.
- [ ] **Step 3: `scoring.js`** — move `util.js:334-376` (`countPoints`,`findWinner` — preserve the `winner_points=1000` sentinel) VERBATIM. Deps: `tile/codec.js`, `lodash/flatten`. Barrel re-export.
- [ ] **Step 4: `projection.js`** — move `util.js:35-45,501-524,526-532,605-620` (`count2dArrItems`,`buildGridsFromTilePositions` — keep the `row<BOARD_ROWS` bounds drop,`getPlayerHandTiles`,`getHandsTilesGrid`) VERBATIM. Deps: `constants`. Barrel re-export.
- [ ] **Step 5: Verify after EACH step** — `npx jest` green; after all four, `npm run build` OK + `node src/server.js` boots. (Residual `util.js`: `isPrimitive`/`objectsEqual`/`arraysEqual`/`transpose`/`getSecTs`/`getGameState` stay — they're the kernel/dead helpers; do NOT move them, per backbone §6 YAGNI.)
- [ ] **Step 6: Commit** (one commit for the four pure splits)

```bash
git add src/rummikub/tile/codec.js src/rummikub/tile/sequence.js src/rummikub/scoring.js src/rummikub/projection.js src/rummikub/util.js
git commit -m "refactor(util): split tile codec/sequence + scoring + projection into modules (barrel re-export)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T4: Extract the privacy seam → `playerView.js` (ARCH-2, backbone §2.6)

**Files:**
- Create: `src/rummikub/playerView.js`
- Modify: `src/rummikub/util.js` (barrel re-export `playerView` + the helpers), `src/rummikub/Game.js` (import `playerView` from `./playerView.js` — or keep via barrel)
- Test: none new (`player-view.test.js` is the guard)

**Background (SECURITY — Med risk):** This is the privacy seam. Move `util.js:534-603` VERBATIM (`deriveHandCounts`, `stripHandTilePositions`, `sanitizeSnapshot`, `playerView`). It MUST keep: stripping opponent hands, zeroing `tilesPool` to `Array(len).fill(0)`, clearing `recentlyDrawnTiles` for non-current viewers, and the exact `viewerID` string coercion (`playerID.toString()`, `pos.playerID.toString() === viewerID`). Add NO logic — an off-by-one in the coercion leaks hands.

- [ ] **Step 1:** Create `playerView.js` with the four functions moved verbatim (deps: `constants` HAND_GRID_ID, `lodash/cloneDeep`). Barrel re-export from `util.js` (keeps `player-view.test.js:1` green). Optionally point `Game.js`'s `playerView` import at `./playerView.js` directly.
- [ ] **Step 2: Run the guard** — `npx jest src/tests/player-view.test.js` green (pins: opponent hands stripped, pool zeroed, own hand kept, `recentlyDrawnTiles` cleared for non-current). Then `npx jest` whole suite green.
- [ ] **Step 3: Verify** — `npm run build` OK, `node src/server.js` boots, server graph still DOM-free (`server-graph-dom-free.test.js` green).
- [ ] **Step 4: Commit**

```bash
git add src/rummikub/playerView.js src/rummikub/util.js src/rummikub/Game.js
git commit -m "refactor: extract the playerView privacy seam into its own module

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T5: Extract `computePlayScore` → `scoring/playScore.js` (ARCH-2 + ARCH-5, backbone §2.8)

**Files:**
- Create: `src/rummikub/scoring/playScore.js`
- Modify: `src/rummikub/moves.js` (`applyValidMove` calls the new pure fn)
- Test: none new (`last-play.test.js`/`joker-score.test.js`/`manipulation-score.test.js` are the guards)

**Background (Med risk):** Extract the PURE scoring from `applyValidMove` (`moves.js:296-336`) into a client-importable pure function (closes the ARCH-5 client/server scoring-divergence risk). It MUST run pre-`freezeTmpTiles` while tiles are still `tmp`, keep `Number(tid)` keys + numeric `groups`, and stay pure (no G mutation).

- [ ] **Step 1:** Create `scoring/playScore.js`:
```js
// Pure: the celebration payload minus seat+ts. Client-importable (no immer/events).
export function computePlayScore({tilePositions, formedGroups, prevTilePositions}) { /* moved body */ }
```
returning `{count, points, manipulation, groups, rearranged, placed}`. Deps: `tile/codec.js` (`isJoker`,`getTileValue`), `tile/sequence.js` (`freezeSeqJokers`), `juice/comboMath.js` (`manipulationScore`), `constants` (`BOARD_GRID_ID`). Move the joker-value mapping + points + placed + rearranged + manipulationScore logic verbatim.
- [ ] **Step 2:** In `moves.js` `applyValidMove`, replace the inline computation with:
```js
const groups = getFormedGroups(G);
const s = computePlayScore({tilePositions: G.tilePositions, formedGroups: groups, prevTilePositions: G.prevTilePositions});
G.firstMoveDone[player] = true;
G.lastPlay = {seat: player, ...s, ts: getSecTs()};
freezeTmpTiles(G);
events.endTurn();
```
(Import `computePlayScore`. Keep `getFormedGroups` where it is.)
- [ ] **Step 3: Run the guards** — `npx jest src/tests/last-play.test.js src/tests/joker-score.test.js src/tests/manipulation-score.test.js` green (they read `c1.getState().G.lastPlay` — the full payload), then `npx jest` whole suite green, `node src/server.js` boots.
- [ ] **Step 4: Commit**

```bash
git add src/rummikub/scoring/playScore.js src/rummikub/moves.js
git commit -m "refactor(scoring): extract pure computePlayScore (client-importable) from applyValidMove

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T6: Extract turn lifecycle + disconnect adjudication → `turn.js` (ARCH-2, backbone §2.9)

**Files:**
- Create: `src/rummikub/turn.js`
- Modify: `src/rummikub/moves.js` (move the bodies out, re-export for test importers), `src/rummikub/Game.js` (import the turn hooks from `./turn.js`)
- Test: none new (`disconnect-handling`/`force-end-turn`/`forfeit-turn`/`extend-turn`/`scenario`/`submit-meld` are the guards)

**Background (Med risk):** Move `GRACE_MS`, `N_FORFEIT_TURNS`, `onPlayPhaseBegin`, `forfeitSeat`, `onTurnBegin`, `onTurnEnd`, `checkGameOver` VERBATIM. Footgun: the `lastTimeout` staleness rule in `onTurnBegin` (`id <= ctx.turn-2`) is subtle — move it verbatim. KEEP the four `if(!Array.isArray(G.connected))…` defensive defaults (their removal is a separate, deferred judgment call — backbone §2.11). No `moves.js` import in `turn.js` (no circular dep; `forceEndTurn` stays in moves.js and only writes `G.lastTimeout` which `onTurnBegin` reads via G).

- [ ] **Step 1:** Create `turn.js` with `onPlayPhaseBegin`, `onTurnBegin`, `onTurnEnd`, `checkGameOver`, `forfeitSeat`, `GRACE_MS`, `N_FORFEIT_TURNS` (deps: `scoring.js`, `projection.js`, `util.js` getSecTs, `moveValidation.js` isBoardValid, immer `original`, `constants`, `logger`, lodash). Move verbatim.
- [ ] **Step 2:** In `moves.js`, delete those bodies and `export {GRACE_MS, N_FORFEIT_TURNS, checkGameOver, onPlayPhaseBegin, onTurnBegin, onTurnEnd} from './turn.js';` (keeps `disconnect-handling.test.js:6`, `keyboard-tap-to-place.test.js:5`, `tap-to-place.test.js:5` green). In `Game.js`, import `onPlayPhaseBegin`/`onTurnBegin`/`onTurnEnd` from `./turn.js`.
- [ ] **Step 3: Run the guards** — `npx jest src/tests/disconnect-handling.test.js src/tests/force-end-turn.test.js src/tests/forfeit-turn.test.js src/tests/extend-turn.test.js src/tests/scenario.test.js src/tests/submit-meld.test.js` green, then `npx jest` whole suite, `npm run build`, `node src/server.js` boots. Confirm `disconnect-handling.test.js` still asserts the seat-from-socket → `G.connected` mirror (ARCH-5).
- [ ] **Step 4: Commit**

```bash
git add src/rummikub/turn.js src/rummikub/moves.js src/rummikub/Game.js
git commit -m "refactor: extract turn lifecycle + disconnect adjudication into turn.js

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T7: `makeMatch()` test factory (ARCH-4 factory only; shims KEPT — backbone §2.11)

**Files:**
- Create: `src/tests/__helpers__/makeMatch.js`
- Modify: the ~12 Client-harness tests that hand-roll `setup:()=>({...G})` (swap to `makeMatch(overrides)`)

**Background:** ~14 tests hand-roll the G shape, many omitting `connected`/`forfeited`/`turnExtended`. A factory dedupes them and produces the FULL current G. **Do NOT remove the production defensive shims** — they also guard legacy on-disk matches (backbone §2.11(f): shim removal is a separate, deferred, explicitly-approved step).

- [ ] **Step 1:** Create `src/tests/__helpers__/makeMatch.js` — `makeMatch(overrides) → {...Rummikub, setup: () => ({...defaultG, ...overrides})}` where `defaultG` is the full current G shape (incl. `connected`/`disconnectTurns`/`forfeited`/`turnExtended`/`firstMoveDone`/`gameStateStack`/`redoMoveStack`/`prevTilePositions`/`lastCircle`/`recentlyDrawnTiles`/`tilesPool`/`tilePositions`/`timePerTurn`/`timerExpireAt`).
- [ ] **Step 2:** Swap each listed harness test's inline `setup` for `makeMatch({...})`, preserving each test's specific overrides. Run each as you go.
- [ ] **Step 3: Verify** — `npx jest` whole suite green (all 12 harness suites pass through the swap). No production code changed.
- [ ] **Step 4: Commit**

```bash
git add src/tests/__helpers__/makeMatch.js src/tests/*.test.js
git commit -m "test: add makeMatch() factory; dedupe hand-rolled G fixtures (shims retained)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T8: Board hooks A — `usePersistentFlag` + `useGiveUpConfirm` (ARCH-1, backbone §2.10-i/iii)

**Files:**
- Create: `src/rummikub/components/hooks/usePersistentFlag.js`, `src/rummikub/components/hooks/useGiveUpConfirm.js`
- Modify: `src/rummikub/components/Board.jsx` (use the hooks)
- Test: none new (`coach-card`/`hints-toggle`/`hints-tip`/`give-up-confirm` are the guards)

**Background:** Extract two independent Board state machines. `usePersistentFlag(key,{defaultValue})` unifies the 3 localStorage flags (coach `:46-59`, hints `:76-83`, hints-tip `:88-95`); KEEP the SSR `typeof localStorage` guard + private-mode try/catch, and the hints-tip uses a **ref not state** (so the toggle updater reads "seen" synchronously) — don't convert to state. `useGiveUpConfirm({moves, currentPlayer, gameover, tilePositions, hasStaged})` is the two-click arm/confirm (`:380-394` + disarm effects `:393`/`:423`); the `giveUpArmed` is **intentionally NOT a dep** of the disarm-on-board-change effect (`:418-422`) — preserve the exact dep arrays and suppress the ESLint warning with the documented reason.

- [ ] **Step 1:** Create `usePersistentFlag.js` (`usePersistentFlag(key,{defaultValue=false}) → [value, setValue]`, persists to localStorage, guarded). Layer the one-time hints-tip side-effect (`:97-119` incl. the 6s auto-dismiss) where the toggle couples to `showHintsTip`.
- [ ] **Step 2:** Create `useGiveUpConfirm.js` (`→ {giveUpArmed, armGiveUp, disarm}`) moving `:380-394`+`:423` verbatim, preserving the dep arrays + `GIVEUP_CONFIRM_MS`/`GIVEUP_ARM_GUARD_MS`.
- [ ] **Step 3:** Wire both into `Board.jsx`: replace the 3 flag state machines with `usePersistentFlag` calls; replace the give-up state with `useGiveUpConfirm`; `armGiveUp`→forfeit button, `disarm`→onSubmitMeld accept path.
- [ ] **Step 4: Run the guards** — `npx jest src/tests/coach-card.test.js src/tests/hints-toggle.test.js src/tests/hints-tip.test.js src/tests/give-up-confirm.test.js` green, then `npx jest` whole suite, `npm run build`, `npm run lint` (the give-up dep-array suppression is documented, not a new error).
- [ ] **Step 5: Commit**

```bash
git add src/rummikub/components/hooks/usePersistentFlag.js src/rummikub/components/hooks/useGiveUpConfirm.js src/rummikub/components/Board.jsx
git commit -m "refactor(board): extract usePersistentFlag + useGiveUpConfirm hooks

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T9: Board hooks B — `useSyncingCue` + `useComboCelebration` (ARCH-1, backbone §2.10-ii/iv)

**Files:**
- Create: `src/rummikub/components/hooks/useSyncingCue.js`, `src/rummikub/components/hooks/useComboCelebration.js`
- Modify: `src/rummikub/components/Board.jsx`
- Test: Create `src/tests/combo-celebration.test.js` (the CHARACTERIZATION pin — write FIRST)

**Background (Med/High risk):** `useComboCelebration` is the imperative effect (`:172-200`) reading `G.lastPlay`, firing `fx.*`/sounds — and its existing coverage is WEAK (only the pure `resolve-juice.test.js` + the server `last-play.test.js`; no RTL asserts the effect). So **write a characterization RTL test FIRST** that pins the current behavior, THEN extract. `useSyncingCue` (`:164-171`) is consumed by combo (it calls `clearSyncing`), so extract it first.

- [ ] **Step 1: Write the characterization test** `src/tests/combo-celebration.test.js` (real-Board harness, mock `fx`/sfx): mount Board with a `G.lastPlay` already present → assert the celebration does NOT fire on mount (the `seenPlayRef===undefined` mount-skip); then update `G.lastPlay` with a new `ts` → assert `combo`/`comboBy` reflect it AND the `fx.*`/sound mocks fire; assert a mid-drag (`activeTile` set) scales/gates per `resolveJuice`. This pins the current behavior BEFORE the extraction.
- [ ] **Step 2: Run it → GREEN against the current Board** (it characterizes existing behavior; it should pass now). This is your safety net for the extraction.
- [ ] **Step 3: Extract `useSyncingCue`** (`:164-171` → `useSyncingCue() → {syncing, markSyncing, clearSyncing}`, 1200ms auto-clear + unmount cleanup). Wire `markSyncing` into the submit/drop paths.
- [ ] **Step 4: Extract `useComboCelebration`** (`:156-159`+`:172-200` → `useComboCelebration({G, matchData, playerID, activeTile, selectedTiles, clearSyncing}) → {combo, comboBy}`, reusing the pure `resolveJuice` from `juice/gating.js`). Preserve EXACTLY: the `seenPlayRef.current===undefined` mount-skip, the `[G.lastPlay ? G.lastPlay.ts : null]` dep, and reading **live** `activeTile`/`selectedTiles` (pass as args/deps, not a stale snapshot). Board renders `<ComboOverlay combo by/>` from the returned values.
- [ ] **Step 5: Run the guards** — `npx jest src/tests/combo-celebration.test.js src/tests/resolve-juice.test.js src/tests/board-reconnect-cue.test.js` green (the characterization test now guards the EXTRACTED hook behaves identically), then `npx jest` whole suite, `npm run build`, `npm run lint`.
- [ ] **Step 6: Commit**

```bash
git add src/rummikub/components/hooks/useSyncingCue.js src/rummikub/components/hooks/useComboCelebration.js src/rummikub/components/Board.jsx src/tests/combo-celebration.test.js
git commit -m "refactor(board): extract useSyncingCue + useComboCelebration (pinned by a new characterization test)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T10: Board hook C — `useDropDispatch` (ARCH-1, HIGHEST RISK, backbone §2.10-v)

**Files:**
- Create: `src/rummikub/components/hooks/useDropDispatch.js`
- Modify: `src/rummikub/components/Board.jsx`
- Test: none new (`resolve-drop-dispatch`/`board-insert-push-dispatch`/`board-joker-swap-dispatch`/`tap-to-place`/`keyboard-tap-to-place`/`multi-drag-order` are the guards)

**Background (HIGH risk — the single riskiest step):** The placement pipeline rides the **live-`G` `gRef` stale-closure dodge**. `dispatchDrop` MUST read `gRef.current.tilePositions` at DROP time, not a captured prop `G` — if the hook closes over `G`, a multi-drag during rapid server updates dispatches against a stale board (wrong push/snap), and the PURE `resolve-drop-dispatch.test.js` would NOT catch it. Keep `gRef`/`stateRef` and the `useEffect(()=>{gRef.current=G})` write; preserve the `setState({selectedTiles:[],...})` resets on every path.

- [ ] **Step 1:** Create `useDropDispatch.js` — `useDropDispatch({moves, playerID, gRef, stateRef, setState, markSyncing}) → {activeTile, isDragActive, onDragStart, onDragEnd, onCellTap, placeFocusedHandTile, dispatchDrop}`. Move `:144-155`+`:210-254`+`:301-305`+`:531-540` (`activeTile`/`isDragActive` state, `dispatchDrop`, `onDragStart`/`onDragEnd`, `onCellTap`, `firstFreeBoardCell`+`placeFocusedHandTile`) verbatim. The pure decision stays in `dndUtil.resolveDropDispatch` (untouched). **Board keeps owning `gRef`/`stateRef` and writes `gRef.current=G` each render** (or the hook does, taking `G` and writing the ref) — whichever, `dispatchDrop` reads `gRef.current`, never a closed-over `G`.
- [ ] **Step 2:** Wire into Board: `onDragStart`/`onDragEnd`→`<DndContext>`, `onCellTap`→grids, `placeFocusedHandTile`→`useTilePlacementHotkeys`.
- [ ] **Step 3: Run the guards** — `npx jest src/tests/resolve-drop-dispatch.test.js src/tests/board-insert-push-dispatch.test.js src/tests/board-joker-swap-dispatch.test.js src/tests/tap-to-place.test.js src/tests/keyboard-tap-to-place.test.js src/tests/multi-drag-order.test.js` green (these mount the real Board / drive the live client, so they DO exercise the gRef path), then `npx jest` whole suite, `npm run build`, `npm run lint`. Board.jsx should now be a much smaller layout shell.
- [ ] **Step 4: Commit**

```bash
git add src/rummikub/components/hooks/useDropDispatch.js src/rummikub/components/Board.jsx
git commit -m "refactor(board): extract useDropDispatch (live-G gRef preserved); Board is now a layout shell

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task T11: P2-4 — game-over highlights

**Files:**
- Modify: `src/rummikub/Game.js` (`setup` adds `G.startedAt` + `G.stats`), `src/rummikub/scoring/playScore.js` or `moves.js` `applyValidMove` (accumulate per-game stats), `src/rummikub/turn.js` (`checkGameOver` includes highlights in `endGame`)
- Modify: `src/rummikub/components/GameOverModal.jsx` (render highlights + Share)
- Test: Create `src/tests/gameover-highlights.test.js`

**Background:** The game-over modal shows only winner + final points. Surface this-game highlights — **best combo** (max manipulationScore across the game), **longest run** (max formed-group length), and **clear time** (winner's elapsed seconds) — derivable from the existing `applyValidMove` data + a start timestamp. The data must flow server-side (accumulate in G, include in the `endGame` payload) since `gameover` is server-built.

- [ ] **Step 1: Write the failing test** `src/tests/gameover-highlights.test.js` — two layers: (a) a reducer/Client-harness test that plays a game to an end state and asserts `gameover` carries a `highlights` object with `bestCombo`/`longestRun`/`clearSeconds`; (b) an RTL test that renders `GameOverModal` with a `gameover.highlights` and asserts the highlights + a "Share" button render.
- [ ] **Step 2: Run it → FAIL** (no highlights tracked/rendered).
- [ ] **Step 3: Implement.**
  - `Game.js` `setup`: add `startedAt: Date.now()` (or `getSecTs()`) and `stats: {bestCombo: 0, longestRun: 0}`.
  - In `applyValidMove` (after computing `s = computePlayScore(...)`): `G.stats.bestCombo = Math.max(G.stats.bestCombo, s.manipulation); G.stats.longestRun = Math.max(G.stats.longestRun, ...max group length in s.groups);` (guard `G.stats` existence for legacy matches like the other arrays).
  - In `turn.js` `checkGameOver` (and the forfeit endgame in `forfeitSeat`): build `highlights = {bestCombo: G.stats?.bestCombo ?? 0, longestRun: G.stats?.longestRun ?? 0, clearSeconds: G.startedAt ? Math.round((getSecTs() - G.startedAt)/1000) : null}` and pass it in the `endGame({winner, points, highlights})` payload.
  - `GameOverModal.jsx`: render the highlights (e.g. "Best combo ×N · Longest run N · Cleared in Ms") below the standings, and a "Share" button that `copyToClipboard`s a short result string (reuse `domUtil.copyToClipboard`). Guard missing `highlights` (old matches) → render nothing.
- [ ] **Step 4: Run tests** — `npx jest src/tests/gameover-highlights.test.js src/tests/gameover-standings.test.js` green (don't regress T1-r5a's standings), then `npx jest` whole suite, `npm run build`, `node src/server.js` boots.
- [ ] **Step 5: Commit**

```bash
git add src/rummikub/Game.js src/rummikub/moves.js src/rummikub/turn.js src/rummikub/components/GameOverModal.jsx src/tests/gameover-highlights.test.js
git commit -m "feat(gameover): show this-game highlights (best combo, longest run, clear time) + share

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Final verification (after T11, before deploy)

- [ ] `npx jest` — full suite green (expect ~475+); `npm run build` OK; `npm run lint` no new errors; `node src/server.js` boots (env) → `/games` == `["RummyCube"]`.
- [ ] `grep -rn "document\|navigator\|window" src/rummikub/{util,moves,turn,Game}.js src/rummikub/tile/ src/rummikub/scoring* src/rummikub/playerView.js` → empty (DOM-free server graph).
- [ ] Confirm `Board.jsx` is materially smaller (the render shell + the hook calls).
- [ ] Whole-branch review (cross-cutting: barrel re-exports valid, playerView seam intact, gRef preserved in useDropDispatch, no behavior change, server-authoritative) → finishing-a-development-branch (ff-merge, push) → DEPLOY (podman build + bake sanity-check + restart + verify boot with env + live `/games` 200 + a quick live smoke of game-over highlights).

> **Deferred (not in this round):** the shim removal half of ARCH-4 (judgment call — needs the GC-TTL assumption explicitly approved); the YAGNI dead helpers (`arraysEqual`/`transpose`/etc.) stay in the util residual.
