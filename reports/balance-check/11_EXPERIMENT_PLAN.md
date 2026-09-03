# 11 — Targeted Validation Experiments Plan

Phase 10 / Artifact 16 · Standardized specifications for unresolved balance hypotheses.  
Tooling reference: `packages/simulation-runtime/` (`campaign.mjs`, `counterfactual.mjs`, `rank-power.mjs`).

---

## EXP-01: 2B2R Ultra — "Hold vs. Fire" Policy Ablation

* **Experiment ID:** `EXP-01-2B2R-HOLD-FIRE`
* **Hypothesis:** Policy over-activation of 2B2R Ultra (firing in 54.1% of opportunities) leads to sub-optimal long-term win rates due to hand dilution; holding components preserves strategic flexibility and improves match outcomes.
* **Independent Variable:** AI policy 2B2R valuation weight (`ultraBonus`: default +300 vs ablated 0 vs negative -200).
* **Controlled Variables:** Engine 4.2.6, profile `core-advanced-authority`, seed pair designs (identical deck shuffles), identical opponent policies.
* **Authority / Profile:** `core-advanced-authority`.
* **Policies:** `tempo` vs `control`, `value` vs `score-rush`.
* **Seed Design:** 100 paired seeds (200 matches per condition).
* **Relevant Starting States:** Opening hands holding ≥2 Black and ≥2 Red cards.
* **Required Opportunity Count:** Minimum 150 2B2R opportunities per policy condition.
* **Metrics:** Overall match win rate, average terminal turns, average hand quality (count of high-tier response cards retained at turn 5).
* **Stratification:** Stratified by seat (P1 vs P2) and opening hand singleton count (holding A/K/Q vs not).
* **Replay Retention:** Certified replays retained for all matches ending in ≤ 4 Full Turns.
* **Counterfactual Usage:** Apply `packages/simulation-runtime/src/counterfactual.mjs` at the 2B2R decision point to evaluate 3-turn downstream state projection.
* **Falsification Criterion:** If the policy that suppresses early 2B2R achieves an equal or higher win rate across 200 matches, the hypothesis of 2B2R mechanical overpoweredness is **falsified** (confirmed as an AI policy artifact).
* **Minimum Useful Evidence:** 100 paired matches with stat-sig p < 0.05.
* **Stop Condition:** Completion of 200 paired matches or early statistical significance boundary reached.

---

## EXP-02: Black Joker Board Lock — Leader Snowball vs. Comeback Utility

* **Experiment ID:** `EXP-02-BOARD-LOCK-LEAD`
* **Hypothesis:** Black Joker Board Lock functions primarily as an asymmetric snowball finisher when the activator already possesses a point lead, and offers low utility when trailing.
* **Independent Variable:** Point differential at Board Lock declaration (`Secured PR Points[activator] - Secured PR Points[opponent]`).
* **Controlled Variables:** Profile `core-advanced-authority`, engine 4.2.6.
* **Authority / Profile:** `core-advanced-authority`.
* **Policies:** Full 12-policy round-robin.
* **Seed Design:** Deterministic campaign seeds with Board Lock opportunities logged.
* **Relevant Starting States:** Mid-game states where a player holds Black Joker and has legal priority.
* **Required Opportunity Count:** Minimum 80 Board Lock declarations.
* **Metrics:** Win conversion rate when activated ahead (lead ≥ 5 pts) vs even (lead within ±4 pts) vs behind (deficit ≥ 5 pts); average points scored by trailing player during lock.
* **Stratification:** Stratified by activator point lead and presence of opponent 3-Red/⭐A counter in hand.
* **Replay Retention:** All matches with Board Lock activation.
* **Counterfactual Usage:** Replay branching from Board Lock declaration comparing `Board Lock` vs `Hold BJ for Scuttle`.
* **Falsification Criterion:** If trailing players activating Board Lock win ≥ 45% of matches, the "pure snowball" hypothesis is falsified.
* **Minimum Useful Evidence:** 50 observed activations stratified across point differentials.
* **Stop Condition:** 100 total Board Lock activations recorded.

