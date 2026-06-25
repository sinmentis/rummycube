import {BOARD_GRID_ID, HAND_GRID_ID} from "./constants.js";
import {extractSeqs} from "./moveValidation.js";
import {freezeSeqJokers, isSequenceValid, isJoker, getTileValue} from "./util.js";
import {insertWithPush} from "./insertPush.js";   // explicit .js so node src/server.js boots

export function makeSlotId(gridId, col, row) {
    return `${gridId}:${col}:${row}`;
}

export function parseSlotId(id) {
    const [gridId, col, row] = id.split(':');
    return {gridId, col: parseInt(col, 10), row: parseInt(row, 10)};
}

export function toggleSelection(selectedTiles, tileId) {
    return selectedTiles.includes(tileId)
        ? selectedTiles.filter(id => id !== tileId)
        : [...selectedTiles, tileId];
}

// Order tile ids by where they sit in their source grid (row then col), i.e. the
// reading order you see in the rack. Used for both placement and the drag preview
// so a multi-selection lands and previews in the same order it looks, regardless
// of the order the tiles were tapped. Non-mutating; tiles with no known position
// keep their relative order.
export function orderTilesBySource(tileIds, tilePositions) {
    return [...tileIds].sort((a, b) => {
        const pa = tilePositions[a];
        const pb = tilePositions[b];
        if (!pa || !pb) return 0;
        return (pa.row - pb.row) || (pa.col - pb.col);
    });
}

// Build an isOccupied(col,row) predicate for a single grid from tilePositions.
// Pure: a cell counts as occupied iff some tile of `gridId` whose id is NOT in
// excludeIds sits at that col/row. excludeIds removes the dragged selection so a
// tile can land on (or run through) the cells it currently occupies.
//
// Hand grids are per-player but share `gridId === HAND_GRID_ID` and col/row ranges,
// and there is no playerView (every client holds the full G.tilePositions, opponents'
// hands included). So for the hand grid we must scope occupancy to `playerID` — only
// the current player's own hand tiles count. The board grid is shared/unpartitioned,
// so playerID is ignored there.
export function buildRowOccupancy(tilePositions, gridId, excludeIds, playerID) {
    const exclude = new Set(excludeIds);
    const scopeToPlayer = gridId === HAND_GRID_ID;
    const taken = new Set();
    for (const tileId in tilePositions) {
        if (exclude.has(tileId)) continue;
        const pos = tilePositions[tileId];
        if (pos.gridId !== gridId) continue;
        if (scopeToPlayer && String(pos.playerID) !== String(playerID)) continue;
        taken.add(`${pos.col}:${pos.row}`);
    }
    return (col, row) => taken.has(`${col}:${row}`);
}

// Snap a drop to legal slot(s) in the target row. Pure: no mutation, deterministic.
// SINGLE (selectionLength <= 1): use the target cell if free, else the nearest free
// col in the same row (tie -> lower col). MULTI (>= 2): need that many contiguous
// free cells; prefer the run starting at target.col, else the contiguous run of
// exactly that length whose start is nearest target.col (tie -> lower start); never
// place partially. Returns cols strictly within [0, maxCols), or {ok:false}.
export function resolveDropSlot(target, isOccupied, selectionLength, maxCols) {
    const {gridId, col, row} = target;
    const len = Math.max(1, selectionLength);

    if (len <= 1) {
        if (col >= 0 && col < maxCols && !isOccupied(col, row)) {
            return {ok: true, gridId, row, cols: [col]};
        }
        for (let d = 1; d < maxCols; d++) {
            const lo = col - d;
            const hi = col + d;
            if (lo >= 0 && lo < maxCols && !isOccupied(lo, row)) {
                return {ok: true, gridId, row, cols: [lo]};
            }
            if (hi >= 0 && hi < maxCols && !isOccupied(hi, row)) {
                return {ok: true, gridId, row, cols: [hi]};
            }
        }
        return {ok: false};
    }

    const runFree = (start) => {
        if (start < 0 || start + len > maxCols) return false;
        for (let c = start; c < start + len; c++) {
            if (isOccupied(c, row)) return false;
        }
        return true;
    };

    if (runFree(col)) {
        return {ok: true, gridId, row, cols: Array.from({length: len}, (_, i) => col + i)};
    }

    let best = -1;
    for (let start = 0; start + len <= maxCols; start++) {
        if (!runFree(start)) continue;
        if (best === -1 || Math.abs(start - col) < Math.abs(best - col)) {
            best = start;
        }
    }
    if (best === -1) return {ok: false};
    return {ok: true, gridId, row, cols: Array.from({length: len}, (_, i) => best + i)};
}

