import React, {useState} from 'react';
import {TilePreview} from './Tile';
import './abilities.css';

// SP1b T5: the round-long peek reveal. After a peek resolves server-side,
// playerView (chaos) leaks the target's hand tiles into G.tilePositions for the
// viewer only; this panel surfaces exactly those tiles and nothing else.
//
// Privacy is the whole point: it filters tilePositions to the *target's* hand
// rack (gridId 'h' + playerID === targetID) and renders only those — never the
// viewer's own tiles, never a non-target's. It reuses TilePreview with only the
// tile id (no position/bounds), so TilePreview skips its on-board bounds check
// and just draws the .tile face (see Tile.jsx).
//
// The reveal is pinned for the whole round (Board renders it while
// G.peekGrants[viewer] holds) and is collapsible: the fold button tucks it to a
// slim re-openable tab. No countdown, so it reads identically under reduce-motion.
export default function PeekPanel({viewerID, targetID, tilePositions}) {
    const [folded, setFolded] = useState(false);
    // No target, or somehow pointed at yourself -> render nothing. The self guard
    // is defence-in-depth for the privacy rule: this panel never shows the
    // viewer's own rack.
    if (targetID == null || String(targetID) === String(viewerID)) return null;

    const tiles = Object.values(tilePositions || {})
        .filter((p) => p && p.gridId === 'h' && String(p.playerID) === String(targetID))
        .sort((a, b) => (a.row - b.row) || (a.col - b.col));

    return (
        <div className={'peek-panel' + (folded ? ' folded' : '')}>
            <div className="peek-phead">
                <span className="eye" aria-hidden="true">👁️</span>
                <span className="ttl">Peeked rack<small>visible to you only</small></span>
                <button type="button" className="peek-fold" aria-label="Fold"
                        onClick={() => setFolded(true)}>▾</button>
            </div>
            <div className="peek-pbody">
                <div className="peek-rack">
                    {tiles.map((pos) => <TilePreview key={pos.id} tile={pos.id}/>)}
                </div>
                <div className="peek-note">
                    <span className="lk" aria-hidden="true">🔒</span> Only you can see this · stays until the round ends
                </div>
            </div>
            <button type="button" className="peek-tab" aria-label="Re-open peeked rack"
                    onClick={() => setFolded(false)}>👁️ Peeked rack <span className="chev" aria-hidden="true">▸</span></button>
        </div>
    );
}
