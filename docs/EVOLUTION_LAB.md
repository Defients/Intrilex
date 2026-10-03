# Evolution Lab developer operating guide

Evolution Lab runs authoritative Intrilex games and records reproducible research evidence. Frozen baseline policies remain unchanged. Experimental local weighted-heuristic training is isolated in Research experiments.

## Browser workflows

Build with `pnpm run build`, serve `apps/lab-web/dist`, and open `#/evolution`.

The research cockpit provides six workspaces: **Overview** for lineage heads and coverage; **Arena** for frozen policy series; **Evolution** for scientific drafts, training and committed lineages; **Evidence** for evaluations, comparisons, behavior and regressions; **Forensics** for verified replay commands; **Ledger** for history, storage, imports and exports. Checkpoint, generation, evaluation, finding and run IDs open the shared inspector. See [the cockpit operating and architecture guide](EVOLUTION_COCKPIT.md) and [current delivery evidence](EVOLUTION_COCKPIT_REPORT.md).

Use the global execution controls for arena runs and **Stop research** during research execution. Workspace navigation, filters and inspection preserve the owned executor. Research has stop/resume at required suite and generation boundaries; it has no invented pause operation. The console reports received progress and observed transitions. Its pause/clear controls affect its display only.

Residual editing is a **non-committed UI draft**. It enforces the authoritative integer bounds, supports reset/copy, and cannot alter a historical checkpoint or create an executable policy. Parameter differences are distinct from measured behavior. Export from Ledger remains the portability and recovery mechanism when local storage fails.

1. **Run Series** uses the existing frozen policy arena. Configure policies, profile, base seed, mirrored seats and 1–4 workers. Pause/resume preserves accepted ordinals; reload then Load restores an interrupted run as paused. Stop keeps its evidence.
2. **Create experiment** records name, hypothesis, scientific config, starting checkpoints, a frozen paired evaluation pack and Core Baseline Suite v1. Execute experiment runs SELF_PLAY/POLICY_COMPARISON under recorded config; CHECKPOINT_EVALUATION runs the frozen suite. Run IDs identify executions.
3. **Clone experiment** preserves scientific variables and records the parent. The optional Clone series seed field deliberately changes that variable and records its before/after diff. Training clones preserve frozen seed pools. Create a new training experiment to change its seed pools.
4. **Run frozen suite** evaluates the selected historical candidate against random-legal, score-rush, control, tempo and value. The matchup vector keeps each opponent separate, with clean/failed games, paired score, bounds, score margin and first-seat wins.
5. **Compare checkpoints** selects two chronological checkpoints and compares identity, matching evaluation packs/opponents and measured candidate behavior deltas. Missing evidence stays unavailable.
6. **Create A0 / B0 experiment** creates independent lineages from identical parameter state. Configure generations (1–100), candidates (1–4), step (1–1000), evolution seed, training pairs and held-out evaluation pairs. **Train / resume generations** executes the shared headless-capable algorithm. **Stop research run** terminates owned workers and preserves history. Resume completes pending held-out evaluation and deterministic regression finalization before advancing further. Historical failed attempts remain visible; a successful retry can complete required work.
7. Export research artifacts for portability. Save conclusions explicitly. Load experiment restores local history. Imported evidence is marked unverified. Research history cannot overwrite a longer committed generation sequence.
8. **Inspect historical artifact** validates an older run against its recorded identity read-only. Current execution rejects incompatible fingerprints. Original stores/IDs remain intact; use the original source/runtime to reproduce historical outcomes. **Inspect historical research** and **Inspect archive** preserve research content and checkpoint IDs without admitting execution; missing relationships under the current validation contract are diagnosed.

Research persistence errors remain visible; export before leaving if a save fails. Ordinary run replay inspection still re-executes retained commands and checks seeded initial/final state hashes. Repeated evaluations remain execution history. Comparison uses the latest complete appended held-out attempt per matching pack/suite and identifies the selected evaluation/run IDs. Partial-only evidence is unavailable; results are never pooled implicitly.

