import {SocketIO} from 'boardgame.io/dist/cjs/server.js';
import {Master} from 'boardgame.io/dist/cjs/master.js';

// WS-12 (S3-U7) — mirror authoritative connection state into game state `G`.
//
// boardgame.io 0.50 records a player's connection status only in match METADATA
// (Master.onConnectionChange, server.js:3606); it never touches the authoritative
// `G`. The turn logic in moves.js needs it in `G` to collapse a disconnected seat's
// grace window and forfeit it. The connection event is caught server-side in the
// SocketIO transport's per-socket `sync` (connect/reconnect) and `disconnect`
// handlers (server.js:3905-3935); the seat is resolved by the SERVER from the
// socket, never from a client-supplied move argument, so the value we write is
// authoritative (global-constraints: never trust a client connection flag).
//
// Why we don't subclass the Master used by the base transport: the `Master` that
// SocketIO instantiates is a class PRIVATE to boardgame.io's server.js bundle
// (server.js:3391) — it is NOT the `Master` re-exported from
// 'boardgame.io/dist/cjs/master.js' (a separate copy from another chunk). So we can
// neither subclass nor patch the real one from outside. Instead we let the
// untouched `super.init()` wire all the socket.io plumbing, then attach our OWN
// extra `connection` listener on each game namespace. socket.io allows multiple
// listeners, so ours runs alongside the framework's: the framework keeps updating
// metadata exactly as before, and we additionally dispatch an internal
// `_setConnection` move that writes `G.connected[seat]`.

// Channel id the base transport's pubSub broadcaster is subscribed to
// (server.js:getPubSubChannelId). Publishing here reaches every connected client,
// with the per-client playerView filter applied by the existing broadcaster.
const pubSubChannel = (matchID) => `MATCH-${matchID}`;

// Dispatch an internal `_setConnection(connected)` for `playerID` through the SAME
// path a real client move takes (Master.onUpdate): it re-checks credentials,
// player-active, that the move exists in the current phase, and the optimistic
// stateID, then runs the reducer, broadcasts, and persists. No anti-cheat guard is
// bypassed; the move only ever writes its own caller's seat.
async function dispatchSetConnection(master, matchID, playerID, credentials, connected) {
    // `await` is safe for sync (FlatFile/InMemory) and async storage alike.
    const {state} = await master.storageAPI.fetch(matchID, {state: true});
    if (!state) return;
    if (state.ctx.gameover !== undefined) return; // don't touch a finished match
    const seat = Number(playerID);
    // Skip a no-op write so a fresh connect doesn't churn the stateID needlessly.
    if (Array.isArray(state.G.connected) && state.G.connected[seat] === !!connected) {
        return;
    }
    const action = {
        type: 'MAKE_MOVE',
        payload: {type: '_setConnection', args: [connected], playerID, credentials},
    };
    await master.onUpdate(action, state._stateID, matchID, playerID);
}

class ConnAwareSocketIO extends SocketIO {
    init(app, games, origins = []) {
        // Let the framework wire metadata handling, pubSub, queues, playerView, etc.
        super.init(app, games, origins);

        // Our own socket -> seat map, independent of the framework's clientInfo
        // (the base disconnect handler clears its map before ours runs).
        const ownClients = new Map();

        for (const game of games) {
            const nsp = app._io.of(game.name);

            const mirror = (matchID, playerID, credentials, connected) => {
                if (playerID === undefined || playerID === null) return; // spectator
                const transportAPI = {
                    send: () => {},
                    sendAll: (payload) => this.pubSub.publish(pubSubChannel(matchID), payload),
                };
                const master = new Master(game, app.context.db, transportAPI, app.context.auth);
                // Serialize with client moves on the same per-match queue so the
                // optimistic stateID check in onUpdate doesn't fight a concurrent move.
                this.getMatchQueue(matchID).add(() =>
                    dispatchSetConnection(master, matchID, playerID, credentials, connected)
                        .catch((e) => console.error('conn mirror error', e)));
            };

            nsp.on('connection', (socket) => {
                socket.on('sync', (...args) => {
                    const [matchID, playerID, credentials] = args;
                    ownClients.set(socket.id, {matchID, playerID, credentials});
                    mirror(matchID, playerID, credentials, true);
                });
                socket.on('disconnect', () => {
                    const client = ownClients.get(socket.id);
                    ownClients.delete(socket.id);
                    if (client) {
                        mirror(client.matchID, client.playerID, client.credentials, false);
                    }
                });
            });
        }
    }
}

export {ConnAwareSocketIO, dispatchSetConnection};
