import {useState, useEffect} from "react";
import {useNavigate, useParams} from "react-router-dom";
import GameLobbyClient from "../lobbyClient";
import {IS_DEV} from "../constants";
import "./lobby.css";

const JoinGamePage = function () {
    let {matchID} = useParams();
    const client = new GameLobbyClient()
    const navigate = useNavigate()
    const [username, setUsername] = useState(IS_DEV ? 'test2' : '')
    const [seats, setSeats] = useState([])

    useEffect(function () {
        client.listSeats(matchID).then((matchData) => {
            console.debug(matchData.players)
            setSeats(matchData.players)
        }, (value) => {
            setSeats([])
        })
    }, [matchID])

    function onJoinMatch(event) {
        event.preventDefault()
        client.listSeats(matchID).then(matchData => {
            let seat = 0
            console.debug(matchData)
            for (let playerSeat of matchData.players) {
                if (!playerSeat.name) {
                    seat = playerSeat.id
                    break
                }
            }
            client.joinGame(matchID, username, seat).then((playerCreds) => {
                navigate(`/match/${matchID}`, {
                    state: {
                        username: username,
                        numPlayers: matchData.players.length,
                        creds: playerCreds,
                        playerID: seat,
                    },
                })
            })
        }, error => {
            console.debug(error)
        })
    }

    return (
        <div className='lobby-page'>
            <div className="lobby-card">
                <form className="lobby-form-inner" onSubmit={onJoinMatch}>
                    <div className="lobby-room-banner">
                        <span className="room-share-label">You're invited — room</span>
                        <span className="room-code">{matchID}</span>
                    </div>
                    <div className="lobby-field">
                        <label htmlFor="formUsername">Username</label>
                        <input
                            id="formUsername"
                            className="lobby-input"
                            value={username}
                            onChange={(e) => {
                                setUsername(e.target.value)
                            }}
                            type="text"
                            placeholder="Enter username"
                        />
                    </div>
                    <button
                        type="submit"
                        className="lobby-btn lobby-btn-primary"
                        disabled={!username || seats.every(seat => seat.name)}>
                        Join
                    </button>
                    <div className="lobby-seats">
                        {seats.length ? seats.map((seat) => {
                            return <div key={seat.id}
                                        className={`seat-status ${seat.name ? 'seat-filled' : 'seat-vacant'}`}>
                                {seat.name ? `Player ${seat.name} has joined` : `Seat ${seat.id + 1} is open`}
                            </div>
                        }) : <span className="seat-status seat-error">Match not found</span>}
                    </div>
                    {seats.every(seat => seat.name) ?
                        <div className="seat-status seat-error">No slots left</div> : ''}
                </form>
            </div>
        </div>
    )
}

export default JoinGamePage