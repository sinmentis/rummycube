import {Stage} from 'boardgame.io/dist/cjs/core.js';
import {getTiles} from './util.js'
import {playerView} from './playerView.js'
import {drawTile, endTurn, extendTurn, forceEndTurn, forfeitTurn, insertTilesWithPush, moveTiles, redo, retrieveJoker, submitMeld, undo, _setConnection} from "./moves.js";
import {onPlayPhaseBegin, onTurnBegin, onTurnEnd} from "./turn.js";
import {GAME_NAME, HAND_COLS, HAND_GRID_ID, HAND_ROWS, TILES_TO_DRAW} from "./constants.js";
import {orderByColorVal, orderByValColor} from "./orderTiles.js";
import {buildAbilityDeck} from "./abilities/cards.js";


const Rummikub = {
    name: GAME_NAME,
    setup: function ({ctx, random}, setupData) {
        console.debug('GAME SETUP CALLED. CTX:', ctx)
        let pool = random.Shuffle(getTiles())
        let firstMoveDone = []
        let tilePositions = {}

        for (let p = 0; p < ctx.numPlayers; p++) {
            let tilesToDraw = TILES_TO_DRAW
            for (let row = 0; row < HAND_ROWS; row++) {
                for (let col = 0; col < HAND_COLS; col++) {
                    if (tilesToDraw > 0) {
                        let tile = pool.pop()
                        tilePositions[tile] = {
                            id: tile,
                            col: col,
                            row: row,
                            gridId: HAND_GRID_ID,
                            playerID: p.toString()
                        }
                        tilesToDraw--
                    }
                }
            }
            firstMoveDone.push(false)
        }
        // Chaos DLC: opt-in mode plumbing + ability-card backbone.
        const mode = (setupData && setupData.chaos) ? 'chaos' : 'classic';
        let abilityFields = {mode};
        if (mode === 'chaos') {
            const deck = random.Shuffle(buildAbilityDeck());
            const abilityHands = {};
            for (let p = 0; p < ctx.numPlayers; p++) {
                abilityHands[p.toString()] = [deck.pop(), deck.pop()];
            }
            abilityFields = {mode, abilityDeck: deck, abilityHands, abilityDiscard: []};
        }
        return {
            ...abilityFields,
            timePerTurn: (setupData ? setupData.timePerTurn : 10) * 1000,
            timerExpireAt: null,
            tilesPool: pool,
            tilePositions: tilePositions,
            prevTilePositions: tilePositions,
            firstMoveDone: firstMoveDone,
            gameStateStack: [],
            redoMoveStack: [],
            lastCircle: [],
            recentlyDrawnTiles: [],
            lastPlay: null,
            lastTimeout: null,
            // WS-12: authoritative per-seat connection state, written ONLY by the
            // server transport via the _setConnection move (never client-trusted).
            connected: Array(ctx.numPlayers).fill(true),
            disconnectTurns: Array(ctx.numPlayers).fill(0),
            forfeited: Array(ctx.numPlayers).fill(false),
            // R5b-T6: per-seat "+15s already used this turn" flag, reset each
            // turn in onTurnBegin (defensive default there for legacy matches).
            turnExtended: Array(ctx.numPlayers).fill(false),
            // T11/R6: per-game data for the game-over highlights. startedAt is the
            // game clock (epoch ms, like getSecTs). It is stamped in onPlayPhaseBegin
            // when play actually begins (so "clear time" excludes the lobby wait),
            // hence null here; stats accumulate the best manipulation score and
            // longest formed run across the whole game.
            startedAt: null,
            stats: {bestCombo: 0, longestRun: 0},
        }
    },
    phases: {
        playersJoin: {
            start: true,
            moves: {
                orderByColorVal,
                orderByValColor,
                moveTiles,
                undo,
                redo,
                _setConnection,
            },
            next: 'play'
        },
        play: {
            onBegin: onPlayPhaseBegin,
        }
    },
    moves: {
        drawTile,
        orderByColorVal,
        orderByValColor,
        moveTiles,
        insertTilesWithPush,
        endTurn,
        forceEndTurn,
        forfeitTurn,
        submitMeld,
        retrieveJoker,
        extendTurn,
        undo,
        redo,
        _setConnection,
        clearRecentlyDrawnTiles: ({G, ctx}) => {
            G.recentlyDrawnTiles = []
        }
    },
    turn: {
        activePlayers: {all: Stage.NULL},
        onBegin: onTurnBegin,
        onEnd: onTurnEnd,
    },
    minPlayers: 1,
    maxPlayers: 4,
    playerView,
};
export {Rummikub}

