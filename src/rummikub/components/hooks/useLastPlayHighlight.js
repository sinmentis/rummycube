import {useState, useRef, useEffect} from "react";

// Everyone briefly highlights the tiles of the most recent valid play. The server
// records each play in G.lastPlay (seat + groups of board-tile ids + ts), so every
// client — not just the player who melded — flashes the same tiles with the
// existing "newly added" tile highlight. lastPlay carries only public board tiles,
// so no hidden hand info leaks, and it works in classic and chaos alike.
//
// Mirrors useComboCelebration: the ts present at mount/reconnect is ignored (so a
// reconnecting client never lights up a stale play), the highlight is replaced
// when the next play arrives, and it fades on its own after HIGHLIGHT_MS.
const HIGHLIGHT_MS = 2600;

export function useLastPlayHighlight(lastPlay) {
    const [tiles, setTiles] = useState([]);
    const seenTsRef = useRef(undefined);
    const timerRef = useRef(null);
    // Hold the latest play in a ref so the ts-gated effect can read its groups
    // without listing lastPlay as a dependency (the ts change is the only trigger).
    const lastPlayRef = useRef(lastPlay);
    lastPlayRef.current = lastPlay;
    const ts = lastPlay && lastPlay.ts ? lastPlay.ts : null;
    useEffect(() => {
        if (seenTsRef.current === undefined) { seenTsRef.current = ts; return; } // ignore the play present at mount/reconnect
        if (ts === null || ts === seenTsRef.current) return;
        seenTsRef.current = ts;
        const lp = lastPlayRef.current;
        const ids = (lp && lp.groups ? lp.groups : []).flat().map(Number);
        setTiles(ids);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setTiles([]), HIGHLIGHT_MS);
    }, [ts]);
    useEffect(() => () => clearTimeout(timerRef.current), []);
    return tiles;
}
