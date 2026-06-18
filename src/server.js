import {Server, Origins} from 'boardgame.io/dist/cjs/server.js';
import path from 'path';
import serve from 'koa-static';
import {Rummikub} from "./rummikub/Game.js";
import {FRONTEND_ADDR, GAME_NAME} from "./rummikub/constants.js";
import {computeServerStats} from "./rummikub/serverStats.js";

const allowedOrigins = [Origins.LOCALHOST, `http://${FRONTEND_ADDR}`];
if (process.env.PUBLIC_ORIGIN) {
    allowedOrigins.push(process.env.PUBLIC_ORIGIN);
}

const server = Server({
    games: [Rummikub],
    apiOrigins: allowedOrigins,
    origins: allowedOrigins,
});
const PORT = process.env.PORT || 9119;

// Build path relative to the server.js file
const frontEndAppBuildPath = path.resolve(import.meta.dirname, '../build');

// Public, counts-only server activity (deliberately exposes NO match IDs or
// player names — just aggregate numbers for the homepage).
server.app.use(async (ctx, next) => {
    if (ctx.method === 'GET' && ctx.path === '/api/stats') {
        let body = {inProgress: 0, waiting: 0, players: 0};
        try {
            const db = server.app.context.db;
            const ids = await db.listMatches({gameName: GAME_NAME});
            const metas = [];
            for (const id of ids) {
                const {metadata} = await db.fetch(id, {metadata: true});
                if (metadata) metas.push(metadata);
            }
            body = computeServerStats(metas);
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
