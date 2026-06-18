import React, {useState} from "react";
import _ from "lodash";
import {count2dArrItems, copyToClipboard} from "../util";
import {useTurnTimer} from "../hooks/useTurnTimer";
import PlayerAvatarWithTimer from "./PlayerAvatar";

const Sidebar = function ({
                              tilesOnPool,
                              currentPlayer,
                              playerID,
                              matchData,
                              matchID,
                              gameover,
                              timePerTurn,
                              timerExpireAt,
                              onTimeout,
                              hands
                          }) {
    const [copied, setCopied] = useState(false)
    let allJoined = matchData.length && _.every(matchData, (item) => item.name)
    let showTurnTimer = matchData.length && !gameover && allJoined
    const timeLeft = useTurnTimer({
        timerExpireAt: showTurnTimer ? timerExpireAt : null,
        timePerTurn: timePerTurn,
        onTimeout: onTimeout,
        isActivePlayer: playerID === currentPlayer,
    });

    const showInvite = !!matchID && !!matchData.length && !gameover && !allJoined

    function onCopyLink() {
        const link = `${window.location.origin}/join-match/${matchID}`
        copyToClipboard(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <div className='sidenav'>
            <div className="player-list">
                {matchData.map(function (data, index) {
                    let elem = null
                    let tiles = count2dArrItems(hands[data.id])
                    let usernameElem = (
                        <PlayerAvatarWithTimer key={data.id}
                                               isActive={index == currentPlayer}
                                               name={data.name}
                                               matchId={matchID}
                                               seatId={data.id}
                                               tiles={tiles}
                                               timeLeft={timeLeft}
                                               totalTime={timePerTurn}
                                               showTurnTimer={showTurnTimer}
                        ></PlayerAvatarWithTimer>
                    )
                    if (data.name) {
                        elem = usernameElem
                    } else {
                        elem =
                            <div key={data.id} className="player-pending">Player {data.id + 1} not joined yet </div>
                    }
                    return elem
                })}</div>
            <div className="tile-pool-counter">
                Tiles left: {tilesOnPool}
            </div>
            {showInvite &&
                <div className="invite-panel">
                    <span className="invite-label">Invite a player · room</span>
                    <span className="invite-code">{matchID}</span>
                    <button type="button" className="invite-copy" onClick={onCopyLink}>
                        {copied ? 'Copied!' : 'Copy link'}
                    </button>
                </div>}
        </div>)


}

export default Sidebar