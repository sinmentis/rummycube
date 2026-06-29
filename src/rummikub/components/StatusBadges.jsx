import React from 'react';
import './abilities.css';

// SP6 T2: small chaos status chips for the viewer. Skip/Force mark that an
// ability landed on you (your next turn is skipped, or you must meld or draw 3);
// the lock chip counts board sets frozen by Lock. Pure presentational — fed by
// G.skipNext[me]/G.forced[me]/G.lockedSets in Board, chaos-gated. Renders nothing
// when there is no active state so classic + idle chaos turns are untouched.
export default function StatusBadges({skipNext = false, forced = false, lockedRows = []}) {
    const locked = Array.isArray(lockedRows) ? lockedRows.length : 0;
    if (!skipNext && !forced && !locked) return null;
    return (
        <div className="status-badges" role="status" aria-live="polite">
            {skipNext && (
                <span className="status-chip status-chip--skip"><span aria-hidden="true">⏭️</span> Skipped next</span>
            )}
            {forced && (
                <span className="status-chip status-chip--force"><span aria-hidden="true">📥</span> Must play or draw 3</span>
            )}
            {locked > 0 && (
                <span className="status-chip status-chip--lock"><span aria-hidden="true">🔒</span> {locked} set{locked > 1 ? 's' : ''} locked</span>
            )}
        </div>
    );
}
