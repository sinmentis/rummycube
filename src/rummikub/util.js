import cloneDeep from "lodash/cloneDeep.js";
import {HAND_GRID_ID} from "./constants.js";
import {original} from "immer";

export {buildTileObj, deactivateTileVariant, getTileValue, getTileColor, getTileReadableName, setTileValue, setTileColor, getTiles, isJoker, RedJoker, BlackJoker} from "./tile/codec.js";
export {isSameColor, isDiffColor, isSameValue, extractJoker, freezeJokerProp, freezeJokersInRun, freezeJokersInGroup, freezeSeqJokers, countSeqScore, isSequenceValid, tryOrderTiles, groupValidSequences} from "./tile/sequence.js";
export {countPoints, findWinner} from "./scoring.js";
export {count2dArrItems, buildGridsFromTilePositions, getPlayerHandTiles, getHandsTilesGrid} from "./projection.js";

let isPrimitive = (val) => {
    if (val === null) {
        return true;
    }
    if (typeof val == "object" || typeof val == "function") {
        return false
    } else {
        return true
    }
}

const objectsEqual = function (o1, o2) {
    return isPrimitive(o1) ? o1 === o2 : Object.keys(o1).length === Object.keys(o2).length &&
        Object.keys(o1).every(p => o1[p] === o2[p])
};

function arraysEqual(a1, a2) {
    return a1.length === a2.length && a1.every((o, idx) => objectsEqual(o, a2[idx]));
}

function transpose(a) {
    return a[0].map((_, colIndex) => a.map(row => row[colIndex]));
}

function getSecTs() {
    return (new Date).getTime()
}

function getGameState(G) {
    return {
        tilePositions: original(G.tilePositions),
        prevTilePositions: original(G.prevTilePositions),
    }
}

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
    arraysEqual,
    transpose,
    getSecTs,
    getGameState,
    playerView,
}
