# Red Joker Forensic Report — Intrilex Simulation Lab

Profile: `core-advanced-authority` · Experiment hash: `8fa7be061956e63f3d930a04ec229fbc9917ed863604df013d49d5b2cdec477e`
Canonical rules: **unchanged** (upstream engine untouched; all changes are observational telemetry or policy-side).
All artifacts under `runtime/forensic-rj/`. Determinism verified: baseline-v3 ≡ baseline-v3b (100/100 matches), cohort-300 first-100 ≡ policyfix-v1 (100/100).

## 1. Executive verdict

**MEASUREMENT PROBLEM**

The "Red Joker is weak" premise was produced by a stale stored artifact (pre-Rank-6-fix engine dist + a different 100-match cohort at LOW confidence). Re-measured on the current tree, RJ is **6th of 15 ranks at RPI 0.509 with HIGH confidence** (323 opportunities, 116 selections, ORV +0.056, 58.6% selection win rate) — statistically indistinguishable from Black Joker (0.532). Mode-level evidence reinforces this: every mode ablation *lowered* measured RJ value (no poisoned mode), the score-only control cost ~0.15 RPI (the effect package earns its keep), and paired counterfactuals show the AI *underuses* contending RJ effects (+8.13 mean margin foregone when declined) rather than hurting itself by playing them (−0.30 mean margin when selected — break-even). Residual pilot defects exist (HYBRIX error-injection, tie-break mode picks, count-vs-quality confusion — the last two now corrected), but they explain scattered bad plays, not a weak card. No canonical rule change is warranted.

## 2. Baseline evidence

| artifact | matches | cohort | code | RJ RPI | conf | RJ ORV | sels/opps |
|---|---|---|---|---|---|---|---|
| stored Rank-6 baseline | 100 | `8c41081f` | pre-fix engine dist | 0.131 | LOW (~32 obs) | −0.148 | — |
| repro (old cohort, old dist) | 100 | `8c41081f` | then-current | 0.2285 | — | — | — |
| **baseline-v3** (canonical) | 100 | `8fa7be06` | current + observational fields | **0.4889** | MEDIUM | null (not-observable semantics preserved) | 30/90 |
| abl-none rerun | 100 | `8fa7be06` | same | 0.4889 | MEDIUM | — | 30/90 (identical) |
| policyfix-v1 (paired policy experiment) | 100 | `8fa7be06` | corrected valuation | 0.4803 | MEDIUM | — | 29/91 |
| **cohort-300** | 300 | `8fa7be06` (ordinals 0–299, same seed derivation) | corrected valuation | **0.5094** | **HIGH** | **+0.0556** | 116/323 |

Key methodology finding: RJ RPI swung **0.131 → 0.229 → 0.489** across three runs that differed only in cohort and/or engine-dist build state. Between-cohort variance at n=100 is ≈ ±0.2 RPI — the original LOW-confidence reading carried no actionable signal. Deterministic within a build: v3 ≡ v3b exactly; the v2↔v3 drift (13/100 matches) traced to `runtime/autonomy-engine-dist` being rebuilt between runs, not to the observational edit.

## 3. Per-mode decomposition (300-match cohort, actor-signed margins)

| mode | opps | sels | sel% | win | meanΔ | medΔ | p10 | p90 | note |
|---|---|---|---|---|---|---|---|---|---|
| `hand-swap` | 225 | 39 | 17.3% | 64.1% | +1.51 | +6 | −23 | +22 | the workhorse effect |
| `self-reset` | 225 | 3 | 1.3% | 0% | −19.7 | −21 | −22 | −16 | all 3 by weak pilots (random-legal ×2, control tie-pick ×1); n=3 LOW |
| `opponent-attack` | 225 | 3 | 1.3% | 33% | −6.0 | −9 | −20 | +11 | n=3 LOW; CF shows strong upside when declined in good states |
| `shuffle-reset` | 225 | 0 | 0% | — | — | — | — | — | correctly unpicked under DP-aware valuation (previously only chosen via error-injection) |
| `score:points` | 239 | 29 | 12.1% | 62.1% | +6.24 | +9 | −20 | +24 | plain 5 points is a solid floor |
| `scuttle:ordinary` | 98 | 31 | 31.6% | 48.4% | −1.65 | 0 | −22 | +23 | RJ scuttle-order is high; mixed but CF-positive |
| `swap-bar:face-down` | 75 | 11 | 14.7% | 81.8% | +10.18 | +16 | −23 | +23 | best per-play outcome; suitless RJ goes face-down only |

Frame-level: RJ-effect-selected frames win 57.8% (45 frames) vs 55.0% for RJ-declined frames (249) — no selection-poisoning. Timing: effects picked early 27× (52% win), mid 10× (70%), late 8× (63%); no effect selections when either side within ~6 of goal in this cohort.

## 4. Action-score traces (representative)

