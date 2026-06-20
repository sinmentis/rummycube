# RummyCube — Optimization Spec (playability / smoothness / UX / game-feel)

**Date:** 2026-06-20 · **Owner:** @sinmentis · **Status:** draft for review
**Live:** https://game.shunlyu.com · **Repo:** github.com/sinmentis/rummycube · **Local:** ~/work/rummycube

## Goal
Raise first-session retention and moment-to-moment quality of an online multiplayer Rummikub game, with no login. Make a rules-naive newcomer able to complete a satisfying first turn, make the table legible, and make play feel smooth.

## Non-goals
- No monetization, ads, accounts, or growth mechanics.
- No new game variants. No art-direction overhaul (the "A1 Classic" felt/wood/parchment system stays).
- Backend persistence is acknowledged as a cross-cutting item but is not required to land the P0/P1 UX wins.

## Source reports (this folder)
1. `2026-06-20-rummycube-review-1-game-design.md`
2. `2026-06-20-rummycube-review-2-ux.md`
3. `2026-06-20-rummycube-review-3-ui.md`
4. `2026-06-20-rummycube-review-4-frontend.md`
5. `2026-06-20-rummycube-review-5-persona.md`
(Plus orchestrator first-hand pass: confirmed empty-void board, mobile chat/HUD overlap, clipped rack tile, per-render + per-tick console logs, zero memoization, destructive invalid-End, no in-app rules.)

## Strongest convergence (multiple independent reviewers)
- **Rules invisible, esp. the ≥30 first-meld** — Critical in reports 1, 2, 5.
- **Invalid "End" is silently destructive** (reverts placed tiles + penalty draw + ends turn, no reason) — Critical in reports 2, 5; echoed in 1.
- **Board is an undifferentiated void** with no drop guides — Critical in report 3; reports 5 + orchestrator.
- **Timer re-renders the whole board ~2.5×/s + prod console on** — Critical (smoothness) in report 4 + orchestrator.
- **Mobile: rack overflow + always-on chat occludes HUD** — High in reports 3, 5, 4, + orchestrator.

## Guiding principles
- Fix the newcomer's first turn before adding features. Teach in context, not via modals nobody reads.
- Never punish without explanation; prefer prevention over destructive correction.
- Keep server authority and the existing anti-cheat (`forceEndTurn` deadline) intact.
- Every change ships with a jest test and/or a Playwright smoke (run from `~/work/rummycube`, `CHROMIUM_PATH` set), per repo convention. Keep all juice gated by `prefers-reduced-motion` and the mute toggle.

---

## P0 — First sprint (newcomer first turn + smoothness). High ROI, mostly S/M.

