# Evolution Lab Continued Development Report

October 2, 2026 (America/New_York). Baseline: `92d01cea128eae0b277cfa362bae15ba29b35ebb`. Local implementation and validation complete. No remote CI, publishing, deployment or release certification was performed.

## Architecture Consolidated

The simulation-runtime domain is the sole configuration, paired seed, seat, checkpoint and evidence authority. Research, evaluation and training modules extend that authority. Node and browser adapters execute the same planning and trainer functions using the existing authoritative game engines.

## Legacy Systems Removed or Retained

Removed Prototype Zero `evolution-core.mjs` and `run-evolution-series`. Migrated tests to current admission/planning/protocol. Incremental aggregation moved into the domain; bounded chart sampling moved into `evolution-presentation.mjs`. Existing self-play, pause/resume, replays, ordinary play, and frozen baseline policies remain functional.

## Orchestration Parity Findings

Sixteen commands bounded an execution slice rather than a gameplay rule. Seed `3484793158` legitimately needs further automatic work. The core orchestrator now continues slices with globally stable command indices, up to an independent 256-command guard. The same game under ordinary 16 and Lab 256 slices has identical command trajectory, state hash and rule-compliance result. No card, score, legal-action or victory rule changed. Compiled upstream JS/map accompany the operational TS change.

## Experiment System

Manifests distinguish scientific variables from worker count, timestamps and elapsed time. Scientific IDs are content-derived. Runs are execution references, hypotheses/conclusions are explicit developer statements. Three initial experiment types execute; adaptive experiments add training configuration. Clones preserve scientific fields and identify their parent; deliberately changing a series seed produces a structured field diff. Ruleset comparison remains future work; no rule overrides are invented.

## Evaluation Packs / Suites

Explicit immutable seed catalogs mirror every seed AB/BA. Core Baseline Suite v1 contains random-legal, score-rush, control, tempo and value checkpoint identities. Each evaluation retains opponent/candidate/pack identity, full matchup metrics, failures, conservative pair-level uncertainty, score margins, seat exposure, behavior and execution references. Small fixed packs describe their samples. A training mean is an explicit selection criterion, never a universal rating.

## Checkpoint Schema

Schema 1 retains its original bytes/hash semantics and frozen generation-0 state. Schema 2 contains bounded weighted policy state, parent, lineage, generation, training/mutation provenance and originating experiment. Content-derived v2 IDs include semantic state, exclude display timestamp/tags/favorite/protection metadata. Evaluation references live in experiment/project history rather than changing checkpoint IDs. Loaded research-series configuration is read-only; the replay arena shows actual historical generation numbers. Historical incompatible artifacts can be inspected read-only; executing them requires their original implementation. IndexedDB upgrades in place and does not delete historical stores.

## Adaptive Learning Status

`VALIDATED_V1` within the documented local experimental bounds. Foundation gate passed 29/29 tests and 9/9 Chrome scenarios before trainer implementation. Final validation covers real adaptive lineages, frozen historical evaluation, browser execution and worker-count reproducibility. This status establishes software behavior, not statistical evidence of stronger strategies.

## Evolution Algorithm

Local deterministic `(1 + λ)` selection, λ bounded 1–4. Both roots have identical control-base parameter state and independent A/B lineages. Six residual weights use existing authorized scoring decompositions: points, resource, tempo, defense, synergy and risk. One feature per candidate changes by an explicit bounded step; weights remain [-2000,2000]. Mutation seeds derive from scientific experiment identity, evolution seed, lineage, generation and mutation index. Game and policy RNG remain separate.

Candidates and parent play frozen **TRAINING** seeds against named opponents. Mean paired training score selects the source; ties prefer parent then mutation index. Any incomplete, aborted or unresolved selection evidence disqualifies that candidate. Retaining parent creates an immutable unchanged child generation. Selection commits before held-out **EVALUATION**, whose results never select or mutate. Baseline, parent and strongest prior selected ancestor are compared on the same frozen matchup vector for descriptive regressions. All parents and candidates remain available.

## Determinism Evidence

Focused tests cover exact seed/action/state reproduction, weighted-policy Node/browser trajectories, independent RNG, bounded mutation, frozen evaluation, serialization, ancestry, scientific cloning, and diagnostic rejection. The final registered suite includes 37 Evolution tests, all passing with zero skips. Weighted Node/browser command trajectories agree. A browser adaptive artifact was reproduced headlessly in Node with identical checkpoint/generation/evaluation/ancestry semantics; proof is `reports/local/evolution-cross-runtime.json`.

## Worker-Count Reproducibility

Real two-generation focused lineages reproduced exactly with one and four workers, including checkpoint IDs, generation IDs, evaluation identities and ancestry. Re-running a completed project appended no duplicate generations. Interrupted selection history resumed correctly. The full named five-opponent demonstration reproduces exactly with workers 1 and 4: 220 games and 4,093 policy actions per execution, identical checkpoint IDs, generation IDs, evaluation IDs and ancestry. Semantic hash: `b09ddd697221205d9f14fdfccebb499a62580017aec6439d7beb2334d931f828`. Proof: `reports/local/evolution-worker-count-proof.json`. The four-worker case includes four concurrent game workers on four-game held-out matchups; two-game training matchups use two workers.

