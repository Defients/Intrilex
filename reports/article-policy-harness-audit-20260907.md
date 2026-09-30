# Intrilex article pilot: harness audit and bounded empirical result

## Status and scope

The **primary matrix is complete**: 16 same-seed AB/BA pairs for each of the ten unordered matchups among score-rush, tempo, control, value, and existing hybrix-rusher-hard, totaling **320 cross-policy games**. There are also **28 diagnostic mirror games**, not the originally intended 80. The overall expanded protocol is therefore incomplete. The generated completion RESULTS.md heading says "Completed", but its line 5 correctly says `Complete: false`; interpret completeness at the primary-matrix level only.

The experiment uses only `core-advanced-authority`, fixed seat/player labels P1/P2, reversed policy assignments for BA, no optional modules, and an 1800-decision cap. The initial and completion cost gates were reached; neither was a gameplay failure. First execution: 216 study games. Continuation: 104 missing primary games plus 28 mirrors. A cost-only scope reduction was announced before the first study outcome table was examined. No optional 32-seed expansion or unrestricted-profile sensitivity was performed. No profiles were pooled.

There were 12 additional explicit preflight match executions: replay-verified isolated repeated mirrors for all five policies (10 executions), and a same-run-instance HYBRIX mirror cache probe (2 executions). All passed. Focused tests execute additional fixtures and are not included in these study/preflight totals.

## Artifact map (repository-relative)

- Original experiment: `reports/article-policy-pilot-20260907.mjs`.
- Cost-only continuation: `reports/article-policy-pilot-completion-20260907.mjs`.
- Read-only artifact verifier: `reports/article-policy-pilot-verify-20260907.mjs`.
- Original directory: `reports/article-policy-pilot-20260907T203340644Z/`.
- Combined-result directory: `reports/article-policy-pilot-completion-20260907T204650571Z/`.
- Authoritative combined study rows: combined-result directory's `combined-study-raw-matches.jsonl` (348 rows, excluding preflight).
- Tables and detailed diagnostics: combined-result directory's `RESULTS.md` and `summary.json`.
- Each raw row names `sourceDirectory` and `decisionsFile`; full selected-decision records are retained in `decisions-*.json.gz` across the two directories.
- Preflight replays: original directory's `replay-*.json.gz` (10 files).
- Seeds and planned spec list: original directory's `protocol-and-seeds.json`; continuation's `completion-protocol.json` records remaining planned matches and scope amendment.
- Version/config/policy metadata: `metadata.json` in each directory.
- Before/after local input hashes, local diff, git status and artifact hashes are preserved in those directories.
- Focused test log: original directory's `focused-tests.tap`, lines 268-275 (53 tests, 53 pass, 0 fail).
- Independent verification: `reports/article-policy-pilot-verification-20260907T210123446Z.json` (PASS).

## Harness audit findings

1. **Do not use native campaign AB/BA labels as evidence of same-seed role balancing.** `packages/simulation-runtime/src/campaign.mjs:48-55` changes player-label seat order but keeps `policyIds: pair`; it derives the seed separately from each ordinal. `packages/simulation-runtime/src/runtime.mjs:282,375-383` assigns policy by seat index, while `runtime/autonomy-engine-dist/src/core-autonomy.js:397-399` and `runtime/autonomy-engine-dist/src/core-authority.js:83-93` initialize the first actor from seatOrder[0]. Thus policyIds[0] remains the first-seat policy even on the wrapper's purported swapped games, and the paired games do not share a seed. This pilot bypasses `runCampaign`, fixes seatOrder, and actually reverses policyIds. Experiment construction: original script lines 46-58; verification: verifier lines 24-31.
2. **Native campaign self-play denominator is unsuitable for mixed mirror/superiority aggregates.** `campaign.mjs:166-169` increments games twice for the same policy in a mirror but selfPlayGames once; lines 202-206 subtract only selfPlayGames. One phantom cross-policy exposure remains per mirror. Its winRate and Wilson denominator also differ when draws/aborts occur. This pilot never calls `campaignAggregate`; mirrors and cross-policy groups are separate.
3. **Single-match runner is usable with explicit gates and accounting.** `runtime.mjs:276-310` defines limits, seed normalization and provenance; lines 337-348 handle terminal/unsupported frames; lines 376-398 validate policy selection and engine acceptance; lines 489-507 retain action, score, RNG and HYBRIX diagnostics; lines 545-588 report ending scores, turns, participants, counters, compliance and errors. Replay verification at lines 610-613 compares verified replay state against the summary final-state hash.
4. **These policies are heuristic implementations, not validated human-meta agents.** `packages/policies/src/index.mjs:10-21,34-37` chooses the largest hand-weighted score. `packages/policies/src/scoring.mjs:7-20,102-152` contains the family weights and lexical tie-breaking. Policy definition hashes (`packages/policy-sdk/src/contracts.mjs:61-63`) include choose.toString() but not imported helper implementations; retaining source hashes is necessary.
5. **HYBRIX's observed memory nudges are not proof of opponent learning.** The chosen existing rusher-hard is declared in `packages/game-ai/src/policy-adapter.mjs:125-129`; adapter lines 55-93 call choose and manage match/actor caches. Agent lines 268-312 layer board, goals, personality, rank and memory scores, then record the agent's own selected action with outcome `pending`. The adapter does not call `recordEnemyAction` or `notifyOutcome` (those methods are defined at `agent.mjs:188-203`). Memory-pattern/nudge implementation: `packages/game-ai/src/memory.mjs:37-133`. Unique runInstanceIds isolate all study executions. Repeated isolated and native-cache preflight probes passed; no cache failure was observed.
6. **Loaded runtime, not TypeScript source, is authoritative for these measurements.** `packages/engine-adapter/src/adapter.mjs:7-30` imports `runtime/autonomy-engine-dist/src`; lines 67-70 expose the profile/version labels. The existing build script (`scripts/build-engine-patch.mjs:6-12`) compiles upstream and replaces runtime, so it was deliberately not run. Exact comparison found 114/114 runtime source-directory artifacts equal to local upstream dist; see original `runtime-upstream-dist-parity.json:2-4`. Dirty TypeScript source was hashed and its diff preserved, but no fresh compile/transpile equivalence certification was attempted. The loaded runtime visibly contains the preexisting setup/deck changes and Super Ace/three-red counter target restrictions (`core-authority.js:49-76,796,854`, `core-autonomy.js:399`, `core-response.js:103-117`). The engine label alone is not a clean-release identity.

