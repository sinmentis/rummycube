# Chaos UX fix T4 — table-wide cast beam + bluff bubble

Status: DONE. Branch feat/chaos-uxfix. Per 08-ui-layout-fixes.md P1 (§5 + interaction flow).
Commit: feat(chaos): table-wide cast beam broadcast + bluff bubble + delay.

## Problem
Ability plays were only legible to the caster: the peek cast beam fired client-side
from your avatar, so opponents never saw who cast what at whom. Bluffs sat in a
center band, detached from the actor.

## What shipped
1. Server broadcast `G.lastCast={from,to,type,blocked,id}` — recordCast() in
   abilities/moves.js mirrors lastWheel/lastTimeout: every resolved applyEffect bumps
   castSeq and stores the event; playerView passes it through unstripped (no tile
   ids). Player-target cards carry to=seat; wheel/bigwind/lock/shield carry to:null.
   junk vs a shield sets blocked=true.
2. CastBeam.jsx gains type/blocked + a 700ms result: pulse ring on a clean hit;
   blocked snaps the beam ~16% short with a burst. Board flashes it on every client
   off lastCast.id (mount-seeded so it never re-pops on reconnect), anchoring from/to
   on `[data-seat] .avatar`.
3. Bluff = `.bluff-bubble` anchored to the actor avatar in TableSeats (claim +
   Challenge/Pass for the eligible challenger). Center-band BluffPrompt removed.
4. No-target casts (wheel/bigwind) skip the target step (useAbilityPlay NO_TARGET)
   and show an `.affects-all-glow`; reduced-motion drops the travel, keeps the result.

## Tests / gate
- TDD cast-broadcast.test.js (12): lastCast {from,to,type,blocked,id}, blocked junk,
  no-target=all, id bump, pview passthrough, bigwind/wheel no target step, ring+burst,
  Board flashes on fresh cast (none in classic), actor bubble. RED→GREEN.
- Full 715 (703 baseline + 12). eslint 0 err / 96 warn (+2 test-mock display-name).
  vite build OK. serve boots (/games -> ["RummyCube"]).
- Classic zero-regression: beam/glow/bubble all isChaos-gated; lastCast only via chaos
  ability moves; reduced-motion guarded.
