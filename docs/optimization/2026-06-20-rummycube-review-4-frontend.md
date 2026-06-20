# RummyCube Expert Review 4 — Frontend Performance & Smoothness

**Reviewer:** Frontend Developer agent (claude-opus-4.8) · **Date:** 2026-06-20
**Scope:** render performance, animation jank, drag responsiveness, network/latency handling, perceived speed. Commercial concerns excluded.
**Method:** read `Board.jsx`, `GridContainer.jsx`/`GridSlot.jsx`/`Tile.jsx`, `useTurnTimer.jsx`, `moves.js`, `effects.js`, `chat.css`, `src/server.js`, and inspected the built bundle. File/line citations below.

## Findings

### 1. Unmemoized ~330-tile re-render on every 400ms timer tick — Critical — Effort M
The single `useTurnTimer` in `Board.jsx:264` calls `setTimeLeft` every 400ms (`useTurnTimer.jsx:27`). `timeLeft` is consumed by `Board`, so the entire `RummikubBoard` re-renders 2.5×/second for the whole duration of every turn even when nothing changed. Each render rebuilds the full grid in a plain loop (`GridContainer.jsx:44-69`): 32×9 board slots + 22×2 hand slots ≈ 332 `GridSlot` + `Tile` components, and none of `GridContainer`/`GridSlot`/`Tile` are wrapped in `React.memo` (zero `memo` usages in `components/`). Every `GridSlot` calls `useDroppable` and every `Tile` calls `useDraggable`, so dnd-kit re-registers ~332 nodes 2.5×/sec. Dominant source of sustained CPU burn and felt drag latency (reconciliation competes with pointer-move handling).
**Fix:** (a) Move `useTurnTimer` into a small `<TurnTimer>`/avatar-ring component that owns its own tick instead of returning `timeLeft` up into `Board`. (b) Wrap `Tile`, `GridSlot`, `GridContainer` in `React.memo`. (c) Drive the SVG ring via CSS (`@keyframes` + `animation-duration: <turn>s` on turn start) so it animates with zero React renders.

### 2. console.log left on in production hot paths — High — Effort S
Production ships with console enabled: `Board.jsx:27 console.log('RENDER BOARD')` (every board render → every 400ms), `useTurnTimer.jsx:16 console.log(clamped)` (every tick), `Board.jsx:110 console.log(state)` (every selection, logs the whole state object). The built bundle retains ~46 `console.debug` + 15 `console.log`. Object logging forces serialization and retains references (memory growth with devtools open) and compounds Finding 1.
**Fix:** `esbuild: { drop: ['console','debugger'] }` in `vite.config.js`; delete the `RENDER BOARD` / per-tick / selection logs.

### 3. handleTileSelection callback identity churns every selection — High — Effort S
`handleTileSelectionCb` is memoized with `[G, playerID, state]` (`Board.jsx:109-112`) and passed to every `Tile`. Because `state`/`G` change on every selection/move, the callback gets a new identity each interaction, which (once `Tile` is memoized per Finding 1) would re-render all 332 tiles on each click. Also still contains `console.log(state)`.
**Fix:** Read selection from the existing `stateRef` (`Board.jsx:54`) so the handler depends only on `[G, playerID]` (or nothing, reading both from refs). Prerequisite for Finding 1's memoization to pay off.

### 4. Simultaneous full-screen paint effects on every valid submit — Medium/High — Effort M
The combo effect (`Board.jsx:66-86`) fires all at once: `canvas-confetti` burst up to 80 particles (`effects.js:burstAt`), a full-screen `.fx-flash` overlay, a board shake `board-kick` animating `transform` on the whole `.board` subtree, floating text, plus `celebrateGroups` toggling `box-shadow` glow on every formed tile. The board already carries 20+ box-shadows (incl. multi-layer + `0 0 14px` glows at `board.css:360/366/710`). Confetti compositing + a transform animation on a shadow-heavy subtree + simultaneous glow recalcs is a heavy paint/composite spike — the classic "celebration stutters" on mobile/low-end.
**Fix:** Stagger/condense — keep confetti or flash, not both; promote `.board-kick` to a transform-only animation on a wrapper with `will-change: transform`; cap `celebrateGroups` glow to the submitted run only. (Already gated by `prefers-reduced-motion` — good.)

