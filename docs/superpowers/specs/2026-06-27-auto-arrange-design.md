# Auto-Arrange Engine — Design Spec

**Date:** 2026-06-27
**Status:** Approved (design), pending implementation plan
**Scope:** Step 1 of 2. This spec is the **validity-aware auto-arrange engine** (server-authoritative). Step 2 (separate spec, after this lands) is the **no-scroll responsive fit** — shrink the board so every tile is visible without scrolling.

## Goal

Make the board organize itself. When a player drops tile(s), the affected region reflows **toward a valid layout**: tiles that can connect into a valid run/group snap together; a junction that would be invalid is held apart by a gap; a connectable block is re-ordered for the player. The player never spends time tidying the table — the system does it, while never destroying a set the player already built.

## Background — the current model and the bug

The board is a grid of `BOARD_ROWS = 9` × `BOARD_COLS = 32` cells. Within a **row**, a maximal run of **contiguous occupied columns** is a *sequence*; a gap (≥1 empty column) breaks one sequence from the next (`extractSeqs`, moveValidation.js:25). A sequence is **valid** when it is a **run** (same colour, consecutive values, length ≥3; one `13→1` wrap is allowed, with `1` at the end — `countSeqScore`, tile/sequence.js:171) or a **group** (same value, distinct colours, length ≥3). Jokers are wild and validated in place (`isSequenceValid` / `freezeSeqJokers`). Mid-game the board may be invalid; only **submit** validates the whole board.

Today, dropping tiles routes through `resolveDropDispatch` → `insertWithPush` (insertPush.js), which is **purely geometric**: it ripples colliding tiles aside and re-opens separators by **position only** — it never reads numbers or colours. So the board never moves *toward validity*; the player still rearranges by hand. The owner's verdict: this push "has no practical value." This spec replaces that geometric push with a **semantic** engine.

## The two triggers (the system intervenes only here)

The player keeps **free positioning**. The engine acts only when:

1. **Snap / tidy on drop** — a drop reflows the **cluster** it lands in (defined below). Rows and blocks the player did not touch stay exactly where the player put them.
2. **Space pressure** — if a reflow needs more room than its row has, intact sets are moved to make room (slide → relocate across rows → reject), described in §6.4.

There is **no proactive centering or compaction**. A set on row 2 and a set on row 9 both stay put when there is room. "Centering" exists only as a tie-break **direction** when a forced relocation must choose a row (§6.4).

## Definitions

- **Cluster** — given a drop at `(row, col)`, the maximal set of tiles in `row` reachable from the dropped tiles across gaps of **≤1 empty column**. Tiles separated by **≥2 empty columns** are a different region and are never read or moved by this drop.
- **Pre-drop valid block** — a contiguous sequence inside the cluster that was already a valid run/group **before** this drop.
- **Leftover** — cluster tiles the solver could not place in a valid block (allowed mid-game).

## §6 The arrange algorithm

`arrangeBoard(tilePositions, drop) → { placements, ok }`, where `drop = { droppedIds, row, col }`. `placements` maps each affected `tileId → { gridId:'b', row, col }`; `ok:false` means **reject** (the move becomes `INVALID_MOVE`, a non-destructive snap-back). The function is **pure** and **deterministic** (same inputs → same output) so the boardgame.io client (optimistic) and server (authoritative) agree.

### §6.1 Cluster identification
From the dropped tiles' landing columns in `row`, expand left and right across ≤1-gap hops to collect the cluster's tiles and record which contiguous sub-runs were **pre-drop valid blocks**.

### §6.2 The partition solver (the core)
Find how to split the cluster's tiles into valid blocks. **Two passes** encode the owner's iron rule — *break an existing set only if everything ends up valid*:

- **Pass 1 — all-valid.** Search for a partition of the **whole** cluster into valid blocks with **zero leftover**. If one or more exist, pick the best (see objective) and use it. Reaching all-valid is the *only* licence to reorder/split/merge/break a pre-drop valid block.
- **Pass 2 — preserve (no all-valid exists).** Keep every pre-drop valid block intact (it may be **extended** by adjacent dropped tiles if it stays valid — e.g. `r5 r6 r7` + `r4` → `r4 r5 r6 r7`, but never destroyed). Arrange the remaining tiles (dropped + any pre-drop leftover) into the best valid blocks; whatever still doesn't fit a block is **leftover**.

**Objective (tie-breaks, in order):** (1) maximise coverage (fewest leftover tiles); (2) fewest blocks (longest runs/groups); (3) **stability** — fewest tiles moved from their current columns / most pre-drop block boundaries preserved (least visual churn). Ties resolve deterministically by a fixed tile ordering.

**Jokers** are ordinary wild tiles to the solver — candidate blocks are validated with `isSequenceValid` (which already freezes jokers to their represented value). The "settled joker is protected" behaviour falls out of Pass 2 (a not-all-valid cluster keeps its existing valid block, joker included).

