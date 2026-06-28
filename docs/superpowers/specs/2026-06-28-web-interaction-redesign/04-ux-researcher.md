## RummyCube — Interaction-First Mode: A UX Research Read

I grounded this in the shipped build: a self-tidying shared board, a soft turn clock with *extend-turn* and *forfeit*, canned quick-chat speech bubbles, reconnect-to-seat, a coach card, and a reduce-motion-aware juice layer. Those existing affordances matter — they're the calm baseline any new mode must not break.

### 1. Does it feel good to existing players? Where the line is

This audience plays to relax and think; the puzzle *is* the dopamine. Tension is welcome when it's **symmetric, anticipated, and recoverable**. It turns *mean* the moment harm is **surprising, directed at me personally, and destroys work I already did with no response available**. Loss aversion means a stolen meld hurts ~2× more than an equivalent gain delights.

- **A — Garbage/Attack:** Shatters it. Junk dumped onto my rack is punishment I didn't cause and can't pre-empt; it erases the contemplative scan. Most alienating.
- **B — Weaponized table + power-ups:** Mixed. *Peek* is mild; *freeze/steal* are directed harm and cross the line. Reaction windows load a working-memory task with real-time vigilance.
- **C — Live tile market:** Exciting but **fastest-clicker wins, not best thinker** — it swaps Rummikub's skill for reflexes and punishes the exact slow/older/mobile base.
- **D — Teams 2v2:** Adds *connection*, not aggression. Tension comes from shared problem-solving and hidden coordination over a still-stable board. Lowest feel-bad, highest warmth.
- **E — Live-ops:** Orthogonal. Adds stakes via progression, not in-match meanness — safe, but doesn't deliver "direct interaction" on its own.

### 2. Teachability & cognitive load

A Rummikub turn already maxes working memory (scan the shared table for re-melds). Anything real-time creates **dual-task interference** — the new layer evicts the puzzle from attention. Added load, worst→best: **C ≈ A** (constant vigilance + reactive defense) > **B** (reaction windows) > **D** (near-zero marginal load if coordination is optional/async — your partner reasons in parallel and you can ignore them and still play). The <2-min bar is only clearable by **turn-based, optional, single-tap** affordances; real-time vigilance is not teachable that fast to casual older mobile players.

### 3. How it breaks at the (virtual) table

- **Toxicity:** Directed attacks/steals weaponize emotes. Canned quick-chat (already shipped) beats free text, but "👋" after a steal still stings — attacks hand griefers a mechanic.
- **Rage-quit / disconnect:** A/B/C incentivize quitting when targeted; reconnect-to-seat helps, but an attack landing on a disconnected player reads as broken.
- **Dogpiling (3–4p):** Free target selection means everyone hits the leader *or* the weakest — both feel-bad; the obvious loser gets ganged.
- **Latency / slow phones:** Real-time grab (C) and reaction windows (B) are unwinnable on lag — discriminating by device against the core base.
- **Accessibility:** Hard shot-clocks and reaction windows punish motor/visual impairment; attack VFX must honor reduce-motion.

### 4. Pressure vs paralysis

Manipulation needs a **stable table to reason against**. Real-time churn (C) or an opponent rearranging mid-thought (B) causes *both* stress *and* analysis paralysis — the board you planned against vanishes. Fix: **freeze the table during my turn; push interaction into the seams** (between turns, async). Keep it alive with **reaction emotes, "thinking…/seen" presence cues, soft extendable timers (already shipped), async nudges, and telegraphed threats I can prepare for next turn** rather than ambushes applied now. *Telegraph + delay = tension without cruelty.*

### 5. Inclusivity & onboarding

Default is **Classic calm — never auto-matched into spice**. Separate queues by appetite; never seat a relaxed classic player into an attack lobby. Let players learn the spicy layer vs bots/solo first, introduce **one mechanic at a time**, and reuse the coach card plus a no-stakes practice round.

### 6. Top 3 UX risks & mitigation

1. **New-player feel-bad (asymmetric punishment):** make effects symmetric and telegraphed, target the *board* not the person, guarantee a recovery path, and cap losing-streak punishment.
2. **Toxicity / griefing:** positive-only canned emotes, no post-attack taunts, no free target-select in 3–4p, plus mute/report/timeout.
3. **Overload / mobile ergonomics:** turn-based not real-time, single-tap affordances, table stable during your turn, generous soft timers, honor reduce-motion.

### Recommendation

**Lead with D (Teams 2v2)** — it delivers genuine PvP tension through alliance and hidden coordination while protecting the stable, meditative table, then layer a *softened, telegraphed, board-only* slice of B's power-ups as opt-in spice and E as the persistent wrapper; treat A and C as off-core for this audience.
