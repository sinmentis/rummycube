# RummyCube Expert Review 1 — Game Design / Game-Feel

**Reviewer:** Game Designer agent (claude-opus-4.8) · **Date:** 2026-06-20
**Scope:** playability, depth, game-feel, multiplayer social loop. Commercial/monetization concerns excluded.
**Method:** read core loop (`Game.js`, `moves.js`, `moveValidation.js`, `util.js`), the combo/juice system (`comboMath.js`, `Board.jsx` ~60-86 and ~154-197), the timer (`useTurnTimer.jsx`, `forceEndTurn`), and the create/rematch flow. Findings grounded in code, not the spec summary.

## Findings

### 1. The rules are invisible at the exact moment a player needs them — Critical — Effort S–M
A guest places tiles, hits **End**, the button flashes red and nothing explains why. The ≥30 first-meld rule, "runs/sets need 3+ tiles," and "can't mix new tiles into existing groups on the first meld" are all enforced (`isFirstMoveValid` rejects on `MIXED` / `INV SEQ` / `NOT ENOUGH SCORE`) but the reasons only go to `console.debug`. The green/red End button gives the verdict without the reason, so a new player learns "the button is angry at me," not the rule. For a no-login pick-up-and-play game this is the #1 funnel leak.
**Fix:** Have `isFirstMoveValid`/`isMoveValid` return a reason code instead of a bare boolean; map codes → strings in the UI. When End is red, render the cause next to it (e.g. *"First meld must total ≥30 — you have 22"*, *"Runs need 3+ tiles"*, *"First turn: new tiles can't join existing groups"*). Add a one-time dismissible "≥30 to get started" hint on the first turn.

### 2. The combo system celebrates tile *count*, ignoring the game's signature skill (board manipulation) — High — Effort M
`submitComboCount` = number of tmp tiles placed; `comboLabel` fires NICE/COMBO/ON FIRE at 3/5/7. The depth of real Rummikub is *manipulation* — splitting/recombining the existing board to wedge tiles in. A brilliant 1-tile play that reorganizes the table scores zero combo, while a boring opening dump of the starter meld gets "ON FIRE." The gradient also quietly incentivizes **hoarding** (hold tiles for a big 7-tile flourish), which slows the game and increases everyone's downtime. The reward points at the *least* skillful expression of progress.
**Fix:** Score combo on (a) number of distinct groups formed/extended this turn and (b) tiles integrated via rearrangement of pre-existing board tiles (detectable: a non-`tmp` board tile whose row/col changed vs `prevTilePositions`). Weight manipulation highest; keep tile-count as a minor term; re-label so a tight manipulation play reads as the highlight.

### 3. Jokers are a dead mechanic — no retrieval, worth 0, frozen on placement — High — Effort M–L
`freezeJokersInRun`/`freezeJokersInGroup` lock a joker to a represented value, and there is no joker-retrieval move (swapping the two real tiles a joker represents to reclaim it). In real Rummikub joker manipulation is the highest-skill, highest-drama play; its absence removes a strategic layer and the most memorable "big swing" moments. `validatePlayerMove` also scores jokers as 0 points in `G.lastPlay` (`isJoker(p.id) ? 0 : getTileValue`), so a joker-heavy meld under-celebrates.
**Fix:** Add a joker-retrieval affordance: when a player owns the two real tiles matching a table joker's value+color slot, allow dragging them onto the joker to pop it back to their rack (subject to leaving the board valid). Make the joker carry the value of the tile it represents for combo/celebration.

### 4. Brutal downtime with no planning affordance — High — Effort L (full) / S (interim)
With 4 players and up to 60s turns, a player can sit idle ~3 minutes per round. During opponents' turns the only allowed activity is rearranging your own rack (`fromHandToHand` has no `currentPlayer` guard) and sorting; you cannot pre-stage on the board (`fromHandToBoard` requires `currentPlayer`). Chat helps socially but there's no *gameplay* for the 75% of the time you're not active — the single biggest threat to fun in a 4-player session.
**Fix:** Add a planning/ghost mode active during opponents' turns: drag tiles onto a private translucent overlay to pre-compose the next move (validated when your turn starts, auto-reconciled if the board changed). Cheaper interim wins: highlight which rack tiles can currently extend a board group; show a live count of "playable tiles you're holding."

### 5. The full celebration fires on *your* screen when an *opponent* scores — including a screen kick mid-drag — Medium — Effort S
The `G.lastPlay` effect in `Board.jsx` (~66-86) runs identically on every client: `fx.kick(n)` (screen shake), gold `celebrateGroups` spotlight, particle burst, `flash('combo')`, and a victory sound fire on all players' screens for any valid submit. So when an opponent melds against you, your screen shakes and plays a triumphant sting while you're losing — and if you're rearranging your rack at that moment, the kick disrupts your interaction.
**Fix:** Scale intensity by ownership: full juice (kick, sound, big spotlight) for your own plays; a muted, smaller, no-shake acknowledgment for opponents' plays. Never apply `fx.kick` while the local player has an active drag/selection.

### 6. A disconnected or AFK active player forces a full dead-timer wait every round — Medium — Effort M
`forceEndTurn` correctly rejects before the real server deadline (good anti-cheat), but when the active player is *disconnected* (already shown via the plug badge) everyone still waits the full `timePerTurn` (up to 60s) before any client's `onTurnTimeout` can auto-draw. There's also no resign/forfeit, so one rage-quitter degrades the match until the natural end.
**Fix:** When `matchData[currentPlayer].isConnected === false`, collapse that player's deadline server-side (e.g. a 5s grace `timerExpireAt` in `onTurnBegin`) so their turn auto-draws fast. Add a host/majority vote-to-skip or forfeit for a player disconnected across N consecutive turns, converting their remaining tiles to final score.

### 7. Nothing pulls a player back, and rematch is higher-friction than it should be — Medium-Low — Effort M
Replay value rests entirely on the "ON FIRE" label; no persistent identity, win/loss record, or session-to-session hook (consistent with the no-persistence gap). Rematch (`onPlayAgain`) mints a `nextMatchID`, copies a link, and auto-seats the clicker — but the other 3 players must receive and click that link again, re-entering the join flow.
**Fix:** (a) Use the localStorage identity already kept for reconnect to store lightweight per-nickname stats (games, wins, best combo, fastest win) and surface them on the homepage — cheap retention hook, no backend. (b) Make rematch a lobby-level "Play again?" prompt with a ready check, reusing the existing room.

## Top Pick
**Surface the "why is this invalid" reason on the red End button + a first-turn ≥30 hint (Finding 1).** The audience is guests with zero onboarding; the rule that most often rejects a beginner's move is never stated. The information already exists (the validators distinguish `MIXED`/`INV SEQ`/`NOT ENOUGH SCORE`), so promoting it to a reason code on the existing green/red affordance is small, low-risk, and turns the verdict into an in-context tutorial. Do this first, then redesign the combo to reward manipulation (Finding 2).

## Orchestrator cross-check
Independently confirmed: no rules/help anywhere in `src` (grep returned nothing); the invalid-End path is destructive (see UX report); combo currently = tile count (`submitComboCount`). All consistent with the above.
