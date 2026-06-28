import React from 'react';
import AbilityCard from './AbilityCard';
import {PLAYABLE_TYPES} from '../abilities/cardMeta';
import './abilities.css';

// The viewer's own ability-card hand. Desktop: an overlapping ledge-fan
// (.ability-fan) where only the front card shows its full face and the cards
// behind it tuck away to a clean rarity-colored top edge — no label bleed
// (owner feedback from the mockup rounds); hovering spreads the fan and reveals
// every face. Mobile: the same row reflows into a horizontally-swipeable drawer
// (.ability-drawer), so a big hand is just a longer scroll — no hand limit.
//
// SP1b ships only peek/shield as playable (PLAYABLE_TYPES); every other type
// renders greyed-out and inert. Clicking a playable card calls onPlay(card); the
// real shield/peek routing lands in Task 5's useAbilityPlay.
//
// Privacy: this renders ONLY the viewer's own cards passed in `cards` — it never
// reads any other player's hand.
export default function AbilityHand({cards = [], onPlay}) {
    return (
        <div className="ability-fan ability-drawer">
            {cards.map((card) => (
                <AbilityCard
                    key={card.id}
                    card={card}
                    onClick={onPlay}
                    disabled={!PLAYABLE_TYPES.has(card.type)}
                />
            ))}
        </div>
    );
}
