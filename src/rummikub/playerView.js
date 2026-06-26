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

function stripHandTilePositions(tilePositions, viewerID) {
    const result = {};
    for (const [tileId, pos] of Object.entries(tilePositions)) {
        if (pos.gridId === HAND_GRID_ID) {
            if (viewerID != null && pos.playerID != null && pos.playerID.toString() === viewerID) {
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

    view.tilePositions = stripHandTilePositions(view.tilePositions, viewerID);
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

    return view;
}

export {
    deriveHandCounts,
    stripHandTilePositions,
    sanitizeSnapshot,
    playerView,
}
