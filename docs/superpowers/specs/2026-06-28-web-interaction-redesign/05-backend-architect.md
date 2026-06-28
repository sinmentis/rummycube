# Systems Report: Online-Game Interaction on a boardgame.io Stack
*Lens: Backend / Systems Architect*

**The one fact that decides everything below:** boardgame.io has *no server-side wall-clock scheduler*. State advances **only when a move arrives**. The existing turn timer proves this — `G.timerExpireAt` is just a server-stamped deadline, and it is an *opponent's* `forceEndTurn` that enforces it. That works only because being slow is self-harm. Every design that needs the **server itself** to act when a clock runs out is fighting the framework.

## 1. The turn-based vs real-time fault line

**Fits naturally (still turn-based, richer moves/effects):** A, D, the async slice of E, and the "on-your-turn" half of B. An attack (A) is just tiles appended to a victim's hand at the attacker's turn-commit — one more effect on the existing reducer. Teams (D) are turn-based with shared/hidden state. Power-ups that fire on *your* turn (freeze a set next round, peek) are ordinary moves.

**Fights the framework (true simultaneity / server-fired timers):** C entirely, and B's *reaction/challenge window*. C needs sub-second simultaneous input with conflict resolution and low RTT; moves serialize through one authoritative reducer (which actually resolves "who grabbed first" cleanly), but the *feel* of real-time contention demands optimistic-UI + rollback netcode the framework doesn't provide — worsened by the Cloudflare Tunnel relay hop.

## 2. Hidden + simultaneous state

You're already most of the way there. `playerView` strips opponents' hand tiles and zeroes the pool, server-side — so **peek** is just a time-boxed grant stored in `G` (`G.peekGrants[viewer]=expireAt`) that `playerView` honors; **team hidden state** (D) is the same strip relaxed for teammates. Cheap and fully server-authoritative.

The expensive part is the **reaction window**. The server can't trust the client to report "3 seconds elapsed," and unlike the turn timer the *beneficiary* (attacker) wants the window to close — the defender has no incentive to self-report the deadline. So you must add an **external scheduler** (a tick service injecting a "window-closed" move). Over the Tunnel, each window also costs a relay round-trip in *and* out; a 2-3s window feels fine, a 500ms "parry" will feel laggy and unfair to the higher-ping seat.

## 3. Determinism, undo, and effects

The undo design already protects you: `onTurnBegin` does `G.gameStateStack = []`, and `undo` only restores board tiles plus the **current player's own** hand. So damage received during an opponent's turn has no snapshot on your stack — **you can't undo garbage you took**. The integrity rule to preserve this: **apply attacks/power-ups at turn-commit (`applyValidMove`/`onTurnEnd`), never as an in-turn undoable move** — otherwise an attacker could `undo` their own attack after seeing the result. Commit effects *after* the undo stack stops mattering, exactly where `freezeTmpTiles` + `endTurn` already live.

## 4. Anti-cheat / fairness online

**Safe:** server-set deadlines the client can't forge (`timerExpireAt`); `extendTurn` only moves the clock *forward*, once; damage applied server-side at commit. The existing `forfeitSeat` already scores a rage-quitter's hand server-side — so **apply attack damage at commit/persist it as pending**, and disconnect-to-dodge eats the damage anyway.

**Risky:** any window whose expiry is reported by its beneficiary; **latency advantage** in real-time grabs (lower-ping wins every contested tile = pay-to-win-by-ISP); client-resolved reaction outcomes. Keep all resolution on the server tick, never the socket that benefits.

## 5. Matchmaking / liquidity / async

Today: boardgame.io `LobbyClient` invite-rooms (`unlisted`), **no MMR, no quick-match, no bots**. For a small game, liquidity is the real constraint. Degrade-gracefully ranking: **A and D** play fine async (turn-based, push effects land whenever the victim returns). **B-windows and C** *die* without concurrent humans and have **no bot fallback** — Rummikub's branching factor makes a real bot a project of its own. Recommend: rooms + async drop-in as the spine; add a public quick-match queue only after a bot exists as filler. Ranked/leagues/seasons (E) need a **player-identity + MMR datastore boardgame.io does not have** (its DB is per-match) — that's a net-new subsystem, not a config change.

## 6. Cost-to-build ranking (cheapest → most expensive)

1. **A — Garbage/Attack:** tiles appended at turn-commit on the existing reducer; reuses `applyValidMove`'s score. No new timing/transport. *Stays turn-based.*
2. **E (async rooms only):** rooms + FlatFile persistence already exist; the *ranked ladder* is the costly part (new identity/MMR store).
3. **D — Teams 2v2:** mostly playerView + scoring + lobby team-assignment; turn-based. No new infra.
4. **B — power-ups + windows:** on-your-turn power-ups cheap; the **reaction window needs an external scheduler** + new integrity surface. *Leaves the pure move model.*
5. **C — real-time grab market:** needs bespoke low-latency netcode + rollback; **off-model**, Tunnel-hostile.

**Recommendation:** Ship **A — garbage/attack resolved at turn-commit**: maximum PvP impact for the least risk, riding the move-log, undo-reset, and scoring seams already present, with zero new timing or transport. **Avoid C (real-time grab market)** as the online-systems trap — it forces a solo maintainer off boardgame.io into custom realtime netcode behind a Cloudflare Tunnel that cannot be sustained.
