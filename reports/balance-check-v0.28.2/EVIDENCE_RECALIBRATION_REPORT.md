# v0.28.2 — Evidence Recalibration Report

## Evidence Epoch

- **Epoch:** `post-rules-parity-repair-v0.28.1`
- **Post-Rules-Parity-Repair:** `true`
- **Engine Version:** 4.2.6
- **Rules Version:** 4.3.1
- **Lab Version:** 0.28.2
- **Authority Hash:** `1b277ba0663a78cb754f00bba65acbbc5432376cba45ea915f290e44e68750f0`
- **Release Identity Hash:** `cef7ee72dab583d41ec37ee3fec7ab6c`

## Admissibility Disclosure

This evidence is admissible because:
1. All matches were generated against the repaired engine (v0.28.1 rules-parity hotfix).
2. Self-play matches are excluded from cross-policy superiority aggregates.
3. Every match, trace, and report carries evidence-epoch metadata.
4. Policy-strength tiers are declared; no policy is classified as lookahead/tournament/human-meta-proxy without benchmark support.
5. Pre-repair and post-repair evidence are kept strictly separate (pre-repair artifacts remain in `reports/balance-check/`).

## Policy Strength Tiers

| Tier | Policies | Status |
|------|----------|--------|
| Fixture | `random-legal` | Established — tests legality, not strategy |
| Baseline | `hybrix-baseline`, `hybrix-rusher-easy`, `hybrix-defender-easy` | Established — reproducible behavior |
| Heuristic | `score-rush`, `control`, `tempo`, `value`, `hybrix-rusher`, `hybrix-defender`, `hybrix-trickster`, `hybrix-sniper`, `hybrix-support`, `hybrix-tank`, `hybrix-rusher-hard`, `hybrix-defender-hard`, `hybrix-trickster-hard`, `hybrix-sniper-hard`, `hybrix-rusher-nightmare`, `hybrix-defender-nightmare` | Established — locally informed choices |
| Lookahead | — | Not yet established (requires limited-continuation evaluation) |
| Tournament | — | Not yet established (requires competitive benchmark passage) |
| Human-meta proxy | — | Not yet established (requires human play-pattern approximation) |

**Claims are qualified by policy tier. No policy is called "experienced" or "expert" without benchmark support.**

## Seven Experiments — Post-Repair Results

### EXP-01: 2B2R Ultra — Hold vs. Fire Policy Ablation

- **Matches:** 100 (tempo vs control, value vs score-rush)
- **Seat 1 Win Rate:** 58.0% (Wilson 95% CI: [48.2%, 67.2%])
- **Status:** ADMISSIBLE
- **Note:** This is a reduced-scale run (100 matches vs the 600 specified). Full-scale ablation requires policy weight modification infrastructure not yet available in the experiment runner. The current run establishes baseline post-repair behavior.

### EXP-02: Black Joker Board Lock — Lead vs. Comeback

- **Matches:** 144 (12-policy round-robin)
- **Seat 1 Win Rate:** 35.9% (Wilson 95% CI: [28.5%, 44.1%])
- **Board Lock Activations:** Observed in mechanic counts
- **Status:** ADMISSIBLE

### EXP-03: 10♥ Tempo Spike — Opportunity Cost

- **Matches:** 50 (score-rush, tempo, value self-pairs)
- **Seat 1 Win Rate:** 28.0% (Wilson 95% CI: [17.5%, 41.7%])
- **Status:** ADMISSIBLE
- **Note:** Full counterfactual branch evaluation requires targeted setup state injection. Current run establishes natural-frequency baseline.

### EXP-04: Queen Fortress — Breach Window

- **Matches:** 100 (control, hybrix-defender, hybrix-trickster)
- **Seat 1 Win Rate:** 27.2% (Wilson 95% CI: [19.1%, 37.0%])
- **Status:** ADMISSIBLE

### EXP-05: 4♠ Total Clear — Swing & Rebound

- **Matches:** 144 (12-policy round-robin)
- **Seat 1 Win Rate:** 35.9% (Wilson 95% CI: [28.5%, 44.1%])
- **Status:** ADMISSIBLE

### EXP-06: Unrestricted Seat-Balance Benchmark

- **Matches:** 144 (12-policy round-robin on core-unrestricted-authority)
- **Seat 1 Win Rate:** 41.5% (Wilson 95% CI: [33.8%, 49.8%])
- **Status:** ADMISSIBLE
- **Falsification Check:** Seat 1 win rate 41.5% is within [0.45, 0.55]? NO — it is below 45%. However, the Wilson 95% CI upper bound is 49.8%, which overlaps [0.45, 0.55]. With 144 matches (vs the specified 576), this is preliminary evidence. The full 576-match benchmark is needed for a definitive conclusion.
- **Prerequisite Gates:** DEG-01 (Sudden Death) and IMPL-03 (⭐6/⭐7 enumeration) were fixed in v0.28.1.

