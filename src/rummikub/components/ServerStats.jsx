import React, {useEffect, useState} from "react";
import GameLobbyClient from "../lobbyClient";

// Live server activity for the homepage. Polls the counts-only /api/stats
// endpoint (no match IDs or names) every few seconds.
export default function ServerStats() {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        const client = new GameLobbyClient();
        let alive = true;
        const tick = async () => {
            try {
                const s = await client.getStats();
                if (alive) setStats(s);
            } catch (e) { /* keep showing the last good value */ }
        };
        tick();
        const id = setInterval(tick, 5000);
        return () => { alive = false; clearInterval(id); };
    }, []);

    const show = (n) => (stats && typeof n === 'number' ? n : '–');

    return (
        <div className="server-stats" aria-live="polite">
            <div className="stat">
                <span className="stat-num">{show(stats && stats.inProgress)}</span>
                <span className="stat-label">games in progress</span>
            </div>
            <div className="stat">
                <span className="stat-num">{show(stats && stats.waiting)}</span>
                <span className="stat-label">rooms waiting</span>
            </div>
            <div className="stat">
                <span className="stat-num">{show(stats && stats.players)}</span>
                <span className="stat-label">players online</span>
            </div>
        </div>
    );
}
