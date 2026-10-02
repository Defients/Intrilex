# Evolution Lab: first vertical slice technical report

Validated October 2, 2026 (America/New_York), in `H:\myProjects\Intrilex-MASTER\Intrilex_dev-current`. This report covers locally validated developer tooling. It is not a release certification or remote deployment report.

## Implemented

- Headless Simulation API, frozen RandomLegal/current heuristic adapters and real Node/browser worker execution.
- Paired seed scheduling with equal AB/BA seat exposure for evaluation; stable ordinal ownership and deduplication.
- Outcome, seat, score differential, game flow, action/event/mechanic, failure and timing records. Wall timing is separated from deterministic semantic hashes.
- Replay IDs and state/command hashes for every game; bounded full transcripts; replay verification and command/event stepping; developer bookmarks.
- Immutable, implementation-bound generation-0 checkpoints, independent A/B lineage IDs, round-trip validation and historical checkpoint loading through the API.
- Frozen reference evaluation, conservative uncertainty on complete seed pairs, visible sample size and separate self-play/evaluation records.
- Developer dashboard with run configuration, start/pause/resume/stop, A/B metrics, checkpoint history, replay forensics, IndexedDB history and validated artifact import/export.
- Explicit compute/retention/import limits, quota diagnostics, quarantine of failed games, worker watchdogs and stale-worker rejection.
- A headless benchmark CLI, registered tests/CI stage, architecture audit and operating guide.

Adaptive learning remains disabled. There are no fake generations, fabricated thoughts, mutable historical checkpoints or unsupported learning controls.

## Architecture added

| Boundary | Source |
| --- | --- |
| Portable schemas / checkpoints / metrics / paired plans / artifact validation | `packages/simulation-runtime/src/evolution-domain.mjs` |
| Run state, claims, epochs and evidence ownership | `packages/simulation-runtime/src/evolution-session.mjs` |
| Node simulation and frozen evaluation adapter | `packages/simulation-runtime/src/evolution-lab.mjs` |
| Node worker pool endpoint | `packages/simulation-runtime/src/evolution-node-worker.mjs` |
| Actual engine/policy/runtime implementation identity | `scripts/evolution-identity.mjs` |
| Browser persistence and import boundary | `apps/lab-web/src/evolution/evolution-store.mjs` |
| Developer dashboard | `apps/lab-web/src/workspaces/evolution-dashboard.js` |
| Existing workspace entry / worker adapters | `workspaces/evolution.js`, `worker.js` |
| Developer stylesheet | `css/evolution-foundation.css`, existing prototype CSS |
| Benchmark and browser validation harnesses | `scripts/evolution-benchmark.mjs`, `scripts/evolution-browser.mjs` |

The build copies the portable domain/session into the browser distribution, rewrites the canonical hash import to the existing browser crypto shim, and emits the same implementation identity used by the Node adapter. The original prototype's core helpers, stylesheet, routing, chart helper and tests were retained and extended. Existing unrelated dirty work was preserved.

## Existing architecture reused

Canonical authority is the existing `upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix` source compiled into the existing runtime. State creation, legal-action generation, private command resolution, transitions, scoring, turn/priority advancement and victory remain engine-owned.

The Node lab wraps `runPolicyMatch`; browser workers wrap `runBrowserPolicyMatch`. Both use existing policy/scoring implementations and separately seeded policy RNG. Retained Node replay evidence verifies through the existing certified replay creator/verifier. Browser inspection executes the same recorded commands through `IntrilexEngine` and verifies initial/final hashes.

The existing chart toolkit, observatory route shell, render bus and worker infrastructure are reused. Player saves, authentication, networking and ranked state are separate from the lab database.

## Determinism evidence

- 32 independent base seeds reproduce identical initial states/deals, ordered commands, terminal hashes and semantic records in repeated real-engine runs. Duration is explicitly excluded from semantic equality.
- Browser/Node admission tests compare actual initial states, command trajectories and final hashes for four seeds across all three admitted rules profiles.
- A real four-worker Node pool matches a serial run when configuration and starting checkpoints are the same; semantic metrics and ordinal-indexed results agree.
- Pause/resume invalidates interrupted claims and stale epochs; duplicate results cannot increment totals twice. Browser testing also injects a callback from a terminated prior run while a new run is active and verifies it is ignored.
- Checkpoint/record/artifact round trips reject modified checksums, incompatible implementations, duplicate ordinals, unsupported policies and malformed budgets.
- Replay tests reject altered commands and incompatible initial configuration. Retained benchmark replays reconstruct successfully.
- A seed that exhausted the engine's default 16-command orchestration budget is explicitly tested. The lab's opt-in 256-command budget completes the game and replays it; normal API defaults remain unchanged. The canonical engine source was not modified.

