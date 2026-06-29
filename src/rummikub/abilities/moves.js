// src/rummikub/abilities/moves.js
import {INVALID_MOVE, Stage} from 'boardgame.io/dist/cjs/core.js';
import {pushTilesToGrid} from '../orderTiles.js';
import {HAND_ROWS, HAND_COLS, HAND_GRID_ID} from '../constants.js';

const PLAYABLE_TYPES = new Set(['peek', 'shield', 'junk2', 'junk3', 'junk4']);
const JUNK_AMOUNT = {junk2: 2, junk3: 3, junk4: 4};

// Pour `amount` tiles from the pool into target's hand. Shared by acceptJunk (the
// chosen "accept now") and the onTurnEnd timeout default (auto-accept). Clears
// pendingJunk so it resolves exactly once. Pure G mutation -> safe on a draft.
export function resolveJunk(G, ctx, target, amount) {
    const tiles = [];
    for (let i = 0; i < amount; i++) {
        const tile = G.tilesPool.pop();
        if (tile != null) tiles.push(tile);
    }
    pushTilesToGrid(tiles, HAND_ROWS, HAND_COLS, G, {gridId: HAND_GRID_ID, playerID: target}, ctx);
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

// Play one ability card face-up on your turn. Resolves peek + shield + junk +N;
// other types reject (their effects land in later sub-projects). Bluff/face-down
// is SP5. Effect applies immediately at move time (never an undoable interim).
export function playAbilityCard({G, ctx, playerID, events}, cardId, target) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
    const hand = G.abilityHands && G.abilityHands[playerID];
    if (!hand) return INVALID_MOVE;
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx < 0) return INVALID_MOVE;
    const card = hand[idx];
    if (!PLAYABLE_TYPES.has(card.type)) return INVALID_MOVE;

    if (card.type === 'peek') {
        if (target == null) return INVALID_MOVE;
        if (!G.peekGrants) G.peekGrants = {};
        G.peekGrants[playerID] = target.toString();
    } else if (card.type === 'shield') {
        if (!G.shields) G.shields = {};
        G.shields[playerID] = true;
    } else if (JUNK_AMOUNT[card.type]) {
        if (target == null) return INVALID_MOVE;
        if (G.pendingJunk) return INVALID_MOVE; // one junk chain at a time — don't overwrite a pending interrupt
        const tgt = target.toString();
        if (G.shields && G.shields[tgt]) {
            G.shields[tgt] = false; // shield absorbs the junk; nobody draws
        } else {
            // SP2a-T2: don't draw now. Hand the junk to the target as an interrupt;
            // they accept (draw) via acceptJunk, or onTurnEnd auto-accepts on timeout.
            G.pendingJunk = {amount: JUNK_AMOUNT[card.type], target: tgt, from: playerID};
            if (events) events.setActivePlayers({currentPlayer: Stage.NULL, value: {[tgt]: 'respondJunk'}});
        }
    }
    hand.splice(idx, 1);
    if (!G.abilityDiscard) G.abilityDiscard = [];
    G.abilityDiscard.push(card);
}