---

## EXP-03: 10♥ Tempo Spike — 10 PR Points Forgone vs. Extra Action Conversion

* **Experiment ID:** `EXP-03-TEN-HEART-OPPORTUNITY-COST`
* **Hypothesis:** Playing 10♥ for Tempo Spike (+2 MT, draw 1) is only mathematically superior to scoring 10 points when the active player can immediately score ≥ 10 points with the bonus actions.
* **Independent Variable:** Policy decision branch on holding 10♥: `Play for Effect (Tempo)` vs `Play for Points (Score 10)`.
* **Controlled Variables:** Identical match seeds, identical board state at decision point.
* **Authority / Profile:** `core-advanced-authority`.
* **Policies:** `score-rush`, `tempo`, `value`.
* **Seed Design:** 50 matched seeds where player draws 10♥ before turn 4.
* **Relevant Starting States:** Turn 1–3 hands holding 10♥ with varying hand compositions (0 other scoring cards vs 2 other scoring cards).
* **Required Opportunity Count:** 50 paired decision points.
* **Metrics:** Net PR point delta 2 turns post-decision; win rate delta.
* **Stratification:** Hand point density at declaration.
* **Replay Retention:** Full decision trace and replay capture.
* **Counterfactual Usage:** Deterministic counterfactual branch evaluation using `counterfactual.mjs`.
* **Falsification Criterion:** If scoring 10 points consistently yields higher win rates regardless of hand composition, 10♥ tempo mode is falsified as overtuned.
* **Minimum Useful Evidence:** 40 counterfactual pairs.
* **Stop Condition:** 50 branch evaluations completed.

---

## EXP-04: Queen Fortress & Two-Queen Defense Uncounterable Window

* **Experiment ID:** `EXP-04-QUEEN-FORTRESS-WINDOW`
* **Hypothesis:** Establishing 2 untapped ER Queens creates an unanswerable endgame lock by disabling ⭐A and establishing mutual Guard against single-target removal.
* **Independent Variable:** Opponent board answer availability (presence of 4 Row Clear ER, 4♠ Total Clear, or ⭐2 Commandeer).
* **Controlled Variables:** `core-advanced-authority`, engine 4.2.6.
* **Authority / Profile:** `core-advanced-authority`.
* **Policies:** `control`, `hybrix-defender`, `hybrix-trickster`.
* **Seed Design:** Targeted setup states where Player A controls 2 ER Queens.
* **Relevant Starting States:** Turn 4+ boards with 2 active ER Queens.
* **Required Opportunity Count:** 40 fortress states.
* **Metrics:** Fortress breach rate (percentage of games where opponent dismantles the fortress within 2 Full Turns); fortress victory rate.
* **Stratification:** Stratified by opponent draw-pile depth and 4♠ accessibility.
* **Replay Retention:** Retain replays of all breached fortresses.
* **Counterfactual Usage:** Branch from fortress establishment evaluating opponent lines holding a Four vs holding an Ace.
* **Falsification Criterion:** If opponents breach the fortress in ≥ 40% of cases using 4 Row Clear, Total Clear, or ⭐2, the "unanswerable lock" hypothesis is falsified.
* **Minimum Useful Evidence:** 30 fortress occurrences.
* **Stop Condition:** 40 fortress occurrences recorded.

---

## EXP-05: 4♠ Total Clear — Swing & Rebound Analysis

