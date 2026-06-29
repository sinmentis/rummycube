import React, {useState, useRef, useEffect} from 'react';
import './abilities.css';

// SP3b: the all-visible Public Wheel toast. The SP3a backend stores a public
// G.lastWheel = {object, action, detail} after a spin (playerView passes it to
// every client). When that value changes we flash a center wheel-spin + a short
// result toast, then auto-dismiss (~4s) or replace on the next spin. Dedupe keys
// on the object reference, so the same spin never re-pops; a value already on G
// at mount still shows (the spin only fires on chaos turns). The text is captured
// at show time so the toast survives the server clearing the transient later.
// Spin motion is purely CSS, gated by prefers-reduced-motion (text only, no spin).
function seatName(matchData, seat) {
    const list = Array.isArray(matchData) ? matchData : [];
    const s = list[Number(seat)];
    return (s && s.name) || `Player ${Number(seat) + 1}`;
}

function wheelText(lastWheel, matchData) {
    if (!lastWheel) return null;
    const {object, action, detail = {}} = lastWheel;
    if (object === 'table') {
        return action === 'add-set' ? 'Table: set added' : 'Table: set removed';
    }
    const who = object === 'all' ? 'Everyone' : seatName(matchData, detail.seat);
    if (action === 'draw') return `${who} drew ${detail.count}`;
    if (action === 'discard') return `${who} discarded`;
    return `${who} reshuffled`;
}

export default function WheelToast({lastWheel, matchData, durationMs = 4000}) {
    const [text, setText] = useState(null);
    const seenRef = useRef(null);
    const hideTimer = useRef(null);

    useEffect(() => {
        if (!lastWheel || lastWheel === seenRef.current) return;
        seenRef.current = lastWheel;
        const next = wheelText(lastWheel, matchData);
        if (!next) return;
        setText(next);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setText(null), durationMs);
    }, [lastWheel]);

    useEffect(() => () => clearTimeout(hideTimer.current), []);

    if (!text) return null;
    return (
        <div className="wheel-toast" role="status" aria-live="polite">
            <span className="wheel-spin" aria-hidden="true">🎡</span>
            <span className="wheel-text">Wheel: {text}</span>
        </div>
    );
}
