# 10 — Consolidated Balance Findings

Phase 10 / Final Artifacts Consolidated · Intrilex Complete Balance Check Pass  
Repository Commit: `e4c22228` · Engine: 4.2.6 · Rules: 4.3.1 · Product: 0.28.0

---

## 10.1 Executive Balance Brief

1. **Authority Boundary & Scope:**
   The executable game (`4.2.6`) is an audited subset of Player Rulebook v4.3.1. Competitive online play uses `core-unrestricted-authority`, while AI simulations and local play default to `core-advanced-authority`.
2. **Simulation Readiness Verdict:**
   `SIMULATION READINESS: PARTIAL`. The current 100-match corpus is admissible as Grade B descriptive evidence for heuristic play under Advanced Core, but cannot be used for competitive Unrestricted inference or human metagame projections.
3. **Overall System Health:**
   The core resource loop (PR Points vs. ER Anchors vs. Scuttle vs. Ace Counters) preserves deep asymmetric decision-making. The interaction topology is rich and robust against simple dominant strategies.
4. **Implementation Defect Isolation:**
   Critical gameplay gaps exist in executable code that distort balance analytics:
   * Rank 7, 10♣, and Black Joker cannot normally be played for Points (`IMPL-01`).
   * Sudden Death in Unrestricted is a dead, zero-cost Mini-Turn sink (`DEG-01`).
   * Solo Rank-10 effects and Supers are unintentionally immune to Base Ace and A♠ (`IMPL-12`).
5. **Gameplay Change Verdict:**
   **`NO CURRENT GAMEPLAY CHANGE IS DEFENSIBLE FROM THE AVAILABLE EVIDENCE.`**
   Zero balance nerfs or buffs are recommended. All observed balance anomalies are traceable to implementation defects, documentation drift, or AI policy heuristic bias. Correcting the engine to match Rulebook v4.3.1 restores intended counterplay and system balance.

---

## 10.2 Authority & Evidence Summary

| Source / Dataset | Version | Current? | Reliability | Balance Use | Evidence Ref |
|---|---|---:|---|---|---|
| Executable Engine | 4.2.6 | YES | High (Rank 1) | Truth of factual gameplay behavior | `00`, `01` |
| Complete Player Rulebook | 4.3.1 | YES | High (Rank 4) | Truth of intended game design | `00`, `01` |
| Engine Authority Manifest | 1.0.0 | YES | Moderate (Drift) | Profile registration; truth drift on riders | `00`, `01` `AUTH-04` |
| Autonomy 100-Match Campaign | 4.1.0/4.2.0 | YES | Grade B (Limited) | Descriptive AI realization in Advanced | `04`, `06` |
| Decision Traces (4,867 decisions) | 2.0.0 | YES | Grade B (Strict) | Evaluation of policy choices vs alternatives | `05`, `07` |
| Legacy Certified Replays (121) | 0.10.1 | NO | Regression Only | Engine conformance verification only | `04` |

---

## 10.3 Complete Rank Balance Table