## Browser Validation

Extended Chrome harness exercises experiment creation/cloning, five-opponent frozen evaluation, comparison, import/export, persistence/reload, adaptive stop/resume, generation advancement and historical checkpoint selection. Existing pause/reload/resume, stale worker rejection, replay verification, mobile/quota behavior and ordinary human-vs-AI startup remain covered. Final Chrome validation: 11/11 scenarios, zero failures/page errors. It additionally verifies saved training history/summary labels and actual historical generation display, stale adaptive callbacks, mobile layout after training, and an actual IndexedDB v1-to-v2 migration preserving original schema-v1 checkpoint IDs. Evidence: `reports/local/evolution-browser/report.json`.

## Benchmark Results

Final implementation fingerprint: `82c311de78ed5109e47a874be39f259fdae6fa21896c7a1df29251bb97db8849`.

| Demonstration | Games | Actions | Wall time | Games/sec | Replays verified | Verification errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Two generations, workers 1 | 220 | 4,093 | 340.509 s | 0.6461 | 212 | 0 |
| Two generations, workers 4 | 220 | 4,093 | 301.223 s | 0.7304 | 212 | 0 |
| Default-seed divergence + companion evidence, workers 4 | 80 | 1,821 | 107.686 s | 0.7429 | 75 | 0 |

Measured while other local validation processes were running; wall time includes persistence and extensive replay verification. The parallel case spent 170.300 s verifying retained transcripts and 0.416 s persisting research envelopes. Its 1,000-iteration microbenchmarks took 11.722 ms for checkpoint serialization, 15.926 ms for checkpoint hashing, and 23.505 ms for aggregation of a four-record sample. These are small-sample diagnostics, not scalable speed claims.

Both two-generation lineages converged to equal final residual weights (`resource=-1000`, `defense=-1000`, other residuals zero). Independent mutation does not guarantee divergent selected policies.

An additional default-seed demonstration (game seed 1337, evolution seed 31091, one generation, one candidate, step 1000, one frozen seed pair/opponent) did diverge: A1 selected `resource=-1000`; B1 retained baseline state. Against the same frozen control pair, A1 draw-family usage was 12.35% of 81 candidate decisions; B1 was 21.74% of 115 candidate decisions. Mean arena full turns were 32 versus 43. Both scored 50% against control and had the same entire paired-score vector: random 50%, score-rush 0%, control 50%, tempo 0%, value 0%. All ten held-out games per checkpoint were clean. This demonstrates measurable behavior change with equal small-sample outcomes, not improvement.

Artifacts: `reports/local/evolution-training-final-w1.report.json`, `evolution-training-final-w4.report.json`, and `evolution-divergence-evidence.report.json`. Corresponding JSON files without `.report` are portable research envelopes. CLI reports simulation throughput, actions/sec, persistence, retained replay verification, checkpoint serialization/hash and aggregation microbenchmarks. Worker startup/coordination and transcript creation are included in wall throughput, not separately isolated. Rich transcripts are bounded per run; research projects store references and selected metrics rather than duplicating every transcript. Training saves keep one ordinary transcript plus retained failures/bookmarks. Saved artifacts carry scientific TRAINING/EVALUATION purpose separately from mirrored-series admission. The headless companion `evolution-divergence-evidence.runs` directory contains 40 validated run files, all 80 slim game records and 57 retained transcripts. Its semantic result exactly matches the prior divergence demonstration. The evidence-purpose annotation was added to these locally produced files after execution without changing record/checkpoint identities; `evolution-run-evidence-proof.json` records that check.

## Tests

- Registered full suite: **5,255 tests; 5,241 passed, 0 failed, 14 skipped; 95 suites**. Runtime 354.875 s. Includes all 37 Evolution tests.
- Real Chrome harness: **11 scenarios passed, 0 failed, 0 page errors**.
- Final route/module-graph/test-registration regressions after presentation copy edits: **30 passed, 0 failed/skipped**.
- Completed headless resume: PASS; unchanged semantic lineage, zero games/new generations, all 40 prior run-evidence files copied and validated at the new output path.
- Port-allocation regressions: **41 passed, 0 failed/skipped**.
- Build: PASS. Root and client typechecks: PASS. ESLint: **0 errors, 422 existing warnings**; targeted browser modules/harness: zero errors/warnings. Diff whitespace check: PASS.
- Skips: one unavailable legacy vendor-4.1 corpus check; thirteen service-worker tests explicitly skipped because the existing PWA kill switch is active. Skips are not passes.
- Two early full-suite attempts exposed random occupied/reserved Windows ports. Fixed only the two affected test files to request OS-assigned ports. A further intermediate attempt raced changing source/build files; the successful full run used a fixed source tree/build. Final copy/style edits were followed by separate route and browser checks. Subsequent artifact retention/purpose-labeling changes were followed by all 37 focused Evolution tests, the 11 real-browser scenarios, lint and both typechecks.
- Evidence: `reports/local/evolution-v2-full-tests-final.log`, `evolution-port-allocation-tests.log`, `evolution-v2-routing-final.log`, `evolution-v2-build-final.log`, `evolution-v2-lint-final.log`, `evolution-v2-typecheck-final.log`, and `evolution-browser/report.json`.

