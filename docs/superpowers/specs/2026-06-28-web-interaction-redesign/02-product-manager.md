# RummyCube — Interaction-First Mode: Product Report
**Author:** PM lens · **Date:** 2026-06-28 · Confidence noted inline

## 1. The Player Limitation We're Solving
Classic RummyCube is structurally *multiplayer solitaire*. Once learned, the shared table is a quiet optimization puzzle solved largely in parallel — opponents rarely threaten you in the moment, and when the match ends everyone closes the tab. There's no rivalry, no revenge, no reason to return tomorrow. Critically, the product has **no persistent identity** (nickname + room link only), so retention can't come from accounts or progression — it has to come from *the match itself*.

"More direct interaction" buys three things in product terms:
- **Session length** — swing moments plus a rematch loop turn one match into a 3–5 match sitting.
- **Why-play-again** — a grudge is free re-engagement. "You junked me, run it back" is the cheapest retention mechanic in social games, and we build no notification system to get it.
- **Virality** — PvP drama is *tellable*. The app already spreads by link-sharing; more tension raises the "send this to a friend" rate.

The puzzle isn't broken — it's elegant. What's missing is **stakes between people**.

## 2. Scope: In vs Out (MVP Mode)
**MVP = Direction A, scoped to one new rule.** We already compute a server-side combo tier. **Brawl mode** converts that tier into *garbage tiles pushed onto a rival's rack.* This is the smallest possible delta: it reuses the combo engine, turn clock, draw-from-pool, juice/confetti, and chat — and needs **zero new win/lose logic**, because the win condition is already "empty your rack first," so a fatter rack is *automatically* "further from winning." No points pad (which the owner rejected); no new screens.

**IN:** combo→garbage (auto-targeted in v1), an in-match "you hit Bob" beat, a **rematch button**, a **mode toggle at room creation**.
**OUT (v2+), per YAGNI:** power-up inventories/freeze/peek/steal (B — new economy + touches the privacy seam, our most security-critical code); the real-time tile market (C — rewrites the turn model); 2v2 teams (D — needs 4 coordinated humans + linked racks); ranked/seasons/leagues (E — needs accounts we don't have *and* perpetual ops a solo dev can't sustain). Also out: player-chosen targeting, garbage countering, stranger matchmaking. We build exactly enough to test one thesis: *does direct interaction make matches longer and more re-playable?*

## 3. Differentiation & Positioning
Every other online Rummikub is a *sterile reproduction of the physical box* — slow, turn-by-turn, ad-heavy, inheriting cardboard constraints for no reason. RummyCube already wins on feel (juice, self-tidying board, 10s turns, no install). Brawl makes it the **Tetris 99 of Rummikub** — the version you play to mess with friends. **Who it's for:** *not* the calm purist (they keep classic). The wedge is **lapsed/casual "party-with-friends" players** — the Uno/Jackbox/.io-on-a-Discord-call crowd. Secondary: skill players, since combo→attack rewards clever rearrangement, so the weapon is skill-expressive, not random. Incumbents won't copy this — they're anchored to the board metaphor — so it's defensible for a solo dev.

## 4. Mode Strategy
**No second matchmaking queue** — that's the liquidity trap. Our model is room-link/lobby, so the host **toggles Brawl at room creation**; the whole room plays it. Classic stays the **default** and first-run experience (newcomers must not be dropped into chaos). Because Brawl is *identical rules + one twist*, learning cost is ~zero. One shared lobby keeps the thin population visible to itself.

## 5. Engagement / Retention Framing
Spend the retention budget on the *match*, not on identity infra.
- **Build:** rematch / "run it back" (highest ROI — lobby already exists); frictionless room reuse (create→share→play <10s); emotes/taunts tied to attacks (chat already ships) — the virality engine.
- **Defer/skip:** ranked/MMR/seasons (need accounts + perpetual ops — a treadmill that punishes the maintainer); full async Words-With-Friends play (a *different* product that kills the live-tension thesis); cosmetics/profiles (need identity we don't have).

## 6. Top 3 Risks
1. **Real-time liquidity** — a brawl needs ≥2 humans at once; indie concurrency is thin and bursty. *Mitigate:* friends-first (bring your own opponents), extend the **existing solo/bot mode** so attacks work vs AI, and make **2-player** brawl genuinely fun.
2. **Scope creep sinking a solo project** — A–E is a year of work. *Mitigate:* hard-gate to one rule; B/C/D/E stay a backlog behind validated learning; don't bolt a mode onto the in-flight architecture refactor — sequence it onto the cleaned kernel.
3. **Alienating the calm audience + snowball unfairness** — *Mitigate:* classic stays the untouched default, Brawl strictly opt-in; **auto-target the leader** (rubber-band, not dog-pile the loser) and cap garbage; playtest before promoting.

## Recommendation
**Ship Brawl = combo-powered garbage (A) + a rematch button, friends-first with bot-fill, as the MVP. Defer power-ups (B), the live market (C), teams (D), and — hardest — ranked/seasons (E) until A proves matches run longer and groups hit "run it back."** Confidence ~75%.
