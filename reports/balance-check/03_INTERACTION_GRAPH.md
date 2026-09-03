# 03 — Simulation-Blind Baseline: Option Bundles, Interaction Graph, Counterplay, Reachability

Phases 3–4 · **FROZEN BEFORE any aggregate win-rate or rank-performance data was consulted** (aggregate.json was opened in Phase 0 only for version/sample metadata; no per-rank performance fields were read). All statements are for the **AS-EXECUTED** game (01 §1.2) unless marked AS-WRITTEN. Evidence IDs: E-G*, IMPL-* from 01; class names from 02.

## 3.1 Reachability constants (hypergeometric, 54-card deck; SOURCE FACT computed, no simulation)

Deck model: 54 cards = 26 black (♣♠) + 26 red (♦♥) + 2 Jokers (**colourless — never Ultra components**, `core-advanced.js:60` returns `null`). "Seen" = cards that have passed through the player's hand. *Recomputed and cross-checked 2026-09-03 (independent second pass): 2B2R corrected for Joker neutrality; four-of-a-kind given for a specified rank AND for any of the 13 ranks; the {4♠,2♠,K♠} column is P(at least one of exactly those three cards).*

| Event | 5-card hand (P1 open) | 6-card (P2 open) | after 10 cards seen | after 15 seen |
|---|---|---|---|---|
| Hold one specific singleton (K♠, 4♠, 8♠, 2♠, A♠, Q♠, J♠, any 10, RJ, BJ) | 9.3% | 11.1% | 18.5% | 27.8% |
| Hold ≥1 of a **given** rank (4 copies) | 33.0% | 38.5% | 57.1% | 74.0% |
| Hold a true pair of a **given** rank (a specific ⭐, Queen's Court) | 3.9% | 5.7% | 15.2% | 30.6% |
| Hold a true pair of **any** rank (some ⭐ recipe exists) | 46.2% | 61.9% | 96.8% | ≈100% |
| Same-suit K+Q (Royal Marriage; any of the 4 suits) | 2.8% | 4.2% | 12.2% | 26.8% |
| ≥3 black cards (3-Black Ultra recipe) | 46.4% | 62.9% | 95.0% | 99.8% |
| ≥2 black **and** ≥2 red, Jokers excluded (2B+2R Ultra recipe) | **60.1%** | **77.3%** | 98.4% | ≈100% |
| Any Total-Clear access card — at least one of exactly {4♠, 2♠, K♠} | 25.7% | 30.3% | 46.6% | **63.2%** |
| Any Ace (counter) | 33.0% | 38.5% | 57.1% | 74.0% |
| Any Ace or Eight (any response card) | 56.7% | 63.7% | 83.0% | 94.1% |
| Four of a kind — **given** rank | 0.000% | 0.000% | 0.07% | 0.43% |
| Four of a kind — **any** of 13 ranks (AS-WRITTEN Sudden Death recipe) | 0.02% | 0.06% | 0.86% | 5.6% |

Note: "pair of any rank" being COMMON while "pair of a given rank" is RARE is the key accessibility asymmetry for Supers — a player usually *has* some Super recipe, but rarely the one that answers the current board.

Reachability classes used below: **COMMON** ≥40% in a typical hand · **PLAUSIBLE** 10–40% · **RARE** 2–10% · **CONSTRUCTED_ONLY** <2% or requires a multi-step exact setup.

## 3.2 Option-bundle baseline per rank (Phase 3; qualitative, mechanical only)

Columns: Pts = scoring fallback AS-EXECUTED · Modes = distinct non-scoring uses actually offered · Tempo = Mini-Turn cost class · Internal competition = how strongly the card's own modes compete for the physical card.

| Rank | Pts | Modes (AS-EXECUTED) | Timing | Internal competition | Note |
|---|---|---|---|---|---|
| A | 4 (Scuttle/Jack immune) | Base counter (Instant) · Purge · Anchor-Ace · ⭐A · A♠ Exile counter | Instant / Action | **High**: score-now vs hold-as-counter vs anchor; ⭐A needs 2 | Counter retention = threat value |
| 2 | 2 | Solo Wild (3/4/5/7 Base; 2♠: 4♠/6♠) · ⭐2 Commandeer · 10♦ pairing | Action | Medium: 2 pts is weak, so effect modes dominate | 2♠ singleton stands apart |
| 3 | 3 | present-take(≤2) · force-discard(≤2) · bounce · ⭐3(U, 1 card) | Action | Low–Medium | Hand-attack specialist |
| 4 | 4 (effect-immune in PR) | Row Clear PR / ER · ⭐4 Row Exchange · 4♠ Total Clear | Action | Medium | Board-reset family |
| 5 | 5 (Scuttle-immune in PR) | Recycle (mill 2 + GY rummage + GY bottom) · ⭐5(U) | Action | Low: 5 immune pts often best | GY recursion |
| 6 | 6 | Dig (+1 net) · 6♠ Deep Draw · ⭐6(U, defective) | Action | Medium | Selection engine |
| 7 | **0** | Topdeck (hand +1 revealed & generated effect/score) · ⭐7(U, defective) · copy source for K♠/2 | Action | **None** (no scoring) | AS-WRITTEN 7 pts + trigger |
| 8 | 8 (effect-immune) | Quick Aegis Field · Instant Scuttle Counter · 8♠ Free Scuttle · ⭐8 | Quick / Instant / Action | **High**: 8 pts vs Quick Aegis vs held counter | Dual-timing card |
| 9 | 9 (never Aegis) | Instant Tap · Nine Anchor (reveal + discard) | Instant / Action | Medium: 9 pts vs Tap (denies ≥ opp points) | Goal Shift absent |
| 10♣ | 10 via Foundation only (Aegis; bonus if at 0) | — | Action (Rank-10 slot, Exile-Bound) | Low | Scoring-only Ten |
| 10♦ | 10 | Mimic ⭐4 exch (solo) · +2: ⭐8 abs-scuttle / ⭐J tempo | Action (Rank-10 slot) | Medium | Narrow menu |
| 10♥ | 10 | +2 MT & draw 1 | Action (Rank-10 slot) | **High**: 10 pts vs 2 extra actions | Tempo engine |
| 10♠ | 10 | Stack Theft (Interrupt; both skip) · Exile Recovery | Interrupt / Action | High | Only stack-control |
| J | 3 | Disrupt (Instant, +1 card) · PR Attachment (steal +1) · J♠ ER Attachment · ⭐J +2 MT | Instant / Action | Low: 3 pts rarely best | Control family |
| Q | 2 PR / 0 ER | Anchor Guard (+entry Aegis) · Quick Aegis · Queen's Court · Royal Marriage · Q♠ clear-immune | Quick / Action | Low: ER almost always | Protection engine |
| K | 8 / Anchor 7 (K♠ 9) | Counter single Anchor (Instant) · Anchor · Royal Marriage · K♠: multi-play counter + Wild Sovereignty | Instant / Action | **High** (K♠ very high) | |
| RJ | 5 (Scuttle/Jack immune) | Hand Swap · Self Reset · Opponent Attack · Shuffle Reset | Action | Medium | Variance engine |
| BJ | **0** | Board Lock (Quick, free) · top Scuttle source | Quick / Action | Low (Board Lock dominates) | AS-WRITTEN 11 pts |

**Opportunity-cost graph summary (mutually exclusive uses of the same physical card):**
- K♠: Points 8 ⟂ Anchor 9 ⟂ hold for multi-play counter ⟂ Wild Sovereignty (→ Exile, card gone forever) ⟂ Royal Marriage with Q♠ (2.8–4% joint). Using Wild Sovereignty permanently forfeits the game's only Queen's-Court/Royal-Marriage answer.
- A: Points 4 now ⟂ hold (Instant counter) ⟂ Anchor (delayed counter that also steals a source) ⟂ pair for ⭐A ⟂ Purge. Two Aces held = ⭐A threat but 8 forgone points.
- 8: Points 8 ⟂ Quick Aegis (protect the board for one turn, no Mini-Turn) ⟂ hold as Scuttle counter. 8♠ adds free Scuttle.
- 10♥: 10 pts ⟂ +2 actions (+1 card). With ≥2 scorable cards in hand the tempo mode converts to ≥ 2 other scores.
- Ultra recipes consume 3–4 *flexible* cards — every component forgoes its own modes.

## 3.3 Interaction graph (directed edges; AS-EXECUTED)

Card nodes: 15 rank families + 15 distinct exact identities (A♠ 2♠ 4♠ 6♠ 8♠ 10♣ 10♦ 10♥ 10♠ J♠ Q♠ K♠ RJ BJ, and 7 as a no-score special) + Supers (⭐A ⭐2 ⭐4 ⭐8 ⭐J; U: ⭐3 ⭐5 ⭐6 ⭐7) + Ultras (3B, 3R, 2B2R) + Royal Marriage + Queen's Court. System nodes: PR ER DP GY EXILE SWAP STACK GOAL AEGIS GUARD ROYAL_SHIELD(absent) SCUTTLE TAP CONTROL VOLTAGE EXHAUSTED BOARD_LOCK ULTRA GENERATED RECURSION(absent) WILD MIMIC COUNTER_AUTH DEST_REPLACE.

### Edge list (selected; type → target)
| Source | Edge | Target | Basis |
|---|---|---|---|
| Q (ER) | PROTECTS | all other own OTT vs hostile single-target effects (GUARD) | `interactions.js:14-33` |
| Q, 8 Quick, 10♣ entry, ⭐4, QC/RM entry | PROTECTS (AEGIS) | own cards until next Start; never 9 | `lifecycle.js` |
| 2 untapped ER Queens | DENIES | ⭐A / 3-Red declaration against owner's plays | `core-authority.js:788-790` |
| A family | COUNTERS | effect plays & counters (Base); A♠ additionally EXILES sources; ⭐A additionally counters A♠, Ultra, SD, Board Lock | `ranks.js:254-278` |
| K (non-♠) | COUNTERS | single-card Anchor plays (Q/K/A/9 anchors, J attach?) | `core-authority.js:650-666` |
| K♠ | COUNTERS | any ≥2-source play: Supers, paired 10♦, QC, RM (not Ultra) | `core-authority.js:795-812` |
| 8 | COUNTERS | Scuttle (incl. 8♠ free) | `core-authority.js:634-648` |
| 3-Red Ultra | COUNTERS (as ⭐A) | anything ⭐A can, then RECOVERS (GY bottom draw) | `core-autonomy.js:371-375` |
| 10♠ Stack Theft | TRANSFERS | control of a pending single effect; CHANGES_TEMPO (both skip) | `ranks.js:643-663` |
| J (PR) / J♠ (ER) / ⭐2 | TRANSFERS (CONTROL) | enemy PR card (+1) / enemy Anchor / any enemy OTT (⭐2 BYPASSES Guard & rank immunity) | `core-effects.js:79-85`; `core-advanced.js:145-168` |
| 9 Tap | TAPS / DENIES | enemy PR points until they score | `core-authority.js:683-698` |
| 4 Row Clear / 4♠ Total / ⭐4 | CLEARS / TRANSFERS | rows (4♠ BYPASSES Guard, Aegis, Q♠) | `ranks.js:139-167` |
| 2♠, K♠ | SUBSTITUTES / COPIES | 4♠ Total Clear, 6♠ Deep Draw (K♠ also 3/5/7 Base) → CHANGES_ACCESSIBILITY of 4♠ from 1 copy to 3 access routes | `ranks.js:237-247,336-380` |
| 10♦ (+2) | MIMICS | ⭐4 / ⭐8 / ⭐J → CHANGES_ACCESSIBILITY of those Supers (pair → 10♦ [+2]) | `core-advanced.js:649-663` |
| 7 Topdeck, 3-Black cast, ⭐7(U) | GENERATES | one generated effect play (no recursion) | `core-private-choice.js:541-571` |
| 5 Recycle, ⭐5, 3-Red rider, Voltage-5, 6 Dig return | RECOVERS / RECYCLES | GY ↔ hand, DP | — |
| 10♠ Recovery, 2B2R rummage | RECOVERS | Exile → hand | `core-advanced.js:360-372,425-428` |
| A♠, 10♥, 10♠, K♠-Wild, 3B exile role, Exile-Bound 10s | EXILES | denies GY recursion | — |
| 10♥, ⭐J, 2B2R, 10♦+2 (⭐J) | CHANGES_TEMPO (+2 MT, cap 3) | action economy | — |
| BJ Board Lock | DENIES | all non-counter effects & Scuttle for 2 completed FTs; leaves scoring open | E-G10 |
| J Disrupt | DENIES | repeat of an Action type this FT; +1 card | — |
| 3 Hand Raid, Nine Anchor, RJ Opponent Attack | DENIES (hand) | opponent hand | — |
| Voltage 3/4/5 | SCORES / RECOVERS (free, Start) | requires ≥3/4/5 PR points of that rank (i.e., ≥1 card of rank 3/4/5 in PR untapped) | `core-advanced.js:686-702` |
| Exhausted | CHANGES_RESOURCE_ECONOMY | anchors become tiebreak currency (A/9/Q/K in ER) | `phase8.js:81-88` |
| GOAL | — | **no edges**: Goal Shift absent (IMPL-05) → GOAL is an isolated node AS-EXECUTED |

### Hubs (degree, qualitative)
- **Most enabling:** 2♠ and K♠ (SUBSTITUTE into 4♠/6♠; K♠ also 3/5/7), 10♦ (MIMICS three Supers), 7 (GENERATES).
- **Most enabled (accessibility multiplied by others):** **4♠ Total Clear** — reachable via 4♠, 2♠, K♠ (+1 discard): 3 physical routes (25.7–30.3% opening, 46.6% by 10 cards seen, 63.2% by 15). ⭐4/⭐8/⭐J via 10♦.
- **Most countering:** Ace family (4 cards + ⭐A + 3-Red Ultra proxy); K♠ (unique multi-play authority).
- **Most protected:** ER Queens (entry Aegis + mutual Guard + Two-Queen ⭐A denial + Q♠ clear immunity); PR 4/8 (effect-immune), A/5/RJ (Scuttle-immune).
- **Most copied/mimicked:** 4♠ (2♠, K♠), ⭐4 (10♦), 7 Base (K♠, 2, 10♦-U).
- **Most generated:** any card revealed by 7 Topdeck / 3-Black cast (effect or score).
- **Greatest synergy density:** Queens (Guard + Aegis + Court + Marriage + ⭐A denial + Exhausted anchors); 4 (clear + exchange + total + Voltage-4 + 2♠/K♠/10♦ access).
- **Greatest dependency density:** Voltage (needs rank-specific PR presence + Start timing), Royal Marriage (same-suit pair), ⭐A (two Aces), 10♠ Stack Theft (opponent must have a pending single effect), 10♠ Recovery / 2B2R rummage (non-empty Exile).
- **Highest threat value (latent):** held Ace (33–38% opening), held 8 vs Scuttle, K♠ vs any multi-card play, 3 red cards in hand (silent ⭐A-equivalent).
- **Highest systemic leverage:** BJ Board Lock (freezes the effect economy globally), 4♠ Total Clear (resets both boards), 2B2R Ultra (COMMON +2-action burst).
- **Isolated mechanics AS-EXECUTED:** GOAL manipulation (absent), Royal Shield (absent), Sudden Death (dead), recursion (absent), Swap Bar (touched only by 6 Quick Peek AS-WRITTEN — absent; Swap Bar interacts with nothing but the two swap actions).

### Loops
- **Protection loop:** Queen A guards Queen B and vice-versa (mutual Guard) → single-target answers (J♠, 3 bounce, A Purge bounce, 9 tap n/a) blocked; only multi-target/structural (4 Row Clear ER after Aegis lapses, 4♠), control-bypass (⭐2), or Scuttle-N/A. **Terminates**: Row Clear ER removes all non-Q♠ Queens once entry Aegis expires (next Start). With Q♠ + Queen: Row Clear leaves Q♠ alone; Q♠ alone does not guard itself → J♠ / 3 bounce / A Purge then legal. **Not a lock.**
- **Counter loop:** counter-on-counter chains are finite (each consumes a card; Ace supply 4).
- **Resource loop:** 5 Recycle ↔ GY: mill 2, take 1 rummaged + 1 GY-bottom = +2 cards for 1 card & 1 MT (net +1 hand, and it fuels its own future: the 5 itself goes to GY bottom-eligible). Not repeatable within FT (1 MT each), bounded by Fives (4) and DP.
- **Tempo loop:** 10♥/⭐J/2B2R stack to cap 3 (no over-cap). 2B2R each FT is bounded by hand size (−4 +2 −0 = net −2 per use unless the extra actions Draw).
- **Scoring acceleration:** 10♣ Foundation at 0 points = 10 + bonus card in one MT with Aegis (comeback-flavoured, requires empty PR).
- **Denial chain:** Board Lock → opponent's only plays = Draw/Score/Swap → 9 Tap and Scuttle unavailable to both → leader locks the race.
- **No infinite / resource-positive repeatable loop found** (recursion absent, Ultra/Rank-10/QC once per FT, Mini-Turn cap 3).

## 3.4 Counterplay audit (Prevention / Response / Recovery), AS-EXECUTED

| Mechanic | Prevention | Response (legal & practical) | Recovery | Practical accessibility of answers | Overall agency |
|---|---|---|---|---|---|
| Play for Points (any) | 9 Tap pre-emptive? no (Tap is reactive to PR) | none (scoring does not use the stack) | Scuttle (needs higher rank/suit; A/5/RJ immune), 9 Tap, 4 Row Clear PR, J PR attach (steal), ⭐2, ⭐8 | Scuttle sources are COMMON; high-rank PR (9/10/K) needs J/Q/K/RJ/BJ scuttlers or 8♠/⭐8 | ROBUST |
| Ordinary Scuttle | Aegis (8 Quick / Q Quick), score immune ranks | 8 Instant counter (4 copies; 33–38% held) | re-score | COMMON | ROBUST |
| 8♠ Free Scuttle | Aegis, immune ranks | 8 counter | — | 1 copy attacker; 8-counter COMMON | ADEQUATE |
| ⭐8 Absolute Scuttle | Aegis only | K♠ (multi-card) or 8 counter? (⭐8 is a Super *action*; 8 Instant targets pending Scuttle — **UNVERIFIED** whether ⭐8 stack item qualifies) | re-score | pair RARE→PLAUSIBLE | ADEQUATE |
| Single-card effect (3/4/5/6/7/A-Purge/J attach/RJ) | Guard (single-target ones), Aegis | Base Ace / A♠ / ⭐A / 3-Red; 10♠ theft | varies | Aces COMMON | ROBUST |
| Anchor play (Q/K/A/9) | — | ordinary K (Instant; 3 non-♠ Kings) + K♠ | Row Clear ER, J♠, ⭐2, A Purge bounce | Kings 33% held | ADEQUATE |
| Supers (⭐2/⭐4/⭐8/⭐J) | — | **K♠ only** (Ace family cannot: multi-card *effect*? — spec AS-WRITTEN says Base Ace may counter multi-card *Effect* when unprotected; engine: **UNVERIFIED** whether `targetAcceptsBaseAce` admits ≥2-source Super items; W2 lists K♠ as the multi-source counter) | ⭐4: re-exchange with own ⭐4/10♦; ⭐2: re-steal | K♠ singleton 9–11% opening | **NARROW** (if Ace excluded) |
| Queen's Court / Royal Marriage | — | K♠ only (by rule) | Row Clear ER after Aegis lapses; 4♠ | 1 card | NARROW by design (RB:1750-1752) but recoverable → ADEQUATE overall |
| Ultras (3B / 2B2R) | — | ⭐A or 3-Red only | 3B: re-clear scored card; 2B2R: none (tempo spent) | ⭐A pair RARE (given-rank pair 3.9–5.7%); 3 red PLAUSIBLE–COMMON (62.9% of 6-card hands hold ≥3 red — but must be *held at that moment* and costs the Ultra slot + 3 cards) | ADEQUATE-to-NARROW |
| 3-Red Ultra (counter) | 2 untapped ER Queens | ⭐A / another 3-Red | — | | ADEQUATE |
| Board Lock | 2+ untapped Queens does the *opposite* (protects BJ owner) | ⭐A or 3-Red only, at the moment BJ is declared | none for 2 FTs; scoring race continues | ⭐A RARE, 3-red PLAUSIBLE | **NARROW** |
| 4♠ Total Clear (3 routes) | Nothing protects (structural bypass) | Base Ace / A♠ / ⭐A / 3-Red (it is a single-card effect) ; K♠ Wild version also a single-card effect → Ace-counterable | rebuild | Aces COMMON | ADEQUATE |
| ⭐2 Commandeer | Aegis only | K♠ | re-steal / Row Exchange | | NARROW (if Ace excluded) |
| 10♠ Stack Theft | don't declare effects while 10♠ plausible (threat) | Ace family vs the theft (Interrupt is an effect play) | both skip → symmetric | 1 card | ADEQUATE |
| 9 Tap | Aegis (8 Quick, Q Quick), Guard? (Tap is single-target hostile → **Guard blocks** per W2) | Ace family | score anything → untap | | ROBUST |
| J Disrupt | — | Ace family | choose a different Action type | | ROBUST |
| Voltage | deny rank-3/4/5 PR via Scuttle/Tap/Clear before their Start | **none** (no stack) | — | | ABSENT_BY_DESIGN (small payoff) |
| Exhausted anchors race | — | K counter vs anchor plays, Row Clear ER | | | ADEQUATE |

**Verification debts — CLOSED:** CP-V1: Base Ace / A♠ counter **only** `stackClass "ordinary-effect"` primaries (`core-authority.js:258-275`); Supers (`super`), Rank-10 (`rank10`), Ultras, QC, RM are excluded → Supers: **K♠ or ⭐A/3-Red only**; **solo Rank-10 effects: ⭐A/3-Red only** (IMPL-12). ⭐A accepts any pending item incl. Anchors/QC/RM (IMPL-13). CP-V2 (8 Instant vs pending ⭐8): ⭐8 is a `super`-class primary; the 8 counter targets `scuttle`-class items → **UNVERIFIED but likely not**; K♠ remains the answer. Counterplay rows above are amended accordingly: Supers = **NARROW**, solo Rank-10 = **NARROW** (was ROBUST-by-Aces), ⭐2 = NARROW.

## 3.5 Stress-state reachability (for use in 09/10)

| # | State | Reachability | Cards whose value shifts most |
|---|---|---|---|
| 1 | Opening hand (5/6) | COMMON | 2B2R Ultra (60–77%), Aces held, 10♥ |
| 2 | Early empty board | COMMON | 10♣ Foundation bonus (points=0), Guard irrelevant, Scuttle dead |
| 3 | Far behind (≥10 pts) | COMMON late | 4 Row Clear PR, 4♠, ⭐4 PR exchange (swing), ⭐2, 10♣, Board Lock bad |
| 4 | Far ahead | COMMON late | BJ Board Lock, 8 Quick Aegis, Q Anchor, 9 Tap |
| 5 | Player near Goal | COMMON | Aegis/Guard; 10♥ (+2 MT to finish) |
| 6 | Opponent near Goal | COMMON | 9 Tap, Scuttle, Row Clear PR, ⭐4 exchange, Board Lock (freeze their effects — but not their scoring) |
| 7 | Low hand (≤2) | PLAUSIBLE | 6♠ needs another card; Ultras impossible; Draw (2 if empty) |
| 8 | Large hand (≥7) | PLAUSIBLE (after 6/RJ) | Ultras, Supers, QC |
| 9 | Low DP (<6) | PLAUSIBLE late | 5 Recycle mills, 6♠ draw 6 short, 7 reveal short, Exhausted threat |
| 10 | Exhausted active | PLAUSIBLE late | Anchors (A/9/Q/K) become win condition; Draw illegal |
| 11 | Rich GY | COMMON mid | 5 Recycle, Voltage-5, 3-Red rider |
| 12 | Rich Exile | RARE (needs A♠ counters, 10♥/10♠/K♠-Wild, 3B exile) | 10♠ Recovery, 2B2R rummage |
| 13 | Empty Exile | COMMON | 10♠ Recovery dead |
| 14 | Queen fortress (2+ untapped ER Queens) | PLAUSIBLE (pair 15% by 10 seen; or sequential anchors) | ⭐A/3-Red denied; 4 Row Clear ER, 4♠, ⭐2 |
| 15 | Aegis-heavy board (8 Quick / ⭐4) | PLAUSIBLE | A Purge, 4♠ |
| 16 | High PR board | COMMON late | Row Clear PR, ⭐4, Scuttle |
| 17 | High ER board | PLAUSIBLE | Row Clear ER, K counters, J♠ |
| 18 | Board Lock active | PLAUSIBLE (1 BJ; 11% held by 6 cards) | only Draw/Score/Swap; 9 Tap illegal? (Tap is a non-counter Instant effect → **illegal** under lock) |
| 19 | Heavy tap state | RARE (Nines ×4; untap on score) | scoring untaps |
| 20/21 | Goal increased / reduced | **UNREACHABLE AS-EXECUTED** (IMPL-05) | — |
| 22 | Opponent holds plausible counters | COMMON (57–64% hold A or 8) | all effect plays; Supers/QC/RM only fear K♠ |
| 23 | Card-starved late | PLAUSIBLE | 5, Voltage-5, 3-Red rider, 10♠ recovery |
| 24 | Resource-rich late | PLAUSIBLE | Ultras, Supers |
