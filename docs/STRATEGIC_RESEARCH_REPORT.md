# Strategic policy and Arena research report

Date: October 3, 2026, America/New_York. Starting HEAD: `a3e8557296ccfa8f59c73ff2ae9aa6897fc5d801`. Scope: local implementation and evaluation in `Intrilex_dev-current`.

**TL;DR:** The scatter defect is fixed; exports carry scientific context; scoring opportunities, follow-ups, and terminal semantics are inspectable; a separately frozen Control successor and multi-master-seed round robin work in Node and the browser. In the final 3,000-game holdout, old Control scored 24.0% against Score Rush and the successor 47.0%. The successor improved against all three other archetypes, but its action distribution moved substantially toward Score Rush. This is evidence of a stronger implementation with a remaining identity question. No core rules changed.

## 1. CURRENT-STATE FORENSICS

The pre-implementation map is [STRATEGIC_RESEARCH_FORENSICS.md](STRATEGIC_RESEARCH_FORENSICS.md). It connects registry, legal enumeration, strict policy views, scoring, response/advanced families, authority terminal rules, evidence, AB/BA orchestration, uncertainty, persistence, and chart export to their source and tests.

* **Version discrepancy:** the current tactical implementations were already **4.0.0**, although Arena displayed “v3”. The UI now shows the registry/checkpoint version. The supplied 2,222-game observation cannot be attributed to an exact implementation without its original artifact. Existing tactical IDs and versions were preserved.
* **Verified scoring mechanism:** Control's ordinary nonterminal score baseline was 650 + 12 per point, whereas scuttle started at 1,080 before target/removal bonuses. Other optional effects also received substantial family offsets. This rewards investment before comparing concrete progress on a common scale. It does not prove that every historical loss shares that cause.
* **Existing competence:** goal-reaching overrides, opponent-pressure heuristics, private-choice evaluators, and resource/response logic already existed. Terminal blindness, private-choice bugs, tie-break bias, and game-rule imbalance were not established.
* **Historical boundary:** the request supplied aggregate observations, not the original raw artifact. Exact historical negative-margin wins, length bins, and confidence evolution remain unverified.

## 2. ANALYTICS FIXES

`apps/lab-web/src/evolution/evolution-analytics-model.mjs` replaces fixed-stride scatter sampling with deterministic sampling stratified by **seat × termination × outcome**. Proportional quotas preserve both orientations and approximate outcome/terminal proportions; each stratum gets representation when the budget permits. Hash priorities remove periodic grouping aliasing. The regression with 2,222 alternating records produces 300 points, **150 AB and 150 BA**. Full statistics continue to use all accepted records. A budget below the number of strata cannot represent every stratum; that mathematical limit is explicit.

`evolution-analytics-charts.mjs` adds semantic chart IDs, exact metric names, denominator descriptions, scientific context, and bounded raw-data metadata to SVGs. Arena exports include run/checkpoint IDs, actual versions, rules profile, filters, accepted counts, and implementation fingerprint. Matrix exports additionally identify master-seed packs. Raw metadata beyond 300 rows is explicitly truncated; the full artifact remains authoritative. Download names include semantic identity and timestamp. Tooltips and tables expose observed opportunities, selected actions, percentages, and filtered game/decision counts.

Terminal diagnostics classify `HIGHER_SCORE`, `LOWER_SCORE`, `EQUAL_SCORE`, and `NOT_APPLICABLE`, separately from `EXPLAINED`, `UNVERIFIED`, and `UNEXPECTED` rule-evidence status. Normal victory uses the winner's own Goal; exhaustion compares active untapped Anchors before points; Sudden Death identifies its activator event. Missing historical facts remain unavailable. The diagnostic is an evidence check, not a substitute for replay verification.

Cross-filters cover winner, policy, seat, termination, relation, margin, turn count, decision count, and displayed ordinal range. They produce read-only projections; neither saved records nor execution configuration changes.

