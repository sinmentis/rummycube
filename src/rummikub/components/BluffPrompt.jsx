import React from 'react';
import {CARD_META, SINGLE_TARGET_DECLARES} from '../abilities/cardMeta';
import './abilities.css';

// SP5 T2: the face-down bluff challenge interrupt. A face-down play parks
// G.pendingBluff={actor,declared,target,...} (the real type is redacted by
// playerView) and hands a respondBluff stage to whoever may call it: the named
// target for a single-target claim, else every opponent. This surfaces the public
// claim ("X claims <declared>") with Challenge / Pass and a soft-timer note —
// unanswered, it pass-resolves on turn end. Actor / non-challengers see nothing.
function seatName(matchData, seat) {
    const list = Array.isArray(matchData) ? matchData : [];
    const s = list[Number(seat)];
    return (s && s.name) || `Player ${Number(seat) + 1}`;
}

export default function BluffPrompt({pendingBluff, playerID, matchData, onChallenge, onPass}) {
    if (!pendingBluff) return null;
    const {actor, declared, target} = pendingBluff;
    const me = String(playerID);
    const canChallenge = SINGLE_TARGET_DECLARES.has(declared)
        ? String(target) === me
        : me !== String(actor);
    if (!canChallenge) return null;

    const claim = (CARD_META[declared] || {name: declared}).name;
    return (
        <div className="bluff-prompt" role="alert">
            <div className="bluff-head">
                <span className="bmask" aria-hidden="true">🎭</span>
                <span className="bttl"><b>{seatName(matchData, actor)}</b> claims {claim}</span>
            </div>
            <div className="bluff-actions">
                <button type="button" className="rummikub-button" onClick={() => onChallenge && onChallenge()}>
                    Challenge
                </button>
                <button type="button" className="rummikub-button secondary-action" onClick={() => onPass && onPass()}>
                    Pass
                </button>
            </div>
            <div className="bluff-note">No reply by turn end auto-passes.</div>
        </div>
    );
}
