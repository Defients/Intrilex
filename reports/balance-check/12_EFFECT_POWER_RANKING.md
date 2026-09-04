# 12 — Intrilex Card Effect Power Ranking & Pairwise Hierarchy

**Final Analytical Extension · Intrilex Complete Balance Check Pass**
**Governing Task Specification:** `/BALANCE_CHECK_PASS.md`
**Authority Boundary:** Product `0.28.0` · Engine `4.2.6` · Rulebook `v4.3.1` · Commit `e4c22228`
**Scope:** Exhaustive evaluation of **75 distinct Effect Primitives** accessed via **101 AS-WRITTEN Declaration Routes** and **75 AS-EXECUTED Declaration Routes**.

---

## 1. Executive Summary & Dual-Authority Method

The existing 15×15 rank-family matrix evaluated cards at the level of physical rank abstractions. However, Intrilex cards are multifaceted option bundles where physical rank, scoring value, effect primitive, and declaration route interact. This report establishes the complete power hierarchy of Intrilex's mechanics without conflating intrinsic effect potency with declaration access costs.

### Dual-Authority Classification
1. **AS-WRITTEN (Rulebook v4.3.1):** Evaluates all **101** intended declaration routes in the published game rules. Where engine implementation is missing or defective (`IMPL-01..13`), the mechanical power is analyzed from rulebook authority, confidence is adjusted, and empirical metrics are marked `NOT_OBSERVABLE`.
2. **AS-EXECUTED (Engine 4.2.6):** Identifies the **75** routes currently functional in executable code (status `MATCH`, `CONFLICT`, or `UNRESTRICTED_ONLY`), isolating engine bugs (such as Unrestricted Sudden Death `DEG-01`, empty ⭐6/⭐7 payloads `IMPL-03`, and scoring-rider refusals `IMPL-01`).

### Separation of Primitive vs. Route
* **Effect Primitive:** The intrinsic mechanical outcome (e.g. `TOTAL_CLEAR`, `BOARD_LOCK`, `TEMPO_SPIKE`). There are **75** mechanically distinct primitives.
* **Declaration Route:** The specific operational path used to declare a primitive (e.g. Natural `4♠`, `2♠` Solo Wild, `K♠` Wild Sovereignty). There are **101** AS-WRITTEN routes and **75** AS-EXECUTED routes.

### Separation of Opportunity Cost Fields
* **Points Forgone:** PR points sacrificed by not scoring the source card(s) for points.
* **Extra Cost Note:** Additional costs beyond PR points — discards, Full-Turn skips, card exiles, multi-card commitments.

---

## 2. The Complete Effect Inventory

The Intrilex card pool generates **75 mechanically distinct Effect Primitives** accessed via **101 AS-WRITTEN Declaration Routes** across all 15 rank families, suit variants, multi-card Supers, Ultras, and Voltage triggers.

### Primitive Category Breakdown
* **Counters & Reactive Disruption (10 primitives):** Base Counter, Exile Counter, Anchor Counter, Super Counter, Anchor Counter (King), Multi-Play Counter (K♠), Scuttle Counter, Disrupt, 3-Red Ultra Counter, 10♦ Paired Mimic ⭐A.
* **Structural Wipes & Row Clears (7 primitives):** Total Clear (4♠), Row Clear PR, Row Clear ER, Row Exchange PR, Row Exchange ER, Q♠ Special Clear Immunity, Purge Scrap Aegis.
* **Tempo & Action Acceleration (5 primitives):** Tempo Spike (10♥), Tempo Force (⭐J / Paired Mimic), 2B+2R Ultra Draw, 2B+2R Ultra Rummage, 2 Quick Score+Discard.
* **Control & State Inversion (8 primitives):** Board Lock (BJ), Commandeer Hold (⭐2), Commandeer Score (⭐2), PR Attachment (Jack), ER Attachment (J♠), Stack Theft (10♠), Instant Tap (9), Purge Bounce Anchor.
* **Card Advantage & Hand Sculpting (10 primitives):** Dig (6), Deep Draw (6♠), Super Dig (⭐6), Quick Swap Bar Peek (6), Hand Raid Present-Take (3), Force Discard (3), Super Raid (⭐3), Enhancement Raid (3♠), Nine Anchor Discard, Quick Natural (4).
* **Graveyard & Exile Recursion (9 primitives):** Recycle (5), Super Recycle (⭐5), 4 Position-Based Exile Rummage Windows (5♣/♦/♥/♠), Exile Recovery (10♠), Exile Recycle Trigger (BJ), Scuttle Bonus Draw (8).
* **Topdeck Generation & Engine Chains (5 primitives):** Topdeck Casting (7), Topdeck Reveal 3 (7♠), Recursive Topdeck (Physical 7), Sequential Topdeck (⭐7), Scoring Trigger (7).
* **Endgame Timers & Alt-Wins (3 primitives):** Sudden Death Activation, Sudden Death Dead Action (Defect), Foundation Scoring Surge (10♣).
* **Protection & Passive Buffs (6 primitives):** Quick Aegis Field (8), Quick Aegis Target (Queen), ER Guard Provider (Queen), Queen's Court Double Anchor, Royal Marriage Entry, Royal Shield Protection.
* **Goal Warfare & Variance Resets (7 primitives):** Goal Shift +3, Goal Shift +5 Discard, Goal Shift 9♠ Net -2, Hand Swap (RJ), Self Reset (RJ), Opponent Attack (RJ), Shuffle Reset (RJ).
* **Start-Phase Voltage Engines (3 primitives):** Voltage ⚡3 Sleight, Voltage ⚡4 Predictable, Voltage ⚡5 Refinement.
* **Tactical Removal (2 primitives):** Free Scuttle (8♠), Absolute Scuttle (⭐8).

---

## 3. The Six Power Rankings

The six ordinal rankings evaluate different axes of power:
* **Ranking A (Raw Effect Potency — 75 Primitives):** The game-altering capacity of the resolved effect primitive in a vacuum, ignoring access cost. Each primitive is scored by the highest rawPotencyScore across all its declaration routes.
* **Ranking B-W (Practical Strategic Value AS-WRITTEN — 101 Routes):** Realistic value across all game states under Rulebook v4.3.1, incorporating timing, flexibility, opportunity cost, and counterplay.
* **Ranking B-E (Practical Strategic Value AS-EXECUTED — 75 Routes):** Realistic value limited to routes functional in Engine 4.2.6.
* **Ranking C (Efficiency — 101 Routes):** Payoff relative to cards, actions, and points sacrificed.
* **Ranking D (Threat Value — 101 Routes):** Latent deterrence — how much does the mere existence of this card in hand suppress opponent actions.
* **Ranking E (Comeback Value — 101 Routes):** Value when significantly behind on points.
* **Ranking F (Snowball Value — 101 Routes):** Value when ahead on points.

### Comparative Top 15 Across All Six Rankings

| Rank | A: Raw Potency (Primitive) | B-W: Practical (Written) | B-E: Practical (Executed) | C: Efficiency | D: Threat | E: Comeback | F: Snowball |
|---:|---|---|---|---|---|---|---|
| **1** | `SUDDEN_DEATH` | `A_SPADE_EXILE_COUNTER` | `A_SPADE_EXILE_COUNTER` | `EIGHT_SPADE_FREE_SCUTTLE` | `A_SPADE_EXILE_COUNTER` | `FOUR_SPADE_TOTAL_CLEAR` | `BLACK_JOKER_BOARD_LOCK` |
| **2** | `TOTAL_CLEAR` | `EIGHT_SPADE_FREE_SCUTTLE` | `EIGHT_SPADE_FREE_SCUTTLE` | `JACK_INSTANT_DISRUPT` | `A_SUPER_COUNTER` | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | `EIGHT_QUICK_AEGIS_FIELD` |
| **3** | `ULTRA_THREE_RED` | `KING_SPADE_INSTANT_MULTI_COUNTER` | `KING_SPADE_INSTANT_MULTI_COUNTER` | `SEVEN_SCORING_TRIGGER` | `BLACK_JOKER_BOARD_LOCK` | `KING_SPADE_WILD_TOTAL_CLEAR` | `TEN_SPADE_STACK_THEFT` |
| **4** | `SUPER_COUNTER` | `FOUR_SPADE_TOTAL_CLEAR` | `FOUR_SPADE_TOTAL_CLEAR` | `TWO_QUICK_SCORE_DISCARD` | `EIGHT_SPADE_FREE_SCUTTLE` | `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR` | `QUEEN_ER_GUARD_ANCHOR` |
| **5** | `BOARD_LOCK` | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | `TEN_SPADE_STACK_THEFT` | `FOUR_SUPER_ROW_EXCHANGE_PR` | `QUEEN_QUICK_AEGIS` |
| **6** | `ROW_EXCHANGE_PR` | `A_BASE_COUNTER` | `A_BASE_COUNTER` | `A_SPADE_EXILE_COUNTER` | `ULTRA_THREE_RED_COUNTER` | `FOUR_BASE_ROW_CLEAR_PR` | `QUEEN_COURT` |
| **7** | `HAND_SWAP` | `BLACK_JOKER_BOARD_LOCK` | `BLACK_JOKER_BOARD_LOCK` | `VOLTAGE_FIVE_REFINEMENT` | `A_BASE_COUNTER` | `FOUR_BASE_ROW_CLEAR_ER` | `ROYAL_MARRIAGE` |
| **8** | `STACK_THEFT` | `EIGHT_QUICK_AEGIS_FIELD` | `EIGHT_QUICK_AEGIS_FIELD` | `BLACK_JOKER_BOARD_LOCK` | `KING_SPADE_INSTANT_MULTI_COUNTER` | `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_ER` | `QUEEN_SPADE_CLEAR_IMMUNITY` |
| **9** | `COUNTER_MULTI_PLAY` | `TEN_HEART_TEMPO_SPIKE` | `TEN_HEART_TEMPO_SPIKE` | `VOLTAGE_THREE_SLEIGHT` | `QUEEN_COURT` | `TWO_SOLO_WILD_ROW_CLEAR` | `ROYAL_SHIELD_PROTECTION` |
| **10** | `QUEENS_COURT_DOUBLE_ANCHOR` | `KING_SPADE_WILD_TOTAL_CLEAR` | `KING_SPADE_WILD_TOTAL_CLEAR` | `KING_SPADE_INSTANT_MULTI_COUNTER` | `SUDDEN_DEATH_ACTIVATION` | `FOUR_SUPER_ROW_EXCHANGE_ER` | `A_SPADE_EXILE_COUNTER` |
| **11** | `ULTRA_2B2R_TEMPO_DRAW` | `QUEEN_ER_GUARD_ANCHOR` | `QUEEN_ER_GUARD_ANCHOR` | `QUEEN_QUICK_AEGIS` | `TEN_DIAMOND_PAIRED_MIMIC_SUPER_ACE` | `TEN_DIAMOND_PAIRED_MIMIC_ROW_EXCHANGE` | `KING_SPADE_INSTANT_MULTI_COUNTER` |
| **12** | `ROW_EXCHANGE_ER` | `ULTRA_2B2R_DRAW` | `ULTRA_2B2R_DRAW` | `BLACK_JOKER_EXILE_RECYCLE` | `QUEEN_ER_GUARD_ANCHOR` | `KING_SPADE_WILD_ROW_CLEAR` | `TEN_HEART_TEMPO_SPIKE` |
| **13** | `TEMPO_SPIKE` | `JACK_INSTANT_DISRUPT` | `JACK_INSTANT_DISRUPT` | `FOUR_SPADE_TOTAL_CLEAR` | `EIGHT_QUICK_AEGIS_FIELD` | `TEN_CLUB_FOUNDATION` | `A_BASE_COUNTER` |
| **14** | `COMMANDEER_HOLD` | `ULTRA_THREE_RED_COUNTER` | `ULTRA_THREE_RED_COUNTER` | `ROYAL_SHIELD_PROTECTION` | `QUEEN_QUICK_AEGIS` | `EIGHT_SPADE_FREE_SCUTTLE` | `ULTRA_2B2R_DRAW` |
| **15** | `ULTRA_2B2R_TEMPO_RUMMAGE` | `TEN_CLUB_FOUNDATION` | `TEN_CLUB_FOUNDATION` | `TEN_CLUB_FOUNDATION` | `QUEEN_SPADE_CLEAR_IMMUNITY` | `JACK_SPADE_ER_ATTACHMENT` | `TWO_QUICK_SCORE_DISCARD` |

---

## 4. Headline Strict Ordinal Leaderboard — AS-WRITTEN (Ranking B-W: 1 → 101)

Every mechanically distinct AS-WRITTEN declaration route appears exactly once. Tiers: **S+** (top 5%), **S** (5–15%), **A+** (15–30%), **A** (30–48%), **B+** (48–65%), **B** (65–80%), **C+** (80–90%), **C** (90–98%), **D** (98–100%).

### Complete Route Commentary & Placement Rationale (AS-WRITTEN)

#### #1 — `A_SPADE_EXILE_COUNTER` — Tier S+
* **Source:** A♠ | **Mode:** Exile Counter | **Timing:** Instant
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Functionally superior to Base Ace as an answer: it exiles the countered card (denying Graveyard recursion) and is not answerable by Base Ace counter-counters. Its singleton scarcity (1 copy vs. 3 copies) prevents it from distorting general play.

#### #2 — `EIGHT_SPADE_FREE_SCUTTLE` — Tier S+
* **Source:** 8♠ natural | **Mode:** Instant Free Scuttle | **Timing:** Instant
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Zero Mini-Turn tactical removal at Instant response speed, completely ignoring rank and suit requirements. Exceptional tempo weapon that punishes unguarded high-value PR cards (88.9% conversion in telemetry).

#### #3 — `KING_SPADE_INSTANT_MULTI_COUNTER` — Tier S+
* **Source:** K♠ natural | **Mode:** Counter Multi-Play | **Timing:** Instant
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** The sole standard direct counter to Queen's Court, Royal Marriage, Supers, and paired 10♦. Massive latent deterrence that forces opponents to hold multi-card combos until K♠ is exhausted.

#### #4 — `FOUR_SPADE_TOTAL_CLEAR` — Tier S+
* **Source:** 4♠ natural | **Mode:** Total Clear | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** The ultimate board reset: clears every card from PR and ER across all players, hard-bypassing Guard, Aegis, Q♠, and all immunities. Wipes own board too, enforcing fair comeback symmetry.

#### #5 — `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` — Tier S+
* **Source:** 2♠ | **Mode:** Solo Wild (Total Clear) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Provides a single-card global board reset for only 2 points forgone and zero extra discard cost. Highest efficiency board wipe in the game, turning 2♠ into a second natural 4♠.

#### #6 — `A_BASE_COUNTER` — Tier S
* **Source:** A♣ / A♦ / A♥ | **Mode:** Base Counter | **Timing:** Instant
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Universal reactive response against ordinary effect plays. Available in 3 copies, it establishes the fundamental counter threat that shapes all sequencing, held in check by the 4-point PR scoring sacrifice.

#### #7 — `BLACK_JOKER_BOARD_LOCK` — Tier S
* **Source:** Black Joker | **Mode:** Quick Board Lock | **Timing:** Quick
* **Points Forgone:** 11 | **Extra Cost:** AS-EXECUTED: 11-pt scoring blocked by IMPL-01 | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Free Quick play activating a 2-turn global lockdown that prohibits all non-counter effect plays, Scuttles, and Traps. Tremendous game-sealing tool when holding a points lead.

#### #8 — `EIGHT_QUICK_AEGIS_FIELD` — Tier S
* **Source:** Any Eight | **Mode:** Quick Aegis Field | **Timing:** Quick
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Grants hard Aegis immunity to all friendly PR and ER cards (except Nines) until next Start without spending a Mini-Turn. Critical protection tool that locks in a point lead before passing the turn.

#### #9 — `TEN_HEART_TEMPO_SPIKE` — Tier S
* **Source:** 10♥ natural | **Mode:** Tempo Spike | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** 10♥ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Massive action surge granting +2 Mini-Turns (net +1) and drawing 1 card. Sacrifices 10 points and exiles itself, currently nearly uncounterable due to IMPL-12 Base Ace immunity.

#### #10 — `KING_SPADE_WILD_TOTAL_CLEAR` — Tier S
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (Total Clear) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** +1 discard, K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Executes 4♠ Total Clear via K♠ at the steep cost of discarding an additional card and exiling K♠ permanently. Crucial third access route to Total Clear.

#### #11 — `QUEEN_ER_GUARD_ANCHOR` — Tier S
* **Source:** Any Queen | **Mode:** ER Anchor (Guard) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Enters ER with protected-entry Aegis and establishes Guard, shielding all other friendly cards from enemy single-target effects. The defensive foundation of control decks.

#### #12 — `ULTRA_2B2R_DRAW` — Tier S
* **Source:** 2 Black + 2 Red cards | **Mode:** 2B+2R Draw | **Timing:** Action
* **Points Forgone:** 14 | **Extra Cost:** 4 cards committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Primary tempo engine in the game: grants +2 Mini-Turns (net +1 action) and draws 2 cards. Available in 60.1–77.3% of opening hands; policy over-activation inflates perceived dominance.

#### #13 — `JACK_INSTANT_DISRUPT` — Tier S
* **Source:** Any Jack | **Mode:** Instant Disrupt | **Timing:** Instant
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Zero net card cost: draws 1 card immediately while preventing the active player from repeating their chosen Action type this turn. Exceptional tactical limiter (160 executions in corpus).

#### #14 — `ULTRA_THREE_RED_COUNTER` — Tier S
* **Source:** 3 Red cards (♦/♥) | **Mode:** 3 Red Ultra Counter | **Timing:** Instant
* **Points Forgone:** 10 | **Extra Cost:** 3 cards committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `POLICY_SENSITIVE`
* **Why Here:** Instant counter possessing ⭐A authority that also draws 1 card from bottom of Graveyard even if countered. Readily accessible in red-heavy hands, over-activated by heuristic AI (97 executions in corpus).

#### #15 — `TEN_CLUB_FOUNDATION` — Tier S
* **Source:** 10♣ natural | **Mode:** Foundation Entry & Bonus Score | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `CONFLICT` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Scores 10 points with immediate Aegis; if starting at 0 points, allows scoring a bonus card for free. Enables rare Turn-1 21-point wins with Black Joker; counterplay is currently narrowed by IMPL-12.

#### #16 — `QUEEN_COURT` — Tier A+
* **Source:** 2 Queens from hand | **Mode:** Queen's Court | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** 2 Queens committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Commits two Queens to ER simultaneously for 1 Mini-Turn. Both gain entry Aegis, establishing mutual Guard and activating Two-Queen Defense against ⭐A.

#### #17 — `SEVEN_SCORING_TRIGGER` — Tier A+
* **Source:** Any Seven scored | **Mode:** Scoring Trigger | **Timing:** Trigger
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `BLOCKED`
* **Why Here:** In written design, scoring a Seven grants 7 PR points AND reveals 2 cards to take 1 into hand. Massive card-plus-point value; completely blocked in Engine 4.2.6 by IMPL-01.

#### #18 — `SIX_SPADE_DEEP_DRAW` — Tier A+
* **Source:** 6♠ natural | **Mode:** Deep Draw | **Timing:** Action
* **Points Forgone:** 6 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Exceptional card sculpting tool that discards 1–2 cards, draws 6, and keeps 3–4. Gives 6♠ tremendous mid-to-late game value for assembling lethal lines.

#### #19 — `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR` — Tier A+
* **Source:** 10♦ natural | **Mode:** Solo Mimic ⭐4 PR | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** 10♦ Exile-Bound | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Single-card Row Exchange executed through 10♦ without needing a second Four. Inverts points boards while granting Aegis, currently protected from Base Ace by IMPL-12.

#### #20 — `A_SUPER_COUNTER` — Tier A+
* **Source:** ⭐A (2 Aces) | **Mode:** Super Counter | **Timing:** Instant
* **Points Forgone:** 8 | **Extra Cost:** 2 Aces committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Absolute counter authority capable of shutting down Ultras, Board Lock, and Sudden Death. Extremely powerful but heavily taxed by committing two Aces (8 forgone PR points) and blocked by Two-Queen Defense.

#### #21 — `QUEEN_QUICK_AEGIS` — Tier A+
* **Source:** Any Queen | **Mode:** Quick Aegis | **Timing:** Quick
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Grants hard Aegis immunity to one friendly card until next Start without spending a Mini-Turn (once per FT). Shields critical high-value PR points from removal.

#### #22 — `ROYAL_MARRIAGE` — Tier A+
* **Source:** Same-suit King + Queen | **Mode:** Royal Marriage | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** Same-suit K+Q committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Deploys both King and Queen to ER simultaneously for 1 Mini-Turn; Queen enters with protected Aegis. Establishes anchor value (7 or 9) and Guard in a single action, counterable only by K♠.

#### #23 — `TWO_QUICK_SCORE_DISCARD` — Tier A+
* **Source:** Any Two | **Mode:** Quick Score & Discard | **Timing:** Quick
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `WATCHLIST`
* **Why Here:** In written rules, grants zero-cost PR points while attacking opponent hand size without spending a Mini-Turn. Extremely efficient positive-sum play; completely fail-closed in Engine 4.2.6.

#### #24 — `FOUR_BASE_ROW_CLEAR_PR` — Tier A+
* **Source:** Any Four | **Mode:** Row Clear PR | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Wipes all vulnerable enemy PR cards to the Graveyard for 1 Action. Major comeback equalizer that prevents opponents from running away with point leads, stopped cleanly by Aegis.

#### #25 — `JACK_SPADE_ER_ATTACHMENT` — Tier A+
* **Source:** J♠ natural | **Mode:** ER Attachment | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Steals an enemy ER Anchor (including Queens and Kings). Stealing a Queen transfers her Guard to the caster, flipping board protection upside down.

#### #26 — `NINE_INSTANT_TAP` — Tier A+
* **Source:** Any Nine | **Mode:** Instant Tap | **Timing:** Instant
* **Points Forgone:** 9 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Instant-speed point denial that reduces an enemy PR card's contribution to 0 until that player scores again. Highly effective for denying lethal victory at End Phase.

#### #27 — `TEN_DIAMOND_PAIRED_MIMIC_SUPER_ACE` — Tier A+
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐A | **Timing:** Instant
* **Points Forgone:** 12 | **Extra Cost:** 10♦ Exile-Bound, +1 Two card | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Written as allowing 10♦ + Two to mimic ⭐A counter authority at Instant speed. Absent from executable Core authority.