## 3. CONTROL SUCCESSOR

**Control Conversion Tactical 5.0.0**, ID `control-conversion-tactical`, lives in `packages/policies/src/control-conversion.mjs`. It is independently registered and frozen, with `researchOnly` admission so ordinary New Match defaults/personality cards retain their existing choices.

The successor replaces generic family affinity with a common value scale for nonterminal ordinary decisions:

| Component | Current heuristic |
|---|---|
| Common baseline | 700 |
| Own gain | 85 per point; 100 under public opponent threat |
| Opponent material denied | 115 per point; 155 under threat |
| Own board loss | −100 per point |
| Option utility | Existing evaluator utility, clamped to ±1,600, multiplied by 0.65 |
| Material spent | Existing cost × −14; × −2 for scoring; −150 per extra spent card |
| Declined scoring opportunity | −8 per available point for material denial; −20 otherwise |
| Cash window | +120 for scoring while ahead or tied |
| Own Goal progress | Up to +180 according to gain / remaining Goal gap |

Threat means public remaining opponent Goal gap ≤11 and positive opponent hand count. These numbers are transparent heuristic coefficients, not calibrated expected values. The successor retains old Control's terminal overrides, response handling, private-choice decisions, and specialized free-resource branches. Ties still use the existing lexical action-ID rule.

Conversion debt is **implicit opportunity/material cost**, not a mutable decision countdown. There is no seed-specific behavior, hidden opponent-hand input, persistent per-game cache, or training hook. Additional denial has value when it removes public material/options; low-yield generic manipulation loses its automatic baseline advantage. This is a one-step evaluator, not search or a learned future-value model.

Control identity has two kinds of evidence. Mechanistically, denial remains more valuable than raw gain, response tools remain preserved, and a real-shaped fixture chooses material denial where Score Rush chooses scoring. Empirically, the pooled holdout fingerprint is close to Score Rush. Stronger conversion is established; broad strategic distinctness is **not established** by those fixtures alone. The implementation should remain a research candidate pending matched-state evaluation.

## 4. STRATEGIC TELEMETRY

`packages/simulation-runtime/src/strategic-telemetry.mjs` is shared by Node and browser execution. Lightweight counters run in Arena; deep traces are optional. Captured decision data comes from the policy's strict authorized view and genuine enumerated legal actions:

* ordinal, actor, seat, turn, phase, mini-turn allowance, exact legal-action count and family set;
* selected action ID/family, public scores/differential/Goal gaps/threat;
* own hand count, opponent hand count, and public board-card counts;
* scoring availability, greatest known immediate score value, declined-score flag;
* optional actual candidate heuristic scores, bounded to the existing top-eight metadata;
* immediate own/opponent score deltas after an accepted declaration, separately labeled.

Counters expose immediate score acceptance, mean declined value, next positive public-score follow-up, global decision delay, three-decision net score swing, terminal censoring, family follow-ups, repeated control chains, control actions while ahead/tied/behind, and phase/threat acceptance. Postgame aggregation adds win associations for games containing declines and chains. Terminal type, seat, and length filters permit conditional comparisons.

**Interpretation:** a “deferred conversion” means a declined score opportunity was later followed by any positive own public score change. Several prior declines may share one later increase. It does not establish that the declined action produced that increase, nor require a subsequent `score` declaration. Delay counts global policy decisions, including the opponent's decisions. Control chains may span administrative `phase`, `response-decline`, and `private-choice` frames. Short three-decision windows at game end are censored, not scored as zero.

The tracker never places future winner/outcome fields into decision-time observations. It never reads hidden opponent card identities or deck order. Terminal Anchor diagnostics exclude face-down traps before reading rank. Tests use a restricted-view proxy, reject fabricated future trace fields, and enforce decision totals, opportunity = taken + declined, declines = followed-up + unconverted, and declines = observed horizon + censored horizon. Historical records lacking this telemetry show unavailable values; nothing is backfilled.

