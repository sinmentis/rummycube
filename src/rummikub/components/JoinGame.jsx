import {useState} from "react";
import {useNavigate} from "react-router-dom";
import GameLobbyClient from "../lobbyClient";

const JoinGameForm = function () {
    const client = new GameLobbyClient()
    const navigate = useNavigate()
    const [username, setUsername] = useState('')
    const [matchID, setMatchID] = useState('')
    const [seats, setSeats] = useState([])

    function onMatchIDChange(matchID) {
        setMatchID(matchID)
        client.listSeats(matchID).then((matchData) => {
            console.debug(matchData.players)
            setSeats(matchData.players)
        }, (value) => {
            setSeats([])
        })
    }

    function onJoinMatch(event) {
        event.preventDefault();
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
        <form className="lobby-form-inner" onSubmit={onJoinMatch}>
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
            <div className="lobby-field">
                <label htmlFor="formMatchID">Room code</label>
                <input
                    id="formMatchID"
                    className="lobby-input"
                    value={matchID}
                    onChange={(e) => {
                        onMatchIDChange(e.target.value)
                    }}
                    type="text"
                    placeholder="Enter match ID"
                />
            </div>

            <button
                type="submit"
                className="lobby-btn lobby-btn-primary"
                disabled={!username || !matchID || (seats.length && seats.every(seat => seat.name))}>
                Join
            </button>
            <div className="lobby-seats">
                {seats.length ? seats.map((seat) => {
                    return <div key={seat.id}
                                className={`seat-status ${seat.name ? 'seat-filled' : 'seat-vacant'}`}>
                        {seat.name ? `Player ${seat.name} has joined` : `Seat ${seat.id + 1} is open`}
                    </div>
                }) : (matchID ? <span className="seat-status seat-error">Match not found</span>
                              : <span className="seat-status seat-hint">Enter a room code to see open seats</span>)}
            </div>
            {(seats.length && seats.every(seat => seat.name)) ?
                <div className="seat-status seat-error">No slots left</div> : ''}
        </form>
    )
}

export default JoinGameForm