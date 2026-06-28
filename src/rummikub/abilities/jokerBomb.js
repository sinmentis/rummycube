// Joker-bomb settlement helper (chaos mode). Pure logic: no boardgame.io, no
// DOM. Joins the server's native-ESM graph, so keep it dependency-light.
//
// Model: in chaos mode a joker sitting in a board run is a live bomb. Each board
// joker tracks G.jokerHeat[jokerIdString] = {heat, members}, where members is the
// sorted non-joker tile ids in its run (the baseline from the last settlement).
// At turn-end we compare the current run membership against that baseline:
//   - new joker (no entry)        -> arm at heat 0, never roll (planting is free)
//   - membership unchanged        -> no roll, baseline untouched
//   - membership changed          -> heat += 1 and roll fuseProb(heat); boom
//                                    scatters the whole run back to the pool
//   - joker gone from board        -> drop the entry (heat resets)
// "Membership, not position" makes detection auto-arrange-immune: the arrange
// engine repositions tiles but preserves which ids share a run, so comparing
// sorted non-joker id arrays never mistakes a reshuffle for a modification.
import {extractSeqs} from '../moveValidation.js';
import {isJoker} from '../util.js';
import {pushTilesToGrid} from '../orderTiles.js';
import {HAND_ROWS, HAND_COLS, HAND_GRID_ID} from '../constants.js';

function fuseProb(heat) {
    return Math.min(0.80, 0.20 + 0.15 * (heat - 1));
}

function sameMembers(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

// Map each board joker to the run it lives in. seqIds is the full run (all tile
// id strings, joker included) for scattering; members is the run's non-joker ids
// as a sorted number[] for baseline comparison. Two jokers in one run yield two
// entries that share the same seqIds; members always excludes every joker.
function jokerGroups(tilePositions) {
    const groups = {};
    const seqs = extractSeqs({tilePositions});
    for (const run of seqs) {
        const jokerIds = run.filter(id => isJoker(Number(id)));
        if (jokerIds.length === 0) {
            continue;
        }
        const members = run
            .filter(id => !isJoker(Number(id)))
            .map(Number)
            .sort((a, b) => a - b);
        for (const jid of jokerIds) {
            groups[jid] = {seqIds: run, members};
        }
    }
    return groups;
}

// Pop up to `count` normal tiles off the pool and hand them to the current
// player. Mirrors drawTile: collect popped ids (stop when the pool empties) then
// place them into the hand grid in one pushTilesToGrid call.
function drawNormalTiles(G, ctx, count) {
    const tiles = [];
    for (let i = 0; i < count; i++) {
        const tile = G.tilesPool.pop();
        if (!tile) {
            break;
        }
        tiles.push(tile);
    }
    pushTilesToGrid(tiles, HAND_ROWS, HAND_COLS, G,
        {gridId: HAND_GRID_ID, playerID: ctx.currentPlayer}, ctx);
}

function settleJokerBombs({G, ctx, random, events}) {
    if (G.mode !== 'chaos') {
        return;
    }

    const groups = jokerGroups(G.tilePositions);

    // Drop entries whose joker has left the board (retrieved to hand): heat resets.
    for (const jid of Object.keys(G.jokerHeat)) {
        if (!groups[jid]) {
            delete G.jokerHeat[jid];
        }
    }

    let boomCount = 0;
    const scattered = [];
    // Two jokers can share one run; once it scatters its tiles are gone, so a
    // second joker keyed to the same run must not boom again (double draw 6).
    const boomedRuns = new Set();
    for (const jid of Object.keys(groups)) {
        const group = groups[jid];
        const entry = G.jokerHeat[jid];
        if (!entry) {
            // Freshly planted this turn: arm without rolling.
            G.jokerHeat[jid] = {heat: 0, members: group.members};
            continue;
        }
        const runKey = group.seqIds.join(',');
        if (boomedRuns.has(runKey)) {
            // This joker's run already boomed this settle: drop the stale entry.
            delete G.jokerHeat[jid];
            continue;
        }
        if (sameMembers(entry.members, group.members)) {
            // Untouched run: no roll, baseline stays put.
            continue;
        }
        // Modified this turn: the fuse rolls.
        entry.heat += 1;
        if (random.Number() < fuseProb(entry.heat)) {
            for (const id of group.seqIds) {
                delete G.tilePositions[id];
                scattered.push(Number(id));
            }
            delete G.jokerHeat[jid];
            boomedRuns.add(runKey);
            boomCount += 1;
        } else {
            entry.members = group.members;
        }
    }

    if (boomCount > 0) {
        // Draw the penalty from the pool as it stood, then return the exploded
        // tiles to it. This way a player never instantly redraws their own
        // boomed run (including the joker) as a penalty tile.
        drawNormalTiles(G, ctx, 3 * boomCount);
        for (const id of scattered) {
            G.tilesPool.push(id);
        }
    }
}

export {
    fuseProb,
    jokerGroups,
    settleJokerBombs,
};