#### #28 — `FOUR_SUPER_ROW_EXCHANGE_PR` — Tier A+
* **Source:** ⭐4 (2 Fours) | **Mode:** Row Exchange PR | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** 2 Fours committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Structurally swaps PR rows between players and grants Aegis to all exchanged cards. Can produce a massive instant 20+ point swing when trailing, but requires 2 Fours and is countered by K♠.

#### #29 — `KING_INSTANT_ANCHOR_COUNTER` — Tier A+
* **Source:** Any non-♠ King | **Mode:** Instant Anchor Counter | **Timing:** Instant
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Instant counter targeting single-card Anchor plays (Queens, Kings, Ace Anchors). Keeps opponent anchor engines in check, balanced by sacrificing 8 PR points.

#### #30 — `TWO_SPADE_SOLO_WILD_DEEP_DRAW` — Tier A+
* **Source:** 2♠ | **Mode:** Solo Wild (Deep Draw) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Massive hand sculpting tool that lets 2♠ dig 6 cards deep into the deck. Exceptional for assembling combo pieces or lethal scoring lines late in the game.

#### #31 — `FOUR_BASE_ROW_CLEAR_ER` — Tier A
* **Source:** Any Four | **Mode:** Row Clear ER | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Wipes all enemy ER Anchors (except Q♠ and Aegised cards) to the Graveyard. Essential tool for breaking Queen Guard fortresses and King anchor totals.

#### #32 — `TEN_SPADE_STACK_THEFT` — Tier A
* **Source:** 10♠ natural | **Mode:** Stack Theft (Interrupt) | **Timing:** Interrupt
* **Points Forgone:** 10 | **Extra Cost:** +1 Full-Turn skip | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Interrupt-speed effect theft that seizes an opponent's pending play, imposes a Full-Turn skip on both players, and exiles 10♠. High drama, balanced by severe self-skip penalty.

#### #33 — `A_ANCHOR_ENTRY` — Tier A
* **Source:** Any Ace | **Mode:** Anchor Entry & Sacrifice | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Publicly visible threat deterrence that converts a sacrificed Ace into a stolen opponent card (revealed until Start). Consumes an Action Mini-Turn upfront, trading tempo for future card advantage.

#### #34 — `QUEEN_SPADE_CLEAR_IMMUNITY` — Tier A
* **Source:** Q♠ OTT | **Mode:** Passive Clear Immunity | **Timing:** Passive
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Passive ability making Q♠ immune to 4 Row Clear ER. Allows Queen fortresses to survive ordinary row sweeps; only 4♠ Total Clear or control theft can dislodge it.

#### #35 — `BLACK_JOKER_EXILE_RECYCLE` — Tier A
* **Source:** Black Joker scored | **Mode:** Scoring Trigger (Exile Recycle) | **Timing:** Trigger
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `BLOCKED`
* **Why Here:** Written as recycling up to 2 cards from Exile back into DP when Black Joker is scored. Blocked in Engine 4.2.6 by IMPL-01 scoring refusal.

#### #36 — `EIGHT_INSTANT_SCUTTLE_COUNTER` — Tier A
* **Source:** Any Eight | **Mode:** Instant Scuttle Counter | **Timing:** Instant
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** The sole designated counter to Scuttle attempts. Preserves high-value PR cards and creates latent defensive threat merely by sitting in hand.

#### #37 — `RED_JOKER_HAND_SWAP` — Tier A
* **Source:** Red Joker | **Mode:** Hand Swap | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Completely swaps hands with an opponent. Devastating when caster has an empty or depleted hand and opponent has hoarded high-value cards.

#### #38 — `TWO_SUPER_COMMANDEER_HOLD` — Tier A
* **Source:** ⭐2 (2 Twos) | **Mode:** Commandeer Hold | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** 2 Twos committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Steals any enemy OTT card, bypassing Guard and rank immunity. Hold mode taps it until Start, allowing the caster to deploy its effect for free or keep it as an anchor.

#### #39 — `KING_SPADE_ANCHOR` — Tier A
* **Source:** K♠ natural | **Mode:** ER Anchor (9 pts) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Deploys into ER providing 9 anchor points. Highest single anchor value in the game, but sacrifices K♠'s multi-play counter and Wild Sovereignty.

#### #40 — `RED_JOKER_SELF_RESET` — Tier A
* **Source:** Red Joker | **Mode:** Self Reset | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Discards hand and draws new hand containing discarded count + 3. Superb hand refresh when holding dead cards.

#### #41 — `TWO_SOLO_WILD_ROW_CLEAR` — Tier A
* **Source:** Any suited Two | **Mode:** Solo Wild (4-Row Clear) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Enables any Two to wipe an enemy row for only 2 points sacrificed. Excellent efficiency and comeback potential, respecting Aegis and effect immunities.

#### #42 — `ULTRA_2B2R_RUMMAGE_EXILE` — Tier A
* **Source:** 2 Black + 2 Red cards | **Mode:** 2B+2R Rummage | **Timing:** Action
* **Points Forgone:** 14 | **Extra Cost:** 4 cards committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Alternative branch of 2B+2R granting +2 Mini-Turns and recovering 1 key card from Exile. Highly situational compared to the Draw 2 branch.

#### #43 — `EIGHT_SCUTTLE_BONUS` — Tier A
* **Source:** Any Eight | **Mode:** Scuttle Bonus Draw | **Timing:** Trigger
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as drawing 1 from top/bottom of Graveyard when resolving an ordinary Scuttle using an Eight. Unimplemented in engine.

#### #44 — `JACK_PR_ATTACHMENT` — Tier A
* **Source:** Any Jack | **Mode:** PR Attachment | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Seizes control of an enemy PR card and adds +1 point to it. Creates substantial 2-way point swings (e.g. stealing a 10 swings 21 points), but vulnerable to Jack severance.

#### #45 — `RED_JOKER_OPPONENT_ATTACK` — Tier A
* **Source:** Red Joker | **Mode:** Opponent Attack | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Forces opponent to discard hand and redraw size - 2. Severe resource stripping against opponents holding large hands.

#### #46 — `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_ER` — Tier A
* **Source:** 10♦ natural | **Mode:** Solo Mimic ⭐4 ER | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** 10♦ Exile-Bound | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Single-card Enduring Row swap executed via 10♦, stealing an enemy anchor setup.

#### #47 — `ULTRA_THREE_BLACK` — Tier A
* **Source:** 3 Black cards (♣/♠) | **Mode:** 3 Black Ultra | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 3 cards committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Tri-modal composite action: scores 1 card, resolves 1 card's effect internally (uncounterable sub-cast), and exiles 1 card. High flexibility, but consumes 3 dedicated black cards.

#### #48 — `FOUR_SUPER_ROW_EXCHANGE_ER` — Tier A
* **Source:** ⭐4 (2 Fours) | **Mode:** Row Exchange ER | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** 2 Fours committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Swaps Enduring Rows, seizing an opponent's entire anchor fortress and granting them Aegis. High setup requirement and niche application compared to PR exchange.

#### #49 — `NINE_SPADE_GOAL_SHIFT` — Tier B+
* **Source:** 9♠ | **Mode:** Goal Shift (+5, Discard, Own -2) | **Timing:** Instant
* **Points Forgone:** 9 | **Extra Cost:** +1 discard | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as a 7-point net goal swing (+5 to opponent, -2 to self). Major strategic lever, but unenumerated in Core.

#### #50 — `ROYAL_SHIELD_PROTECTION` — Tier B+
* **Source:** Queen count advantage | **Mode:** Royal Shield Snapshot | **Timing:** Passive
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as shielding protected plays from Base Ace counters when controlling more Queens than the opponent. Completely unasserted in executable code (IMPL-08).

#### #51 — `JACK_SUPER_TEMPO_FORCE` — Tier B+
* **Source:** ⭐J (2 Jacks) | **Mode:** Tempo Force | **Timing:** Action
* **Points Forgone:** 6 | **Extra Cost:** 2 Jacks committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Commits 2 Jacks to gain +2 Mini-Turns (net +1 action). Clean action accelerator, though requiring a true pair of Jacks.

#### #52 — `THREE_INSTANT_BOUNCE` — Tier B+
* **Source:** Any Three | **Mode:** Instant Bounce | **Timing:** Instant
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as an Instant-speed bounce to top or bottom of DP. Highly potent reactive disruption, but absent from executable Core authority.

#### #53 — `KING_BASE_ANCHOR` — Tier B+
* **Source:** Any non-♠ King | **Mode:** ER Anchor (7 pts) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Deploys into ER providing 7 anchor points (61 executions in corpus). Decisive for winning Exhausted tiebreakers while keeping PR safe from Scuttle.

#### #54 — `SEVEN_RECURSIVE_TOPDECK` — Tier B+
* **Source:** Physical Seven revealed | **Mode:** Recursive Topdeck | **Timing:** Action
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as allowing chained Topdeck Casting when a physical Seven is revealed. Recursion helper is dead code in the engine.

#### #55 — `TEN_DIAMOND_PAIRED_MIMIC_ROW_EXCHANGE` — Tier B+
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐4 | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 10♦ Exile-Bound, +1 Two card | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Cross-card inferior to Solo Mimic ⭐4 because it consumes 10♦ PLUS an extra Two for the exact same result. The additional Two card commitment yields zero additional effect.

#### #56 — `EIGHT_SUPER_ABSOLUTE_SCUTTLE` — Tier B+
* **Source:** ⭐8 (2 Eights) | **Mode:** Absolute Scuttle | **Timing:** Action
* **Points Forgone:** 16 | **Extra Cost:** 2 Eights committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Destroys any enemy PR card, bypassing ordinary Scuttle immunity (e.g. against Aces, Fives, Red Joker). Stopped by Aegis and carries a massive 16-point opportunity cost.

#### #57 — `SIX_BASE_DIG_RETURN` — Tier B+
* **Source:** Any Six | **Mode:** Dig Mode 1 | **Timing:** Action
* **Points Forgone:** 6 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Draws 3 cards, keeps 2, and returns 1 to top/bottom of DP. Net +1 card and clean selection, competing against a strong 6-point PR score.

#### #58 — `FOUR_QUICK_NATURAL` — Tier B+
* **Source:** Any Four | **Mode:** Quick Natural | **Timing:** Quick
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as a Quick reorder of top 4 DP cards and drawing 1 without spending a Mini-Turn. Excellent deck manipulation, but unimplemented in executable Core.

#### #59 — `TEN_DIAMOND_PAIRED_MIMIC_ABSOLUTE_SCUTTLE` — Tier B+
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐8 | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 10♦ Exile-Bound, +1 Two card | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Destroys any enemy PR card ignoring Scuttle immunity by combining 10♦ and a Two. Heavy 12-point commitment.

#### #60 — `VOLTAGE_FIVE_REFINEMENT` — Tier B+
* **Source:** Start Snapshot (PR Fives >= 5) | **Mode:** Voltage 5 Refinement | **Timing:** Instant Start
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Free Start-phase trigger allowing the player to draw the bottom Graveyard card or discard 1 and draw 1. High utility resource smoothing.

#### #61 — `SIX_BASE_DIG_DISCARD` — Tier B+
* **Source:** Any Six | **Mode:** Dig Mode 2 | **Timing:** Action
* **Points Forgone:** 6 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Draws 3 and discards 1 from hand to GY. Fuels Graveyard strategies while netting +1 card in hand.

#### #62 — `TWO_SUPER_COMMANDEER_SCORE` — Tier B+
* **Source:** ⭐2 (2 Twos) | **Mode:** Commandeer Score | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** 2 Twos committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Immediately transfers an enemy card into the caster's PR as points. Generally inferior to Hold mode in practice, because Hold allows scoring at next Start while preserving effect options. However, Score mode provides immediate, undisruptable PR points — the tapped card in Hold mode can be answered by K♠ or other removal before Start.

#### #63 — `SEVEN_SPADE_TOPDECK` — Tier B+
* **Source:** 7♠ | **Mode:** Topdeck Casting (Reveal 3) | **Timing:** Action
* **Points Forgone:** 7 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as revealing 3 cards from DP for greater assignment choice. Unimplemented in executable engine.

#### #64 — `THREE_SPADE_ENHANCEMENT` — Tier B+
* **Source:** 3♠ | **Mode:** Hand Raid Enhancement | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as forcing presentation of 2 cards and immediately scoring or casting one under your control. High ceiling, but fail-closed in Engine 4.2.6.

#### #65 — `VOLTAGE_THREE_SLEIGHT` — Tier B+
* **Source:** Start Snapshot (PR Threes >= 3) | **Mode:** Voltage 3 Sleight | **Timing:** Instant Start
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Free Start-phase trigger allowing the player to add the top DP card to hand or score it directly. Zero card commitment once the threshold is met.

#### #66 — `FIVE_SPADE_EXILE_RUMMAGE` — Tier B
* **Source:** 5♠ | **Mode:** Suit Rummage (Any Card) | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as accessing any card in Exile without positional restrictions. Most flexible written Exile rummage; fail-closed in Engine 4.2.6.

#### #67 — `KING_SPADE_WILD_DEEP_DRAW` — Tier B
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (Deep Draw) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** +1-2 discards, K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Enables K♠ to sculpt the hand 6 cards deep, exiling K♠. High-commitment digging tool when searching for game-winning lines.

#### #68 — `RED_JOKER_SHUFFLE_RESET` — Tier B
* **Source:** Red Joker | **Mode:** Shuffle Reset | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Shuffles Graveyard back into Draw Pile and draws 2 cards. Refills exhausted deck and recycles all spent power cards.

#### #69 — `TEN_DIAMOND_PAIRED_MIMIC_SUPER_J_TEMPO` — Tier B
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐J | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 10♦ Exile-Bound, +1 Two card | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Converts 10♦ and a Two into +2 Mini-Turns (net +1 action). Inferior to 10♥ which does this as a single card and draws 1.

#### #70 — `FIVE_BASE_RECYCLE` — Tier B
* **Source:** Any Five | **Mode:** Recycle Line | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Mills 2 cards, rummages 1 from Graveyard into hand, and draws the bottom Graveyard card. Generates net +1 card advantage while recycling spent resources.

#### #71 — `NINE_ANCHOR` — Tier B
* **Source:** Any Nine | **Mode:** Anchor Entry & Hand Discard | **Timing:** Action
* **Points Forgone:** 9 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Enters ER as an anchor, reveals opponent's complete hand, and forces 1 discard. Only 1 active Nine Anchor allowed at a time.

#### #72 — `KING_SPADE_WILD_ROW_CLEAR` — Tier B
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (4-Row Clear) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Wipes an enemy row using K♠, exiling K♠ afterward. Useful emergency reset when no Four is held.

#### #73 — `TWO_SOLO_WILD_RECYCLE` — Tier B
* **Source:** Any suited Two | **Mode:** Solo Wild (5-Recycle) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Card advantage engine yielding net +1 card for a 2-point sacrifice. Solid mid-game value play when the Graveyard is populated.

#### #74 — `SEVEN_BASE_TOPDECK` — Tier B
* **Source:** Any Seven | **Mode:** Topdeck Casting | **Timing:** Action
* **Points Forgone:** 7 | **Extra Cost:** AS-EXECUTED: 7-pt scoring blocked by IMPL-01 | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `BLOCKED`
* **Why Here:** Reveals top 2 DP cards: 1 added to hand (revealed), 1 declared immediately as a generated play. Value is heavily distorted in executable game by missing 7-point scoring fallback.

#### #75 — `SIX_QUICK_SWAP_BAR_PEEK` — Tier B
* **Source:** Any Six | **Mode:** Quick Swap Bar Peek | **Timing:** Quick
* **Points Forgone:** 6 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as inspecting face-down Swap Bar cards and taking or immediately casting one without spending a Mini-Turn. Unimplemented in Core engine.

#### #76 — `FIVE_SUPER_RECYCLE` — Tier B
* **Source:** ⭐5 (2 Fives) | **Mode:** Super Recycle | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** 2 Fives committed | **Profile:** core-unrestricted-only
* **Status:** `UNRESTRICTED_ONLY` | **Confidence:** `MODERATE` | **Health Verdict:** `INSUFFICIENT`
* **Why Here:** Mills 4 and draws 2 from bottom of GY. High resource cost (2 Fives = 10 PR points sacrificed) for modest card advantage.

#### #77 — `TEN_SPADE_EXILE_RECOVERY` — Tier B
* **Source:** 10♠ natural | **Mode:** Exile Recovery | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** 10♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** The sole targeted single-card Exile recovery in the game. Swaps 10♠ for any exiled card (revealed until Start), exiling 10♠ in the process.

#### #78 — `TWO_SOLO_WILD_TOPDECK` — Tier B
* **Source:** Any suited Two | **Mode:** Solo Wild (Topdeck) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Gambit play that reveals 2 cards from DP, adding one to hand and generating an immediate play. High variance, but cheaper than playing a Seven.

#### #79 — `THREE_BASE_HAND_RAID` — Tier B
* **Source:** Any Three | **Mode:** Hand Raid (present-take) | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Forces opponent to present cards and steals up to 2 (revealed until Start). Direct hand disruption that simultaneously expands the caster's hand.

#### #80 — `A_PURGE_SCRAP_AEGIS` — Tier B
* **Source:** Any Ace | **Mode:** Purge Mode 1 | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Specific targeted answer that explicitly pierces Aegis immunity. Highly valuable in Aegis-heavy boards (e.g. against 8-Quick or ⭐4), but narrow when no Aegis is active.

#### #81 — `NINE_INSTANT_GOAL_SHIFT_FIVE` — Tier C+
* **Source:** Any Nine | **Mode:** Goal Shift +5 | **Timing:** Instant
* **Points Forgone:** 9 | **Extra Cost:** +1 discard | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as raising opponent's Goal by 5 at the cost of discarding an additional card. Unenumerated in Core.

#### #82 — `THREE_SUPER_RAID` — Tier C+
* **Source:** ⭐3 (2 Threes) | **Mode:** Super Raid | **Timing:** Action
* **Points Forgone:** 6 | **Extra Cost:** 2 Threes committed | **Profile:** core-unrestricted-only
* **Status:** `UNRESTRICTED_ONLY` | **Confidence:** `MODERATE` | **Health Verdict:** `INSUFFICIENT`
* **Why Here:** Commits two Threes to strip a card directly from the opponent's hand. High card investment for a single hand steal, limited to Unrestricted profile.

#### #83 — `FIVE_CLUB_EXILE_RUMMAGE` — Tier C+
* **Source:** 5♣ | **Mode:** Suit Rummage (Newest 2) | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as rummaging from the newest 2 cards in Exile. Entirely unimplemented in code, collapsing into generic 5 Recycle.

#### #84 — `FIVE_HEART_EXILE_RUMMAGE` — Tier C+
* **Source:** 5♥ | **Mode:** Suit Rummage (Oldest 2) | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as rummaging from the oldest 2 cards in Exile. Unimplemented in engine.

#### #85 — `TWO_SOLO_WILD_BOUNCE` — Tier C+
* **Source:** Any suited Two | **Mode:** Solo Wild (3-Bounce) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Copies rank-3 bounce for only 2 points forgone rather than 3. Decent tempo tool against exposed enemy cards, though subject to standard Guard and Ace counterplay.

#### #86 — `TEN_DIAMOND_PAIRED_MIMIC_SUPER_FIVE` — Tier C+
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐5 | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 10♦ Exile-Bound, +1 Two card | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `INSUFFICIENT`
* **Why Here:** Written as mimicking ⭐5 Super Recycle. Unimplemented in Core.

#### #87 — `THREE_BASE_BOUNCE` — Tier C+
* **Source:** Any Three | **Mode:** Bounce OTT | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Removes an exposed enemy card to the top of the Draw Pile. Disrupts tempo, but gives the opponent the card back on their next draw.

#### #88 — `A_PURGE_BOUNCE_ANCHOR` — Tier C+
* **Source:** Any Ace | **Mode:** Purge Mode 2 | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Fallback mode when no Aegis exists, bouncing an enemy Anchor to hand. Conditional on zero Aegis existing OTT, limiting its tactical flexibility.

#### #89 — `NINE_INSTANT_GOAL_SHIFT_THREE` — Tier C+
* **Source:** Any Nine | **Mode:** Goal Shift +3 | **Timing:** Instant
* **Points Forgone:** 9 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as permanently raising opponent's Goal by 3 at Instant speed. Unenumerated in Core authority.

#### #90 — `THREE_BASE_FORCE_DISCARD` — Tier C+
* **Source:** Any Three | **Mode:** Force Discard | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Forces opponent to discard up to 2 cards of their choice. Pure card attrition, useful against opponents hoarding combos or responses.

#### #91 — `TEN_DIAMOND_PAIRED_MIMIC_SUPER_THREE` — Tier C
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐3 | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 10♦ Exile-Bound, +1 Two card | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `INSUFFICIENT`
* **Why Here:** Written as mimicking ⭐3 Super Raid with 10♦ + Two. Unimplemented in Core.

#### #92 — `FIVE_DIAMOND_EXILE_RUMMAGE` — Tier C
* **Source:** 5♦ | **Mode:** Suit Rummage (Middle, >=5) | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as rummaging from middle Exile cards when Exile has ≥5 cards. Restrictive condition; unimplemented in executable engine.

#### #93 — `VOLTAGE_FOUR_PREDICTABLE` — Tier C
* **Source:** Start Snapshot (PR Fours >= 4) | **Mode:** Voltage 4 Predictable | **Timing:** Instant Start
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Free Start-phase guess: if both rank and suit match the top DP card, scores it immediately. Low probability of success (~1.9%) without deck inspection.

#### #94 — `KING_SPADE_WILD_TOPDECK` — Tier C
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (Topdeck) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Gambit play that exiles K♠ to cast from top of deck. Rarely justified given K♠'s defensive counter value.

#### #95 — `TEN_DIAMOND_PAIRED_MIMIC_SUPER_SIX` — Tier C
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐6 | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** +1-2 discards for Deep Draw | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `INSUFFICIENT`
* **Why Here:** Written as mimicking ⭐6 Super Dig. Unimplemented in Core.

