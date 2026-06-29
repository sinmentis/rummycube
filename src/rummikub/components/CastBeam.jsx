import React from "react";
import './abilities.css';

// SP1b T6 / Chaos-T4 (juice): the table-wide cast beam. A transient SVG line Board
// mounts for ~700ms whenever G.lastCast broadcasts a resolved cast — caster avatar
// -> target avatar, drawn for EVERY client, not just the caster. `from`/`to` are
// {x, y} points in the board's pixel space (no viewBox, so user units map 1:1 to
// the overlay's CSS pixels). A clean cast lands a pulse ring on the target; a
// `blocked` cast (shield) snaps the beam short and pops a burst at the shield. The
// travelling spark + ring + burst are CSS-animated and degrade to a still result
// under prefers-reduced-motion (see abilities.css). Self-contained defs so the warm
// gradient + arrowhead resolve without a shared <defs> on the page.
export default function CastBeam({from, to, type, blocked = false}) {
    if (!from || !to) return null;
    // A blocked beam stops ~16% short so the burst reads as the shield absorbing it.
    const mid = {x: from.x + (to.x - from.x) * 0.84, y: from.y + (to.y - from.y) * 0.84};
    const end = blocked ? mid : to;
    return (
        <svg className={`cast-beam beam-svg${blocked ? ' cast-beam--blocked' : ''}`} aria-hidden="true"
             data-cast-type={type}>
            <defs>
                <linearGradient id="castBeamGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#ffe9b0"/>
                    <stop offset="0.5" stopColor="#ffb24d"/>
                    <stop offset="1" stopColor="#ff5a3c"/>
                </linearGradient>
                <marker id="castBeamHead" markerWidth="14" markerHeight="14" refX="6" refY="4"
                        orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L9,4 L0,8 Z" fill="#ff5a3c"/>
                </marker>
            </defs>
            <line className="beam-core" x1={from.x} y1={from.y} x2={end.x} y2={end.y}
                  markerEnd={blocked ? undefined : "url(#castBeamHead)"}/>
            <line className="beam-flow" x1={from.x} y1={from.y} x2={end.x} y2={end.y}/>
            <circle className="beam-origin" cx={from.x} cy={from.y} r="7"/>
            {blocked
                ? <circle className="beam-burst" cx={end.x} cy={end.y} r="14"/>
                : <circle className="beam-ring" cx={to.x} cy={to.y} r="14"/>}
        </svg>
    );
}
