import React, {useEffect, useRef, useState} from "react";
import {catAvatarUrl} from "../avatars/catAvatar";
import {QUICK_PHRASES, CHAT_EMOJI, MAX_CHAT_LEN, sanitizeChatText} from "../chat/quickChat";
import "./chat.css";

const TYPING_PING_MS = 2000;   // throttle outgoing "typing" pings
const TYPING_SHOW_MS = 3000;   // show "X is typing" for this long after the last ping
const TYPING_FRESH_MS = 5000;  // ignore stale pings (e.g. replayed on reconnect)
const MAX_VISIBLE = 60;        // cap rendered history so the DOM never grows unbounded

// Always-on, translucent chat in the top-right. Quick phrases + emoji live in
// pop-up sub-menus to keep the box clean. Fed boardgame.io's built-in chat;
// "typing" pings ({typing, ts}) are filtered out of the list and drive the
// typing indicator.
export default function ChatPanel({chatMessages, sendChatMessage, matchData, matchID, playerID}) {
    const messages = chatMessages || [];
    const [draft, setDraft] = useState("");
    const [menu, setMenu] = useState(null); // null | 'emoji' | 'phrases'
    const [typers, setTypers] = useState({});
    const [open, setOpen] = useState(false); // narrow-screen FAB: collapsed by default
    const [unread, setUnread] = useState(false);
    const listRef = useRef(null);
    const seenRef = useRef(0);
    const unreadRef = useRef(0);
    const lastPingRef = useRef(0);

    useEffect(() => {
        for (let i = seenRef.current; i < messages.length; i++) {
            const m = messages[i];
            if (!m || String(m.sender) === String(playerID)) continue;
            const p = m.payload || {};
            if (p.typing) {
                if (typeof p.ts === "number" && Date.now() - p.ts < TYPING_FRESH_MS) {
                    setTypers(t => ({...t, [m.sender]: Date.now() + TYPING_SHOW_MS}));
                }
            } else if (typeof p.text === "string") {
                setTypers(t => { const n = {...t}; delete n[m.sender]; return n; });
            }
        }
        seenRef.current = messages.length;
    }, [messages.length, playerID]);

    useEffect(() => {
        if (!Object.keys(typers).length) return;
        const id = setInterval(() => {
            setTypers(t => {
                const now = Date.now();
                let changed = false;
                const n = {};
                for (const k in t) { if (t[k] > now) n[k] = t[k]; else changed = true; }
                return changed ? n : t;
            });
        }, 500);
        return () => clearInterval(id);
    }, [typers]);

    const shown = messages.filter(m => m && m.payload && typeof m.payload.text === "string");
    const visible = shown.slice(-MAX_VISIBLE);

    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [shown.length]);

    // Unread dot on the collapsed FAB: while closed, light it when new messages
    // arrive; opening the panel marks everything seen.
    useEffect(() => {
        if (open) {
            unreadRef.current = shown.length;
            setUnread(false);
        } else if (shown.length > unreadRef.current) {
            setUnread(true);
        }
    }, [shown.length, open]);

    if (typeof sendChatMessage !== "function") return null;

    const nameFor = (sender) =>
        (matchData && matchData[sender] && matchData[sender].name) || `Player ${Number(sender) + 1}`;

    function send(text) {
        const t = sanitizeChatText(text);
        if (!t) return;
        lastPingRef.current = 0;
        sendChatMessage({text: t});
    }

    function onInput(e) {
        const v = e.target.value;
        setDraft(v);
        const now = Date.now();
        if (v && now - lastPingRef.current > TYPING_PING_MS) {
            lastPingRef.current = now;
            sendChatMessage({typing: true, ts: now});
        }
    }

    function onSubmit(e) {
        e.preventDefault();
        send(draft);
        setDraft("");
        setMenu(null);
    }

    function addEmoji(em) {
        setDraft(d => (d + em).slice(0, MAX_CHAT_LEN));
    }

    function sendPhrase(p) {
        send(p);
        setMenu(null);
    }

    const toggleMenu = (which) => setMenu(m => (m === which ? null : which));

    const typingNames = Object.keys(typers)
        .filter(s => String(s) !== String(playerID))
        .map(nameFor);
    const typingLabel = typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : typingNames.length > 1
            ? `${typingNames.slice(0, 2).join(", ")}${typingNames.length > 2 ? " +" : ""} are typing…`
            : "";

    return (
        <div className={`chat-root ${open ? "open" : ""}`}>
            <button type="button"
                    className={`chat-fab ${unread ? "unread" : ""}`}
                    onClick={() => setOpen(o => !o)}
                    aria-label="Open chat" aria-expanded={open} title="Chat">
                <span aria-hidden="true">💬</span>
                {unread && <span className="chat-fab-dot" aria-hidden="true"/>}
            </button>

            <div className="chat-panel">
                <div className="chat-head">
                    <span>Chat</span>
                    <button type="button" className="chat-close"
                            onClick={() => setOpen(false)}
                            aria-label="Close chat" title="Close chat">✕</button>
                </div>

                <div className="chat-messages" ref={listRef}>
                    {visible.length === 0 && <div className="chat-empty">Say hi 👋</div>}
                    {visible.map((m) => {
                        const isOwn = String(m.sender) === String(playerID);
                        return (
                            <div key={m.id} className={`chat-msg ${isOwn ? "own" : ""}`}>
                                <span className="chat-msg-avatar"
                                      style={{backgroundImage: `url(${catAvatarUrl(matchID, m.sender)})`}}
                                      aria-hidden="true"/>
                                <span className="chat-msg-body">
                                    <span className="chat-msg-name">{nameFor(m.sender)}</span>
                                    <span className="chat-msg-text">{m.payload.text}</span>
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className={`chat-typing ${typingLabel ? "on" : ""}`}>
                    {typingLabel && (<><span className="chat-typing-dots"><i/><i/><i/></span>{typingLabel}</>)}
                </div>

                <form className="chat-input" onSubmit={onSubmit}>
                    <button type="button" className={`chat-menu-btn ${menu === 'phrases' ? 'on' : ''}`}
                            onClick={() => toggleMenu('phrases')} title="Quick phrases" aria-label="Quick phrases">💬</button>
                    <button type="button" className={`chat-menu-btn ${menu === 'emoji' ? 'on' : ''}`}
                            onClick={() => toggleMenu('emoji')} title="Emoji" aria-label="Emoji">😊</button>
                    <input type="text" value={draft} maxLength={MAX_CHAT_LEN}
                           onChange={onInput}
                           placeholder="Type a message…" aria-label="Chat message"/>
                    <button type="submit" className="chat-send" disabled={!draft.trim()}>Send</button>
                </form>
            </div>

            {menu === 'phrases' && (
                <div className="chat-pop chat-pop-phrases">
                    {QUICK_PHRASES.map(p => (
                        <button type="button" key={p} className="chat-chip" onClick={() => sendPhrase(p)}>{p}</button>
                    ))}
                </div>
            )}
            {menu === 'emoji' && (
                <div className="chat-pop chat-pop-emoji">
                    {CHAT_EMOJI.map(em => (
                        <button type="button" key={em} className="chat-emoji-btn" onClick={() => addEmoji(em)} aria-label={`emoji ${em}`}>{em}</button>
                    ))}
                </div>
            )}
        </div>
    );
}
