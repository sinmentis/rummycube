// src/rummikub/abilities/moves.js
import {INVALID_MOVE, Stage} from 'boardgame.io/dist/cjs/core.js';
import {pushTilesToGrid} from '../orderTiles.js';
import {spinWheel} from './wheel.js';
import {extractSeqs} from '../moveValidation.js';
import {isJoker} from '../util.js';
import {HAND_ROWS, HAND_COLS, HAND_GRID_ID, BOARD_GRID_ID} from '../constants.js';

const PLAYABLE_TYPES = new Set(['peek', 'shield', 'junk2', 'junk3', 'junk4', 'wheel', 'skip', 'lock', 'force', 'bigwind']);
const JUNK_AMOUNT = {junk2: 2, junk3: 3, junk4: 4};
const LOCK_TURNS = 2;
export const FORCE_DRAW = 3;
// SP5: single-target declares route the challenge to the named target; everything
// else (shield=self, wheel/bigwind=table, lock=board) is non-player, so every
// opponent gets challenge rights.
const SINGLE_TARGET = new Set(['peek', 'junk2', 'junk3', 'junk4', 'skip', 'force']);
// T4: cards whose beam runs caster->target avatar. shield/wheel/bigwind hit no one
// (self/all) and lock targets a board row, so they carry to:null (affects-all glow).
const PLAYER_TARGET = new Set(['peek', 'skip', 'force', 'junk2', 'junk3', 'junk4']);
const BLUFF_PENALTY = 2;

// T4: broadcast a transient G.lastCast so EVERY client can flash the caster->target
// beam (mirrors lastWheel/lastTimeout). A bumped id makes each play a fresh event
// even when content repeats; playerView passes it through unstripped (no tile ids).
function recordCast(G, actor, type, target, blocked) {
    G.castSeq = (G.castSeq || 0) + 1;
    const to = PLAYER_TARGET.has(type) && target != null ? target.toString() : null;
    G.lastCast = {from: actor.toString(), to, type, blocked: !!blocked, id: G.castSeq};
}

// Pour `n` normal (non-joker) tiles from the pool into a seat's hand. Penalty draws
// (junk auto-resolve, bluff penalties) are normal-only: jokers are kept in the pool.
export function drawNormal(G, ctx, seat, n) {
    const tiles = [];
    const skipped = [];
    while (tiles.length < n && G.tilesPool.length) {
        const tile = G.tilesPool.pop();
        if (tile == null) break;
        if (isJoker(Number(tile))) { skipped.push(tile); continue; }
        tiles.push(tile);
    }
    for (const joker of skipped) G.tilesPool.unshift(joker);
    pushTilesToGrid(tiles, HAND_ROWS, HAND_COLS, G, {gridId: HAND_GRID_ID, playerID: seat}, ctx);
}

// Fix2 LOCK: lock a FORMED GROUP, not a whole row. Resolve the target row to the
// tile-id set of the run(s) sitting on it (extractSeqs already splits per-row
// contiguous groups); store that signature so only those exact tiles are frozen.
// Empty row -> no lock. Fallback to every board tile on the row if seqs miss any.
function lockedGroupTiles(G, row) {
    const r = Number(row);
    let best = [];
    for (const seq of extractSeqs(G)) {
        const onRow = seq.filter(id => {
            const p = G.tilePositions[id];
            return p && p.gridId === BOARD_GRID_ID && p.row === r;
        });
        if (onRow.length > best.length) best = onRow;
    }
    return best.map(Number);
}

function handIds(G, seat) {
    return Object.keys(G.tilePositions).filter(id => {
        const pos = G.tilePositions[id];
        return pos.gridId === HAND_GRID_ID && pos.playerID === seat;
    });
}

// BIGWIND: every seat simultaneously passes one random normal (non-joker) hand
// tile to the seat on its left (seat i -> i+1). Server-seeded random; jokers are
// never passed (a joker-only hand sends nothing). One synchronous rotation: pick
// all donors first, then re-home them so a tile never double-hops in one spin.
function bigWind(G, ctx, random) {
    const n = (ctx && ctx.numPlayers) || Object.keys(G.abilityHands || {}).length;
    if (n < 2) return;
    const moving = [];
    for (let i = 0; i < n; i++) {
        const seat = i.toString();
        const ids = handIds(G, seat).filter(id => !isJoker(Number(id)));
        if (!ids.length) continue;
        const id = ids[Math.floor((random ? random.Number() : 0) * ids.length)];
        delete G.tilePositions[id];
        moving.push({id: Number(id), to: ((i + 1) % n).toString()});
    }
    for (const {id, to} of moving) {
        pushTilesToGrid([id], HAND_ROWS, HAND_COLS, G, {gridId: HAND_GRID_ID, playerID: to}, ctx);
    }
    if (moving.length) {
        G.chaosSeq = (G.chaosSeq || 0) + 1;
        G.lastBigwind = {count: moving.length, id: G.chaosSeq};
    }
}

