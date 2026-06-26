import React, {useEffect, useState} from "react";
import {stringToColor} from "./domUtil";
import {catAvatarUrl} from "../avatars/catAvatar";
import {useCountdown} from "../hooks/useCountdown";

const RADIUS = 45;
const STROKE = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// timeLeft is in milliseconds (timePerTurn = seconds * 1000). Warn in the final
// 5 seconds with a motion-gated pulse — a second cue beyond the ring colour.
const LOW_TIME_MS = 5000;

const PlayerAvatarWithTimer = ({name, matchId, seatId, tiles, isActive, isConnected, timerExpireAt, totalTime, showTurnTimer}) => {
    const [dashOffset, setDashOffset] = useState(CIRCUMFERENCE);
    const [strokeColor, setStrokeColor] = useState("#cda24b");

    // Only the active avatar runs its own countdown, so a 400ms tick re-renders
    // just this subtree — never Board. Non-active avatars pass null and idle.
    const timeLeft = useCountdown(isActive && showTurnTimer ? timerExpireAt : null, totalTime);


    useEffect(() => {
        const percent = Math.max(0, timeLeft / totalTime);
        const offset = CIRCUMFERENCE * (1 - percent);
        setDashOffset(offset);

        // Discrete brand ramp on the remaining fraction (low-sat felt/brass/ivory
        // palette): plenty of time = brass, past half = amber, final fifth = alert red.
        setStrokeColor(percent > 0.5 ? "#cda24b" : percent > 0.2 ? "#e0a64b" : "#b3162a");
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
                {isActive && showTurnTimer ? <svg className={`timer-ring ${timeLeft <= LOW_TIME_MS ? "timer-low" : ""}`} width="100" height="100" viewBox="0 0 100 100">
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
                    {/* Remaining whole seconds as a non-color (colorblind-safe) cue.
                        The ring is rotated -90deg in CSS, so .timer-seconds
                        counter-rotates in CSS to keep the text upright. */}
                    <text
                        className="timer-seconds"
                        x="50"
                        y="50"
                        textAnchor="middle"
                        dominantBaseline="central"
                        aria-hidden="true"
                    >{Math.ceil(timeLeft / 1000)}</text>
                </svg> : ''}
                <span className="username">{name}</span>
                <span className="tile-count">{tiles}</span>
            </div>
        </div>
    );
};

export default PlayerAvatarWithTimer;
