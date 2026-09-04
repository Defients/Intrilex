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

---

## 10.10 Phase 9 — Adversarial Red-Team Pass

Per spec §44, the five most consequential findings were subjected to adversarial falsification review. Each is classified after re-examination against all accumulated evidence.

### RT-01: `IMPL-12` — Rank-10 / Super Counter Immunity → **STRENGTHENED**

* **Original concern:** Solo Rank-10 effects and all Supers are immune to Base Ace and A♠ due to counter-class mapping (`targetAcceptsBaseAce` / `targetAcceptsSpadeAce` exclude `stackClass: "rank10"`).
* **Adversarial challenge:** Is this actually a balance problem, or does the rulebook intentionally restrict counter authority for high-investment plays?
* **Evidence re-examined:** `07_COUNTERFACTUALS.md` CF-01 confirmed that in the turn-1 kill match (`M-db10a45b`), P2 held A♥ but could not counter 10♣ Foundation because of this immunity. Only 3-Red Ultra could answer, and P1 counter-countered with their own 3-Red. The rulebook (`docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md`) explicitly states Base Ace counters "any effect or counter play," with no Rank-10 exclusion. This is an engine defect, not a design intent.
* **Verdict: STRENGTHENED.** The counterfactual forensic analysis confirmed the mechanical narrowing has real, observable game consequences. The defect amplifies 10♥, 10♣, and all Super declarations beyond their intended power.

### RT-02: `DEG-06` — 2B2R Ultra Tempo Burst → **WEAKENED**

* **Original concern:** 2B2R Ultra has 60.1–77.3% opening reachability, grants +2 Mini-Turns, and is fired in 54.1% of opportunities.
* **Adversarial challenge:** Is the high fire rate a mechanical problem, or a policy heuristic artifact?
* **Evidence re-examined:** `05_POLICY_AUDIT.md` showed policies assign 2B2R a flat score of ~1600–1770 vs decline at ~70–330, with no hand-quality dilution modeling. `07_COUNTERFACTUALS.md` CF-02 explicitly identified that a human or lookahead policy holding A♠, K♠, Q♠, and 4♠ would decline 2B2R to preserve game-defining singletons. The 32.2% zero-margin decision rate further suggests policies lack the depth to evaluate 2B2R's opportunity cost.
* **Verdict: WEAKENED.** The concern is real in terms of reachability and policy over-activation, but the adversarial review revealed it is substantially a **policy artifact**, not a mechanical imbalance. `EXP-01` is required to settle whether holding components yields higher win rates under lookahead policies.

### RT-03: `DEG-03` — 10♣ + BJ Turn-1 Kill → **WEAKENED**

* **Original concern:** A turn-1 21-point burst via 10♣ Foundation + BJ bonus is possible and was observed in the corpus.
* **Adversarial challenge:** Is this a degenerate interaction, or an extreme-rarity line that is self-correcting once IMPL-12 is fixed?
* **Evidence re-examined:** `07_COUNTERFACTUALS.md` CF-01 confirmed the line is real (not a phantom calculation). Joint reachability of 10♣ + BJ in a 5-card opener is ~0.7%. The active player must also hold 3 Red cards to counter the opponent's 3-Red counter. Critically, the `IMPL-12` fix would restore Base Ace counterability to Foundation (a `stackClass: "rank10"` effect), meaning any Ace held by P2 (33–38% of hands) could answer it. The turn-1 kill is a **symptom of IMPL-12**, not a standalone balance concern.
* **Verdict: WEAKENED.** Extreme natural rarity and dependency on the IMPL-12 defect mean this is not an independent balance problem. Fixing IMPL-12 dissolves the concern.

### RT-04: `IMPL-01` — Rank 7 / 10♣ / BJ Scoring Refusal → **BLOCKED**

* **Original concern:** Rank 7, 10♣, and Black Joker cannot be played for Points in either core profile due to `CORE_SCORING_RIDER_UNSUPPORTED`, while the manifest advertises `special-scoring-riders`.
* **Adversarial challenge:** Is this a balance problem or a correctness defect?
* **Evidence re-examined:** `01_MECHANICAL_INVENTORY.md` IMPL-01 confirmed this is a strict implementation gap — the rulebook describes scoring riders for these cards, but the engine refuses them. `12_EFFECT_POWER_RANKING.md` classifies `SEVEN_SCORING_TRIGGER` and `BLACK_JOKER_EXILE_RECYCLE` as `BLOCKED`. All empirical verdicts for Rank 7 and BJ scoring are invalidated. This is not a balance verdict; it is a correctness verdict that blocks balance analysis.
* **Verdict: BLOCKED.** The finding is confirmed as a correctness defect. Balance verdicts on 7-scoring and BJ-scoring cannot be rendered until the defect is fixed. The empirical observation "7 has zero scoring" is an artifact, not a balance signal.

