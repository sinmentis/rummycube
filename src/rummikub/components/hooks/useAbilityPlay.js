import {useCallback, useState} from 'react';

// SP1b T5: the play controller for the viewer's chaos ability hand. Kept as a
// standalone hook (not Board-local state) so the peek targeting flow is
// deterministically unit-testable without mounting the whole Board.
//
// Routing mirrors the playable target-needing types:
//   - shield: no target, fire-and-forget -> moves.playAbilityCard(card.id).
//   - peek/junk2/junk3/junk4: need a victim, so they park in `pendingPeek` and
//             wait for the player to click an opponent avatar; pickTarget(pid)
//             then dispatches moves.playAbilityCard(card.id, pid) and clears it.
// Any other type is ignored here — the hand already greys those out, this is the
// belt-and-braces guard so a stray dispatch can never reach the server.
//
// Effects are server-authoritative: this only dispatches the registered move and
// never mutates G. The reveal/shield state comes back through playerView.
const NEEDS_TARGET = new Set(['peek', 'junk2', 'junk3', 'junk4']);

export default function useAbilityPlay(moves) {
    const [pendingPeek, setPendingPeek] = useState(null);

    const playCard = useCallback((card) => {
        if (!card) return;
        if (card.type === 'shield') {
            moves.playAbilityCard(card.id);
        } else if (NEEDS_TARGET.has(card.type)) {
            setPendingPeek(card);
        }
        // other types are inert here — no dispatch.
    }, [moves]);

    const pickTarget = useCallback((pid) => {
        if (!pendingPeek) return;
        moves.playAbilityCard(pendingPeek.id, pid);
        setPendingPeek(null);
    }, [moves, pendingPeek]);

    const cancelTarget = useCallback(() => setPendingPeek(null), []);

    return {pendingPeek, playCard, pickTarget, cancelTarget};
}