| Rank | Primary Roles | Floor | Reachable Ceiling | Breadth | Accessibility | Opportunity Cost | Counterplay | Threat Value | Decision Quality | Status | Confidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** | COUNTER, PROTECTION | High (4 pts) | High (⭐A, Exile) | Broad | COMMON | High | ROBUST | High | EXCELLENT | STRONG BUT HEALTHY | VERY_HIGH |
| **2** | WILDCARD, CONTROL | Low (2 pts) | Extreme (2♠ Total Clear) | Broad | COMMON (2♠ RARE) | Low (Pts) | ROBUST | Moderate | HEALTHY | NICHE BUT HEALTHY | HIGH |
| **3** | DENIAL, TEMPO | Low (3 pts) | Moderate (Raid) | Moderate | COMMON | Low | ROBUST | Low | HEALTHY | HEALTHY | HIGH |
| **4** | BOARD_RESET, SCORING | Mod (4 pts) | Extreme (4♠ Reset) | Broad | COMMON (4♠ RARE) | High (Self-wipe)| ROBUST | High | EXCELLENT | HEALTHY | VERY_HIGH |
| **5** | RECOVERY, SCORING | High (5 pts) | Moderate (Recycle) | Moderate | COMMON | Low | ROBUST | Low | HEALTHY | HEALTHY AS-EXECUTED | HIGH |
| **6** | RESOURCE, SELECTION | High (6 pts) | High (6♠ Draw 6) | Broad | COMMON (6♠ RARE) | Moderate | ROBUST | Low | HEALTHY | HEALTHY | HIGH |
| **7** | GENERATION, ENGINE | **Zero (IMPL-01)** | High (Topdeck) | Narrow | COMMON | None (No score)| ROBUST | Low | SHALLOW | BLOCKED BY DEFECT | HIGH |
| **8** | PROTECTION, REMOVAL | High (8 pts) | High (8♠, Quick) | Broad | COMMON (8♠ RARE) | High | ADEQUATE | High | EXCELLENT | STRONG BUT HEALTHY | VERY_HIGH |
| **9** | DENIAL, SCORING | High (9 pts) | High (Tap / Anchor) | Moderate | COMMON | High (No Aegis) | ROBUST | Moderate | HEALTHY | HEALTHY AS-EXECUTED | HIGH |
| **10♣** | SCORING, PROTECTION | High (10 pts) | High (+Bonus Card) | Narrow | RARE (Singleton) | High | NARROW (IMPL-12)| Moderate | EXCELLENT | WATCHLIST | VERY_HIGH |
| **10♦** | WILDCARD, FLEXIBILITY | High (10 pts) | High (⭐4/⭐8/⭐J) | Moderate | RARE (Singleton) | High | NARROW (IMPL-12)| Moderate | EXCELLENT | INSUFFICIENT / BLOCKED | HIGH |
| **10♥** | TEMPO, RESOURCE | High (10 pts) | Very High (+2 MT) | Broad | RARE (Singleton) | High | NARROW (IMPL-12)| Moderate | EXCELLENT | WATCHLIST | VERY_HIGH |
| **10♠** | CONTROL, RECOVERY | High (10 pts) | Extreme (Stack Theft)| Moderate | RARE (Singleton) | High | NARROW (IMPL-12)| High | EXCELLENT | NICHE BUT HEALTHY | VERY_HIGH |
| **J** | CONTROL, TEMPO | Low (3 pts) | High (ER Steal, ⭐J)| Broad | COMMON (J♠ RARE) | Low | ROBUST | High (Scuttle)| HEALTHY | HEALTHY | VERY_HIGH |
| **Q** | PROTECTION, SETUP | Low (2 pts) | High (Fortress, QC)| Broad | COMMON (Pair RARE) | Low (ER home) | ADEQUATE | High (Guard) | HEALTHY | STRONG BUT HEALTHY | VERY_HIGH |
| **K** | COUNTER, ANCHOR, WILD | High (8 pts) | Extreme (K♠ Hub) | Broad | COMMON (K♠ RARE) | Maximal (K♠) | ADEQUATE | Very High (K♠)| EXCELLENT | STRONG BUT HEALTHY | VERY_HIGH |
| **RJ** | BOARD_RESET, VARIANCE| Mod (5 pts) | Extreme (Hand Swap) | Moderate | RARE (Singleton) | Moderate | ROBUST | Moderate | HEALTHY | HEALTHY / INSUFFICIENT | MODERATE |
| **BJ** | STRUCTURAL_CONTROL | **Zero (IMPL-01)** | Extreme (Lockdown) | Narrow | RARE (Singleton) | Low (Dominated) | NARROW | High (Lockdown)| DOMINATED | BLOCKED BY DEFECT | VERY_HIGH |

---

