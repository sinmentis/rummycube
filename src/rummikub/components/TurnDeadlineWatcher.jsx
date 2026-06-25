import {useEffect, useRef} from "react";
import {getSecTs} from "../util";

// Null-rendering watcher that nudges the server-side turn timeout. The server
// `forceEndTurn` deadline guard is the real authority; this just makes an honest
// client end the turn at/after the deadline. It RETRIES (not fire-once) so a
// nudge rejected by the guard — e.g. when the client clock runs ahead of the
// server's — is followed by another until the server accepts and the turn
// advances. Its 400ms ticking renders null, so it never re-renders Board's tiles.
const TICK_MS = 400;
const FIRE_SLACK_MS = 500;          // wait ~500ms past the local deadline before firing,
                                    // so a client running slightly ahead doesn't pre-fire.
const REFIRE_INTERVAL_MS = 1500;    // throttle re-fires while past the deadline.

const TurnDeadlineWatcher = ({timerExpireAt, onTimeout}) => {
    const intervalRef = useRef(null);
    const lastFireRef = useRef(0);
    const onTimeoutRef = useRef(onTimeout);
    useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

    useEffect(() => {
        lastFireRef.current = 0;        // new turn: reset throttle (natural re-arm)
        if (!timerExpireAt) return;

        const check = () => {
            const now = getSecTs();
            if (timerExpireAt - now > -FIRE_SLACK_MS) return;       // not past deadline + slack yet
            if (now - lastFireRef.current < REFIRE_INTERVAL_MS) return; // throttled
            lastFireRef.current = now;
            onTimeoutRef.current();      // do NOT clearInterval — retry next window if rejected
        };

        check();
        intervalRef.current = setInterval(check, TICK_MS);
        return () => clearInterval(intervalRef.current);   // unmount / turn change: no cross-turn leak
    }, [timerExpireAt]);

    return null;
};

export default TurnDeadlineWatcher;