* **Experiment ID:** `EXP-05-TOTAL-CLEAR-REBOUND`
* **Hypothesis:** 4♠ Total Clear functions primarily as a defensive comeback equalizer rather than a snowball finisher because it wipes the activator's own board and is held in check by standard Ace counterplay.
* **Independent Variable:** Board status of activator at Total Clear resolution (points behind vs points ahead).
* **Controlled Variables:** Engine 4.2.6, profile `core-advanced-authority`.
* **Authority / Profile:** `core-advanced-authority`.
* **Policies:** Full 12-policy catalog.
* **Seed Design:** 100 seeds with high PR point commitments.
* **Relevant Starting States:** Boards with ≥ 15 cumulative OTT points across players.
* **Required Opportunity Count:** 50 Total Clear declarations.
* **Metrics:** Counter rate by opponent Aces; net score swing (opponent points lost - activator points lost); win rate of activator following resolution.
* **Stratification:** Natural 4♠ vs 2♠ Solo Wild vs K♠ Wild Sovereignty.
* **Replay Retention:** All matches where Total Clear is declared.
* **Counterfactual Usage:** Branch from Total Clear declaration comparing resolution vs counter.
* **Falsification Criterion:** If Total Clear win rate is significantly higher when declared while ahead, the "comeback equalizer" hypothesis is falsified.
* **Minimum Useful Evidence:** 30 resolved Total Clears.
* **Stop Condition:** 50 declarations logged.

---

## EXP-06: Seat-Balanced Competitive Profile Round-Robin (`Unrestricted`)

* **Experiment ID:** `EXP-06-UNRESTRICTED-BENCHMARK`
* **Hypothesis:** When Sudden Death (`DEG-01`) and ⭐6/⭐7 enumeration (`IMPL-03`) are repaired, `core-unrestricted-authority` preserves equal seat balance and healthy game lengths.
* **Independent Variable:** Seat assignment (P1 vs P2) across a fully balanced 12×12 round-robin (every ordered pair played 4 times = 576 matches).
* **Controlled Variables:** Repaired Unrestricted engine, identical hardware and node worker threads.
* **Authority / Profile:** `core-unrestricted-authority` (post-bugfix).
* **Policies:** 12 policies.
* **Seed Design:** 576 unique seeds, perfectly symmetric seat pairings.
* **Required Opportunity Count:** 576 completed matches.
* **Metrics:** Seat 1 win rate with Wilson 95% CI; termination distribution; average turn count; usage of hidden Supers (⭐3, ⭐5, ⭐6, ⭐7).
* **Stratification:** Stratified by policy matchup and seat order.
* **Replay Retention:** 100% replay retention with cryptographic verification.
* **Counterfactual Usage:** Selective counterfactual evaluation on close matches (score margin ≤ 3).
* **Falsification Criterion:** Seat 1 win rate outside `[0.45, 0.55]` with p < 0.01 indicates genuine mechanical seat bias.
* **Minimum Useful Evidence:** 576 matches.
* **Stop Condition:** Full 576-match matrix completed.
* **Prerequisite Gate:** **Must not be run until `DEG-01` and `IMPL-03` are fixed.**

---

## EXP-07: Counter Retention & Threat Valuation Calibration

* **Experiment ID:** `EXP-07-COUNTER-RETENTION-VALUE`
* **Hypothesis:** Modifying policy scoring heuristics to explicitly value holding an Ace or K♠ in hand (applying a retention bonus) increases match win rate against aggressive opponents compared to immediate reactive counter firing.
* **Independent Variable:** Policy counter retention bonus: 0 (default one-ply) vs +300 vs +600 hand-retention bonus.
* **Controlled Variables:** `core-advanced-authority`, engine 4.2.6.
* **Authority / Profile:** `core-advanced-authority`.
* **Policies:** `control` (default) vs `control` (retaining).
* **Seed Design:** 100 paired seeds.
* **Relevant Starting States:** Matches where player holds an Ace against opponent effect plays.
* **Required Opportunity Count:** 100 counter opportunities.
* **Metrics:** Win rate; average turn counter is expended; value of negated target.
* **Stratification:** Stratified by target value (minor bounce vs lethal threat).
* **Replay Retention:** Certified replays of all matches.
* **Counterfactual Usage:** `counterfactual.mjs` evaluation at each counter decision point.
* **Falsification Criterion:** If retaining counters yields a lower win rate across 100 paired matches, the hypothesis that "AI undervalues counter retention" is falsified.
* **Minimum Useful Evidence:** 80 paired matches.
* **Stop Condition:** 100 paired matches completed.
