import React from 'react';
import {CARD_META, RARITY_LABEL} from '../abilities/cardMeta';
import './abilities.css';

// One chaos ability-card face. Rarity drives a single colour treatment
// (.acard--{rarity}) plus one minimal sub-cue: the rarity word from
// RARITY_LABEL. The face shows only icon, name, one-line effect and that word.
// Gold cards add an animated foil sheen. Presentational only: no game state.
export default function AbilityCard({card, lifted, onClick, disabled}) {
    const {type, rarity} = card;
    const meta = CARD_META[type] || {name: type, icon: '❓', effect: ''};
    const clickable = typeof onClick === 'function' && !disabled;

    const className = ['acard', `acard--${rarity}`, lifted && 'lifted', disabled && 'is-disabled']
        .filter(Boolean)
        .join(' ');

    // Standard accessible-button wiring. A live card is a focusable button that
    // also fires on Enter/Space (Space preventDefault'd so it doesn't scroll the
    // page). A disabled card stays a button for screen readers (role +
    // aria-disabled) but is inert: focusable out of the tab order, no handlers.
    // A card with no onClick is purely presentational and gets neither.
    let interactiveProps = {};
    if (clickable) {
        interactiveProps = {
            role: 'button',
            tabIndex: 0,
            onClick: () => onClick(card),
            onKeyDown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.key === ' ') e.preventDefault();
                    onClick(card);
                }
            },
        };
    } else if (disabled) {
        interactiveProps = {role: 'button', tabIndex: -1, 'aria-disabled': true};
    }

    return (
        <div
            className={className}
            {...interactiveProps}
        >
            {rarity === 'gold' && <div className="acard-foil" aria-hidden="true" />}
            <div className="acard-head">
                <div className="acard-name">
                    <b>{meta.name}</b>
                    <span className="acard-rar">{RARITY_LABEL[rarity]}</span>
                </div>
            </div>
            <div className="acard-icon" aria-hidden="true">{meta.icon}</div>
            <div className="acard-effect">{meta.effect}</div>
        </div>
    );
}
