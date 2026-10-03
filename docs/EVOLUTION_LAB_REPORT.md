# Evolution Lab V1 Completion and Correctness Report

October 2, 2026 (America/New_York). **Status: VALIDATED_V1. Completion gate: PASS**, within the local experimental bounds below. This establishes validated software behavior and reproducible research bookkeeping, not stronger strategies, deployment approval or release certification.

## Repository and implementation identity

Canonical checkout: `H:\myProjects\Intrilex-MASTER\Intrilex_dev-current`.

- Starting clean HEAD: `e0aed7fbaeb6f4dfe3c85265c7da223347408eef`.
- Final HEAD: the same commit; this correction pass is an uncommitted working-tree change across 17 files. No commit, push, publishing or deployment was performed.
- Initial development foundation: `92d01cea128eae0b277cfa362bae15ba29b35ebb`.
- Previous implementation fingerprint: `82c311de78ed5109e47a874be39f259fdae6fa21896c7a1df29251bb97db8849` — STALE for current execution.
- Final implementation fingerprint: `fdf1e469f1da605551ff342c69d1bb0de0d8f85d6f00cfd668e04e5d82059ea8`.
- Engine/rules versions: `4.2.6` / `4.3.1`.
- Engine hash: `ed14dce8add4c6fa967aa9c470821a09c19975fb43ad36389ffa7640e38e413d`.
- Policy implementation hash: `c8313dbd31ab8031a3aef9db6c6768298c77ec12e3ba7fe304658644679d40f1`.
- Runtime hash: `074d10d49e33832f02596ed2e63ee9ad48e4d21911672efe14647643406a6ba9`.

Research/runtime changes intentionally changed compatibility. Old evidence and checkpoint IDs were preserved in their original artifacts; incompatible artifacts are inspected read-only. Current execution requires the new fingerprint. The original report was preserved byte-for-byte as `EVOLUTION_LAB_REPORT_INITIAL_V1.md` before this report was replaced. Its 220-game proofs, 37-test gate and 11-browser-scenario gate are historical, not current validation.

## Reproduced defects, repairs and regression evidence

Six initial regression tests produced **1 PASS / 5 FAIL** before implementation. The five failures covered the four audit defects plus unsafe public selection scores. Controlled adapters in these tests exercise orchestration contracts; they are not scientific game results. Evidence: `reports/local/evolution-v1-completion-red.log`.

| Defect | Before | Repair and verified behavior |
| --- | --- | --- |
| Weak evaluation admission | Recomputed hashes admitted invalid scores, unknown opponents/policies, malformed digests and unresolved execution references | Shared validators enforce finite bounded metrics, count/rate/interval consistency, purpose/pack/suite identity, ordered unique opponents, completion coverage, behavior telemetry and execution references. New-result and cached-result paths use the same contract. Public selection separately rejects NaN, Infinity and scores outside [0,1]. |
| Historical-error status poisoning | Completed required evidence plus a historical ERROR produced ERROR without executing a retry | Required-work completion determines final status. A failed required stage remains ERROR; a successful retry reaches COMPLETE while preserving failed attempts and structured faults. |
| Skipped regression finalization after committed selection | Resume completed held-out games but omitted three expected regression findings | New and previously committed selections use one repeatable finalization path. It evaluates the frozen selected child, compares historical references, appends deterministic findings and deduplicates them before advancement. Resume/repeat preserves selection IDs and finding IDs. |
| Cartesian checkpoint comparison | Two repeated five-opponent evaluations produced 20 rows; a stopped partial attempt could enter comparison | Comparison selects the latest complete appended held-out attempt per checkpoint/pack/suite. A repeated five-opponent comparison yields five attributable rows. A partial-only result is unavailable; a later partial does not erase the prior complete result. |

Additional coverage rejects rewritten generation rankings and regression deltas even after hash recomputation; validates proper reference/provenance round trips; tests cancellation at selection commit and persistence-failure recovery; preserves historical archives without execution admission; verifies missing telemetry versus observed zero rates; and confirms profiling leaves actual game evidence unchanged. The 13 new tests are registered in `package.json` and the Evolution stage of `scripts/ci.mjs`.

