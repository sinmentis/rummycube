// src/rummikub/abilities/cards.js
export const CARD_RARITY = Object.freeze({
    peek: 'white', shield: 'white', junk2: 'white',
    junk3: 'blue', force: 'blue', wheel: 'blue', bigwind: 'blue',
    junk4: 'gold', skip: 'gold', lock: 'gold',
});
export const DECK_COUNTS = Object.freeze({
    peek: 3, shield: 5, junk2: 5,
    junk3: 3, force: 2, wheel: 2, bigwind: 2,
    junk4: 2, skip: 2, lock: 2,
});
// A fresh 28-card ability deck (unshuffled; Game.setup shuffles via server random).
export function buildAbilityDeck() {
    const deck = [];
    for (const type of Object.keys(DECK_COUNTS)) {
        for (let i = 0; i < DECK_COUNTS[type]; i++) {
            deck.push({id: `${type}-${i}`, type, rarity: CARD_RARITY[type]});
        }
    }
    return deck;
}