All research series can be found in ordinary saved-run history and inspected there. Loaded weighted-checkpoint series show their actual generation and are read-only configurations; Research evaluates selected historical checkpoints, and Reset starts a new frozen-policy arena series.

## Headless workflows

```powershell
pnpm run build
pnpm run test:evolution
pnpm run test:evolution:browser
pnpm run train:evolution -- --generations=2 --candidates=2 --training-pairs=2 --evaluation-pairs=2 --seed=42 --evolution-seed=31091 --step=250 --workers=4 --out=reports/local/evolution-training.json
pnpm run train:evolution -- --resume=reports/local/evolution-training.json --out=reports/local/evolution-training-resumed.json
pnpm run benchmark:evolution -- --games=2000 --workers=4 --seed=1337
```

CLI flags use `--key=value`. SIGINT preserves partial history. The training JSON is a checksummed research envelope; its `.report.json` companion contains semantic lineage hashes, matchup evidence and performance measurements. Its `.runs` companion directory contains validated run artifacts referenced by the research history, including every slim game record and selected forensic transcripts. Run the identical configuration with workers 1 and 4 to compare semantic results. Wall time, run IDs and timestamps can differ. When resuming to a new output path, the CLI validates and copies referenced files from the original `.runs` directory. Missing older companion files are explicitly listed as `missingPriorRunEvidence`; it never invents their contents. A completed resume appends no generations.

## Weighted heuristic V1

The policy ranks **only** legal actions supplied by the authority. It starts with shipped `control` scoring and adds six residuals using the existing `decomposePolicyScore` features. Baseline residual weights are zero; parameters are bounded to [-2000, 2000]. No card rule is reimplemented.

| Parameter | Existing measurable feature |
| --- | --- |
| points | Immediate points plus half target-point value |
| resource | Draw/swap/recovery indicators and authorized draw-count feature |
| tempo | QUICK timing, control-base offset (zero), authorized Mini-Turn feature |
| defense | Existing anchor/guard/effect-nine indicators and own response-stack context |
| synergy | Authorized anchor/Mimic/row-exchange features |
| risk | Countering own stack, source-versus-target cost and absolute-scuttle feature |

These are established scoring proxies, not psychological labels or complete strategic models. Baseline scoring retains its terminal-win preference; all weighted choices remain legal even when a mutation performs poorly.

Each mutation adjusts one feature by a recorded signed step and clamps it. Mutation seeds derive from scientific experiment identity, evolution seed, lineage, generation and candidate index. Evolution RNG never consumes game/policy RNG. Changing worker scheduling does not change mutations or selection.

The `(1 + λ)` strategy evaluates parent plus 1–4 mutations against a named suite on **TRAINING** seeds. Selection maximizes mean paired training score; ties prefer parent then lower mutation index. Incomplete/failed/unresolved candidate evidence disqualifies it. If none qualify, training stops diagnostically. A retained parent creates a new immutable child with unchanged state. Selection is committed before **EVALUATION** on disjoint held-out frozen seeds. Held-out results do not enter selection, stop criteria or mutation.

Selected baselines, parents and strongest prior selected ancestors remain available; matchup regression means an observed paired-score drop beyond the configured threshold on a matching fixed pack. Small-sample regression is descriptive, not proof of catastrophic forgetting.

## Identity and storage