Local PASS does not establish remote CI/deployment/release approval.

## Known Limitations

- Experimental heuristic search does not establish general strength, convergence or a discovered metagame. Tiny demonstration packs are deliberately underpowered.
- Fixed held-out catalogs can be overfit by developer iteration; selection code never consumes them, but fresh preregistered evaluation is needed for stronger claims.
- Training resumes at suite/generation boundaries; a stopped partial suite is preserved and retried. Individual ordinary Lab runs retain game-level resume.
- Storage is local to browser origin. Exports provide portability; checksums do not authenticate imported claims.
- Rule/implementation fingerprints intentionally reject incompatible execution. Read-only historical inspection preserves attribution, not executable migration.
- No automatic checkpoint deletion. The v1 project budget limits generation/checkpoint/evaluation counts and total artifact bytes; long-run retention policy remains future work.
- Candidate family/mechanic rates and shared arena lengths are measured. Rank/suit usage and direct resource expenditure remain unavailable; no inferred archetype labels.
- No external AI, neural policies, cloud training, giant sweeps, TrueSkill or elaborate lineage graphics.

## Technical Debt

Repository-bound implementation identity/build transport; root checkJs does not cover every new JS module (behavioral tests and ESLint do). Full performance decomposition, richer per-card telemetry, immutable external evidence signing and independent seed-pack preregistration remain open.

## Files Changed

Complete inventory appears below; removed files are marked explicitly. Changes cover Evolution, existing runner/policy integration, operational core orchestration and its generated JS/map, build/test registration, documentation, and the two network test fixtures repaired after observed validation failures.

## Recommended Next Milestone

Preregister larger fresh training/validation packs, evaluate several independent evolution seeds and preserved ancestors, report uncertainty and failure rates, then measure parameter sensitivity and behavioral divergence before adding larger populations or strategy clustering.

## Complete File Inventory

- `apps/lab-web/src/autonomy-runtime.js`
- `apps/lab-web/src/css/evolution-foundation.css`
- `apps/lab-web/src/css/evolution.css`
- `apps/lab-web/src/evolution/evolution-browser-runner.mjs`
- `apps/lab-web/src/evolution/evolution-core.mjs` — removed Prototype Zero module
- `apps/lab-web/src/evolution/evolution-presentation.mjs`
- `apps/lab-web/src/evolution/evolution-research-ui.js`
- `apps/lab-web/src/evolution/evolution-store.mjs`
- `apps/lab-web/src/evolution/evolution-training-ui.js`
- `apps/lab-web/src/router.js`
- `apps/lab-web/src/worker.js`
- `apps/lab-web/src/workspaces/evolution-dashboard.js`
- `apps/lab-web/src/workspaces/evolution.js`
- `docs/EVOLUTION_ARCHITECTURE_RECONCILIATION.md`
- `docs/EVOLUTION_FOUNDATION_GATE.md`
- `docs/EVOLUTION_LAB.md`
- `docs/EVOLUTION_LAB_AUDIT.md`
- `docs/EVOLUTION_LAB_REPORT.md`
- `package.json`
- `packages/policies/src/weighted-heuristic.mjs`
- `packages/simulation-runtime/src/evolution-domain.mjs`
- `packages/simulation-runtime/src/evolution-evaluation.mjs`
- `packages/simulation-runtime/src/evolution-lab.mjs`
- `packages/simulation-runtime/src/evolution-research.mjs`
- `packages/simulation-runtime/src/evolution-retention.mjs`
- `packages/simulation-runtime/src/evolution-training.mjs`
- `packages/simulation-runtime/src/runtime.mjs`
- `scripts/build.mjs`
- `scripts/ci.mjs`
- `scripts/evolution-browser.mjs`
- `scripts/evolution-cross-runtime-check.mjs`
- `scripts/evolution-identity.mjs`
- `scripts/evolution-train.mjs`
- `test/evolution-foundation.test.mjs`
- `test/evolution-lab.test.mjs`
- `test/evolution-research.test.mjs`
- `test/evolution-training.test.mjs`
- `test/match-history.test.mjs`
- `test/network-truth-closure.test.mjs`
- `upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/dist/src/core-autonomy.js`
- `upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/dist/src/core-autonomy.js.map`
- `upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/src/core-autonomy.ts`