## Validation, evidence provenance and historical inspection

Project validation recomputes selection ranking/disqualifications from referenced TRAINING evaluations and validates regression IDs against their actual held-out matchup deltas. Manual frozen-suite writers register run and evaluation references before persistence. Clones clear derived evaluations, generations, faults and regression findings. Complete attempts are cached; stopped/error attempts remain inspectable history and are retried when required.

Run references establish relationships, not the existence of external files. An import checksum establishes integrity of a claim, not authenticated authorship or independent reproduction. Imports remain marked unverified. Read-only archive inspection verifies the original envelope/checkpoint identities, retains exact content, exposes current-contract diagnostics and permits export without admitting execution or inventing missing references.

## Training, retry and generation finalization

The existing deterministic `(1 + lambda)` weighted-heuristic strategy remains bounded. TRAINING selects; disjoint frozen EVALUATION measures the committed result. Historical errors cannot permanently poison a completed project, and successful held-out recovery cannot select another descendant. Failed required work is diagnostic and prevents completion until retried.

Finalization checks baseline, parent and strongest prior selected ancestor on matching held-out evidence. Findings retain candidate/reference/evaluation/opponent/pack identities and descriptive uncertainty. Repeated finalization adds no duplicate findings. Semantic reproduction now includes normalized regression finding IDs, along with checkpoints, generation records, evaluations and ancestry.

## Dashboard additions

- Bot cards identify lineage/generation, checkpoint/policy version and frozen opponent score vector.
- TRAINING selection means show named-opponent count, source-game count and disqualification count. They are explicitly labeled selection fitness.
- Measured family/mechanic changes compare the frozen control opponent and matching held-out pack against A0/B0, with before/after game and candidate-decision sample sizes.
- Parameter/mutation details remain separate from behavioral observations. Rank, suit and direct resource-expenditure telemetry remain unavailable.
- A readable regression table shows candidate/reference, opponent, paired-score change and uncertainty; full diagnostics retain exact identities.
- A latest A/B behavior table complements the existing frozen control trend. Missing evidence produces an unavailable state/gap.
- Current phase, candidate, generation, opponent progress, attempts/failures, throughput, pack and state remain visible during execution. Experiment type is displayed explicitly.

Native keyboard-accessible controls and live status remain available. Real Chrome validation exercised narrow layout, persistence failures, route cleanup/stale workers and ordinary human-versus-AI startup. Final desktop/mobile training screenshots were inspected; narrow-layout checks found no horizontal page overflow.

## Final validation gates

| Gate | Status | Exact result |
| --- | --- | --- |
| `pnpm run build` | PASS | Final build completed before final full/browser/reproduction gates; no overlapping rebuild |
| `pnpm run test:evolution` | PASS | 50 tests, 50 passed, 0 failed, 0 skipped; 66.983 s |
| `pnpm test` | PASS | 5,268 tests, 95 suites; 5,254 passed, 0 failed, 14 skipped; 226.437 s |
| `pnpm run test:evolution:browser` | PASS | 13 scenarios passed, 0 failed, 0 page errors; Chrome 154.0.8037.93 |
| `pnpm run lint` | PASS | 0 errors, 422 existing warnings |
| `pnpm run typecheck` | PASS | Root and client TypeScript checks |
| `git diff --check` | PASS | No whitespace errors |
| Worker-count reproduction | PASS | Identical normalized scientific results with workers 1 and 4; four concurrent held-out workers exercised |
| Browser-to-Node reproduction | PASS | Final browser artifact reproduced through shared Node trainer |
| Completed/new-path resume | PASS | Zero new games; unchanged semantic results; all available referenced files copied |
| Committed-selection browser recovery | PASS | Selection and nonempty regression findings survive stop/reload/resume/repeat |
| Local preview | PASS | Requested port restored; finalized built entry scripts verified at localhost:4173 |
| Remote CI / deployment / release certification | NOT_RUN | Outside this pass |

