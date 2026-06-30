import React, {useState} from 'react';
import {snapshotBugLog} from '../bugLog';
import './board.css';

export default function ReportBugButton({matchID, playerID, G, ctx, matchData}) {
    const [status, setStatus] = useState('');

    async function report() {
        setStatus('Saving...');
        const payload = {
            matchID,
            playerID,
            matchData,
            snapshot: {G, ctx},
            client: {
                url: window.location.href,
                userAgent: navigator.userAgent,
                viewport: {width: window.innerWidth, height: window.innerHeight},
                logs: snapshotBugLog(),
            },
        };
        try {
            const res = await fetch('/api/bug-report', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            setStatus(`Saved ${body.filename}`);
        } catch (e) {
            setStatus('Bug report failed');
        }
    }

    return (
        <div className="bug-report">
            <button type="button" className="bug-report-btn" onClick={report}>Report bug</button>
            {status && <span className="bug-report-status" role="status">{status}</span>}
        </div>
    );
}