Not implemented: counterfactual expected payoff, per-action successor legal-option deltas, full component vectors in every trace, or a causal model. Resource retention here is own hand-count observation, not the estimated value of all preserved tools. These limits constrain what the charts mean.

## 5. ARENA / MATCHUP LAB

`packages/simulation-runtime/src/matchup-lab.mjs` freezes one checkpoint set and executes the same Node/browser orchestration contract. It supports 2–8 static policies, 1–16 distinct nonzero uint32 master seeds, even 2–10,000 games per matchup per master, named profiles, worker selection, and optional deep traces. It detects overlapping derived seed packs and prevents checkpoint substitution, duplicate series, and false complete-matrix claims.

Every seed runs AB/BA. Series are tagged **EVALUATION**; no policy update occurs. Matrix aggregation offsets ordinals only in ephemeral projections, leaving original records/hashes intact. Individual series, complete matrix payload, and content hash are saved. Imports validate scientific identity and original checkpoint/evidence contracts. An artifact with an older implementation identity can be inspected as historical evidence; it is not silently admitted to current execution. CLI output refuses an existing artifact/summary destination.

Per-matchup confidence uses the existing conservative **95% Hoeffding interval over complete seed-pair scores** (draw = 0.5). Faulted pairs do not enter that interval; their rows and the clean orphan game remain visible in raw totals. Aggregate archetype records are descriptive, without a pooled confidence interval: shared seed packs across opponents do not justify treating every archetype observation as independent. The ten per-matchup intervals are not simultaneous familywise intervals.

## 6. UI CHANGES

The existing research cockpit now has eleven Arena charts, including conversion/follow-up and terminal inspection. Existing action/opportunity surfaces show raw counts. Conditional chain details link to evidence inspection. A compact frozen-matrix section controls games, master seeds, profile, workers, and deep tracing; supports run/stop and export/import; shows completion/error state, checkpoints, seat results, fingerprints, and similarity. Matrix runs save their individual series to IndexedDB.

Execution is serialized with the existing cockpit, and cancellation cleans up the matrix controller. Historical matrix imports have a clear historical-state banner. Filter state stays separate from execution. Focusable SVG marks, existing table fallbacks, keyboard input, narrow-screen containment, and bounded scrollable raw diagnostic detail are retained. A real Chrome 154.0.8037.93 harness verified Node/browser workers, trace/terminal parity, unchanged artifact bytes under filters, exact SVG metadata, all ten browser matchups, import/export, keyboard focus, and a 390px viewport.

## 7. VALIDATION

| Check | Result / evidence |
|---|---|
| Initial scientific baseline | PASS, 141/141; `reports/local/strategic-baseline-tests.log` |
| Stable scientific pass | PASS, 171/171; `strategic-scientific-final.log` |
| Complete `pnpm test` | PASS, 5,385 total; 5,371 passed; 14 skipped; zero failed; 95 suites; `strategic-full-tests-final.log` |
| Final focused analytics/research tests | PASS, 34/34 after the final UI metadata and fixture changes; `strategic-final-focused.log` |
| Real-browser harness | PASS, four scenarios; `strategic-browser.log`, `strategic-browser/report.json` |
| Build | PASS, `pnpm run build` after final UI edits |
| Type checks | PASS, `pnpm run typecheck`, including configured client project; `strategic-typecheck-final.log` |
| Lint | PASS, zero errors, 422 warnings against the existing ceiling of 424; `strategic-lint-final.log` |
| Changed-file lint | PASS, including `.mjs` UI/CLI/browser/test files not all included in root lint |
| Diff whitespace | PASS, `git diff --check` |
| Independent authority replay checks | PASS, one lower-score exhaustion win, one lower-score own-Goal win, and the holdout decision-limit game; `strategic-terminal-verification.json` |

