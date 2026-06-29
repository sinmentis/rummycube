import React, {useState} from 'react';
import './abilities.css';

// SP2b-T2: the incoming-junk interrupt panel. A junk card doesn't draw at play
// time; it parks G.pendingJunk={amount,target,from} and hands the target a
// choice. If the pending junk is aimed at the viewer, this surfaces the count +
// sender with two actions: Accept (draw the whole stack now) or Transfer (stack
// one of your own junk2/3/4 cards and pass the chain to another seat). For
// everyone else it's a slim "X owes +N" bystander note. No pending -> nothing.
//
// Shields are auto-handled server-side (acceptJunk absorbs the chain, nobody
// draws); we just reassure the holder it'll absorb. No new timer: the existing
// soft-timer auto-accepts on turn end.
function seatName(matchData, seat) {
    const list = Array.isArray(matchData) ? matchData : [];
    const s = list[Number(seat)];
    return (s && s.name) || `Player ${Number(seat) + 1}`;
}

export default function JunkAlert({pendingJunk, playerID, matchData, myJunkCards = [], onAccept, onTransfer, hasShield}) {
    const [cardId, setCardId] = useState(null);
    const [seat, setSeat] = useState(null);
    if (!pendingJunk) return null;

    const me = String(playerID);
    const {amount, target, from} = pendingJunk;

    // Bystander: someone else owes the draw. A slim note, no actions.
    if (String(target) !== me) {
        return (
            <div className="junk-alert junk-owes" role="status" aria-live="polite">
                <span className="jbrick" aria-hidden="true">🧱</span>
                <b>{`${seatName(matchData, target)} owes +${amount}`}</b>
            </div>
        );
    }

    const others = (Array.isArray(matchData) ? matchData : [])
        .map((_, i) => String(i))
        .filter((id) => id !== me);
    const canTransfer = cardId != null && seat != null;

    return (
        <div className="junk-alert junk-incoming" role="alert">
            <div className="junk-head">
                <span className="jbrick" aria-hidden="true">🧱</span>
                <span className="jttl">{`Incoming +${amount} from ${seatName(matchData, from)}`}</span>
            </div>
            {hasShield && (
                <div className="junk-shield">🛡️ Your shield will absorb it — accept to block, nobody draws.</div>
            )}
            <div className="junk-actions">
                <button type="button" className="rummikub-button" onClick={() => onAccept && onAccept()}>
                    Accept +{amount}
                </button>
            </div>
            {myJunkCards.length > 0 && (
                <div className="junk-transfer">
                    <span className="junk-sub">Or pass it on:</span>
                    <div className="junk-cards">
                        {myJunkCards.map((c) => (
                            <button key={c.id} type="button"
                                    className={'junk-pick' + (cardId === c.id ? ' on' : '')}
                                    onClick={() => setCardId(c.id)}>
                                +{c.type.replace('junk', '')} <small>{c.id}</small>
                            </button>
                        ))}
                    </div>
                    <div className="junk-seats">
                        {others.map((id) => (
                            <button key={id} type="button"
                                    className={'junk-pick' + (seat === id ? ' on' : '')}
                                    onClick={() => setSeat(id)}>
                                {seatName(matchData, id)}
                            </button>
                        ))}
                    </div>
                    <button type="button" className="rummikub-button secondary-action" disabled={!canTransfer}
                            onClick={() => canTransfer && onTransfer && onTransfer(cardId, seat)}>
                        Transfer
                    </button>
                </div>
            )}
        </div>
    );
}
