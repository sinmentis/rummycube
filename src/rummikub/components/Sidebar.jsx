import React, {useState} from "react";
import {copyToClipboard} from "./domUtil";

// Compact info card (top-left): tiles left in the pool + the room invite while
// waiting. Player avatars now live around the table in TableSeats.
const Sidebar = function ({tilesOnPool, matchData, matchID, gameover, allJoined}) {
    const [copied, setCopied] = useState(false)
    const showInvite = !!matchID && !!matchData.length && !gameover && !allJoined

    function onCopyLink() {
        const link = `${window.location.origin}/join-match/${matchID}`
        copyToClipboard(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <div className='sidenav'>
            <div className="tile-pool-counter">
                Tiles left: {tilesOnPool}
            </div>
            {showInvite &&
                <div className="invite-panel">
                    <span className="invite-title">Need more players?</span>
                    <span className="invite-label">Share this room</span>
                    <button
                        type="button"
                        className="invite-code"
                        onClick={onCopyLink}
                        title="Click to copy the join link">
                        {matchID}
                    </button>
                    <button type="button" className="invite-copy" onClick={onCopyLink}>
                        {copied ? 'Copied!' : 'Copy link'}
                    </button>
                </div>}
        </div>)
}

export default Sidebar