### RT-05: `DEG-01` — Sudden Death Dead Action in Unrestricted → **UNCHANGED**

* **Original concern:** In `core-unrestricted-authority`, Sudden Death is a zero-cost Mini-Turn sink that never ticks down, making it a dead action.
* **Adversarial challenge:** Is Sudden Death intentionally disabled in the competitive profile, or is this a defect?
* **Evidence re-examined:** `08_DEGENERACY_LEDGER.md` DEG-01 and the probe (`probes/probe-scoring-and-sudden-death.mjs`) confirmed the action exists, costs a Mini-Turn, but the timer never advances. The rulebook describes Sudden Death as a functional endgame timer with specific recipes (RJ+BJ or 4-of-a-kind). `12_EFFECT_POWER_RANKING.md` classifies `SUDDEN_DEATH_ACTION_DEFECT` as `IMPLEMENTATION-DAMAGED`. Zero simulation coverage exists for `core-unrestricted-authority`.
* **Verdict: UNCHANGED.** The finding remains as initially characterized. It is a confirmed defect in the competitive profile with zero empirical coverage. It does not affect `core-advanced-authority` balance conclusions.

### Red-Team Summary Table

| Finding | Original Classification | Post-Red-Team | Action |
|---|---|---|---|
| `IMPL-12` Counter immunity | Implementation defect | **STRENGTHENED** | Priority A fix (§10.9) |
| `DEG-06` 2B2R tempo burst | Watchlist concern | **WEAKENED** | EXP-01 required |
| `DEG-03` 10♣+BJ turn-1 kill | Watchlist concern | **WEAKENED** | Resolved by IMPL-12 fix |
| `IMPL-01` Scoring refusal | Implementation defect | **BLOCKED** | Priority A fix (§10.9) |
| `DEG-01` Sudden Death dead | Implementation defect | **UNCHANGED** | Priority A fix (§10.9) |

---

## 10.11 Completion Standard — 28 Questions (Spec §45)

### Authority & Scope

**Q1: What is the exact authority boundary?**
Engine 4.2.6 (built runtime at `runtime/autonomy-engine-dist/src`) is the executable authority. Rulebook v4.3.1 (`docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md`) is the design authority. `core-advanced-authority` is the simulation/local default; `core-unrestricted-authority` is the competitive online profile. Commit `e4c22228`. See `00_AUTHORITY.md`.

**Q2: Is the simulation trustworthy?**
Partially. The 100-match corpus is deterministic with worker-count parity and complete provenance hashes. It is admissible as Grade B descriptive evidence for heuristic policy play under `core-advanced-authority`. It is not trustworthy for causal balance claims, optimal play inference, or `core-unrestricted-authority` projection. See `04_SIMULATION_READINESS.md`.

**Q3: Which datasets are admissible?**
Only `sample-data/autonomy/` (100 matches, `core-advanced-authority`, engine 4.2.6). Legacy certified replays (121, engine 0.10.1) are admissible for regression/conformance only. Zero datasets exist for `core-unrestricted-authority`. See `04`, `06`.

### Equivalence & Coverage

**Q4: What are the mechanical equivalence classes?**
26 AS-EXECUTED classes across 54 cards (per `02_EXACT_IDENTITY_MAP.md`). 32 AS-WRITTEN classes when including unimplemented modes. Spades variants create distinct classes for A, 2, 4, 6, 8, 10, J, Q, K. Jokers form two singleton classes.

**Q5: What is every rank's role?**
See `09_RANK_DOSSIERS.md` and §10.3 above. Summary: A=COUNTER/PROTECTION · 2=WILDCARD/CONTROL · 3=DENIAL/TEMPO · 4=BOARD_RESET/SCORING · 5=RECOVERY/SCORING · 6=RESOURCE/SELECTION · 7=GENERATION (BLOCKED) · 8=PROTECTION/REMOVAL · 9=DENIAL/SCORING · 10=SCORING/TEMPO/CONTROL (per-suit) · J=CONTROL/TEMPO · Q=PROTECTION/SETUP · K=COUNTER/ANCHOR/WILD · RJ=BOARD_RESET/VARIANCE · BJ=STRUCTURAL_CONTROL (BLOCKED scoring).