// Pour `amount` tiles from the pool into target's hand. Shared by acceptJunk (the
// chosen "accept now") and the onTurnEnd timeout default (auto-accept). Clears
// pendingJunk so it resolves exactly once. Pure G mutation -> safe on a draft.
export function resolveJunk(G, ctx, target, amount) {
    drawNormal(G, ctx, target, amount); // penalty draw: normal-only, jokers stay in pool
    G.pendingJunk = null;
}

// Target's response to a junk interrupt: accept the incoming draw now. Gated to the
// player it was aimed at; clears the interrupt + drops them back to the shared NULL
// stage so A's turn proceeds. Timeout falls through to onTurnEnd's auto-accept.
export function acceptJunk({G, ctx, playerID, events}) {
    if (G.mode !== 'chaos') return INVALID_MOVE;
    if (!G.pendingJunk || G.pendingJunk.target !== playerID) return INVALID_MOVE;
    if (G.shields && G.shields[playerID]) {
        G.shields[playerID] = false; // shield absorbs the whole stacked chain; nobody draws
        G.pendingJunk = null;
    } else {
        resolveJunk(G, ctx, playerID, G.pendingJunk.amount);
    }
    if (events) events.setActivePlayers({all: Stage.NULL});
}

// SP2a-T3: instead of accepting, a target holding their own junk card may stack it
// onto the pending chain and pass it on. Adds JUNK_AMOUNT, retargets, and re-enters
// respondJunk for the next holder. Uncapped: the chain grows until someone accepts
// (draws the whole stack) or shield-absorbs it. Gated to the current target.
export function transferJunk({G, ctx, playerID, events}, cardId, nextTarget) {
    if (G.mode !== 'chaos') return INVALID_MOVE;
    if (!G.pendingJunk || G.pendingJunk.target !== playerID) return INVALID_MOVE;
    if (nextTarget == null || nextTarget.toString() === playerID) return INVALID_MOVE;
    if (ctx && ctx.numPlayers != null && Number(nextTarget) >= ctx.numPlayers) return INVALID_MOVE;
    const hand = G.abilityHands && G.abilityHands[playerID];
    if (!hand) return INVALID_MOVE;
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx < 0 || !JUNK_AMOUNT[hand[idx].type]) return INVALID_MOVE;
    const card = hand[idx];
    const tgt = nextTarget.toString();
    G.pendingJunk = {amount: G.pendingJunk.amount + JUNK_AMOUNT[card.type], target: tgt, from: playerID};
    hand.splice(idx, 1);
    if (!G.abilityDiscard) G.abilityDiscard = [];
    G.abilityDiscard.push(card);
    if (events) events.setActivePlayers({currentPlayer: Stage.NULL, value: {[tgt]: 'respondJunk'}});
}

// Apply one ability's declared/face-up effect via the existing handlers. Shared by
// face-up playAbilityCard and bluff resolution (declared effect on pass / lost
// challenge). Junk re-enters its own interrupt; unsupported declares are inert.
function applyEffect(G, ctx, actor, type, target, events, random) {
    let blocked = false;
    if (type === 'peek') {
        if (target == null) return;
        if (!G.peekGrants) G.peekGrants = {};
        G.peekGrants[actor] = target.toString();
    } else if (type === 'shield') {
        if (!G.shields) G.shields = {};
        G.shields[actor] = true;
    } else if (type === 'wheel') {
        spinWheel({G, ctx, random});
    } else if (type === 'skip') {
        if (target == null) return;
        if (!G.skipNext) G.skipNext = {};
        G.skipNext[target.toString()] = true;
    } else if (type === 'force') {
        if (target == null) return;
        if (!G.forced) G.forced = {};
        G.forced[target.toString()] = true;
    } else if (type === 'lock') {
        if (target == null) return;
        if (!Array.isArray(G.lockedSets)) G.lockedSets = [];
        const tiles = lockedGroupTiles(G, target);
        G.lockedSets.push({row: Number(target), tiles, until: (ctx && ctx.turn != null ? ctx.turn : 0) + LOCK_TURNS});
    } else if (type === 'bigwind') {
        bigWind(G, ctx, random);
    } else if (JUNK_AMOUNT[type]) {
        if (target == null || G.pendingJunk) return;
        const tgt = target.toString();
        if (G.shields && G.shields[tgt]) {
            G.shields[tgt] = false;
            blocked = true; // shield absorbs the junk -> beam reads as broken + burst
        } else {
            G.pendingJunk = {amount: JUNK_AMOUNT[type], target: tgt, from: actor};
            if (events) events.setActivePlayers({currentPlayer: Stage.NULL, value: {[tgt]: 'respondJunk'}});
        }
    }
    // T4: every resolved effect emits a public beam event so the whole table sees it.
    recordCast(G, actor, type, target, blocked);
}