## 10.4 Suit / Spades Differential Table

| Exact Variant | Ordinary Baseline | Suit Addition | Incremental Power | Accessibility | New Lines | Opportunity Cost | Concern |
|---|---|---|---|---|---|---|---|
| **A♠** | Base Ace (GY) | Exiles target; immune to Base Ace | High | 1 copy (RARE) | Absolute counter denial | Loses Base Ace status | STRONG BUT HEALTHY |
| **2♠** | Solo Wild Base 3–7 | Copies 4♠ Total Clear & 6♠ Deep Draw | Very High | 1 copy (RARE) | Single-card global board wipe | 2 points forgone | WATCHLIST (High leverage) |
| **4♠** | Row Clear (PR or ER) | Total Clear (wipes all OTT cards) | Extreme | 1 copy (RARE) | Global reset bypassing all protection | Wipes own board too | WATCHLIST (Defines pacing) |
| **6♠** | Dig (Draw 3, keep 2) | Deep Draw (Discard 1–2, draw 6, keep 3–4)| High | 1 copy (RARE) | Massive hand sculpting | Requires other hand cards | HEALTHY |
| **8♠** | Scuttle / Aegis | Free Scuttle (Instant, Free, any rank/suit)| Very High | 1 copy (RARE) | Zero-cost tactical removal | Scuttle restrictions apply | WATCHLIST |
| **10♣** | Generic Ten | Foundation: Enters PR with Aegis + Bonus | High | 1 copy (RARE) | 0-point comeback scoring surge | Cannot be plain scored | WATCHLIST (Turn-1 kill) |
| **10♦** | Generic Ten | Mimic: Copies ⭐4 solo; ⭐4/8/J paired | Very High | 1 copy (RARE) | Flexible access to multi-card modes | Consumes Rank-10 limit | BLOCKED BY DEFECT (`IMPL-04`) |
| **10♥** | Generic Ten | Tempo Spike: +2 Mini-Turns, draw 1 | Very High | 1 copy (RARE) | Massive action compression | 10 PR points sacrificed | WATCHLIST (`IMPL-12` immunity) |
| **10♠** | Generic Ten | Stack Theft (Interrupt) & Exile Recovery | Extreme | 1 copy (RARE) | Seizes opponent effect; recovers Exile | Both players skip FT | HEALTHY (High cost) |
| **J♠** | PR Attachment (+1) | ER Attachment (Steals enemy Anchor) | High | 1 copy (RARE) | Steals Queens (Guard) or Kings | Severance vulnerability | HEALTHY |
| **Q♠** | Guard + Entry Aegis | Special Protection: immune to non-total clears | High | 1 copy (RARE) | Survives 4 Row Clear ER | ER anchor (0 PR points) | WATCHLIST (Fortress core) |
| **K♠** | Single-Anchor Counter| Counter Multi-Play; Wild Sovereignty; Anchor 9 | Extreme | 1 copy (RARE) | Answers QC/RM; copies 4♠ wipe | K♠ Exiled permanently | STRONG BUT HEALTHY (Taxed) |

---

## 10.5 Super Balance Table

