import {useCallback, useState} from 'react';

// SP1b T5: the play controller for the viewer's chaos ability hand. Kept as a
// standalone hook (not Board-local state) so the peek targeting flow is
// deterministically unit-testable without mounting the whole Board.
//
// Routing mirrors the two SP1b-playable types:
//   - shield: no target, fire-and-forget -> moves.playAbilityCard(card.id).
//   - peek:   needs a victim, so it parks in `pendingPeek` and waits for the
//             player to click an opponent avatar; pickTarget(pid) then dispatches
//             moves.playAbilityCard(card.id, pid) and clears the pending state.
// Any other type is ignored here — the hand already greys those out, this is the
// belt-and-braces guard so a stray dispatch can never reach the server.
//
// Effects are server-authoritative: this only dispatches the registered move and
// never mutates G. The reveal/shield state comes back through playerView.
export default function useAbilityPlay(moves) {
    const [pendingPeek, setPendingPeek] = useState(null);

    const playCard = useCallback((card) => {
        if (!card) return;
        if (card.type === 'shield') {
            moves.playAbilityCard(card.id);
        } else if (card.type === 'peek') {
            setPendingPeek(card);
        }
        // other types are inert in SP1b — no dispatch.
    }, [moves]);

    const pickTarget = useCallback((pid) => {
        if (!pendingPeek) return;
        moves.playAbilityCard(pendingPeek.id, pid);
        setPendingPeek(null);
    }, [moves, pendingPeek]);

    const cancelTarget = useCallback(() => setPendingPeek(null), []);

    return {pendingPeek, playCard, pickTarget, cancelTarget};
}