The 25 new research tests plus nine analytics tests exercise pairing, the 2,222-row alias regression, deterministic/rare-stratum sampling, raw denominators, SVG identity, all terminal semantics, successor registration, restricted decision-time input, accounting, round robin, immutable filters/history, and exact Node/browser command/result/trace parity. A 36-ranking golden fixture was generated from the starting Git source across nine contexts. Legacy `tactics.mjs` and `action-evaluation.mjs` remain unchanged; all prior tactical scoring branches remain intact. The frozen evaluation suite was not expanded implicitly. New tests are registered in `package.json` and `scripts/ci.mjs`.

Two existing deployment-test fixtures omitted their already-required `scripts/lib/write-with-retry.mjs`; their fixture copies were corrected, with no production deployment change. An initial broad test attempt also overlapped edits to fingerprinted source, correctly causing identity mismatch failures. Source was then held stable for the successful full run. Final UI-only changes were followed by a rebuild, focused tests, changed-file lint, and real-browser rerun. Test-generated sample Observatory files were restored to their clean starting contents.

Performance evidence and its limits: baseline 100-game old-Control/Score-Rush execution ran at 1.26 games/s; the same outcomes after telemetry ran at 1.37 games/s. Concurrent load makes this unsuitable for estimating a speed improvement. The final four-worker matrix ran 3,000 games in 586.05 seconds (**5.12 games/s**), including series orchestration and artifact writes. A separate rotated-mode benchmark used the same ten independent AB/BA seeds in each mode, three repetitions (60 executions per mode), and four warmup games in one process. Throughput was **3.279 off / 3.294 light / 3.216 deep games/s**; light was effectively unchanged within measurement noise, and deep was about 1.9% slower in this small sample. Exact match hashes, final hashes, and commands were identical in every mode. Strategic JSON averaged **1,536 bytes/game light**, **30,922 bytes/game deep** (about 20 times larger). See `reports/local/strategic-throughput-final.json` and its reproducible local script. The small benchmark is a cost check, not a statistical performance certification. Large deep traces and long manipulation chains deserve separate stress profiling. The new evaluator scans available score actions per candidate; worst-case ranking overhead grows with legal-action count.

## 8. EXPERIMENT RESULTS

The primary holdout uses frozen final-source versions, Advanced Core (`core-advanced-authority`), **master seeds 170003, 190003, 230003**, 100 games per matchup per master, four workers, and lightweight telemetry. Five policies × ten matchups × three masters = **3,000 accepted records**. There are 2,999 clean outcomes, four draws, and one decision-limit fault. Control successor has no holdout faults. Every ordinary cell has 150 complete seed pairs; Tempo–Value has 149.

The 600-game pilot used different masters and an earlier implementation identity. It remains separately saved under `reports/local/strategic-smoke-600`; it is not pooled with the holdout. No performance coefficients were tuned to individual holdout outcomes. The final source fixed duplicate own-loss charging before the independent holdout; this mechanical correction is represented by the final identity.

All scores below belong to the **first policy listed**; wins/draws/faults use raw clean records, while paired scores use complete pairs only. Mean turns here follow the preserved `record.turns` counter; Arena's existing event-qualified inclusive full-turn chart can differ by the terminal turn.

