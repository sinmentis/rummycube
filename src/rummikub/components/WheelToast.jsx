import React, {useState, useRef, useEffect} from 'react';
import './abilities.css';

// SP3b: the all-visible Public Wheel toast. The SP3a backend stores a public
// G.lastWheel = {object, action, detail} after a spin (playerView passes it to
// every client). When that value changes we flash a center wheel-spin + a short
// result toast, then auto-dismiss (~4s) or replace on the next spin. Dedupe keys
// on the CONTENT (stringified object/action/detail), not identity — playerView
// cloneDeep hands us a fresh lastWheel ref every turn, so a ref-based guard would
// re-pop on any unrelated state change. Same spin never re-pops. The text is captured
// at show time so the toast survives the server clearing the transient later.
// Spin motion is purely CSS, gated by prefers-reduced-motion (text only, no spin).
function seatName(matchData, seat) {
    const list = Array.isArray(matchData) ? matchData : [];
    const s = list[Number(seat)];
    return (s && s.name) || `Player ${Number(seat) + 1}`;
}

// 06 §2 fortune tags: drawing more tiles is a curse, shedding is a blessing, a full
// re-deal is a coin-flip; table add = opportunity, remove = strike. Fix2 surfaces
// the exact seat/count + this label so the toast reads as fortune, not just an event.
const FORTUNE = {
    draw: 'curse', discard: 'blessing', reshuffle: 'swap',
    'add-set': 'boon', 'remove-set': 'strike',
};

function wheelText(lastWheel, matchData) {
    if (!lastWheel) return null;
    const {object, action, detail = {}} = lastWheel;
    const tag = FORTUNE[action] ? ` (${FORTUNE[action]})` : '';
    if (object === 'table') {
        const n = detail.count != null ? ` (${detail.count})` : '';
        return action === 'add-set' ? `Table: set added${n}${tag}` : `Table: set removed${n}${tag}`;
    }
    // 'all' hits every seat; sum the per-seat counts so the toast still has a number.
    if (object === 'all') {
        const total = Array.isArray(detail.seats) ? detail.seats.reduce((s, x) => s + (x.count || 0), 0) : 0;
        if (action === 'draw') return `Everyone draws ${total}${tag}`;
        if (action === 'discard') return `Everyone discards ${total}${tag}`;
        return `Everyone reshuffles${tag}`;
    }
    const who = seatName(matchData, detail.seat);
    if (action === 'draw') return `${who} drew ${detail.count}${tag}`;
    if (action === 'discard') return `${who} discarded ${detail.count != null ? detail.count : 1}${tag}`;
    return `${who} reshuffled${tag}`;
}

export default function WheelToast({lastWheel, matchData, durationMs = 4000}) {
    const [text, setText] = useState(null);
    const seenRef = useRef(null);
    const hideTimer = useRef(null);

    useEffect(() => {
        if (!lastWheel) return;
        const sig = JSON.stringify([lastWheel.object, lastWheel.action, lastWheel.detail]);
        if (sig === seenRef.current) return;
        seenRef.current = sig;
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
