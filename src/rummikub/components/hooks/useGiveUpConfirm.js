import {useState, useCallback, useRef, useEffect} from "react";

// Explicit "Give up turn" is a two-click in-game confirm (no browser dialog):
// the first click ARMS the button (warning style + "Click again to confirm"); a
// second click, after a short rage-guard and within the confirm window, forfeits
// (tiles roll back + draw one + end turn). It auto-reverts otherwise. Distinct
// from a rejected submit, which is a no-op.
const GIVEUP_CONFIRM_MS = 3000, GIVEUP_ARM_GUARD_MS = 400;

export function useGiveUpConfirm({moves, currentPlayer, gameover, tilePositions, hasStaged, setSubmitReason}) {
    const [giveUpArmed, setGiveUpArmed] = useState(false);
    const giveUpTimer = useRef(null), armedAtRef = useRef(0);
    const disarm = useCallback(() => { clearTimeout(giveUpTimer.current); setGiveUpArmed(false); }, []);
    const armGiveUp = useCallback(() => {
        if (giveUpArmed) {
            if (Date.now() - armedAtRef.current < GIVEUP_ARM_GUARD_MS) return; // block a rage double-click from confirming instantly
            disarm(); setSubmitReason(''); moves.forfeitTurn(); return;
        }
        setGiveUpArmed(true); armedAtRef.current = Date.now();
        clearTimeout(giveUpTimer.current);
        giveUpTimer.current = setTimeout(() => setGiveUpArmed(false), GIVEUP_CONFIRM_MS);
    }, [giveUpArmed, disarm, moves, setSubmitReason]);
    useEffect(() => { disarm(); }, [currentPlayer, gameover, disarm]);
    useEffect(() => () => clearTimeout(giveUpTimer.current), []);

    // (rubber-duck) Disarm whenever the staged board changes, so an armed confirm
    // can never apply to a different board state than the one the player saw. NOTE:
    // giveUpArmed is intentionally NOT a dependency here — including it (as the
    // original brief snippet did) re-runs this effect on the arming render itself
    // and instantly disarms, making the two-click confirm impossible. disarm() is a
    // no-op when not armed, so firing it on every board change is safe.
    useEffect(() => { disarm(); }, [tilePositions, hasStaged, disarm]);

    return {giveUpArmed, armGiveUp, disarm};
}
