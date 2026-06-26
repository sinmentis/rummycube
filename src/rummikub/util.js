import {original} from "immer";

export {buildTileObj, deactivateTileVariant, getTileValue, getTileColor, getTileReadableName, setTileValue, setTileColor, getTiles, isJoker, RedJoker, BlackJoker} from "./tile/codec.js";
export {isSameColor, isDiffColor, isSameValue, extractJoker, freezeJokerProp, freezeJokersInRun, freezeJokersInGroup, freezeSeqJokers, countSeqScore, isSequenceValid, tryOrderTiles, groupValidSequences} from "./tile/sequence.js";
export {countPoints, findWinner} from "./scoring.js";
export {count2dArrItems, buildGridsFromTilePositions, getPlayerHandTiles, getHandsTilesGrid} from "./projection.js";
export {deriveHandCounts, stripHandTilePositions, sanitizeSnapshot, playerView} from "./playerView.js";

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

export {
    arraysEqual,
    transpose,
    getSecTs,
    getGameState,
}
