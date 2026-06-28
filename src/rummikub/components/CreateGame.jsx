import GameLobbyClient from "../lobbyClient";
import {useState} from "react";
import {useNavigate} from "react-router-dom"
import {FRONTEND_ADDR, IS_DEV, LOBBY_SERVER_PROTO} from "../constants";
import {copyToClipboard} from "./domUtil";

const USERNAME_KEY = 'rummycube:username'

function readSavedName() {
    try {
        return localStorage.getItem(USERNAME_KEY) || ''
    } catch (e) {
        return ''
    }
}

const CreateGameForm = function () {
    const client = new GameLobbyClient()
    const navigate = useNavigate()
    const [savedName] = useState(readSavedName)
    const [username, setUsername] = useState(() => readSavedName() || (IS_DEV ? 'test' : ''))
    const [numPlayers, setNumPlayers] = useState(IS_DEV ? '2' : '4')
    const [matchID, setMatchID] = useState('')
    const [timePerTurn, setTimePerTurn] = useState(IS_DEV ? '30' : '30')
    const [copied, setCopied] = useState(false)
    const [mode, setMode] = useState('classic')

    function buildMatchLink(id) {
        return `${LOBBY_SERVER_PROTO}://${FRONTEND_ADDR}/join-match/${id}`
    }

    function onGameCreate(event) {
        event.preventDefault();
        // remember the name so returning players don't re-enter it
        try { localStorage.setItem(USERNAME_KEY, username); } catch (e) { /* private mode / no storage: skip persisting */ }
        // "0" players = solo test mode -> a real single-player game (no second
        // browser needed); any other value is a normal multiplayer match.
        const actualNumPlayers = numPlayers === '0' ? '1' : numPlayers;
        client.createGame(actualNumPlayers, timePerTurn, mode === 'chaos').then(
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
                {savedName && <p className="lobby-welcome">Welcome back, {savedName} 👋</p>}
            </div>

            <div className="lobby-field">
                <span className="mode-label">Game mode</span>
                <div className="mode-row" role="group" aria-label="Game mode">
                    <button
                        type="button"
                        className={mode === 'classic' ? 'mode-opt on' : 'mode-opt'}
                        aria-pressed={mode === 'classic'}
                        onClick={() => setMode('classic')}>
                        <span className="ic" aria-hidden="true">♟️</span>
                        <b>Classic</b>
                        <span className="en">Original rules</span>
                    </button>
                    <button
                        type="button"
                        className={mode === 'chaos' ? 'mode-opt on' : 'mode-opt'}
                        aria-pressed={mode === 'chaos'}
                        onClick={() => setMode('chaos')}>
                        <span className="badge">NEW</span>
                        <span className="ic" aria-hidden="true">🌀</span>
                        <b>Chaos</b>
                        <span className="en">Ability deck</span>
                    </button>
                </div>
                {mode === 'chaos' &&
                    <div className="coach">
                        <p className="obj">🌀 Chaos mode — what’s new</p>
                        <ul>
                            <li><b>Ability</b> cards in three rarities (White / Blue / Gold) — one-time use, hidden from rivals.</li>
                            <li>A <b>public random Wheel</b> that fires on big plays — a little luck for the whole table.</li>
                            <li><b>Joker “bombs”</b>: disturb a joker set and it may scatter across the board.</li>
                            <li><b>Bluff &amp; challenge</b>: play any card face-down and claim it’s something else.</li>
                            <li>Everything else is <b>classic Rummikub</b> — first to empty their rack still wins.</li>
                        </ul>
                    </div>}
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