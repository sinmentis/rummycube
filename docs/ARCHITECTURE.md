# RummyCube architecture reference

Online multiplayer Rummikub. Server-authoritative [boardgame.io](https://boardgame.io)
0.50 reducer on top of a React 18 / Vite client. The server holds the full game
state `G`; every client receives a filtered copy through the `playerView` seam.

This is a reference for the non-obvious invariants. Break one and you leak hidden
state, desync a turn, or silently break disconnect handling. Line citations point
at the current code; keep them in sync when you move things.

---

## 1. The game-state object `G`

`G` is created in `setup` (`src/rummikub/Game.js:35-56`) and mutated only inside
moves and turn hooks (`src/rummikub/moves.js`) via immer drafts. Every field below
is server-authoritative; clients see whatever `playerView` lets through (§4).

| Field | Type | Set / reset where | Invariant |
|-------|------|-------------------|-----------|
| `timePerTurn` | ms | `setup` (`Game.js:36`) | Per-match turn budget from `setupData`. |
| `timerExpireAt` | epoch ms | `onTurnBegin` / `onPlayPhaseBegin` (`moves.js:474,510,515,519,524`) | Deadline is **server-set**; the `forceEndTurn` guard reads it so a client can't extend its own turn by hiding its local timer. |
| `tilesPool` | tile[] | `setup`; drawn from in `drawTile` | **Zeroed for every client** by `playerView` → `Array(len).fill(0)` (`util.js:593-595`). Never expose pool contents or order. |
| `tilePositions` | map tileId→{id,col,row,gridId,playerID} | authoritative board+hands; mutated by `moveTiles`/`insertTilesWithPush`/`drawTile` | `playerView` strips opponent **hand** tiles (`util.js:581`, `stripHandTilePositions:545-557`). Board tiles stay visible. |
| `prevTilePositions` | same shape | **turn-start baseline**, reset in `onTurnBegin` via `original(G.tilePositions)` (`moves.js:532`) | It is the snapshot at the *start of the current turn*, not "the last state". `applyValidMove` rearrange-scoring (`moves.js:320-325`) and `rollbackChanges` (`moves.js:244`) depend on this. Don't repurpose it. |
| `firstMoveDone` | bool[] per seat | `setup`; set true in `applyValidMove` (`moves.js:298`) | Gates the initial-meld point threshold. One-way per seat. |
| `gameStateStack` / `redoMoveStack` | snapshot[] | pushed in `moveTiles`/`insertTilesWithPush`/`undo`/`redo`; **both cleared every turn-begin** (`moves.js:527-528`) | Undo/redo never crosses a turn boundary. `playerView` sanitizes each snapshot's hand tiles (`util.js:586-591`). |
| `lastCircle` | seat[] | appended in `onTurnBegin` (`moves.js:529-531`) | Final-round bookkeeping once the pool runs out. |
| `recentlyDrawnTiles` | tileId[] | set in `drawTile`; cleared by `clearRecentlyDrawnTiles` (`Game.js:90-92`) | **Cleared for any non-current viewer** by `playerView` (`util.js:597-600`). A draw must not be visible to opponents. |
| `lastPlay` | combo payload \| null | written in `applyValidMove` (`moves.js:327-336`) | Broadcast so **every** client can celebrate a meld, not just the player. Joker scores its represented value, computed pre-freeze. |
| `lastTimeout` | transient \| null | written by `forceEndTurn` (`moves.js:224`); **staleness-cleared** in `onTurnBegin` (`moves.js:538-540`) | Subtle: `forceEndTurn` writes it, then its `endTurn` fires the next `onTurnBegin` in the *same* state update. An unconditional clear would wipe it before any client renders it, so it survives one full turn and is dropped only once `id <= ctx.turn - 2`. Keep that condition verbatim. |
| `connected` | bool[] per seat | `setup` (all true); written **only** by `_setConnection` (`moves.js:467`) | Server-authoritative connection mirror (§4). Never client-trusted. |
| `disconnectTurns` | int[] per seat | incremented in `onTurnBegin` (`moves.js:512`); reset on reconnect (`_setConnection:469`) and on a connected turn (`onTurnBegin:523`) | After `N_FORFEIT_TURNS` (3) disconnected turn-begins the seat is forfeited. |
| `forfeited` | bool[] per seat | set in `forfeitSeat` (`moves.js:483`) | Retired seat; opponents force-advance its turn immediately. |
| `turnExtended` | bool[] per seat | reset each turn-begin (`moves.js:506`); set in `extendTurn` (`moves.js:430`) | One-time +15s per seat per turn. |

The four `connected`/`disconnectTurns`/`forfeited`/`turnExtended` arrays also have
defensive `if (!Array.isArray(...))` defaults in the turn hooks (`moves.js:501-504`,
`extendTurn:426`, `_setConnection:465-466`, `forfeitSeat:482`) so matches persisted
before these fields existed (pre-WS-12) still run. Removing those shims assumes no
such legacy on-disk match survives the server's GC TTLs — treat it as a deliberate,
separately-approved change, not a free cleanup.

---

## 2. Move atomicity: `INVALID_MOVE` ⇒ no-op

boardgame.io runs each move inside an immer `produce`. **Returning `INVALID_MOVE`
makes the framework discard the entire immer draft**, so every mutation the move
attempted — including snapshots it pushed onto `gameStateStack` — is rolled back
and `G` is left exactly as it was. A rejected move is an atomic no-op. This is the
contract every move relies on; never half-apply a move and then validate.

Grounding examples:

- **`moveTiles` selection loop** (`moves.js:120-133`). A `for` loop, not `.map`, so a
  rejected insert can `return INVALID_MOVE` early. That discards the whole draft,
  including the `gameStateStack` snapshot pushed at `moves.js:76` and any tile already
  placed earlier in the same selection. No partial placement survives.
- **`submitMeld` no-op** (`moves.js:434-445`). An invalid meld returns `INVALID_MOVE`
  (`:442`): no rollback, no penalty draw, no `endTurn`. `G` (tiles, hands, pool,
  `currentPlayer`) is untouched — different from the timeout path, which *does* draw.
- **`forceEndTurn` deadline guard** (`moves.js:202-225`). A pre-deadline force-end
  returns `INVALID_MOVE` at `:208-210` **before any mutation**. `G.lastTimeout` is
  written only *after* the guard (`:224`), so a rejected force-end leaves `G`
  untouched and can never shorten a turn.
- Same pattern in `retrieveJoker` (`moves.js:375-414`) and `extendTurn`
  (`moves.js:424-431`).

**Consequence for scoring:** `applyValidMove` (`moves.js:296-339`) is only reached
after validity is confirmed, and its score computation (`:301-336`) reads `G` but
must not pre-mutate it before the play is committed (`freezeTmpTiles` at `:337`).
Keep play-scoring pure so it can't leak partial state down an `INVALID_MOVE` path,
and so it stays client-importable for a future live preview.

---

## 3. Module map

Two graphs share one pure kernel. The kernel must never reach into the client (no
DOM) or the server (no transport/storage), so both sides can import it.

### Server-authoritative graph (`src/server.js`)

- `Game.js` — the boardgame.io game object: `setup`, `phases`, `moves`, `turn`
  hooks, and the `playerView` wiring (`Game.js:101`).
- `moves.js` — all move reducers + turn lifecycle (`onTurnBegin`/`onTurnEnd`/
  `onPlayPhaseBegin`), disconnect adjudication, scoring glue. Mutates `G` via immer.
- `connTransport.js` — boardgame.io transport subclass (§4). **Server-only**; couples
  framework private internals. Do not import from the client.
- `server.js`, `serverStats.js` — process entry, FlatFile persistence, `/api/stats`.

`Game.js` and `moves.js` import only the pure kernel (`util.js`, `moveValidation.js`,
`orderTiles.js`, `insertPush.js`, `dndUtil.js`, `juice/comboMath.js`, `logger.js`,
`immer`) — see `moves.js:1-29`.

### Client graph

`src/rummikub/components/*` (React/JSX), hooks, and DOM helpers. **Must not be
imported by the server graph.**

### The shared kernel (pure, importable from both sides)

Today this lives mostly in **`src/rummikub/util.js`** plus `juice/`. It is pure
(no `G` mutation, no transport) and is what both client and server build on:

- tile codec — value/color/name, `getTiles`, `isJoker` (`util.js:47-113`)
- sequence validity + joker freeze + per-sequence score (`util.js:115-453`)
- end-game tally — `countPoints`, `findWinner` (`util.js:334-376`)
- grid projections from `tilePositions` (`util.js:35-45,501-532,605-620`)
- the **privacy seam** `playerView` and its helpers (`util.js:534-603`, see §4)
- shared clock + immer snapshot — `getSecTs` (`util.js:455`), `getGameState`
  (`util.js:459`, uses immer `original`)
- combo math + juice gating — `juice/comboMath.js`, `juice/gating.js` (already split)

> **Planned split (ARCH-2, not yet on disk).** A later refactor physically moves these
> bodies into named modules behind a thin re-export barrel in `util.js`, so existing
> import sites stay valid: `tile/codec.js`, `tile/sequence.js`, `scoring.js`,
> `projection.js`, `playerView.js`, `scoring/playScore.js` (the `applyValidMove`
> scoring, made client-importable), with `getSecTs`/`getGameState` staying in
> `util.js`. Until that lands, the file paths above are the source of truth — don't
> cite the planned modules as if they exist.

> **DOM-free server graph (target).** `util.js` still contains two DOM-only helpers,
> `copyToClipboard` and `stringToColor` (`util.js:466-499`). They sit in the server's
> module graph but are **never called server-side**. ARCH-2 evicts them to a
> client-only `components/domUtil.js`. Until then, do not add new DOM access to the
> kernel, and keep `Game.js`/`moves.js` free of `document`/`window`/`navigator`.

### The privacy boundary

`playerView` (`util.js:573-603`, wired at `Game.js:101`) is the single seam between
the server's full `G` and what a client sees. Everything client-visible passes
through it. It must keep:

- stripping opponent **hand** tiles from `tilePositions`/`prevTilePositions`
  (`util.js:581-584`, `stripHandTilePositions:545-557`)
- sanitizing the undo/redo stacks (`util.js:586-591`)
- zeroing `tilesPool` (`util.js:593-595`)
- clearing `recentlyDrawnTiles` for any non-current viewer (`util.js:597-600`)

The `viewerID` string coercion (`playerID.toString()`) and the
`pos.playerID.toString() === viewerID` compare are security-critical — an off-by-one
there leaks a hand. Change with care and keep `player-view.test.js` green.

---

## 4. The connection seam

boardgame.io 0.50 records a player's connection status only in match **metadata**
(`Master.onConnectionChange`); it never touches the authoritative `G`. But the turn
logic in `moves.js` needs it *in* `G` to collapse a disconnected seat's grace window
(`onTurnBegin:511-520`) and eventually forfeit the seat. `connTransport.js` bridges
that gap.

`ConnAwareSocketIO extends SocketIO` (`connTransport.js:53`):

1. `super.init()` wires all the normal socket.io plumbing (metadata, pubSub, queues,
   playerView). We don't replace it.
2. We attach our **own** extra `connection` listener per game namespace
   (`connTransport.js:79-92`). socket.io allows multiple listeners, so ours runs
   alongside the framework's. On `sync` (connect/reconnect) we mirror `true`; on
   `disconnect` we mirror `false`.
3. `mirror()` dispatches an internal `_setConnection(connected)` `MAKE_MOVE` through
   `Master.onUpdate` — the **same path a real client move takes** (credential
   re-check, player-active, move-exists-in-phase, optimistic stateID), serialized on
   the same per-match queue as client moves (`connTransport.js:65-77`). The
   `_setConnection` reducer (`moves.js:462-470`) writes only its own caller's seat:
   `G.connected[seat] = !!connected`.

**Server authority (invariant).** The seat is resolved by the *server* from the
socket's `sync` args (`connTransport.js:80-83`), never from a client-supplied move
argument. `_setConnection` is registered as a move (`Game.js:67,89`) but is only ever
dispatched by the transport — never trust a client connection flag.

**Why the subclass dance.** The `Master` that `SocketIO` instantiates is a class
**private** to boardgame.io's server bundle (`server.js:3391`), *not* the `Master`
re-exported from `boardgame.io/dist/cjs/master.js` (a separate copy from another
chunk). So we can neither subclass nor patch the real one from outside; we let the
framework's untouched `super.init()` run and only add a sibling listener.

Integration coverage: `src/tests/disconnect-handling.test.js` drives
`_setConnection` → `G.connected` through the move path and asserts a move only ever
writes its own seat. Keep it green when touching the seam.

---

## 5. boardgame.io is version-pinned (`0.50.2`, no caret)

`connTransport.js` reaches deep into boardgame.io **private internals** that are not
part of any public API:

- `import {Master} from 'boardgame.io/dist/cjs/master.js'` and `{SocketIO}` from
  `.../server.js` (`connTransport.js:1-2`)
- subclassing `SocketIO`, and relying on `app._io.of(name)`, `this.pubSub.publish`,
  `this.getMatchQueue`, `master.storageAPI.fetch`, `master.onUpdate`,
  `app.context.db`, `app.context.auth` (`connTransport.js:54-76`)

A patch bump could rename or move any of these and **silently** break disconnect
adjudication — tests might still pass at the unit level while live reconnect handling
fails. For that reason `package.json` pins the dependency to the exact installed
version (`"boardgame.io": "0.50.2"`, caret dropped) so `npm install` can't float to a
0.50.x patch. Upgrading boardgame.io is a **deliberate** step: bump the pin, then
re-verify `connTransport.js` against the new internals and run
`disconnect-handling.test.js`. Do not refactor the transport to "clean it up"; its
coupling is load-bearing and documented here on purpose.
