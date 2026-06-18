import React from "react";
import {comboLabel} from "../juice/comboMath";

export default function ComboOverlay({combo, by}) {
    if (!combo || combo < 2) return null;
    const tier = combo >= 7 ? 'fire' : combo >= 5 ? 'hot' : combo >= 3 ? 'warm' : 'base';
    const label = comboLabel(combo);
    return (
        <div className={`combo-overlay combo-${tier}`} key={combo} aria-hidden="true">
            {by ? <div className="combo-by">{by}</div> : null}
            <div className="combo-x">COMBO</div>
            <div className="combo-n">&times;{combo}</div>
            {label ? <div className="combo-label">{label}</div> : null}
        </div>
    );
}
