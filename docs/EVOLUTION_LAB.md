# Evolution Lab deterministic foundation

This developer workspace runs frozen Intrilex policies through the existing engine, records reproducible game evidence, and evaluates policies against stable references. Adaptive learning is disabled. The first vertical slice stops here; experiments, trainers, population evolution, branching, learned generations, ratings, clustering and Balance Lab remain later milestones.

## Run it

From the repository root:

```powershell
pnpm run build
pnpm run dev
```

Open `http://localhost:4173/#/evolution`. Choose Bot A/B, game count, seed, worker count and an admitted rules profile. **Run Series** creates independent A/B lineage IDs and immutable generation-0 checkpoints. Selecting the same policy for both bots gives them identical policy state and implementation; the lineages have separate identities.

**Pause** terminates workers, saves completed records and leaves interrupted ordinals pending. **Resume** reruns only pending games from their original seeds. **Stop** preserves the partial record and ends that run. Leaving the workspace pauses it. After a browser reload, use **Load** in saved history to restore a compatible run.

**Evaluate A/B** creates a separate EVALUATION run against the selected frozen reference. Evaluation requires an even game count and mirrored seats. All five admitted policies are shipped baseline implementations: random-legal, score-rush, control, tempo and value. HybriX remains available to ordinary gameplay; it is not yet admitted to this deterministic lab.

Inspect a retained replay to re-execute its commands through the engine, verify seed/initial state and final hash, and step through command, actor, phase, turn, scores and emitted event types. Bookmarks protect retained samples. This is a command/event inspector; it does not yet present a full board reconstruction or policy reasoning view.

## Headless API and CLI

```powershell
pnpm run benchmark:evolution -- --games 2000 --workers 4 --seed 1337
pnpm run test:evolution
pnpm run test:evolution:browser
```

The benchmark writes `reports/local/evolution-benchmark.json`, including configuration, actual implementation fingerprint, immutable checkpoints, every slim game record, bounded full replays, statistics and timing. It verifies retained replays before finishing and preserves diagnostics if verification fails. Exit status is nonzero for an incomplete run, unresolved/aborted game, or replay failure. `--a`, `--b`, `--profile` and `--out` are supported; policy/profile admission remains strict.

Import from `@intrilex/simulation-runtime/evolution-lab` for `runLabSeries`, `runLabGame`, `verifyLabReplay` and `runFrozenEvaluation`. Pass validated starting checkpoints to reproduce a historical policy identity. `runFrozenEvaluation` accepts one candidate checkpoint and up to eight frozen benchmark checkpoints, mirrored game count, seed, profile and workers. No training/update hooks are called.

## Evidence and compatibility

- Engine authority remains `IntrilexEngine.execute`, reached through existing legal-action frames and simulation runners. No game-rule implementation was added.
- Fingerprints bind actual compiled engine modules, shipped baseline policies/scoring/SDK, Node/browser runners, the lab domain contract and the engine adapter/action projection. Same labels with different implementation bytes are incompatible.
- A game record contains seed, ordinal, seat assignment, agents' checkpoint IDs, winner, terminal/error reason, scores, full turns, mini-turns, decisions/commands, action/event/mechanic counts, illegal-action attempt count and initial/final/command hashes. `durationMs` is separate operational metadata excluded from `resultHash`.
- Paired ordinals share game randomness and swap policy seats. Policy RNG remains separately seeded by the existing runtime. Zero base seed follows the existing convention and becomes one.
- Lab games allow up to 1,800 policy decisions and 256 automatic orchestration commands per decision frame. These are safety budgets; normal callers retain their existing defaults. The browser also enforces a 30-second worker-job watchdog.
- Run errors and noncanonical endings remain visible and are excluded from clean-game outcome rates. Failed games are quarantined; a worker infrastructure failure stops and preserves the partial run.
- Serialized files have schema version, content checksums and fingerprint validation. Imported files never supply executable policies. Import checksums detect corruption; they do not prove authorship or outcomes. The UI marks imported outcomes as unverified until individually reproduced.
- Browser and Node summary formats differ in existing telemetry details. Admission tests compare actual initial states, ordered commands and final state hashes across all three admitted rules profiles, rather than claiming their full summaries are interchangeable.

## Metric definitions

Win rates divide by canonically completed games, including draws in the denominator. A draw earns half a point in the paired performance score. Aborted games and unmatched/incomplete seed pairs do not enter the paired estimate. First-player win rate is seat P1 wins per clean game; policy scores map results back to A/B even when seats swap.

Mean/median score differential is A minus B. Variance is sample variance of that differential. Action families and mechanic counts derive from actual runtime telemetry. They are observations, not invented strategy labels. Full turns, mini-turns, legal decisions and automatic engine commands are different counters.

The conservative 95% paired-score bounds use `sqrt(log(40)/(2 * pairCount))`, clipped to [0,1]. Each complete seed pair is one bounded sample; its two games are correlated. The inference assumes independent sampled seed pairs. Fixed seed catalogs produce descriptive evidence for that catalog, and excluding failures can bias estimates; failure rates remain visible. Small samples are flagged below 100 complete pairs. See the [CMU derivation of Hoeffding bounds](https://www.stat.cmu.edu/~cshalizi/sml/21/lectures/06/lecture-06.html).

## Storage and compute limits

Runs are bounded to 10,000 games and four workers. Only one browser run/evaluation is active at a time. Every slim result is kept, while full replay retention is capped at 12. Bookmark priority comes first, aborted samples second, early ordinals third. Full transcript length is bounded to 12,000 commands, and imported/saved artifacts to 40 MiB.

IndexedDB uses a separate `intrilex-evolution-lab` database with run, history and immutable checkpoint stores. Save success waits for transaction commit, following [IndexedDB transaction completion semantics](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event). Autosave occurs every 250 games and on pause/stop/completion/bookmark. A crash can lose work since the last completed save. Browser storage may be cleared or evicted; exports are the portable copy. Quota and unavailable-storage errors remain visible and leave in-memory export working. History is not silently pruned; this slice has no deletion/pruning UI.

Elapsed time/games per second measure wall time in the current environment. Per-game timing includes local engine/metrics work, while series throughput includes scheduling overhead. These are measurements, not a guarantee of performance on other machines. There is no CPU utilization target or rate-cap control in this milestone.

## Learning gate

Keep adaptive learning disabled until the final validation report is accepted and remaining foundation constraints are addressed. A suitable first learning candidate is mutation/selection over explicit heuristic weights, with independently seeded mutation, immutable parameter checkpoints, frozen paired evaluation and historical opponents. Existing baseline checkpoints deliberately reject nonempty learned state; adding learning requires a new explicit schema/adapter and admission tests.

See [the architecture audit](EVOLUTION_LAB_AUDIT.md) and [implementation/validation report](EVOLUTION_LAB_REPORT.md).