### 5. backdrop-filter: blur() on the always-on chat panel — Medium — Effort S
`chat.css:20` applies `backdrop-filter: blur(4px)` to the persistent top-right chat. `backdrop-filter` re-samples and blurs everything behind it on every frame where anything underneath changes — and per Findings 1 and 4 the board behind it is constantly re-rendering/animating. On mobile GPUs this is one of the most expensive compositing ops and drops frames during drags near/under the panel.
**Fix:** Drop the blur (use a more opaque solid `rgba` background — already `.58`, bump to ~`.9`), or only enable blur when chat is focused/expanded. Cheapest single smoothness win after the logs.

### 6. Single ~563KB JS bundle, no code-splitting — Medium — Effort M
`build/assets/index-*.js` is one ~563KB chunk pulling in `boardgame.io`, full `lodash` (default `import _ from "lodash"`, `Board.jsx:24`), `bootstrap` + `react-bootstrap`, all of FontAwesome SVG core, `styled-components`, and `canvas-confetti` — all loaded before first paint, hurting TTI on the Cloudflare-tunnelled mobile case.
**Fix:** `React.lazy` the `GameOverModal`/confetti/`ComboOverlay` (only needed mid/post-game); switch to per-method lodash imports (`import every from 'lodash/every'`); drop `bootstrap`/`react-bootstrap` if only a few utilities are used; configure `build.rollupOptions.output.manualChunks` to split vendor/boardgame.io.

### 7. No latency / reconnect feedback to the player — Medium — Effort M
Server-authoritative over socket.io through a Cloudflare Tunnel means every move round-trips before the UI updates. There's a per-opponent disconnect glyph (`PlayerAvatar.jsx:32`) but nothing tells the local player they're laggy or that their own socket dropped/reconnecting — moves feel "stuck" with no cue. Combined with in-memory storage (`src/server.js`, matches lost on restart), a reconnect during a blip can silently fail.
**Fix:** Surface boardgame.io's connection state — a "reconnecting…" banner when the socket is down and a subtle "syncing" indicator on the submitted move until `G` confirms; consider optimistic local tile-placement so drags feel instant while the server confirms.

### 8. Full-snapshot undo stack pushed on every move — Low — Effort S
`moves.js:76` pushes `getGameState(G)` (a full `{tilePositions, prevTilePositions}` snapshot, `moves.js:434`) on every sub-move. Reset each turn (`moves.js:262`) so it doesn't grow across the game, but within a busy turn it inflates the `G` object boardgame.io serializes/broadcasts to all clients on every delta. (Chat is correctly capped at 60 — `ChatPanel.jsx:9`.)
**Fix:** Cap undo depth (last N states) and/or store a compact diff instead of two full position maps.

## Top Pick
**Fix the 400ms whole-board re-render cascade (Finding 1) first** — the single highest-impact change for felt smoothness. Right now, for the length of every turn, ~330 unmemoized drag/drop-registered components re-render 2.5×/sec just to move a countdown number, while the player drags tiles through that same reconciliation. Decoupling the timer (local `<TurnTimer>` + CSS ring) and memoizing `Tile`/`GridSlot`/`GridContainer` collapses that from ~330 renders/400ms to zero when idle and only the touched tiles on a move. Pair it with trivial Finding 2 (drop console) and Finding 5 (remove chat blur) in the same pass — a few hours that remove most perceptible lag before touching bundle-splitting and network resilience.

## Orchestrator cross-check
Independently confirmed: zero `React.memo`/`useMemo` in `components/`; `console.log('RENDER BOARD')` (`Board.jsx:27`) and `console.log(clamped)` (`useTurnTimer.jsx:16`); 67 `console.*` calls in non-test `src`; `useTurnTimer` runs in `Board.jsx:264` feeding `timeLeft` into the board render.
