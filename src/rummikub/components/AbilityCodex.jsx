import React, {useState} from "react";
import {CARD_META, RARITY_ORDER, RARITY_LABEL} from "../abilities/cardMeta";
import {CARD_RARITY} from "../abilities/cards";
import "./abilities.css";

// Ability Codex: a floating help button (FAB) that mirrors the chat FAB pattern
// (.codex-root / .codex-fab / .codex-panel, collapsed by default, .open reveals
// the panel). It lists every ability card grouped by rarity plus a short "how
// Chaos works" primer — the place new players learn the deck without leaving
// the table. Purely static reference: it reads no game state.

// Rarity -> swatch / row modifier classes (mirrors the mockup's codex styles).
const RARITY_SWATCH = {white: "w", blue: "b", gold: "g"};
const RARITY_ROW = {white: "", blue: "r-b", gold: "r-g"};

// Every card type grouped low-to-high by rarity, for the rarity sections.
const GROUPS = RARITY_ORDER.map((rarity) => ({
    rarity,
    types: Object.keys(CARD_META).filter((type) => CARD_RARITY[type] === rarity),
}));

export default function AbilityCodex() {
    const [open, setOpen] = useState(false);

    return (
        <div className={`codex-root ${open ? "open" : ""}`}>
            <button type="button"
                    className="codex-fab"
                    onClick={() => setOpen(o => !o)}
                    aria-label="Open ability codex" aria-expanded={open} title="Ability Codex">
                <span aria-hidden="true">📖</span>
            </button>

            <div className="codex-panel">
                <div className="codex-head">
                    <b><span aria-hidden="true">📖</span> Ability Codex</b>
                    <button type="button" className="codex-close"
                            onClick={() => setOpen(false)}
                            aria-label="Close ability codex" title="Close ability codex">✕</button>
                </div>

                <div className="codex-howto">
                    <b>How Chaos works</b>
                    <p>Classic Rummikub still applies. Empty your tile rack to win. On your turn
                       you may also play any number of ability cards. Some target a single rival,
                       others hit everyone or the table. Any card can be played face-down as a
                       bluff, and the target or table may challenge it.</p>
                </div>

                <div className="codex-body">
                    {GROUPS.map(({rarity, types}) => (
                        <React.Fragment key={rarity}>
                            <div className="codex-gh">
                                <span className={`codex-sw ${RARITY_SWATCH[rarity]}`} aria-hidden="true"/>
                                {RARITY_LABEL[rarity]}
                            </div>
                            {types.map((type) => {
                                const meta = CARD_META[type];
                                return (
                                    <div key={type} className={`codex-row ${RARITY_ROW[rarity]}`.trim()}>
                                        <div className="codex-ic" aria-hidden="true">{meta.icon}</div>
                                        <div className="codex-tx">
                                            <b>{meta.name}</b>
                                            <span>{meta.effect}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}