Final benchmark fingerprint:

```text
ecaa17c5f5e1441c3aae62af9490443f7b18bd56d0eafb4068c9d356abb9f6a0
```

It was recomputed from current implementation bytes after the benchmark and matched the stored fingerprint.

## Simulation throughput

Final benchmark: Advanced Core, score-rush vs control, base seed 1337, mirrored seating, four Node workers, 2,000 games / 1,000 seed pairs.

| Measurement | Result |
| --- | ---: |
| Attempted / clean games | 2,000 / 2,000 |
| Aborted / unresolved games | 0 / 0 |
| Retained replays verified / failed | 12 / 0 |
| Series elapsed time | 310.93 seconds |
| Measured throughput | 6.43 games/second |
| Mean individual game runtime | 619.49 milliseconds |
| Mean policy decisions | 34.24 per game |
| Mean full turns / mini-turns | 12.14 / 15.35 |
| Score-rush / control wins | 1,754 / 246 |
| First-player win share | 46.4% |
| Mean / median A-minus-B score margin | 16.728 / 21 |
| Paired score / conservative 95% bounds | 87.7% / 83.4%–92.0% |

This was measured while other validation processes were running. It is not a maximum-throughput estimate. Series timing includes engine/metrics and worker coordination, but ends before retained-replay verification and report writing. Individual game runtime is accumulated across simultaneous workers and is not the same as series wall time. The outcome describes this frozen opponent and seed suite; no improvement or general strength claim follows from it.

Machine-readable evidence: local `reports/local/evolution-benchmark-final.json` (4,987,250 bytes), including the complete run artifact. A separate browser run completed 100/100 games after pause/reload/resume, with zero aborted games and preserved pre-pause records.

## Test results

| Check | Status | Evidence |
| --- | --- | --- |
| Full registered test suite | PASS | 5,256 tests; 5,242 passed, 14 skipped, zero failed; 95 suites; 338.95 seconds |
| Evolution prototype + foundation cases | PASS | All 38 cases passed in the full run; zero lab skips |
| Routing / browser graph / architecture / test registration regressions | PASS | 75 tests; zero skipped or failed |
| Actual Chrome browser scenarios | PASS | 8/8; Chrome 154.0.8037.93; zero page errors |
| Build | PASS | Browser bundle and engine runtime generated successfully |
| Typecheck | PASS | Existing package scope and React client scope |
| Lint | PASS | Zero errors; 422 repository warnings remain |
| Final 2,000-game benchmark / retained replay verification | PASS | 2,000 clean; 12 verified; matching current fingerprint |
| Diff whitespace validation | PASS | `git diff --check` |
| Remote deployment / release certification | NOT_RUN | Outside this developer milestone |

Skipped tests are not passes. The detailed full-suite log records the skip context, including an unavailable legacy 4.1.0 vendor replay corpus. This milestone does not claim those paths were exercised. Existing typecheck scopes do not cover every JavaScript module; behavioral integration tests validate the new portable lab modules.

Browser scenarios exercise configuration rejection, real workers, pause/save/reload/resume, replay verification/stepping/bookmarks, artifact round trip/tamper rejection, independent frozen evaluation, stop/stale callback/route cleanup, mobile overflow/quota failure, and ordinary human-versus-AI match startup. Browser verification tests are executed as a separate harness, not inferred from source-string assertions.

Local evidence is retained in:

- `reports/local/evolution-full-tests-final.log`
- `reports/local/evolution-routing-tests.log`
- `reports/local/evolution-build.log`
- `reports/local/evolution-lint.log`
- `reports/local/evolution-typecheck.log`
- `reports/local/evolution-benchmark-final.json` and `.log`
- `reports/local/evolution-browser/report.json`, exported test artifacts, desktop/mobile screenshots and `.log`