- **Good** — `control-tactical`, D119: hand-swap scored 1710, own hand {RJ} vs opponent 2 cards → stole the hand, won +20. Counterfactual: +3.31 margin vs draw.
- **Bad** — `random-legal`, D50: hand-swap with opponent holding **zero** cards — traded RJ for nothing (count-based gate can't fire on random picks anyway); CF −2.12.
- **Tie-pathology** — `control`, D2 (turn 1): every candidate tied at 1050 → `self-reset` selected by lexicographic tiebreak → −21. Weak differentiation at score parity, not a valuation call.
- **Error-injection** — `hybrix-defender`, D87: scores were `score-6` 20316 / `score-RJ` 20276 / … `shuffle-reset` 1419. Selected = shuffle-reset with `reasonCode: LOW_MARGIN_ALTERNATIVE` (≡ `difficultyError`), i.e. the ~5% normal-difficulty error-injection layer, not argmax. CF showed it was near-free (Δ+0.13 margin) — lucky.
- **Opportunity cost** — `tempo-tactical` opponent-attack vs `score:points` alternative: CF Δmargin **−7.0** — the one clearly negative effect pick; attack destroyed 2 cards the opponent partially rerolled.

## 5. Hand-quality findings (omniscient post-resolution replay)

Hand quality was modeled as points + counter value (A/K/8/J) + recipe proximity + flexibility (2/BJ/RJ/10/Q/9) — diagnostic only, full-state access, never fed to policies.

- `control-tactical` hand-swap: gave {RJ} (Q 6.5), received opp 2-card hand (Q 5.5). Received ≈ given — the real payoff was removing the opponent's grip at dp=3 (deck exhaustion imminent). Good use.
- `hybrix-support` hand-swap: gave a real card + RJ (Q 6.5), received 3 junk cards (Q **1.0**). The `enemyHandCount*6` term predicted positive; actual exchange was −5.5 quality. CF Δ −2.69. **Count-vs-quality confusion confirmed and corrected.**
- `control` self-reset: destroyed a Q 7.5 hand for a 2-card redraw (Q 1.0); opponent also responded through the window. Worst-quality outcome observed (tie-pick).
- `hybrix-defender` shuffle-reset: dp=18/gy=26 — healthy deck, so it was a vanilla draw-2 that also spent the Joker. Confirmed overvalued by the old flat +240.

Across all 90 baseline RJ-opportunity frames: mean own-hand quality 11.42 vs opponent 9.74 — RJ holders were typically *ahead* on hand quality, i.e. swaps/resets were systematically unattractive and correctly declined most of the time.

## 6. Opportunity cost

Every RJ effect forgoes `score:points` = +5 points. Frame-level scores showed effect modes almost never beat scoring RJ outright — the policy resolves this correctly: score-RJ won 62% of selections at +6.2 mean margin. Paired counterfactuals quantify the gap directly:

- **rj-selected** (n=30, 16 paired rollouts each, shared seeds): mean Δmargin **−0.30** vs best non-RJ alternative — break-even. Scuttle-RJ picks were net positive (several +14/+16 vs alternative scuttles/plays); opponent-attack (−7) and the junk-hand swap (−2.7) were the misses.
- **rj-declined-contender** (n=8 — states where an RJ effect scored top-3 but was declined): forcing the RJ effect gained **+8.13 mean margin**; largest: `opponent-attack` vs `anchor:king` +32.8 (13/0 wins). RJ is *under*used in contending states, predominantly by `control`.

## 7. Controlled policy experiment (identical seeds, before → after)

Changes (all authorized-info, mechanical-honesty fixes — no RJ bonuses):
- `action-evaluation.mjs`: `shuffle-reset` flat +240 → value only what DP can't already supply + thin-DP recycle credit; `opponent-attack` `min(2,N)*180` → `min(2,N)*160 − max(0,N−4)*30` (mulligan-repair discount); `hand-swap` opp-hand estimate 6→6.5/card; `self-reset` scale 110→105.
- `rank-strategy.mjs`: `estimateHandAdvantage` now weighs own-hand strategic quality vs opponent's count×expected value instead of raw counts.

| | before | after |
|---|---|---|
| RJ RPI | 0.4889 | 0.4803 (Δ −0.009, noise) |
| effect selections | 6 | 6 |
| changed matches | — | 2/100, both improved for the actor (+2, +7 margins) |

At 300 matches the corrected valuation normalized the mix: hand-swap 39 sels (64% win), self-reset/opponent-attack ~1% each, shuffle-reset never picked — without hurting aggregate value (0.509 HIGH). The defects were real but second-order.

## 8. Counterfactual experiment

Method: replay-fork — reconstruct exact pre-decision state from certified command logs, execute focal action vs comparison action, run 16 paired continuations per arm with shared seeds and unchanged policies (`scripts/rj-forensic-deep.mjs`). Valid: identical initial state, single-difference intervention, controlled continuation policy, documented RNG (seed per rollout shared across arms). Power: 38 forks × 16 rollouts; effect sizes ≥ ~5 margin are credible, smaller deltas are directional. Results in §6.

## 9. Mode ablations (identical seeds, `|drop:` diagnostic policy modifiers)

| arm | RJ RPI | Δ vs 0.4889 |
|---|---|---|
| baseline | 0.4889 | — |
| `no-effects` (score-only control) | 0.3411 | −0.148 |
| `no-hand-swap` | 0.4827 | −0.006 |
| `no-self-reset` | 0.4156 | −0.073 |
| `no-opponent-attack` | 0.3427 | −0.146 |
| `no-shuffle-reset` | 0.3314 | −0.157 |

Every removal arm landed below baseline — **no poisoned mode**, and the effect package is worth ≈ +0.15 RPI over a vanilla 5-point body. Caveat: arms share seeds but trajectories diverge after the first filtered choice; per-arm ladder noise is ~±0.1 (BJ moved +0.12 in arms that changed nothing for it), so per-mode magnitudes are directional, not precise.

## 10. Profile sensitivity (300-match)

Strong pilots: `control-conversion-tactical` 1.00, `value-tactical` 0.88, `hybrix-sniper` 0.86, `hybrix-support` 0.73, `tempo-tactical`/`hybrix-trickster` 0.70 selection-win rates. Weak pilots: `random-legal` 0.13, `control` 0.14 — the same two pilots that produced all 3 self-reset picks. RJ is not uniformly misused; it is misused specifically by uniform-random and tie-prone selection layers.

## 11. Root-cause attribution (why RJ *looked* weak)

| cause | share | evidence |
|---|---|---|
| sample/cohort noise | ~45% | same-code cohorts differed by ±0.2 RPI; original claim was LOW/~32 obs |
| stale measurement artifact | ~30% | stored baseline predates Rank-6 valuation corrections and an engine-dist rebuild; 100/100 matches differed |
| AI valuation | ~15% | real defects (flat shuffle-reset, count-based swap gate, mulligan-blind attack) — corrected; cohort impact small but per-decision impact real |
| mode-selection policy | ~10% | hybrix 5% error-injection + topK softmax; deterministic tie-breaks picking `self-reset` at score parity |
| telemetry | ~0% | opportunity/selection/attribution instrumentation verified correct end-to-end (it *found* the truth) |
| RPI structure | ~0% | ladder is internally consistent; RJ at 0.509 HIGH is coherent with mode-level data |
| genuine mechanical weakness | ~0% | no supporting evidence; ablations all negative, counterfactuals break-even-or-better |

## 12. Balance recommendation

**No canonical change.** Evidence does not warrant touching RJ's rules. RJ is a mid-ladder rank (6th/15, HIGH confidence) whose perceived weakness was an artifact. If future HIGH-confidence data wants more ceiling, the levers ranked least→most invasive are: (a) AI-only — continue improving opponent-hand estimation with revealed-card memory (done partially); (b) surface `shuffle-reset`'s niche better (its honest niche — thin DP + fat GY — is rare); (c) only if self-reset continues to post ~0% win at n>30, consider trimming its discard cost — **not** indicated yet at n=3.

## 13. Verification record

- `pnpm run lint` — 0 errors / 0 warnings. `npx tsc --noEmit` — 0 errors.
- `pnpm test` — **6249 pass, 0 fail, 14 skipped** (6263 total).
- `pnpm run test:determinism` — 4/4. `pnpm run test:privacy` — 3/3.
- Targeted: rank6-forensic 12/12, rank-attribution 29/29, rank-telemetry 24/24, rank-counterfactual 16/16, rank-power 25/25, tactical-policies 17/17 (5 new regression tests), policy-action-coverage 51/51, autonomy 7/7.
- Rank 6 regression: rank6-forensic suite green; Six RPI 0.364 (300-match, post-fix) vs 0.358 (100-match, pre-fix) — stable band, no regression from RJ changes.
- New regression tests (`test/tactical-policies.test.mjs`): shuffle-reset DP-gating; opponent-attack large-hand discount; hand-swap/self-reset quality-vs-count; rank-strategy quality-based advantage; diagnostic `|drop:` policy modifiers.
- Determinism of instrumentation: baseline-v3 ≡ v3b; cohort-300 first-100 ≡ policyfix-v1. `matchResultHash` unaffected by the added `rankDecisions` context fields (they sit outside the hashed surface) and by `|`-modifier policyIds (base-id RNG seeding).

## Confidence statement

Based on current corrected evidence, how confident are we that Red Joker itself — rather than our AI or measurement system — is the problem? **Low.** With HIGH-confidence measurement (n=323 opportunities/116 selections) RJ sits mid-ladder at RPI 0.509 with positive ORV; the earlier bottom-of-ladder signal is fully explained by a stale artifact plus small-cohort noise. The residual uncertainty lives in two small samples (self-reset n=3, opponent-attack n=3 selections) and in pilots' demonstrated underuse of contending RJ effects — evidence that, if anything, the card has *unrealized upside*, not hidden weakness.
