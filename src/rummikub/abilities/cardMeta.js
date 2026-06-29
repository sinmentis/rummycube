// src/rummikub/abilities/cardMeta.js
// Display metadata for chaos ability cards: the single source of truth for how
// each card type is presented on its face (name, icon, one-line effect). The
// rarity of a dealt card lives on the card object itself (see CARD_RARITY in
// ./cards.js); the labels/order/playable sets below map rarity to UI text.

// type -> {name, icon, effect}. Grouped by rarity (white / blue / gold) to match
// the deal-side grouping in cards.js.
export const CARD_META = Object.freeze({
    // white (Common)
    peek: {name: 'Peek', icon: '👁️', effect: 'See a rival\'s tile rack for the rest of the round.'},
    shield: {name: 'Shield', icon: '🛡️', effect: 'Held — auto-blocks the next ability aimed at you.'},
    junk2: {name: 'Junk +2', icon: '🧱', effect: 'Force a player to draw 2 (chainable).'},
    // blue (Uncommon)
    junk3: {name: 'Junk +3', icon: '🧱', effect: 'Force a player to draw 3 (chainable).'},
    force: {name: 'Force', icon: '📥', effect: 'Force a player to play or draw 3.'},
    wheel: {name: 'Wheel', icon: '🎡', effect: 'Trigger the public Wheel.'},
    bigwind: {name: 'Big Wind', icon: '🌬️', effect: 'Everyone passes tiles around.'},
    // gold (Rare)
    junk4: {name: 'Junk +4', icon: '🧱', effect: 'Force a player to draw 4 (chainable).'},
    skip: {name: 'Skip', icon: '⏭️', effect: 'Skip a player\'s turn.'},
    lock: {name: 'Lock', icon: '🔒', effect: 'Freeze a board set for a round.'},
});

// The single non-color rarity cue shown on the card: one short word. Colour
// (frame/foil) carries rarity; this word backs it up. No letter gems or pips.
export const RARITY_LABEL = Object.freeze({white: 'Common', blue: 'Uncommon', gold: 'Rare'});

// Low-to-high rarity order, for sorting and rendering rarity groups.
export const RARITY_ORDER = Object.freeze(['white', 'blue', 'gold']);

// SP6 ships the full deck as playable; the hand greys out nothing now.
export const PLAYABLE_TYPES = new Set(['peek', 'shield', 'junk2', 'junk3', 'junk4', 'wheel', 'skip', 'lock', 'force', 'bigwind']);

// SP5 bluff: claims you can make face-down. Mirrors moves.js SINGLE_TARGET so a
// declared single-target claim parks for a target pick before dispatch; wheel is
// table-wide. DECLARE_TYPES are the believable claims offered by the Declare picker.
export const SINGLE_TARGET_DECLARES = new Set(['peek', 'shield', 'junk2', 'junk3', 'junk4', 'skip', 'lock', 'force']);
export const DECLARE_TYPES = ['peek', 'shield', 'junk2', 'junk3', 'junk4', 'wheel'];