#### #96 — `KING_SPADE_WILD_RECYCLE` — Tier C
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (5-Recycle) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Copies 5-Recycle, permanently exiling K♠ for net +1 card advantage. Generally inferior to holding K♠ for counterplay.

#### #97 — `TEN_DIAMOND_PAIRED_MIMIC_SUPER_SEVEN` — Tier C
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐7 | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 10♦ Exile-Bound, +1 Two card | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `INSUFFICIENT`
* **Why Here:** Written as mimicking ⭐7 Sequential Topdeck. Unimplemented in Core.

#### #98 — `SUDDEN_DEATH_ACTIVATION` — Tier C
* **Source:** RJ+BJ or 4-of-a-kind | **Mode:** Sudden Death Activation | **Timing:** Action
* **Points Forgone:** 16 | **Extra Cost:** Multi-card combo (RJ+BJ or 4-of-a-kind) | **Profile:** written-only
* **Status:** `NOT_IMPLEMENTED` | **Confidence:** `LOW` | **Health Verdict:** `HEALTHY`
* **Why Here:** Written as an alternate win condition: scraps an enemy card and begins an inexorable 2-turn victory countdown. Extremely rare (<0.1% reachability), unrepresented in executable play.

#### #99 — `KING_SPADE_WILD_BOUNCE` — Tier D
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (3-Bounce) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Copies 3-Bounce through Wild Sovereignty, exiling K♠ permanently. Poor trade of a premium 8-point counter for a minor bounce.

#### #100 — `SIX_SUPER_DIG` — Tier D
* **Source:** ⭐6 (2 Sixes) | **Mode:** Super Dig | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 2 Sixes committed | **Profile:** core-unrestricted-only
* **Status:** `DEFECT_CONTAMINATED` | **Confidence:** `MODERATE` | **Health Verdict:** `INSUFFICIENT`
* **Why Here:** Designed as an 8-card draw engine. Defect-contaminated in Unrestricted (enumerator forces keep list empty, resulting in pure card loss).

#### #101 — `SEVEN_SUPER_TOPDECK` — Tier D
* **Source:** ⭐7 (2 Sevens) | **Mode:** Sequential Topdeck | **Timing:** Action
* **Points Forgone:** 14 | **Extra Cost:** 2 Sevens committed | **Profile:** core-unrestricted-only
* **Status:** `DEFECT_CONTAMINATED` | **Confidence:** `MODERATE` | **Health Verdict:** `INSUFFICIENT`
* **Why Here:** Designed as sequential independent Topdeck casting across multiple revealed cards. Defect-contaminated in Unrestricted (empty assignment lists).

---

## 4b. Headline Strict Ordinal Leaderboard — AS-EXECUTED (Ranking B-E: 1 → 75)

Every mechanically distinct AS-EXECUTED declaration route (status `MATCH`, `CONFLICT`, or `UNRESTRICTED_ONLY`) appears exactly once. Routes that are `NOT_IMPLEMENTED` or `DEFECT_CONTAMINATED` are excluded.

#### #1 — `A_SPADE_EXILE_COUNTER` — Tier S+
* **Source:** A♠ | **Mode:** Exile Counter | **Timing:** Instant
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Functionally superior to Base Ace as an answer: it exiles the countered card (denying Graveyard recursion) and is not answerable by Base Ace counter-counters. Its singleton scarcity (1 copy vs. 3 copies) prevents it from distorting general play.

#### #2 — `EIGHT_SPADE_FREE_SCUTTLE` — Tier S+
* **Source:** 8♠ natural | **Mode:** Instant Free Scuttle | **Timing:** Instant
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Zero Mini-Turn tactical removal at Instant response speed, completely ignoring rank and suit requirements. Exceptional tempo weapon that punishes unguarded high-value PR cards (88.9% conversion in telemetry).

#### #3 — `KING_SPADE_INSTANT_MULTI_COUNTER` — Tier S+
* **Source:** K♠ natural | **Mode:** Counter Multi-Play | **Timing:** Instant
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** The sole standard direct counter to Queen's Court, Royal Marriage, Supers, and paired 10♦. Massive latent deterrence that forces opponents to hold multi-card combos until K♠ is exhausted.

#### #4 — `FOUR_SPADE_TOTAL_CLEAR` — Tier S+
* **Source:** 4♠ natural | **Mode:** Total Clear | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** The ultimate board reset: clears every card from PR and ER across all players, hard-bypassing Guard, Aegis, Q♠, and all immunities. Wipes own board too, enforcing fair comeback symmetry.

#### #5 — `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` — Tier S+
* **Source:** 2♠ | **Mode:** Solo Wild (Total Clear) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Provides a single-card global board reset for only 2 points forgone and zero extra discard cost. Highest efficiency board wipe in the game, turning 2♠ into a second natural 4♠.

#### #6 — `A_BASE_COUNTER` — Tier S
* **Source:** A♣ / A♦ / A♥ | **Mode:** Base Counter | **Timing:** Instant
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Universal reactive response against ordinary effect plays. Available in 3 copies, it establishes the fundamental counter threat that shapes all sequencing, held in check by the 4-point PR scoring sacrifice.

#### #7 — `BLACK_JOKER_BOARD_LOCK` — Tier S
* **Source:** Black Joker | **Mode:** Quick Board Lock | **Timing:** Quick
* **Points Forgone:** 11 | **Extra Cost:** AS-EXECUTED: 11-pt scoring blocked by IMPL-01 | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Free Quick play activating a 2-turn global lockdown that prohibits all non-counter effect plays, Scuttles, and Traps. Tremendous game-sealing tool when holding a points lead.

#### #8 — `EIGHT_QUICK_AEGIS_FIELD` — Tier S
* **Source:** Any Eight | **Mode:** Quick Aegis Field | **Timing:** Quick
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Grants hard Aegis immunity to all friendly PR and ER cards (except Nines) until next Start without spending a Mini-Turn. Critical protection tool that locks in a point lead before passing the turn.

#### #9 — `TEN_HEART_TEMPO_SPIKE` — Tier S
* **Source:** 10♥ natural | **Mode:** Tempo Spike | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** 10♥ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Massive action surge granting +2 Mini-Turns (net +1) and drawing 1 card. Sacrifices 10 points and exiles itself, currently nearly uncounterable due to IMPL-12 Base Ace immunity.

#### #10 — `KING_SPADE_WILD_TOTAL_CLEAR` — Tier S
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (Total Clear) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** +1 discard, K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Executes 4♠ Total Clear via K♠ at the steep cost of discarding an additional card and exiling K♠ permanently. Crucial third access route to Total Clear.

#### #11 — `QUEEN_ER_GUARD_ANCHOR` — Tier S
* **Source:** Any Queen | **Mode:** ER Anchor (Guard) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Enters ER with protected-entry Aegis and establishes Guard, shielding all other friendly cards from enemy single-target effects. The defensive foundation of control decks.

#### #12 — `ULTRA_2B2R_DRAW` — Tier S
* **Source:** 2 Black + 2 Red cards | **Mode:** 2B+2R Draw | **Timing:** Action
* **Points Forgone:** 14 | **Extra Cost:** 4 cards committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Primary tempo engine in the game: grants +2 Mini-Turns (net +1 action) and draws 2 cards. Available in 60.1–77.3% of opening hands; policy over-activation inflates perceived dominance.

#### #13 — `JACK_INSTANT_DISRUPT` — Tier S
* **Source:** Any Jack | **Mode:** Instant Disrupt | **Timing:** Instant
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Zero net card cost: draws 1 card immediately while preventing the active player from repeating their chosen Action type this turn. Exceptional tactical limiter (160 executions in corpus).

#### #14 — `ULTRA_THREE_RED_COUNTER` — Tier S
* **Source:** 3 Red cards (♦/♥) | **Mode:** 3 Red Ultra Counter | **Timing:** Instant
* **Points Forgone:** 10 | **Extra Cost:** 3 cards committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `POLICY_SENSITIVE`
* **Why Here:** Instant counter possessing ⭐A authority that also draws 1 card from bottom of Graveyard even if countered. Readily accessible in red-heavy hands, over-activated by heuristic AI (97 executions in corpus).

#### #15 — `TEN_CLUB_FOUNDATION` — Tier S
* **Source:** 10♣ natural | **Mode:** Foundation Entry & Bonus Score | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `CONFLICT` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Scores 10 points with immediate Aegis; if starting at 0 points, allows scoring a bonus card for free. Enables rare Turn-1 21-point wins with Black Joker; counterplay is currently narrowed by IMPL-12.

#### #16 — `QUEEN_COURT` — Tier A+
* **Source:** 2 Queens from hand | **Mode:** Queen's Court | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** 2 Queens committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Commits two Queens to ER simultaneously for 1 Mini-Turn. Both gain entry Aegis, establishing mutual Guard and activating Two-Queen Defense against ⭐A.

#### #17 — `SIX_SPADE_DEEP_DRAW` — Tier A+
* **Source:** 6♠ natural | **Mode:** Deep Draw | **Timing:** Action
* **Points Forgone:** 6 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Exceptional card sculpting tool that discards 1–2 cards, draws 6, and keeps 3–4. Gives 6♠ tremendous mid-to-late game value for assembling lethal lines.

#### #18 — `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR` — Tier A+
* **Source:** 10♦ natural | **Mode:** Solo Mimic ⭐4 PR | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** 10♦ Exile-Bound | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Single-card Row Exchange executed through 10♦ without needing a second Four. Inverts points boards while granting Aegis, currently protected from Base Ace by IMPL-12.

#### #19 — `A_SUPER_COUNTER` — Tier A+
* **Source:** ⭐A (2 Aces) | **Mode:** Super Counter | **Timing:** Instant
* **Points Forgone:** 8 | **Extra Cost:** 2 Aces committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Absolute counter authority capable of shutting down Ultras, Board Lock, and Sudden Death. Extremely powerful but heavily taxed by committing two Aces (8 forgone PR points) and blocked by Two-Queen Defense.

#### #20 — `QUEEN_QUICK_AEGIS` — Tier A+
* **Source:** Any Queen | **Mode:** Quick Aegis | **Timing:** Quick
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Grants hard Aegis immunity to one friendly card until next Start without spending a Mini-Turn (once per FT). Shields critical high-value PR points from removal.

#### #21 — `ROYAL_MARRIAGE` — Tier A+
* **Source:** Same-suit King + Queen | **Mode:** Royal Marriage | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** Same-suit K+Q committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Deploys both King and Queen to ER simultaneously for 1 Mini-Turn; Queen enters with protected Aegis. Establishes anchor value (7 or 9) and Guard in a single action, counterable only by K♠.

#### #22 — `FOUR_BASE_ROW_CLEAR_PR` — Tier A+
* **Source:** Any Four | **Mode:** Row Clear PR | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Wipes all vulnerable enemy PR cards to the Graveyard for 1 Action. Major comeback equalizer that prevents opponents from running away with point leads, stopped cleanly by Aegis.

#### #23 — `JACK_SPADE_ER_ATTACHMENT` — Tier A+
* **Source:** J♠ natural | **Mode:** ER Attachment | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Steals an enemy ER Anchor (including Queens and Kings). Stealing a Queen transfers her Guard to the caster, flipping board protection upside down.

#### #24 — `NINE_INSTANT_TAP` — Tier A+
* **Source:** Any Nine | **Mode:** Instant Tap | **Timing:** Instant
* **Points Forgone:** 9 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Instant-speed point denial that reduces an enemy PR card's contribution to 0 until that player scores again. Highly effective for denying lethal victory at End Phase.

#### #25 — `FOUR_SUPER_ROW_EXCHANGE_PR` — Tier A+
* **Source:** ⭐4 (2 Fours) | **Mode:** Row Exchange PR | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** 2 Fours committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Structurally swaps PR rows between players and grants Aegis to all exchanged cards. Can produce a massive instant 20+ point swing when trailing, but requires 2 Fours and is countered by K♠.

#### #26 — `KING_INSTANT_ANCHOR_COUNTER` — Tier A+
* **Source:** Any non-♠ King | **Mode:** Instant Anchor Counter | **Timing:** Instant
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Instant counter targeting single-card Anchor plays (Queens, Kings, Ace Anchors). Keeps opponent anchor engines in check, balanced by sacrificing 8 PR points.

#### #27 — `TWO_SPADE_SOLO_WILD_DEEP_DRAW` — Tier A+
* **Source:** 2♠ | **Mode:** Solo Wild (Deep Draw) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Massive hand sculpting tool that lets 2♠ dig 6 cards deep into the deck. Exceptional for assembling combo pieces or lethal scoring lines late in the game.

#### #28 — `FOUR_BASE_ROW_CLEAR_ER` — Tier A
* **Source:** Any Four | **Mode:** Row Clear ER | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Wipes all enemy ER Anchors (except Q♠ and Aegised cards) to the Graveyard. Essential tool for breaking Queen Guard fortresses and King anchor totals.

#### #29 — `TEN_SPADE_STACK_THEFT` — Tier A
* **Source:** 10♠ natural | **Mode:** Stack Theft (Interrupt) | **Timing:** Interrupt
* **Points Forgone:** 10 | **Extra Cost:** +1 Full-Turn skip | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Interrupt-speed effect theft that seizes an opponent's pending play, imposes a Full-Turn skip on both players, and exiles 10♠. High drama, balanced by severe self-skip penalty.

#### #30 — `A_ANCHOR_ENTRY` — Tier A
* **Source:** Any Ace | **Mode:** Anchor Entry & Sacrifice | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Publicly visible threat deterrence that converts a sacrificed Ace into a stolen opponent card (revealed until Start). Consumes an Action Mini-Turn upfront, trading tempo for future card advantage.

#### #31 — `QUEEN_SPADE_CLEAR_IMMUNITY` — Tier A
* **Source:** Q♠ OTT | **Mode:** Passive Clear Immunity | **Timing:** Passive
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `WATCHLIST`
* **Why Here:** Passive ability making Q♠ immune to 4 Row Clear ER. Allows Queen fortresses to survive ordinary row sweeps; only 4♠ Total Clear or control theft can dislodge it.

#### #32 — `EIGHT_INSTANT_SCUTTLE_COUNTER` — Tier A
* **Source:** Any Eight | **Mode:** Instant Scuttle Counter | **Timing:** Instant
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** The sole designated counter to Scuttle attempts. Preserves high-value PR cards and creates latent defensive threat merely by sitting in hand.

#### #33 — `RED_JOKER_HAND_SWAP` — Tier A
* **Source:** Red Joker | **Mode:** Hand Swap | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Completely swaps hands with an opponent. Devastating when caster has an empty or depleted hand and opponent has hoarded high-value cards.

#### #34 — `TWO_SUPER_COMMANDEER_HOLD` — Tier A
* **Source:** ⭐2 (2 Twos) | **Mode:** Commandeer Hold | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** 2 Twos committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Steals any enemy OTT card, bypassing Guard and rank immunity. Hold mode taps it until Start, allowing the caster to deploy its effect for free or keep it as an anchor.

#### #35 — `KING_SPADE_ANCHOR` — Tier A
* **Source:** K♠ natural | **Mode:** ER Anchor (9 pts) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Deploys into ER providing 9 anchor points. Highest single anchor value in the game, but sacrifices K♠'s multi-play counter and Wild Sovereignty.

#### #36 — `RED_JOKER_SELF_RESET` — Tier A
* **Source:** Red Joker | **Mode:** Self Reset | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Discards hand and draws new hand containing discarded count + 3. Superb hand refresh when holding dead cards.

#### #37 — `TWO_SOLO_WILD_ROW_CLEAR` — Tier A
* **Source:** Any suited Two | **Mode:** Solo Wild (4-Row Clear) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Enables any Two to wipe an enemy row for only 2 points sacrificed. Excellent efficiency and comeback potential, respecting Aegis and effect immunities.

#### #38 — `ULTRA_2B2R_RUMMAGE_EXILE` — Tier A
* **Source:** 2 Black + 2 Red cards | **Mode:** 2B+2R Rummage | **Timing:** Action
* **Points Forgone:** 14 | **Extra Cost:** 4 cards committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Alternative branch of 2B+2R granting +2 Mini-Turns and recovering 1 key card from Exile. Highly situational compared to the Draw 2 branch.

#### #39 — `JACK_PR_ATTACHMENT` — Tier A
* **Source:** Any Jack | **Mode:** PR Attachment | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Seizes control of an enemy PR card and adds +1 point to it. Creates substantial 2-way point swings (e.g. stealing a 10 swings 21 points), but vulnerable to Jack severance.

#### #40 — `RED_JOKER_OPPONENT_ATTACK` — Tier A
* **Source:** Red Joker | **Mode:** Opponent Attack | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Forces opponent to discard hand and redraw size - 2. Severe resource stripping against opponents holding large hands.

#### #41 — `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_ER` — Tier A
* **Source:** 10♦ natural | **Mode:** Solo Mimic ⭐4 ER | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** 10♦ Exile-Bound | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Single-card Enduring Row swap executed via 10♦, stealing an enemy anchor setup.

#### #42 — `ULTRA_THREE_BLACK` — Tier A
* **Source:** 3 Black cards (♣/♠) | **Mode:** 3 Black Ultra | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 3 cards committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Tri-modal composite action: scores 1 card, resolves 1 card's effect internally (uncounterable sub-cast), and exiles 1 card. High flexibility, but consumes 3 dedicated black cards.

#### #43 — `FOUR_SUPER_ROW_EXCHANGE_ER` — Tier A
* **Source:** ⭐4 (2 Fours) | **Mode:** Row Exchange ER | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** 2 Fours committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Swaps Enduring Rows, seizing an opponent's entire anchor fortress and granting them Aegis. High setup requirement and niche application compared to PR exchange.

#### #44 — `JACK_SUPER_TEMPO_FORCE` — Tier B+
* **Source:** ⭐J (2 Jacks) | **Mode:** Tempo Force | **Timing:** Action
* **Points Forgone:** 6 | **Extra Cost:** 2 Jacks committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Commits 2 Jacks to gain +2 Mini-Turns (net +1 action). Clean action accelerator, though requiring a true pair of Jacks.

#### #45 — `KING_BASE_ANCHOR` — Tier B+
* **Source:** Any non-♠ King | **Mode:** ER Anchor (7 pts) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `VERY_HIGH` | **Health Verdict:** `STRONG BUT HEALTHY`
* **Why Here:** Deploys into ER providing 7 anchor points (61 executions in corpus). Decisive for winning Exhausted tiebreakers while keeping PR safe from Scuttle.

#### #46 — `TEN_DIAMOND_PAIRED_MIMIC_ROW_EXCHANGE` — Tier B+
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐4 | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 10♦ Exile-Bound, +1 Two card | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Cross-card inferior to Solo Mimic ⭐4 because it consumes 10♦ PLUS an extra Two for the exact same result. The additional Two card commitment yields zero additional effect.

#### #47 — `EIGHT_SUPER_ABSOLUTE_SCUTTLE` — Tier B+
* **Source:** ⭐8 (2 Eights) | **Mode:** Absolute Scuttle | **Timing:** Action
* **Points Forgone:** 16 | **Extra Cost:** 2 Eights committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Destroys any enemy PR card, bypassing ordinary Scuttle immunity (e.g. against Aces, Fives, Red Joker). Stopped by Aegis and carries a massive 16-point opportunity cost.

#### #48 — `SIX_BASE_DIG_RETURN` — Tier B+
* **Source:** Any Six | **Mode:** Dig Mode 1 | **Timing:** Action
* **Points Forgone:** 6 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Draws 3 cards, keeps 2, and returns 1 to top/bottom of DP. Net +1 card and clean selection, competing against a strong 6-point PR score.

#### #49 — `TEN_DIAMOND_PAIRED_MIMIC_ABSOLUTE_SCUTTLE` — Tier B+
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐8 | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 10♦ Exile-Bound, +1 Two card | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Destroys any enemy PR card ignoring Scuttle immunity by combining 10♦ and a Two. Heavy 12-point commitment.

#### #50 — `VOLTAGE_FIVE_REFINEMENT` — Tier B+
* **Source:** Start Snapshot (PR Fives >= 5) | **Mode:** Voltage 5 Refinement | **Timing:** Instant Start
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Free Start-phase trigger allowing the player to draw the bottom Graveyard card or discard 1 and draw 1. High utility resource smoothing.

#### #51 — `SIX_BASE_DIG_DISCARD` — Tier B+
* **Source:** Any Six | **Mode:** Dig Mode 2 | **Timing:** Action
* **Points Forgone:** 6 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Draws 3 and discards 1 from hand to GY. Fuels Graveyard strategies while netting +1 card in hand.

#### #52 — `TWO_SUPER_COMMANDEER_SCORE` — Tier B+
* **Source:** ⭐2 (2 Twos) | **Mode:** Commandeer Score | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** 2 Twos committed | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Immediately transfers an enemy card into the caster's PR as points. Generally inferior to Hold mode in practice, because Hold allows scoring at next Start while preserving effect options. However, Score mode provides immediate, undisruptable PR points — the tapped card in Hold mode can be answered by K♠ or other removal before Start.

#### #53 — `VOLTAGE_THREE_SLEIGHT` — Tier B+
* **Source:** Start Snapshot (PR Threes >= 3) | **Mode:** Voltage 3 Sleight | **Timing:** Instant Start
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Free Start-phase trigger allowing the player to add the top DP card to hand or score it directly. Zero card commitment once the threshold is met.

#### #54 — `KING_SPADE_WILD_DEEP_DRAW` — Tier B
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (Deep Draw) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** +1-2 discards, K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Enables K♠ to sculpt the hand 6 cards deep, exiling K♠. High-commitment digging tool when searching for game-winning lines.

#### #55 — `RED_JOKER_SHUFFLE_RESET` — Tier B
* **Source:** Red Joker | **Mode:** Shuffle Reset | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Shuffles Graveyard back into Draw Pile and draws 2 cards. Refills exhausted deck and recycles all spent power cards.

#### #56 — `TEN_DIAMOND_PAIRED_MIMIC_SUPER_J_TEMPO` — Tier B
* **Source:** 10♦ + any Two | **Mode:** Paired Mimic ⭐J | **Timing:** Action
* **Points Forgone:** 12 | **Extra Cost:** 10♦ Exile-Bound, +1 Two card | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Converts 10♦ and a Two into +2 Mini-Turns (net +1 action). Inferior to 10♥ which does this as a single card and draws 1.