// Play one ability card. Face-up: resolves peek/shield/junk/wheel now. Face-down
// (SP5): defer into G.pendingBluff and hand a respondBluff stage to whoever may
// challenge — the target alone for single-target declares, else every opponent.
// Effect applies immediately at move time (never an undoable interim).
export function playAbilityCard({G, ctx, playerID, events, random}, cardId, target, opts = {}) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
    const hand = G.abilityHands && G.abilityHands[playerID];
    if (!hand) return INVALID_MOVE;
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx < 0) return INVALID_MOVE;
    const card = hand[idx];

    if (opts.faceDown) {
        if (G.mode !== 'chaos' || G.pendingBluff) return INVALID_MOVE;
        const declared = opts.declaredType;
        if (!declared) return INVALID_MOVE;
        const tgt = target == null ? null : target.toString();
        if (SINGLE_TARGET.has(declared) && tgt == null) return INVALID_MOVE;
        hand.splice(idx, 1);
        G.pendingBluff = {actor: playerID, real: card.type, declared, target: tgt, cardId, card};
        const value = {};
        if (SINGLE_TARGET.has(declared)) {
            value[tgt] = 'respondBluff';
        } else {
            for (const pid of Object.keys(G.abilityHands)) if (pid !== playerID) value[pid] = 'respondBluff';
        }
        if (events) events.setActivePlayers({currentPlayer: Stage.NULL, value});
        return;
    }

    if (!PLAYABLE_TYPES.has(card.type)) return INVALID_MOVE;
    if (card.type === 'peek' && target == null) return INVALID_MOVE;
    // SP6: skip/force aim at a player, lock at a board row — all need a target.
    if ((card.type === 'skip' || card.type === 'force' || card.type === 'lock') && target == null) return INVALID_MOVE;
    if (JUNK_AMOUNT[card.type]) {
        if (target == null) return INVALID_MOVE;
        if (G.pendingJunk) return INVALID_MOVE; // one junk chain at a time
    }
    applyEffect(G, ctx, playerID, card.type, target, events, random);
    hand.splice(idx, 1);
    if (!G.abilityDiscard) G.abilityDiscard = [];
    G.abilityDiscard.push(card);
}

// Settle a pending bluff to its discard pile. 'void'/'reveal' (caught bluffs) show
// the real card; 'pass' (unchallenged) keeps it hidden — discards a declared-typed
// shell so opponents never read the real type. Always clears pendingBluff.
function discardBluff(G, mode) {
    if (!G.abilityDiscard) G.abilityDiscard = [];
    const b = G.pendingBluff;
    const entry = mode === 'reveal' ? b.card
        : mode === 'void' ? {id: b.cardId, type: b.real}
            : {id: b.cardId, type: b.declared};
    G.abilityDiscard.push(entry);
    G.pendingBluff = null;
}

// Fix2: a public bluff result transient (mirrors lastWheel) so EVERY client sees a
// caught/honest outcome for ~1.2s. reveal carries the real type only when the card
// is shown (a challenge always reveals); pass keeps no result/no reveal.
function recordBluffResult(G, b, challenger, success) {
    G.chaosSeq = (G.chaosSeq || 0) + 1;
    G.lastBluffResult = {
        actor: b.actor.toString(),
        challenger: challenger == null ? null : challenger.toString(),
        declared: b.declared,
        success: !!success,
        reveal: b.real,
        id: G.chaosSeq,
    };
}

function canRespondBluff(G, playerID) {
    const b = G.pendingBluff;
    if (!b) return false;
    if (SINGLE_TARGET.has(b.declared)) return b.target === playerID;
    return playerID !== b.actor;
}

// Pass-resolve: declared effect applies face-up, card discarded with NO reveal.
// Shared by passBluff and the onTurnEnd timeout default so a bluff never stalls.
export function resolveBluffPass(G, ctx, events, random) {
    const b = G.pendingBluff;
    applyEffect(G, ctx, b.actor, b.declared, b.target, events, random);
    discardBluff(G, 'pass');
}

// Challenge: SUCCESS (lied) -> challenger sheds 1 random tile to pool, actor draws 2,
// card voided. FAIL (truthful) -> challenger draws 2, then the declared effect lands.
export function challengeBluff({G, ctx, playerID, events, random}) {
    if (G.mode !== 'chaos') return INVALID_MOVE;
    if (!canRespondBluff(G, playerID)) return INVALID_MOVE;
    const b = G.pendingBluff;
    if (b.declared !== b.real) {
        const ids = handIds(G, playerID);
        if (ids.length) {
            const id = ids[Math.floor((random ? random.Number() : 0) * ids.length)];
            delete G.tilePositions[id];
            G.tilesPool.push(Number(id));
        }
        drawNormal(G, ctx, b.actor, BLUFF_PENALTY);
        recordBluffResult(G, b, playerID, true);   // caught: challenge succeeded
        discardBluff(G, 'void');
    } else {
        drawNormal(G, ctx, playerID, BLUFF_PENALTY);
        applyEffect(G, ctx, b.actor, b.declared, b.target, events, random);
        recordBluffResult(G, b, playerID, false);  // honest: challenge failed
        discardBluff(G, 'reveal'); // truthful + caught: the real card is shown
    }
    endBluff(events);
}

export function passBluff({G, ctx, playerID, events, random}) {
    if (G.mode !== 'chaos') return INVALID_MOVE;
    if (!canRespondBluff(G, playerID)) return INVALID_MOVE;
    resolveBluffPass(G, ctx, events, random);
    endBluff(events);
}

function endBluff(events) {
    if (events) events.setActivePlayers({all: Stage.NULL});
}
