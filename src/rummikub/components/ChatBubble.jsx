import React from "react";
import "./chat.css";

// A transient speech bubble anchored to a player's avatar circle. `side` is the
// side of the avatar the bubble sits on and the direction its tail points:
// up = above (tail down), down = below, left = to the avatar's left, right = to
// the avatar's right. The outer .chat-bubble only positions; the inner
// .chat-bubble-box is the visible, animated box (so the enter scale never fights
// the positioning transform). Decorative echo of the chat box -> aria-hidden and
// never intercepts pointer events.
export default function ChatBubble({text, side = "up", leaving = false}) {
    return (
        <div className={`chat-bubble chat-bubble-${side} ${leaving ? "leaving" : ""}`} aria-hidden="true">
            <div className="chat-bubble-box">{text}</div>
        </div>
    );
}
