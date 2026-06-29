# Chaos UI / Layout Fixes — implementer spec

Scope: Chaos mode only. Classic must be visually unchanged — every rule below is gated by `.board.chaos` / `isChaos`, or only touches Chaos-only components (`.acard`, `.ability-*`, `.junk-*`, `.bluff-*`, `.wheel-toast`, `.status-*`, `.peek-*`). No new deps. Reuse existing tokens; add only the few listed in §0.

Geometry baseline (already in tree):
- Hand tile = base `.tile`: **2.0vw × 5.4vh**, text `clamp(15px,1.7vw,26px)` (`board.css:408,423`).
- Board tile shrinks: `.ref div.tile{100%×100%}` of a cell that is `2.2vw` × `minmax(34px,1fr)`, text `clamp(9px,1.4vw,18px)`, and `.ref{max-height:54vh}` (`board.css:48,357,363,436,444`).
- Avatar 80px, ring 100px, top-seat at `top:1vh` (`board.css:579,597`). Rack `.hand-buttons`; self avatar `.rack-self`. Timer = `PlayerAvatarWithTimer`, 30s.
- Mount order in `.board`: `.top-cue-stack`(wheel) → seats → peek/junk/bluff/banners → grid → `.hand-buttons`. AbilityHand/Codex are fixed FABs (`Board.jsx:699-808`).

---

## 0. New tokens (append to `:root` in board.css)
```css
--tile-w: 2.0vw;          --tile-h: 5.4vh;     /* one true tile footprint */
--tile-font: clamp(15px,1.7vw,26px);
--hud-band-y: calc(1vh + 40px);                /* opponent-avatar vertical center */
--ability-card-w: 92px;   --ability-overlap: -34px;   /* rack strip mini-cards */
```

## 1. Board tiles must not shrink (match hand tile)
Make cells the tile footprint instead of squeezing tiles into a capped tray.
```css
.board.chaos { --board-row-min: var(--tile-h); }   /* 34px → 5.4vh */
@media (min-width:821px){ .board.chaos .ref{ max-height:none; } }  /* drop 54vh cap */
.board.chaos .ref div.tile{ width:var(--tile-w); height:var(--tile-h); }
.board.chaos .ref .tile-text{ font-size:var(--tile-font); }        /* was clamp(9px,1.4vw,18px) */
```
GridContainer col `2.2vw` → `var(--tile-w)` so cols == hand. `.ref` still `overflow:auto` → tall boards scroll, never resize. Classic keeps 34px/54vh.

## 2. AbilityHand: side-by-side with rack, always visible, overlap + hover lift
Replace the right-edge drawer. Render inside `.hand-buttons` left of `handGrid`; drop `.ability-tab`/`open` state.
```css
.ability-strip{ display:flex; align-items:flex-end; padding-right:1vw; pointer-events:auto; }
.ability-strip .acard{ width:var(--ability-card-w); min-height:128px; flex:0 0 auto;
  margin-left:var(--ability-overlap); transition:transform .14s ease, box-shadow .14s ease, margin .14s; }
.ability-strip .acard:first-child{ margin-left:0; }
.ability-strip .acard:hover,.ability-strip .acard:focus-visible{
  transform:translateY(-14px); margin-right:14px; z-index:3; box-shadow:var(--elev-2); }
@media(max-width:820px){ .ability-strip{order:99;width:100%;overflow-x:auto;justify-content:center;} }
```
Always mounted when `cards.length>0`. Disabled cards keep `.is-disabled`. Bluff bar stays above strip. ≥44px hit area via card width. Delete fixed `.ability-root/.ability-tab/.ability-panel`.

## 3. Transient prompts/toasts → avatar height, centered
Wrap `wheelToast/junkAlert/bluffPrompt/peekTargeting` in one centered band; remove `top-cue-stack:10px` and `peek-targeting:14px`.
```css
.chaos-hud-center{ position:absolute; top:var(--hud-band-y); left:50%; transform:translateX(-50%);
  z-index:9; display:flex; flex-direction:column; align-items:center; gap:8px;
  width:max-content; max-width:min(92vw,420px); pointer-events:none; }
.chaos-hud-center>*{ pointer-events:auto; }
```
WheelToast keeps its `wheel-toast-in`. Banners auto-dismiss after 4s. Reduced-motion: fade only.

## 4. Target-pick prompt: clear + auto-dismiss
`.peek-targeting` lives in band, add 12s safety:
```css
.peek-targeting{ position:static; transform:none; font-size:13px; padding:10px 14px;
  animation:peek-target-pulse 1.4s ease-in-out infinite; }
```
JSX: targets highlighted via existing `.avatar.targetable`; `setTimeout(cancelTarget,12000)`. Reduced-motion drops pulse.

## 5. Challenge/Pass: avatar bubble + table sweep + delay
- Actor-anchored bubble in `tableSeats` (not center): `.bluff-bubble{position:absolute;bottom:calc(100%+8px);left:50%;transform:translateX(-50%);` styled like `.bluff-prompt`, ≤220px, `▼` tail.
- Table-wide cue: `.chaos-table-sweep{position:absolute;inset:0;z-index:7;pointer-events:none;background:radial-gradient(circle,rgba(190,140,224,.22),transparent 70%);animation:sweep .9s ease}` (purple=challenge, gold=pass).
- Resolution delay: hold result 1200ms before clearing `pendingBluff`. Reduced-motion → no sweep, delay 400ms.

## Interaction flow
Spin→wheel-toast @avatar band 4s. Target ability→`.peek-targeting` band + avatars pulse→click→panel; else auto-dismiss 12s. Face-down→`.bluff-bubble` on actor→Challenge/Pass→sweep+1.2s→resolve. Strip cards always visible by rack; hover lifts. 30s ring on `.rack-self`; band sits above grid, never overlaps rack/ring.

Files: `board.css`(tiles,band,tokens), `abilities.css`(`.ability-strip`,bubble,sweep), Board.jsx(`.chaos-hud-center` wrap, strip in `.hand-buttons`, sweep), AbilityHand.jsx(drawer→strip), GridContainer.jsx(col var).
