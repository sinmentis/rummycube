// src/rummikub/abilities/moves.js
import {INVALID_MOVE} from 'boardgame.io/dist/cjs/core.js';

const SP1_TYPES = new Set(['peek', 'shield']);

// Play one ability card face-up on your turn. SP1a resolves peek + shield only;
// other types reject (their effects land in later sub-projects). Bluff/face-down
// is SP5. Effect applies immediately at move time (never an undoable interim).
export function playAbilityCard({G, ctx, playerID}, cardId, target) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
    const hand = G.abilityHands && G.abilityHands[playerID];
    if (!hand) return INVALID_MOVE;
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx < 0) return INVALID_MOVE;
    const card = hand[idx];
    if (!SP1_TYPES.has(card.type)) return INVALID_MOVE;

    if (card.type === 'peek') {
        if (target == null) return INVALID_MOVE;
        if (!G.peekGrants) G.peekGrants = {};
        G.peekGrants[playerID] = target.toString();
    } else if (card.type === 'shield') {
        if (!G.shields) G.shields = {};
        G.shields[playerID] = true;
    }
    hand.splice(idx, 1);
    if (!G.abilityDiscard) G.abilityDiscard = [];
    G.abilityDiscard.push(card);
}
