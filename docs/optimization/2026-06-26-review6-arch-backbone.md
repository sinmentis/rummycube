# RummyCube · Review 6 · Safe Extraction Backbone (ARCH-1…5)

> **Date:** 2026-06-26 · **Purpose:** a precise, behavior-preserving extraction map that feeds a TDD implementation plan for ARCH-1…5 from `2026-06-26-review5-recommendations.md`.
> **Red line:** the **471-test** suite (`npm test` → jest) is the safety net. Every task below = *one extraction + green suite*. No behavior changes, server stays authoritative, Rummikub rules untouched.
> **Method:** grounded in the actual current code (real line ranges + signatures quoted, traced importers). Verified file sizes: `Board.jsx` 798, `moves.js` 587, `util.js` 661.

---

## 0. The core safety strategy: **physical move + barrel re-export**

The single highest-leverage decision that makes this whole refactor low-risk:

> **For every pure split of `util.js` and `moves.js`, leave the original file as a thin re-export *barrel*.** Move the function bodies into new domain modules, then `export { ... } from './newModule.js'` from the old path.

Why this is the backbone:
- `util.js` has **~40 import sites** (production + tests; see §1). A barrel keeps every one of those paths valid → **zero rewiring**, so the split is purely additive and green *by construction*.
- The same applies to `moves.js`: `GRACE_MS`/`N_FORFEIT_TURNS` (imported by `disconnect-handling.test.js:6`), `onPlayPhaseBegin` (`keyboard-tap-to-place.test.js:5`, `tap-to-place.test.js:5`), and `Game.js:3` all import from `./moves.js`. A re-export keeps them green while the bodies live in `turn.js`.
- **The ONE deliberate exception is the DOM eviction** (`copyToClipboard`/`stringToColor`): there the barrel must *drop* the re-export so the server-imported graph genuinely stops referencing DOM. That forces a small, contained rewire of ~5 client import sites + 2 test imports (§2.6).

Optional follow-up (NOT required for green): migrate import sites off the barrel to the new module paths, file-by-file, once the split is proven. That is cosmetic and can be deferred indefinitely (YAGNI gate in §6).

---

## 1. Ground-truth module & import map

### Current server-imported graph (must stay DOM-free)
```
src/server.js
  → rummikub/Game.js        → util.js  {getTiles, playerView}
                            → moves.js → util.js {countPoints, findWinner, getSecTs,
                            │             getGameState, getTileReadableName, getHandsTilesGrid,
                            │             getTileValue, isJoker, freezeSeqJokers, isSequenceValid}
                            │          → moveValidation.js, orderTiles.js, dndUtil.js,
                            │            insertPush.js, juice/comboMath.js, logger.js, immer
                            → orderTiles.js → util.js {getTileColor,getTileValue,
                                                groupValidSequences,getGameState,getPlayerHandTiles}
  → rummikub/connTransport.js  (boardgame.io private internals — OBSERVE-ONLY, §2.10)
```
`util.js` today also defines `copyToClipboard`/`stringToColor` (DOM) and is imported by `Game.js`+`moves.js`. The bodies are never *called* server-side, but they sit in the server's module graph — ARCH-2 evicts them.

### util.js function inventory (661 lines) → target domain
| Lines | Function(s) | Target module | Pure? | Server-importable? |
|------:|-------------|---------------|:----:|:----:|
| 47–54, 56–59, 61–67, 69–71, 73–84, 87–88, 90–105, 107–113 | `buildTileObj`, `deactivateTileVariant`, `getTileValue`, `getTileColor`, `getTileReadableName`, `setTileValue`, `setTileColor`, `RedJoker`/`BlackJoker`, `getTiles`, `isJoker` | **`tile/codec.js`** | ✅ | ✅ |
| 115–149, 152–158, 160–162, 164–236, 238–246, 255–266, 268–327, 329–332, 378–402, 404–453 | `isSameColor`/`isDiffColor`/`isSameValue`, `extractJoker`, `freezeJokerProp`, `freezeJokersInRun`, `freezeJokersInGroup`, `freezeSeqJokers`, `countSeqScore`, `isSequenceValid`, `tryOrderTiles`, `groupValidSequences` | **`tile/sequence.js`** | ✅ | ✅ |
| 334–354, 356–376 | `countPoints`, `findWinner` | **`scoring.js`** | ✅ | ✅ |
| 35–45, 501–524, 526–532, 605–620 | `count2dArrItems`, `buildGridsFromTilePositions`, `getPlayerHandTiles`, `getHandsTilesGrid` | **`projection.js`** | ✅ | ✅ |
| 534–543, 545–557, 559–571, 573–603 | `deriveHandCounts`, `stripHandTilePositions`, `sanitizeSnapshot`, **`playerView`** | **`playerView.js`** (privacy seam) | ✅ | ✅ (server wires it) |
| 466–490, 492–499 | `copyToClipboard`, `stringToColor` | **`components/domUtil.js`** (front-end only) | ❌ DOM | **❌ must NOT reach server** |
| 11–20, 22–25, 27–29, 31–33, 455–457, 459–464 | `isPrimitive`, `objectsEqual`, `arraysEqual`, `transpose`, `getSecTs`, `getGameState` | **stay in `util.js`** (residual + barrel) | ✅ | ✅ |

`getSecTs` (455) and `getGameState` (459, uses immer `original`) are the **shared client/server kernel** helpers — keep them in the (now DOM-free) `util.js`. A dedicated `clock.js` for `getSecTs` is optional and gated YAGNI (§6).