#### #57 — `FIVE_BASE_RECYCLE` — Tier B
* **Source:** Any Five | **Mode:** Recycle Line | **Timing:** Action
* **Points Forgone:** 5 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Mills 2 cards, rummages 1 from Graveyard into hand, and draws the bottom Graveyard card. Generates net +1 card advantage while recycling spent resources.

#### #58 — `NINE_ANCHOR` — Tier B
* **Source:** Any Nine | **Mode:** Anchor Entry & Hand Discard | **Timing:** Action
* **Points Forgone:** 9 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Enters ER as an anchor, reveals opponent's complete hand, and forces 1 discard. Only 1 active Nine Anchor allowed at a time.

#### #59 — `KING_SPADE_WILD_ROW_CLEAR` — Tier B
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (4-Row Clear) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Wipes an enemy row using K♠, exiling K♠ afterward. Useful emergency reset when no Four is held.

#### #60 — `TWO_SOLO_WILD_RECYCLE` — Tier B
* **Source:** Any suited Two | **Mode:** Solo Wild (5-Recycle) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Card advantage engine yielding net +1 card for a 2-point sacrifice. Solid mid-game value play when the Graveyard is populated.

#### #61 — `SEVEN_BASE_TOPDECK` — Tier B
* **Source:** Any Seven | **Mode:** Topdeck Casting | **Timing:** Action
* **Points Forgone:** 7 | **Extra Cost:** AS-EXECUTED: 7-pt scoring blocked by IMPL-01 | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `BLOCKED`
* **Why Here:** Reveals top 2 DP cards: 1 added to hand (revealed), 1 declared immediately as a generated play. Value is heavily distorted in executable game by missing 7-point scoring fallback.

#### #62 — `FIVE_SUPER_RECYCLE` — Tier B
* **Source:** ⭐5 (2 Fives) | **Mode:** Super Recycle | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** 2 Fives committed | **Profile:** core-unrestricted-only
* **Status:** `UNRESTRICTED_ONLY` | **Confidence:** `MODERATE` | **Health Verdict:** `INSUFFICIENT`
* **Why Here:** Mills 4 and draws 2 from bottom of GY. High resource cost (2 Fives = 10 PR points sacrificed) for modest card advantage.

#### #63 — `TEN_SPADE_EXILE_RECOVERY` — Tier B
* **Source:** 10♠ natural | **Mode:** Exile Recovery | **Timing:** Action
* **Points Forgone:** 10 | **Extra Cost:** 10♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** The sole targeted single-card Exile recovery in the game. Swaps 10♠ for any exiled card (revealed until Start), exiling 10♠ in the process.

#### #64 — `TWO_SOLO_WILD_TOPDECK` — Tier B
* **Source:** Any suited Two | **Mode:** Solo Wild (Topdeck) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Gambit play that reveals 2 cards from DP, adding one to hand and generating an immediate play. High variance, but cheaper than playing a Seven.

#### #65 — `THREE_BASE_HAND_RAID` — Tier B
* **Source:** Any Three | **Mode:** Hand Raid (present-take) | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Forces opponent to present cards and steals up to 2 (revealed until Start). Direct hand disruption that simultaneously expands the caster's hand.

#### #66 — `A_PURGE_SCRAP_AEGIS` — Tier B
* **Source:** Any Ace | **Mode:** Purge Mode 1 | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Specific targeted answer that explicitly pierces Aegis immunity. Highly valuable in Aegis-heavy boards (e.g. against 8-Quick or ⭐4), but narrow when no Aegis is active.

#### #67 — `THREE_SUPER_RAID` — Tier C+
* **Source:** ⭐3 (2 Threes) | **Mode:** Super Raid | **Timing:** Action
* **Points Forgone:** 6 | **Extra Cost:** 2 Threes committed | **Profile:** core-unrestricted-only
* **Status:** `UNRESTRICTED_ONLY` | **Confidence:** `MODERATE` | **Health Verdict:** `INSUFFICIENT`
* **Why Here:** Commits two Threes to strip a card directly from the opponent's hand. High card investment for a single hand steal, limited to Unrestricted profile.

#### #68 — `TWO_SOLO_WILD_BOUNCE` — Tier C+
* **Source:** Any suited Two | **Mode:** Solo Wild (3-Bounce) | **Timing:** Action
* **Points Forgone:** 2 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Copies rank-3 bounce for only 2 points forgone rather than 3. Decent tempo tool against exposed enemy cards, though subject to standard Guard and Ace counterplay.

#### #69 — `THREE_BASE_BOUNCE` — Tier C+
* **Source:** Any Three | **Mode:** Bounce OTT | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Removes an exposed enemy card to the top of the Draw Pile. Disrupts tempo, but gives the opponent the card back on their next draw.

#### #70 — `A_PURGE_BOUNCE_ANCHOR` — Tier C+
* **Source:** Any Ace | **Mode:** Purge Mode 2 | **Timing:** Action
* **Points Forgone:** 4 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Fallback mode when no Aegis exists, bouncing an enemy Anchor to hand. Conditional on zero Aegis existing OTT, limiting its tactical flexibility.

#### #71 — `THREE_BASE_FORCE_DISCARD` — Tier C+
* **Source:** Any Three | **Mode:** Force Discard | **Timing:** Action
* **Points Forgone:** 3 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Forces opponent to discard up to 2 cards of their choice. Pure card attrition, useful against opponents hoarding combos or responses.

#### #72 — `VOLTAGE_FOUR_PREDICTABLE` — Tier C
* **Source:** Start Snapshot (PR Fours >= 4) | **Mode:** Voltage 4 Predictable | **Timing:** Instant Start
* **Points Forgone:** 0 | **Extra Cost:** None | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `HEALTHY`
* **Why Here:** Free Start-phase guess: if both rank and suit match the top DP card, scores it immediately. Low probability of success (~1.9%) without deck inspection.

#### #73 — `KING_SPADE_WILD_TOPDECK` — Tier C
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (Topdeck) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Gambit play that exiles K♠ to cast from top of deck. Rarely justified given K♠'s defensive counter value.

#### #74 — `KING_SPADE_WILD_RECYCLE` — Tier C
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (5-Recycle) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Copies 5-Recycle, permanently exiling K♠ for net +1 card advantage. Generally inferior to holding K♠ for counterplay.

#### #75 — `KING_SPADE_WILD_BOUNCE` — Tier D
* **Source:** K♠ natural | **Mode:** Wild Sovereignty (3-Bounce) | **Timing:** Action
* **Points Forgone:** 8 | **Extra Cost:** K♠ exiled | **Profile:** core-advanced-and-unrestricted
* **Status:** `MATCH` | **Confidence:** `HIGH` | **Health Verdict:** `NICHE BUT HEALTHY`
* **Why Here:** Copies 3-Bounce through Wild Sovereignty, exiling K♠ permanently. Poor trade of a premium 8-point counter for a minor bounce.

---

## 5. Required Complete Effect-Ranking Table (AS-WRITTEN, sorted by Practical Rank)

The table below reflects all 101 AS-WRITTEN declaration routes sorted by **Practical Strategic Value** (#1 to #101), with full cross-ranking against Raw Primitive Rank, Efficiency, Threat, Comeback, and Snowball.

| # | Effect ID | Source | Mode | Timing | Raw Prim Rank | Prac Rank (W) | Prac Rank (E) | Eff Rank | Tier | Pts Forgone | Extra Cost | Setup | Counterplay | Reachability | Threat | Status | Profile | Conf |
|---:|---|---|---|---|---:|---:|---:|---:|---|---:|---|---|---|---|---|---|---|---|
| 1 | `A_SPADE_EXILE_COUNTER` | A♠ | Exile Counter | Instant | N/A | 1 | 1 | 6 | **S+** | 4 | None | Low (pending effect/counter) | NARROW (⭐A or 3-Red only) | RARE | VERY_HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 2 | `EIGHT_SPADE_FREE_SCUTTLE` | 8♠ natural | Instant Free Scuttle | Instant | N/A | 2 | 2 | 1 | **S+** | 8 | None | Enemy PR card (non-Aegis, non-immune) | ADEQUATE (8 Scuttle Counter, Aegis) | RARE | VERY_HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 3 | `KING_SPADE_INSTANT_MULTI_COUNTER` | K♠ natural | Counter Multi-Play | Instant | N/A | 3 | 3 | 10 | **S+** | 8 | None | Pending multi-card play | ROBUST (Counter-counters, cannot counter Ultras) | RARE | VERY_HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 4 | `FOUR_SPADE_TOTAL_CLEAR` | 4♠ natural | Total Clear | Action | N/A | 4 | 4 | 13 | **S+** | 4 | None | OTT cards present | ROBUST (Aces) | RARE | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 5 | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | 2♠ | Solo Wild (Total Clear) | Action | N/A | 5 | 5 | 5 | **S+** | 2 | None | OTT cards present | ROBUST (Aces) | RARE | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 6 | `A_BASE_COUNTER` | A♣ / A♦ / A♥ | Base Counter | Instant | N/A | 6 | 6 | 16 | **S** | 4 | None | Low (pending effect/counter) | ROBUST (Ace-family, 3-Red) | COMMON | VERY_HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 7 | `BLACK_JOKER_BOARD_LOCK` | Black Joker | Quick Board Lock | Quick | N/A | 7 | 7 | 8 | **S** | 11 | AS-EXECUTED: 11-pt scoring blocked by IMPL-01 | Empty stack and queue | NARROW (⭐A, 3-Red only) | RARE | VERY_HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 8 | `EIGHT_QUICK_AEGIS_FIELD` | Any Eight | Quick Aegis Field | Quick | N/A | 8 | 8 | 18 | **S** | 8 | None | Friendly OTT cards | NARROW (Cannot be countered by Base Ace) | COMMON | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 9 | `TEN_HEART_TEMPO_SPIKE` | 10♥ natural | Tempo Spike | Action | N/A | 9 | 9 | 22 | **S** | 10 | 10♥ exiled | Action phase | NARROW (⭐A, 3-Red only via IMPL-12) | RARE | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 10 | `KING_SPADE_WILD_TOTAL_CLEAR` | K♠ natural | Wild Sovereignty (Total Clear) | Action | N/A | 10 | 10 | 45 | **S** | 8 | +1 discard, K♠ exiled | >=1 other hand card, OTT cards present | ROBUST (Aces) | RARE | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 11 | `QUEEN_ER_GUARD_ANCHOR` | Any Queen | ER Anchor (Guard) | Action | N/A | 11 | 11 | 17 | **S** | 2 | None | Action phase | ADEQUATE (Clears, ⭐2, J♠, Kings on entry) | COMMON | VERY_HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 12 | `ULTRA_2B2R_DRAW` | 2 Black + 2 Red cards | 2B+2R Draw | Action | N/A | 12 | 12 | 40 | **S** | 14 | 4 cards committed | 2 Black + 2 Red in hand | NARROW (⭐A, 3-Red only) | COMMON | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 13 | `JACK_INSTANT_DISRUPT` | Any Jack | Instant Disrupt | Instant | N/A | 13 | 13 | 2 | **S** | 3 | None | Opponent Action declaration | ROBUST (Aces) | COMMON | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 14 | `ULTRA_THREE_RED_COUNTER` | 3 Red cards (♦/♥) | 3 Red Ultra Counter | Instant | N/A | 14 | 14 | 47 | **S** | 10 | 3 cards committed | 3 red cards in hand, pending play | NARROW (Blocked by Two-Queen Defense) | COMMON | VERY_HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 15 | `TEN_CLUB_FOUNDATION` | 10♣ natural | Foundation Entry & Bonus Score | Action | N/A | 15 | 15 | 15 | **S** | 10 | None | Best at 0 PR points | NARROW (⭐A, 3-Red only via IMPL-12) | RARE | HIGH | `CONFLICT` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 16 | `QUEEN_COURT` | 2 Queens from hand | Queen's Court | Action | N/A | 16 | 16 | 35 | **A+** | 4 | 2 Queens committed | 2 Queens in hand | NARROW (K♠ only standard counter) | RARE | VERY_HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 17 | `SEVEN_SCORING_TRIGGER` | Any Seven scored | Scoring Trigger | Trigger | N/A | 17 | N/A | 3 | **A+** | 0 | None | Seven scored for Points | NARROW (Triggers don't use effect counters) | COMMON | MODERATE | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 18 | `SIX_SPADE_DEEP_DRAW` | 6♠ natural | Deep Draw | Action | N/A | 18 | 17 | 42 | **A+** | 6 | None | >=1 other hand card | ROBUST (Aces) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 19 | `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR` | 10♦ natural | Solo Mimic ⭐4 PR | Action | N/A | 19 | 18 | 39 | **A+** | 10 | 10♦ Exile-Bound | PR rows present | NARROW (⭐A, 3-Red only via IMPL-12) | RARE | HIGH | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 20 | `A_SUPER_COUNTER` | ⭐A (2 Aces) | Super Counter | Instant | N/A | 20 | 19 | 65 | **A+** | 8 | 2 Aces committed | 2 Aces in hand, pending play, <2 enemy Queens | NARROW (Blocked by Two-Queen Defense) | RARE | VERY_HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 21 | `QUEEN_QUICK_AEGIS` | Any Queen | Quick Aegis | Quick | N/A | 21 | 20 | 11 | **A+** | 2 | None | Friendly OTT card | NARROW (Cannot be countered by Base Ace) | COMMON | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 22 | `ROYAL_MARRIAGE` | Same-suit King + Queen | Royal Marriage | Action | N/A | 22 | 21 | 48 | **A+** | 10 | Same-suit K+Q committed | Same-suit K + Q in hand | NARROW (K♠ only standard counter) | RARE | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 23 | `TWO_QUICK_SCORE_DISCARD` | Any Two | Quick Score & Discard | Quick | N/A | 23 | N/A | 4 | **A+** | 0 | None | Own Full Turn | ROBUST (Aces counter effect) | COMMON | MODERATE | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 24 | `FOUR_BASE_ROW_CLEAR_PR` | Any Four | Row Clear PR | Action | N/A | 24 | 22 | 27 | **A+** | 4 | None | Enemy PR cards present | ROBUST (Aces, Aegis) | COMMON | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 25 | `JACK_SPADE_ER_ATTACHMENT` | J♠ natural | ER Attachment | Action | N/A | 25 | 23 | 23 | **A+** | 3 | None | Enemy ER Anchor | ROBUST (Aces, Aegis, Severance) | RARE | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 26 | `NINE_INSTANT_TAP` | Any Nine | Instant Tap | Instant | N/A | 26 | 24 | 21 | **A+** | 9 | None | Enemy PR card | ROBUST (Aces, Guard, Scoring untaps) | COMMON | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 27 | `TEN_DIAMOND_PAIRED_MIMIC_SUPER_ACE` | 10♦ + any Two | Paired Mimic ⭐A | Instant | N/A | 27 | N/A | 70 | **A+** | 12 | 10♦ Exile-Bound, +1 Two card | Pending play, <2 Queens | NARROW (Two-Queen Defense) | RARE | HIGH | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 28 | `FOUR_SUPER_ROW_EXCHANGE_PR` | ⭐4 (2 Fours) | Row Exchange PR | Action | N/A | 28 | 25 | 57 | **A+** | 8 | 2 Fours committed | PR rows present | NARROW (K♠) | RARE | HIGH | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 29 | `KING_INSTANT_ANCHOR_COUNTER` | Any non-♠ King | Instant Anchor Counter | Instant | N/A | 29 | 26 | 31 | **A+** | 8 | None | Pending single-card Anchor play | ROBUST (Counter-counters) | COMMON | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 30 | `TWO_SPADE_SOLO_WILD_DEEP_DRAW` | 2♠ | Solo Wild (Deep Draw) | Action | N/A | 30 | 27 | 33 | **A+** | 2 | None | >=1 other hand card | ROBUST (Aces) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 31 | `FOUR_BASE_ROW_CLEAR_ER` | Any Four | Row Clear ER | Action | N/A | 31 | 28 | 29 | **A** | 4 | None | Enemy ER Anchors present | ROBUST (Aces, Aegis) | COMMON | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 32 | `TEN_SPADE_STACK_THEFT` | 10♠ natural | Stack Theft (Interrupt) | Interrupt | N/A | 32 | 29 | 52 | **A** | 10 | +1 Full-Turn skip | Pending single effect | NARROW (⭐A, 3-Red only via IMPL-12) | RARE | VERY_HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 33 | `A_ANCHOR_ENTRY` | Any Ace | Anchor Entry & Sacrifice | Action | N/A | 33 | 30 | 44 | **A** | 4 | None | Requires ER deployment | ADEQUATE (Kings counter entry; Aces counter resolution) | COMMON | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 34 | `QUEEN_SPADE_CLEAR_IMMUNITY` | Q♠ OTT | Passive Clear Immunity | Passive | N/A | 34 | 31 | 24 | **A** | 2 | None | Q♠ deployed OTT | NARROW (4♠, ⭐2, J♠) | RARE | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 35 | `BLACK_JOKER_EXILE_RECYCLE` | Black Joker scored | Scoring Trigger (Exile Recycle) | Trigger | N/A | 35 | N/A | 12 | **A** | 0 | None | Non-empty Exile | None (Trigger) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 36 | `EIGHT_INSTANT_SCUTTLE_COUNTER` | Any Eight | Instant Scuttle Counter | Instant | N/A | 36 | 32 | 34 | **A** | 8 | None | Pending Scuttle on stack | ROBUST (Counter-counters) | COMMON | HIGH | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 37 | `RED_JOKER_HAND_SWAP` | Red Joker | Hand Swap | Action | N/A | 37 | 33 | 37 | **A** | 5 | None | Opponent has hand cards | ROBUST (Aces) | RARE | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 38 | `TWO_SUPER_COMMANDEER_HOLD` | ⭐2 (2 Twos) | Commandeer Hold | Action | N/A | 38 | 34 | 53 | **A** | 4 | 2 Twos committed | Enemy OTT card (non-Aegis) | NARROW (K♠, Aegis) | RARE | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 39 | `KING_SPADE_ANCHOR` | K♠ natural | ER Anchor (9 pts) | Action | N/A | 39 | 35 | 36 | **A** | 8 | None | Action phase | ADEQUATE (Kings counter, Clears, J♠) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 40 | `RED_JOKER_SELF_RESET` | Red Joker | Self Reset | Action | N/A | 40 | 36 | 32 | **A** | 5 | None | Action phase | ROBUST (Aces) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 41 | `TWO_SOLO_WILD_ROW_CLEAR` | Any suited Two | Solo Wild (4-Row Clear) | Action | N/A | 41 | 37 | 25 | **A** | 2 | None | Enemy row present | ROBUST (Aces) | COMMON | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 42 | `ULTRA_2B2R_RUMMAGE_EXILE` | 2 Black + 2 Red cards | 2B+2R Rummage | Action | N/A | 42 | 38 | 62 | **A** | 14 | 4 cards committed | 2 Black + 2 Red in hand, non-empty Exile | NARROW (⭐A, 3-Red only) | COMMON | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 43 | `EIGHT_SCUTTLE_BONUS` | Any Eight | Scuttle Bonus Draw | Trigger | N/A | 43 | N/A | 19 | **A** | 8 | None | Resolve ordinary Scuttle with 8 | None (Trigger) | COMMON | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 44 | `JACK_PR_ATTACHMENT` | Any Jack | PR Attachment | Action | N/A | 44 | 39 | 30 | **A** | 3 | None | Vulnerable enemy PR card | ROBUST (Aces, Guard, Aegis, Severance) | COMMON | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 45 | `RED_JOKER_OPPONENT_ATTACK` | Red Joker | Opponent Attack | Action | N/A | 45 | 40 | 41 | **A** | 5 | None | Opponent has large hand | ROBUST (Aces) | RARE | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 46 | `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_ER` | 10♦ natural | Solo Mimic ⭐4 ER | Action | N/A | 46 | 41 | 56 | **A** | 10 | 10♦ Exile-Bound | ER rows present | NARROW (⭐A, 3-Red only via IMPL-12) | RARE | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 47 | `ULTRA_THREE_BLACK` | 3 Black cards (♣/♠) | 3 Black Ultra | Action | N/A | 47 | 42 | 67 | **A** | 12 | 3 cards committed | 3 black cards in hand | NARROW (⭐A, 3-Red only) | COMMON | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 48 | `FOUR_SUPER_ROW_EXCHANGE_ER` | ⭐4 (2 Fours) | Row Exchange ER | Action | N/A | 48 | 43 | 68 | **A** | 8 | 2 Fours committed | ER rows present | NARROW (K♠) | RARE | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 49 | `NINE_SPADE_GOAL_SHIFT` | 9♠ | Goal Shift (+5, Discard, Own -2) | Instant | N/A | 49 | N/A | 69 | **B+** | 9 | +1 discard | >=1 other hand card | ROBUST (Aces, Kings) | RARE | MODERATE | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 50 | `ROYAL_SHIELD_PROTECTION` | Queen count advantage | Royal Shield Snapshot | Passive | N/A | 50 | N/A | 14 | **B+** | 0 | None | Friendly Queens > enemy Queens | A♠, K♠, ⭐A | PLAUSIBLE | HIGH | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 51 | `JACK_SUPER_TEMPO_FORCE` | ⭐J (2 Jacks) | Tempo Force | Action | N/A | 51 | 44 | 54 | **B+** | 6 | 2 Jacks committed | Action phase | NARROW (K♠) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 52 | `THREE_INSTANT_BOUNCE` | Any Three | Instant Bounce | Instant | N/A | 52 | N/A | 26 | **B+** | 3 | None | Response window, OTT target | ROBUST (Aces, Guard) | COMMON | MODERATE | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 53 | `KING_BASE_ANCHOR` | Any non-♠ King | ER Anchor (7 pts) | Action | N/A | 53 | 45 | 51 | **B+** | 8 | None | Action phase | ADEQUATE (Kings counter, Clears, J♠) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `VERY_HIGH` |
| 54 | `SEVEN_RECURSIVE_TOPDECK` | Physical Seven revealed | Recursive Topdeck | Action | N/A | 54 | N/A | 28 | **B+** | 0 | None | Topdeck casting active, physical 7 revealed | ROBUST (Aces) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 55 | `TEN_DIAMOND_PAIRED_MIMIC_ROW_EXCHANGE` | 10♦ + any Two | Paired Mimic ⭐4 | Action | N/A | 55 | 46 | 73 | **B+** | 12 | 10♦ Exile-Bound, +1 Two card | Rows present | NARROW (K♠, ⭐A) | RARE | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 56 | `EIGHT_SUPER_ABSOLUTE_SCUTTLE` | ⭐8 (2 Eights) | Absolute Scuttle | Action | N/A | 56 | 47 | 83 | **B+** | 16 | 2 Eights committed | Enemy PR card (non-Aegis) | NARROW (K♠, Aegis) | RARE | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 57 | `SIX_BASE_DIG_RETURN` | Any Six | Dig Mode 1 | Action | N/A | 57 | 48 | 59 | **B+** | 6 | None | DP >= 3 | ROBUST (Aces) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 58 | `FOUR_QUICK_NATURAL` | Any Four | Quick Natural | Quick | N/A | 58 | N/A | 20 | **B+** | 4 | None | DP >= 4 | ROBUST (Aces) | COMMON | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 59 | `TEN_DIAMOND_PAIRED_MIMIC_ABSOLUTE_SCUTTLE` | 10♦ + any Two | Paired Mimic ⭐8 | Action | N/A | 59 | 49 | 78 | **B+** | 12 | 10♦ Exile-Bound, +1 Two card | Enemy PR card | NARROW (K♠, Aegis) | RARE | MODERATE | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 60 | `VOLTAGE_FIVE_REFINEMENT` | Start Snapshot (PR Fives >= 5) | Voltage 5 Refinement | Instant Start | N/A | 60 | 50 | 7 | **B+** | 0 | None | PR Fives >= 5 at Start | None (Start trigger) | PLAUSIBLE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 61 | `SIX_BASE_DIG_DISCARD` | Any Six | Dig Mode 2 | Action | N/A | 61 | 51 | 63 | **B+** | 6 | None | DP >= 3 | ROBUST (Aces) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 62 | `TWO_SUPER_COMMANDEER_SCORE` | ⭐2 (2 Twos) | Commandeer Score | Action | N/A | 62 | 52 | 61 | **B+** | 4 | 2 Twos committed | Enemy OTT card (non-Aegis) | NARROW (K♠, Aegis) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 63 | `SEVEN_SPADE_TOPDECK` | 7♠ | Topdeck Casting (Reveal 3) | Action | N/A | 63 | N/A | 49 | **B+** | 7 | None | DP >= 3 | ROBUST (Aces) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 64 | `THREE_SPADE_ENHANCEMENT` | 3♠ | Hand Raid Enhancement | Action | N/A | 64 | N/A | 46 | **B+** | 3 | None | Opponent has hand cards | ROBUST (Aces) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 65 | `VOLTAGE_THREE_SLEIGHT` | Start Snapshot (PR Threes >= 3) | Voltage 3 Sleight | Instant Start | N/A | 65 | 53 | 9 | **B+** | 0 | None | PR Threes >= 3 at Start | None (Start trigger) | PLAUSIBLE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 66 | `FIVE_SPADE_EXILE_RUMMAGE` | 5♠ | Suit Rummage (Any Card) | Action | N/A | 66 | N/A | 66 | **B** | 5 | None | Exile >= 1 | ROBUST (Aces) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 67 | `KING_SPADE_WILD_DEEP_DRAW` | K♠ natural | Wild Sovereignty (Deep Draw) | Action | N/A | 67 | 54 | 88 | **B** | 8 | +1-2 discards, K♠ exiled | >=1 other hand card | ROBUST (Aces) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 68 | `RED_JOKER_SHUFFLE_RESET` | Red Joker | Shuffle Reset | Action | N/A | 68 | 55 | 58 | **B** | 5 | None | Rich Graveyard | ROBUST (Aces) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 69 | `TEN_DIAMOND_PAIRED_MIMIC_SUPER_J_TEMPO` | 10♦ + any Two | Paired Mimic ⭐J | Action | N/A | 69 | 56 | 81 | **B** | 12 | 10♦ Exile-Bound, +1 Two card | Action phase | NARROW (K♠) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 70 | `FIVE_BASE_RECYCLE` | Any Five | Recycle Line | Action | N/A | 70 | 57 | 60 | **B** | 5 | None | DP >= 2 | ROBUST (Aces) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 71 | `NINE_ANCHOR` | Any Nine | Anchor Entry & Hand Discard | Action | N/A | 71 | 58 | 74 | **B** | 9 | None | Opponent has hand cards | ROBUST (Aces, Kings) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 72 | `KING_SPADE_WILD_ROW_CLEAR` | K♠ natural | Wild Sovereignty (4-Row Clear) | Action | N/A | 72 | 59 | 85 | **B** | 8 | K♠ exiled | Enemy row present | ROBUST (Aces) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 73 | `TWO_SOLO_WILD_RECYCLE` | Any suited Two | Solo Wild (5-Recycle) | Action | N/A | 73 | 60 | 50 | **B** | 2 | None | DP >= 2 | ROBUST (Aces) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 74 | `SEVEN_BASE_TOPDECK` | Any Seven | Topdeck Casting | Action | N/A | 74 | 61 | 55 | **B** | 7 | AS-EXECUTED: 7-pt scoring blocked by IMPL-01 | DP >= 2 | ROBUST (Aces) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 75 | `SIX_QUICK_SWAP_BAR_PEEK` | Any Six | Quick Swap Bar Peek | Quick | N/A | 75 | N/A | 38 | **B** | 6 | None | Face-down Swap Bar card exists | ROBUST (Aces on cast) | COMMON | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 76 | `FIVE_SUPER_RECYCLE` | ⭐5 (2 Fives) | Super Recycle | Action | N/A | 76 | 62 | 90 | **B** | 10 | 2 Fives committed | DP >= 4 | NARROW (K♠) | RARE | LOW | `UNRESTRICTED_ONLY` | core-unrestricted-only | `MODERATE` |
| 77 | `TEN_SPADE_EXILE_RECOVERY` | 10♠ natural | Exile Recovery | Action | N/A | 77 | 63 | 76 | **B** | 10 | 10♠ exiled | Non-empty Exile | NARROW (⭐A, 3-Red only via IMPL-12) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 78 | `TWO_SOLO_WILD_TOPDECK` | Any suited Two | Solo Wild (Topdeck) | Action | N/A | 78 | 64 | 64 | **B** | 2 | None | DP >= 2 | ROBUST (Aces) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 79 | `THREE_BASE_HAND_RAID` | Any Three | Hand Raid (present-take) | Action | N/A | 79 | 65 | 72 | **B** | 3 | None | Opponent has hand cards | ROBUST (Aces) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 80 | `A_PURGE_SCRAP_AEGIS` | Any Ace | Purge Mode 1 | Action | N/A | 80 | 66 | 80 | **B** | 4 | None | Aegised card OTT | ROBUST (Aces) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 81 | `NINE_INSTANT_GOAL_SHIFT_FIVE` | Any Nine | Goal Shift +5 | Instant | N/A | 81 | N/A | 86 | **C+** | 9 | +1 discard | >=1 other hand card | ROBUST (Aces, Kings) | COMMON | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 82 | `THREE_SUPER_RAID` | ⭐3 (2 Threes) | Super Raid | Action | N/A | 82 | 67 | 91 | **C+** | 6 | 2 Threes committed | Opponent has hand cards | NARROW (K♠) | RARE | LOW | `UNRESTRICTED_ONLY` | core-unrestricted-only | `MODERATE` |
| 83 | `FIVE_CLUB_EXILE_RUMMAGE` | 5♣ | Suit Rummage (Newest 2) | Action | N/A | 83 | N/A | 75 | **C+** | 5 | None | Exile >= 1 | ROBUST (Aces) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 84 | `FIVE_HEART_EXILE_RUMMAGE` | 5♥ | Suit Rummage (Oldest 2) | Action | N/A | 84 | N/A | 77 | **C+** | 5 | None | Exile >= 1 | ROBUST (Aces) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 85 | `TWO_SOLO_WILD_BOUNCE` | Any suited Two | Solo Wild (3-Bounce) | Action | N/A | 85 | 68 | 71 | **C+** | 2 | None | OTT target | ROBUST (Aces, Guard) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 86 | `TEN_DIAMOND_PAIRED_MIMIC_SUPER_FIVE` | 10♦ + any Two | Paired Mimic ⭐5 | Action | N/A | 86 | N/A | 92 | **C+** | 12 | 10♦ Exile-Bound, +1 Two card | DP >= 4 | NARROW (K♠) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 87 | `THREE_BASE_BOUNCE` | Any Three | Bounce OTT | Action | N/A | 87 | 69 | 79 | **C+** | 3 | None | Vulnerable OTT target | ROBUST (Aces, Guard) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 88 | `A_PURGE_BOUNCE_ANCHOR` | Any Ace | Purge Mode 2 | Action | N/A | 88 | 70 | 87 | **C+** | 4 | None | Vulnerable enemy Anchor, no Aegised cards OTT | ROBUST (Aces, Guard) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 89 | `NINE_INSTANT_GOAL_SHIFT_THREE` | Any Nine | Goal Shift +3 | Instant | N/A | 89 | N/A | 89 | **C+** | 9 | None | Opponent target | ROBUST (Aces, Kings) | COMMON | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 90 | `THREE_BASE_FORCE_DISCARD` | Any Three | Force Discard | Action | N/A | 90 | 71 | 82 | **C+** | 3 | None | Opponent has hand cards | ROBUST (Aces) | COMMON | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 91 | `TEN_DIAMOND_PAIRED_MIMIC_SUPER_THREE` | 10♦ + any Two | Paired Mimic ⭐3 | Action | N/A | 91 | N/A | 94 | **C** | 12 | 10♦ Exile-Bound, +1 Two card | Opponent hand cards | NARROW (K♠) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 92 | `FIVE_DIAMOND_EXILE_RUMMAGE` | 5♦ | Suit Rummage (Middle, >=5) | Action | N/A | 92 | N/A | 84 | **C** | 5 | None | Exile >= 5 | ROBUST (Aces) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 93 | `VOLTAGE_FOUR_PREDICTABLE` | Start Snapshot (PR Fours >= 4) | Voltage 4 Predictable | Instant Start | N/A | 93 | 72 | 43 | **C** | 0 | None | PR Fours >= 4 at Start | None (Start trigger) | PLAUSIBLE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 94 | `KING_SPADE_WILD_TOPDECK` | K♠ natural | Wild Sovereignty (Topdeck) | Action | N/A | 94 | 73 | 93 | **C** | 8 | K♠ exiled | DP >= 2 | ROBUST (Aces) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 95 | `TEN_DIAMOND_PAIRED_MIMIC_SUPER_SIX` | 10♦ + any Two | Paired Mimic ⭐6 | Action | N/A | 95 | N/A | 97 | **C** | 12 | +1-2 discards for Deep Draw | Hand cards | NARROW (K♠) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 96 | `KING_SPADE_WILD_RECYCLE` | K♠ natural | Wild Sovereignty (5-Recycle) | Action | N/A | 96 | 74 | 95 | **C** | 8 | K♠ exiled | DP >= 2 | ROBUST (Aces) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 97 | `TEN_DIAMOND_PAIRED_MIMIC_SUPER_SEVEN` | 10♦ + any Two | Paired Mimic ⭐7 | Action | N/A | 97 | N/A | 99 | **C** | 12 | 10♦ Exile-Bound, +1 Two card | DP >= 4 | NARROW (K♠) | RARE | LOW | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 98 | `SUDDEN_DEATH_ACTIVATION` | RJ+BJ or 4-of-a-kind | Sudden Death Activation | Action | N/A | 98 | N/A | 96 | **C** | 16 | Multi-card combo (RJ+BJ or 4-of-a-kind) | RJ+BJ or 4-of-a-kind, vulnerable enemy OTT | NARROW (⭐A only) | CONSTRUCTED_ONLY | VERY_HIGH | `NOT_IMPLEMENTED` | written-only | `LOW` |
| 99 | `KING_SPADE_WILD_BOUNCE` | K♠ natural | Wild Sovereignty (3-Bounce) | Action | N/A | 99 | 75 | 98 | **D** | 8 | K♠ exiled | OTT target | ROBUST (Aces, Guard) | RARE | LOW | `MATCH` | core-advanced-and-unrestricted | `HIGH` |
| 100 | `SIX_SUPER_DIG` | ⭐6 (2 Sixes) | Super Dig | Action | N/A | 100 | N/A | 100 | **D** | 12 | 2 Sixes committed | >=1 other hand card | NARROW (K♠) | RARE | LOW | `DEFECT_CONTAMINATED` | core-unrestricted-only | `MODERATE` |
| 101 | `SEVEN_SUPER_TOPDECK` | ⭐7 (2 Sevens) | Sequential Topdeck | Action | N/A | 101 | N/A | 101 | **D** | 14 | 2 Sevens committed | DP >= 4 | NARROW (K♠) | RARE | LOW | `DEFECT_CONTAMINATED` | core-unrestricted-only | `MODERATE` |

