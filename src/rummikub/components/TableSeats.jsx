import React from "react";
import {count2dArrItems} from "../util";
import PlayerAvatarWithTimer from "./PlayerAvatar";
import {tablePositions} from "../seats/tableLayout";

// Opponent avatars laid out around the felt like a mahjong table (top/left/right
// by seat order). Self is rendered next to the rack, not here. Renders as a
// non-interactive overlay inside .board so it never blocks tile dragging.
const TableSeats = function ({currentPlayer, playerID, matchData, matchID, hands, timerExpireAt, timePerTurn, showTurnTimer}) {
    const positions = tablePositions(matchData.length, Number(playerID));

    return (
        <div className="table-seats">
            {matchData.map((data, index) => {
                if (Number(data.id) === Number(playerID)) return null; // self lives by the rack
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
                                                     isConnected={data.isConnected}
                                                     timerExpireAt={timerExpireAt}
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
