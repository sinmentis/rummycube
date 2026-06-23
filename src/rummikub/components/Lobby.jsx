import {useState} from "react";
import CreateGameForm from "./CreateGame";
import JoinGameForm from "./JoinGame";
import ServerStats from "./ServerStats";
import "./lobby.css";


export const GameLobby = function () {
    const [showCreateForm, setToggle] = useState(true)

    return (
        <div className='lobby-page'>
            <div className="lobby-hero">
                <h1 className="lobby-hero-title">RummyCube</h1>
                <p className="lobby-hero-tagline">Play rummy tiles with friends in your browser.</p>
                <ul className="lobby-hero-points">
                    <li>Create a room and share the code, or join with a friend's code.</li>
                    <li>Build runs and sets, then race to empty your rack first.</li>
                    <li>New here? Hit "How to play" up top for the quick rules.</li>
                </ul>
            </div>
            <div className="lobby-card">
                <div className="lobby-tabs">
                    <button onClick={() => setToggle(true)}
                            className={`lobby-tab ${showCreateForm ? 'active' : ''}`}>
                        Create game
                    </button>
                    <button onClick={() => setToggle(false)}
                            className={`lobby-tab ${showCreateForm ? '' : 'active'}`}>
                        Join game
                    </button>
                </div>
                <div className="lobby-body">
                    {showCreateForm ? <CreateGameForm/> : <JoinGameForm/>}
                </div>
            </div>
            <ServerStats/>
        </div>
    )
}

export default GameLobby