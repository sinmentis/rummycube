// WS-12 (S3-U7) manual smoke: verifies the live socket path mirrors connection
// state into authoritative G.connected. Boots a real Server with ConnAwareSocketIO,
// connects two boardgame.io SocketIO clients, disconnects one, then reconnects it,
// asserting G.connected goes [true,true] -> [false,true] -> [true,true].
//
// Run (raw `node` can't resolve src/util.js's extensionless lodash subpath imports,
// so bundle with the repo's esbuild first — same toolchain vite/jest use):
//   npx esbuild scripts/smoke-disconnect.mjs --bundle --platform=node \
//     --format=cjs --packages=external --outfile=scripts/.smoke-disconnect.cjs \
//     && node scripts/.smoke-disconnect.cjs && rm scripts/.smoke-disconnect.cjs
//
// Exit code 0 + "SMOKE PASS" on success.
import {Server, Origins} from 'boardgame.io/dist/cjs/server.js';
import {Client, LobbyClient} from 'boardgame.io/dist/cjs/client.js';
import {SocketIO} from 'boardgame.io/dist/cjs/multiplayer.js';
import {Rummikub} from '../src/rummikub/Game.js';
import {ConnAwareSocketIO} from '../src/rummikub/connTransport.js';

const PORT = 9219;
const SERVER = `http://localhost:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = Server({
    games: [Rummikub],
    origins: [Origins.LOCALHOST],
    apiOrigins: [Origins.LOCALHOST],
    transport: new ConnAwareSocketIO(),
});

async function main() {
    const running = await server.run(PORT);
    const lobby = new LobbyClient({server: SERVER});
    const {matchID} = await lobby.createMatch('RummyCube', {numPlayers: 2});
    const j0 = await lobby.joinMatch('RummyCube', matchID, {playerID: '0', playerName: 'p0'});
    const j1 = await lobby.joinMatch('RummyCube', matchID, {playerID: '1', playerName: 'p1'});

    const c0 = Client({game: Rummikub, multiplayer: SocketIO({server: SERVER}),
        matchID, playerID: '0', credentials: j0.playerCredentials});
    const c1 = Client({game: Rummikub, multiplayer: SocketIO({server: SERVER}),
        matchID, playerID: '1', credentials: j1.playerCredentials});
    c0.start();
    c1.start();
    await sleep(800);

    const seatConnected = (c, seat) => {
        const s = c.getState();
        return s && s.G && Array.isArray(s.G.connected) ? s.G.connected[seat] : '(no state yet)';
    };

    console.log('after connect: c1 sees G.connected =', c1.getState()?.G?.connected);

    // Disconnect player 0's socket -> server socket.on('disconnect') -> onConnectionChange.
    c0.stop();
    await sleep(800);
    const afterDisc = c1.getState()?.G?.connected;
    console.log('after p0 disconnect: c1 sees G.connected =', afterDisc);

    // Reconnect player 0 -> socket.on('sync') -> onConnectionChange(...,true).
    const c0b = Client({game: Rummikub, multiplayer: SocketIO({server: SERVER}),
        matchID, playerID: '0', credentials: j0.playerCredentials});
    c0b.start();
    await sleep(800);
    const afterRecon = c1.getState()?.G?.connected;
    console.log('after p0 reconnect: c1 sees G.connected =', afterRecon);

    const ok = afterDisc && afterDisc[0] === false && afterDisc[1] === true
        && afterRecon && afterRecon[0] === true;
    console.log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');

    c1.stop();
    c0b.stop();
    running.apiServer?.close?.();
    running.appServer?.close?.();
    await sleep(200);
    process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('SMOKE ERROR', e); process.exit(2); });