The 14 skips are one unavailable legacy vendor-4.1 corpus check and thirteen service-worker checks skipped by the existing PWA kill switch. They are SKIPPED, not passes.

The first full-suite attempt had 5,253 passes, 1 failure and 14 skips: an existing multiplayer journey exhausted its first-listed-action loop without ending. A separate diagnostic hit a randomly selected Windows-reserved port. The fixture now lets the OS allocate ports, prefers actual legal scoring/draw/decline actions for its terminal-persistence journey and asserts authoritative terminal state with useful failure context. Replay/persistence/spectator/restart assertions remain intact. Three consecutive standalone runs passed both tests; the subsequent full suite passed. The failed attempt and diagnostic logs remain preserved. This repair changes the test fixture only, not multiplayer rules or production handlers.

## Fresh reproducibility evidence

Identical scientific configuration and experiment name were used with workers 1 and 4:

```powershell
node scripts/evolution-train.mjs '--name=Evolution V1 Completion Proof' --generations=2 --candidates=1 --training-pairs=1 --evaluation-pairs=2 --seed=1337 --evolution-seed=31091 --step=1000 --workers=1 --out=reports/local/evolution-v1-completion/worker1.json
node scripts/evolution-train.mjs '--name=Evolution V1 Completion Proof' --generations=2 --candidates=1 --training-pairs=1 --evaluation-pairs=2 --seed=1337 --evolution-seed=31091 --step=1000 --workers=4 --out=reports/local/evolution-v1-completion/worker4.json
```

Each completed with **190 actual games, 4,496 policy actions, four generation records, nine checkpoints, thirteen evaluation results, 65 validated run files and 147 verified retained transcripts**. Reuse of complete training evidence reduced execution below the nominal 200-game uncached budget. All slim game records remain in the companion files. Zero replay verification errors occurred.

Normalized checkpoint/generation/evaluation/ancestry/regression identities match exactly. Semantic hash: `0eedff8bb00f2f020e5f574096be27043133c0c83a7a8b08aa5b3e2599eed4f5`. This particular configuration produced no descriptive regressions; the nonempty-regression case is covered by the real browser recovery and cross-runtime artifact below. A2 retained zero residual weights; B2 retained risk=1000, with other residuals zero. This describes selected parameters, not a claim about strength.

The final browser adaptive artifact reproduced in Node with one worker, five checkpoints and two generation records. Semantic hash: `e0175d436690468f956dab1224ab32e39dc297d2ea7fadf78c3a05fb3ddf2249`. Its semantic comparison includes nonempty regression evidence.

Completed worker4 resume to `resumed.json` executed **zero games**, retained the same four generation records and semantic hash, appended no findings, and copied **all 65 referenced run files byte-for-byte**. `missingPriorRunEvidence` is empty.

Browser recovery stopped immediately after a committed selection was persisted. Reload/resume preserved that generation record, completed the other lineage and held-out/regression work, then repeated completion without changing findings. Finding `RG-c91000dcec4d82e7ed23d3db11d36845abe1fe801c942bf9721df0bf0e3f967b` remained identical and unique. Fault injection used to exercise browser retry is explicitly separate from real game-result evidence.

## Bounded behavior-change example

The fresh browser example uses a single held-out seed mirrored into two games per opponent. A1 selected tempo=-1000; B1 retained zero residuals. Against the same frozen control pair:

| Measurement | A1 | B1 |
| --- | ---: | ---: |
| Clean held-out games | 2 | 2 |
| Candidate decisions | 122 | 115 |
| Phase-family frequency | 42.623% | 38.261% |
| Anchor-private-choice frequency | 5.738% | 1.739% |
| Mean arena full turns | 51 | 43 |
| Paired score against control | 0% | 50% |

The phase-frequency difference is 4.362 percentage points; the observed control-score regression is 50 percentage points. This is measured behavior change with a worse small-sample outcome, not improvement or proof of catastrophic forgetting. The UI preserves both the observation and the regression uncertainty.

