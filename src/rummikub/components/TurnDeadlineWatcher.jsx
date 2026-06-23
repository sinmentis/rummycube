import {useEffect, useRef} from "react";
import {getSecTs} from "../util";

// Null-rendering watcher that fires the client-side turn-timeout nudge exactly
// once when the server-set deadline passes. Because it renders null and lives
// as a Board child, its internal 400ms ticking never re-renders Board's tile
// tree. The server `forceEndTurn` guard remains the real anti-cheat authority;
// this just makes an honest client end the turn at/after the deadline.
const TurnDeadlineWatcher = ({timerExpireAt, onTimeout}) => {
    const firedRef = useRef(false);
    const intervalRef = useRef(null);
    // Keep onTimeout in a ref so its identity changing does not resubscribe the
    // interval (which would reset the single-fire guard mid-turn).
    const onTimeoutRef = useRef(onTimeout);
    useEffect(() => {
        onTimeoutRef.current = onTimeout;
    }, [onTimeout]);

    useEffect(() => {
        firedRef.current = false;
        if (!timerExpireAt) return;

        const check = () => {
            const remaining = timerExpireAt - getSecTs();
            if (remaining <= 0 && !firedRef.current) {
                firedRef.current = true;
                onTimeoutRef.current();
                clearInterval(intervalRef.current);
            }
        };

        check(); // run immediately
        intervalRef.current = setInterval(check, 400);

        return () => clearInterval(intervalRef.current);
    }, [timerExpireAt]);

    return null;
};

export default TurnDeadlineWatcher;
