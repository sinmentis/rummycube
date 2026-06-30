import React from "react";
import {comboLabel} from "../juice/comboMath";

export default function ComboOverlay({combo, by}) {
    if (!combo || combo < 1) return null;
    // Keep colour tier aligned with comboLabel(): net-added counts can now be
    // 5/7/8, so the old 5/7 colour thresholds would show "NICE" in hot colours.
    const tier = combo >= 9 ? 'fire' : combo >= 6 ? 'hot' : combo >= 3 ? 'warm' : 'base';
    const label = comboLabel(combo);
    return (
        <div className={`combo-overlay combo-${tier}`} key={combo} aria-hidden="true">
            {by ? <div className="combo-by">{by}</div> : null}
            <div className="combo-x">TABLE +</div>
            <div className="combo-n">{combo}</div>
            <div className="combo-unit">tile{combo === 1 ? '' : 's'}</div>
            {label ? <div className="combo-label">{label}</div> : null}
        </div>
    );
}