## Performance measurements and bounds

Selective research retention now runs before replay verification: every transcript actually persisted/exported is verified, including retained failures/bookmarks. Scientific evidence and selection are unchanged. A real-game regression test toggles profiling and requires identical result hashes.

| Measurement | Workers 1 | Workers 4 |
| --- | ---: | ---: |
| Actual games / actions | 190 / 4,496 | 190 / 4,496 |
| End-to-end wall | 203.419 s | 137.775 s |
| End-to-end games/sec | 0.934 | 1.379 |
| End-to-end actions/sec | 22.102 | 32.633 |
| Inclusive simulation wall | 116.502 s | 70.816 s |
| Inclusive simulation games/sec | 1.631 | 2.683 |
| Inclusive simulation actions/sec | 38.592 | 63.488 |
| Retained replay verification | 85.945 s | 66.154 s |
| Persistence | 284.396 ms | 226.894 ms |
| Run + evaluation metric aggregation | 18.836 ms | 17.803 ms |
| Host evidence handling, inclusive subset | 23.350 ms | 39.021 ms |
| Summed worker online latency | 0; serial host path | 4,959.987 ms; overlaps |
| Peak game workers | 0; serial host path | 4 |
| Checkpoint serialization, 1,000 iterations | 7.477 ms | 5.103 ms |
| Checkpoint hashing, 1,000 iterations | 16.476 ms | 9.172 ms |
| Four-record aggregation, 1,000 iterations | 24.099 ms | 9.858 ms |

These are bounded diagnostics collected while other local validation was running. Worker1 executes on the host without spawning a game worker. Series execution intervals are sequential inclusive wall measurements. Summed worker online latencies overlap and are not additive wall components; online does not mean module initialization is complete. Host handling is an inclusive subset, not an independent decomposition. Transcript creation, game hashing and remaining coordination are included rather than isolated. No invasive engine changes were made to manufacture timing precision. `--profile=false` disables optional timing collection without changing scientific settings.

## Artifact locations

All new machine evidence is local and Git-ignored under `reports/local/`. Earlier evidence files remain untouched.

- `evolution-v1-completion-red.log`: original red regressions.
- `evolution-v1-completion-build.log`, `evolution-v1-completion-tests.log`, `evolution-v1-completion-full-tests.log`, `evolution-v1-completion-lint.log`, `evolution-v1-completion-typecheck.log`, `evolution-v1-completion-browser.log`: current gate logs.
- `evolution-v1-completion-full-tests-attempt1.log` and `evolution-v1-completion-journey-*.log`: preserved unsuccessful attempt/diagnostics and three successful fixture trials.
- `evolution-v1-completion/worker-count-proof.json`: semantic equality, fresh identity and validated companion counts.
- `evolution-v1-completion/completion-gate.json`: consolidated final gate counts, identity and complete changed-file inventory.
- `evolution-v1-completion/worker1.json`, `worker4.json`, their `.report.json` companions and `.runs` directories: research envelopes, measurements and run evidence.
- `evolution-v1-completion/cross-runtime.json`: browser/Node equality proof; its source is `browser/adaptive.json`.
- `evolution-v1-completion/resume-proof.json`, `resumed.json`, `resumed.report.json`, `resumed.runs`: completed resume/new-path evidence.
- `evolution-v1-completion/browser-recovery-proof.json`: committed selection, nonempty findings and measured behavior evidence.
- `evolution-v1-completion/browser/report.json`: thirteen final Chrome scenarios, zero page errors.
- `evolution-v1-completion/browser/selection-stopped.json`, `selection-resumed.json`, `selection-repeated.json`: stop/reload/resume/repeat exports.
- `evolution-v1-completion/browser/adaptive-desktop.png`, `adaptive-controls.png`, `adaptive-mobile.png`: final training presentation captures.
- `evolution-v1-completion/preview-proof.json`: final build served at `http://localhost:4173/#/evolution`; preview runs without watch/rebuild.

## Complete changed-file inventory