## Known limitations

- No trainer, learned state, population, lineage tree, branching, Hall of Fame, rating system, experiment hypotheses/configuration cloning, meta clustering or ruleset parameter sweep exists yet. The UI exposes supported operations only.
- HybriX is excluded from lab admission until its state/time-sensitive paths have separate reproducibility evidence. Normal gameplay's existing AI remains available.
- The replay viewer is a verified command/event/score inspector, not a complete visual board playback or counterfactual policy-choice explorer.
- Only 12 full transcripts are retained; remaining games have seeds/configuration/checkpoint identities and hashes for rerunning, rather than instant full playback.
- Import hashes establish integrity/compatibility, not authenticity. Imported result claims are visibly unverified; inspecting a retained replay verifies that trajectory, not every historical result.
- Browser autosave is periodic; a crash can lose unsaved games. IndexedDB is origin-local and can be evicted. No automatic history pruning or checkpoint deletion interface is implemented.
- Confidence bounds assume independent seed-pair sampling and describe a fixed catalog cautiously. Removing failed pairs can bias comparisons; failure counts remain explicit.
- Failure diagnostics for engine throws or worker loss cannot recover an unavailable in-flight raw state. Completed command transcripts are retained when returned by the engine; infrastructure failures preserve the partial run and its configuration.
- There are no CPU-utilization presets, rate caps or million-game retention facilities. Four workers and 10,000 games are deliberate initial limits.
- Performance and determinism evidence is local to the tested environment. Cross-platform/million-game guarantees and remote hosting are not established.

## Storage characteristics

Every result retains stable schema, seed, seat, checkpoint IDs, terminal/error metadata, score/flow/action/event counters and state/command/result hashes. Generation-0 checkpoint payloads are immutable and implementation-bound. Browser history stores full artifact snapshots and a separate compact history index; checkpoint insertion prevents historical replacement.

Per-run bounds are 10,000 games, 12 full replays, 12,000 commands per transcript and 40 MiB per serialized artifact/import. The 100-game browser artifact was 582,258 bytes; the 2,000-game benchmark report was 4,987,250 bytes. These are observed examples, not universal size estimates; richer interactions and longer games change transcript size.

Save success requires IndexedDB transaction commit. Saves occur every 250 games and on pause, stop, completion and bookmarks. Quota failures leave the run in memory with visible diagnostics and working export. Exports are the portable evidence copy. Browser history is not silently pruned.

## Performance bottlenecks

The existing engine's immutable transitions and canonical hashing, Node rank/telemetry extraction, command retention and result hashing dominate per-game work. Certified checkpoints for all games were unnecessary overhead, so bulk Node runs use the existing runner's optional raw command transcript mode and certify retained evidence on demand. The default certified replay behavior remains unchanged.

Workers transfer slim result metadata and only retained/failing transcripts. Dashboard charts are bounded to the prototype's sample limit. Autosave serializes the current artifact periodically and can become costly near the 10,000-game cap. Future work should measure engine, hashing, telemetry, worker transfer and persistence costs independently before optimizing. No simplified alternative game engine was created.

## Recommended learning algorithm V1

Once the remaining experiment/evaluation tooling is stable, use explicit weighted-heuristic mutation and selection. It fits the existing policy scoring architecture, allows understandable parameter checkpoints and keeps legal action selection behind the authority boundary. Seed mutation separately from game randomness, preserve historical contenders, and select using frozen mirrored benchmark suites rather than current self-play win rate.

This is a recommendation, not implemented behavior. The current checkpoint schema rejects learned state. Introducing parameter state requires an explicit new schema/adapter, reproducibility tests, frozen evaluator invariants and historical benchmark admission.

## Recommended next phase

Add reproducible experiment manifests (name, hypothesis, starting checkpoints, seed catalog, configuration and notes), cloning with explicit changed fields, named multi-opponent evaluation suites and checkpoint comparison. Then broaden seed/adversarial/long-run admission and storage retention before learning. Keep adaptive updates gated until those phases have their own acceptance evidence.

Operating guide: [EVOLUTION_LAB.md](EVOLUTION_LAB.md). Initial forensics and implementation findings: [EVOLUTION_LAB_AUDIT.md](EVOLUTION_LAB_AUDIT.md).