| Super | Recipe | Accessibility | Resource Cost | Floor | Reachable Ceiling | Setup | Counterability | Threat Value | Relative Payoff | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| **⭐A** | 2 Aces | RARE (3.9–5.7%) | 2 Aces, 0 MT | High | Absolute Counter | Reactive | Opponent 2 Queens | High | Exceptional | STRONG BUT HEALTHY |
| **⭐2** | 2 Twos | RARE (3.9–5.7%) | 2 Twos, 1 MT | Mod | Steal enemy OTT | Enemy card | K♠, Aegis | Moderate | High (Disrupts anchor) | NICHE BUT HEALTHY |
| **⭐4** | 2 Fours | RARE (3.9–5.7%) | 2 Fours, 1 MT | Mod | Row Exchange (PR/ER)| Row target | K♠ | High | Game-inverting swing | NICHE BUT HEALTHY |
| **⭐8** | 2 Eights | RARE (3.9–5.7%) | 2 Eights, 1 MT| Mod | Absolute Scuttle | Enemy PR | K♠, Aegis | Moderate | High removal | NICHE BUT HEALTHY |
| **⭐J** | 2 Jacks | RARE (3.9–5.7%) | 2 Jacks, 1 MT | Mod | +2 Mini-Turns (cap 3)| Action phase | K♠ | Low | Net +1 action | NICHE BUT HEALTHY |
| **Queen's Court**| 2 Queens | RARE (3.9–5.7%) | 2 Queens, 1 MT| High | 2 ER Queens + Aegis | Action phase | K♠ only | High | Double Guard fortress | STRONG BUT HEALTHY |
| **Royal Marriage**| K + Q same suit | RARE (2.8–4.2%) | 1 K + 1 Q, 1 MT | High | K(7/9) + Q(Guard) in ER | Action phase | K♠ only | High | High anchor points | STRONG BUT HEALTHY |
| **⭐3/5/6/7** | 2 of rank | Unrestricted Only | 2 cards, 1 MT | Low | Defect-contaminated | Variable | K♠ | Low | Negative in sample | INSUFFICIENT / DEFECT |

---

## 10.6 Conceptual 15×15 Rank-Family Value Matrix

Legend: `++` Materially greater general option value · `+` Contextual advantage · `≈` Comparable value · `↔` Strategically orthogonal · `?` Insufficient basis.

```text
       A    2    3    4    5    6    7    8    9   10    J    Q    K   RJ   BJ
A      ≈   ++   ++    +   ++    +   ++    ≈    +    ≈   ++    +    ≈   ++   ++
2     --    ≈    ≈   --   --   --    +   --   --   --   --   --   --   --   --
3     --    ≈    ≈   --   --   --    +   --   --   --   --   --   --   --   --
4     --    +    +    ≈    +    ≈   ++    ≈    ≈   --    +    +    ≈    +    +
5     --    +    +   --    ≈    ≈   ++   --   --   --    ≈    ≈   --    ≈    ≈
6     --    +    +    ≈    ≈    ≈   ++   --   --   --    +    +   --    +    +
7     --   --   --   --   --   --    ≈   --   --   --   --   --   --   --   --
8      ≈   ++   ++    ≈   ++   ++   ++    ≈    +    ≈   ++   ++    ≈   ++   ++
9     --    +    +    ≈   ++   ++   ++   --    ≈   --    +    +   --    +    +
10     ≈   ++   ++    +   ++   ++   ++    ≈    +    ≈   ++   ++    +   ++   ++
J     --    +    +   --    ≈   --   ++   --   --   --    ≈    +   --    ≈    ≈
Q     --    +    +   --    ≈   --   ++   --   --   --   --    ≈   --   --   --
K      ≈   ++   ++    ≈   ++   ++   ++    ≈    +   --   ++   ++    ≈   ++   ++
RJ    --    +    +   --    ≈   --   ++   --   --   --    ≈    +   --    ≈    ≈
BJ    --   ++   ++   --   --   --   ++   --   --   --   --   --   --   --    ≈
```
*Key Asymmetries Explained:*
* **A, 8, 10, K** dominate overall option value due to dual-timing (Instant/Quick), high scoring floors, and decisive removal/counter mechanics.
* **2, 3, 7** show lower standalone rank-family value; 2 and 3 are low-point utility cards, while 7 is artificially depressed by missing scoring support (`IMPL-01`).
* **Queens** have low isolated scoring value (2 PR / 0 ER) but are orthogonal (`↔`) to high-scoring ranks because they provide the structural protection backbone of the game.

---

## 10.7 Interaction Hub Report

