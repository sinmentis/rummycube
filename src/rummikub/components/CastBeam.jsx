import React from "react";
import './abilities.css';

// SP1b T6 (juice): the peek cast beam. A transient SVG line Board mounts for a
// beat when a peek is cast, running from the caster avatar (you) to the target
// avatar. Purely presentational — `from`/`to` are {x, y} points in the board's
// pixel space (no viewBox, so user units map 1:1 to the overlay's CSS pixels).
// The travelling spark dashes are CSS-animated and degrade to a plain static
// line under prefers-reduced-motion (see abilities.css). Self-contained defs so
// the warm gradient + arrowhead resolve without a shared <defs> on the page.
// Mirrors the approved mockup's .beam-stage / .beam-core / .beam-flow.
export default function CastBeam({from, to}) {
    if (!from || !to) return null;
    return (
        <svg className="cast-beam beam-svg" aria-hidden="true">
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
            <line className="beam-core" x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  markerEnd="url(#castBeamHead)"/>
            <line className="beam-flow" x1={from.x} y1={from.y} x2={to.x} y2={to.y}/>
            <circle className="beam-origin" cx={from.x} cy={from.y} r="7"/>
        </svg>
    );
}