### WS-1 — Safe & self-explaining submit
**Sources:** UX-1, UX-5, GD-1, Persona-2/6. **Effort:** M-L (server move added). **Revised per spec review — blockers 1-3.**
**Problem:** The destruction is SERVER-SIDE, not client-side: the client `endTurn()` always calls `moves.endTurn()` (`Board.jsx:~47`, inside the post-delay `setTimeout`), and the server `endTurn` routes a dirty-but-invalid board through `validatePlayerMove` → `drawTile()` + `rollbackChanges` (`moves.js:120-133, 159-173, 230-250`) — reverting placed tiles, drawing a penalty, ending the turn. The rejection reason is NOT readily available: `isFirstMoveValid`/`isMoveValid` return bare booleans with `console.debug` reasons, the below-30 score is a local variable, and `G.lastPlay.points` is set only AFTER a valid move (`moves.js:235-244`), so it cannot explain an invalid one. The Draw button also disappears the moment a tile is placed (`Board.jsx:309-314`).
**Change (server-authoritative):**
- Add a pure `submitRejectReason(G, ctx)` to `moveValidation.js` returning `{ code, score?, required?, group? }`, `code ∈ { BELOW_30, RUN_TOO_SHORT, INVALID_GROUP, MIXED_FIRST_MOVE, NO_NEW_TILE, OK }`. Refactor `isFirstMoveValid`/`isMoveValid` to compute the reason+score and expose it; keep their boolean returns as `code === 'OK'`. Do NOT reference `lastPlay`/combo points for invalid reasons — `submitRejectReason` carries the score itself.
- Add a NEW current-player move `submitMeld` that validates and, on invalid, **no-ops (returns INVALID_MOVE) without ending the turn or drawing** — tiles stay on the board. On valid it runs today's valid path (freeze + `lastPlay` + `events.endTurn()`). The "Submit meld" button calls `submitMeld`, NOT `endTurn`.
- Keep rollback + penalty draw ONLY on the timeout path (`forceEndTurn`, already gated on `getSecTs() >= G.timerExpireAt`, `moves.js:142-150`) — do not weaken that anti-cheat. For an explicit, confirmed manual forfeit add a SEPARATE current-player `forfeitTurn` move (it cannot reuse `forceEndTurn`, which rejects before the deadline).
- Client: on a `submitMeld` rejection keep tiles in place and render the reason inline by the (red) button, mapping `code`(+`score`/`required`) → copy (e.g. `BELOW_30` → "First meld must total ≥30 — you have {score}").
- Rename "End" → "Submit meld" when tiles are staged; keep **Draw** visible-but-disabled (tooltip "Clear your placed tiles to draw instead").
**Acceptance:**
- Jest: `submitRejectReason` returns each `code` (+`score` for `BELOW_30`) for crafted boards; valid board → `OK`.
- Jest: `submitMeld` on an invalid board returns INVALID_MOVE and does NOT mutate `G.tilePositions`, hand size, `tilesPool`, or `ctx.currentPlayer` (no rollback, no penalty, no turn end); on a valid board it freezes + sets `lastPlay` + ends the turn.
- Jest: `forceEndTurn` after the deadline still rolls back + penalises (unchanged); `forfeitTurn` by the current player rolls back + penalises with explicit intent.
- Playwright (solo): place 2 tiles → button red + inline reason; clicking it leaves the board unchanged; no `pageerror`.

