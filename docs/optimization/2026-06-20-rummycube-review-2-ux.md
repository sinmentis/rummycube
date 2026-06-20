# RummyCube Expert Review 2 — UX (usability, onboarding, friction)

**Reviewer:** UX Researcher agent (claude-opus-4.8) · **Date:** 2026-06-20
**Scope:** end-to-end first-time experience, cognitive load, error prevention/recovery, status visibility, accessibility basics. Commercial concerns excluded.
**Method:** read the UI components and styling; traced the End/submit path through `moves.js`. Key confirmed behavior: clicking **End** on an invalid board (`endTurn` → `validatePlayerMove` → `drawTile` with rollback, `moves.js:230-250`) silently reverts every placed tile, draws a penalty tile, and ends the turn — with no warning.

## Findings

### 1. The "End" button silently destroys your work and penalizes you on an invalid meld — Critical — Effort M
With tiles placed but the meld invalid (e.g. under the 30-point first-meld threshold), `validatePlayerMove` falls to `drawTile()` (`moves.js:247-249`) → `rollbackChanges` (`moves.js:159-173`) rolls all arranged tiles back to the rack, draws a penalty tile, and ends the turn. The only signal is a 600ms red flash + buzz (`Board.jsx:158-169`) and the red button — neither communicates "this will undo everything and cost you a tile." A first-timer experimenting gets nuked on their first action with zero explanation. Most likely rage-quit moment.
**Fix:** Make an invalid End non-destructive — block submission, keep tiles in place, show an inline reason ("First meld must total ≥30 — you have 18" / "Red group isn't a valid run/set"). Reserve rollback/penalty for the timer-expiry (`forceEndTurn`) path only, and surface a confirm ("End turn and return tiles?") if the player explicitly forfeits.

### 2. No rules anywhere, and the ≥30 first-meld rule is invisible — Critical — Effort M
A grep for rules/tutorial/"30"/first-meld copy returns zero results in `src`. `FIRST_MOVE_SCORE_LIMIT` is enforced only server-side via `console.debug` (`moveValidation.js:140-143`). A player who doesn't already know Rummikub has no way to learn draw-vs-meld, runs vs sets, jokers, or why the first meld is rejected. The two Sort buttons are the only hint mechanics exist.
**Fix:** Persistent "How to play" link in the navbar opening a lightweight modal (objective, draw-vs-meld, run/set definitions, ≥30 first-meld rule, jokers, timer). A one-line tagline under the lobby title. Bonus: contextual first-turn hint ("Make your first meld worth ≥30 points, or Draw").

### 3. System status is ambiguous: no "your turn" label and no numeric timer — High — Effort S–M
Whose turn it is is conveyed only by an `active` CSS glow + a colored ring (`PlayerAvatar.jsx:34-56`). There is no text "Your turn" / "Waiting for Alice", and the timer ring shows no seconds — just a blue→red arc, with no colorblind fallback and no indication of what happens at zero (forced draw/penalty, `forceEndTurn`). New players routinely don't notice it's their turn.
**Fix:** A clear turn banner ("● Your turn" / "Alice's turn") near the rack; render remaining seconds as a number in the ring center; add a "Time's up — you'll auto-draw" affordance as it nears zero.

### 4. The "waiting room" looks like a live, playable game — High — Effort M
No distinct waiting screen — the creator lands on the full felt table with a draggable rack. During `playersJoin`, tiles can still be moved/sorted (`Game.js:52-58`), opponents show tiny "Seat N waiting…" chips (`TableSeats.jsx:30`), and the invite is in a small top-left panel. No headline "Waiting for players", no "1/4 joined" progress, and the board invites premature interaction.
**Fix:** Overlay a clear "Waiting for players — 1 of 4 joined" state with the room code + big Copy-link button front-and-center; dim/disable the board until `play` begins; show joined/empty seats prominently.

### 5. Draw vs. meld is hidden — the Draw button morphs into End — Medium-High — Effort S
`drawOrEnd` swaps the button: Draw shows only when no new tiles are placed; the moment you drop one tile, Draw is replaced by End (`Board.jsx:309-314`). A beginner who places a tile then reconsiders can no longer find Draw and has no idea they must Undo back to an empty board to get it. The "draw OR meld" choice is never presented as a choice.
**Fix:** Show both Draw and End persistently; disable (don't hide) Draw with a tooltip ("Clear your placed tiles to draw instead") when tiles are staged. Label End as "Submit meld."

### 6. Drag-only play, small hit targets, no keyboard path — Medium — Effort M–L
Tiles are ~2.0vw (~29px) on desktop and ~7.6vw on mobile (`board.css:115-118, 618-623`) — below the ~44px touch-target guideline, and the game is 100% pointer-drag via @dnd-kit with no keyboard alternative (keyboard-only users can't play). Precise drags onto a 29px target on a phone will mis-drop frequently.
**Fix:** Increase minimum tile/touch size on mobile; add a tap-tile → tap-destination placement mode as a non-drag fallback (also serves keyboard via arrow-key cursor + Enter). At minimum bump hit targets and add Ctrl+Z/Ctrl+Y for Undo/Redo.

### 7. Landing page never explains what RummyCube is — Medium — Effort S
The lobby is just Create/Join tabs + live server stats. A visitor who doesn't recognize "Rummikub" sees no description, no screenshot, no "play with friends via room code" pitch — raising bounce risk before they create a room.
**Fix:** Short hero line + 2-3 bullet "what it is / how it works" block above the tabs; a "Try solo" shortcut (the existing `0 · solo test` option is buried in a dropdown labeled "Number of players").

### 8. Small polish: inconsistent join copy + leftover dev hooks — Low — Effort S
The Join form labels the field "Room code" but its placeholder says "Enter match ID" (`JoinGame.jsx:65-74`). "Match not found" only appears after typing a full code, with no validation affordance. A global `F8 → debugger` keydown listener ships in production (`App.jsx:25-31`), which hard-pauses the app for anyone with devtools open.
**Fix:** Unify wording to "Room code" everywhere; remove the F8 debugger listener.

## Top Pick
**Fix the invalid-"End" experience first (Findings 1 + 2 together).** It sits at the exact point where a first-timer takes their first real action and fails them three ways at once: the red button doesn't explain why, clicking it silently reverts all arranged tiles and adds a penalty tile, and nothing ever told them the ≥30 rule. Concretely: (a) make invalid End non-destructive, (b) show an inline reason tied to the live red/green tile highlighting already computed (`extractSeqs`/`isSequenceValid`, `Board.jsx:162`), (c) rename it "Submit meld." Far more leverage than any onboarding modal players may skip.

## Orchestrator cross-check
Independently confirmed the destructive invalid-End path and the absence of any in-app rules. The `F8 → debugger` listener is real and ships in prod. The "0 players online" stat contradiction (see Persona report) compounds Finding 7.
