import cloneDeep from "lodash/cloneDeep.js";
import {HAND_GRID_ID} from "./constants.js";

function deriveHandCounts(tilePositions) {
    const counts = {};
    for (const pos of Object.values(tilePositions)) {
        if (pos.gridId === HAND_GRID_ID && pos.playerID != null) {
            const key = pos.playerID.toString();
            counts[key] = (counts[key] || 0) + 1;
        }
    }
    return counts;
}

function stripHandTilePositions(tilePositions, viewerID, seeIDs = null) {
    const result = {};
    for (const [tileId, pos] of Object.entries(tilePositions)) {
        if (pos.gridId === HAND_GRID_ID) {
            const owner = pos.playerID == null ? null : pos.playerID.toString();
            const allow = viewerID != null && owner === viewerID
                || (seeIDs && owner != null && seeIDs.has(owner));
            if (allow) {
                result[tileId] = pos;
            }
        } else {
            result[tileId] = pos;
        }
    }
    return result;
}

function sanitizeSnapshot(snapshot, viewerID) {
    if (!snapshot) {
        return snapshot;
    }
    const result = {...snapshot};
    if (snapshot.tilePositions) {
        result.tilePositions = stripHandTilePositions(snapshot.tilePositions, viewerID);
    }
    if (snapshot.prevTilePositions) {
        result.prevTilePositions = stripHandTilePositions(snapshot.prevTilePositions, viewerID);
    }
    return result;
}

function playerView({G, ctx, playerID}) {
    const viewerID = playerID == null ? null : playerID.toString();

    const handCounts = deriveHandCounts(G.tilePositions);

    const view = cloneDeep(G);
    view.handCounts = handCounts;

    // Chaos: peek grants let the viewer see specific opponents' hand tiles.
    const seeIDs = new Set();
    if (G.peekGrants && viewerID != null && G.peekGrants[viewerID] != null) {
        seeIDs.add(G.peekGrants[viewerID].toString());
    }
    view.tilePositions = stripHandTilePositions(view.tilePositions, viewerID, seeIDs);
    if (view.prevTilePositions) {
        view.prevTilePositions = stripHandTilePositions(view.prevTilePositions, viewerID);
    }

    if (Array.isArray(view.gameStateStack)) {
        view.gameStateStack = view.gameStateStack.map((snap) => sanitizeSnapshot(snap, viewerID));
    }
    if (Array.isArray(view.redoMoveStack)) {
        view.redoMoveStack = view.redoMoveStack.map((snap) => sanitizeSnapshot(snap, viewerID));
    }

    if (Array.isArray(view.tilesPool)) {
        view.tilesPool = Array(view.tilesPool.length).fill(0);
    }

    const isCurrentPlayer = viewerID != null && ctx != null && viewerID === ctx.currentPlayer;
    if (!isCurrentPlayer) {
        view.recentlyDrawnTiles = [];
    }

    // Chaos: hide opponents' ability-card content and count; expose presence only.
    if (G.abilityHands) {
        const presence = {};
        for (const pid of Object.keys(G.abilityHands)) {
            if (pid !== viewerID) {
                presence[pid] = G.abilityHands[pid].length > 0;
            }
        }
        view.abilityHands = viewerID != null && G.abilityHands[viewerID]
            ? {[viewerID]: G.abilityHands[viewerID]}
            : {};
        view.abilityPresence = presence;
        view.abilityDeck = [];
    }

    return view;
}

export {
    deriveHandCounts,
    stripHandTilePositions,
    sanitizeSnapshot,
    playerView,
}
