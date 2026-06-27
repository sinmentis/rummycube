import {useEffect, useRef, useState} from "react";

const DEFAULT_TTL_MS = 5000;
const EXIT_MS = 200; // CSS fade-out window before the bubble is removed

// Derives the transient per-seat "speech bubble" from boardgame.io's chat log.
// Only text messages that ARRIVE while mounted bubble (history present at mount
// is marked seen, so a reconnect/replay never storms the table). The latest
// message for a seat replaces any earlier one and resets its TTL.
export function useChatBubbles(chatMessages, {ttlMs = DEFAULT_TTL_MS} = {}) {
    const messages = chatMessages || [];
    const [bubbles, setBubbles] = useState({}); // {[seat]: {id, text, leaving}}
    const seenRef = useRef(null);               // # of messages already processed
    const timersRef = useRef({});               // {[seat]: {hide, remove}}

    useEffect(() => {
        if (seenRef.current === null) {          // first run: skip existing history
            seenRef.current = messages.length;
            return;
        }
        for (let i = seenRef.current; i < messages.length; i++) {
            const m = messages[i];
            const p = (m && m.payload) || {};
            if (typeof p.text !== "string" || !p.text) continue; // ignore typing/non-text
            const seat = String(m.sender);
            const prev = timersRef.current[seat];
            if (prev) { clearTimeout(prev.hide); clearTimeout(prev.remove); }
            setBubbles(b => ({...b, [seat]: {id: m.id, text: p.text, leaving: false}}));
            const hide = setTimeout(() => {
                setBubbles(b => (b[seat] ? {...b, [seat]: {...b[seat], leaving: true}} : b));
            }, ttlMs);
            const remove = setTimeout(() => {
                setBubbles(b => { const n = {...b}; delete n[seat]; return n; });
                delete timersRef.current[seat];
            }, ttlMs + EXIT_MS);
            timersRef.current[seat] = {hide, remove};
        }
        seenRef.current = messages.length;
    }, [messages.length, ttlMs]);

    useEffect(() => () => {
        Object.values(timersRef.current).forEach(t => { clearTimeout(t.hide); clearTimeout(t.remove); });
    }, []);

    return bubbles;
}
