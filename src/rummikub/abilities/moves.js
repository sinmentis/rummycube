// src/rummikub/abilities/moves.js
import {INVALID_MOVE} from 'boardgame.io/dist/cjs/core.js';
import {pushTilesToGrid} from '../orderTiles.js';
import {HAND_ROWS, HAND_COLS, HAND_GRID_ID} from '../constants.js';

const PLAYABLE_TYPES = new Set(['peek', 'shield', 'junk2', 'junk3', 'junk4']);
const JUNK_AMOUNT = {junk2: 2, junk3: 3, junk4: 4};

// Play one ability card face-up on your turn. Resolves peek + shield + junk +N;
// other types reject (their effects land in later sub-projects). Bluff/face-down
// is SP5. Effect applies immediately at move time (never an undoable interim).
export function playAbilityCard({G, ctx, playerID}, cardId, target) {
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
        const tgt = target.toString();
        if (G.shields && G.shields[tgt]) {
            G.shields[tgt] = false; // shield absorbs the junk; nobody draws
        } else {
            const n = JUNK_AMOUNT[card.type];
            const tiles = [];
            for (let i = 0; i < n; i++) {
                const tile = G.tilesPool.pop();
                if (tile != null) tiles.push(tile);
            }
            pushTilesToGrid(tiles, HAND_ROWS, HAND_COLS, G, {gridId: HAND_GRID_ID, playerID: tgt}, ctx);
        }
    }
    hand.splice(idx, 1);
    if (!G.abilityDiscard) G.abilityDiscard = [];
    G.abilityDiscard.push(card);
}
