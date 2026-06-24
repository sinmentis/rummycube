import {Server, Origins, FlatFile} from 'boardgame.io/dist/cjs/server.js';
import path from 'path';
import serve from 'koa-static';
import {Rummikub} from "./rummikub/Game.js";
import {ConnAwareSocketIO} from "./rummikub/connTransport.js";
import {FRONTEND_ADDR, GAME_NAME} from "./rummikub/constants.js";
import {computeServerStats} from "./rummikub/serverStats.js";

const allowedOrigins = [Origins.LOCALHOST, `http://${FRONTEND_ADDR}`];
if (process.env.PUBLIC_ORIGIN) {
    allowedOrigins.push(process.env.PUBLIC_ORIGIN);
}

// Persist matches + /api/stats counts so a restart/redeploy no longer wipes
// in-progress games. FLATFILE_DIR is injected by the Quadlet unit in prod;
// locally it defaults to ./data next to the repo root.
const DB_DIR = process.env.FLATFILE_DIR || path.resolve(import.meta.dirname, '../data');
const db = new FlatFile({dir: DB_DIR, logging: false});

const server = Server({
    games: [Rummikub],
    apiOrigins: allowedOrigins,
    origins: allowedOrigins,
    db,
    // WS-12: mirror socket connect/disconnect into authoritative G.connected so the
    // turn logic can collapse a disconnected seat's grace window and forfeit it.
    transport: new ConnAwareSocketIO(),
});
const PORT = process.env.PORT || 9119;

// Periodically reclaim finished and stale matches so FlatFile + node-persist's
// in-memory cache don't grow unbounded against the 512M container cap.
const GC_INTERVAL_MS = 15 * 60 * 1000; // run every 15 minutes
const GAMEOVER_TTL_MS = 60 * 60 * 1000; // wipe finished matches after ~1h
const IDLE_TTL_MS = 6 * 60 * 60 * 1000; // wipe any match untouched for ~6h
async function collectGarbage() {
    try {
        const now = Date.now();
        const stale = new Set();
        const gameover = await db.listMatches({
            gameName: GAME_NAME,
            where: {isGameover: true, updatedBefore: now - GAMEOVER_TTL_MS},
        });
        const idle = await db.listMatches({
            gameName: GAME_NAME,
            where: {updatedBefore: now - IDLE_TTL_MS},
        });
        for (const id of gameover) stale.add(id);
        for (const id of idle) stale.add(id);
        for (const id of stale) await db.wipe(id);
        if (stale.size) console.log(`gc: wiped ${stale.size} match(es)`);
    } catch (e) {
        console.error('gc error', e);
    }
}
const gcTimer = setInterval(collectGarbage, GC_INTERVAL_MS);
gcTimer.unref();

// Cache the counts-only stats for a few seconds so frequent homepage polling
// doesn't trigger an O(n) disk scan of every match on every request.
const STATS_TTL_MS = 5000;
let statsCache = {body: null, expiresAt: 0};
async function getServerStats() {
    const now = Date.now();
    if (statsCache.body && now < statsCache.expiresAt) {
        return statsCache.body;
    }
    const ids = await db.listMatches({gameName: GAME_NAME});
    const metas = [];
    for (const id of ids) {
        const {metadata} = await db.fetch(id, {metadata: true});
        if (metadata) metas.push(metadata);
    }
    const body = computeServerStats(metas);
    statsCache = {body, expiresAt: now + STATS_TTL_MS};
    return body;
}

// Build path relative to the server.js file
const frontEndAppBuildPath = path.resolve(import.meta.dirname, '../build');

// Public, counts-only server activity (deliberately exposes NO match IDs or
// player names — just aggregate numbers for the homepage).
server.app.use(async (ctx, next) => {
    if (ctx.method === 'GET' && ctx.path === '/api/stats') {
        let body = {inProgress: 0, waiting: 0, players: 0};
        try {
            body = await getServerStats();
        } catch (e) {
            console.error('stats error', e);
        }
        ctx.set('Cache-Control', 'no-store');
        ctx.body = body;
        return;
    }
    await next();
});

server.app.use(serve(frontEndAppBuildPath))

server.run(PORT, () => {
    server.app.use(
        async (ctx, next) => await serve(frontEndAppBuildPath)(
            Object.assign(ctx, {path: 'index.html'}),
            next
        )
    )
});
