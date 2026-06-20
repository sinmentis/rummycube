# RummyCube Expert Review 3 — Visual / UI Design

**Reviewer:** UI Designer agent (claude-opus-4.8) · **Date:** 2026-06-20
**Scope:** visual hierarchy, consistency, layout, color/contrast, typography, spacing, accessibility, polish. Commercial concerns excluded.
**Method:** read `classic.css`, `board.css`, `chat.css`, `lobby.css`, `index.css` + the JSX; captured live screenshots of the lobby and a solo-test match at 1366×768 and 390×844; computed exact WCAG contrast ratios.

## Findings

### 1. The play surface is invisible — the felt reads as one giant empty void — Critical — Effort M
In-match (desktop and mobile), the top ~60% of the screen is undifferentiated green felt with no visible board, grid, drop-zone, or boundary. The `div.grid-item` graph-paper border was intentionally removed (`board.css:84`) "for the felt look" but nothing replaced it, so the most important surface (where you build runs/sets) is indistinguishable from background. Visual weight is inverted: dead space dominates while the action is crammed into the bottom strip.
**Fix:** Give `.ref`/`.grid-container` a defined "table tray" — a subtly inset felt panel with a soft brass 1px inner border and inset shadow (reuse `--brass-soft` + `--felt-vignette`), centered with a sensible `max-width`, so the board reads as a discrete object. Optionally restore a very faint grid (`rgba(255,255,255,.04)` lines) so column alignment is legible without looking like graph paper.

### 2. Orange tile numerals fail contrast — 2.80:1 on ivory — High — Effort S
Reading the number is the core task, yet `--c-orange #cc7a14` on the ivory tile face (`#f4ecd6`) measures 2.80:1 — below WCAG's 3:1 floor even for large text. The others are healthy (black 14.5:1, blue 7.7:1, red 5.8:1), so orange is the lone weak link, worst on smaller desktop tiles (~27px).
**Fix:** Darken the token to ~`--c-orange: #b5650a` (≈3.6:1) or `#a85c08` (≈4.3:1) — still unmistakably orange against red, but legible. Pure token change in `classic.css:8`; no markup touched.

### 3. Valid/invalid End button is distinguished by hue alone (red vs green) — High — Effort S
The most important feedback signal — "will my submit be accepted?" — is encoded only as green (`.end-valid`) vs red (`.end-invalid`) fill + glow (`board.css:357-367`). For deuteran/protanopia (~8% of men) the two states are nearly identical. Same hue-only issue on the per-tile valid/invalid highlight (`Tile.jsx getTileStyle`, green vs pink) and the timer ring's blue→red fade.
**Fix:** Add a redundant non-color cue to the End state — e.g. "✓ End" (valid) vs "✕ End" (invalid), or a check/cross glyph before the label. Text contrast itself is fine (~6:1); this is purely a second channel.

### 4. Mobile: always-on chat overlaps the top status strip — High — Effort M
At 390px the chat panel is `62vw` pinned top-right (`chat.css:185-188`) and lands on top of the "Tiles left: 92" pill in the `.sidenav` strip — the counter is clipped behind the chat head ("Tiles left: 9…"). Two always-on layers fight for the same corner; it also eats a big chunk of an already-tiny board.
**Fix:** On mobile, collapse chat to a floating bubble/FAB that expands on tap (don't keep the full panel always-open), OR move the tiles-left/invite info into the wood rack header and let chat own the top-right. At minimum, raise the mobile `.sidenav` z-index and reserve its row so chat starts below it.

### 5. Control buttons use a clashing display font and sit at/below the fold — Medium — Effort S
(a) `.controls-wrapper button` (`board.css:70-72`) is set in `font-family: cheva` — a decorative serif that clashes with the Poppins wordmark, tiles, and lobby; the "one classic A1 theme" consistency breaks at the primary action row. (b) Because `.board` is `min-height:100vh` plus the grid's fixed height, on a 768px-tall laptop the Sort/Draw/Undo/Redo row sits right at the bottom edge — primary actions barely in view and the page scrolls.
**Fix:** Switch control buttons to Poppins for a unified type system. Cap board height and pull the rack up so the controls clear the fold (tighten `.board` min-height/padding and the grid's reserved rows), like the mobile layout already does.

### 6. Self-avatar collides with the rack corner; badge & name truncation — Medium — Effort S
`.rack-self` is absolutely pinned to overlap the top-left of the wood rack (`board.css:54-59`), so its red tile-count badge straddles the rack edge and, on mobile (46px avatar), the name truncates to "Tes…". The lone red circular badge is also the only pure-red/white element in an otherwise warm brass/parchment system (`.tile-count`, `board.css:261`), popping in a "notification-y" way.
**Fix:** Seat the avatar in a small reserved notch in the rack's top-left (give the rack a little top padding / recessed seat) so the badge sits cleanly inside; recolor the count badge to brass-on-ink to match the system, reserving pure red for genuine alerts.

### 7. Lots of empty wood on the rack; weak "whose turn" signal — Low — Effort S
The hand grid is 22 columns wide but a starting hand (~14 tiles) fills the left ~60%, leaving a large blank plank on the right. Separately, the only "your turn" cue is the avatar's glow ring — no explicit high-salience affordance near where the eye lives (the rack/board).
**Fix:** Let the rack shrink toward `fit-content` around the actual hand (center the tiles); add a lightweight "Your turn" pill near the rack/End button when `currentPlayer === playerID`, tinted with `--avatar-glow`.

## Top Pick
**Finding 1: define the board play surface.** It fixes the biggest visual-hierarchy failure in one move — the screen is mostly an empty void with real content squeezed to the edges, so the eye is guided nowhere. Framing the board as a discrete brass-edged, vignetted, max-width, centered "tray" establishes the correct hierarchy (board = hero, rack docked below, chat/avatars as satellites) and relieves the spatial competition between the four seats and the always-on chat (Findings 4/6). Contained CSS change, no gameplay/markup risk, and it makes the drop-zone legible.

## Orchestrator cross-check
Independently confirmed from my own 1366×768 and 390×844 screenshots: the empty-void board, the mobile chat overlapping "Tiles left", and the clipped rightmost rack tile on mobile. Orange-on-ivory legibility is visibly weak in the desktop match shot.