**Bound + fallback.** The search is a memoised DFS over the cluster's tile multiset (only forming a block that includes the smallest uncovered tile, pruning by remaining multiset). A row's cluster is small (≤ a row's worth, realistically ≤14), so this is tractable. For a pathological cluster (> 20 tiles, effectively never) fall back to the existing greedy `tryOrderTiles` / `groupValidSequences`.

### §6.3 Layout within the row
- **Order inside a valid block is canonical**, not drop-position-driven: lay each block in the **validated order** the solver found (a run ascending, except the one `13→1` wrap keeps `1` at the end — use the solver's order, never a naive ascending sort; group colour order is free).
- **Blocks are separated by exactly one empty column.**
- **Leftover** keeps **≥1 empty column** from every valid block. Related loose tiles (same value, or adjacent values/colour) stay **together**; unrelated loose tiles are **gap-separated** so they never read as one (invalid) block (e.g. leftover `b7 k7` → `b7 k7`; leftover `b7` + `y2` → `b7 _ y2`).
- **Which side a leftover / new block attaches** = the side of the cluster **nearest the drop column**: drop near the cluster's left end → left side; near the middle or right end → right side; tie → right. (Order *inside* a valid block is still canonical; only the leftover/new block's **side** follows the pointer.)

### §6.4 Space management (only when §6.3 needs more room than the row has)
Applied after the cluster's target layout is known:
1. **Expand** into the row's adjacent free columns.
2. **Slide** a blocking **complete valid set** horizontally (intact — never reordered or broken) to free columns.
3. **Relocate across rows.** If the row has no horizontal room, move the blocking complete set **whole** to another row that has enough contiguous free space. Cascading is allowed — one drop may shuffle several rows. The **direction** (up vs down) prefers whichever is **closer to the board's vertical centre**; deterministic tie-break by row index.
4. **Reject** (`ok:false`, snap-back) only if no arrangement fits anywhere — essentially never once Step 2's shrink-to-fit lands, because the board's capacity (9×32) far exceeds the tiles in play.

The set that yields is always a **bystander**; the cluster the player is actively dropping into stays in its row and expands. Relocation moves **whole valid sets only** — it never breaks or reorders a set. Termination: each relocation targets a row with strictly enough existing free space (or cascades to one), bounded by the finite board; failure → reject.

## §7 Joker handling (summary)
- **Dropped joker** — treated as wild by the solver; used to complete/extend a block **only** under the all-valid rule (§6.2).
- **Settled joker in a valid block** — protected by Pass 2; never extracted to form something else unless the whole cluster goes all-valid.
- **Explicit retrieve stays separate** — dropping a hand tile **exactly** onto a settled board joker that sits in a valid sequence with a **matching value** still swaps the joker back to hand (`jokerSwapTarget`, dndUtil.js). The dispatch checks retrieve **first**; auto-arrange handles everything else. The two never conflict.

## §8 Architecture

- **Server-authoritative.** The arrange runs **inside the boardgame.io move**. The client runs the move optimistically and the server authoritatively — the same pure engine — so every client sees the same result. Submit-time validation is unchanged.
- **Pure, DOM-free engine** in a new `src/rummikub/arrange/` package (joins the shared kernel that must stay DOM-free per `docs/ARCHITECTURE.md`). Reuses `isSequenceValid` / `extractSeqs` / `tryOrderTiles` / `groupValidSequences`.
- **Move atomicity.** The engine computes `placements` purely; the move applies them in one immer update. A `reject` returns `INVALID_MOVE`, so the draft is discarded and `G` is untouched (the architecture's move-atomicity invariant).
- **Replaces the geometric push.** `resolveDropDispatch` keeps the **joker-retrieve** branch, drops the geometric **push/bridge/snap** decision, and instead computes `drop = {droppedIds, row, col}` and dispatches the **arrange move**. `insertWithPush` is superseded; its pure column-ripple may be reused internally by §6.4's horizontal **slide**, but it is no longer the placement decision.
- **Client** sends only `(droppedIds, row, col)`; the move does cluster → solve → layout → space → apply. Simpler client, authoritative server.

## §9 Module structure (deep modules, clear seams)

- `src/rummikub/arrange/cluster.js` — pure: `(tilePositions, row, col, droppedIds) → { tiles, preDropValidBlocks }`.
- `src/rummikub/arrange/partition.js` — pure: `(clusterTiles, preDropValidBlocks) → { blocks, leftover }` (the two-pass solver; the riskiest unit, gets the most tests).
- `src/rummikub/arrange/layout.js` — pure: `(partition, dropSide, rowOccupancy, boardDims) → placements | needsSpace` (§6.3 + the §6.4 space manager, incl. cross-row relocation).
- `src/rummikub/arrange/index.js` — `arrangeBoard(tilePositions, drop)` orchestrator returning `{ placements, ok }`.

## §10 Worked examples (the test oracle)

Notation: `r5` = red 5, `b`/`k`/`y` other colours, `J` = joker, `_` = one empty column. Drop pointer noted where it matters.

| # | Board (row) | Drop | Result | Why |
|---|---|---|---|---|
| 1 | `r1 r2 r3 r4 r5` | `r3` | `r1 r2 r3 _ r3 r4 r5` | Pass 1 all-valid `123`+`345`; canonical order |
| 2 | `r1 r2 r3` near `r7 r8 r9` (no gap) | place `789` by `123` | `r1 r2 r3 _ r7 r8 r9` | Pass 1 `123`+`789`; separator keeps both valid |
| 3 | `r1 r2 r3 _ r5 r6 r7` | `r4` | `r1 r2 r3 r4 r5 r6 r7` | Pass 1 one 7-run; bridge across the single gap |
| 4 | `r3 r4 r5` | `r6` dropped on the **left** of r3 | `r3 r4 r5 r6` | Order inside a run is canonical; drop side irrelevant for a *merged* tile |
| 5 | `r5 r6 r7`, drop near r6/r7 | `b7 k7` | `r5 r6 r7 _ b7 k7` | No all-valid → Pass 2 keeps run; `b7 k7` leftover on the **right** (pointer side) |
| 5b | `r5 r6 r7`, drop on **r5** | `b7 k7` | `b7 k7 _ r5 r6 r7` | Same, leftover on the **left** (pointer side) |
| 6 | row A `r5 r6 r7`; row B `b1 b2` (invalid) | `r4` on row A | `r4 r5 r6 r7` on A; B untouched | "All-valid" judged on the **cluster only**, not the whole board |
| 7 | `r5 r6 r7` (J=… n/a) | `J` | `r5 r6 r7 J` | Joker wild, all-valid 4-run |
| 7b | `r5 _ r7` | `J` between | `r5 J r7` | Joker bridges the gap (J = r6) |
| 8 | `r5 J r7` (J=r6, valid) | `b6 k6` | `r5 J r7 _ b6 k6` | Pass 2 protects the settled joker; `b6 k6` leftover |
| 9 | `r1…r9` (9-run) at cols 0–8; `b1 b2 b3` at cols 11–13 | second `r5` | `r12345 _ r56789` on the row; `b1 b2 b3` **slid/relocated** to keep a gap | §6.4: cluster expands, bystander set yields (intact); cross-row if no horizontal room |
| 10 | leftover `b7` and unrelated `y2` | — | `… _ b7 _ y2` | Unrelated loose tiles gap-separated |
| 11 | `r5 r6 r7`, drag **r6 out** to hand | remove r6 | `r5 r7` (collapsed, 2-tile leftover) | Source cluster re-tidies; can't reform → leftover until refilled |

## §11 Testing strategy

- **Unit (pure, the bulk):** `partition.js` against §10's solver cases + adversarial multisets (duplicates, two jokers, mixed run/group clusters, the `13→1` wrap, "all-valid exists vs not"). `cluster.js` (≤1-gap membership, ≥2-gap exclusion). `layout.js` (canonical order, ≥1-gap separators, leftover grouping/gapping, drop-side selection, and the §6.4 slide/relocate/cascade/center/reject paths).
- **Move-level:** a board-mounting / reducer test that the arrange move applies `placements` atomically, rejects (`INVALID_MOVE`, no-op) when `ok:false`, and that the joker-retrieve path still fires for an exact-on-joker drop.
- **Determinism:** the same drop on the same board yields identical `placements` (client == server).
- **Regression / superseded tests:** submit-time `isBoardValid` and **joker-retrieve** tests stay green (that path is preserved). The **geometric-push** tests (`insert-tiles-with-push`, `board-insert-push-dispatch`) assert the *old* behaviour that this engine replaces — they are **rewritten** to assert the new semantic outcomes. `multi-drag-order` and `tap-to-place` are updated to the new arrange results where the geometric layout differs. This is an intended behaviour change, not a regression.

## §12 Risks & phasing notes (for the plan)

- The **partition solver** (§6.2) and the **cross-row space manager** (§6.4 step 3) are the two hard, high-risk units. The plan should build the engine **core first** (cluster → solver → in-row layout → in-row slide → reject), which already delivers the owner's pain relief on a 32-wide row (horizontal room is almost always enough), then add **cross-row relocation + cascade** as an additive, separately-tested step. If cross-row proves disproportionately complex, in-row slide + reject is an acceptable interim (the owner asked for cross-row, so it stays in scope — only its sequencing is deferrable).
- Determinism is load-bearing for server authority — every tie-break must be fixed, never order-of-iteration dependent.

## §13 Out of scope (this spec)

- **No-scroll responsive fit (Step 2, separate spec):** shrink/auto-size tiles so the whole board is visible without scrolling. Today `.ref` is `overflow:auto` (board.css:78); Step 2 removes the scroll and sizes cells to fit. This spec assumes the current scrollable board.
- **Proactive whole-board centering / compaction:** explicitly **not** wanted — the player keeps free positioning; centering is only a relocation tie-break (§6.4).
- **Cross-row manipulation as a single gesture** beyond moving a bystander set for space — normal play (drag a tile to another row) is unchanged.
