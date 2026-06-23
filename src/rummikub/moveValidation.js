import _ from "lodash";
import {countSeqScore, isSequenceValid} from "./util.js";
import {FIRST_MOVE_SCORE_LIMIT, BOARD_GRID_ID} from "./constants.js";


function freezeTmpTiles(G) {
    for (let tileId of Object.keys(G.tilePositions)) {
        let tilePos = G.tilePositions[tileId]
        if (tilePos && tilePos.tmp) {
            tilePos.tmp = false
            G.tilePositions[tileId] = tilePos
        }
    }
}

function isBoardHasNewTiles(G) {
    for (let tileId of Object.keys(G.tilePositions)) {
        if (G.tilePositions[tileId] && G.tilePositions[tileId].tmp) {
            return true
        }
    }
    return false
}

function extractSeqs(G) {
    const seqs = [];

    // Group all tile positions on the board by row
    const tilesByRow = {};
    for (const tileId in G.tilePositions) {
        const pos = G.tilePositions[tileId];
        if (pos.gridId === BOARD_GRID_ID) {
            if (!tilesByRow[pos.row]) {
                tilesByRow[pos.row] = {};
            }
            tilesByRow[pos.row][pos.col] = tileId;
        }
    }

    // For each row, scan left to right and extract contiguous sequences
    for (const rowStr of Object.keys(tilesByRow)) {
        const row = parseInt(rowStr);
        const rowTiles = tilesByRow[row];
        const cols = Object.keys(rowTiles).map(Number).sort((a, b) => a - b);

        let seq = [];
        for (let i = 0; i < cols.length; i++) {
            const col = cols[i];
            const tileId = rowTiles[col];

            if (seq.length === 0 || col === cols[i - 1] + 1) {
                seq.push(tileId);
            } else {
                if (seq.length > 0) {
                    seqs.push(seq);
                    seq = [tileId];
                }
            }
        }
        if (seq.length > 0) {
            seqs.push(seq);
        }
    }

    return seqs;
}


function isBoardValid(G) {
    let seqs = extractSeqs(G)
    for (const seq of seqs) {
        if (!isSequenceValid(seq)) {
            return false
        }
    }
    return true
}

function seqHasNewTile(G, seq) {
    for (let tile of seq) {
        if (G.tilePositions[tile].tmp) {
            return true
        }
    }
    return false
}

function seqIsMixed(G, seq) {
    let oldFound = false
    let newFound = false
    for (let tile of seq) {
        if (G.tilePositions[tile].tmp) {
            newFound = true
        } else {
            oldFound = true
        }
    }
    return oldFound && newFound
}

// Regular-move evaluator: needs at least one newly placed tile, then every
// sequence on the board must be valid. Returns a reason object.
function _evaluateRegularMove(G, seqs) {
    let newFound = _.find(seqs, (seq) => seqHasNewTile(G, seq))
    if (!newFound) {
        return {code: 'NO_NEW_TILE'}
    }
    for (const seq of seqs) {
        if (!isSequenceValid(seq)) {
            return {code: 'INVALID_GROUP', group: seq.map(Number)}
        }
    }
    return {code: 'OK'}
}

// First-move evaluator: no mixed (old+new) sequence, every sequence valid, and
// the score of the newly placed sequences meets FIRST_MOVE_SCORE_LIMIT.
function _evaluateFirstMove(G, seqs) {
    let mixed = _.find(seqs, (seq) => seqIsMixed(G, seq))
    if (mixed) {
        return {code: 'MIXED_FIRST_MOVE', group: mixed.map(Number)}
    }

    let score = 0
    for (let seq of seqs) {
        let seqScore = countSeqScore(seq)
        if (!seqScore) {
            return {code: 'INVALID_GROUP', group: seq.map(Number)}
        }
        if (G.tilePositions[seq[0]].tmp) {
            score += seqScore
        }
    }
    if (score < FIRST_MOVE_SCORE_LIMIT) {
        return {code: 'BELOW_30', score, required: FIRST_MOVE_SCORE_LIMIT}
    }
    return {code: 'OK'}
}

// Single source of truth for "why a submit would be rejected". The first-move
// vs regular-move reason logic is shared with the boolean validators below.
function _evaluateSubmit(G, ctx) {
    if (!isBoardHasNewTiles(G)) {
        return {code: 'NO_NEW_TILE'}
    }
    let seqs = extractSeqs(G)
    return isFirstMove(G, ctx)
        ? _evaluateFirstMove(G, seqs)
        : _evaluateRegularMove(G, seqs)
}

// Reason code for the current submit attempt:
//   OK | NO_NEW_TILE | BELOW_30 | INVALID_GROUP | MIXED_FIRST_MOVE
// (RUN_TOO_SHORT is reserved but never emitted; see report — util.js collapses a
// too-short run and a structurally invalid group both to countSeqScore() === 0.)
function submitRejectReason(G, ctx) {
    return _evaluateSubmit(G, ctx)
}

function isMoveValid(G, ctx) {
    return _evaluateRegularMove(G, extractSeqs(G)).code === 'OK'
}


function isFirstMove(G, ctx) {
    return !G.firstMoveDone[ctx.currentPlayer]
}

function isFirstMoveValid(G, ctx) {
    return _evaluateFirstMove(G, extractSeqs(G)).code === 'OK'
}

// Whether clicking End right now would be kept by the server (validatePlayerMove).
// Needs at least one newly placed tile, then the first-move or regular rule.
function isSubmitAccepted(G, ctx) {
    if (!isBoardHasNewTiles(G)) {
        return false
    }
    return isFirstMove(G, ctx) ? isFirstMoveValid(G, ctx) : isMoveValid(G, ctx)
}

// The valid runs/sets that contain at least one tile placed this turn — i.e. the
// groups the player just built or extended. Used to spotlight them on a submit.
function getFormedGroups(G) {
    return extractSeqs(G).filter(seq =>
        seq.some(t => G.tilePositions[t] && G.tilePositions[t].tmp) && isSequenceValid(seq)
    )
}

export {
    isMoveValid,
    freezeTmpTiles,
    isFirstMoveValid,
    isFirstMove,
    isBoardHasNewTiles,
    isBoardValid,
    isSubmitAccepted,
    submitRejectReason,
    getFormedGroups,
    extractSeqs,
}