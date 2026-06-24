import React from "react";
import "./coachCard.css";

// S2-U11 / T2-2: one-time first-turn coaching. Shown only on the player's very
// first turn of a match; dismissing it persists a localStorage flag (handled by
// the parent) so it never reappears. Anchored near the action area and kept
// compact so it never covers the board.
export default function CoachCard({onDismiss}) {
    return (
        <div className="coach-card" role="note" aria-label="First turn tips">
            <button
                type="button"
                className="coach-card-close"
                aria-label="Dismiss tips"
                onClick={onDismiss}>
                &times;
            </button>
            <div className="coach-card-body">
                <p className="coach-card-objective">
                    Be first to empty your rack.
                </p>
                <p className="coach-card-rule">
                    Your first meld must total at least 30 points in runs/sets.
                </p>
                <p className="coach-card-rule">
                    When the ring runs out, you draw a tile and your turn passes.
                </p>
                <p className="coach-card-pointer">
                    Stuck? Turn on 💡 Hints below.
                </p>
            </div>
            <button
                type="button"
                className="coach-card-confirm"
                onClick={onDismiss}>
                Got it
            </button>
        </div>
    );
}