## Snapshot and validation

Git HEAD: `c43edb98ac5de59111d8ae2b86c80a9493d44af3`. Node: v22.14.0, Windows x64. Labels: product 1.0.0, rules 4.3.1, engine 4.2.6.

The original and final input-inventory SHA-256 is `86b41e1cc47fe4882250584bd28eda8b9e256004996d1dc9458d63d29f978ae2`. All **430 inventoried inputs** remained identical. The verifier also checked **395 preserved artifact hashes**, all **8788 study decision records**, summary counter reconciliation, absence of duplicate study specs, and **160 complete same-seed AB/BA clusters** (10 matchups times the same 16 distinct seeds).

Selected loaded-runtime hashes (full inventory retained):

| File | SHA-256 |
|---|---|
| runtime/autonomy-engine-dist/src/engine.js | c97e4510f4644cb506dd652c6f8a240952cd28ddb8c290ffdd0e2d95631cc984 |
| runtime/autonomy-engine-dist/src/core-authority.js | 40c2a5f9e79040b3842466cf293733559dad82c0c80245f7648271f9aba13c32 |
| runtime/autonomy-engine-dist/src/core-autonomy.js | be23db645b94ea4df35320232d5e36473dafc46a6051fc53a779f0d4f0a24ca0 |
| runtime/autonomy-engine-dist/src/core-response.js | 0b4cc031ca26573bf8373a83c9781c442ab9be6da6bfb855dd38cb4d174f983c |

## Primary results

Each row is 32 games in 16 paired seeds. Wins are for A, losses for B; there were no primary draws. Wilson95 is a **descriptive marginal interval**, not an independence-aware interval for paired games. Paired95 is a 10,000-resample percentile bootstrap of per-seed average win credit, retaining AB/BA together. Exact sign tests compare positive versus negative seed contrasts, omit split/tied contrasts, and have a supplementary Holm adjustment across all ten matchups. The same 16 seeds are reused across matchups, so pooled match counts must not be treated as independent replications.

| A | B | A-B | A win % | Wilson95 descriptive | Paired95 | Sign p | Holm p |
|---|---|---:|---:|---|---|---:|---:|
| score-rush | tempo | 18-14 | 56.3 | 39.3-71.8 | 43.8-68.8 | 0.625 | 1 |
| score-rush | control | 28-4 | 87.5 | 71.9-95.0 | 75.0-96.9 | 0.000488 | 0.00439 |
| score-rush | value | 18-14 | 56.3 | 39.3-71.8 | 50.0-65.6 | 0.500 | 1 |
| score-rush | hybrix-rusher-hard | 17-15 | 53.1 | 36.4-69.1 | 40.6-65.6 | 1 | 1 |
| tempo | control | 28-4 | 87.5 | 71.9-95.0 | 75.0-96.9 | 0.000488 | 0.00439 |
| tempo | value | 13-19 | 40.6 | 25.5-57.7 | 28.1-53.1 | 0.375 | 1 |
| tempo | hybrix-rusher-hard | 11-21 | 34.4 | 20.4-51.7 | 18.8-50.0 | 0.180 | 1 |
| control | value | 6-26 | 18.8 | 8.9-35.3 | 6.3-34.4 | 0.00635 | 0.0444 |
| control | hybrix-rusher-hard | 2-30 | 6.3 | 1.7-20.1 | 0.0-15.6 | 0.000122 | 0.00122 |
| value | hybrix-rusher-hard | 16-16 | 50.0 | 33.6-66.4 | 34.4-65.6 | 1 | 1 |

