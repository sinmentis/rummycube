import React from 'react';
import AbilityCard from './AbilityCard';
import {PLAYABLE_TYPES, CARD_META, DECLARE_TYPES} from '../abilities/cardMeta';
import './abilities.css';

// The viewer's own ability-card hand. Desktop: an overlapping ledge-fan
// (.ability-fan); hovering spreads it. Mobile: a swipeable drawer. Face-up,
// playable types come from PLAYABLE_TYPES; the rest render greyed-out and inert.
//
// SP5 bluff: a "Play face-down" toggle + a Declare picker let the viewer claim a
// card type. With it on, ANY card is playable (you can bluff a gold card as peek);
// clicking dispatches a face-down play with the chosen claim. onPlay routing lives
// in useAbilityPlay. Privacy: renders ONLY the viewer's own cards passed in `cards`.
export default function AbilityHand({cards = [], onPlay, faceDown = false, declared = 'peek', onToggleFaceDown, onDeclare}) {
    const showBluff = typeof onToggleFaceDown === 'function';
    return (
        <div className="ability-zone">
            {showBluff && (
                <div className={'bluff-bar' + (faceDown ? ' on' : '')}>
                    <label className="bluff-toggle">
                        <input type="checkbox" checked={faceDown} onChange={(e) => onToggleFaceDown(e.target.checked)}/>
                        Play face-down
                    </label>
                    {faceDown && (
                        <label className="bluff-claim">
                            Claim
                            <select value={declared} onChange={(e) => onDeclare && onDeclare(e.target.value)}>
                                {DECLARE_TYPES.map((t) => (
                                    <option key={t} value={t}>{(CARD_META[t] || {name: t}).name}</option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
            )}
            <div className="ability-fan ability-drawer">
                {cards.map((card) => (
                    <AbilityCard
                        key={card.id}
                        card={card}
                        onClick={onPlay}
                        disabled={!faceDown && !PLAYABLE_TYPES.has(card.type)}
                    />
                ))}
            </div>
        </div>
    );
}