---

## 6. Effect-Primitive Raw Potency Matrix (75 Primitives)

This matrix evaluates **core mechanic primitives** in a vacuum, stripping away declaration routes. Each primitive is scored by the highest rawPotencyScore across all its routes.

| Rank | Primitive ID | Primitive Name | Best Route | Route Count | Max Raw Score |
|---:|---|---|---|---:|---:|
| 1 | `SUDDEN_DEATH` | Scrap 1 OTT, 2-Turn Countdown to Win | `SUDDEN_DEATH_ACTIVATION` (Sudden Death Activation) | 1 | 98 |
| 2 | `TOTAL_CLEAR` | Global OTT Structural Reset | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` (2♠ Solo Wild -> 4♠ Total Clear) | 3 | 94 |
| 3 | `ULTRA_THREE_RED` | ⭐A Counter Authority + Draw Bottom GY | `ULTRA_THREE_RED_COUNTER` (3 Red Ultra Counter) | 1 | 92 |
| 4 | `SUPER_COUNTER` | Absolute Counter Authority | `A_SUPER_COUNTER` (⭐A Super Counter) | 2 | 91 |
| 5 | `BOARD_LOCK` | 2-Turn Global Effect/Scuttle Lockdown | `BLACK_JOKER_BOARD_LOCK` (Black Joker Board Lock) | 1 | 89 |
| 6 | `ROW_EXCHANGE_PR` | Swap PR Rows, Grant Aegis | `FOUR_SUPER_ROW_EXCHANGE_PR` (⭐4 Row Exchange PR) | 3 | 88 |
| 7 | `HAND_SWAP` | Exchange Entire Hands with Opponent | `RED_JOKER_HAND_SWAP` (Red Joker Hand Swap) | 1 | 87 |
| 8 | `STACK_THEFT` | Seize Single Effect, Both Players Skip FT | `TEN_SPADE_STACK_THEFT` (10♠ Stack Theft) | 1 | 86 |
| 9 | `COUNTER_MULTI_PLAY` | Counter Any Multi-Card Play (Supers, QC, RM) | `KING_SPADE_INSTANT_MULTI_COUNTER` (K♠ Counter Multi-Play) | 1 | 85 |
| 10 | `QUEENS_COURT_DOUBLE_ANCHOR` | Commit 2 Queens to ER with Aegis | `QUEEN_COURT` (Queen's Court) | 1 | 85 |
| 11 | `ULTRA_2B2R_TEMPO_DRAW` | +2 Mini-Turns, Draw 2 Cards | `ULTRA_2B2R_DRAW` (2B+2R Ultra (Draw 2)) | 1 | 85 |
| 12 | `ROW_EXCHANGE_ER` | Swap ER Rows, Grant Aegis | `FOUR_SUPER_ROW_EXCHANGE_ER` (⭐4 Row Exchange ER) | 2 | 84 |
| 13 | `TEMPO_SPIKE` | +2 Mini-Turns, Draw 1, Exile Source | `TEN_HEART_TEMPO_SPIKE` (10♥ Tempo Spike) | 1 | 84 |
| 14 | `COMMANDEER_HOLD` | Steal OTT Card, Tap to Start | `TWO_SUPER_COMMANDEER_HOLD` (⭐2 Commandeer (Hold)) | 1 | 83 |
| 15 | `ULTRA_2B2R_TEMPO_RUMMAGE` | +2 Mini-Turns, Rummage 1 from Exile | `ULTRA_2B2R_RUMMAGE_EXILE` (2B+2R Ultra (Rummage Exile)) | 1 | 83 |
| 16 | `FOUNDATION_SCORING_SURGE` | 10 Pts + Entry Aegis (+Bonus Score if 0 Pts) | `TEN_CLUB_FOUNDATION` (10♣ Foundation) | 1 | 82 |
| 17 | `ROYAL_MARRIAGE_ENTRY` | Deploy King + Queen to ER simultaneously | `ROYAL_MARRIAGE` (Royal Marriage) | 1 | 82 |
| 18 | `SUPER_TOPDECK` | Sequential Independent Topdecks | `SEVEN_SUPER_TOPDECK` (⭐7 Super Topdeck) | 2 | 82 |
| 19 | `QUICK_AEGIS_FIELD` | Aegis to All Friendly OTT Cards | `EIGHT_QUICK_AEGIS_FIELD` (8 Quick Aegis Field) | 1 | 81 |
| 20 | `ABSOLUTE_SCUTTLE` | Scuttle Ignoring Immunity & Rank | `EIGHT_SUPER_ABSOLUTE_SCUTTLE` (⭐8 Absolute Scuttle) | 2 | 80 |
| 21 | `COMMANDEER_SCORE` | Steal OTT Card, Score to PR | `TWO_SUPER_COMMANDEER_SCORE` (⭐2 Commandeer (Score)) | 1 | 80 |
| 22 | `ULTRA_THREE_BLACK` | Score 1 + Cast 1 + Exile 1 | `ULTRA_THREE_BLACK` (3 Black Ultra) | 1 | 80 |
| 23 | `ATTACHMENT_ER` | Attach to Enemy Anchor, Gain Control | `JACK_SPADE_ER_ATTACHMENT` (J♠ ER Attachment) | 1 | 79 |
| 24 | `EXILE_COUNTER` | Negate & Exile Source Cards | `A_SPADE_EXILE_COUNTER` (A♠ Exile Counter) | 1 | 78 |
| 25 | `SUPER_DIG` | Discard 1-2, Draw 8, Keep 5-6 | `SIX_SUPER_DIG` (⭐6 Super Dig) | 2 | 78 |
| 26 | `FREE_SCUTTLE` | Instant Free Scuttle Any Rank/Suit | `EIGHT_SPADE_FREE_SCUTTLE` (8♠ Free Scuttle) | 1 | 77 |
| 27 | `GUARD_PROTECTION` | Provide Guard to Other Friendly OTT Cards | `QUEEN_ER_GUARD_ANCHOR` (Queen ER Guard Anchor) | 1 | 76 |
| 28 | `OPPONENT_ATTACK` | Opponent Discards Hand, Redraws -2 | `RED_JOKER_OPPONENT_ATTACK` (Red Joker Opponent Attack) | 1 | 76 |
| 29 | `TEMPO_FORCE` | +2 Mini-Turns (Paired) | `TEN_DIAMOND_PAIRED_MIMIC_SUPER_J_TEMPO` (10♦ Paired Mimic ⭐J) | 2 | 76 |
| 30 | `DEEP_DRAW` | Discard 1-2, Draw 6, Keep 3-4 | `TWO_SPADE_SOLO_WILD_DEEP_DRAW` (2♠ Solo Wild -> 6♠ Deep Draw) | 3 | 75 |
| 31 | `ROW_CLEAR_PR` | Clear Enemy PR / ER | `TWO_SOLO_WILD_ROW_CLEAR` (2 Solo Wild -> 4-Row Clear) | 3 | 74 |
| 32 | `SELF_RESET` | Discard Hand, Draw Size + 3 | `RED_JOKER_SELF_RESET` (Red Joker Self Reset) | 1 | 74 |
| 33 | `GOAL_SHIFT_SPADE` | Opponent Goal +5, Own Goal -2 | `NINE_SPADE_GOAL_SHIFT` (9♠ Goal Shift) | 1 | 73 |
| 34 | `Q_SPADE_CLEAR_IMMUNITY` | Immunity to Non-Total Clears | `QUEEN_SPADE_CLEAR_IMMUNITY` (Q♠ Clear Immunity) | 1 | 73 |
| 35 | `ANCHOR_COUNTER` | ER Delayed Counter & Source Steal | `A_ANCHOR_ENTRY` (Anchor Ace) | 1 | 72 |
| 36 | `ROW_CLEAR_ER` | Clear Enemy ER | `FOUR_BASE_ROW_CLEAR_ER` (4 Row Clear ER) | 1 | 72 |
| 37 | `TOPDECK_RECURSION` | Chain Nested Topdeck Casting | `SEVEN_RECURSIVE_TOPDECK` (7 Recursive Topdeck) | 1 | 72 |
| 38 | `ATTACHMENT_PR` | Attach to Enemy PR Card (+1, Control) | `JACK_PR_ATTACHMENT` (Jack PR Attachment) | 1 | 71 |
| 39 | `SUPER_RECYCLE` | Mill 4, Rummage GY, Draw 2 Bottom | `FIVE_SUPER_RECYCLE` (⭐5 Super Recycle) | 2 | 70 |
| 40 | `TOPDECK_CASTING_REVEAL_3` | Topdeck: Reveal 3, Assign Hand/Effect | `SEVEN_SPADE_TOPDECK` (7♠ Topdeck Casting) | 1 | 70 |
| 41 | `SHUFFLE_RESET` | Shuffle DP + GY into DP, Draw 2 | `RED_JOKER_SHUFFLE_RESET` (Red Joker Shuffle Reset) | 1 | 69 |
| 42 | `BASE_COUNTER` | Negate Ordinary Effect / Counter | `A_BASE_COUNTER` (Base Ace Counter) | 1 | 68 |
| 43 | `ENHANCEMENT_RAID` | Present <=2, Score or Cast 1 | `THREE_SPADE_ENHANCEMENT` (3♠ Enhancement) | 1 | 68 |
| 44 | `EXILE_RECOVERY` | Recover 1 Card from Exile (Revealed) | `TEN_SPADE_EXILE_RECOVERY` (10♠ Exile Recovery) | 1 | 68 |
| 45 | `SUPER_RAID` | Steal Opponent Hand Card | `THREE_SUPER_RAID` (⭐3 Super Raid) | 2 | 67 |
| 46 | `ANCHOR_PASSIVE_SCORE` | Provide ER Anchor Value (7 pts) | `KING_SPADE_ANCHOR` (K♠ Anchor) | 2 | 66 |
| 47 | `EXILE_RUMMAGE_WINDOW` | Rummage Exile by Position | `FIVE_SPADE_EXILE_RUMMAGE` (5♠ Exile Rummage) | 4 | 66 |
| 48 | `TOPDECK_CASTING` | Topdeck Casting: Hand + Generated Play | `TWO_SOLO_WILD_TOPDECK` (2 Solo Wild -> 7-Topdeck) | 3 | 66 |
| 49 | `ANCHOR_COUNTER_KING` | Counter Single-Card Anchor / Goal-Mod | `KING_INSTANT_ANCHOR_COUNTER` (King Anchor Counter) | 1 | 65 |
| 50 | `PURGE_SCRAP_AEGIS` | Scrap Aegised Card | `A_PURGE_SCRAP_AEGIS` (Ace Purge (Scrap Aegis)) | 1 | 65 |
| 51 | `QUICK_AEGIS_TARGET` | Grant Aegis to 1 Friendly OTT Card | `QUEEN_QUICK_AEGIS` (Queen Quick Aegis) | 1 | 65 |
| 52 | `INSTANT_BOUNCE` | Instant Bounce to Top/Bottom DP | `THREE_INSTANT_BOUNCE` (3 Instant Bounce) | 1 | 64 |
| 53 | `INSTANT_TAP` | Tap Enemy PR (Untaps on Score) | `NINE_INSTANT_TAP` (9 Instant Tap) | 1 | 64 |
| 54 | `GOAL_SHIFT_FIVE` | Increase Opponent Goal by 5, Discard 1 | `NINE_INSTANT_GOAL_SHIFT_FIVE` (9 Goal Shift (+5 Discard)) | 1 | 63 |
| 55 | `ROYAL_SHIELD_PROTECTION` | Block Base/Anchor Ace Counters | `ROYAL_SHIELD_PROTECTION` (Royal Shield Protection) | 1 | 63 |
| 56 | `NINE_ANCHOR_DISCARD` | Reveal Hand, Discard 1 | `NINE_ANCHOR` (Nine Anchor) | 1 | 62 |
| 57 | `SCORING_TRIGGER_SEVEN` | When Scored: Reveal 2, Take 1 | `SEVEN_SCORING_TRIGGER` (7 Scoring Trigger) | 1 | 62 |
| 58 | `SCUTTLE_COUNTER` | Counter Pending Scuttle | `EIGHT_INSTANT_SCUTTLE_COUNTER` (8 Scuttle Counter) | 1 | 61 |
| 59 | `RECYCLE` | Mill 2, GY Rummage, Draw Bottom | `TWO_SOLO_WILD_RECYCLE` (2 Solo Wild -> 5-Recycle) | 3 | 60 |
| 60 | `EXILE_RECYCLE_TRIGGER` | When Scored: Move <=2 Exile to DP | `BLACK_JOKER_EXILE_RECYCLE` (Black Joker Exile Recycle) | 1 | 59 |
| 61 | `DIG` | Draw 3, Keep 2, Return 1 | `SIX_BASE_DIG_RETURN` (6 Dig (Return to DP)) | 2 | 58 |
| 62 | `PURGE_BOUNCE_ANCHOR` | Bounce Vulnerable Anchor | `A_PURGE_BOUNCE_ANCHOR` (Ace Purge (Bounce Anchor)) | 1 | 58 |
| 63 | `DISRUPT` | Draw 1, Prohibit Action Type Repeat | `JACK_INSTANT_DISRUPT` (Jack Instant Disrupt) | 1 | 57 |
| 64 | `HAND_RAID_PRESENT_TAKE` | Opponent Presents <=3, Take <=2 | `THREE_BASE_HAND_RAID` (3 Hand Raid) | 1 | 56 |
| 65 | `QUICK_SWAP_BAR_PEEK` | Look Face-Down Bar, Take/Cast | `SIX_QUICK_SWAP_BAR_PEEK` (6 Quick Swap Bar Peek) | 1 | 55 |
| 66 | `BOUNCE_OTT_TOP_DP` | Bounce OTT Card to Top DP | `TWO_SOLO_WILD_BOUNCE` (2 Solo Wild -> 3-Bounce) | 3 | 54 |
| 67 | `GOAL_SHIFT_THREE` | Increase Opponent Goal by 3 | `NINE_INSTANT_GOAL_SHIFT_THREE` (9 Goal Shift (+3)) | 1 | 53 |
| 68 | `FORCE_DISCARD` | Opponent Discards <=2 | `THREE_BASE_FORCE_DISCARD` (3 Force Discard) | 1 | 52 |
| 69 | `QUICK_SCORE_DISCARD` | Score 2 & Force Discard | `TWO_QUICK_SCORE_DISCARD` (2 Quick Score+Discard) | 1 | 52 |
| 70 | `VOLTAGE_FIVE_REFINEMENT` | Draw GY Bottom or Refine Hand | `VOLTAGE_FIVE_REFINEMENT` (Voltage ⚡5 Refinement) | 1 | 52 |
| 71 | `SCUTTLE_BONUS` | Draw GY upon Successful Scuttle | `EIGHT_SCUTTLE_BONUS` (8 Scuttle Bonus) | 1 | 51 |
| 72 | `QUICK_NATURAL` | Reorder Top 4 DP, Draw 1 | `FOUR_QUICK_NATURAL` (4 Quick Natural) | 1 | 50 |
| 73 | `VOLTAGE_THREE_SLEIGHT` | Take Top DP to Hand or PR | `VOLTAGE_THREE_SLEIGHT` (Voltage ⚡3 Sleight) | 1 | 50 |
| 74 | `VOLTAGE_FOUR_PREDICTABLE` | Predict Rank+Suit of Top DP | `VOLTAGE_FOUR_PREDICTABLE` (Voltage ⚡4 Predictable) | 1 | 48 |
| 75 | `SUDDEN_DEATH_DEAD_ACTION` | Wastes Mini-Turn, Never Advances | `SUDDEN_DEATH_ACTION_DEFECT` (Sudden Death Defect Action) | 1 | 1 |

*Key Primitive Insights:*
* **Total Clear** is intrinsically the most destructive primitive in Intrilex, resetting all PR and ER state regardless of protection.
* **Super Counter** is the highest-authority reactive primitive, answering all single-item stack plays.
* **Board Lock** is the premier structural control primitive, freezing active gameplay while permitting points advancement.

---

## 7. Dominance & Cross-Card Superiority Findings

1. **`DOM-01` — WITHIN-CARD MODE SUPERIORITY:**
   * **Status:** NEARLY DOMINATED
   * **Dominant route:** `TWO_SUPER_COMMANDEER_HOLD`
   * **Dominated/inferior route:** `TWO_SUPER_COMMANDEER_SCORE`
   * *Reasoning:* Hold mode seizes the card tapped until Start, retaining the option to score it OR cast its effect for free. Score mode immediately scores it into PR. Hold mode's optionality is usually superior, but Score mode provides immediate, undisruptable PR points — the tapped card in Hold mode can be answered by K♠, Aegis re-activation, or other removal before Start. Hold is the stronger default but does not strictly dominate Score in all states.

2. **`DOM-02` — CROSS-CARD ROUTE SUPERIORITY:**
   * **Status:** CROSS-CARD SUPERIOR (same primitive, lower input cost)
   * **Dominant route:** `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR`
   * **Dominated/inferior route:** `TEN_DIAMOND_PAIRED_MIMIC_ROW_EXCHANGE`
   * *Reasoning:* Solo Mimic achieves the identical Row Exchange effect using only 10♦. Paired Mimic requires 10♦ PLUS an extra Two card. Both routes share the 10♦ component, but Paired Mimic pays an additional card for zero additional effect. This is cross-card route superiority rather than strict dominance because the source card sets differ.

3. **`DOM-03` — CROSS-CARD ROUTE SUPERIORITY:**
   * **Status:** CROSS-CARD SUPERIOR (same cost, enhanced effect)
   * **Dominant route:** `A_SPADE_EXILE_COUNTER`
   * **Dominated/inferior route:** `A_BASE_COUNTER`
   * *Reasoning:* A♠ has identical timing (Instant), identical card cost (1 card), and identical points forgone (4 pts), but adds source-exile (denying Graveyard recursion) and immunity to Base Ace counter-counters. A♠ is functionally superior to Base Ace in reactive trades, balanced only by 1-copy rarity. Cross-card superiority rather than strict dominance because the source cards are different identities.

4. **`DOM-04` — CROSS-CARD ROUTE SUPERIORITY:**
   * **Status:** CROSS-CARD SUPERIOR (same primitive, lower cost)
   * **Dominant route:** `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR`
   * **Dominated/inferior route:** `KING_SPADE_WILD_TOTAL_CLEAR`
   * *Reasoning:* Both routes execute Total Clear, but 2♠ costs 2 points forgone with zero extra discard and goes to Graveyard, while K♠ costs 8 points forgone, requires an additional discard, and exiles K♠ permanently. 2♠ is vastly more efficient. Cross-card superiority because the source cards are different identities with different opportunity costs.

5. **`DOM-05` — DEFECT DOMINANCE:**
   * **Status:** STRICTLY DOMINATED (defect vs functional route)
   * **Dominant route:** `FOUR_SPADE_TOTAL_CLEAR`
   * **Dominated/inferior route:** `SUDDEN_DEATH_ACTION_DEFECT`
   * *Reasoning:* Sudden Death in Unrestricted consumes a Mini-Turn and never advances, achieving zero game effect. Any functional action strictly dominates this defect.

---

## 8. The Strategic Pareto Frontier

An effect route lies on the Pareto frontier if no other route is equal or superior across all key dimensions (Potency, Efficiency, Timing, Cost, Reachability, Threat).

**Identified Pareto Frontier Routes (20 Effects):**
1. `A_SPADE_EXILE_COUNTER` (#1 Practical AS-WRITTEN) — Functionally superior to Base Ace as an answer: it exiles the countered card (denying Graveyard recursion) and is not answerable by Base Ace counter-counters. Its singleton scarcity (1 copy vs. 3 copies) prevents it from distorting general play.
2. `EIGHT_SPADE_FREE_SCUTTLE` (#2 Practical AS-WRITTEN) — Zero Mini-Turn tactical removal at Instant response speed, completely ignoring rank and suit requirements. Exceptional tempo weapon that punishes unguarded high-value PR cards (88.9% conversion in telemetry).
3. `KING_SPADE_INSTANT_MULTI_COUNTER` (#3 Practical AS-WRITTEN) — The sole standard direct counter to Queen's Court, Royal Marriage, Supers, and paired 10♦. Massive latent deterrence that forces opponents to hold multi-card combos until K♠ is exhausted.
4. `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` (#5 Practical AS-WRITTEN) — Provides a single-card global board reset for only 2 points forgone and zero extra discard cost. Highest efficiency board wipe in the game, turning 2♠ into a second natural 4♠.
5. `A_BASE_COUNTER` (#6 Practical AS-WRITTEN) — Universal reactive response against ordinary effect plays. Available in 3 copies, it establishes the fundamental counter threat that shapes all sequencing, held in check by the 4-point PR scoring sacrifice.
6. `BLACK_JOKER_BOARD_LOCK` (#7 Practical AS-WRITTEN) — Free Quick play activating a 2-turn global lockdown that prohibits all non-counter effect plays, Scuttles, and Traps. Tremendous game-sealing tool when holding a points lead.
7. `EIGHT_QUICK_AEGIS_FIELD` (#8 Practical AS-WRITTEN) — Grants hard Aegis immunity to all friendly PR and ER cards (except Nines) until next Start without spending a Mini-Turn. Critical protection tool that locks in a point lead before passing the turn.
8. `QUEEN_ER_GUARD_ANCHOR` (#11 Practical AS-WRITTEN) — Enters ER with protected-entry Aegis and establishes Guard, shielding all other friendly cards from enemy single-target effects. The defensive foundation of control decks.
9. `ULTRA_2B2R_DRAW` (#12 Practical AS-WRITTEN) — Primary tempo engine in the game: grants +2 Mini-Turns (net +1 action) and draws 2 cards. Available in 60.1–77.3% of opening hands; policy over-activation inflates perceived dominance.
10. `JACK_INSTANT_DISRUPT` (#13 Practical AS-WRITTEN) — Zero net card cost: draws 1 card immediately while preventing the active player from repeating their chosen Action type this turn. Exceptional tactical limiter (160 executions in corpus).
11. `ULTRA_THREE_RED_COUNTER` (#14 Practical AS-WRITTEN) — Instant counter possessing ⭐A authority that also draws 1 card from bottom of Graveyard even if countered. Readily accessible in red-heavy hands, over-activated by heuristic AI (97 executions in corpus).
12. `QUEEN_COURT` (#16 Practical AS-WRITTEN) — Commits two Queens to ER simultaneously for 1 Mini-Turn. Both gain entry Aegis, establishing mutual Guard and activating Two-Queen Defense against ⭐A.
13. `SEVEN_SCORING_TRIGGER` (#17 Practical AS-WRITTEN) — In written design, scoring a Seven grants 7 PR points AND reveals 2 cards to take 1 into hand. Massive card-plus-point value; completely blocked in Engine 4.2.6 by IMPL-01.
14. `A_SUPER_COUNTER` (#20 Practical AS-WRITTEN) — Absolute counter authority capable of shutting down Ultras, Board Lock, and Sudden Death. Extremely powerful but heavily taxed by committing two Aces (8 forgone PR points) and blocked by Two-Queen Defense.
15. `QUEEN_QUICK_AEGIS` (#21 Practical AS-WRITTEN) — Grants hard Aegis immunity to one friendly card until next Start without spending a Mini-Turn (once per FT). Shields critical high-value PR points from removal.
16. `QUEEN_SPADE_CLEAR_IMMUNITY` (#34 Practical AS-WRITTEN) — Passive ability making Q♠ immune to 4 Row Clear ER. Allows Queen fortresses to survive ordinary row sweeps; only 4♠ Total Clear or control theft can dislodge it.
17. `ROYAL_SHIELD_PROTECTION` (#50 Practical AS-WRITTEN) — Written as shielding protected plays from Base Ace counters when controlling more Queens than the opponent. Completely unasserted in executable code (IMPL-08).
18. `THREE_INSTANT_BOUNCE` (#52 Practical AS-WRITTEN) — Written as an Instant-speed bounce to top or bottom of DP. Highly potent reactive disruption, but absent from executable Core authority.
19. `SEVEN_RECURSIVE_TOPDECK` (#54 Practical AS-WRITTEN) — Written as allowing chained Topdeck Casting when a physical Seven is revealed. Recursion helper is dead code in the engine.
20. `SUDDEN_DEATH_ACTIVATION` (#98 Practical AS-WRITTEN) — Written as an alternate win condition: scraps an enemy card and begins an inexorable 2-turn victory countdown. Extremely rare (<0.1% reachability), unrepresented in executable play.

---

## 9. Special Explicit System Comparisons

All rank references below are mechanically validated against the canonical tables at generation time.

### 1. Structural Control
* **`FOUR_SPADE_TOTAL_CLEAR`** (#4 Practical W / #4 Practical E / #2 Raw Primitive): The ultimate board reset: clears every card from PR and ER across all players, hard-bypassing Guard, Aegis, Q♠, and all immunities. Wipes own board too, enforcing fair comeback symmetry.
* **`TWO_SPADE_SOLO_WILD_TOTAL_CLEAR`** (#5 Practical W / #5 Practical E / #2 Raw Primitive): Provides a single-card global board reset for only 2 points forgone and zero extra discard cost. Highest efficiency board wipe in the game, turning 2♠ into a second natural 4♠.
* **`KING_SPADE_WILD_TOTAL_CLEAR`** (#10 Practical W / #10 Practical E / #2 Raw Primitive): Executes 4♠ Total Clear via K♠ at the steep cost of discarding an additional card and exiling K♠ permanently. Crucial third access route to Total Clear.
* **`FOUR_SUPER_ROW_EXCHANGE_PR`** (#28 Practical W / #25 Practical E / #6 Raw Primitive): Structurally swaps PR rows between players and grants Aegis to all exchanged cards. Can produce a massive instant 20+ point swing when trailing, but requires 2 Fours and is countered by K♠.
* **`BLACK_JOKER_BOARD_LOCK`** (#7 Practical W / #7 Practical E / #5 Raw Primitive): Free Quick play activating a 2-turn global lockdown that prohibits all non-counter effect plays, Scuttles, and Traps. Tremendous game-sealing tool when holding a points lead.

### 2. Tempo Acceleration
* **`TEN_HEART_TEMPO_SPIKE`** (#9 Practical W / #9 Practical E / #13 Raw Primitive): Massive action surge granting +2 Mini-Turns (net +1) and drawing 1 card. Sacrifices 10 points and exiles itself, currently nearly uncounterable due to IMPL-12 Base Ace immunity.
* **`ULTRA_2B2R_DRAW`** (#12 Practical W / #12 Practical E / #11 Raw Primitive): Primary tempo engine in the game: grants +2 Mini-Turns (net +1 action) and draws 2 cards. Available in 60.1–77.3% of opening hands; policy over-activation inflates perceived dominance.
* **`JACK_SUPER_TEMPO_FORCE`** (#51 Practical W / #44 Practical E / #29 Raw Primitive): Commits 2 Jacks to gain +2 Mini-Turns (net +1 action). Clean action accelerator, though requiring a true pair of Jacks.
* **`JACK_INSTANT_DISRUPT`** (#13 Practical W / #13 Practical E / #63 Raw Primitive): Zero net card cost: draws 1 card immediately while preventing the active player from repeating their chosen Action type this turn. Exceptional tactical limiter (160 executions in corpus).
* **`NINE_INSTANT_TAP`** (#26 Practical W / #24 Practical E / #53 Raw Primitive): Instant-speed point denial that reduces an enemy PR card's contribution to 0 until that player scores again. Highly effective for denying lethal victory at End Phase.

### 3. Counter Authority
* **`A_SPADE_EXILE_COUNTER`** (#1 Practical W / #1 Practical E / #24 Raw Primitive): Functionally superior to Base Ace as an answer: it exiles the countered card (denying Graveyard recursion) and is not answerable by Base Ace counter-counters. Its singleton scarcity (1 copy vs. 3 copies) prevents it from distorting general play.
* **`KING_SPADE_INSTANT_MULTI_COUNTER`** (#3 Practical W / #3 Practical E / #9 Raw Primitive): The sole standard direct counter to Queen's Court, Royal Marriage, Supers, and paired 10♦. Massive latent deterrence that forces opponents to hold multi-card combos until K♠ is exhausted.
* **`A_BASE_COUNTER`** (#6 Practical W / #6 Practical E / #42 Raw Primitive): Universal reactive response against ordinary effect plays. Available in 3 copies, it establishes the fundamental counter threat that shapes all sequencing, held in check by the 4-point PR scoring sacrifice.
* **`ULTRA_THREE_RED_COUNTER`** (#14 Practical W / #14 Practical E / #3 Raw Primitive): Instant counter possessing ⭐A authority that also draws 1 card from bottom of Graveyard even if countered. Readily accessible in red-heavy hands, over-activated by heuristic AI (97 executions in corpus).
* **`A_SUPER_COUNTER`** (#20 Practical W / #19 Practical E / #4 Raw Primitive): Absolute counter authority capable of shutting down Ultras, Board Lock, and Sudden Death. Extremely powerful but heavily taxed by committing two Aces (8 forgone PR points) and blocked by Two-Queen Defense.
* **`KING_INSTANT_ANCHOR_COUNTER`** (#29 Practical W / #26 Practical E / #49 Raw Primitive): Instant counter targeting single-card Anchor plays (Queens, Kings, Ace Anchors). Keeps opponent anchor engines in check, balanced by sacrificing 8 PR points.
* **`EIGHT_INSTANT_SCUTTLE_COUNTER`** (#36 Practical W / #32 Practical E / #58 Raw Primitive): The sole designated counter to Scuttle attempts. Preserves high-value PR cards and creates latent defensive threat merely by sitting in hand.

### 4. Protection Systems
* **`QUEEN_ER_GUARD_ANCHOR`** (#11 Practical W / #11 Practical E / #27 Raw Primitive): Enters ER with protected-entry Aegis and establishes Guard, shielding all other friendly cards from enemy single-target effects. The defensive foundation of control decks.
* **`EIGHT_QUICK_AEGIS_FIELD`** (#8 Practical W / #8 Practical E / #19 Raw Primitive): Grants hard Aegis immunity to all friendly PR and ER cards (except Nines) until next Start without spending a Mini-Turn. Critical protection tool that locks in a point lead before passing the turn.
* **`QUEEN_COURT`** (#16 Practical W / #16 Practical E / #10 Raw Primitive): Commits two Queens to ER simultaneously for 1 Mini-Turn. Both gain entry Aegis, establishing mutual Guard and activating Two-Queen Defense against ⭐A.
* **`QUEEN_QUICK_AEGIS`** (#21 Practical W / #20 Practical E / #51 Raw Primitive): Grants hard Aegis immunity to one friendly card until next Start without spending a Mini-Turn (once per FT). Shields critical high-value PR points from removal.
* **`ROYAL_MARRIAGE`** (#22 Practical W / #21 Practical E / #17 Raw Primitive): Deploys both King and Queen to ER simultaneously for 1 Mini-Turn; Queen enters with protected Aegis. Establishes anchor value (7 or 9) and Guard in a single action, counterable only by K♠.
* **`QUEEN_SPADE_CLEAR_IMMUNITY`** (#34 Practical W / #31 Practical E / #34 Raw Primitive): Passive ability making Q♠ immune to 4 Row Clear ER. Allows Queen fortresses to survive ordinary row sweeps; only 4♠ Total Clear or control theft can dislodge it.

### 5. Resource Engines
* **`SIX_SPADE_DEEP_DRAW`** (#18 Practical W / #17 Practical E / #30 Raw Primitive): Exceptional card sculpting tool that discards 1–2 cards, draws 6, and keeps 3–4. Gives 6♠ tremendous mid-to-late game value for assembling lethal lines.
* **`FIVE_BASE_RECYCLE`** (#70 Practical W / #57 Practical E / #59 Raw Primitive): Mills 2 cards, rummages 1 from Graveyard into hand, and draws the bottom Graveyard card. Generates net +1 card advantage while recycling spent resources.
* **`SIX_BASE_DIG_RETURN`** (#57 Practical W / #48 Practical E / #61 Raw Primitive): Draws 3 cards, keeps 2, and returns 1 to top/bottom of DP. Net +1 card and clean selection, competing against a strong 6-point PR score.
* **`SEVEN_BASE_TOPDECK`** (#74 Practical W / #61 Practical E / #48 Raw Primitive): Reveals top 2 DP cards: 1 added to hand (revealed), 1 declared immediately as a generated play. Value is heavily distorted in executable game by missing 7-point scoring fallback.
* **`TEN_SPADE_EXILE_RECOVERY`** (#77 Practical W / #63 Practical E / #44 Raw Primitive): The sole targeted single-card Exile recovery in the game. Swaps 10♠ for any exiled card (revealed until Start), exiling 10♠ in the process.
* **`VOLTAGE_FIVE_REFINEMENT`** (#60 Practical W / #50 Practical E / #70 Raw Primitive): Free Start-phase trigger allowing the player to draw the bottom Graveyard card or discard 1 and draw 1. High utility resource smoothing.

### 6. Control Transfer
* **`JACK_SPADE_ER_ATTACHMENT`** (#25 Practical W / #23 Practical E / #23 Raw Primitive): Steals an enemy ER Anchor (including Queens and Kings). Stealing a Queen transfers her Guard to the caster, flipping board protection upside down.
* **`JACK_PR_ATTACHMENT`** (#44 Practical W / #39 Practical E / #38 Raw Primitive): Seizes control of an enemy PR card and adds +1 point to it. Creates substantial 2-way point swings (e.g. stealing a 10 swings 21 points), but vulnerable to Jack severance.
* **`TWO_SUPER_COMMANDEER_HOLD`** (#38 Practical W / #34 Practical E / #14 Raw Primitive): Steals any enemy OTT card, bypassing Guard and rank immunity. Hold mode taps it until Start, allowing the caster to deploy its effect for free or keep it as an anchor.
* **`TEN_SPADE_STACK_THEFT`** (#32 Practical W / #29 Practical E / #8 Raw Primitive): Interrupt-speed effect theft that seizes an opponent's pending play, imposes a Full-Turn skip on both players, and exiles 10♠. High drama, balanced by severe self-skip penalty.

### 7. Flexible / Copy Systems
* **`TWO_SPADE_SOLO_WILD_TOTAL_CLEAR`** (#5 Practical W / #5 Practical E / #2 Raw Primitive): Provides a single-card global board reset for only 2 points forgone and zero extra discard cost. Highest efficiency board wipe in the game, turning 2♠ into a second natural 4♠.
* **`TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR`** (#19 Practical W / #18 Practical E / #6 Raw Primitive): Single-card Row Exchange executed through 10♦ without needing a second Four. Inverts points boards while granting Aegis, currently protected from Base Ace by IMPL-12.
* **`KING_SPADE_WILD_TOTAL_CLEAR`** (#10 Practical W / #10 Practical E / #2 Raw Primitive): Executes 4♠ Total Clear via K♠ at the steep cost of discarding an additional card and exiling K♠ permanently. Crucial third access route to Total Clear.
* **`TWO_SOLO_WILD_ROW_CLEAR`** (#41 Practical W / #37 Practical E / #31 Raw Primitive): Enables any Two to wipe an enemy row for only 2 points sacrificed. Excellent efficiency and comeback potential, respecting Aegis and effect immunities.

---

## 10. Top and Bottom Analysis

All sections below are mechanically generated from the canonical ranking tables in `balance-check-findings.json`.

### Top 10 Raw Effect Primitives (Ranking A)
1. `SUDDEN_DEATH` — Scrap 1 OTT, 2-Turn Countdown to Win (score: 98)
2. `TOTAL_CLEAR` — Global OTT Structural Reset (score: 94)
3. `ULTRA_THREE_RED` — ⭐A Counter Authority + Draw Bottom GY (score: 92)
4. `SUPER_COUNTER` — Absolute Counter Authority (score: 91)
5. `BOARD_LOCK` — 2-Turn Global Effect/Scuttle Lockdown (score: 89)
6. `ROW_EXCHANGE_PR` — Swap PR Rows, Grant Aegis (score: 88)
7. `HAND_SWAP` — Exchange Entire Hands with Opponent (score: 87)
8. `STACK_THEFT` — Seize Single Effect, Both Players Skip FT (score: 86)
9. `COUNTER_MULTI_PLAY` — Counter Any Multi-Card Play (Supers, QC, RM) (score: 85)
10. `QUEENS_COURT_DOUBLE_ANCHOR` — Commit 2 Queens to ER with Aegis (score: 85)

### Top 10 Practical Strategic Effects — AS-WRITTEN (Ranking B-W)
1. `A_SPADE_EXILE_COUNTER` — Functionally superior to Base Ace as an answer: it exiles the countered card (denying Graveyard recursion) and is not answerable by Base Ace counter-counters. Its singleton scarcity (1 copy vs. 3 copies) prevents it from distorting general play.
2. `EIGHT_SPADE_FREE_SCUTTLE` — Zero Mini-Turn tactical removal at Instant response speed, completely ignoring rank and suit requirements. Exceptional tempo weapon that punishes unguarded high-value PR cards (88.9% conversion in telemetry).
3. `KING_SPADE_INSTANT_MULTI_COUNTER` — The sole standard direct counter to Queen's Court, Royal Marriage, Supers, and paired 10♦. Massive latent deterrence that forces opponents to hold multi-card combos until K♠ is exhausted.
4. `FOUR_SPADE_TOTAL_CLEAR` — The ultimate board reset: clears every card from PR and ER across all players, hard-bypassing Guard, Aegis, Q♠, and all immunities. Wipes own board too, enforcing fair comeback symmetry.
5. `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` — Provides a single-card global board reset for only 2 points forgone and zero extra discard cost. Highest efficiency board wipe in the game, turning 2♠ into a second natural 4♠.
6. `A_BASE_COUNTER` — Universal reactive response against ordinary effect plays. Available in 3 copies, it establishes the fundamental counter threat that shapes all sequencing, held in check by the 4-point PR scoring sacrifice.
7. `BLACK_JOKER_BOARD_LOCK` — Free Quick play activating a 2-turn global lockdown that prohibits all non-counter effect plays, Scuttles, and Traps. Tremendous game-sealing tool when holding a points lead.
8. `EIGHT_QUICK_AEGIS_FIELD` — Grants hard Aegis immunity to all friendly PR and ER cards (except Nines) until next Start without spending a Mini-Turn. Critical protection tool that locks in a point lead before passing the turn.
9. `TEN_HEART_TEMPO_SPIKE` — Massive action surge granting +2 Mini-Turns (net +1) and drawing 1 card. Sacrifices 10 points and exiles itself, currently nearly uncounterable due to IMPL-12 Base Ace immunity.
10. `KING_SPADE_WILD_TOTAL_CLEAR` — Executes 4♠ Total Clear via K♠ at the steep cost of discarding an additional card and exiling K♠ permanently. Crucial third access route to Total Clear.

### Top 10 Practical Strategic Effects — AS-EXECUTED (Ranking B-E)
1. `A_SPADE_EXILE_COUNTER` — Functionally superior to Base Ace as an answer: it exiles the countered card (denying Graveyard recursion) and is not answerable by Base Ace counter-counters. Its singleton scarcity (1 copy vs. 3 copies) prevents it from distorting general play.
2. `EIGHT_SPADE_FREE_SCUTTLE` — Zero Mini-Turn tactical removal at Instant response speed, completely ignoring rank and suit requirements. Exceptional tempo weapon that punishes unguarded high-value PR cards (88.9% conversion in telemetry).
3. `KING_SPADE_INSTANT_MULTI_COUNTER` — The sole standard direct counter to Queen's Court, Royal Marriage, Supers, and paired 10♦. Massive latent deterrence that forces opponents to hold multi-card combos until K♠ is exhausted.
4. `FOUR_SPADE_TOTAL_CLEAR` — The ultimate board reset: clears every card from PR and ER across all players, hard-bypassing Guard, Aegis, Q♠, and all immunities. Wipes own board too, enforcing fair comeback symmetry.
5. `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` — Provides a single-card global board reset for only 2 points forgone and zero extra discard cost. Highest efficiency board wipe in the game, turning 2♠ into a second natural 4♠.
6. `A_BASE_COUNTER` — Universal reactive response against ordinary effect plays. Available in 3 copies, it establishes the fundamental counter threat that shapes all sequencing, held in check by the 4-point PR scoring sacrifice.
7. `BLACK_JOKER_BOARD_LOCK` — Free Quick play activating a 2-turn global lockdown that prohibits all non-counter effect plays, Scuttles, and Traps. Tremendous game-sealing tool when holding a points lead.
8. `EIGHT_QUICK_AEGIS_FIELD` — Grants hard Aegis immunity to all friendly PR and ER cards (except Nines) until next Start without spending a Mini-Turn. Critical protection tool that locks in a point lead before passing the turn.
9. `TEN_HEART_TEMPO_SPIKE` — Massive action surge granting +2 Mini-Turns (net +1) and drawing 1 card. Sacrifices 10 points and exiles itself, currently nearly uncounterable due to IMPL-12 Base Ace immunity.
10. `KING_SPADE_WILD_TOTAL_CLEAR` — Executes 4♠ Total Clear via K♠ at the steep cost of discarding an additional card and exiling K♠ permanently. Crucial third access route to Total Clear.

### Top 10 Most Efficient Effects (Ranking C)
1. `EIGHT_SPADE_FREE_SCUTTLE` — Zero Mini-Turn tactical removal at Instant response speed, completely ignoring rank and suit requirements. Exceptional tempo weapon that punishes unguarded high-value PR cards (88.9% conversion in telemetry).
2. `JACK_INSTANT_DISRUPT` — Zero net card cost: draws 1 card immediately while preventing the active player from repeating their chosen Action type this turn. Exceptional tactical limiter (160 executions in corpus).
3. `SEVEN_SCORING_TRIGGER` — In written design, scoring a Seven grants 7 PR points AND reveals 2 cards to take 1 into hand. Massive card-plus-point value; completely blocked in Engine 4.2.6 by IMPL-01.
4. `TWO_QUICK_SCORE_DISCARD` — In written rules, grants zero-cost PR points while attacking opponent hand size without spending a Mini-Turn. Extremely efficient positive-sum play; completely fail-closed in Engine 4.2.6.
5. `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` — Provides a single-card global board reset for only 2 points forgone and zero extra discard cost. Highest efficiency board wipe in the game, turning 2♠ into a second natural 4♠.
6. `A_SPADE_EXILE_COUNTER` — Functionally superior to Base Ace as an answer: it exiles the countered card (denying Graveyard recursion) and is not answerable by Base Ace counter-counters. Its singleton scarcity (1 copy vs. 3 copies) prevents it from distorting general play.
7. `VOLTAGE_FIVE_REFINEMENT` — Free Start-phase trigger allowing the player to draw the bottom Graveyard card or discard 1 and draw 1. High utility resource smoothing.
8. `BLACK_JOKER_BOARD_LOCK` — Free Quick play activating a 2-turn global lockdown that prohibits all non-counter effect plays, Scuttles, and Traps. Tremendous game-sealing tool when holding a points lead.
9. `VOLTAGE_THREE_SLEIGHT` — Free Start-phase trigger allowing the player to add the top DP card to hand or score it directly. Zero card commitment once the threshold is met.
10. `KING_SPADE_INSTANT_MULTI_COUNTER` — The sole standard direct counter to Queen's Court, Royal Marriage, Supers, and paired 10♦. Massive latent deterrence that forces opponents to hold multi-card combos until K♠ is exhausted.

### Top 10 Threat Effects — Latent Deterrence (Ranking D)
1. `A_SPADE_EXILE_COUNTER` — Functionally superior to Base Ace as an answer: it exiles the countered card (denying Graveyard recursion) and is not answerable by Base Ace counter-counters. Its singleton scarcity (1 copy vs. 3 copies) prevents it from distorting general play. (score: 100)
2. `A_SUPER_COUNTER` — Absolute counter authority capable of shutting down Ultras, Board Lock, and Sudden Death. Extremely powerful but heavily taxed by committing two Aces (8 forgone PR points) and blocked by Two-Queen Defense. (score: 100)
3. `BLACK_JOKER_BOARD_LOCK` — Free Quick play activating a 2-turn global lockdown that prohibits all non-counter effect plays, Scuttles, and Traps. Tremendous game-sealing tool when holding a points lead. (score: 100)
4. `EIGHT_SPADE_FREE_SCUTTLE` — Zero Mini-Turn tactical removal at Instant response speed, completely ignoring rank and suit requirements. Exceptional tempo weapon that punishes unguarded high-value PR cards (88.9% conversion in telemetry). (score: 100)
5. `TEN_SPADE_STACK_THEFT` — Interrupt-speed effect theft that seizes an opponent's pending play, imposes a Full-Turn skip on both players, and exiles 10♠. High drama, balanced by severe self-skip penalty. (score: 100)
6. `ULTRA_THREE_RED_COUNTER` — Instant counter possessing ⭐A authority that also draws 1 card from bottom of Graveyard even if countered. Readily accessible in red-heavy hands, over-activated by heuristic AI (97 executions in corpus). (score: 100)
7. `A_BASE_COUNTER` — Universal reactive response against ordinary effect plays. Available in 3 copies, it establishes the fundamental counter threat that shapes all sequencing, held in check by the 4-point PR scoring sacrifice. (score: 95)
8. `KING_SPADE_INSTANT_MULTI_COUNTER` — The sole standard direct counter to Queen's Court, Royal Marriage, Supers, and paired 10♦. Massive latent deterrence that forces opponents to hold multi-card combos until K♠ is exhausted. (score: 95)
9. `QUEEN_COURT` — Commits two Queens to ER simultaneously for 1 Mini-Turn. Both gain entry Aegis, establishing mutual Guard and activating Two-Queen Defense against ⭐A. (score: 93)
10. `SUDDEN_DEATH_ACTIVATION` — Written as an alternate win condition: scraps an enemy card and begins an inexorable 2-turn victory countdown. Extremely rare (<0.1% reachability), unrepresented in executable play. (score: 93)

### Top 10 Comeback Effects — From Behind (Ranking E)
1. `FOUR_SPADE_TOTAL_CLEAR` — The ultimate board reset: clears every card from PR and ER across all players, hard-bypassing Guard, Aegis, Q♠, and all immunities. Wipes own board too, enforcing fair comeback symmetry. (score: 122)
2. `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` — Provides a single-card global board reset for only 2 points forgone and zero extra discard cost. Highest efficiency board wipe in the game, turning 2♠ into a second natural 4♠. (score: 121)
3. `KING_SPADE_WILD_TOTAL_CLEAR` — Executes 4♠ Total Clear via K♠ at the steep cost of discarding an additional card and exiling K♠ permanently. Crucial third access route to Total Clear. (score: 116)
4. `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR` — Single-card Row Exchange executed through 10♦ without needing a second Four. Inverts points boards while granting Aegis, currently protected from Base Ace by IMPL-12. (score: 111)
5. `FOUR_SUPER_ROW_EXCHANGE_PR` — Structurally swaps PR rows between players and grants Aegis to all exchanged cards. Can produce a massive instant 20+ point swing when trailing, but requires 2 Fours and is countered by K♠. (score: 106)
6. `FOUR_BASE_ROW_CLEAR_PR` — Wipes all vulnerable enemy PR cards to the Graveyard for 1 Action. Major comeback equalizer that prevents opponents from running away with point leads, stopped cleanly by Aegis. (score: 105)
7. `FOUR_BASE_ROW_CLEAR_ER` — Wipes all enemy ER Anchors (except Q♠ and Aegised cards) to the Graveyard. Essential tool for breaking Queen Guard fortresses and King anchor totals. (score: 103)
8. `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_ER` — Single-card Enduring Row swap executed via 10♦, stealing an enemy anchor setup. (score: 100)
9. `TWO_SOLO_WILD_ROW_CLEAR` — Enables any Two to wipe an enemy row for only 2 points sacrificed. Excellent efficiency and comeback potential, respecting Aegis and effect immunities. (score: 100)
10. `FOUR_SUPER_ROW_EXCHANGE_ER` — Swaps Enduring Rows, seizing an opponent's entire anchor fortress and granting them Aegis. High setup requirement and niche application compared to PR exchange. (score: 99)

### Top 10 Snowball Effects — Consolidating a Lead (Ranking F)
1. `BLACK_JOKER_BOARD_LOCK` — Free Quick play activating a 2-turn global lockdown that prohibits all non-counter effect plays, Scuttles, and Traps. Tremendous game-sealing tool when holding a points lead. (score: 124)
2. `EIGHT_QUICK_AEGIS_FIELD` — Grants hard Aegis immunity to all friendly PR and ER cards (except Nines) until next Start without spending a Mini-Turn. Critical protection tool that locks in a point lead before passing the turn. (score: 113)
3. `TEN_SPADE_STACK_THEFT` — Interrupt-speed effect theft that seizes an opponent's pending play, imposes a Full-Turn skip on both players, and exiles 10♠. High drama, balanced by severe self-skip penalty. (score: 110)
4. `QUEEN_ER_GUARD_ANCHOR` — Enters ER with protected-entry Aegis and establishes Guard, shielding all other friendly cards from enemy single-target effects. The defensive foundation of control decks. (score: 107)
5. `QUEEN_QUICK_AEGIS` — Grants hard Aegis immunity to one friendly card until next Start without spending a Mini-Turn (once per FT). Shields critical high-value PR points from removal. (score: 105)
6. `QUEEN_COURT` — Commits two Queens to ER simultaneously for 1 Mini-Turn. Both gain entry Aegis, establishing mutual Guard and activating Two-Queen Defense against ⭐A. (score: 103)
7. `ROYAL_MARRIAGE` — Deploys both King and Queen to ER simultaneously for 1 Mini-Turn; Queen enters with protected Aegis. Establishes anchor value (7 or 9) and Guard in a single action, counterable only by K♠. (score: 100)
8. `QUEEN_SPADE_CLEAR_IMMUNITY` — Passive ability making Q♠ immune to 4 Row Clear ER. Allows Queen fortresses to survive ordinary row sweeps; only 4♠ Total Clear or control theft can dislodge it. (score: 98)
9. `ROYAL_SHIELD_PROTECTION` — Written as shielding protected plays from Base Ace counters when controlling more Queens than the opponent. Completely unasserted in executable code (IMPL-08). (score: 93)
10. `A_SPADE_EXILE_COUNTER` — Functionally superior to Base Ace as an answer: it exiles the countered card (denying Graveyard recursion) and is not answerable by Base Ace counter-counters. Its singleton scarcity (1 copy vs. 3 copies) prevents it from distorting general play. (score: 84)

### Bottom 10 Practical Effects — AS-WRITTEN (Ranking B-W)

| Rank | Effect ID | Classification | Explanation |
|---:|---|---|---|
| 92 | `FIVE_DIAMOND_EXILE_RUMMAGE` | IMPLEMENTATION-DAMAGED | Written as rummaging from middle Exile cards when Exile has ≥5 cards. Restrictive condition; unimplemented in executable engine. |
| 93 | `VOLTAGE_FOUR_PREDICTABLE` | HEALTHY LOW-POWER | Free Start-phase guess: if both rank and suit match the top DP card, scores it immediately. Low probability of success (~1.9%) without deck inspection. |
| 94 | `KING_SPADE_WILD_TOPDECK` | INTENTIONALLY NICHE | Gambit play that exiles K♠ to cast from top of deck. Rarely justified given K♠'s defensive counter value. |
| 95 | `TEN_DIAMOND_PAIRED_MIMIC_SUPER_SIX` | IMPLEMENTATION-DAMAGED | Written as mimicking ⭐6 Super Dig. Unimplemented in Core. |
| 96 | `KING_SPADE_WILD_RECYCLE` | INTENTIONALLY NICHE | Copies 5-Recycle, permanently exiling K♠ for net +1 card advantage. Generally inferior to holding K♠ for counterplay. |
| 97 | `TEN_DIAMOND_PAIRED_MIMIC_SUPER_SEVEN` | IMPLEMENTATION-DAMAGED | Written as mimicking ⭐7 Sequential Topdeck. Unimplemented in Core. |
| 98 | `SUDDEN_DEATH_ACTIVATION` | IMPLEMENTATION-DAMAGED | Written as an alternate win condition: scraps an enemy card and begins an inexorable 2-turn victory countdown. Extremely rare (<0.1% reachability), unrepresented in executable play. |
| 99 | `KING_SPADE_WILD_BOUNCE` | INTENTIONALLY NICHE | Copies 3-Bounce through Wild Sovereignty, exiling K♠ permanently. Poor trade of a premium 8-point counter for a minor bounce. |
| 100 | `SIX_SUPER_DIG` | IMPLEMENTATION-DAMAGED | Designed as an 8-card draw engine. Defect-contaminated in Unrestricted (enumerator forces keep list empty, resulting in pure card loss). |
| 101 | `SEVEN_SUPER_TOPDECK` | IMPLEMENTATION-DAMAGED | Designed as sequential independent Topdeck casting across multiple revealed cards. Defect-contaminated in Unrestricted (empty assignment lists). |

---

# What Is Intrilex's Strongest Effect?

### Strict Categorical Verdicts (Mechanically Derived from Canonical Tables)

* **RAW EFFECT POTENCY (Primitive):** **`SUDDEN_DEATH`** — Highest intrinsic effect ceiling of any primitive in Intrilex. Note: this is an alternate-win condition with extreme recipe rarity (`CONSTRUCTED_ONLY` reachability), making it the strongest in a vacuum but rarely accessible in practice.
* **PRACTICAL STRATEGIC VALUE (AS-WRITTEN):** **`A_SPADE_EXILE_COUNTER`** — Highest practical value across all 101 intended declaration routes. Instant timing, zero Mini-Turns, exiles countered sources to deny Graveyard recursion, and is not answerable by Base Ace counter-counters.
* **PRACTICAL STRATEGIC VALUE (AS-EXECUTED):** **`A_SPADE_EXILE_COUNTER`** — Highest practical value among the 75 routes functional in Engine 4.2.6.
* **EFFICIENCY:** **`EIGHT_SPADE_FREE_SCUTTLE`** — Highest payoff relative to cards, actions, and points sacrificed. Instant timing, zero Mini-Turns, removes enemy PR cards ignoring rank and suit requirements.
* **THREAT VALUE:** **`A_SPADE_EXILE_COUNTER`** — Highest latent deterrence score. The presence of this card in hand suppresses opponent actions more than any other route.
* **COMEBACK:** **`FOUR_SPADE_TOTAL_CLEAR`** — Highest value when significantly behind on points. The primary single-card board reset that can erase an opponent's point lead.
* **SNOWBALL:** **`BLACK_JOKER_BOARD_LOCK`** — Highest value when ahead on points. Locks down opponent comebacks while the leader advances toward victory.

---

### The Fundamental Duality

> **If I could possess exactly one effect in a vacuum, which is strongest?**
>
> **`SUDDEN_DEATH`** (as a primitive)
> In a vacuum where access, costs, and setup are ignored, the highest raw potency primitive is strongest. However, for practically accessible effects, **`FOUR_SPADE_TOTAL_CLEAR`** (the `TOTAL_CLEAR` primitive's best route) is the strongest single-card effect: it resets all PR and ER state regardless of protection, with no card immune to it. It is the premier reset button of the game, though it wipes the caster's own board as well.

---

> **If I must actually pay the real Intrilex card, action, and opportunity costs to access it, which effect is strongest?**
>
> **`A_SPADE_EXILE_COUNTER`** (Reactive / Counter) and **`EIGHT_SPADE_FREE_SCUTTLE`** (Proactive / Removal)
> When real game economics apply — where players have limited Mini-Turns, hands are scarce, and counterable comebacks lurk — **`A_SPADE_EXILE_COUNTER`** is the strongest practical effect in Intrilex. It costs zero Mini-Turns, trades 1-for-1 with opposing effects, removes the target to Exile (denying Graveyard recursion), and is not answerable by ordinary Base Aces. It provides strong tactical security for a low commitment. Closely paired with it is **`EIGHT_SPADE_FREE_SCUTTLE`**, which converts zero actions at Instant speed into removal of an enemy PR card, ignoring rank and suit requirements.

---

## 11. Automatic Rank-Reference Validation

All rank references in Section 9 (Special Explicit System Comparisons) are validated against the canonical ranking tables at generation time. The validation log below confirms that every referenced rank number was resolved from the machine-readable rankings.

| # | Effect ID | Dimension | Resolved Rank | Context |
|---:|---|---|---:|---|
| 1 | `FOUR_SPADE_TOTAL_CLEAR` | written | 4 | Section 9: FOUR_SPADE_TOTAL_CLEAR Practical Written |
| 2 | `FOUR_SPADE_TOTAL_CLEAR` | executed | 4 | Section 9: FOUR_SPADE_TOTAL_CLEAR Practical Executed |
| 3 | `FOUR_SPADE_TOTAL_CLEAR` | raw | 2 | Section 9: FOUR_SPADE_TOTAL_CLEAR Raw Primitive |
| 4 | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | written | 5 | Section 9: TWO_SPADE_SOLO_WILD_TOTAL_CLEAR Practical Written |
| 5 | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | executed | 5 | Section 9: TWO_SPADE_SOLO_WILD_TOTAL_CLEAR Practical Executed |
| 6 | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | raw | 2 | Section 9: TWO_SPADE_SOLO_WILD_TOTAL_CLEAR Raw Primitive |
| 7 | `KING_SPADE_WILD_TOTAL_CLEAR` | written | 10 | Section 9: KING_SPADE_WILD_TOTAL_CLEAR Practical Written |
| 8 | `KING_SPADE_WILD_TOTAL_CLEAR` | executed | 10 | Section 9: KING_SPADE_WILD_TOTAL_CLEAR Practical Executed |
| 9 | `KING_SPADE_WILD_TOTAL_CLEAR` | raw | 2 | Section 9: KING_SPADE_WILD_TOTAL_CLEAR Raw Primitive |
| 10 | `FOUR_SUPER_ROW_EXCHANGE_PR` | written | 28 | Section 9: FOUR_SUPER_ROW_EXCHANGE_PR Practical Written |
| 11 | `FOUR_SUPER_ROW_EXCHANGE_PR` | executed | 25 | Section 9: FOUR_SUPER_ROW_EXCHANGE_PR Practical Executed |
| 12 | `FOUR_SUPER_ROW_EXCHANGE_PR` | raw | 6 | Section 9: FOUR_SUPER_ROW_EXCHANGE_PR Raw Primitive |
| 13 | `BLACK_JOKER_BOARD_LOCK` | written | 7 | Section 9: BLACK_JOKER_BOARD_LOCK Practical Written |
| 14 | `BLACK_JOKER_BOARD_LOCK` | executed | 7 | Section 9: BLACK_JOKER_BOARD_LOCK Practical Executed |
| 15 | `BLACK_JOKER_BOARD_LOCK` | raw | 5 | Section 9: BLACK_JOKER_BOARD_LOCK Raw Primitive |
| 16 | `TEN_HEART_TEMPO_SPIKE` | written | 9 | Section 9: TEN_HEART_TEMPO_SPIKE Practical Written |
| 17 | `TEN_HEART_TEMPO_SPIKE` | executed | 9 | Section 9: TEN_HEART_TEMPO_SPIKE Practical Executed |
| 18 | `TEN_HEART_TEMPO_SPIKE` | raw | 13 | Section 9: TEN_HEART_TEMPO_SPIKE Raw Primitive |
| 19 | `ULTRA_2B2R_DRAW` | written | 12 | Section 9: ULTRA_2B2R_DRAW Practical Written |
| 20 | `ULTRA_2B2R_DRAW` | executed | 12 | Section 9: ULTRA_2B2R_DRAW Practical Executed |
| 21 | `ULTRA_2B2R_DRAW` | raw | 11 | Section 9: ULTRA_2B2R_DRAW Raw Primitive |
| 22 | `JACK_SUPER_TEMPO_FORCE` | written | 51 | Section 9: JACK_SUPER_TEMPO_FORCE Practical Written |
| 23 | `JACK_SUPER_TEMPO_FORCE` | executed | 44 | Section 9: JACK_SUPER_TEMPO_FORCE Practical Executed |
| 24 | `JACK_SUPER_TEMPO_FORCE` | raw | 29 | Section 9: JACK_SUPER_TEMPO_FORCE Raw Primitive |
| 25 | `JACK_INSTANT_DISRUPT` | written | 13 | Section 9: JACK_INSTANT_DISRUPT Practical Written |
| 26 | `JACK_INSTANT_DISRUPT` | executed | 13 | Section 9: JACK_INSTANT_DISRUPT Practical Executed |
| 27 | `JACK_INSTANT_DISRUPT` | raw | 63 | Section 9: JACK_INSTANT_DISRUPT Raw Primitive |
| 28 | `NINE_INSTANT_TAP` | written | 26 | Section 9: NINE_INSTANT_TAP Practical Written |
| 29 | `NINE_INSTANT_TAP` | executed | 24 | Section 9: NINE_INSTANT_TAP Practical Executed |
| 30 | `NINE_INSTANT_TAP` | raw | 53 | Section 9: NINE_INSTANT_TAP Raw Primitive |
| 31 | `A_SPADE_EXILE_COUNTER` | written | 1 | Section 9: A_SPADE_EXILE_COUNTER Practical Written |
| 32 | `A_SPADE_EXILE_COUNTER` | executed | 1 | Section 9: A_SPADE_EXILE_COUNTER Practical Executed |
| 33 | `A_SPADE_EXILE_COUNTER` | raw | 24 | Section 9: A_SPADE_EXILE_COUNTER Raw Primitive |
| 34 | `KING_SPADE_INSTANT_MULTI_COUNTER` | written | 3 | Section 9: KING_SPADE_INSTANT_MULTI_COUNTER Practical Written |
| 35 | `KING_SPADE_INSTANT_MULTI_COUNTER` | executed | 3 | Section 9: KING_SPADE_INSTANT_MULTI_COUNTER Practical Executed |
| 36 | `KING_SPADE_INSTANT_MULTI_COUNTER` | raw | 9 | Section 9: KING_SPADE_INSTANT_MULTI_COUNTER Raw Primitive |
| 37 | `A_BASE_COUNTER` | written | 6 | Section 9: A_BASE_COUNTER Practical Written |
| 38 | `A_BASE_COUNTER` | executed | 6 | Section 9: A_BASE_COUNTER Practical Executed |
| 39 | `A_BASE_COUNTER` | raw | 42 | Section 9: A_BASE_COUNTER Raw Primitive |
| 40 | `ULTRA_THREE_RED_COUNTER` | written | 14 | Section 9: ULTRA_THREE_RED_COUNTER Practical Written |
| 41 | `ULTRA_THREE_RED_COUNTER` | executed | 14 | Section 9: ULTRA_THREE_RED_COUNTER Practical Executed |
| 42 | `ULTRA_THREE_RED_COUNTER` | raw | 3 | Section 9: ULTRA_THREE_RED_COUNTER Raw Primitive |
| 43 | `A_SUPER_COUNTER` | written | 20 | Section 9: A_SUPER_COUNTER Practical Written |
| 44 | `A_SUPER_COUNTER` | executed | 19 | Section 9: A_SUPER_COUNTER Practical Executed |
| 45 | `A_SUPER_COUNTER` | raw | 4 | Section 9: A_SUPER_COUNTER Raw Primitive |
| 46 | `KING_INSTANT_ANCHOR_COUNTER` | written | 29 | Section 9: KING_INSTANT_ANCHOR_COUNTER Practical Written |
| 47 | `KING_INSTANT_ANCHOR_COUNTER` | executed | 26 | Section 9: KING_INSTANT_ANCHOR_COUNTER Practical Executed |
| 48 | `KING_INSTANT_ANCHOR_COUNTER` | raw | 49 | Section 9: KING_INSTANT_ANCHOR_COUNTER Raw Primitive |
| 49 | `EIGHT_INSTANT_SCUTTLE_COUNTER` | written | 36 | Section 9: EIGHT_INSTANT_SCUTTLE_COUNTER Practical Written |
| 50 | `EIGHT_INSTANT_SCUTTLE_COUNTER` | executed | 32 | Section 9: EIGHT_INSTANT_SCUTTLE_COUNTER Practical Executed |
| 51 | `EIGHT_INSTANT_SCUTTLE_COUNTER` | raw | 58 | Section 9: EIGHT_INSTANT_SCUTTLE_COUNTER Raw Primitive |
| 52 | `QUEEN_ER_GUARD_ANCHOR` | written | 11 | Section 9: QUEEN_ER_GUARD_ANCHOR Practical Written |
| 53 | `QUEEN_ER_GUARD_ANCHOR` | executed | 11 | Section 9: QUEEN_ER_GUARD_ANCHOR Practical Executed |
| 54 | `QUEEN_ER_GUARD_ANCHOR` | raw | 27 | Section 9: QUEEN_ER_GUARD_ANCHOR Raw Primitive |
| 55 | `EIGHT_QUICK_AEGIS_FIELD` | written | 8 | Section 9: EIGHT_QUICK_AEGIS_FIELD Practical Written |
| 56 | `EIGHT_QUICK_AEGIS_FIELD` | executed | 8 | Section 9: EIGHT_QUICK_AEGIS_FIELD Practical Executed |
| 57 | `EIGHT_QUICK_AEGIS_FIELD` | raw | 19 | Section 9: EIGHT_QUICK_AEGIS_FIELD Raw Primitive |
| 58 | `QUEEN_COURT` | written | 16 | Section 9: QUEEN_COURT Practical Written |
| 59 | `QUEEN_COURT` | executed | 16 | Section 9: QUEEN_COURT Practical Executed |
| 60 | `QUEEN_COURT` | raw | 10 | Section 9: QUEEN_COURT Raw Primitive |
| 61 | `QUEEN_QUICK_AEGIS` | written | 21 | Section 9: QUEEN_QUICK_AEGIS Practical Written |
| 62 | `QUEEN_QUICK_AEGIS` | executed | 20 | Section 9: QUEEN_QUICK_AEGIS Practical Executed |
| 63 | `QUEEN_QUICK_AEGIS` | raw | 51 | Section 9: QUEEN_QUICK_AEGIS Raw Primitive |
| 64 | `ROYAL_MARRIAGE` | written | 22 | Section 9: ROYAL_MARRIAGE Practical Written |
| 65 | `ROYAL_MARRIAGE` | executed | 21 | Section 9: ROYAL_MARRIAGE Practical Executed |
| 66 | `ROYAL_MARRIAGE` | raw | 17 | Section 9: ROYAL_MARRIAGE Raw Primitive |
| 67 | `QUEEN_SPADE_CLEAR_IMMUNITY` | written | 34 | Section 9: QUEEN_SPADE_CLEAR_IMMUNITY Practical Written |
| 68 | `QUEEN_SPADE_CLEAR_IMMUNITY` | executed | 31 | Section 9: QUEEN_SPADE_CLEAR_IMMUNITY Practical Executed |
| 69 | `QUEEN_SPADE_CLEAR_IMMUNITY` | raw | 34 | Section 9: QUEEN_SPADE_CLEAR_IMMUNITY Raw Primitive |
| 70 | `SIX_SPADE_DEEP_DRAW` | written | 18 | Section 9: SIX_SPADE_DEEP_DRAW Practical Written |
| 71 | `SIX_SPADE_DEEP_DRAW` | executed | 17 | Section 9: SIX_SPADE_DEEP_DRAW Practical Executed |
| 72 | `SIX_SPADE_DEEP_DRAW` | raw | 30 | Section 9: SIX_SPADE_DEEP_DRAW Raw Primitive |
| 73 | `FIVE_BASE_RECYCLE` | written | 70 | Section 9: FIVE_BASE_RECYCLE Practical Written |
| 74 | `FIVE_BASE_RECYCLE` | executed | 57 | Section 9: FIVE_BASE_RECYCLE Practical Executed |
| 75 | `FIVE_BASE_RECYCLE` | raw | 59 | Section 9: FIVE_BASE_RECYCLE Raw Primitive |
| 76 | `SIX_BASE_DIG_RETURN` | written | 57 | Section 9: SIX_BASE_DIG_RETURN Practical Written |
| 77 | `SIX_BASE_DIG_RETURN` | executed | 48 | Section 9: SIX_BASE_DIG_RETURN Practical Executed |
| 78 | `SIX_BASE_DIG_RETURN` | raw | 61 | Section 9: SIX_BASE_DIG_RETURN Raw Primitive |
| 79 | `SEVEN_BASE_TOPDECK` | written | 74 | Section 9: SEVEN_BASE_TOPDECK Practical Written |
| 80 | `SEVEN_BASE_TOPDECK` | executed | 61 | Section 9: SEVEN_BASE_TOPDECK Practical Executed |
| 81 | `SEVEN_BASE_TOPDECK` | raw | 48 | Section 9: SEVEN_BASE_TOPDECK Raw Primitive |
| 82 | `TEN_SPADE_EXILE_RECOVERY` | written | 77 | Section 9: TEN_SPADE_EXILE_RECOVERY Practical Written |
| 83 | `TEN_SPADE_EXILE_RECOVERY` | executed | 63 | Section 9: TEN_SPADE_EXILE_RECOVERY Practical Executed |
| 84 | `TEN_SPADE_EXILE_RECOVERY` | raw | 44 | Section 9: TEN_SPADE_EXILE_RECOVERY Raw Primitive |
| 85 | `VOLTAGE_FIVE_REFINEMENT` | written | 60 | Section 9: VOLTAGE_FIVE_REFINEMENT Practical Written |
| 86 | `VOLTAGE_FIVE_REFINEMENT` | executed | 50 | Section 9: VOLTAGE_FIVE_REFINEMENT Practical Executed |
| 87 | `VOLTAGE_FIVE_REFINEMENT` | raw | 70 | Section 9: VOLTAGE_FIVE_REFINEMENT Raw Primitive |
| 88 | `JACK_SPADE_ER_ATTACHMENT` | written | 25 | Section 9: JACK_SPADE_ER_ATTACHMENT Practical Written |
| 89 | `JACK_SPADE_ER_ATTACHMENT` | executed | 23 | Section 9: JACK_SPADE_ER_ATTACHMENT Practical Executed |
| 90 | `JACK_SPADE_ER_ATTACHMENT` | raw | 23 | Section 9: JACK_SPADE_ER_ATTACHMENT Raw Primitive |
| 91 | `JACK_PR_ATTACHMENT` | written | 44 | Section 9: JACK_PR_ATTACHMENT Practical Written |
| 92 | `JACK_PR_ATTACHMENT` | executed | 39 | Section 9: JACK_PR_ATTACHMENT Practical Executed |
| 93 | `JACK_PR_ATTACHMENT` | raw | 38 | Section 9: JACK_PR_ATTACHMENT Raw Primitive |
| 94 | `TWO_SUPER_COMMANDEER_HOLD` | written | 38 | Section 9: TWO_SUPER_COMMANDEER_HOLD Practical Written |
| 95 | `TWO_SUPER_COMMANDEER_HOLD` | executed | 34 | Section 9: TWO_SUPER_COMMANDEER_HOLD Practical Executed |
| 96 | `TWO_SUPER_COMMANDEER_HOLD` | raw | 14 | Section 9: TWO_SUPER_COMMANDEER_HOLD Raw Primitive |
| 97 | `TEN_SPADE_STACK_THEFT` | written | 32 | Section 9: TEN_SPADE_STACK_THEFT Practical Written |
| 98 | `TEN_SPADE_STACK_THEFT` | executed | 29 | Section 9: TEN_SPADE_STACK_THEFT Practical Executed |
| 99 | `TEN_SPADE_STACK_THEFT` | raw | 8 | Section 9: TEN_SPADE_STACK_THEFT Raw Primitive |
| 100 | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | written | 5 | Section 9: TWO_SPADE_SOLO_WILD_TOTAL_CLEAR Practical Written |
| 101 | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | executed | 5 | Section 9: TWO_SPADE_SOLO_WILD_TOTAL_CLEAR Practical Executed |
| 102 | `TWO_SPADE_SOLO_WILD_TOTAL_CLEAR` | raw | 2 | Section 9: TWO_SPADE_SOLO_WILD_TOTAL_CLEAR Raw Primitive |
| 103 | `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR` | written | 19 | Section 9: TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR Practical Written |
| 104 | `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR` | executed | 18 | Section 9: TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR Practical Executed |
| 105 | `TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR` | raw | 6 | Section 9: TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR Raw Primitive |
| 106 | `KING_SPADE_WILD_TOTAL_CLEAR` | written | 10 | Section 9: KING_SPADE_WILD_TOTAL_CLEAR Practical Written |
| 107 | `KING_SPADE_WILD_TOTAL_CLEAR` | executed | 10 | Section 9: KING_SPADE_WILD_TOTAL_CLEAR Practical Executed |
| 108 | `KING_SPADE_WILD_TOTAL_CLEAR` | raw | 2 | Section 9: KING_SPADE_WILD_TOTAL_CLEAR Raw Primitive |
| 109 | `TWO_SOLO_WILD_ROW_CLEAR` | written | 41 | Section 9: TWO_SOLO_WILD_ROW_CLEAR Practical Written |
| 110 | `TWO_SOLO_WILD_ROW_CLEAR` | executed | 37 | Section 9: TWO_SOLO_WILD_ROW_CLEAR Practical Executed |
| 111 | `TWO_SOLO_WILD_ROW_CLEAR` | raw | 31 | Section 9: TWO_SOLO_WILD_ROW_CLEAR Raw Primitive |

**Validation Result:** 111 rank references resolved. All references were mechanically derived from `balance-check-findings.json` — no hardcoded rank numbers.

---

## 12. Methodology Notes

### Opportunity Cost Separation
* **Points Forgone** represents only the PR points sacrificed by not scoring the source card(s).
* **Extra Cost Note** captures additional costs: discards, Full-Turn skips, card exiles, multi-card commitments.
* Routes that previously conflated these (e.g. `9 + 1 discard` as a single field) have been separated.

### AS-WRITTEN vs. AS-EXECUTED Separation
* **AS-WRITTEN** includes all 101 routes described in Rulebook v4.3.1, regardless of engine implementation status.
* **AS-EXECUTED** includes only the 75 routes functional in Engine 4.2.6 (status `MATCH`, `CONFLICT`, or `UNRESTRICTED_ONLY`).
* Routes with `NOT_IMPLEMENTED` or `DEFECT_CONTAMINATED` status appear only in the AS-WRITTEN ranking.

### Raw Potency as Primitive Ranking
* The Raw Potency ranking operates on **75 primitives**, not 101 routes.
* Each primitive's raw score is the maximum `rawPotencyScore` across all its declaration routes.
* This prevents a single primitive (e.g. `TOTAL_CLEAR`) from occupying multiple Raw Potency positions.

### Threat / Comeback / Snowball Score Derivation
* **Threat Score:** Derived from `threatValue` enum (VERY_HIGH=85, HIGH=65, MODERATE=45, LOW=25, NONE=5) + timing reactivity bonus (Instant/Interrupt=15, Trigger/Instant Start=12, Quick=10, Passive=8, Action=0) + counterplay narrowness bonus (NARROW=+8, ADEQUATE=0, ROBUST=−5).
* **Comeback Score:** Derived from `practicalScore` × category-specific comeback multiplier + `rawPotencyScore` × 0.15. Board reset primitives have the highest comeback multiplier (1.15); protection primitives have the lowest (0.30).
* **Snowball Score:** Derived from `practicalScore` × category-specific snowball multiplier + timing bonus × 0.4. Control lock primitives have the highest snowball multiplier (1.30); board reset primitives have the lowest (0.30).

### Dominance Terminology
* **WITHIN-CARD MODE SUPERIORITY:** Compares modes of the same source card (e.g. ⭐2 Hold vs. Score).
* **CROSS-CARD ROUTE SUPERIORITY:** Compares different source cards that access the same primitive (e.g. 10♦ Solo vs. Paired Mimic). Not termed "strict dominance" because the source card sets differ.
* **DEFECT DOMINANCE:** Compares a functional route against an engine defect.
