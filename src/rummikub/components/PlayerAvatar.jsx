import React, {useEffect, useState} from "react";
import {stringToColor} from "../util";
import {catAvatarUrl} from "../avatars/catAvatar";
import {useCountdown} from "../hooks/useCountdown";

const RADIUS = 45;
const STROKE = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const PlayerAvatarWithTimer = ({name, matchId, seatId, tiles, isActive, isConnected, timerExpireAt, totalTime, showTurnTimer}) => {
    const [dashOffset, setDashOffset] = useState(CIRCUMFERENCE);
    const [strokeColor, setStrokeColor] = useState("#00f");

    // Only the active avatar runs its own countdown, so a 400ms tick re-renders
    // just this subtree — never Board. Non-active avatars pass null and idle.
    const timeLeft = useCountdown(isActive && showTurnTimer ? timerExpireAt : null, totalTime);


    useEffect(() => {
        const percent = Math.max(0, timeLeft / totalTime);
        const offset = CIRCUMFERENCE * (1 - percent);
        setDashOffset(offset);

        // Change color based on remaining time
        const redIntensity = Math.max(0, 255 * (1 - percent)); // from 0 to 255
        const blueIntensity = Math.max(0, 255 * percent); // from 255 to 0
        setStrokeColor(`rgb(${redIntensity}, ${0}, ${blueIntensity})`); // smooth transition from blue to red
    }, [timeLeft, totalTime]);

    return (
        <div className="player">
            <div className={`avatar ${isActive ? "active" : ""} ${isConnected === false ? "offline" : ""}`}
                 style={{
                     backgroundColor: stringToColor(name),
                     backgroundImage: `url(${catAvatarUrl(matchId, seatId)})`,
                 }}>
                 {isConnected === false &&
                     <span className="avatar-offline" title="Disconnected" aria-label="Disconnected">🔌</span>}
                {isActive && showTurnTimer ? <svg className="timer-ring" width="100" height="100" viewBox="0 0 100 100">
                    <circle
                        className="timer-bg"
                        r={RADIUS}
                        cx="50"
                        cy="50"
                        fill="none"
                        stroke="#eee"
                        strokeWidth={STROKE}
                    />
                    <circle
                        className="timer-circle"
                        r={RADIUS}
                        cx="50"
                        cy="50"
                        fill="none"
                        stroke={strokeColor} // Dynamically change the stroke color
                        strokeWidth={STROKE}
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                    />
                </svg> : ''}
                <span className="username">{name}</span>
                <span className="tile-count">{tiles}</span>
            </div>
        </div>
    );
};

export default PlayerAvatarWithTimer;