Full unrounded numbers, mean ending scores, signed score margins, mean full turns, policy decisions and per-seat wins are in combined summary.json. Human-readable score/turn/decision table: combined RESULTS.md lines 9-18.

## Diagnostics and behavioral contrast

- Primary: 320/320 NORMAL_VICTORY, 0 caps, 0 invalid/error matches, 0 rejected commands, 0 recorded compliance violations; 7730 policy decisions, 26403 engine commands, 2654 completed full turns, maximum 92 decisions per game. First-seat wins 161, second-seat wins 159; this is descriptive, not a global seat-balance certification.
- All study games including partial mirrors: 348 canonical, consisting of 347 NORMAL_VICTORY and 1 CANONICAL_DRAW; 0 caps/invalids/errors/rejections/compliance violations. 8788 policy decisions, 30012 commands, 3044 completed full turns; maximum 142 decisions against cap 1800.
- Mirrors are small and incomplete: score-rush 4-2 P1/P2 wins (n=6); tempo 2-4 (n=6); control 3-2 with 1 draw (n=6); value 4-1 (n=5); HYBRIX 3-2 (n=5). Control mirrors averaged 46.83 turns, versus 4.00-6.33 for the other observed mirrors. Do not infer a first-player effect from these small, shared-seed samples.
- No nonfinite candidate scores or failsafe triggers were observed. HYBRIX recorded 2 difficulty-error/non-top selections in 1357 primary decisions, including one legal selected action outside its retained top-eight scores; these were not invalid engine actions.

Primary-only family counts (all policies have 128 participant-game exposures, but not independent observations):

| Policy | Decisions | score | draw | ordinary scuttle | swap-bar |
|---|---:|---:|---:|---:|---:|
| score-rush | 1275 | 471 | 79 | 0 | 0 |
| tempo | 1422 | 432 | 114 | 0 | 0 |
| control | 2374 | 39 | 391 | 189 | 13 |
| value | 1302 | 464 | 85 | 0 | 0 |
| hybrix-rusher-hard | 1357 | 448 | 45 | 0 | 208 |

These are selected family counts, not opportunity-adjusted causal estimates; instant/quick scuttling is in other families. HYBRIX had nonzero adaptive nudges in **904/1357** primary decision traces. Control's much lower scoring frequency and longer games are consistent with a scoring/closure weakness in this implementation. They do not identify which single weight caused its losses.

## Strongest legitimate interpretation

On this exact dirty runtime snapshot and bounded default profile, the existing **control heuristic underperformed each of the four tested alternatives**, with paired exact signs remaining below 0.05 after the supplementary ten-comparison Holm correction. This is evidence to investigate the policy implementation/weights, not a reason to change canonical game rules or conclude that control strategies are inherently weak.

The pilot does **not** establish a robust ranking among score-rush, tempo, value and HYBRIX. HYBRIX's 21-11 result against tempo is exploratory (paired sign p about 0.180), and it went 15-17 against score-rush and 16-16 against value. Its nonzero nudge traces demonstrate exercised machinery, not a causal benefit from adaptation. There is no evidence here about human play or unrestricted/full-rules balance.

## Commands and changes

Commands included read-only git rev-parse/status/diff and directory verification; no build, install, generation, canonical replay regeneration, gameplay edit, or existing artifact overwrite was performed.

Executed checks/runs:

```text
node --version
node --test --test-reporter=spec packages/policies/test/smoke.test.mjs packages/simulation-runtime/test/smoke.test.mjs test/scoring-sensitivity.test.mjs test/hybrix-evidence-envelope.test.mjs test/autonomy.test.mjs
node --check reports/article-policy-pilot-20260907.mjs
node reports/article-policy-pilot-20260907.mjs
node --check reports/article-policy-pilot-completion-20260907.mjs
node reports/article-policy-pilot-completion-20260907.mjs
node reports/article-policy-pilot-verify-20260907.mjs
```

The initial experiment also reran the same five focused test files with `--test-reporter=tap` to preserve the log (53/53 pass). Both simulation commands returned nonzero because their explicit wall-time budgets were reached, not because of match failures. The artifact verifier returned zero/PASS.

Only new report scripts/artifacts and this audit note were created. One import path in the newly created initial experiment script was corrected before its first execution; no preexisting source or report file was edited. All scripts use exclusive creation for experiment output. The source-tree and raw-artifact verification found no drift.

Parent follow-up: use the completed primary matrix with the stated limits; do not call the 80-game mirror plan or unrestricted sensitivity complete. Keep the old campaign wrapper/aggregate issues separate from this new paired evidence. If future implementation work is authorized, add focused regressions for actual role-swapping, identical AB/BA seed assignment, and mirror denominator exclusion before changing those harness utilities.
