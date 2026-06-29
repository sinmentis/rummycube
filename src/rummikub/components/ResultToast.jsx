import React, {useState, useRef, useEffect} from 'react';
import './abilities.css';

// Fix2: a tiny all-visible chaos result toast, mirroring WheelToast. Fed by a
// public transient {id} (lastBluffResult / lastSkip / lastBigwind). Dedupes on the
// numeric id (cloneDeep hands a fresh ref each turn), pops the captured text, then
// auto-dismisses after ~1.2s. Motion is CSS-only, so the text shows in jsdom too.
export default function ResultToast({result, text, durationMs = 1200, kind = ''}) {
    const [shown, setShown] = useState(null);
    const seenRef = useRef(result ? result.id : null);
    const hideTimer = useRef(null);

    const id = result ? result.id : null;
    useEffect(() => {
        if (id == null || id === seenRef.current) return;
        seenRef.current = id;
        if (!text) return;
        setShown(text);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setShown(null), durationMs);
    }, [id]);
    useEffect(() => () => clearTimeout(hideTimer.current), []);

    if (!shown) return null;
    return (
        <div className={'wheel-toast result-toast' + (kind ? ' result-toast--' + kind : '')}
             role="status" aria-live="polite">
            <span className="wheel-text">{shown}</span>
        </div>
    );
}
