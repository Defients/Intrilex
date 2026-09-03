# 06 — Empirical Evidence Analysis

Phase 7 · Evidence Grade: **B — CURRENT + LIMITED** (admissibility per `04_SIMULATION_READINESS.md`).  
Corpus: `sample-data/autonomy/` (100 matches, 12 policies, `core-advanced-authority`, engine 4.2.6, rules 4.3.1).

---

## 6.1 Cohort Boundary & Admissibility Scope

All empirical metrics are conditioned on the following boundary:
* **Dataset:** `mechanics-observatory-twelve-policy-100` (`experimentHash: ae0759d6...`, `canonicalResultHash: f4f45403...`).
* **Profile:** `core-advanced-authority` (Local-vs-AI default). **Zero** empirical matches exist in this corpus for `core-unrestricted-authority` (online competitive ranked).
* **Policies:** 12 heuristic policies (5 core v2.0.0, 7 Hybrix). Decisions are one-ply, policy-conditioned valuations with 32.2% zero-margin ties.
* **Limitations:** The corpus reflects policy-realized execution, not optimal play or human metagame play. Any mechanic unsupported or fail-closed in `core-advanced-authority` is classified as `NOT_OBSERVABLE`, which is strictly distinct from `ZERO` activation.

---

## 6.2 Match Termination & Trajectory Metrics

### Termination Distribution (n = 100)
| Termination Reason | Matches | Share | Notes |
|---|---:|---:|---|
| `NORMAL_VICTORY` | 88 | 88.0% | Active player achieved Secured PR Points ≥ Goal at End Phase |
| `EXHAUSTED_RESOLUTION` | 10 | 10.0% | Resolved by Exhausted tiebreaker (Anchor count in ER, then Points) |
| `CANONICAL_DRAW` | 2 | 2.0% | Exhausted tiebreaker tied on both Anchors and Points |
| `SUDDEN_DEATH` | 0 | 0.0% | Unsupported in `core-advanced-authority`; dead in Unrestricted |

### Game Length Trajectory (Full Turns)
* **Median:** 11 Full Turns
* **10th Percentile (p10):** 4 Full Turns
* **90th Percentile (p90):** 48 Full Turns
* **Minimum:** 0 Full Turns (Turn-1 win, Match `M-db10a45b83e5e68eb1fd`)
* **Maximum:** 65 Full Turns

---

## 6.3 Seat Balance & Confounding Audit

### Raw vs. Balanced Subset Seat Win Rates
* **Raw Corpus (n = 100, 98 decided):**
  * Seat 1 Wins: 37
  * Seat 2 Wins: 61
  * Seat 1 Win Rate: **37.8%** (Wilson 95% CI: `[0.288, 0.476]`)
* **Confounding Identification:**
  * Four Hybrix policies (`hybrix-support`, `hybrix-tank`, `hybrix-baseline`, `hybrix-sniper`) were assigned exclusively or overwhelmingly to Seat 2 (0 games in Seat 1 for support/tank/baseline; 4 in Seat 1 vs 8 in Seat 2 for sniper). These four policies won 21 games from Seat 2.
* **Controlled Balanced Subset (n = 64 decided matches):**
  * Filtering out matches involving the four asymmetric policies yields 64 symmetric matches across the remaining 8 policies (`random-legal`, `score-rush`, `control`, `tempo`, `value`, `hybrix-rusher`, `hybrix-defender`, `hybrix-trickster`).
  * Seat 1 Wins: 27
  * Seat 2 Wins: 37
  * Seat 1 Win Rate: **42.2%** (Wilson 95% CI: `[0.309, 0.544]`)
* **Inference [GEMINI_REVIEW_CONFIRMED]:**
  * The apparent severe first-player deficit (37.8%) in the raw aggregate is partially an artifact of asymmetric pairing with high-performing AI personalities in Seat 2. In the balanced cohort, Seat 1 achieves 42.2%, whose 95% confidence interval spans parity (0.500). A mild second-player advantage remains plausible due to 6-card opening hand size vs 5-card opening hand size, but raw figures overstate it.

---

## 6.4 Usage / Opportunity Analysis

Derived from `aggregate.json` telemetry (`mechanicOpportunityCounts` vs `mechanicCounts`):

### 1. High Conversion Mechanics (Frequent Execution when Offered)
| Mechanic / Action | Executions | Opportunities | Conversion Rate | Classification |
|---|---:|---:|---:|---|
| `8♠` Free Scuttle | 24 | 27 | 88.9% | HIGH_CONVERSION (Instant free tempo removal) |
| `A♠` Exile Counter | 14 | 17 | 82.4% | HIGH_CONVERSION (Strictly dominant counter) |
| `⭐2` Commandeer (Hold) | 9 | 11 | 81.8% | HIGH_CONVERSION (Steal & hold preferred) |
| `A-base` Counter | 29 | 38 | 76.3% | HIGH_CONVERSION (Reactive response) |
| `K♠` Multi-Play Counter | 2 | 3 | 66.7% | HIGH_CONVERSION (Niche trigger, high execution) |
| `3-Red` Ultra Counter | 97 | 152 | 63.8% | HIGH_CONVERSION (Policy over-activation) |
| `⭐A` Super Counter | 14 | 23 | 60.9% | HIGH_CONVERSION (Priority premium counter) |
| `2B2R` Ultra (Draw branch) | 62 | 135 | 45.9% | HIGH_CONVERSION (Primary tempo engine) |
| `10♥` Tempo Spike | 29 | 65 | 44.6% | HIGH_CONVERSION (+2 MT + draw priority) |
| `10♣` Foundation | 39 | 92 | 42.4% | HIGH_CONVERSION (Entry Aegis + points) |