| First policy | Opponent | Wins–losses–draws | Paired score | 95% bounds | Mean A−B points | Mean turns |
|---|---|---:|---:|---:|---:|---:|
| Old Control | Control Conversion | 91–209–0 | 30.3% | 19.2–41.4% | −10.85 | 25.30 |
| Old Control | Tempo | 92–204–4 | 31.3% | 20.2–42.4% | −9.37 | 30.75 |
| Old Control | Value | 84–216–0 | 28.0% | 16.9–39.1% | −10.90 | 26.25 |
| Old Control | Score Rush | 72–228–0 | 24.0% | 12.9–35.1% | −11.73 | 19.50 |
| Control Conversion | Tempo | 164–136–0 | 54.7% | 43.6–65.8% | +3.14 | 17.77 |
| Control Conversion | Value | 163–137–0 | 54.3% | 43.2–65.4% | +1.92 | 15.41 |
| Control Conversion | Score Rush | 141–159–0 | 47.0% | 35.9–58.1% | −0.68 | 11.68 |
| Tempo | Value | 136–163–0 + 1 fault | 45.6% | 34.5–56.8% | −2.34 | 19.16 |
| Tempo | Score Rush | 115–185–0 | 38.3% | 27.2–49.4% | −5.05 | 13.69 |
| Value | Score Rush | 130–170–0 | 43.3% | 32.2–54.4% | −2.71 | 12.53 |

Old Control is weak against every tested comparator, not only Score Rush. The successor's scores against Tempo, Value, and Score Rush improve descriptively by 23.3, 26.3, and 23.0 percentage points. Its direct result against old Control is 69.7% (95% bounds 58.6–80.8%). Against Score Rush its three master-pack scores are 48%, 45%, and 48%. Parity, superiority to Tempo/Value, and statistical significance of every old-versus-new improvement are not established merely by those point estimates. No formal across-policy improvement test was added.

Descriptive pooled archetype scores over four opponents: old Control 28.4%, successor 56.4%, Tempo 49.5%, Value 53.9%, Score Rush 61.8%. These aggregate percentages include each policy's old/new-Control matchup and are not independent, universal ratings.

| Pooled behavior, clean games only | Old Control | Successor | Score Rush |
|---|---:|---:|---:|
| Score opportunities taken / observed | 269 / 15,286 | 6,210 / 9,182 | 6,063 / 8,217 |
| Score acceptance | 1.76% | 67.63% | 73.79% |
| Score declarations / all decisions | 0.64% | 21.21% | 23.67% |
| Control-family actions / all decisions | 30.13% | 10.72% | 10.29% |
| Declines later followed by positive own score | 8,656 / 15,017 | 2,699 / 2,972 | 2,024 / 2,154 |
| Mean global decision delay among those follow-ups | 23.39 | 9.15 | 6.45 |
| Effect-four / all decisions | 1.62% | 1.28% | 0.56% |
| Attachment / all decisions | 0.17% | 0.90% | 0.23% |

Successor/Score-Rush action-family total variation is **0.1099**, compared with old-Control/successor **0.3427**. There is no universal threshold turning these distances into “same strategy” or “faithful Control”. Different opportunity distributions and shorter games confound pooled fingerprints. More board-clearing/attachment use and tested same-state denial preference show differences, but the large convergence toward scoring remains a research concern.

Seat effects remain visible after correct pairing. Successor/Score-Rush wins are **54/150 (36%) when successor first**, **87/150 (58%) when second**. Against Value: 46.0% first, 62.7% second; against Tempo: 49.3% first, 60.0% second. Pairing averages orientation; it does not eliminate a real strategic seat effect.

Terminal totals: 2,873 normal victories, 122 exhaustion resolutions, four canonical draws, one decision limit. Of **50 lower-score wins**, 47 are explained by Anchor-first exhaustion and three by the winner reaching their own lower Goal. All 2,999 clean records are consistent with captured terminal evidence; there are zero `UNEXPECTED` cases. The fault is `UNVERIFIED`. This establishes the new run's explanations; it does not retrospectively certify the supplied historical anomalies.

Independent regeneration and authority-certified replay verified an exhaustion example (seed 4213525072, ordinal 92), an own-Goal example (seed 395878448, ordinal 54), and the decision-limit game. Regenerated record/result hashes and final states matched the originals. This is separate replay evidence for those three examples; the other lower-score wins have captured-event/Anchor/Goal evidence rather than individual replay certification. See `reports/local/strategic-terminal-verification.json` and the reproducible local check script.

