import React, {useEffect, useState} from "react";
import "./HowToPlay.css";
import {HOW_TO_PLAY_RULES, HOW_TO_PLAY_TITLE} from "./howToPlayContent";

export default function HowToPlay() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    return (
        <>
            <button
                type="button"
                className="howto-trigger"
                aria-haspopup="dialog"
                onClick={() => setOpen(true)}>
                How to play
            </button>

            {open && (
                <div
                    className="howto-backdrop"
                    onClick={() => setOpen(false)}>
                    <div
                        className="howto-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={HOW_TO_PLAY_TITLE}
                        onClick={(e) => e.stopPropagation()}>
                        <div className="howto-header">
                            <h2 className="howto-title">{HOW_TO_PLAY_TITLE}</h2>
                            <button
                                type="button"
                                className="howto-close"
                                aria-label="Close"
                                onClick={() => setOpen(false)}>
                                &times;
                            </button>
                        </div>
                        <dl className="howto-rules">
                            {HOW_TO_PLAY_RULES.map((rule) => (
                                <div className="howto-rule" key={rule.term}>
                                    <dt className="howto-rule-term">{rule.term}</dt>
                                    <dd className="howto-rule-text">{rule.text}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </div>
            )}
        </>
    );
}