### util.js consumers (why the barrel matters)
- **Production (11 files):** `moves.js:13`, `Game.js:2`, `planning.js`, `orderTiles.js`, `boardUtil.js:1`, `components/Board.jsx:19`, `components/Tile.jsx:4`, `components/TableSeats.jsx:2`, `components/PlayerAvatar.jsx:2`, `components/Sidebar.jsx:2`, `components/CreateGame.jsx:5`, `components/GameOverModal.jsx:6`, `components/TurnDeadlineWatcher.jsx:2`, `hooks/useCountdown.jsx:2`.
- **Tests (~38 files):** import `buildTileObj`/`getTiles`/`countSeqScore`/`RedJoker`/`BlackJoker`/`playerView`/`getSecTs`/`copyToClipboard` etc. from `../rummikub/util`.

A barrel keeps all of the above untouched **except** the 5 prod + 2 test `copyToClipboard`/`stringToColor` sites (§2.6).

---

## 2. Per-extraction specs

Format per item: **(a)** source lines moved + what they do · **(b)** new path + exported signature(s) · **(c)** import rewiring · **(d)** safe-order slot + rationale · **(e)** guarding tests · **(f)** risk + footgun.

### 2.1 ARCH-3 — `docs/ARCHITECTURE.md` (no code)
- **(a)** None — new doc. Content outline:
  - **G field table + invariants:** `tilePositions`/`prevTilePositions` (turn-start baseline, reset in `onTurnBegin:532`), `tilesPool` (zeroed by playerView), `firstMoveDone[]`, `gameStateStack`/`redoMoveStack` (cleared each turn-begin:527-528), `lastCircle`, `recentlyDrawnTiles` (stripped for non-current viewer), `lastPlay` (celebration payload), `lastTimeout` (transient, staleness-cleared `onTurnBegin:538`), `connected[]`/`disconnectTurns[]`/`forfeited[]`/`turnExtended[]` (server-authoritative arrays).
  - **Move-atomicity contract:** `INVALID_MOVE` ⇒ immer draft discarded ⇒ G untouched (no-op). Cite `moves.js:120-128` (for-loop early-return), `:434-445` (submitMeld no-op), `:202-225` (forceEndTurn deadline guard writes `lastTimeout` only *after* the guard).
  - **Module map:** who is pure / server-importable / the privacy boundary (the §1 table) + the client/server shared-kernel list: `tile/codec.js`, `tile/sequence.js`, `scoring.js`, `projection.js`, `playerView.js`, `scoring/playScore.js`, `juice/comboMath.js`, `juice/gating.js`, `getSecTs`/`getGameState`.
  - **Connection seam:** `connTransport.js` mirrors socket connect/disconnect into `G.connected` via the internal `_setConnection` move; seat resolved by the server, never client-supplied.
- **(b)** `docs/ARCHITECTURE.md`.
- **(c)** None.
- **(d)** **Order #1** — pure docs, zero risk, sets the vocabulary every later task references.
- **(e)** None (doc). A cheap guard: a CI grep test that the named modules exist after §2.2-2.9 land.
- **(f)** **Low.** Footgun: doc drifting from code — keep the module map terse and link to line ranges.

### 2.2 ARCH-2 · `tile/codec.js` (bit-packing)
- **(a)** `util.js:47-113` + `RedJoker`/`BlackJoker:87-88` — tile integer codec: build/encode/decode value+color+variant, the 106-tile deck (`getTiles`), `isJoker`.
- **(b)** `src/rummikub/tile/codec.js` — `buildTileObj(value,color,variant)`, `deactivateTileVariant(tile)`, `getTileValue(tile)`, `getTileColor(tile)`, `getTileReadableName(tile)`, `setTileValue(tile,value)`, `setTileColor(tile,color)`, `getTiles()`, `isJoker(tile)`, `RedJoker`, `BlackJoker`. Deps: `constants` (`COLOR`,`COLORS`), `lodash/range`, `lodash/invert`. **No internal util deps** → split first.
- **(c)** `util.js` re-exports all of the above. No site changes.
- **(d)** **Order #3a** — root of the tile dependency tree; everything sequence/scoring/playScore needs it.
- **(e)** `build-tile.test.js`, `count-seq-score.test.js`, `freeze-joker.test.js`, `util.test.js`, plus every `buildTileObj`/`getTiles` importer (~30 tests) via the barrel.
- **(f)** **Low.** Footgun: `getTileReadableName` uses `invert(COLOR)`; keep the lodash import local.

### 2.3 ARCH-2 · `tile/sequence.js` (validity + joker freeze + score)
- **(a)** `util.js:115-149, 152-158, 160-162, 164-236, 238-246, 255-266, 268-327, 329-332, 378-402, 404-453` — color/value predicates, joker freezing for runs (`freezeJokersInRun`, recursive two-joker handling) and groups, `freezeSeqJokers` (run/group auto-detect), `countSeqScore` (the run/group scorer + wrap-around 13→1 rule), `isSequenceValid`, `tryOrderTiles`, `groupValidSequences`.
- **(b)** `src/rummikub/tile/sequence.js` — `isSameColor(tiles)`, `isDiffColor(tiles)`, `isSameValue(tiles)`, `extractJoker(tiles)`, `freezeJokerProp(joker,props)`, `freezeJokersInRun(tiles)`, `freezeJokersInGroup(tiles)`, `freezeSeqJokers(tiles)`, `countSeqScore(tiles)`, `isSequenceValid(tiles)`, `tryOrderTiles(tiles)`, `groupValidSequences(tiles)`. Deps: `tile/codec.js`, `lodash` (`uniqBy`,`orderBy`,`find`).
- **(c)** Barrel re-export from `util.js`. Internal callers already resolved through codec. **Note real consumers:** `boardUtil.js:1` (`tryOrderTiles`), `orderTiles.js:6` (`groupValidSequences`), `moveValidation.js:2` (`countSeqScore`,`isSequenceValid`), `dndUtil.js:3` (`freezeSeqJokers`,`isSequenceValid`), `planning.js` (`isSequenceValid`,`isSameValue`,`freezeSeqJokers`) — all keep their `./util.js`/barrel path or can point at `tile/sequence.js` (optional).
- **(d)** **Order #3b** — after codec (depends on it), before scoring extraction.
- **(e)** `count-seq-score.test.js`, `freeze-joker.test.js`, `group-valid-seq.test.js`, `order-by.test.js`, `joker-score.test.js`, plus `moveValidation`/`dndUtil` suites transitively.
- **(f)** **Low/Med.** Footgun: `freezeJokersInRun` is dense (recursion on `twoJokersNear`, `console.debug` lines, `console.assert` at 233) and has many edge-return `null`s — move it **verbatim**, do not "clean up" while moving.

