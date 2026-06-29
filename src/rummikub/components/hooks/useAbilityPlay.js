import {useCallback, useState} from 'react';
import {SINGLE_TARGET_DECLARES} from '../../abilities/cardMeta';

// SP1b T5: the play controller for the viewer's chaos ability hand. Kept as a
// standalone hook (not Board-local state) so the peek targeting flow is
// deterministically unit-testable without mounting the whole Board.
//
// Routing mirrors the playable target kinds:
//   - shield/bigwind/wheel: no target -> moves.playAbilityCard(card.id) now.
//   - peek/junk2/junk3/junk4/skip/force: need an opponent, so they park in
//             `pendingPeek` and wait for an avatar click; pickTarget(pid) then
//             dispatches moves.playAbilityCard(card.id, pid).
//   - lock: needs a board row, so it parks in `pendingLock` and waits for a row
//             pick; pickRow(row) dispatches moves.playAbilityCard(card.id, row).
// Any other type is inert — belt-and-braces so a stray dispatch never reaches
// the server.
//
// Effects are server-authoritative: this only dispatches the registered move and
// never mutates G. The reveal/shield state comes back through playerView.
const NEEDS_TARGET = new Set(['peek', 'junk2', 'junk3', 'junk4', 'skip', 'force']);
const NO_TARGET = new Set(['shield', 'bigwind', 'wheel']);

export default function useAbilityPlay(moves) {
    const [pendingPeek, setPendingPeek] = useState(null);
    const [pendingLock, setPendingLock] = useState(null);
    const [faceDown, setFaceDown] = useState(false);
    const [declared, setDeclared] = useState('peek');

    const playCard = useCallback((card) => {
        if (!card) return;
        if (faceDown && declared) {
            const opts = {faceDown: true, declaredType: declared};
            if (SINGLE_TARGET_DECLARES.has(declared)) {
                setPendingPeek({...card, opts});       // single-target claim: pick a victim first
            } else {
                moves.playAbilityCard(card.id, undefined, opts); // table-wide (wheel): fire now
            }
            return;
        }
        if (NO_TARGET.has(card.type)) {
            moves.playAbilityCard(card.id);
        } else if (card.type === 'lock') {
            setPendingLock(card);
        } else if (NEEDS_TARGET.has(card.type)) {
            setPendingPeek(card);
        }
        // other types are inert here — no dispatch.
    }, [moves, faceDown, declared]);

    const pickTarget = useCallback((pid) => {
        if (!pendingPeek) return;
        if (pendingPeek.opts) {
            moves.playAbilityCard(pendingPeek.id, pid, pendingPeek.opts);
        } else {
            moves.playAbilityCard(pendingPeek.id, pid);
        }
        setPendingPeek(null);
    }, [moves, pendingPeek]);

    const pickRow = useCallback((row) => {
        if (!pendingLock) return;
        moves.playAbilityCard(pendingLock.id, row);
        setPendingLock(null);
    }, [moves, pendingLock]);

    const cancelTarget = useCallback(() => { setPendingPeek(null); setPendingLock(null); }, []);

    return {pendingPeek, pendingLock, playCard, pickTarget, pickRow, cancelTarget, faceDown, setFaceDown, declared, setDeclared};
}
