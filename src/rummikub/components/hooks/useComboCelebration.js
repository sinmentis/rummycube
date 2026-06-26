import {useState, useRef, useEffect} from "react";
import * as fx from "../../juice/effects";
import {play, place, milestone} from "../../sound/sfx";
import {resolveJuice} from "../../juice/gating";

// Everyone celebrates a valid submit: the server records it in G.lastPlay and
// every client (not just the scorer) fires the combo/spotlight off its ts.
//
// activeTile/selectedTiles are passed in (not snapshotted) so the effect closes
// over the LIVE drag/selection state on each render; the `[ts]` dep only gates
// when the celebration runs, while the body reads the current drag state.
export function useComboCelebration({G, matchData, playerID, activeTile, selectedTiles, clearSyncing}) {
    const [combo, setCombo] = useState(0);
    const [comboBy, setComboBy] = useState('');
    const comboTimer = useRef(null);
    const seenPlayRef = useRef(undefined);
    useEffect(() => {
        const lp = G.lastPlay;
        const ts = lp && lp.ts ? lp.ts : null;
        if (seenPlayRef.current === undefined) { seenPlayRef.current = ts; return; } // ignore the one present at mount/reconnect
        if (ts === null || ts === seenPlayRef.current) return;
        seenPlayRef.current = ts;
        clearSyncing();
        const n = lp.count || 0;
        const by = (matchData && matchData[lp.seat] && matchData[lp.seat].name) || `Player ${Number(lp.seat) + 1}`;
        const cx = window.innerWidth / 2, cy = window.innerHeight * 0.4;
        // Scale the celebration to who played + whether we're mid-drag (pure predicate).
        const isDragging = !!activeTile || selectedTiles.length > 0;
        const g = resolveJuice({lastPlay: lp, localSeat: playerID, isDragging});
        setCombo(n);
        setComboBy(by);
        if (g.celebrate && lp.groups && lp.groups.length) fx.celebrateGroups(lp.groups);
        if (g.intensity === 'full') place(n);
        // One primary screen effect per play (T9-3): flash on a high manipulation
        // score, otherwise a confetti burst — never both at once.
        if (g.flash && n >= 3) { fx.flash('combo'); if (g.win) milestone(); }
        else if (g.burst) fx.burstAt(cx, cy, n);
        if (g.kick) fx.kick(n);
        fx.floatText('+' + (lp.points || 0), cx, cy);
        if (g.win) play('win');
        clearTimeout(comboTimer.current);
        comboTimer.current = setTimeout(() => { setCombo(0); setComboBy(''); }, 1800);
    }, [G.lastPlay ? G.lastPlay.ts : null]);
    return {combo, comboBy};
}