- Experiment scientific identity includes implementation/rules identity, type, scientific config, checkpoint identities, pack/suite references and training settings. Name/parent define a manifest instance. Worker count and clocks are operational.
- Pack IDs cover explicit seed arrays and provenance. Packs are frozen, not regenerated when loading. Mirrored games reuse a seed with equal AB/BA exposure.
- Schema-v1 checkpoints retain original frozen generation-0 hash semantics. Schema-v2 IDs cover actual policy state, implementation, ancestry, training/mutation and experiment origin. Creation timestamp, tags and favorite/protected display metadata are excluded from v2 semantic identity. Root checkpoints precede experiment creation; descendants identify the originating experiment. Reference/root timestamps use the fixed catalog edition date; descendants carry the experiment creation timestamp. Generation ordering is authoritative, rather than those display timestamps.
- Generation records are append-only and contain parent/candidates, mutation evidence, training/evaluation pack references, selection ranking/disqualifications and selected child. Held-out results are separate immutable evaluation references.
- IndexedDB `intrilex-evolution-lab` version 2 keeps original run/history/checkpoint stores and adds research artifacts. No protected checkpoint is silently removed. Imports are checksummed claims, not authenticated authorship.
- Research run artifacts explicitly carry `researchPurpose=TRAINING` or `EVALUATION`. The internal mirrored-series admission kind stays EVALUATION; saved history and performance labels use the scientific purpose. Training saves retain one ordinary clean transcript plus retained failures and bookmarks; held-out evaluation retains its bounded samples. All slim records and checkpoint identities remain intact.
- Limits: 10,000 games/run, four workers, 1,800 decisions/game, 256 automatic commands per decision boundary, twelve retained replays/run, 40 MiB/artifact, 100 generations per lineage, four mutations/parent. Partial research suites retry on resume; committed selections do not change.

## Research evidence validation

New/cached evaluations validate candidate/pack/suite identities, pack purpose, ordered unique opponents, bounded finite metrics, count/rate/uncertainty consistency, behavior telemetry, digests, completion coverage and execution references. Generation rankings are recomputed from referenced training results; regression findings validate their actual held-out reference deltas. A referenced run is not proof that its file exists, and structural validity is not independent reproduction. Imports remain unverified claims.

Bot cards show training selection means separately from measured behavior changes against the frozen control baseline. Family/tag deltas use candidate decisions as denominators and identify before/after sample sizes. Latest A/B behavior compares the same held-out pack and opponent. Regression tables retain exact reference/evaluation identities in diagnostics.

## Metrics and interpretation

Paired score averages the two seat results for each complete seed pair (win 1, draw 0.5, loss 0). Conservative 95% Hoeffding bounds assume independently sampled seeds; fixed catalogs describe that catalog. Aborted games never count as wins. Candidate failures remain visible and can disqualify selection. Tiny demonstration packs cannot establish universal improvement.

Behavior V1 counts candidate-selected action families and canonical mechanic tags per candidate decision. Shared mean full turns/Mini-Turns describe arena context. Old artifacts lacking per-seat telemetry report unavailable behavior. Rank/suit distributions and direct resource expenditure are not fabricated.

The CLI applies selective retention before verifying every transcript actually persisted/exported. It measures end-to-end wall games/sec and actions/sec, sequential inclusive simulation wall time and throughput, replay verification, persistence, and serialization/hash/aggregation microbenchmarks. Optional profiling (`--profile=false` disables it) measures host evidence handling and summed worker online latency. Online latency intervals overlap and must not be added to wall time; online does not mean module initialization is complete. Transcript creation and game hashing remain included in simulation time, not isolated. Profiling never changes scientific configuration or choices.

The initial mutation/selection approach follows the standard simple evolution-strategy pattern; this implementation is deliberately smaller than adaptive covariance or neural approaches. Background: [Beyer and Schwefel, Evolution strategies: A comprehensive introduction (2002)](https://gwern.net/doc/reinforcement-learning/model-free/2002-beyer.pdf).

The completion correction changed fingerprint-covered research/runtime modules. Earlier artifacts remain historical evidence: inspect them read-only rather than rewriting their identities for current execution. Create a fresh compatible experiment for new training. The original development report is preserved in `EVOLUTION_LAB_REPORT_INITIAL_V1.md`; its old counts and benchmarks are not current verification.

See `EVOLUTION_LAB_AUDIT.md`, `EVOLUTION_ARCHITECTURE_RECONCILIATION.md`, `EVOLUTION_FOUNDATION_GATE.md` and `EVOLUTION_LAB_REPORT.md` for architecture and current validation boundaries.
