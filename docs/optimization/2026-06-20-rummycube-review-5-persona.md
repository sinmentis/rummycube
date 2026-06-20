# RummyCube Expert Review 5 — Persona Cognitive Walkthrough

**Reviewer:** Persona Walkthrough Specialist agent (claude-opus-4.8) · **Date:** 2026-06-20
**Persona:** "Mei", 32, casual web/mobile gamer, has played simple card/tile apps but has NEVER played Rummikub and does not know its rules. A friend sent her a room link. Low patience — confused for >3 seconds = frustration.
**Scope:** first-session cognitive + emotional walkthrough; commercial concerns excluded.
**Method:** walked the live site (homepage, join link, waiting room, solo game board, the red/green End and its hidden penalty, phone layout) and cross-checked behavior against code. Qualitative simulation, not statistical evidence — validate with real session recordings.

## Walkthrough (See / Think / Feel)

- **Step 1 — Friend's link → Join page.** SEE: clean cream card, room code, name box, "Friend joined / Seat 2 open." THINK: "type my name, hit Join, simple." FEEL: ✅ reassured — the best screen in the product.
- **Step 2 — (If she hits the homepage first.)** SEE: Create/Join tabs + "3 games in progress / 1 room waiting / 0 players online." THINK: "Am I making a game? And '0 players online'… is anyone here?" FEEL: 😕 mild dissonance — low stats read as a ghost town.
- **Step 3 — Joins → Waiting Room (2/4 seats).** SEE: a felt table that looks exactly like a live game; her 14 tiles; faint "Seat 3/4 waiting…"; an "Invite a player · room / Copy link" panel; Draw/Undo/Redo greyed. THINK: "Is it my turn? Why is nothing clickable? It says 'Invite a player' — I thought I was invited?" FEEL: 😟 confused within ~3s. **Prime bounce moment #1** — looks playable but isn't, no "Waiting… 2 of 4", and the only CTA tells her to recruit strangers.
- **Step 4 — Game begins, her first turn.** SEE: buttons light up, a timer ring drains blue→red, a big empty green field, one black tile with a smiley face. THINK: "Go go go — do what? Which tiles? What's the smiley?" FEEL: 😰 anxiety — nothing states the goal, what's valid, or that the smiley is a joker; the clock is running.
- **Step 5 — Tries to move.** SEE: drags a tile up; the board has no visible cells; some drags snap back (2 of 3 bounced in the live run). THINK: "Why did that go back? Is there a grid?" FEEL: 😤 fiddly — the interaction fights her before rules even matter.
- **Step 6 — The red End button.** SEE: lines up a few tiles; the button turns red, says "End." THINK: "Red means stop? Or End = submit? It was 'Draw' a second ago…" FEEL: 😕 ambiguous — silent label+color swap, no "this would be rejected" or why.
- **Step 7 — Hits red End → hidden penalty.** SEE: red flash + buzz, tiles fly back, tile count goes 14 → 13 → **15**, turn ends. THINK: "I have MORE tiles now? Did I get punished? For what??" FEEL: 😡 the worst moment — invalid End rolls back, draws a penalty, ends the turn, and the real reason (≥30 first-meld) exists nowhere. **Prime bounce moment #2 — most damaging.**
- **Step 8 — Time pressure.** SEE: later turn, ring hits zero while she fiddles. THINK: "Will it skip me? Take my tiles? Penalise me again?" FEEL: 😨 dread — she never learned what the timer does.
- **Step 9 — A combo fires (if she stumbles into a legal ≥30 meld).** SEE: giant "COMBO ×N", confetti, sound, "+points." THINK: "Oh! That felt good — I did something right. …What exactly?" FEEL: 😄 genuine delight — but essentially unreachable by skill for a rules-naive player.
- **Step 10 — Chat.** SEE: top-right Chat, 💬 quick phrases, 😊 emoji, "Friend is typing…" THINK: "Nice, I can talk / send an emoji." FEEL: 🙂 delight — lowest-friction feature, feels human. One of the few things that just works.
- **Step 11 — On her phone.** SEE: 14-tile rack overflows off the right edge (tiles clipped); chat panel overlaps the table top + "Tiles left"; opponent avatars squished. THINK: "Where are the rest of my tiles? This box covers everything." FEEL: 😣 frustrated. **Prime bounce moment #3** — the mode her friend expects her to play in is the least usable.

## Findings

1. **Rules — especially the ≥30 first-meld — explained nowhere — Critical.** She can't form a legal first move and bounces at her first real turn. **Fix:** dismissible first-run coach card (goal + first-move ≥30 + run/set definitions) + a persistent "? / How to play".
2. **Red End triggers a silent penalty (extra tile + lost turn) — Critical.** Reads as "the game punished me for trying." **Fix:** show a plain-language reason before penalising; make the penalty explicit/optional, not an instant unexplained hand-size increase.
3. **Waiting room indistinguishable from a live game — High.** No "Waiting… 2 of 4", mysterious greyed buttons, CTA implies the invitee must recruit. **Fix:** clear waiting state (dim rack, "Waiting for players — 2/4 joined", spinner, relabel invite).
4. **Phone: rack overflow + chat occlusion — High.** She can't see her whole hand; chat covers the table header. **Fix:** horizontally scrollable/auto-fit rack on mobile; collapse chat to a tappable bubble that doesn't overlap the board.
5. **Invisible board grid / no drop targets — Medium-High.** Tiles drag onto a featureless field; near-misses snap back. **Fix:** faint cell guides / highlight valid drop slots on drag-start; snap to nearest slot.
6. **Ambiguous shape-shifting action button ("Draw" ↔ "End") + no turn cue — Medium.** **Fix:** clearer labels ("Draw & skip" / "Play these tiles"), a legend for the red state, an explicit "Your turn" banner.
7. **The joker/wildcard is an unexplained smiley tile — Medium.** **Fix:** label it "Joker (wildcard)" on hover/long-press and mention it in the coach card.
8. **Timer consequences never communicated — Medium.** **Fix:** first-turn microcopy ("When the ring runs out, your turn ends automatically") + a gentle last-seconds warning pulse.

## Top Pick
**Add a lightweight first-run "how to play" layer anchored to the ≥30 first move, and make the red End explain itself.** Every bounce traces to the same root: she never learns the goal/rules, so enforcement (red button, penalty draw, forced timeout) reads as random punishment. A short coach card (objective + ≥30 first-meld) paired with a self-explaining red End ("First move needs 30+ points — you have 8") converts her two worst moments (Steps 6-7) from "this game is punishing me" into "oh, that's the rule," and gives her a real shot at the COMBO celebration (Step 9), the product's strongest hook. Highest impact-per-effort for a rules-naive first session.

## Orchestrator cross-check
The phone rack-overflow + chat occlusion and the empty-void board were independently reproduced in my own 390×844 and 1366×768 screenshots. The "0 players online" vs "games in progress" contradiction is real on the live homepage.
