import React, {useState} from 'react';
import AbilityCard from './AbilityCard';
import {PLAYABLE_TYPES, CARD_META, DECLARE_TYPES} from '../abilities/cardMeta';
import './abilities.css';

// The viewer's own ability-card hand. Discoverable, collapsible side drawer that
// mirrors the chat/codex FAB language (.ability-root / .ability-tab / .ability-panel,
// collapsed by default, .open swaps the tab for the panel). The fixed right-edge tab
// carries an "Abilities" label + a count badge so it's obvious you hold cards. Opening
// lists every card vertically (reuse AbilityCard). Playable types come from
// PLAYABLE_TYPES; the rest render greyed-out and inert.
//
// SP5 bluff: a "Play face-down" toggle + Declare picker (inside the panel) let the
// viewer claim a card type. With it on, ANY card is playable and clicking dispatches a
// face-down play with the chosen claim. onPlay routing lives in useAbilityPlay.
// Privacy: renders ONLY the viewer's own cards passed in `cards`. Empty hand hides.
export default function AbilityHand({cards = [], onPlay, faceDown = false, declared = 'peek', onToggleFaceDown, onDeclare}) {
    const [open, setOpen] = useState(false);
    const showBluff = typeof onToggleFaceDown === 'function';
    if (cards.length === 0) return null;
    return (
        <div className={`ability-root ${open ? 'open' : ''}`}>
            <button type="button"
                    className="ability-tab"
                    onClick={() => setOpen((o) => !o)}
                    aria-label="Open abilities" aria-expanded={open} title="Abilities">
                <span aria-hidden="true">🎴</span>
                <span className="ability-tab-label">Abilities</span>
                <span className="ability-tab-count" aria-hidden="true">{cards.length}</span>
            </button>

            <div className="ability-panel">
                <div className="ability-head">
                    <b><span aria-hidden="true">🎴</span> Abilities</b>
                    <button type="button" className="ability-close"
                            onClick={() => setOpen(false)}
                            aria-label="Close abilities" title="Close abilities">✕</button>
                </div>

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

                <div className="ability-list">
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
        </div>
    );
}
