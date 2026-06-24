import React from "react";

// T6 (WS-D): compact icon button for the rack's corner tools cluster (undo/redo).
// The glyph (↶/↷ — a directional arc arrow) is the colour-blind-safe channel; the
// accessible name comes from aria-label + title, and the 44x44 hit area + focus
// ring live in board.css (.icon-button). The glyph span is aria-hidden so the
// accessible name is exactly the label.
const IconButton = function ({glyph, label, onClick, disabled}) {
    return (
        <button type="button"
                className="icon-button"
                aria-label={label}
                title={label}
                disabled={disabled}
                onClick={onClick}>
            <span aria-hidden="true">{glyph}</span>
        </button>
    );
};

export default IconButton;
