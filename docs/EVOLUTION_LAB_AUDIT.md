# Evolution Lab: phase 0 architecture and determinism audit

Inspected October 2, 2026 (America/New_York). Target: the nested `Intrilex_dev-current` checkout. The two supplied specifications are identical. Scope ends at the first reliable vertical slice; adaptive learning is explicitly excluded. Existing uncommitted prototype files are retained and extended.

## Existing architecture and authority

- Node >=22 / pnpm workspace; browser application combines existing JavaScript workspaces and a React game client. Static browser hosting and a separate Node WebSocket authority server are existing boundaries.
- Canonical engine source: `upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/src`. `scripts/build-engine-patch.mjs` compiles it into `runtime/autonomy-engine-dist`. Do not hand-edit generated engine files.
- Node simulation: `packages/engine-adapter/src/adapter.mjs` routes `createSimulationState` → `createCoreMatchState` (or First Contact `createMatchState`); `createSimulationDecisionFrame` → `advanceCoreToDecision` / `advanceToDecision`; authorized action IDs resolve through a private command vault; `executeSimulationAction` → `IntrilexEngine.execute`.
- Player gameplay and browser simulation use the same compiled engine. `apps/lab-web/src/autonomy-runtime.js` provides `createState`, `advance`, `strictView`, `choosePolicy`, and `runBrowserPolicyMatch`. The browser and Node loops are existing separate orchestration implementations, not separate rules authorities. This milestone must verify replay execution, rather than assume their summary hashes are interchangeable.
- `packages/simulation-runtime/src/runtime.mjs:runPolicyMatch` supplies outcomes, per-seat metrics, decisions, events/facts, result/state hashes and optional engine-certified replay. The command recorder includes automatic orchestration commands as well as policy actions.
- IDs: default player seats P1/P2; actual cards live in `state.cards` and authoritative zones. Scoring is `deriveSecuredPoints`; victory/termination is reported by engine decision frames. The lab must not recreate either rule.
- Normal AI: baseline catalog in `packages/policies/src/index.mjs`, policy SDK in `packages/policy-sdk/src/contracts.mjs`, and HybriX adapter in `packages/game-ai/src/policy-adapter.mjs`. Policies receive authorized views and legal action IDs, not raw state or executable commands.
- Existing simulation/campaign tooling: `runtime.mjs`, `campaign.mjs`, Node workers, batch CLI; telemetry/statistics/analytics packages; browser worker. Certified replay, Caster and IndexedDB player replay library already exist. Lab storage is a separate developer artifact boundary.
- Existing uncommitted prototype: `/evolution` route, `workspaces/evolution.js`, `evolution/evolution-core.mjs`, worker protocol, chart/CSS and tests. It is explicitly non-learning, bounded to 10,000 games / four workers, and currently retains aggregate counts only.

## RNG and determinism findings

- Canonical `src/rng.ts` implements xorshift32 with explicit seed/cursor. `core-autonomy.ts:createCoreMatchState` requires a nonzero uint32 and applies setup through an engine command. Shuffle/deal therefore belongs to the engine.
- Baseline policy RNG is separately derived from seed, player ID, policy ID and `POLICY_V4`; baseline policies select only generated legal actions. Zero is normalized to one by existing runners; the lab must record this convention.
- Browser execution-instance tokens use time/randomness solely for process-local AI cache ownership. They must never enter serialized trajectory identity. Policy/game seeds remain deterministic.
- HybriX contains wall-clock diagnostics and stateful per-match memory. Its lookahead implementation includes time budget support. Existing AI is practical to wrap, but unrestricted claims of cross-machine reproducibility require separate evidence. Initial frozen lab baseline admission uses the five deterministic baseline policies, including current shipped heuristic implementations; HybriX is deferred pending its own admission tests.
- Version strings alone cannot identify modified engine/policy bytes. Fingerprint actual compiled engine modules and baseline policy/scoring/runner implementations. Checkpoints must validate the policy implementation digest and ruleset fingerprint.
- Prototype series alternates seats but gives every ordinal a different seed. Frozen evaluation requires paired seed reuse (AB/BA) and an even sample count.
- Wall duration/throughput is operational metadata, not part of reproducible match identity.

## Findings resolved during implementation

