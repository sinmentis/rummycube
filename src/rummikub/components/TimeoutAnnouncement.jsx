import React, {useState, useRef, useEffect} from 'react';
import {timeoutToastText} from '../timeoutToastText';

// T3 / WS-A: the all-visible "time's up" toast. It turns the server-authoritative
// G.lastTimeout transient {seat, drawCount, id} (T1) into the short English copy
// (timeoutToastText, T2) and shows it to every client for a few seconds, then
// auto-dismisses.
//
// De-dupe mirrors Board.jsx's seenPlayRef celebration effect: seenTimeoutIdRef is
// seeded with the id present at mount so a transient already on G when we
// mount/reconnect is ignored (no stale toast), and the same id never re-pops. The
// effect keys on lastTimeout?.id only; the toast's text + self-ness are captured
// into state at show time so the render never depends on the live transient,
// which the server clears a couple of turns later.
export default function TimeoutAnnouncement({lastTimeout, playerID, matchData, durationMs = 3500}) {
    const [toast, setToast] = useState(null);
    const seenTimeoutIdRef = useRef(lastTimeout ? lastTimeout.id : undefined);
    const hideTimer = useRef(null);

    const currentId = lastTimeout ? lastTimeout.id : null;
    useEffect(() => {
        if (currentId == null || currentId === seenTimeoutIdRef.current) return;
        seenTimeoutIdRef.current = currentId;
        const text = timeoutToastText(lastTimeout, playerID, matchData);
        if (!text) return;
        const isSelf = String(lastTimeout.seat) === String(playerID);
        setToast({text, isSelf});
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setToast(null), durationMs);
    }, [currentId]);

    useEffect(() => () => clearTimeout(hideTimer.current), []);

    if (!toast) return null;
    return (
        <div className="timeout-toast" role="status" aria-live={toast.isSelf ? 'assertive' : 'polite'}>
            {toast.text}
        </div>
    );
}