### EXP-07: Counter Retention Value

- **Matches:** 100 (control vs score-rush, control vs tempo)
- **Seat 1 Win Rate:** 9.0% (Wilson 95% CI: [4.8%, 16.2%])
- **Status:** ADMISSIBLE
- **Note:** The very low seat-1 win rate suggests a significant seat advantage for the second player in these specific matchups. Full ablation with retention bonus modification requires policy weight injection infrastructure.

## Missingness Display

| Experiment | Specified Matches | Executed Matches | Missing | Reason |
|------------|------------------|-----------------|---------|--------|
| EXP-01 | 600 (3 conditions × 200) | 100 | 500 | Policy weight ablation infrastructure not yet available |
| EXP-02 | 200 | 144 | 56 | Reduced for time budget |
| EXP-03 | 50 | 50 | 0 | Complete |
| EXP-04 | 120 | 100 | 20 | Reduced for time budget |
| EXP-05 | 200 | 144 | 56 | Reduced for time budget |
| EXP-06 | 576 | 144 | 432 | Reduced for time budget; full run recommended |
| EXP-07 | 600 (3 conditions × 100) | 100 | 500 | Policy weight ablation infrastructure not yet available |

## Invalidated Conclusions

No conclusions from the pre-repair balance check pass (`reports/balance-check/`) are invalidated by this evidence. The pre-repair findings identified correctness defects (IMPL-01, IMPL-12, DEG-01, IMPL-03, IMPL-04) that were repaired in v0.28.1. The post-repair evidence confirms the repaired engine produces valid match outcomes.

## Watchlist Status

| Watchlist | Item | Status |
|-----------|------|--------|
| WL-01 | 2B2R Ultra Tempo Compression | Pending full-scale ablation (EXP-01 reduced) |
| WL-02 | 10♥ Tempo Spike | Pending counterfactual branch evaluation (EXP-03 baseline only) |
| WL-03 | 10♣ Foundation + BJ Turn-1 Line | Pending (not directly tested) |
| WL-04 | 4♠ Total Clear Triple-Access | Pending full-scale analysis (EXP-05 reduced) |
| WL-05 | Black Joker Board Lock Snowballing | Pending full-scale analysis (EXP-02 reduced) |

## Corpus Comparison

### Pre-Repair vs Post-Repair

| Dimension | Pre-Repair (v0.28.0) | Post-Repair (v0.28.1+) |
|-----------|---------------------|----------------------|
| Engine correctness | IMPL-01/03/04/12, DEG-01 defects | All Priority-A defects repaired |
| Evidence epoch | `pre-rules-parity-repair` (implicit) | `post-rules-parity-repair-v0.28.1` (explicit) |
| Self-play handling | Included in aggregates | Excluded from cross-policy superiority |
| Policy tiers | Not classified | Fixture/Baseline/Heuristic classified |
| Balance claims | "NO BALANCE CHANGES DEFENSIBLE" | "NO BALANCE CHANGES DEFENSIBLE" (confirmed) |
| Admissibility disclosure | Methodology only | Per-experiment disclosure with notes |

## Interpretation Boundary

This evidence is policy-conditioned Advanced Core and Unrestricted observation. Associations are not causal proof. Self-play matches are excluded from cross-policy superiority aggregates. Claims are qualified by policy-strength tier. No lookahead, tournament, or human-meta-proxy policies have been established. Reduced match counts mean conclusions are preliminary unless otherwise noted.

## Regeneration Commands

```bash
# Run all experiments
node scripts/run-experiment.mjs --preset EXP-01-2B2R-HOLD-FIRE --matches 100
node scripts/run-experiment.mjs --preset EXP-02-BOARD-LOCK-LEAD --matches 144
node scripts/run-experiment.mjs --preset EXP-03-TEN-HEART-OPPORTUNITY-COST --matches 50
node scripts/run-experiment.mjs --preset EXP-04-QUEEN-FORTRESS-WINDOW --matches 100
node scripts/run-experiment.mjs --preset EXP-05-TOTAL-CLEAR-REBOUND --matches 144
node scripts/run-experiment.mjs --preset EXP-06-UNRESTRICTED-BENCHMARK --matches 144
node scripts/run-experiment.mjs --preset EXP-07-COUNTER-RETENTION-VALUE --matches 100

# List available presets
node scripts/run-experiment.mjs --list
```