// True iff the N-wide run starting at column T on `row` is in bounds and entirely
// free. `isOccupied` is the verified two-arg (col,row)=>bool predicate from
// buildRowOccupancy, so `row` MUST be forwarded; calling isOccupied(c) alone would
// query "c:undefined" and read every occupied cell as free. `maxCols` is the
// EXCLUSIVE column count (BOARD_COLS=32). Used by the drop dispatch to decide
// snap (free) vs. push (occupancy).
export function isRunFree(isOccupied, T, N, row, maxCols) {
    if (T < 0 || T + N > maxCols) return false;
    for (let c = T; c < T + N; c++) if (isOccupied(c, row)) return false;
    return true;
}

// Collect the board ('b') tiles sitting on `row`, minus any id in excludeIds (the
// dragged selection). Pure: returns [{tileId, col}]. Feeds the insert/push ripple
// so the colliding row tiles can be shifted around the dropped run.
export function boardRowTiles(tilePositions, row, excludeIds) {
    const ex = new Set((excludeIds || []).map(String));
    const out = [];
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (!p || p.gridId !== BOARD_GRID_ID || p.row !== row || ex.has(String(id))) continue;
        out.push({tileId: id, col: p.col});
    }
    return out;
}

// Pure detector for the classic 1-tile joker retrieve via drag. Returns
// {ok:true, jokerId, representedValue} iff the drop `cell` holds a SETTLED
// (non-tmp) board joker sitting in a currently-valid run/group AND the dragged
// HAND tile is a non-joker whose value equals that joker's represented value;
// otherwise {ok:false}. Mirrors the server retrieveJoker eligibility, minus the
// post-swap isBoardValid (that stays server-authoritative — colour mismatch is
// deferred there). Computes the represented value with the SAME pure path the
// server uses: extractSeqs -> freezeSeqJokers -> getTileValue. Never mutates.
// cell = {gridId, col, row} (a parseSlotId product).
export function jokerSwapTarget(tilePositions, cell, draggedTileId) {
    if (!cell || cell.gridId !== BOARD_GRID_ID) return {ok: false};

    // 1) the settled board joker sitting on the drop cell
    let jokerId = null;
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (!p || p.gridId !== BOARD_GRID_ID || p.row !== cell.row || p.col !== cell.col) continue;
        if (p.tmp) return {ok: false};                 // this-turn placement, not a retrievable settled tile
        if (!isJoker(Number(id))) return {ok: false};  // the cell's occupant is not a joker
        jokerId = Number(id);
        break;
    }
    if (jokerId === null) return {ok: false};          // empty cell -> hand back to the existing dispatch

    // 2) the dragged tile must be one of this client's hand tiles, and not a joker
    // (playerView strips opponents' hands, so gridId 'h' here means our own)
    const draggedId = Number(draggedTileId);
    const dp = tilePositions[draggedId];
    if (!dp || dp.gridId !== HAND_GRID_ID) return {ok: false};
    if (isJoker(draggedId)) return {ok: false};

    // 3) the joker must live in a valid sequence -> freeze it to read its value
    const seq = extractSeqs({tilePositions}).find(s => s.some(t => Number(t) === jokerId));
    if (!seq || !isSequenceValid(seq)) return {ok: false};
    const frozen = freezeSeqJokers(seq);
    if (!frozen) return {ok: false};
    const idx = seq.findIndex(t => Number(t) === jokerId);
    const representedValue = getTileValue(frozen[idx]);

    // 4) value must match (colour is left to the server's post-swap isBoardValid)
    if (getTileValue(draggedId) !== representedValue) return {ok: false};

    return {ok: true, jokerId, representedValue};
}