### 2. Low Conversion Mechanics (Preserved or Deprioritized by Heuristics)
| Mechanic / Action | Executions | Opportunities | Conversion Rate | Classification |
|---|---:|---:|---:|---|
| `Scuttle` (Ordinary) | 112 | 555 | 20.2% | LOW_CONVERSION (Selectivity for targets) |
| `Board Lock` (BJ Quick) | 25 | 166 | 15.1% | LOW_CONVERSION (Conditioned on hand & board) |
| `Total Clear` (`4♠`) | 16 | 123 | 13.0% | LOW_CONVERSION (High variance, wipes own board) |
| `7` Topdeck Casting | 30 | 736 | 4.1% | LOW_CONVERSION (Policy scoring bias / deprioritized) |
| `Solo Wild` Copy | 16 | 303 | 5.3% | POLICY_BLIND (Scored at base 100 default) |
| `Wild Sovereignty` (`K♠`) | 2 | 72 | 2.8% | POLICY_BLIND (Scored at base 100 default) |
| `Face-Up Swap Draw` | 51 | 1726 | 3.0% | LOW_CONVERSION (Hand usually sufficient) |
| `⭐4` Row Exchange | 0 | 15 | 0.0% | UNUSED_IN_SAMPLE (High barrier / pair requirement) |
| `⭐8` Absolute Scuttle | 0 | 3 | 0.0% | UNUSED_IN_SAMPLE (Rare opportunity) |
| `⭐J` Tempo Force | 0 | 2 | 0.0% | UNUSED_IN_SAMPLE (Rare pair in hand) |
| `Queen's Court` | 0 | 12 | 0.0% | UNUSED_IN_SAMPLE (Pair of Queens preserved in ER) |
| `⭐2` Commandeer (Score) | 0 | 11 | 0.0% | DOMINATED (Hold mode completely dominates score mode) |

### 3. Free Plays (Total Activations across 100 Matches)
* `J` Disrupt: 160 activations (draws 1, restricts action family)
* `9` Tap: 80 activations (temporary points denial)
* `8` Quick Aegis: 76 activations (proactive board protection)
* `Q` Quick Aegis: 44 activations (targeted protection)

### 4. Categorically Unobservable in Current Corpus (`NOT_OBSERVABLE`)
* `⭐3` Super Raid, `⭐5` Super Recycle, `⭐6` Super Dig, `⭐7` Super Topdeck (Unrestricted-only)
* `Sudden Death` declaration (Unrestricted-only)
* `10♦` Mimic of generated effects (Unrestricted-only)
* Ordinary Play-for-Points for `7`, `10♣`, `BJ` (Blocked by `CORE_SCORING_RIDER_UNSUPPORTED`)
* `9` Goal Shift (+3/+5 and 9♠ rider) (Unenumerated in Core)
* `2 Quick` Score+Discard and `Wild Catalyst` (Unimplemented in engine)
* `5` Suit-specific Exile rummage (Unimplemented in engine)

---

## 6.5 Fast-Win Cohort Analysis (≤ 2 Full Turns)

Three matches in the 100-match corpus concluded in ≤ 2 Full Turns:

1. **`M-db10a45b83e5e68eb1fd` (0 Completed Full Turns, 21–0):**
   * **Pairing:** `hybrix-defender` (P1) vs `hybrix-trickster` (P2), Seed `2020885632`.
   * **Sequence:** P1 opened holding `10♣` and `BJ`. P1 declared `10♣` Foundation. Because P1 began at 0 Secured PR Points, Foundation triggered its bonus-score rider. P1 selected `BJ` as the bonus card. `10♣` (10 pts) + `BJ` (11 pts) entered PR simultaneously, achieving 21 points immediately. P2 responded with 3-Red Ultra counter; P1 countered back with their own 3-Red Ultra counter. Victory was declared before Full Turn 1 ended.
   * **Significance:** Demonstrates that the `CORE_SCORING_RIDER_UNSUPPORTED` gate blocks *direct* Play-for-Points for BJ, but does not block *bonus scoring* from Foundation.

2. **`M-7856e24c1f36d9441ba1` (2 Full Turns, 27–15):**
   * **Pairing:** `tempo` (P1) vs `score-rush` (P2), Seed `3336578660`.
   * **Sequence:** P1 fired two consecutive `2B2R` Ultras across Turns 1 and 2, gaining +4 cumulative Mini-Turns and cycling cards rapidly, converting high-tempo actions into five distinct scoring plays.

3. **`M-f6d8aa25e78043fa3961` (2 Full Turns, 21–0):**
   * **Pairing:** `hybrix-trickster` (P1) vs `random-legal` (P2), Seed `544289463`.
   * **Sequence:** Rapid tempo conversion via `10♥` (+2 Mini-Turns) combined with unhindered high-value scores against a non-disruptive random opponent.

---

## 6.6 Policy-Conditioning Cautions

1. **Blindness Artifacts:** The near-zero conversion of `Solo Wild` (5.3%) and `Wild Sovereignty` (2.8%) is an artifact of the scoring model assigning them fallback default weight (~100), rather than mechanical weakness.
2. **Over-activation Artifacts:** The staggering 97 executions of `3-Red Ultra` reflect an aggressive flat bonus in policy evaluation that treats three red cards as a disposable generic counter, distorting effect resolution rates across the board.
3. **Disproportionate Hold Selection:** In `⭐2` Commandeer, `hold` was chosen 9 times and `score` 0 times, driven by an explicit `holdBonus: 150` in `scoring.mjs`.