The holdout fault is Tempo–Value, master 190003, derived seed **900309364**, BA ordinal 29, 1,800 decisions / 600 stored full turns. It is retained in the artifact and excluded with its pair from paired confidence. Its reproduced trace ends in repeated Voltage → phase → Value score → Tempo Voltage → phase → scuttle cycles, with public scores returning to 5–5 before new scoring attempts. Replay certification reproduces the authority state; it does not establish that this loop violates the written rules. The full diagnostic transcript/trace is `reports/local/strategic-holdout-limit-replay.json`. The pilot had three decision-limit records at another seed; those remain archived separately. Rules were not patched to erase these long games.

Primary evidence: `reports/local/strategic-holdout-3000/artifact.json` (full hashed matrix and original series), `summary.json` (statistics/behavior), individual `EL-*.json` envelopes, plus `matrix.svg`. Content hash: `46751a8e72e0e6ed4c129fef770b8c795fd7b16dea927d9a8e3ff0aca699246c`. Original identity, checkpoint versions, seed packs, and accepted counts are validated on read; final artifact identity matches the current implementation.

## 9. GAME-LEVEL BALANCE EVIDENCE

**Supported:** the old Control evaluator represents its strategic objective poorly enough to warrant a successor; conversion-aware changes improve its outcomes across multiple archetypes; Score Rush has the highest descriptive aggregate score; the successor converges substantially toward immediate scoring; meaningful seat differences persist; lower-score wins are legitimate in the inspected terminal cases.

**Not supported:** that denial itself is globally unviable; that all positional investment has negative expected value; that Score Rush dominates Value or the successor with resolved uncertainty; that optional action families are universally dominated; or that Intrilex needs a scoring nerf. Value/Score-Rush and successor/Score-Rush intervals both include 50%. Observational follow-ups cannot establish investment's counterfactual value.

Rule-level **investigation is justified**, especially seat/initial-access effects and reward for productive positional investment. A rule change is not justified by this evidence alone. No engine authority, rule profile, normal/alternate victory rule, or score economy was modified. The next evidence should compare choices under matched states and controlled interventions before attributing convergence to the game's economy.

## 10. REMAINING RISKS / NEXT EXPERIMENT

1. **Identity gate:** use matched authorized decision states to compare successor and Score Rush rankings, evaluate productive denial versus immediate scoring, and report opportunity-conditioned family differences. The current pooled fingerprint alone does not settle the Control-fidelity requirement. Preserve this 5.0.0 checkpoint; any subsequent behavioral change needs a new version.
2. **Causal gate:** preregister a replay-based intervention sample of score-declining positions, execute the legal scoring alternative from the same state with controlled RNG/policy continuations, and compare terminal outcomes. Label continuation-policy dependence and intervention effects precisely; do not relabel current associations as causal results.
3. **Sampling gate:** run at least five fresh disjoint master packs with 200 games per matchup per master (10,000 total), without tuning this candidate on those outcomes. Investigate the 36%/58% successor seat split and reproduce the retained long-cycle seeds separately.
4. **Historical gate:** import the original 2,222-game artifact to inspect its identity and anomalous rows. Current documentation must not silently declare its “v3” label equivalent to the verified current 4.0.0 source.
5. **Performance gate:** profile high-action-count and long-cycle matches separately. Deep traces increase retained data substantially; prefer lightweight telemetry for large matrices and selected deep diagnostic runs.

Reproduce in PowerShell from `H:\myProjects\Intrilex-MASTER\Intrilex_dev-current`:

```powershell
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run build
node scripts/strategic-research-browser.mjs
node scripts/strategic-matchup-lab.mjs --config config/strategic-matchup-holdout.json --out reports/local/strategic-holdout-repeat-3000
```

Choose a new output directory for every run. Use the Arena frozen matrix controls for the same browser workflow. This report describes local validation and saved evidence; remote CI and deployment were not executed.
