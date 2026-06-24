import React, {useEffect} from "react";
import confetti from "canvas-confetti";
import {play} from "../sound/sfx";
import "./GameOverModal.css";
import {FRONTEND_PORT, LOBBY_SERVER_HOST, LOBBY_SERVER_PROTO} from "../constants";
import {copyToClipboard} from "../util";
import GameLobbyClient from "../lobbyClient";
import {useNavigate} from "react-router-dom";
import shuffle from "lodash/shuffle.js";

const GameOverModal = ({gameover, matchId, playerID, matchData}) => {
    const client = new GameLobbyClient()
    const navigate = useNavigate()

    useEffect(() => {
        play('win');
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const end = Date.now() + 1200;
        (function frame() {
            confetti({particleCount: 4, angle: 60, spread: 55, startVelocity: 45, origin: {x: 0, y: 0.7}});
            confetti({particleCount: 4, angle: 120, spread: 55, startVelocity: 45, origin: {x: 1, y: 0.7}});
            if (Date.now() < end) requestAnimationFrame(frame);
        })();
    }, []);


    function onPlayAgain(event) {
        event.preventDefault();
        const token = sessionStorage.getItem("authToken");
        client.playAgain(matchId, {playerID: playerID, credentials: token}).then(
            (result) => {
                let hostAddr = `${LOBBY_SERVER_HOST}:${FRONTEND_PORT}`
                let matchLink = `${LOBBY_SERVER_PROTO}://${hostAddr}/join-match/${result.nextMatchID}`
                let username = matchData[parseInt(playerID)].name;
                copyToClipboard(matchLink)
                console.debug(result.nextMatchID)
                client.listSeats(result.nextMatchID).then(matchData => {
                    let seat = 0
                    console.debug(matchData)
                    for (let playerSeat of shuffle(matchData.players)) {
                        if (!playerSeat.name) {
                            seat = playerSeat.id
                            break
                        }
                    }
                    client.joinGame(result.nextMatchID, username, seat).then((playerCreds) => {
                        navigate(`/match/${result.nextMatchID}`, {
                            state: {
                                username: username,
                                creds: playerCreds,
                                playerID: seat,
                            },
                        })
                    })
                }, error => {
                    console.debug(error)
                })
            }
        )
    }

    function onBackHome() {
        try { localStorage.removeItem(`rummycube:match:${matchId}`); } catch (e) {}
        navigate('/');
    }

    return (
        <div className="gameover-backdrop">
            <div className="gameover-modal">
                <h2 className="gameover-title">🎉 Congratulations {matchData[parseInt(gameover.winner)].name}! 🎉</h2>
                <p className="gameover-points">Total
                    Points: <strong>{gameover.points[parseInt(gameover.winner)]}</strong></p>
                <ul className="gameover-score-list">
                    {Object.entries(gameover.points)
                        .sort((a, b) => b[0] - a[0])
                        .map((data) => (
                            <li key={data[0]} className="gameover-score-item">
                                {matchData[parseInt(data[0])].name} <strong>{data[1]} pts</strong>
                            </li>
                        ))}
                </ul>

                <div className="gameover-actions">
                    <button className="gameover-button" onClick={onPlayAgain}>
                        🔁 Play Again
                    </button>
                    <button className="gameover-button gameover-button--secondary" onClick={onBackHome}>
                        Back to home
                    </button>
                </div>
            </div>
        </div>

    );
};

export default GameOverModal;
