# 07 — Counterfactual & Policy-Conditioned Sensitivity Analysis

Phase 8 · Methodological constraint: Counterfactual evaluations are **policy-conditioned estimates** (`INFERENCE`), not solved play or proof of human regret (spec §22). Exact tool reference: `packages/simulation-runtime/src/counterfactual.mjs`.

---

## 7.1 CF-01: Turn-1 10♣ Foundation + Black Joker Opening

### Observed Trace Context (`M-db10a45b83e5e68eb1fd`, Seed `2020885632`)
* **State at Decision Index 2 (P1 Turn 1, Action Phase):**
  * P1 Hand: `10♣`, `BJ`, `A♥`, `Q♦`, `K♦` (Secured Points = 0).
  * Legal Options Offered: 15 actions, including `rank10/club-foundation-bonus` (targeting `BJ`, score: 1508), `royal-marriage` (`K♦`+`Q♦`, score: 1382), `anchor/queen` (score: 1378.95), other single plays.
  * Policy Score Margin: The Foundation line exceeded the second-best alternative (Royal Marriage) by **18 points** in `hybrix-defender`'s heuristic.

### Counterfactual Branch Analysis
1. **Branch A (Observed — Foundation + BJ):**
   * P1 commits `10♣` and selects `BJ` as bonus. Both enter PR.
   * Total PR: 10 (`10♣`) + 11 (`BJ`) = 21. Goal = 21. Victory check passes at End Phase.
   * Opponent response window: P2 held 3 Red cards and attempted `3-Red Ultra` counter.
   * Nested counter: P1 held `A♥`, `Q♦`, `K♦` (3 Red cards) and fired a counter-counter with their own `3-Red Ultra`, negating P2's counter.
   * Outcome: Instant victory on Turn 1.

2. **Branch B (Alternative — Royal Marriage `K♦` + `Q♦`):**
   * P1 plays Royal Marriage for 1 Mini-Turn. Both enter ER.
   * Board State: ER has King (Anchor 7) + Queen (Guard + Aegis). PR Points = 0.
   * Downstream Trajectory: Normal positional game. P1 retains `10♣` and `BJ` in hand for subsequent turns.
   * Risk / Reward: Branch B is standard tempo/control setup, but Branch A presented an immediate, deterministic lethal line.

3. **Branch C (Counterplay Sensitivity — What if P2 held K♠ or ⭐A?):**
   * `10♣` Foundation is an effect play (`stackClass: "rank10"`).
   * Per `IMPL-12`, Foundation is **immune to Base Ace and A♠**! Only `⭐A` or `3-Red Ultra` can counter it.
   * P2 *did* hold the correct counter class (`3-Red Ultra`).
   * The failure of counterplay occurred because P1 *also* held a `3-Red Ultra` to counter the counter.
   * If P1 did not hold 3 red cards, P2's `3-Red Ultra` would have resolved, sending `10♣` to GY (or Exile) and fizzling the BJ bonus score.

### Forensic Conclusion [GEMINI_REVIEW_CONFIRMED]
The Turn-1 kill was not a forced blunder by the opponent or a phantom calculation. It was the product of:
1. Exact joint reachability of `10♣` + `BJ` in a 5-card opening hand (~0.7% natural probability).
2. Counter-authority narrowing (`IMPL-12`), which prevented P2 from answering with ordinary Aces (which are held in 33–38% of hands).
3. The simultaneous holding of 3 Red cards by both players, allowing the active player to win the counter-on-counter chain.
*Classification:* `LEGAL_SUSPICIOUS` / `WATCHLIST`. It is bounded by extreme card rarity (~0.7%) and double-counter requirements, but exposed the systemic consequence of `IMPL-12`.

---

## 7.2 CF-02: 2B2R Ultra — "Fire Immediately" vs. "Hold Components"

### The Tension
`2B2R` Ultra requires 2 Black and 2 Red cards, costs 1 Mini-Turn, grants +2 Mini-Turns (net +1), and draws 2 cards (or rummages Exile).
* In 5-card opening hands, `2B2R` is naturally present in **60.1%** of cases (77.3% in 6-card hands).
* The heuristic policies assign a flat `+300` Ultra bonus + `+240` mini-turn bonus + `+110` draw bonus, scoring `2B2R` at ~1600–1770, which causes them to fire it in 73 out of 135 opportunities (54.1%).

### Counterfactual Questions
* **Hypothesis:** When an AI fires `2B2R` on Turn 1, it sacrifices 4 specific cards (which could include Aces, Kings, Queens, or key suit utility) to gain 1 net action and 2 random topdeck cards.
* In Match `M-7856e24c1f36d9441ba1`, P1 fired `2B2R` on Turn 1 and again on Turn 2, achieving an explosive win (27–15 in 2 FTs). However, in longer games, players who fire `2B2R` early frequently exhaust high-tier response resources (Aces/Queens).
* **Policy-Conditioned Estimate:** The perceived dominance of `2B2R` is amplified by policy valuation bias that ignores hand-quality dilution. A human or lookahead policy holding `A♠`, `K♠`, `Q♠`, and `4♠` would almost certainly decline `2B2R` to preserve game-defining singletons.
* Promoted to **`EXP-01`** in `11_EXPERIMENT_PLAN.md`.

---

## 7.3 CF-03: Latent Threat Retention vs. Premature Activation

### Observed Policy Failure
* In the empirical dataset:
  * `A-base` counters were fired at 76.3% of opportunities (29/38).
  * `3-Red` Ultra counters were fired at 63.8% of opportunities (97/152).
  * `J` Disrupt was fired 160 times.
* Policies evaluate decisions at a single ply. When an opponent declares an effect, the policy compares the immediate value of countering (scored at ~1200–1900) against declining (scored at ~70–330).
* The policy cannot model: *"If I counter this minor 3-Bounce now, I will have no answer when the opponent casts 4♠ Total Clear or 10♥ on the next turn."*

### Human-Play Inference [HUMAN_PLAY_INFERENCE]
* Competent human play heavily penalizes burning the sole Ace or K♠ in hand against low-leverage plays.
* The presence of a held Ace or held 8 in a player's hand creates latent deterrence: the opponent avoids committing multi-card investments or high-value anchors.
* In the AI corpus, threat value is artificially deflated to zero because neither player models hidden hand contents or future turns.
* Consequently, empirical resolution rates of counters are abnormally high, and empirical retention duration is abnormally low.
* Follow-up validation using `packages/simulation-runtime/src/counterfactual.mjs` is specified in **`EXP-07`**.
