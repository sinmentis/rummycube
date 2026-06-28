# RummyCube: Interaction-First Redesign — Game Designer Report

## 1. Diagnosis

Classic Rummikub is *strategically* interactive but *experientially* solitaire. The shared table is a commons — opponents' melds are your raw material — yet the interaction is illegible, denial-only, and confined to your own turn. You never *do* anything to another player; you optimize your own rack in parallel, like two people racing adjacent crosswords. Three failures: the only attack is subtle positional denial (invisible to most players), nothing happens proactively, and turn-based-with-no-clock makes downtime dead time.

The **wrong** fix is random, mean, swingy weapons — "draw a card, opponent discards three." That's a blue shell: punishment without skill, exactly the "mean/random" the owner fears. The **right** fix follows Tetris 99's core insight: pressure isn't a power-up you find, it's a *consequence of playing well*. The attack vector should BE the puzzle. Skillful, efficient manipulation — what Rummikub already rewards — becomes the thing that pressures opponents. No luck, no bolt-on weapon UI.

## 2. Core mechanic — "Pressure" mode

Blend A + B into one loop where **the shared table is a contested battlefield and garbage is defended by solving the puzzle.**

Your rack size is already a health bar (playing shrinks it, drawing grows it). Map it to Tetris garbage:

- **Send by efficiency.** A big, clever play — placing several tiles, or a manipulation that discharges multiple of your tiles through the commons — banks *pressure*. Pressure **auto-targets the current leader** (smallest rack).
- **Garbage as puzzle, not punishment.** The target doesn't instantly eat junk. They get a **telegraphed, server-validated reaction window**: "Incoming tile next turn." That tile is plausibly *meldable*. Absorb it into the shared table and it's neutralized and fires counter-pressure back; fail and it lands on their rack.

This is the elegant core: **attack and defense are both just placing tiles on the commons.** Defense = play well = use the junk. The table grows more crowded and contested — the "self-organizing board" fantasy turned competitive. The puzzle isn't interrupted; it's intensified.

The decision space deepens. **Visibility tension** (pure Tetris 99): the big play advances you but flags you as leader and redirects the field's pressure onto you — or you stay quiet with a 1-tile play. **Routing**: spend a clean streak to hold or redirect pressure. **Prep**: reshape the table now to be ready to absorb what's incoming.

Earned, table-native power-ups season it (B), kept rare/telegraphed/defensive: a clean streak earns *Freeze a set for a round* (protect your absorption) or *Peek the pool*. Few, legible, skill-earned — never drawn. Off by default in ranked until proven.

## 3. Backup mechanic

Direction C, the **live contested tile pool**: replace the static face-down draw with a real-time face-up market players race to claim; the server resolves simultaneous grabs. Direct PvP — "you took the tile I needed" — without touching racks or garbage. Lower-variance, lower-drama, online-Mahjong/.io land-grab feel. It's the backup because it competes for resources rather than attacking: safer, but less tension. It can also layer *underneath* Pressure mode as the draw pool.

## 4. Balance & edge cases

- **Runaway leader:** auto-target-the-leader is the valve — the lead is a debuff; the field collectively pressures whoever's closest to winning (Tetris 99 KO-counter). Self-correcting.
- **Snowball:** cap incoming garbage (~2–3/turn); absorbed garbage *rewards* the defender, so skilled trailers ride attacks back upward.
- **Comeback:** absorption IS the comeback engine; the biggest rack gets a small pool-peek edge.
- **Jokers:** never weaponize a wild — too swingy/mean. Jokers stay pure-puzzle, classic rules, to protect elegance.
- **2p vs 4p:** 2p — no targeting choice, tune send ~40% down with longer windows; it's a tempo duel. 4p — *system-routed* targeting (not player-chosen) prevents ganging.
- **AP vs spam (the crux):** Rummikub needs a *stable table to reason about*, so **the table is frozen except on your own turn.** Pressure lives in a *generous, visible shot-clock* (~30–45s, online-Mahjong/Balatro) and garbage telegraphed a turn early — never a mid-thought mutation. Semi-real-time, never twitch. And you can't spam: the good move and the attack are identical, so spamming = playing badly = losing.

## 5. Downtime

It's a web game — give opponents a job. A **ghost board**: a sandboxed, non-authoritative copy of the table where you plan and pre-stage your next manipulation during others' turns; the server validates the instant your turn opens (and warns if the table shifted). Dead time becomes planning time — which also *lowers* AP on your turn. Players also read the live pressure meters (who's about to win, whom to redirect to), pre-stage absorption against telegraphed garbage, and fire quick emote/taunt reactions on attacks (Puyo Puyo Tetris energy, reusing existing chat bubbles).

## 6. Top 3 risks

1. **Runaway Leader** (sharper here, since skill→attack). *Mitigation:* lead = target; auto-routed pressure, garbage caps, absorption rewards trailers.
2. **Analysis Paralysis** (stakes worsen overthinking). *Mitigation:* table stable on your turn, generous visible clock, off-clock ghost-board prep, garbage always telegraphed. Pressure without chaos.
3. **Kingmaker + new-player feel-bad.** *Mitigation:* default pressure is *system-routed to the leader*, so no player crowns the king; manual redirect (if enabled) is costly, limited, telegraphed. Garbage is useful telegraphed tiles, not random junk; a casual ruleset adds a damage floor (no one-combo elimination); and **Classic mode stays untouched** as a permanent option.

**Recommendation:** Ship **"Pressure" mode** — efficiency-driven garbage that auto-targets the leader and is defended by absorbing it back into the shared-table puzzle (Tetris-99 logic on Rummikub's commons). Backup: the **live contested tile pool (C)**.
