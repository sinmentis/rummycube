import flatten from "lodash/flatten.js";
import some from "lodash/some.js";
import {isBoardValid} from "./moveValidation.js";
import {
    countPoints,
    findWinner,
    getSecTs,
    getHandsTilesGrid,
} from "./util.js";
import {original} from "immer"
import {logger} from './logger.js';
import {settleJokerBombs} from "./abilities/jokerBomb.js";


// Disconnected-seat tuning. Both are [PLACEHOLDER] pending Game Design / Product:
// GRACE_MS is the (short) deadline a disconnected seat's turn gets instead of the
// full timePerTurn, so an honest opponent's forceEndTurn nudge advances it fast.
// N_FORFEIT_TURNS is how many consecutive disconnected turn-begins a seat may rack
// up before it is forfeited (its hand scored, the seat skipped).
const GRACE_MS = 5000
const N_FORFEIT_TURNS = 3

// T11: this-game highlights for the game-over modal, built server-side so the
// payload is authoritative (never client-trusted). clearSeconds is the winner's
// elapsed time; getSecTs() and G.startedAt are both epoch ms despite the name.
function buildHighlights(G) {
    return {
        bestCombo: G.stats?.bestCombo ?? 0,
        longestRun: G.stats?.longestRun ?? 0,
        clearSeconds: G.startedAt ? Math.round((getSecTs() - G.startedAt) / 1000) : null,
    }
}

function onPlayPhaseBegin({G, ctx}) {
    logger.debug('PLAY PHASE BEGIN', new Date())
    // R6: start the game clock here, not in setup, so the game-over "clear time"
    // counts from the first turn and not from match creation / lobby wait. Stamp
    // once: a value pre-seeded by a test is left untouched.
    if (!G.startedAt) G.startedAt = getSecTs()
    G.timerExpireAt = getSecTs() + G.timePerTurn
    return G
}

// When a seat reaches N_FORFEIT_TURNS disconnected turn-begins, retire it: mark it
// forfeited and, if only one seat is still in play, end the match scoring remaining
// hands with the standard helper (reuses countPoints/findWinner; no rule relaxed).
function forfeitSeat(G, ctx, seat, events) {
    if (!Array.isArray(G.forfeited)) G.forfeited = []
    G.forfeited[seat] = true
    const remaining = []
    for (let i = 0; i < ctx.numPlayers; i++) {
        if (!G.forfeited[i]) remaining.push(i)
    }
    if (remaining.length <= 1 && events) {
        const hands = getHandsTilesGrid(G, ctx.numPlayers)
        const winner = remaining.length === 1 ? remaining[0] : findWinner(hands)
        const points = countPoints(hands, winner)
        events.endGame({winner: winner.toString(), points: points, highlights: buildHighlights(G)})
    }
}

// Chaos DLC turn-start side effects. Pure mutation of G; safe on a plain object
// OR an immer draft (no `original`), so it unit-tests directly. Expires this
// seat's peek grant (a round elapsed) + 30% one-card drip from the ability deck.
function applyChaosTurnStart({G, seat, random}) {
    if (G.mode !== 'chaos') return;
    if (G.peekGrants) delete G.peekGrants[seat];
    if (Array.isArray(G.abilityDeck) && G.abilityDeck.length
        && random && random.Number() < 0.3) {
        if (!G.abilityHands[seat]) G.abilityHands[seat] = [];
        G.abilityHands[seat].push(G.abilityDeck.pop());
    }
}

function onTurnBegin({G, ctx, events, random}) {
    logger.debug('ON TURN BEGIN', new Date())
    const seat = ctx.currentPlayer
    const seatIdx = Number(seat)
    // Defensive defaults so matches created before WS-12 (no connected arrays) still run.
    if (!Array.isArray(G.connected)) G.connected = []
    if (!Array.isArray(G.disconnectTurns)) G.disconnectTurns = []
    if (!Array.isArray(G.forfeited)) G.forfeited = []
    if (!Array.isArray(G.turnExtended)) G.turnExtended = []
    // R5b-T6: a fresh turn re-arms the one-time +15s extension for this seat.
    G.turnExtended[seatIdx] = false

    if (G.forfeited[seatIdx]) {
        // Already retired: nothing to wait for, let an opponent force-advance at once.
        G.timerExpireAt = getSecTs()
    } else if (G.connected[seatIdx] === false) {
        G.disconnectTurns[seatIdx] = (G.disconnectTurns[seatIdx] ?? 0) + 1
        if (G.disconnectTurns[seatIdx] >= N_FORFEIT_TURNS) {
            forfeitSeat(G, ctx, seatIdx, events)
            G.timerExpireAt = getSecTs()
        } else {
            // Collapse the deadline: the disconnected seat's turn ends within GRACE_MS,
            // not the full timePerTurn. The forceEndTurn deadline guard is untouched.
            G.timerExpireAt = getSecTs() + GRACE_MS
        }
    } else {
        // Connected (or reconnected): full budget, and clear any accrued disconnect count.
        G.disconnectTurns[seatIdx] = 0
        G.timerExpireAt = getSecTs() + G.timePerTurn
    }

    G.gameStateStack = []
    G.redoMoveStack = []
    if (G.lastCircle.length) {
        G.lastCircle.push(seat)
    }
    G.prevTilePositions = original(G.tilePositions)

    // forceEndTurn writes G.lastTimeout then its own endTurn fires the NEXT
    // onTurnBegin inside the SAME state update, where G.lastTimeout.id ===
    // ctx.turn - 1. An unconditional clear would wipe the transient before any
    // client renders it, so keep it for a full turn and drop it only once stale.
    if (G.lastTimeout && typeof G.lastTimeout.id === 'number' && G.lastTimeout.id <= ctx.turn - 2) {
        G.lastTimeout = null
    }

    applyChaosTurnStart({G, seat, random})

    return G
}

function onTurnEnd({G, ctx, events, random}) {
    logger.debug('ON TURN END', new Date())
    G.timerExpireAt = null
    if (G.jokerHeat) settleJokerBombs({G, ctx, random, events})
    checkGameOver(G, ctx, events)
}

function checkGameOver(G, ctx, events) {
    let hands = getHandsTilesGrid(G, ctx.numPlayers)
    if (G.lastCircle.length >= ctx.numPlayers) {
        let winner = findWinner(hands)
        let points = countPoints(hands, winner)
        events.endGame({winner: winner.toString(), points: points, highlights: buildHighlights(G)})
    }

    let flattened = flatten(hands[ctx.currentPlayer])
    let tilesLeft = some(flattened, Boolean)
    if (!tilesLeft && isBoardValid(G)) {
        let points = countPoints(hands, ctx.currentPlayer)
        events.endGame({winner: ctx.currentPlayer, points: points, highlights: buildHighlights(G)})
    }
    return G
}

export {
    GRACE_MS,
    N_FORFEIT_TURNS,
    applyChaosTurnStart,
    checkGameOver,
    onPlayPhaseBegin,
    onTurnBegin,
    onTurnEnd,
}
