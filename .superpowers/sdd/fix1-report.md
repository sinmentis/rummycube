# Fix 1 — Chaos spec-fidelity bugs (rubber-duck audit)

Branch `feat/chaos-uxfix2`. Each fix matches spec 06 (chaos DLC). Classic stays
zero-regress, all chaos paths gated, normal-only, deterministic (server `random`).

## Fixes
1. **Penalty draws normal-only.** `resolveJunk` now routes through `drawNormal`
   (junk accept + onTurnEnd timeout default). `wheel.js popToHand` skips jokers
   like `addSet`/`drawNormal`. Jokers stay in the pool; penalties never hand out
   the §4 bomb. (moves.js, wheel.js)
2. **Wheel hits a random seat.** Player object now rolls `0..numPlayers-1` and
   stores it in `detail.seat`, not `ctx.currentPlayer`. (wheel.js)
3. **Off-turn lock.** `canPlay = isMyTurn && !waiting && !pendingJunk &&
   !pendingBluff`; AbilityHand greys the strip when false; `useAbilityPlay`
   refuses to dispatch/park when not playable. (Board.jsx, AbilityHand.jsx, hook)
4. **Declare = 10, target-kind fixed.** All 10 types bluffable. shield=self,
   wheel/bigwind=table, peek/junk/skip/force=player, lock=board. SINGLE_TARGET
   trimmed to player-aimed cards; bluff lock parks for a board row. (cardMeta, moves, hook)
5. **Copy.** Codex "any number of ability cards"; Lock "2 turns". (AbilityCodex, cardMeta)

## Tests (TDD)
- no-joker-in-penalty: chaos-junk (junk accept) + wheel (draw) skip jokers.
- wheel seat random != caster.
- off-turn rejected: AbilityHand inert + hook refuses.
- declare 10 + single-target excludes shield/wheel/bigwind/lock; lock "2 turns".

## Verify
- full: 730 passed (baseline 715, +15) / 140 suites.
- lint: 0 errors (96 pre-existing warnings, none new).
- build: ok (vite, 3.4s).
