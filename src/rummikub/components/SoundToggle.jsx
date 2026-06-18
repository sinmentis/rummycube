import React, {useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faVolumeHigh, faVolumeXmark} from "@fortawesome/free-solid-svg-icons";
import {isMuted, toggleMuted} from "../sound/sfx";

export default function SoundToggle() {
    const [muted, setMuted] = useState(isMuted());
    return (
        <button
            type="button"
            className="sound-toggle"
            title={muted ? "Unmute" : "Mute"}
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => setMuted(toggleMuted())}>
            <FontAwesomeIcon icon={muted ? faVolumeXmark : faVolumeHigh}/>
        </button>
    );
}
