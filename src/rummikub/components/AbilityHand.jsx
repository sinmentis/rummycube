import React from 'react';
import AbilityCard from './AbilityCard';
import {PLAYABLE_TYPES, CARD_META, DECLARE_TYPES} from '../abilities/cardMeta';
import './abilities.css';

// The viewer's own ability cards, sitting on a ledge side-by-side with the tile
// rack (inside .hand-buttons, left of the grid). No drawer, no tab: cards are
// always fully visible — overlap-stacked so the rarity edge always shows, and
// hover/focus fans them out so labels read cleanly. Click a card to play it.
// Playable types come from PLAYABLE_TYPES; the rest render greyed-out and inert.
// The fixed right drawer survives only as a mobile fallback (abilities.css ≤820px).
//
// SP5 bluff: a "Play face-down" toggle + Declare picker sit above the strip and let
// the viewer claim a card type. With it on, ANY card is playable and clicking
// dispatches a face-down play with the chosen claim. onPlay routing lives in
// useAbilityPlay. Privacy: renders ONLY the viewer's own cards. Empty hand hides.
export default function AbilityHand({cards = [], onPlay, faceDown = false, declared = 'peek', onToggleFaceDown, onDeclare, canPlay = true}) {
    const showBluff = typeof onToggleFaceDown === 'function';
    if (cards.length === 0) return null;
    return (
        <div className="ability-handside">
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

            <div className="ability-strip" role="list" aria-label="Ability cards">
                {cards.map((card) => (
                    <AbilityCard
                        key={card.id}
                        card={card}
                        onClick={onPlay}
                        disabled={!canPlay || (!faceDown && !PLAYABLE_TYPES.has(card.type))}
                    />
                ))}
            </div>
        </div>
    );
}
