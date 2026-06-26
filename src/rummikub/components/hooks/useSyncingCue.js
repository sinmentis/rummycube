import {useState, useCallback, useRef, useEffect} from "react";

// S3-U2: a light, time-boxed "syncing…" cue. The local player triggers it on a
// move (tile drop / submit) via markSyncing; it clears on the next authoritative G
// update (useComboCelebration calls clearSyncing off G.lastPlay) or after a short
// 1200ms timeout, so it never lingers and never blocks input.
export function useSyncingCue() {
    const [syncing, setSyncing] = useState(false);
    const syncTimer = useRef(null);
    const markSyncing = useCallback(() => {
        setSyncing(true);
        clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => setSyncing(false), 1200);
    }, []);
    const clearSyncing = useCallback(() => {
        clearTimeout(syncTimer.current);
        setSyncing(false);
    }, []);
    useEffect(() => () => clearTimeout(syncTimer.current), []);
    return {syncing, markSyncing, clearSyncing};
}
