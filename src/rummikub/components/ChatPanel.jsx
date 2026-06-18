import React, {useEffect, useRef, useState} from "react";
import {catAvatarUrl} from "../avatars/catAvatar";
import {QUICK_PHRASES, CHAT_EMOJI, MAX_CHAT_LEN, sanitizeChatText} from "../chat/quickChat";
import "./chat.css";

// In-match chat. Fed boardgame.io's built-in chatMessages/sendChatMessage. Each
// message is {id, sender, payload:{text}} where sender is the seat/playerID, so
// we resolve the name from matchData and the kitten from catAvatarUrl.
export default function ChatPanel({chatMessages, sendChatMessage, matchData, matchID, playerID}) {
    const messages = chatMessages || [];
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [lastSeen, setLastSeen] = useState(0);
    const listRef = useRef(null);

    useEffect(() => {
        if (open) {
            setLastSeen(messages.length);
            if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages.length, open]);

    if (typeof sendChatMessage !== "function") return null; // chat transport unavailable

    const unread = open ? 0 : Math.max(0, messages.length - lastSeen);
    const nameFor = (sender) =>
        (matchData && matchData[sender] && matchData[sender].name) || `Player ${Number(sender) + 1}`;

    function send(text) {
        const t = sanitizeChatText(text);
        if (!t) return;
        sendChatMessage({text: t});
    }

    function onSubmit(e) {
        e.preventDefault();
        send(draft);
        setDraft("");
    }

    function addEmoji(em) {
        setDraft(d => (d + em).slice(0, MAX_CHAT_LEN));
    }

    return (
        <div className={`chat-root ${open ? "open" : ""}`}>
            <button type="button" className="chat-toggle" onClick={() => setOpen(o => !o)} aria-label="Toggle chat">
                <span aria-hidden="true">💬</span>
                {unread > 0 && <span className="chat-unread">{unread > 9 ? "9+" : unread}</span>}
            </button>

            {open && (
                <div className="chat-panel">
                    <div className="chat-head">
                        <span>Chat</span>
                        <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
                    </div>

                    <div className="chat-messages" ref={listRef}>
                        {messages.length === 0 && <div className="chat-empty">Say hi 👋</div>}
                        {messages.map((m) => {
                            const isOwn = String(m.sender) === String(playerID);
                            const text = m.payload && typeof m.payload.text === "string" ? m.payload.text : "";
                            return (
                                <div key={m.id} className={`chat-msg ${isOwn ? "own" : ""}`}>
                                    <span className="chat-msg-avatar"
                                          style={{backgroundImage: `url(${catAvatarUrl(matchID, m.sender)})`}}
                                          aria-hidden="true"/>
                                    <span className="chat-msg-body">
                                        <span className="chat-msg-name">{nameFor(m.sender)}</span>
                                        <span className="chat-msg-text">{text}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="chat-quick">
                        {QUICK_PHRASES.map(p => (
                            <button type="button" key={p} className="chat-chip" onClick={() => send(p)}>{p}</button>
                        ))}
                    </div>

                    <div className="chat-emoji">
                        {CHAT_EMOJI.map(em => (
                            <button type="button" key={em} className="chat-emoji-btn" onClick={() => addEmoji(em)} aria-label={`emoji ${em}`}>{em}</button>
                        ))}
                    </div>

                    <form className="chat-input" onSubmit={onSubmit}>
                        <input type="text" value={draft} maxLength={MAX_CHAT_LEN}
                               onChange={e => setDraft(e.target.value)}
                               placeholder="Type a message…" aria-label="Chat message"/>
                        <button type="submit" className="chat-send" disabled={!draft.trim()}>Send</button>
                    </form>
                </div>
            )}
        </div>
    );
}
