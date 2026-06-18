import React from "react";
import _ from "lodash";
import {count2dArrItems} from "../util";
import {useTurnTimer} from "../hooks/useTurnTimer";
import PlayerAvatarWithTimer from "./PlayerAvatar";
import {tablePositions} from "../seats/tableLayout";

// Player avatars laid out around the felt like a mahjong table: you at the
// bottom (next to your rack), opponents at top/left/right by seat order. Renders
// as a non-interactive overlay inside .board so it never blocks tile dragging.
const TableSeats = function ({
                                 currentPlayer, playerID, matchData, matchID, gameover,
                                 timePerTurn, timerExpireAt, onTimeout, hands,
                             }) {
    const allJoined = matchData.length && _.every(matchData, (item) => item.name);
    const showTurnTimer = matchData.length && !gameover && allJoined;
    const timeLeft = useTurnTimer({
        timerExpireAt: showTurnTimer ? timerExpireAt : null,
        timePerTurn: timePerTurn,
        onTimeout: onTimeout,
        isActivePlayer: playerID === currentPlayer,
    });

    const positions = tablePositions(matchData.length, Number(playerID));

    return (
        <div className="table-seats">
            {matchData.map((data, index) => {
                const pos = positions[data.id] || 'top';
                const tiles = count2dArrItems(hands[data.id]);
                return (
                    <div key={data.id} className={`seat-slot seat-${pos}`}>
                        {data.name
                            ? <PlayerAvatarWithTimer isActive={index == currentPlayer}
                                                     name={data.name}
                                                     matchId={matchID}
                                                     seatId={data.id}
                                                     tiles={tiles}
                                                     timeLeft={timeLeft}
                                                     totalTime={timePerTurn}
                                                     showTurnTimer={showTurnTimer}/>
                            : <div className="player-pending">Seat {data.id + 1}<br/>waiting…</div>}
                    </div>
                );
            })}
        </div>
    );
};

export default TableSeats;