* **Highest Systemic Leverage:** `BJ` (Board Lock freezes all effect economies) and `4♠` (Total Clear resets entire board state).
* **Most Enabling Hubs:** `2♠` and `K♠` (Wild access expands Total Clear from 1 card to 3 cards); `10♦` (Mimic expands access to Supers).
* **Most Countering Hub:** `Ace Family` (Base, A♠, ⭐A) and `3-Red Ultra` proxy.
* **Most Protected Hub:** `ER Queens` (Guard + Protected Entry Aegis + Two-Queen Defense).
* **Greatest Synergy Density:** `Queens` (interlocks with Guard, Aegis, Court, Marriage, Ultra recipes).
* **Greatest Dependency Density:** `Voltage` (requires exact rank PR threshold at Start) and `Royal Marriage` (requires matching suit pair).

---

## 10.8 Balance Watchlist (Mechanics Deserving Continued Scrutiny)

1. **`2B2R` Ultra Tempo Compression (`DEG-06`):**
   * *Concern:* High opening reachability (60.1–77.3%) and +2 Mini-Turns grant massive tempo.
   * *Falsification:* If `EXP-01` shows that holding components yields higher win rates under lookahead policies, the apparent power is purely an AI heuristic artifact.
2. **`10♥` Tempo Spike (`DEG-08` / `IMPL-12`):**
   * *Concern:* Generates +2 Mini-Turns and draw 1; currently immune to Base Ace counters.
   * *Falsification:* Restoring Base Ace counterability (`IMPL-12` fix) subjects 10♥ to standard 38% counter threat.
3. **`10♣` Foundation + `BJ` Bonus Turn-1 Line (`DEG-03`):**
   * *Concern:* Turn-1 21-point burst.
   * *Falsification:* Extreme natural rarity (~0.7%) and restoring Base Ace counterability prevents exploitation.
4. **`4♠` Total Clear Triple-Access (`DEG-10`):**
   * *Concern:* Accessible via 4♠, 2♠, and K♠ (63.2% reachability by 15 cards seen).
   * *Falsification:* Ace counterability is robust; self-wipe cost prevents unconstrained use.
5. **`Board Lock` Snowballing (`DEG-07`):**
   * *Concern:* Activator with a points lead can freeze opponent comeback effects.
   * *Falsification:* Symmetrical lock; opponent can still draw and score points.

---

## 10.9 Recommended Actions

### Priority A: No Gameplay Change — Correctness, Engine, & Manifest Repairs
1. **Fix `IMPL-01` (Scoring Riders):** Implement certified scoring riders for Rank 7, 10♣, and Black Joker so they can be played for Points as written.
2. **Fix `IMPL-12` (Counter Class Mapping):** Update `targetAcceptsBaseAce` and `targetAcceptsSpadeAce` to permit targeting `stackClass: "rank10"` effect plays.
3. **Fix `DEG-01` (Sudden Death in Unrestricted):** Ensure `sudden-death/declare` requires written components (RJ+BJ or 4-of-a-kind) and ticks down in `core-complete-turn`.
4. **Fix `IMPL-03` (⭐6 / ⭐7 Enumeration):** Populate legal choice payloads for ⭐6 and ⭐7 in `core-advanced.js`.
5. **Fix `IMPL-04` (10♦ Mimic Destination):** Route resolved 10♦ to Exile instead of Graveyard.
6. **Update Engine Manifest & Documentation (`AUTH-04`):** Align `RANK_REGISTRY.modes` and `config/engine-manifest.json` with actual executable capabilities.
7. **Address Policy Blind Spots (`POL-A1`):** Give `scoring.mjs` explicit weights for `solo-wild` and `wild-sovereignty`.

### Priority B: Gameplay Changes Recommended
* **`NONE.`** No gameplay balance changes are defensible or warranted from current evidence.

### Priority C: Follow-Up Targeted Experiments
* Execute `EXP-01` through `EXP-07` as specified in `11_EXPERIMENT_PLAN.md`.