**Q6: Which exact identities differ from their rank family?**
All Spades variants (A♠, 2♠, 4♠, 6♠, 8♠, 10♠, J♠, Q♠, K♠) are mechanically distinct from their non-Spades siblings. 10♣, 10♦, 10♥ are each distinct from generic Tens. Red Joker and Black Joker are singleton classes with no rank-family peers. See `02_EXACT_IDENTITY_MAP.md`.

### Power & Range

**Q7: What are the floors and ceilings for each rank?**
See §10.3 "Complete Rank Balance Table." Floors range from Zero (7, BJ — blocked by IMPL-01) to High (A=4, 8=8, 9=9, 10=10, K=8). Ceilings range from Moderate (3, 5) to Extreme (4♠, K♠, BJ Board Lock, 2B2R Ultra).

**Q8: What is the flexibility and threat value?**
Highest flexibility: A, 8, 10, K (dual-timing, broad modes). Highest threat value: K♠ (sole counter to QC/RM/Supers), BJ (Board Lock), 4♠ (Total Clear). Lowest flexibility: 7 (narrow, blocked), 3 (shallow). See §10.7 Interaction Hub Report.

**Q9: How do Spades increment power over ordinary suits?**
Spades provide access to escalated modes: A♠ (Exile counter, uncounterable by Base Ace), 2♠ (Solo Wild copies 4♠/6♠), 4♠ (Total Clear), 6♠ (Deep Draw), 8♠ (Free Scuttle), 10♠ (Stack Theft + Exile Recovery), J♠ (ER Attachment), Q♠ (Special Protection), K♠ (Multi-Counter + Wild Sovereignty). See §10.4 and `03_INTERACTION_GRAPH.md`.

**Q10: What are the non-Spades suit distinctions?**
Non-Spades suits are mechanically identical within rank except for: Ultra color recipes (2B2R requires Black+Red; 3-Red/3-Black require color homogeneity), 10♣ Foundation, 10♦ Mimic, 10♥ Tempo Spike. See `01_MECHANICAL_INVENTORY.md`.

**Q11: Do Supers compensate for card concentration?**
Yes, but variably. ⭐A (2 Aces) provides the highest counter authority. ⭐2/⭐4/⭐8/⭐J provide niche but healthy swing effects. ⭐3/⭐5/⭐6/⭐7 are INSUFFICIENT/DEFECT in the executable engine. Queen's Court and Royal Marriage provide structural fortresses. See §10.5.

### Interactions & Counterplay

**Q12: What are the interaction hubs?**
Highest systemic leverage: BJ (Board Lock), 4♠ (Total Clear). Most enabling: 2♠, K♠ (Wild access), 10♦ (Mimic). Most countering: Ace family, 3-Red Ultra. Most protected: ER Queens. Greatest synergy density: Queens. See §10.7.

**Q13: Which mechanics have insufficient practical counterplay?**
10♥ and 10♣ Foundation have narrowed counterplay due to IMPL-12 (only ⭐A/3-Red/K♠ answer them, not ordinary Aces). Board Lock has only ⭐A as direct counter. Queen's Court has only K♠ as direct counter. All are watchlist items, not confirmed degeneracies. See §10.8.

