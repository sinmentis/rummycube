import React from "react";

// T4 (WS-B): opt-in toggle for the playable-tile assist (rack markers + count
// pill). Default OFF; the parent persists the choice in localStorage. Lives in
// the rack's utility cluster, not among the primary Draw/Submit actions.
const HintsToggle = function ({on, onToggle}) {
    return (
        <button type="button"
                className="hints-toggle"
                aria-pressed={on}
                title="Toggle playable-tile hints"
                onClick={onToggle}>
            {on ? '💡 Hints on' : '💡 Show hints'}
        </button>
    );
};

export default HintsToggle;
