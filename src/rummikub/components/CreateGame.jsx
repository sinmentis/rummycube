import GameLobbyClient from "../lobbyClient";
import {useState} from "react";
import {useNavigate} from "react-router-dom"
import {FRONTEND_ADDR, IS_DEV, LOBBY_SERVER_PROTO} from "../constants";
import {copyToClipboard} from "../util";

const CreateGameForm = function () {
    const client = new GameLobbyClient()
    const navigate = useNavigate()
    const [username, setUsername] = useState(IS_DEV ? 'test' : '')
    const [numPlayers, setNumPlayers] = useState(IS_DEV ? '2' : '4')
    const [matchID, setMatchID] = useState('')
    const [timePerTurn, setTimePerTurn] = useState(IS_DEV ? '30' : '30')
    const [copied, setCopied] = useState(false)

    function buildMatchLink(id) {
        return `${LOBBY_SERVER_PROTO}://${FRONTEND_ADDR}/join-match/${id}`
    }

    function onGameCreate(event) {
        event.preventDefault();
        // "0" players = solo test mode -> a real single-player game (no second
        // browser needed); any other value is a normal multiplayer match.
        const actualNumPlayers = numPlayers === '0' ? '1' : numPlayers;
        client.createGame(actualNumPlayers, timePerTurn).then(
            (id) => {
                let matchLink = buildMatchLink(id)
                copyToClipboard(matchLink)
                console.debug(id)
                setMatchID(id)
                client.joinGame(id, username).then((playerCreds) => {
                    navigate(`/match/${id}`, {
                        state: {
                            username: username,
                            numPlayers: actualNumPlayers,
                            creds: playerCreds,
                            playerID: '0',
                        }
                    })
                })
            }
        )
    }

    function onCopyLink() {
        copyToClipboard(buildMatchLink(matchID))
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <form className="lobby-form-inner" onSubmit={onGameCreate}>
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
                    autoFocus
                    placeholder="Enter username"/>
            </div>

            <div className="lobby-field">
                <label htmlFor="formNumPlayers">Number of players</label>
                <select
                    id="formNumPlayers"
                    className="lobby-input"
                    value={numPlayers}
                    onChange={(e) => {
                        setNumPlayers(e.target.value)
                    }}>
                    <option value="0">0 · solo test</option>
                    <option>2</option>
                    <option>3</option>
                    <option>4</option>
                </select>
            </div>

            <div className="lobby-field">
                <label htmlFor="timePerTurn">Time per turn, in seconds</label>
                <select
                    id="timePerTurn"
                    className="lobby-input"
                    value={timePerTurn}
                    onChange={(e) => {
                        setTimePerTurn(e.target.value)
                    }}>
                    <option>10</option>
                    <option>20</option>
                    <option>30</option>
                    <option>40</option>
                    <option>50</option>
                    <option>60</option>
                    {IS_DEV && <option>3600</option>}
                </select>
            </div>

            <button
                type="submit"
                className="lobby-btn lobby-btn-primary"
                disabled={!username || !numPlayers}>
                Create
            </button>
            {!username && <p className="lobby-hint">Enter a username to start.</p>}

            {matchID ?
                <div className="room-share">
                    <span className="room-share-label">Game created — room code</span>
                    <div className="room-share-row">
                        <span className="room-code">{matchID}</span>
                        <button type="button" className="lobby-btn lobby-btn-copy" onClick={onCopyLink}>
                            {copied ? 'Copied!' : 'Copy link'}
                        </button>
                    </div>
                </div> : null}
        </form>
    )
}

export default CreateGameForm