### WS-2 — First-run onboarding
**Sources:** UX-2, UX-7, GD-1, Persona-1/7. **Effort:** M.
**Problem:** No rules/tutorial anywhere in `src`; the ≥30 rule, runs/sets, jokers, and the timer are never explained; the joker renders as an unlabeled smiley tile; the landing page never says what the game is.
**Change:**
- A persistent "How to play" affordance in the navbar opening a lightweight modal: objective, draw-vs-meld, run/set definitions, the ≥30 first-meld rule, jokers, the turn timer. Static content, no backend.
- A one-time dismissible first-turn coach card (localStorage flag) stating the objective + "your first move must total ≥30 points in runs/sets."
- Label the joker on hover/long-press as "Joker (wildcard)."
- Lobby: a short hero line + 2-3 "what it is / how it works" bullets above the Create/Join tabs.
**Acceptance:**
- Playwright: navbar "How to play" opens a modal containing the strings "30" and "run"/"set"; closing it persists (re-open of the match page doesn't auto-show the coach card again after dismissal).
- Visual: joker tile exposes an accessible label.

### WS-3 — Legible board surface
**Sources:** UI-1, Persona-5, orchestrator. **Effort:** M.
**Problem:** The felt is one empty void; empty `grid-item` cells render no guide (`GridSlot.jsx:42` only tints on `isOver`), so there's no affordance for where tiles drop, and near-miss drags snap back.
**Change:**
- Frame `.ref`/`.grid-container` as a discrete inset "table tray": brass 1px inner border + `--felt-vignette` inset shadow + centered `max-width` (CSS only, no markup risk).
- Restore a very faint grid (`rgba(255,255,255,.04)` lines) for column legibility.
- On drag-start, highlight valid/empty drop slots. Add a pure `resolveDropSlot(pointerRect, gridRect, occupancy, selectionLength)` that snaps to the nearest slot AND requires `selectionLength` CONTIGUOUS empty slots for a multi-select; if contiguous space is insufficient it REJECTS the drop (no partial/overlapping placement). `moves.moveTiles` places multi-selections at `col+index` with no preflight (`moves.js:114-121`), so this resolver must run before it; keep the `moveTiles` contract unchanged.
**Acceptance:**
- Jest: `resolveDropSlot` — single tile snaps to nearest empty; a 3-tile selection onto a 2-gap region is rejected (not partially placed); onto a 3-gap region it places contiguously.
- Playwright (solo): during a drag, droppable cells are visibly marked (a class/state on empty `.grid-item`s); a single-tile drop offset by < half a cell still commits (Undo enabled).
- All existing drag/multidrag smokes still pass.

### WS-4 — Performance quick wins
**Sources:** FE-1/2/3/5, orchestrator. **Effort:** M.
**Problem:** `useTurnTimer` lives in `Board.jsx:264`; its 400ms `setTimeLeft` re-renders the whole board (~332 unmemoized `GridSlot`+`Tile`, each (re)registering dnd-kit) 2.5×/s every turn, with `console.log` per render and per tick. `handleTileSelectionCb` identity churns each selection. Chat's `backdrop-filter: blur` repaints over the constantly-animating board.
**Change:**
- Move the countdown into a self-contained `<TurnTimer>`/avatar-ring component that owns its own tick (or drive the SVG ring purely via CSS `animation-duration` set on turn start), so `Board` does not re-render on the tick.
- Wrap `Tile`, `GridSlot`, `GridContainer` in `React.memo` — but note this is DEFEATED today because `GridSlot`/`Tile` receive the whole `selectedTiles` ARRAY (`GridSlot.jsx:14,34`, `GridContainer.jsx:30,51`), which changes every selection. Pass a precomputed `isSelected` boolean down instead (compute membership in `GridContainer`), drop unused pass-through props (e.g. `hoverPosition`) from the memo boundary, or supply a custom comparator.
- Stabilize ALL tile callbacks via refs so identity is stable: `handleTileSelectionCb` (deps `[G, playerID, state]`; remove its `console.log(state)`) and `handleLongPressCb` (captures `G`, `Board.jsx:113-115`). Read `G`/selection from refs so deps are empty/stable.
- `vite.config`: `esbuild: { drop: ['console','debugger'] }`; delete the `RENDER BOARD` / per-tick logs explicitly too.
- Replace chat `backdrop-filter: blur(4px)` with a more opaque solid background (~`.9`).
**Acceptance:**
- Automated: an exported dev-only render counter (stripped by the production build) + a jest/RTL test asserting a timer tick does NOT re-render `GridContainer`, and selecting one tile re-renders only the changed tiles — not all ~330.
- Playwright (solo): production bundle contains no `console.log`; no `RENDER BOARD`/per-tick logs over ~5s idle on your turn.
- All existing jest tests still pass; drag/multiplayer/touch smokes green.

---

## P1 — Second sprint

### WS-5 — Turn & timer legibility
**Sources:** UX-3, UI-7, Persona-6/8. **Effort:** S-M.
**Change:** Explicit "● Your turn" / "{name}'s turn" banner near the rack; render remaining **seconds** in the ring center; first-turn microcopy "When the ring runs out, your turn ends automatically"; a gentle last-seconds warning pulse.
**Acceptance:** Playwright: on your turn the banner reads "Your turn" and a numeric seconds value is present and decreasing; colorblind-safe (not color-only).

### WS-6 — Distinct waiting room · **PROMOTED to Sprint 1 / P0 (spec review major 8)**
**Sources:** UX-4, Persona-3. **Effort:** M.
**Why P0:** Persona's "Prime bounce moment #1" is the waiting room, which happens BEFORE the first turn for exactly the invited newcomer this spec targets. At minimum the waiting overlay + disabled board ship in Sprint 1; the invite-panel polish may trail.
**Change:** During `playersJoin`, overlay "Waiting for players — {joined} of {n} joined" + spinner; surface room code + a large Copy-link button; dim/disable the board; relabel the invite panel ("Need more players? Share this room").
**Acceptance:** Playwright: a freshly created 2-player match shows the waiting overlay with "1 of 2"; the board is non-interactive until the second player joins.

### WS-7 — Mobile layout pass (also closes the long-standing mobile TODO)
**Sources:** UI-4, Persona-4, FE/UX (mobile), orchestrator. **Effort:** M-L.
**Change:** Horizontally scrollable / auto-fit rack so all hand tiles are reachable on 390px; collapse chat into a tappable bubble/FAB that expands on demand (not always-on) on narrow widths; ensure the tiles-left/invite HUD never sits under chat (z-index + reserved row); size/position the 4 seat avatars to not clip or overlap the rack. Also pull the primary control row (Sort/Draw/Submit/Undo/Redo) above the fold — today `.board` `min-height:100vh` + the grid's fixed height pushes controls to the very bottom edge on 768px laptops (UI-5); cap board height and reserve rack space so controls are always visible (desktop + mobile).
**Acceptance:** Playwright at 390×844: every hand tile is within the scrollable rack (none clipped); the chat does not overlap the "Tiles left" HUD; no `pageerror`.

### WS-8 — Accessibility & contrast
**Sources:** UI-2/3, UX-6. **Effort:** S-M.
**Change:** Darken `--c-orange` to ≥3:1 on the ivory tile face (`#b5650a`+); add a non-color second channel to the End valid/invalid state (✓/✕ glyph) and to the per-tile valid/invalid highlight; bump mobile tile hit targets toward 44px; add Ctrl+Z / Ctrl+Y for Undo/Redo.
**Acceptance:** Computed contrast of orange numerals ≥3:1; the End state is distinguishable in grayscale (glyph present); keyboard Undo/Redo works.

### WS-9 — Combo redesign (reward skill, not hoarding; don't punish bystanders)
**Sources:** GD-2, GD-5. **Effort:** M.
**Decision required (see Open questions).** **Change:**
- Re-base combo scoring on distinct groups formed/extended + tiles integrated by rearranging pre-existing board tiles, with tile-count a minor term; re-label so manipulation reads as the highlight. IMPORTANT: `G.prevTilePositions` is reset every turn in `onTurnBegin` (`moves.js:267`), so the manipulation score MUST be computed inside `validatePlayerMove` BEFORE `freezeTmpTiles()`/`events.endTurn()` and stored in `G.lastPlay` — the baseline is gone by the next turn; do not recompute it client-side later.
- Scale juice by ownership: full effects for your own play; muted, no-`fx.kick`, no win-sting for opponents' plays; never `fx.kick` while the local player has an active drag/selection.
- (FE-4) Reduce the valid-submit paint spike: keep confetti OR `flash`, not both; move `board-kick` to a transform-only animation on a wrapper with `will-change: transform` (not the 20-box-shadow `.board` subtree); cap `celebrateGroups` glow to the submitted run.
**Acceptance:**
- Jest: combo value for a 1-tile manipulation forming 2 groups exceeds a 3-tile flat dump; `lastPlay` carries the manipulation score computed pre-freeze.
- Jest: the juice-gating predicate returns "no kick" for an opponent's `lastPlay` and while a local drag/selection is active.

---

## P2 — Third sprint

### WS-10 — Reduce downtime
**Sources:** GD-4. **Effort:** S (highlight) → L (planning mode).
**Change:** Now: highlight which rack tiles can currently extend a board group + a "playable tiles you hold" count. Later: a private translucent planning overlay during opponents' turns, validated/reconciled on your turn.
**Acceptance:** Jest: a pure `playableTiles(hand, board)` helper unit-tested on constructed state (a run/set on the board + a matching tile in hand → marked; non-matching → not). Playwright (solo, constructed/seeded state if feasible): the marker renders. (Avoid depending on a random deal.)

### WS-11 — Joker depth
**Sources:** GD-3, Persona-7. **Effort:** M-L.
**Change:** Add a joker-retrieval move (drag the two real tiles matching a table joker's value+color onto it to reclaim it, only if the board stays valid); make the joker carry its represented value for combo/celebration scoring.
**Acceptance:** Jest: retrieval succeeds when the two matching tiles are owned and the board stays valid, rejected otherwise; a joker contributes its represented value to `lastPlay.points`.

### WS-12 — Disconnect handling (architecture spike first)
**Sources:** GD-6. **Effort:** M-L. **Revised per spec review — major 7.**
**Constraint:** `onTurnBegin({G, ctx})` has NO access to `matchData`/`isConnected` (`moves.js:259-268`); `isConnected` is boardgame.io match metadata consumed only by the UI (`PlayerAvatar`), not authoritative game state — so "collapse `timerExpireAt` for a disconnected seat" is not implementable in a move as-is.
**Change:** Spike first — mirror connection state into authoritative state via trusted server-side middleware / a boardgame.io plugin (or a server `onConnectionChange` hook writing `G.connected[seat]`), then collapse that seat's grace deadline and add a vote-to-skip/forfeit across N disconnected turns (convert remaining tiles to final score). Never trust a client-supplied connection flag.
**Acceptance:** Spike doc on how connection state reaches game state; then jest/smoke: a disconnected active seat auto-advances within the grace window rather than the full `timePerTurn`.

### WS-13 — Network resilience & load
**Sources:** FE-6/7. **Effort:** M.
**Change:** Surface boardgame.io connection state (a "reconnecting…" banner when the socket is down; a "syncing" cue on a submitted move until `G` confirms); consider optimistic local tile placement. Split the 563KB bundle (`manualChunks` for vendor/boardgame.io), per-method `lodash` imports, `React.lazy` the GameOverModal/confetti/ComboOverlay; drop `bootstrap`/`react-bootstrap` if unused.
**Acceptance:** Build emits >1 chunk and the main chunk shrinks measurably; a forced socket drop shows the reconnecting banner.

### WS-14 — Input alternatives
**Sources:** UX-6. **Effort:** M-L.
**Change:** A tap-tile → tap-destination placement mode as a non-drag fallback (also enables a keyboard cursor + Enter path).
**Acceptance:** Playwright: a tile can be placed via two taps without a drag.

---

## P3 — Backlog / polish

- **WS-15 Visual polish** (UI-5/6/7): control buttons → Poppins; rack shrinks toward `fit-content`/centers the hand; self-avatar in a reserved rack notch with a brass-on-ink count badge; cap board height so controls clear the fold. **S.**
- **WS-16 Retention & rematch** (GD-7): per-nickname localStorage stats (games, wins, best combo) on the homepage; one-tap in-room rematch with a ready check instead of re-sending links. **M.**
- **WS-17 Homepage clarity** (UX-7, Persona-2): hero "what is this"; low-stat copy so "0 players online" doesn't read as dead; an explicit "Try solo" entry (surface the buried `0 · solo test`). **S.**
- **WS-18 Cleanup** (UX-8, FE-8, Persona-2): unify "Room code" wording (fix the "Enter match ID" placeholder); remove the production `F8 → debugger` listener (`App.jsx:25-31`); cap the undo snapshot stack depth (FE-8); soften the homepage "0 players online" copy so a low count doesn't read as a ghost town (Persona-2). **S.** Acceptance: jest asserts the undo stack never exceeds N within a turn; the F8 listener is absent from the bundle; join copy reads "Room code" everywhere.

## Cross-cutting / platform (decision needed)
- **Persistence:** `src/server.js` configures no `db` → boardgame.io uses InMemory, so every redeploy/restart wipes in-progress matches and the `/api/stats` counts, and a reconnect during a restart fails. Switching to FlatFile or SQLite makes reconnect (WS-13) and stats durable. Recommend scheduling alongside WS-13. (Already noted as an open item in project memory.)
- Keep `prefers-reduced-motion` and mute gating on all new juice. Keep server-authoritative validation and the `forceEndTurn` deadline anti-cheat intact (WS-1 must not weaken it).

## Recommended sequencing
1. **Sprint 1 (P0):** WS-1, WS-2, WS-3, WS-4, **WS-6 (waiting-room core)** — the newcomer's pre-game and first turn become safe, legible, teachable, and smooth.
2. **Sprint 2 (P1):** WS-5, WS-7, WS-8, WS-9 (+ WS-6 invite-panel polish if it trailed).
3. **Sprint 3 (P2):** WS-10, WS-11, WS-12 (spike first), WS-13 (+ persistence), WS-14.
4. **Backlog (P3):** WS-15–18.

**Dependency notes:**
- WS-1's typed reject reason codes feed the inline diagnostics in WS-5 (legibility) and the teaching cues in WS-8 — do WS-1 first within Sprint 1.
- WS-4's `React.memo` only pays off after the callback/`isSelected`-prop refactor in the same workstream; memoizing without that is a no-op (the array prop still changes every selection).
- WS-9's manipulation score must be written in `validatePlayerMove` (pre-freeze) before any WS-13 persistence work tries to read it from history.
- WS-12 is gated on its own spike (connection state → authoritative game state) before estimation is meaningful.

## Open questions / decisions for the owner
1. **Invalid submit (WS-1):** the spec's default is a non-destructive `submitMeld` no-op on invalid (never auto-draws), with the existing draw penalty firing ONLY on the `forceEndTurn` timeout path. Decision: keep that, or also offer an explicit, confirmed "forfeit my turn → draw" button (separate `forfeitTurn` move)? Spec assumes no-op submit + optional explicit forfeit.
2. **Combo redesign (WS-9):** adopt manipulation-weighted scoring (changes how the headline number feels), or keep tile-count but only remove the hoarding incentive + the bystander screen-kick? Spec assumes manipulation-weighted.
3. **Mobile chat (WS-7):** collapse to a bubble on phones (recommended), or keep always-on but shrunk?
4. **Planning/ghost mode (WS-10):** is the full overlay wanted, or just the playable-tile highlight for now?
5. **Persistence backend:** FlatFile (simplest, file on a mounted volume) vs SQLite (queryable, still self-hosted)?

## Revision log
- **v2 (2026-06-20, post rubber-duck on gpt-5.5):** independent review caught 3 load-bearing blockers, all verified correct against the code before incorporating:
  1. *Invalid-submit destruction is server-side.* The client always calls `moves.endTurn()`; the server's `endTurn → validatePlayerMove` does `drawTile()` + `rollbackChanges()` on invalid (`moves.js:120-173`). A client-side precheck cannot stop it, so WS-1 now specifies a new server-authoritative `submitMeld` move that no-ops on invalid, plus `submitRejectReason()` returning typed `{code, score?}`, and a separate `forfeitTurn`; the draw penalty stays only on the `forceEndTurn` timeout path (which itself rejects before the deadline, so it can't be reused for a manual forfeit).
  2. *`React.memo` would be a no-op as first written.* `GridSlot`/`Tile`/`GridContainer` receive the `selectedTiles` array, which is a new reference every selection (`GridSlot.jsx:14,34`; `GridContainer.jsx:30,51`). WS-4 now passes an `isSelected` boolean and stabilises `handleLongPressCb`/`handleTileSelectionCb` (which capture `G`) via refs.
  3. *Manipulation score can't be computed after the turn.* `G.prevTilePositions` is reset every `onTurnBegin` (`moves.js:267`), and `onTurnBegin({G,ctx})` has no `matchData`. WS-9 now computes the manipulation score inside `validatePlayerMove` before freeze; WS-12 is reduced to an architecture spike (get connection state into authoritative game state) before estimation.
  Also incorporated: WS-3 contiguous-empty-slot rule for multi-tile drop (reject, don't partial-place); WS-6 waiting-room core promoted into Sprint 1 (Persona's first bounce is pre-first-turn); WS-7 adds the controls-above-the-fold fix (UI-5); WS-10 leans on a pure `playableTiles` helper unit test instead of a random deal; WS-18 adds the undo-cap assertion + the "0 players online" copy softening; dependency notes added to sequencing.
