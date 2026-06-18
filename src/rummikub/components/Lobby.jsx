import {useState} from "react";
import CreateGameForm from "./CreateGame";
import JoinGameForm from "./JoinGame";
import ServerStats from "./ServerStats";
import "./lobby.css";


export const GameLobby = function () {
    const [showCreateForm, setToggle] = useState(true)

    return (
        <div className='lobby-page'>
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