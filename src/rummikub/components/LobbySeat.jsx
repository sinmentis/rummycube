import React from "react";
import {catAvatarUrl} from "../avatars/catAvatar";

// One seat row in the lobby: a kitten avatar for a filled seat (same cat the
// player will have in the match, since both derive from matchId + seat.id), or a
// dashed placeholder for an open seat.
export default function LobbySeat({matchId, seat}) {
    const filled = !!seat.name;
    return (
        <div className={`seat-status ${filled ? 'seat-filled' : 'seat-vacant'}`}>
            <span
                className={`seat-avatar ${filled ? '' : 'seat-avatar-empty'}`}
                style={filled ? {backgroundImage: `url(${catAvatarUrl(matchId, seat.id)})`} : undefined}
                aria-hidden="true"
            >{filled ? '' : seat.id + 1}</span>
            <span className="seat-label">
                {filled ? `${seat.name} joined` : `Seat ${seat.id + 1} open`}
            </span>
        </div>
    );
}