### 2.4 ARCH-2 · `scoring.js` (end-game tally)
- **(a)** `util.js:334-376` — `countPoints` (winner gets sum of others' tile points; jokers=30) and `findWinner` (lowest hand total).
- **(b)** `src/rummikub/scoring.js` — `countPoints(hands, winnerIndex)`, `findWinner(hands)`. Deps: `tile/codec.js` (`isJoker`,`getTileValue`), `lodash/flatten`.
- **(c)** Barrel re-export. Real consumers: `moves.js`/`turn.js` (`checkGameOver`, `forfeitSeat`) — resolve via barrel or direct.
- **(d)** **Order #3c** — independent of sequence; group with the util splits.
- **(e)** `gameover-standings.test.js`, `scenario.test.js`, `disconnect-handling.test.js` (forfeit endgame), `forfeit-turn.test.js`.
- **(f)** **Low.** Footgun: `findWinner` seeds `winner_points = 1000` — preserve the sentinel.

### 2.5 ARCH-2 · `projection.js` (grid projections)
- **(a)** `util.js:35-45, 501-524, 526-532, 605-620` — `count2dArrItems`, `buildGridsFromTilePositions` (tilePositions → `{board, hands[]}` 2-D arrays), `getPlayerHandTiles`, `getHandsTilesGrid`.
- **(b)** `src/rummikub/projection.js` — `count2dArrItems(arr2d)`, `buildGridsFromTilePositions(tilePositions, numPlayers)`, `getPlayerHandTiles(G, playerID)`, `getHandsTilesGrid(G, numPlayers)`. Deps: `constants` (`BOARD_ROWS/COLS`,`HAND_ROWS/COLS`,`BOARD_GRID_ID`,`HAND_GRID_ID`).
- **(c)** Barrel re-export. Real consumers: `Board.jsx:19` (`buildGridsFromTilePositions`,`count2dArrItems`,`getPlayerHandTiles`), `TableSeats.jsx:2` (`count2dArrItems`), `moves.js`/`turn.js` (`getHandsTilesGrid`).
- **(d)** **Order #3d** — independent; group with util splits.
- **(e)** `table-layout.test.js`, `cat-avatar.test.js`, `player-avatar-connected.test.js`, plus any Board mount.
- **(f)** **Low.** Footgun: `buildGridsFromTilePositions` silently drops out-of-range cells (`row<BOARD_ROWS`); keep the bounds checks.

### 2.6 ARCH-2 · `playerView.js` (THE PRIVACY SEAM — named explicitly)
- **(a)** `util.js:534-603` — `deriveHandCounts` (per-seat counts), `stripHandTilePositions` (drop opponent hand tiles from a positions map), `sanitizeSnapshot` (strip the undo/redo stacks), `playerView` (clones G, sets `handCounts`, strips `tilePositions`+`prevTilePositions`+stacks, **zeroes `tilesPool` to `Array(len).fill(0)`**, **clears `recentlyDrawnTiles` for non-current viewers**).
- **(b)** `src/rummikub/playerView.js` — `deriveHandCounts(tilePositions)`, `stripHandTilePositions(tilePositions, viewerID)`, `sanitizeSnapshot(snapshot, viewerID)`, `playerView({G, ctx, playerID})`. Deps: `constants` (`HAND_GRID_ID`), `lodash/cloneDeep`.
- **(c)** **Rewire `Game.js:2`** `import {getTiles} from './util.js'` stays; **`playerView` should import from `./playerView.js`** (or via barrel). Barrel re-export keeps `player-view.test.js:1` (`import {playerView} from '../rummikub/util'`) green.
- **(d)** **Order #3e** — last of the util splits; it depends on nothing but constants/lodash, but it is the most security-sensitive, so split it on its own with full attention.
- **(e)** **`player-view.test.js`** (pins: opponent hands stripped, pool zeroed, own hand kept, `recentlyDrawnTiles` cleared for non-current). Also indirectly every Client-harness test (they read `c1.getState().G` which is post-`playerView`).
- **(f)** **Med (security).** Footgun: the seam must keep stripping opponent hands, zeroing the pool, and clearing `recentlyDrawnTiles` for non-current players. The `viewerID` string coercion (`playerID.toString()`) and the `pos.playerID.toString() === viewerID` compare must be moved **verbatim** — an off-by-one in the coercion would leak hands. Add no logic; copy exactly.

### 2.7 ARCH-2 · DOM eviction → `components/domUtil.js` (the deliberate non-barrel)
- **(a)** `util.js:466-490, 492-499` — `copyToClipboard` (navigator.clipboard / textarea fallback, touches `document`,`window`,`navigator`) and `stringToColor` (hash → hsl, pure but front-end-only by role).
- **(b)** `src/rummikub/components/domUtil.js` — `copyToClipboard(textToCopy)`, `stringToColor(str)`.
- **(c)** **Real rewire (the one exception to the barrel):**
  - Prod: `Board.jsx:19`, `Sidebar.jsx:2`, `CreateGame.jsx:5`, `GameOverModal.jsx:6` (`copyToClipboard`), `PlayerAvatar.jsx:2` (`stringToColor`) → import from `./domUtil` / `../components/domUtil`.
  - Tests: `waiting-invite.test.js:30`, `invite-panel.test.js:4` (`copyToClipboard`) → import from `../rummikub/components/domUtil`.
  - **Remove `copyToClipboard`/`stringToColor` from the `util.js` barrel** so the server graph (`Game.js`→`util.js`, `moves.js`→`util.js`) no longer references DOM symbols.
- **(d)** **Order #2** — do this *before* the pure util barrel splits. It is small, fully independent, and it is the only step that achieves the "server graph never pulls DOM" invariant; doing it early de-risks the barrel (the barrel never has to decide whether to re-export DOM).
- **(e)** `waiting-invite.test.js`, `invite-panel.test.js` (copy), `player-avatar-connected.test.js` / `cat-avatar.test.js` (color via PlayerAvatar). A new guard test asserting `util.js` has no `document`/`navigator` reference would lock the invariant.
- **(f)** **Low/Med.** Footgun: miss one importer and the build/test breaks loudly (good) — but a *missed barrel removal* fails silently (DOM stays in the graph). Verify with `grep -n "document\|navigator" src/rummikub/util.js` → empty after the step.

### 2.8 ARCH-2 · `scoring/playScore.js` (the `applyValidMove` SCORING, client-importable)
- **(a)** `moves.js:296-336` — the **pure scoring** inside `applyValidMove`: maps each tmp board joker to its represented value via the formed sequence (`freezeSeqJokers`→`getTileValue`), sums `points` (joker scores represented value, not 0), counts `placed` (tmp tiles) and `rearranged` (committed board tiles whose col/row moved vs `prevTilePositions`), and computes `manipulationScore({groups, rearranged, placed})`. **Excludes** the surrounding mutations (`G.firstMoveDone[player]=true:298`, `G.lastPlay={...}:327-336`, `freezeTmpTiles:337`, `events.endTurn():338`).
- **(b)** `src/rummikub/scoring/playScore.js` —
  `computePlayScore({tilePositions, formedGroups, prevTilePositions}) → {count, points, manipulation, groups, rearranged, placed}`
  (returns the `lastPlay` payload **minus** `seat`+`ts`, which `applyValidMove` adds). Deps: `tile/codec.js` (`isJoker`,`getTileValue`), `tile/sequence.js` (`freezeSeqJokers`), `juice/comboMath.js` (`manipulationScore`), `constants` (`BOARD_GRID_ID`). **Pure, no immer, no `events`** → client can import for a future live preview (ARCH-5 goal).
- **(c)** `moves.js` `applyValidMove` becomes:
  ```js
  const groups = getFormedGroups(G);
  const s = computePlayScore({tilePositions: G.tilePositions, formedGroups: groups,
                              prevTilePositions: G.prevTilePositions});
  G.firstMoveDone[player] = true;
  G.lastPlay = {seat: player, ...s, ts: getSecTs()};
  freezeTmpTiles(G);
  events.endTurn();
  ```
  Import `computePlayScore` from `./scoring/playScore.js`. No other site changes.
- **(d)** **Order #4** — after the util splits (depends on codec+sequence+comboMath), before `turn.js`. It is a contained, well-pinned extraction.
- **(e)** **`last-play.test.js`** (points=15, count/manipulation=3, placed=3, rearranged=0, groups), **`joker-score.test.js`** (joker scores represented value), **`manipulation-score.test.js`** (groups/rearrange weighting). These read `c1.getState().G.lastPlay`, so they pin the whole payload.
- **(f)** **Med.** Footgun: `computePlayScore` **must run before `freezeTmpTiles`** while tiles are still `tmp` (preserved by computing in `applyValidMove` pre-freeze). Keep `jokerValueById` keyed by `Number(tid)` and `groups.map(seq=>seq.map(Number))` exactly — the celebration client reads numeric tile ids. Purity matters: it must not mutate `G` (so it can later run as a client preview against `playerView`-filtered G).

### 2.9 ARCH-2 · `turn.js` (turn lifecycle + disconnect adjudication)
- **(a)** From `moves.js`: `GRACE_MS:452`, `N_FORFEIT_TURNS:453`, `onPlayPhaseBegin:472-476`, `forfeitSeat:481-494` (internal; retires a seat, ends game via `countPoints`/`findWinner` when ≤1 remain), `onTurnBegin:496-543` (per-seat connection adjudication: forfeited→instant deadline, disconnected→`GRACE_MS` + forfeit after `N_FORFEIT_TURNS`, connected→full budget; resets `turnExtended`, clears stacks, snapshots `prevTilePositions`, staleness-clears `lastTimeout`), `onTurnEnd:545-549`, `checkGameOver:551-566` (last-circle + empty-hand win).
- **(b)** `src/rummikub/turn.js` — `onPlayPhaseBegin({G,ctx})`, `onTurnBegin({G,ctx,events})`, `onTurnEnd({G,ctx,events})`, `checkGameOver(G,ctx,events)`, `forfeitSeat(G,ctx,seat,events)`, `GRACE_MS`, `N_FORFEIT_TURNS`. Deps: `scoring.js` (`countPoints`,`findWinner`), `projection.js` (`getHandsTilesGrid`), `util.js` (`getSecTs`), `moveValidation.js` (`isBoardValid`), `immer` (`original`), `constants`, `logger`, `lodash` (`flatten`,`some`). **No import of `moves.js`** (it never calls `drawTile`/`validatePlayerMove`; `forceEndTurn` stays in `moves.js` and only *writes* `G.lastTimeout`, which `onTurnBegin` later reads — via G, not import). No circular dependency.
- **(c)** **Rewire `Game.js:3`** to import `onPlayPhaseBegin`,`onTurnBegin`,`onTurnEnd` from `./turn.js`. **`moves.js` re-exports** `GRACE_MS`,`N_FORFEIT_TURNS`,`checkGameOver`,`onPlayPhaseBegin`,`onTurnBegin`,`onTurnEnd` from `./turn.js` so `disconnect-handling.test.js:6`, `keyboard-tap-to-place.test.js:5`, `tap-to-place.test.js:5` stay green with no edit. (`checkGameOver` has **no external importer** — free to move.)
- **(d)** **Order #5** — after the util splits and playScore (it depends on scoring+projection). Heavier than a util split (mutating lifecycle), so isolate it.
- **(e)** **`disconnect-handling.test.js`** (grace window, forfeit after N turns, reconnect reset), **`force-end-turn.test.js`** (deadline + `lastTimeout`), **`forfeit-turn.test.js`**, **`extend-turn.test.js`** (`turnExtended` reset in `onTurnBegin`), **`scenario.test.js`** (full-game), **`submit-meld.test.js`** (turn advance).
- **(f)** **Med.** Footgun: the `lastTimeout` **staleness rule** (`onTurnBegin:538`, `id <= ctx.turn-2`) is subtle — `forceEndTurn` writes `lastTimeout` then its `endTurn` fires the next `onTurnBegin` in the *same* state update; an unconditional clear would wipe the transient before any client renders it. Move the condition verbatim. Also keep the four `if(!Array.isArray(...))` defensive defaults for now (their removal is ARCH-4, §2.11, and is a separate judgment call).

### 2.10 ARCH-1 · split `Board.jsx` (798 lines) into focused hooks
Board keeps the render tree (≈ `:522-797`) and becomes a layout shell; the state machines move to hooks under `src/rummikub/components/hooks/`. **All five sit behind the P0-4 ESLint `react-hooks/exhaustive-deps` guard** (land ESLint first, per review §1).

#### (i) `usePersistentFlag(key, {defaultValue})`
- **(a)** The 3 localStorage flag state machines: coach card `:46-59` (`COACH_SEEN_KEY`, `coachSeen`, `dismissCoach`), hints toggle `:76-83` (`HINTS_KEY`, `hintsOn`), hints tip `:88-95` (`HINTS_TIP_KEY`, `hintsTipSeenRef`). Each is the same try/catch read-once + persist-on-change pattern.
- **(b)** `hooks/usePersistentFlag.js` — `usePersistentFlag(key, {defaultValue=false}) → [value, setValue]` where `setValue` persists to localStorage (SSR/private-mode guarded). A thin `useHintsToggle` (or keep in Board) layers the **one-time tip** side-effect (`:97-119`) on top, since the tip couples toggle→`showHintsTip`.
- **(c)** Board imports the hook; the tip auto-dismiss effect `:115-119` moves with it.
- **(e)** `coach-card.test.js`, `hints-toggle.test.js`, `hints-tip.test.js`.
- **(f)** **Low/Med.** Footgun: keep the `typeof localStorage !== 'undefined'` SSR guard and the try/catch private-mode fallback; the hints-tip uses a **ref, not state** (`hintsTipSeenRef`) so the toggle updater can read "seen" synchronously with empty deps — do not convert it to state.

#### (ii) `useSyncingCue()`
- **(a)** `:164-171` — `syncing` state, `syncTimer` ref, `markSyncing` (sets true, auto-clears after 1200ms), unmount cleanup.
- **(b)** `hooks/useSyncingCue.js` — `useSyncingCue() → {syncing, markSyncing, clearSyncing}`.
- **(c)** Board passes `markSyncing` into `useDropDispatch` and the submit handler (`:233,:356`); `clearSyncing` is called by the celebration effect (`:180`).
- **(d)** Extract **before** `useDropDispatch`/`useComboCelebration` (they consume it).
- **(e)** `board-reconnect-cue.test.js`.
- **(f)** **Low/Med.** Footgun: the cue must clear on the next authoritative G update (lastPlay) *and* on timeout; expose `clearSyncing` so the celebration hook can settle it.

#### (iii) `useGiveUpConfirm({moves, currentPlayer, gameover, tilePositions, hasStaged})`
- **(a)** `:380-394` (two-click arm/confirm + `GIVEUP_CONFIRM_MS`/`GIVEUP_ARM_GUARD_MS` rage-guard), the disarm-on-turn-change effect `:393`, the disarm-on-board-change effect `:423`, unmount cleanup `:394`. Also `disarm()` is called by the submit-accept path `:353`.
- **(b)** `hooks/useGiveUpConfirm.js` — `useGiveUpConfirm({moves, currentPlayer, gameover, tilePositions, hasStaged}) → {giveUpArmed, armGiveUp, disarm}`.
- **(c)** Board wires `armGiveUp` to the forfeit button `:494`; `disarm` to `onSubmitMeld` `:353`.
- **(e)** **`give-up-confirm.test.js`** (strong: arms, rage-guard blocks instant confirm, confirms after guard, auto-revert, disarm on turn change).
- **(f)** **Med.** Footgun: `giveUpArmed` is **intentionally NOT a dep** of the disarm-on-board-change effect (`:418-422` comment) — including it re-runs on the arming render and instantly disarms, making two-click impossible. Preserve the exact dep arrays; ESLint will flag this, so suppress with the documented reason.

#### (iv) `useComboCelebration({G, matchData, playerID, activeTile, selectedTiles, clearSyncing})`
- **(a)** `:156-159` (`combo`,`comboBy`,`comboTimer`,`seenPlayRef`) + the imperative effect `:172-200` reading `G.lastPlay`, computing `resolveJuice(...)`, firing `fx.*`/sounds, scaled by who played + mid-drag.
- **(b)** `hooks/useComboCelebration.js` — `useComboCelebration({G, matchData, playerID, activeTile, selectedTiles, clearSyncing}) → {combo, comboBy}`. Reuses the pure `resolveJuice` from `juice/gating.js` (unchanged).
- **(c)** Board renders `<ComboOverlay combo by/>` from the returned values; passes `clearSyncing` (from `useSyncingCue`).
- **(d)** After `useSyncingCue` (calls `clearSyncing` at `:180`).
- **(e)** **`resolve-juice.test.js`** pins the *pure* gating; **the imperative wiring is only weakly covered** (no RTL test asserts the `fx.*` calls or the mount-skip). `last-play.test.js` pins the *server* `G.lastPlay`, not this client effect.
- **(f)** **Med/High.** Footgun: `seenPlayRef.current === undefined` mount-skip (ignore the play present at mount/reconnect) and the `[G.lastPlay ? G.lastPlay.ts : null]` dep must be preserved exactly. The effect reads **live** `activeTile`/`selectedTiles` for the drag-aware gating — pass them as deps/args, not a stale snapshot. **Weak existing coverage is itself the risk** → write a characterization RTL test (fire a `G.lastPlay.ts` change, assert `combo`/`comboBy` + that mount doesn't fire) *before* extracting (TDD pin).

#### (v) `useDropDispatch({moves, playerID, gRef, stateRef, setState, markSyncing})`
- **(a)** `:144-155` (`activeTile`,`isDragActive`,`stateRef`,`gRef` live-G ref), `:210-236` (`dispatchDrop` — the single pure `resolveDropDispatch` → `joker`/`push`/`snap`/`reject` switch), `:237-254` (`onDragStart`/`onDragEnd`), `:301-305` (`onCellTap`), `:531-540` (`firstFreeBoardCell`+`placeFocusedHandTile` for keyboard). All three placement paths share `dispatchDrop`.
- **(b)** `hooks/useDropDispatch.js` — `useDropDispatch({moves, playerID, gRef, stateRef, setState, markSyncing}) → {activeTile, isDragActive, onDragStart, onDragEnd, onCellTap, placeFocusedHandTile, dispatchDrop}`. Pure decision stays in `dndUtil.resolveDropDispatch` (unchanged north-star module).
- **(c)** Board owns `gRef`/`stateRef` (or the hook does and exposes them) and the `state`/`setState`; wires `onDragStart`/`onDragEnd` to `<DndContext>`, `onCellTap` to grids, `placeFocusedHandTile` to `useTilePlacementHotkeys`.
- **(d)** **Last** of the Board hooks (consumes `markSyncing` + the live `gRef`).
- **(e)** **`resolve-drop-dispatch.test.js`** (pure dispatch), **`board-insert-push-dispatch.test.js`**, **`board-joker-swap-dispatch.test.js`**, **`tap-to-place.test.js`**, **`keyboard-tap-to-place.test.js`**, **`multi-drag-order.test.js`**.
- **(f)** **High.** Footgun: `gRef.current` is the **stale-closure dodge** — `dispatchDrop` must read `gRef.current.tilePositions` at *drop time*, not a captured `G`. If the hook closes over `G` (a prop) instead of `gRef`, a multi-drag during rapid server updates dispatches against a stale board → wrong push/snap. Keep `gRef`/`stateRef` and the `useEffect(()=>{gRef.current=G})` write. Also preserve `setState({selectedTiles:[],...})` resets on every path.

### 2.11 ARCH-4 · `makeMatch()` test factory + shim removal
- **(a)** ~14 hand-rolled `setup:()=>({...G})` blocks across Client-harness tests: `disconnect-handling.test.js:18-36`, `last-play.test.js:14-25`, `scenario.test.js` (×2), `force-end-turn.test.js`, `retrieve-joker.test.js`, `joker-score.test.js`, `submit-meld.test.js`, `forfeit-turn.test.js`, `extend-turn.test.js`, `move-tiles-propagate.test.js`, `multi-drag-order.test.js`, `insert-tiles-with-push.test.js`.
- **(b)** `src/tests/__helpers__/makeMatch.js` — `makeMatch(overrides) → {...Rummikub, setup: () => ({...defaultG, ...overrides})}` producing the **full current G shape** (incl. `connected`/`disconnectTurns`/`forfeited`/`turnExtended`) so fixtures stop omitting fields.
- **(c)** Each harness test swaps its inline setup for `makeMatch({tilePositions, firstMoveDone, ...})`. Pure test-side change; no production code.
- **(d)** **Order #6** — after `turn.js` (so the factory's default G matches the final turn semantics) but independent of Board hooks.
- **(e)** All 12 listed Client-harness suites are their own guard (they must stay green through the swap).
- **(f)** **Low** for the factory itself. **Med/High for the *shim removal*** (the second half of ARCH-4): the `if(!Array.isArray(G.connected)) G.connected=[]` defaults in `onTurnBegin` (`turn.js`, ex-`moves.js:501-504`), `extendTurn:426`, `_setConnection:465-466`, `forfeitSeat:482-483` exist for **two** reasons — (1) old test fixtures *and* (2) legacy **on-disk** matches created pre-WS-12. `makeMatch()` only fixes (1). Removing the shims assumes no pre-WS-12 persisted match survives, which the server's 1h gameover GC + 6h idle GC (`server.js`) makes true in practice — but it is a **judgment call**, not a free cleanup. **Recommendation:** land `makeMatch()` (low risk); keep the `turnExtended` default; remove the `connected`/`disconnectTurns`/`forfeited` defaults only as a separate, explicitly-approved step with the GC-TTL assumption documented in ARCHITECTURE.md. Treat the shim removal as **optional/observe** unless the team commits to the assumption.

### 2.12 ARCH-5 · observe-only
- **`connTransport.js`:** deeply couples boardgame.io 0.50 private internals (the `Master` private to the server bundle, the per-namespace `connection` listener). **Do not refactor.** Instead **pin the exact version**: `package.json` `"boardgame.io": "^0.50.2"` → `"0.50.2"` (drop the caret) so a patch bump can't silently break the private-internals assumptions. Add/keep **one disconnect integration test** — `disconnect-handling.test.js` already drives `_setConnection`/`G.connected` through the move path; ensure it (or a sibling) asserts the seat-from-socket mirror so a transport regression is caught.
- **Client-importable scoring:** §2.8 `scoring/playScore.js` is pure (no server-only imports) → **already satisfies** the ARCH-5 goal of a shared scoring module the client can reuse for a future live-preview, closing the "client re-implements scoring" divergence risk.

---

## 3. Safe order (lowest-risk / most-independent first)

| # | Task | Rationale (one line) |
|---|------|----------------------|
| 1 | **ARCH-3** `docs/ARCHITECTURE.md` | Pure doc, zero risk; defines the module map + invariants every later step cites. |
| 2 | **ARCH-2** DOM eviction → `components/domUtil.js` (§2.7) | Small, fully independent; the only step that secures "server graph never pulls DOM" — do it before the barrel so the barrel never re-exports DOM. |
| 3 | **ARCH-2** util pure splits via barrel: `tile/codec.js` (3a) → `tile/sequence.js` (3b) → `scoring.js` (3c) → `projection.js` (3d) → `playerView.js` (3e) | Mechanical move + re-export; zero import rewiring; ordered by dependency (codec is the root). 3e (privacy seam) split alone with full care. |
| 4 | **ARCH-2** `scoring/playScore.js` (§2.8) | Depends on codec+sequence+comboMath (now split); contained, strongly pinned by last-play/joker/manipulation tests; makes scoring client-importable (ARCH-5). |
| 5 | **ARCH-2** `turn.js` (§2.9) | Heavier mutating lifecycle; depends on scoring+projection; `moves.js` re-exports keep tests green. |
| 6 | **ARCH-4** `makeMatch()` factory (§2.11) | Additive test helper; independent of production code. (Shim removal deferred / optional — see §2.11(f).) |
| 7 | **ARCH-1** Board hooks (§2.10), in order: `usePersistentFlag` (7a) → `useGiveUpConfirm` (7b) → `useSyncingCue` (7c) → `useComboCelebration` (7d) → `useDropDispatch` (7e) | Highest aggregate risk; do last, behind the P0-4 ESLint guard. Ordered by independence: flags/confirm first, then the syncing→celebration→drop chain that shares `markSyncing`+`gRef`. |
| — | **ARCH-5** (§2.12) | Observe-only: version-pin + ensure the disconnect integration test; no extraction. Can land any time (pair with task 5). |

**Single highest-risk step:** **7e `useDropDispatch`** (with 7d `useComboCelebration` close behind). The placement pipeline depends on the **live-`G` `gRef` stale-closure dodge** — a botched extraction that closes over a prop `G` instead of `gRef.current` silently dispatches multi-drags/pushes against a stale board during rapid server updates, a desync that the *pure* `resolve-drop-dispatch.test.js` would NOT catch. `useComboCelebration` compounds it: its imperative effect (mount-skip + drag-aware gating) is only weakly RTL-covered, so it needs a **characterization test written before extraction**. Everything in ARCH-2/3/4 is mechanically safe by comparison (pure functions + strong Client-harness coverage + the barrel).

---

## 4. Risk register

| Extraction | Risk | Specific footgun |
|-----------|:----:|------------------|
| ARCH-3 docs | Low | Doc drift from code. |
| DOM eviction (§2.7) | Low/Med | Missed *barrel removal* leaves DOM in server graph (silent). Verify `grep document\|navigator util.js` empty. |
| codec / scoring / projection (§2.2,2.4,2.5) | Low | Move verbatim; preserve bounds checks + `findWinner` sentinel. |
| sequence (§2.3) | Low/Med | `freezeJokersInRun` recursion + many `null` edge-returns — copy exactly, no cleanup. |
| **playerView (§2.6)** | **Med (security)** | **Must keep stripping opponent hands, zeroing pool, clearing `recentlyDrawnTiles` for non-current.** `viewerID` string coercion exact. |
| playScore (§2.8) | Med | Run **pre-`freezeTmpTiles`**; keep `Number(tid)` keys + numeric `groups`; stay pure (no G mutation). |
| turn.js (§2.9) | Med | `lastTimeout` staleness rule (`id<=ctx.turn-2`); keep defensive array defaults; `moves.js` re-export for test imports. |
| makeMatch factory (§2.11) | Low | — |
| **shim removal (§2.11)** | **Med/High** | Shims also guard legacy on-disk matches; removal assumes GC-TTL wipes pre-WS-12 matches. Judgment call — defer/observe. |
| usePersistentFlag (§2.10-i) | Low/Med | Keep SSR guard + private-mode try/catch; tip uses a **ref** not state. |
| useSyncingCue (§2.10-ii) | Low/Med | Clear on next authoritative G *and* timeout; expose `clearSyncing`. |
| useGiveUpConfirm (§2.10-iii) | Med | `giveUpArmed` deliberately NOT a dep of the board-change disarm effect. |
| **useComboCelebration (§2.10-iv)** | **Med/High** | Mount/reconnect skip via `seenPlayRef`; reads live drag state; **weak existing coverage** → pin with a new RTL test first. |
| **useDropDispatch (§2.10-v)** | **High** | **`gRef.current` live-G stale-closure**; pure dispatch tests won't catch a stale-G regression. |

---

## 5. Invariants every task must preserve (cross-cut)

1. **Move atomicity:** `INVALID_MOVE` ⇒ immer draft discarded ⇒ G untouched (no-op). `applyValidMove`'s pure `computePlayScore` must not pre-mutate G.
2. **Privacy seam:** `playerView` strips opponent hands, zeroes `tilesPool`, clears non-current `recentlyDrawnTiles`. Never weakened.
3. **DOM-free server graph:** after §2.7, `util.js`/`Game.js`/`moves.js`/`turn.js` reference no `document`/`window`/`navigator`.
4. **Shared client/server kernel:** `tile/codec.js`, `tile/sequence.js`, `scoring.js`, `projection.js`, `playerView.js`, `scoring/playScore.js`, `juice/comboMath.js`, `juice/gating.js`, `getSecTs`, `getGameState` — all pure, importable from both sides.
5. **Server authority:** connection state written only by the server transport via `_setConnection`; never client-trusted.

---

## 6. YAGNI / observe-only flags

- **`arraysEqual`, `transpose`, `objectsEqual`, `isPrimitive`, `deactivateTileVariant`, `extractJoker`, `freezeJokerProp`** have **no production consumers** (test-only or dead). Do **not** invent homes for them — leave in the `util.js` residual/barrel. Their deletion is a *separate* cleanup, not this refactor.
- **`clock.js` for `getSecTs` / `gameState.js` for `getGameState`:** two one-function files add ceremony without payoff. **Skip** — keep both in the (now DOM-free) `util.js`. Revisit only if a real third consumer appears.
- **Migrating import sites off the `util.js` barrel** to the new module paths: cosmetic; defer indefinitely. The barrel is a fine permanent facade.
- **`connTransport.js` refactor:** **observe-only** (version-pin + integration test). Its private-internals coupling is documented and load-bearing; do not touch.
- **ARCH-4 shim removal:** **observe/optional** unless the team accepts the GC-TTL "no pre-WS-12 match survives" assumption in writing. The `makeMatch()` factory is the worthwhile, low-risk half.

---

## 7. Task breakdown (each = one extraction + green `npm test`)

> Land **P0-4 ESLint + `react-hooks/exhaustive-deps`** before Task 12 (it is the guardrail for the Board hooks). Tasks 1–11 do not require it.

1. **ARCH-3** — write `docs/ARCHITECTURE.md` (G table, atomicity contract, module map, privacy boundary, shared-kernel list). *Guard:* none / module-exists CI grep.
2. **DOM eviction** — create `components/domUtil.js` (`copyToClipboard`,`stringToColor`); rewire 5 prod + 2 test importers; remove from `util.js` barrel; assert `util.js` is DOM-free. *Guard:* `waiting-invite`, `invite-panel`, `player-avatar-connected`.
3. **`tile/codec.js`** — move `util.js:47-113`+jokers; `util.js` re-exports. *Guard:* `build-tile`, `count-seq-score`.
4. **`tile/sequence.js`** — move the validity/joker/score block; re-export. *Guard:* `freeze-joker`, `count-seq-score`, `group-valid-seq`, `order-by`.
5. **`scoring.js`** — move `countPoints`/`findWinner`; re-export. *Guard:* `gameover-standings`, `scenario`.
6. **`projection.js`** — move grid projections + `count2dArrItems`; re-export. *Guard:* `table-layout`, `cat-avatar`.
7. **`playerView.js`** (privacy seam, solo task) — move `deriveHandCounts`/`stripHandTilePositions`/`sanitizeSnapshot`/`playerView`; re-export; `Game.js` imports it. *Guard:* `player-view` + every Client-harness suite.
8. **`scoring/playScore.js`** — extract pure `computePlayScore` from `applyValidMove`; rewire `moves.js`. *Guard:* `last-play`, `joker-score`, `manipulation-score`.
9. **`turn.js`** — move lifecycle + disconnect adjudication + `forfeitSeat`/`checkGameOver`/`GRACE_MS`/`N_FORFEIT_TURNS`; `Game.js` rewire; `moves.js` re-export. *Guard:* `disconnect-handling`, `force-end-turn`, `forfeit-turn`, `extend-turn`, `scenario`.
10. **ARCH-5 observe** — pin `boardgame.io` to `0.50.2`; confirm/extend the disconnect integration test; verify `scoring/playScore.js` is client-importable. *Guard:* `disconnect-handling`.
11. **ARCH-4** — add `tests/__helpers__/makeMatch.js`; convert the ~12 Client-harness setups. *(Shim removal: separate, gated, optional.)* *Guard:* the converted suites.
12. **ARCH-1 / `usePersistentFlag`** (+ hints-tip wrapper). *Guard:* `coach-card`, `hints-toggle`, `hints-tip`.
13. **ARCH-1 / `useGiveUpConfirm`**. *Guard:* `give-up-confirm`.
14. **ARCH-1 / `useSyncingCue`**. *Guard:* `board-reconnect-cue`.
15. **ARCH-1 / `useComboCelebration`** — write a characterization RTL test FIRST (mount-skip + combo/comboBy on a `lastPlay.ts` change), then extract. *Guard:* new test + `resolve-juice`.
16. **ARCH-1 / `useDropDispatch`** (highest risk; `gRef` live-G) — Board reduces to a layout shell. *Guard:* `resolve-drop-dispatch`, `board-insert-push-dispatch`, `board-joker-swap-dispatch`, `tap-to-place`, `keyboard-tap-to-place`, `multi-drag-order`.

After Task 16: `Board.jsx` is a layout shell composing five hooks; `util.js`/`moves.js` are thin barrels over the domain modules; the server graph is DOM-free; scoring is shared with the client.
