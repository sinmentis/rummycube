import {useState} from "react";
import {useNavigate} from "react-router-dom";
import GameLobbyClient from "../lobbyClient";
import LobbySeat from "./LobbySeat";
import {extractMatchId} from "../matchId";

const JoinGameForm = function () {
    const client = new GameLobbyClient()
    const navigate = useNavigate()
    const [username, setUsername] = useState('')
    const [matchID, setMatchID] = useState('')
    const [seats, setSeats] = useState([])

    function onMatchIDChange(matchID) {
        setMatchID(matchID)
        client.listSeats(extractMatchId(matchID)).then((matchData) => {
            console.debug(matchData.players)
            setSeats(matchData.players)
        }, (value) => {
            setSeats([])
        })
    }

    function onJoinMatch(event) {
        event.preventDefault();
        const resolvedMatchID = extractMatchId(matchID)
        client.listSeats(resolvedMatchID).then(matchData => {
            let seat = 0
            console.debug(matchData)
            for (let playerSeat of matchData.players) {
                if (!playerSeat.name) {
                    seat = playerSeat.id
                    break
                }
            }
            client.joinGame(resolvedMatchID, username, seat).then((playerCreds) => {
                navigate(`/match/${resolvedMatchID}`, {
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
                    placeholder="Room code or invite link"
                />
            </div>

            <button
                type="submit"
                className="lobby-btn lobby-btn-primary"
                disabled={!username || !matchID || (seats.length && seats.every(seat => seat.name))}>
                Join
            </button>
            <div className="lobby-seats">
                {seats.length ? seats.map((seat) => (
                    <LobbySeat key={seat.id} matchId={matchID} seat={seat}/>
                )) : (matchID ? <span className="seat-status seat-error">Match not found</span>
                              : <span className="seat-status seat-hint">Enter a room code to see open seats</span>)}
            </div>
            {(seats.length && seats.every(seat => seat.name)) ?
                <div className="seat-status seat-error">No slots left</div> : ''}
        </form>
    )
}

export default JoinGameForm