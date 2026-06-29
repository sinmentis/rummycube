# Chaos UX fix T3 — interrupts at avatar-band + peek targeting locks table

Status: DONE. Branch feat/chaos-uxfix. P0-3/P0-4 from 08-ui-layout-fixes.md (§3/§4) + UX list.

## Problem
Chaos transient prompts/toasts sat at top (`top-cue-stack:10px`, `peek-targeting:14px`),
colliding with system cues. Peek/lock targeting parked silently: hand + ability
strip stayed live (mis-select), and the prompt was a permanent bar needing manual Cancel.

## What shipped
- A) `.interrupt-band` (board.css, token `--interrupt-band-y:42%`, centered, z9,
  pointer-events none/children auto). Board.jsx mounts it chaos-only and moves
  wheel/timeout/junk/bluff/peek+lock there. Top-cue keeps system cues; classic
  timeout stays top (`!isChaos`). `.peek-targeting` -> position static.
- B) `.board.chaos.is-targeting` (set when pendingPeek||pendingLock): hand dims,
  ability strip inert -> only opponent avatars (peek) / row btns (lock) clickable,
  no mis-select. Deadline-bound effect cancels target (12s safety) -> card stays
  in hand (refund), table unlocks, prompt auto-dismisses. useAbilityPlay unchanged.

## Tests / gate
- board-visual-chaos-interrupts.test.js (8): CSS-source band ~42%, peek static,
  dim/inert, top:10px; RTL toasts in band not top-cue, peek click locks table +
  auto-cancels. RED->GREEN.
- Full 703 (695 baseline + 8). eslint 0 err/94 warn. vite build OK.
- Classic zero-regression: band/dim/timeout-relocation all gated by isChaos.
