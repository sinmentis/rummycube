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

    return (
        <div
            className={className}
            role={clickable ? 'button' : undefined}
            aria-disabled={disabled ? true : undefined}
            onClick={clickable ? () => onClick(card) : undefined}
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