Paths below are relative to the canonical checkout stated above. Seventeen files changed in this pass; no source removals.

1. `apps/lab-web/src/evolution/evolution-research-ui.js` — consistent manual result references, comparison attribution, clone cleanup, historical inspection/export and explicit experiment type.
2. `apps/lab-web/src/evolution/evolution-training-ui.js` — training fitness/sample context, historical behavior summaries, A/B measured divergence and readable regressions.
3. `packages/simulation-runtime/src/evolution-research.mjs` — shared semantic validation/reference writer, selection/regression consistency, comparison policy and archive/behavior helpers.
4. `packages/simulation-runtime/src/evolution-evaluation.mjs` — shared validation, initial progress/fault attribution, execution timing callback and regression opponent identity.
5. `packages/simulation-runtime/src/evolution-training.mjs` — bounded selection admission, required-work retry, shared finalization/deduplication and scientific semantic normalization.
6. `packages/simulation-runtime/src/evolution-lab.mjs` — optional observational profiling outside run evidence/semantic identity.
7. `scripts/evolution-train.mjs` — retention before verification, measured timing report and profiling toggle.
8. `scripts/evolution-cross-runtime-check.mjs` — current artifact/report paths and final implementation attribution.
9. `scripts/evolution-browser.mjs` — expanded real Chrome failure/recovery/reference/archive/comparison coverage and new output directory.
10. `scripts/ci.mjs` — register new completion regressions.
11. `package.json` — register completion tests in full/focused commands.
12. `test/evolution-completion.test.mjs` — new; thirteen completion/validation/recovery/comparison/archive/telemetry/profiling regressions.
13. `test/competitive-journey-e2e.test.mjs` — observed full-gate fixture repair: OS ports, legal scoring/draw/decline journey and terminal diagnostic assertion.
14. `docs/EVOLUTION_LAB.md` — current operating, retry, comparison, validation, archive, telemetry, profiling and compatibility contracts.
15. `docs/EVOLUTION_LAB_AUDIT.md` — distinguish initial architecture audit from current correction findings and authorities.
16. `docs/EVOLUTION_LAB_REPORT.md` — this exact current completion report.
17. `docs/EVOLUTION_LAB_REPORT_INITIAL_V1.md` — new; original report preserved unchanged as historical evidence.

## Remaining limitations and next scientific milestone

- Tiny frozen catalogs provide descriptive measurements and broad uncertainty, not general strength, convergence or a discovered metagame. Repeated developer iteration can overfit held-out catalogs even though the trainer never selects on them.
- Research resume is suite/generation-boundary recovery; partial suites are retained and retried. Ordinary Lab run resume remains ordinal-granular.
- Imports are unverified claims. Historical inspection preserves attribution/content rather than making incompatible execution or incomplete relationships valid.
- Browser storage is origin-local. Export is the portability mechanism; incompatible execution requires its original source/runtime. No automatic protected-checkpoint deletion or long-history pruning was added.
- Rank/suit distributions and direct resource expenditure remain unavailable. Behavioral frequencies and arena length are the measured telemetry.
- Transcript creation/game hashing and complete startup/coordination decomposition remain non-isolated. Microbenchmarks and these concurrent local timings are not scalability claims.
- Root checkJs does not cover every browser JS module; behavioral Chrome tests and scoped lint provide additional coverage.
- No neural policies, external AI, cloud training, giant sweeps, TrueSkill, clustering, ruleset comparison or elaborate lineage graphics were added. These are justified deferrals outside bounded V1.

V1 now guarantees validated evidence relationships and selection bookkeeping, recoverable required research stages, immutable committed selection, deterministic repeatable regression finalization, attributable complete-only comparison, usable measured training/behavior presentation, and the tested local deterministic execution paths.

The next scientific milestone is preregistered larger fresh training/evaluation packs across several independent evolution seeds, preserved ancestors, failure rates and uncertainty, followed by parameter sensitivity and behavior analysis. Establish that evidence before expanding populations or assigning strategy labels.