**Q14: Which mechanics have theoretical answers but weak agency?**
2B2R Ultra (theoretical answer: don't fire it; weak agency: policies always fire). Counter retention (theoretical answer: hold Aces for lethal threats; weak agency: one-ply policies always fire). Solo Wild / Wild Sovereignty (theoretical answer: high-value copies; weak agency: policies score them at ~100, effectively blind). See `05_POLICY_AUDIT.md`.

### Policy & Analytics

**Q15: What are the policy artifacts?**
12 heuristic policies (5 core, 7 Hybrix) using static weighted scoring. 32.2% zero-margin decisions. No lookahead, no hidden-hand modeling, no retention valuation. See `05_POLICY_AUDIT.md`.

**Q16: What are reconstructed scores?**
18,307 of 19,395 scored options have reconstructed decompositions (vs genuine policy scores). The `decision-trace.mjs` distinguishes `scoreSource: 'policy'` vs `'reconstructed'`. Reconstructed scores are analytic decompositions, not policy reasoning. See `05_POLICY_AUDIT.md`.

**Q17: What are the stratification effects?**
Seat 1 wins 37.8% raw, but 4 policies (support, tank, baseline, sniper) have zero or near-zero seat-1 games, confounding the aggregate. Policy-conditioned win rates range from 0.238 (control) to 0.667 (sniper). See `06_EMPIRICAL_EVIDENCE.md` §6.3.

**Q18: Which suspicious interactions were rejected?**
15 rejected hypotheses in `08_DEGENERACY_LEDGER.md` (REJ-01 through REJ-15), including: Aegis stacking dominance, Jack Disrupt loop, Voltage auto-win, 9♠ Goal Shift runaway, RJ Hand Swap determinism, and others. Each was investigated and falsified against engine authority.

### Degeneracy & Changes

**Q19: What degenerate legal interactions exist?**
3 confirmed degeneracies: DEG-01 (Sudden Death dead action), DEG-06 (2B2R policy over-activation — weakened to policy artifact), DEG-07 (Board Lock snowball — watchlist). See `08_DEGENERACY_LEDGER.md`.

**Q20: Which findings are blocked?**
Rank 7 scoring verdict (IMPL-01), BJ scoring verdict (IMPL-01), 10♦ Mimic verdict (IMPL-04), ⭐6/⭐7 verdicts (IMPL-03), Sudden Death verdict (DEG-01). All blocked by correctness defects, not by insufficient analysis. See §10.10 RT-04.

**Q21: Are any gameplay changes justified?**
**No.** Zero gameplay balance changes are defensible from available evidence. All observed anomalies trace to implementation defects, documentation drift, or policy heuristic bias. See §10.9.

**Q22: What are the smallest defensible changes?**
The smallest defensible changes are **correctness repairs**, not balance changes: fix IMPL-01 (scoring riders), IMPL-12 (counter class mapping), DEG-01 (Sudden Death timer), IMPL-03 (⭐6/⭐7 enumeration), IMPL-04 (10♦ destination). These restore intended rulebook behavior without altering balance parameters. See §10.9 Priority A.

**Q23: What is the falsification evidence?**
Each watchlist item has a falsification criterion: 2B2R (EXP-01: if holding yields higher win rate, overpoweredness is falsified), 10♥ (IMPL-12 fix restores 38% Ace counter threat), 10♣+BJ (0.7% rarity + IMPL-12 fix), 4♠ (robust Ace counterplay + self-wipe cost), Board Lock (symmetrical lock + opponent can still score). See §10.8 and §10.10.

**Q24: What are the next simulations?**
EXP-01 through EXP-07 as specified in `11_EXPERIMENT_PLAN.md`: 2B2R hold-vs-fire, Board Lock ahead/behind, 10♥ opportunity cost, Queen fortress breach, Total Clear swing, seat-balanced Unrestricted round-robin (post-bugfix), counter retention calibration.

### Strategic Integrity

**Q25: Does the game preserve meaningful asymmetric strategic choice?**
Yes. The interaction topology supports distinct strategic archetypes: rush (score-rush, tempo), control (control, hybrix-defender), trickster (hybrix-trickster), fortress (Queen's Court, Royal Marriage), and wildcard (2♠, K♠, 10♦). No single archetype dominates across all matchups. See §10.6 and `09_RANK_DOSSIERS.md`.

**Q26: Are there mechanics with no observed usage that are not zero?**
Yes. NOT_OBSERVABLE ≠ ZERO. Solo Wild (16/303), Wild Sovereignty (2/72), QC (0/12), RM (1/8), ⭐4 (0/15), ⭐8 (0/3), ⭐J (0/2) all have low or zero realized usage but nonzero mechanical existence. Sudden Death, ⭐3/⭐5/⭐6/⭐7 are NOT_OBSERVABLE in `core-advanced-authority`. See `06_EMPIRICAL_EVIDENCE.md`.

**Q27: Is the seat asymmetry a balance problem?**
Inconclusive. Raw seat-1 win rate is 37.8% (Wilson95 [0.288, 0.476]), but 4 policies have zero seat-1 games, confounding the aggregate. A seat-balanced round-robin on `core-unrestricted-authority` (EXP-06) is required after bugfixes. The asymmetry may be a policy-pairing artifact, not a mechanical bias. See `06` §6.3.

**Q28: What is the overall balance health verdict?**
**HEALTHY WITH IMPLEMENTATION DEBT.** The core mechanical decision loop preserves deep asymmetric strategic choice. The interaction topology is rich and robust against simple dominant strategies. All observed balance anomalies are traceable to implementation defects (IMPL-01/03/04/12, DEG-01), documentation drift (AUTH-04), or AI policy heuristic bias (POL-A1). Correcting the engine to match Rulebook v4.3.1 restores intended counterplay and system balance. No gameplay nerfs or buffs are warranted.
