import {useState, useEffect, useRef} from "react";
import {getSecTs} from "../util";

// Visual-only countdown for the active player's avatar ring. It ticks a
// clamped `timeLeft` every 400ms and fires NO timeout — the deadline/timeout
// nudge lives in TurnDeadlineWatcher. Pass `timerExpireAt = null` (e.g. for a
// non-active avatar) to disable ticking; the hook just returns `totalTime`.
export function useCountdown(timerExpireAt, totalTime) {
    const [timeLeft, setTimeLeft] = useState(() =>
        timerExpireAt ? Math.max(0, Math.round(timerExpireAt - getSecTs())) : totalTime
    );
    const intervalRef = useRef(null);

    useEffect(() => {
        if (!timerExpireAt) {
            setTimeLeft(totalTime);
            return;
        }
        const tick = () => {
            const remaining = timerExpireAt - getSecTs();
            setTimeLeft(Math.max(0, Math.round(remaining)));
        };

        tick(); // run immediately
        intervalRef.current = setInterval(tick, 400);

        return () => clearInterval(intervalRef.current);
    }, [timerExpireAt, totalTime]);

    return timeLeft;
}