- A real seed (series seed 42, ordinal 16, game seed 3484793158, score-rush/control) exhausted the engine's default **16 orchestration commands** immediately after completing a full turn. The final state had phase Start, no stack, no priority, and no pending private choice; this was a budget boundary rather than an illegal policy action. The lab now explicitly passes **256** to the existing engine orchestration API. Normal simulation and browser gameplay callers retain the 16-command default. The canonical engine source and rules are unchanged. A regression test reproduces the default failure and verifies that the lab completes and replays the same seed legally.
- `experiment-controls.js` still imported `app.js` dynamically and installed a second route listener. This instantiated another entry graph during navigation, resetting the lab's in-memory session. It now uses the existing render bus and registered app callbacks. Browser coverage verifies that leaving the route pauses the existing run and returning preserves it.
- Replay retention originally admitted records whose transcripts had not crossed the worker boundary. Retention now requires a transcript and chooses samples deterministically by bookmark, failure, then ordinal priority. Replay failures are preserved in benchmark reports rather than preventing evidence export.
- Per-game duration is recorded as operational metadata and deliberately excluded from the semantic result hash. Series timing and per-game timing are different measurements.
- Imported artifacts validate schema, budgets, checksums and implementation compatibility; the dashboard identifies imported outcomes as unverified external claims. A checksum is not an authenticity signature.

## Reuse, refactors and missing primitives

Reuse engine, legal action surfaces, baseline policies, both existing match runners, certified replay verifier, worker infrastructure, chart toolkit and route lifecycle. Keep player saves/networking and normal AI behavior intact.

Add browser-safe typed/versioned lab domain contracts, immutable content-addressed checkpoints, evidence-enriched game records, strict fingerprint validation, paired schedules, an evaluator independent of self-play counts, durable developer artifact storage and deterministic replay reconstruction. Extend the prototype's controls with pause/resume, evaluation, checkpoint history, replay inspection and artifact import/export. No trainer or unsupported learning controls.

Proposed files:

- `packages/simulation-runtime/src/evolution-domain.mjs`: portable schemas, checkpoint validation, paired scheduling, metrics and evaluation contracts.
- `packages/simulation-runtime/src/evolution-lab.mjs`: Node adapter using `runPolicyMatch`, replay validation and actual implementation fingerprint.
- `scripts/evolution-identity.mjs`: implementation/ruleset identity shared with browser build.
- `apps/lab-web/src/evolution/evolution-session.mjs`: scheduling/run state and bounded evidence ownership.
- `apps/lab-web/src/evolution/evolution-store.mjs`: IndexedDB persistence and validated import/export.
- Existing `workspaces/evolution.js` / `worker.js`: dashboard and engine execution adapters.
- `scripts/evolution-benchmark.mjs`, focused tests and technical report.

## Risks and implementation sequence

1. Keep all rule execution at existing authority. Validate config/policy admission before work begins; quarantine failures with seed/action evidence.
2. Bind runs/checkpoints/replays to compiled engine + baseline implementation fingerprints. Avoid stale generated release manifests as proof.
3. Enrich worker results with commands, hashes, action/event counts and checkpoint identities. Retain bounded replay samples and all slim results; never accumulate full replays for 10,000 games.
4. Use ordinal ownership/deduplication and paired seeds. Pause terminates workers and resumes only unrecorded ordinals; completed results are not counted twice. Route cleanup releases workers.
5. Add immutable checkpoints and frozen, balanced evaluation with explicit sample size/uncertainty. Failed games do not become draws or silently enter strength estimates.
6. Persist artifacts independently of player storage; reject malformed, incompatible or tampered imports. Surface quota failures. Never execute imported code.
7. Add dashboard, replay stepping, export and history; test actual browser workers and pause/resume.
8. Run determinism/replay/checkpoint/metrics/persistence/evaluation/concurrency tests, thousands of headless games, relevant gameplay regression, lint/typecheck/build. Record PASS/FAIL/NOT_RUN accurately.

## Acceptance tests

- Repeated seeds/config/checkpoints produce identical initial state, shuffle/deal, commands, final-state hash and semantic result; operational timing excluded.
- Re-executing recorded commands verifies every transition and final hash; changed seed/command/fingerprint is rejected.
- Paired evaluation provides equal seat exposure with the same seed in both seats and never updates a policy.
- Serial vs reordered/multiple worker partitions produce identical ordinal-indexed records and aggregate metrics.
- Duplicate/stale worker messages cannot inflate counts; pause/resume restores pending ordinals and stop prevents further ingestion.
- Checkpoint round trips reproduce immutable policy identity; tampering and incompatible implementation/ruleset are rejected.
- Abort/stall/illegal actions remain diagnostic errors and are excluded from completed-game win rates.
- Import/export/restart retains configuration, all slim results, bounded replay evidence and checkpoints; storage errors are visible.
- Thousands of engine games run headlessly without UI, with throughput and failed-game accounting reported.
- Normal gameplay authority/privacy/determinism tests and actual browser lab interactions pass before milestone reliability is claimed.