// Single decision point for "what should this board/hand drop (or empty-cell tap)
// do?", folding the round-2 snap-vs-insert/push split and the classic 1-tile
// joker-swap into ONE precedence: joker-swap -> push -> snap -> reject. Pure:
// reads tilePositions, never mutates — the client only DECIDES the path while the
// server move stays authoritative.
//
//   target          = {gridId, col, row} (a parseSlotId product)
//   primaryId       = the dragged/active tile id
//   selection       = the live selection (rack reading order is restored below)
//   boardCols/handCols = each grid's EXCLUSIVE column count (32 / 22)
//   allowJokerSwap  = drag-only gate so tap placement never triggers a retrieve
//
// Returns {kind, args} where args is the EXACT argument array for the matching move:
//   joker  -> retrieveJoker(jokerId, primaryId)
//   push   -> insertTilesWithPush(T, row, 'b', {id:primaryId}, ordered)
//   snap   -> moveTiles(col, row, gridId, {id:primaryId}, selection)
//   reject -> []  (no move; the caller buzzes)
//
// Off-by-one (round-2): isRunFree/inBounds use the EXCLUSIVE column count
// (maxCols = boardCols), while insertWithPush takes the INCLUSIVE last column
// (boardCols - 1). isOccupied from buildRowOccupancy is the two-arg (col,row)=>bool.
export function resolveDropDispatch({tilePositions, target, primaryId, selection, playerID, boardCols, handCols, allowJokerSwap}) {
    const {gridId, col, row} = target;
    const isBoard = gridId === BOARD_GRID_ID;
    // Normalize to a non-empty selection so occupancy/bounds/ordering always have
    // the tiles being placed, even for a bare single-tile drag.
    const sel = (selection && selection.length) ? selection : [primaryId];
    const N = sel.length;

    // (1) joker-swap: a single tile dropped on a settled board joker that sits in a
    // valid run and matches its represented value. Drag-only via allowJokerSwap.
    if (isBoard && N === 1 && allowJokerSwap) {
        const swap = jokerSwapTarget(tilePositions, target, primaryId);
        if (swap.ok) return {kind: 'joker', args: [swap.jokerId, primaryId]};
    }

    const maxCols = isBoard ? boardCols : handCols;
    const isOccupied = buildRowOccupancy(tilePositions, gridId, sel, playerID);

    // (2) push: a board target whose in-bounds N-wide run lands on an occupied span
    // ripples the colliding run aside. A hopeless ripple rejects non-destructively.
    // Out-of-bounds and the hand fall through to the snap below.
    const inBounds = col >= 0 && col + N <= maxCols;
    const runIsFree = inBounds && isRunFree(isOccupied, col, N, row, maxCols);
    const occupiedInRun = inBounds && !runIsFree;
    // WS-E: a free in-bounds span whose immediate left AND right neighbours are
    // both occupied is plugging the only gap between two runs -> route to push so
    // insertWithPush re-opens a 1-col separator instead of fusing them.
    const bridge = isBoard && runIsFree && isOccupied(col - 1, row) && isOccupied(col + N, row);
    if (isBoard && (occupiedInRun || bridge)) {
        const rowTiles = boardRowTiles(tilePositions, row, sel);
        const plan = insertWithPush(rowTiles, col, N, boardCols - 1);
        if (!plan) return {kind: 'reject', args: []};
        return {kind: 'push', args: [col, row, BOARD_GRID_ID, {id: primaryId}, orderTilesBySource(sel, tilePositions)]};
    }

    // (3) snap: a free board target, the hand, or an out-of-bounds run, snapped to
    // the nearest legal slot; no legal landing rejects non-destructively.
    const result = resolveDropSlot(target, isOccupied, N, maxCols);
    if (!result.ok) return {kind: 'reject', args: []};
    return {kind: 'snap', args: [result.cols[0], row, gridId, {id: primaryId}, selection]};
}
