import React from "react";
import {count2dArrItems} from "../util";
import PlayerAvatarWithTimer from "./PlayerAvatar";
import {tablePositions} from "../seats/tableLayout";
import {seatConnected} from "../seats/seatConnection";

// Opponent avatars laid out around the felt like a mahjong table (top/left/right
// by seat order). Self is rendered next to the rack, not here. Renders as a
// non-interactive overlay inside .board so it never blocks tile dragging.
// A chat bubble (if any) points back at its seat: top seat -> bubble below,
// left-edge seat -> bubble to the right (inward), right-edge -> to the left.
const SIDE_BY_POS = {top: 'down', left: 'right', right: 'left', bottom: 'up'};

const TableSeats = function ({currentPlayer, playerID, matchData, matchID, hands, handCounts, connected, timerExpireAt, timePerTurn, showTurnTimer, bubbles, targetable = false, onPickTarget, abilityPresence}) {
    const positions = tablePositions(matchData.length, Number(playerID));

    return (
        <div className="table-seats">
            {matchData.map((data, index) => {
                if (Number(data.id) === Number(playerID)) return null; // self lives by the rack
                const pos = positions[data.id] || 'top';
                const tiles = handCounts && handCounts[data.id] != null
                    ? handCounts[data.id]
                    : count2dArrItems(hands[data.id]);
                return (
                    <div key={data.id} className={`seat-slot seat-${pos}`}>
                        {data.name
                            ? <PlayerAvatarWithTimer isActive={index == currentPlayer}
                                                     name={data.name}
                                                     matchId={matchID}
                                                     seatId={data.id}
                                                     tiles={tiles}
                                                     isConnected={seatConnected(connected, data.id, data.isConnected)}
                                                     timerExpireAt={timerExpireAt}
                                                     totalTime={timePerTurn}
                                                     showTurnTimer={showTurnTimer}
                                                     bubble={(bubbles && bubbles[String(data.id)]) || null}
                                                     bubbleSide={SIDE_BY_POS[pos] || 'down'}
                                                     targetable={targetable}
                                                     onPickTarget={onPickTarget}
                                                     hasAbility={!!(abilityPresence && abilityPresence[String(data.id)])}/>
                            : <div className="player-pending">Seat {data.id + 1}<br/>waiting…</div>}
                    </div>
                );
            })}
        </div>
    );
};

export default TableSeats;
