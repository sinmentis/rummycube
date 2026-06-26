import {Rummikub} from "../../rummikub/Game.js";

// T7: single source of truth for the Client-harness G fixture. Mirrors the
// canonical setup() in src/rummikub/Game.js so every test gets the FULL current
// G shape (incl. connected/disconnectTurns/forfeited/turnExtended). `overrides`
// replaces individual fields; previously-omitted fields now come from the
// defaults here instead of silently relying on the production defensive shims.
export function makeMatch(overrides = {}) {
  return {
    ...Rummikub,
    setup: ({ctx} = {}) => {
      const n = (ctx && ctx.numPlayers) || 2;
      const defaultG = {
        timePerTurn: 10000, timerExpireAt: null,
        tilesPool: [], tilePositions: {}, prevTilePositions: {},
        firstMoveDone: Array(n).fill(false),
        gameStateStack: [], redoMoveStack: [], lastCircle: [], recentlyDrawnTiles: [],
        lastPlay: null, lastTimeout: null,
        connected: Array(n).fill(true), disconnectTurns: Array(n).fill(0),
        forfeited: Array(n).fill(false), turnExtended: Array(n).fill(false),
      };
      return {...defaultG, ...overrides};
    },
  };
}
