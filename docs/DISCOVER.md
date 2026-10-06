# DISCOVER — autonomous research engine

DISCOVER is an evidence-driven research instrument inside the Simulation Lab. It scans accumulated series evidence for testable anomalies, formulates falsifiable hypotheses, runs targeted controlled experiments, attempts to falsify its own signals, replicates survivors, and promotes only results that pass every promotion gate into durable Discovery artifacts.

It is deliberately optimized to be hard to fool. A run that ends with **zero discoveries is a successful, valid outcome** — hypotheses were tested and did not survive the evidence gates.

## What DISCOVER does not claim

- Observed candidates are **signals, not findings**. The scan reads only stored evidence; nothing is promoted without fresh controlled games.
- Effects are **reproducible associations inside deterministic self-play simulation**, not causal proofs. Discovery artifacts carry a fixed limitation notice to that effect.
- No prose decides promotion. The judgment is a deterministic gate evaluation over measured counts and intervals.
- DISCOVER never fabricates games, confidence, or provenance. Every promoted claim references the exact experiment runs that measured it.

## Pipeline

```
Evidence Scan → Candidate Detection → Hypothesis → Targeted Experiment
→ Challenge / Falsification → Replication → Judgment → Discovery Artifact
```

1. **Evidence scan** — all admissible Lab series on the executing origin are frozen into an evidence snapshot (`snapshotId`, run IDs, game count, fingerprint). Foreign-fingerprint and unverified-import runs are counted and disclosed as excluded, never pooled.
2. **Candidate detection** — the scan builds an evidence index (pairings, policies, seats, mechanic cohorts, turn lengths, fault rates) and emits candidates where observed values deviate from a defensible baseline beyond the noise floor. Surprise scores are only computed when a baseline exists; they are never fabricated.
3. **Hypothesis** — each admitted candidate becomes a falsifiable hypothesis: claim, metric, direction, minimum effect, expected value, falsification condition, known confounders, scope, and a staged experiment plan with derived deterministic seeds.
4. **Targeted experiment** — stages execute through the same `runLabSeries` / `executeBrowserSeries` machinery as the rest of the Lab: mirrored EVALUATION series, fresh seeds, budget-capped.
5. **Challenge** — confirm stages always run the seat-mirror check; card candidates get a population challenge against a control opponent; a failed population challenge narrows scope to a conditional claim rather than silently dropping it.
6. **Replication** — two or more independent-seed batches beyond the confirm stage. Replication counts are tracked separately from the discovery batch; a failed batch rejects the claim.
7. **Judgment** — deterministic promotion gates over pooled evidence (below).
8. **Artifact** — promoted results become content-hashed `intrilex-discovery` envelopes with the full gate ledger, challenge results, provenance (run ID, snapshot, experiment run IDs, fingerprint), scope, and status history.

## Modes

| Mode | Scheduling bias |
|------|-----------------|
| `open` | Balanced weights across all categories |
| `explorer` | Novelty and evidence-gap weighted — unusual interactions, rare patterns |
| `auditor` | Re-tests prior Discovery artifacts as falsification targets |
| `balancer` | Matchup/card/seat signals weighted — potentially problematic effects |
| `bug-hunter` | Integrity anomalies, outliers, discontinuities weighted |

Modes only change candidate priority weights. They never change what evidence is admissible or what the gates require.

## Candidate priority

`priority = geometricMean(novelty, impact, signal, evidenceGap, testability) × costDiscount`

All components are normalized 0–100 and exposed separately on every candidate so the queue is auditable. Compute cost acts as a bounded discount factor — cheap investigations keep more priority; expensive ones are deprioritized, not excluded.

## Lifecycle

`observation → candidate → hypothesis → supported_finding → replicated_finding → discovery | conditional_discovery | rejected | unresolved`

Plus execution substates `queued → testing → challenging → replicating`. Transitions are append-only (`lifecycle[]`); a `conditional_discovery` records the challenge that narrowed its scope in `scope.note`. Nothing overwrites history.

## Promotion gates

Centralized in `PROMOTION_GATES` (`discovery-domain.mjs`):

| Gate | Requirement |
|------|-------------|
| `MIN_SAMPLE` | ≥ 200 pooled decisive games (confirm + replication batches) |
| `EFFECT_DIRECTION` | pooled estimate direction matches the claim |
| `MIN_EFFECT` | \|estimate\| ≥ 3 percentage points |
| `CI_EXCLUDES_NULL` | pooled 95% interval excludes the null |
| `CI_WIDTH` | interval width ≤ 0.25 (aligned with the SUPPORTED evidence tier) |
| `EVIDENCE_GRADE` | `evidenceGradeDetailed` ≥ SUPPORTED on the pooled estimate; a conservative p-value read off the interval is supplied as the multiplicity term |
| `REPLICATION_COUNT` | ≥ 2 independent replication batches, all passed |
| `NO_REPLICATION_FAILURE` | no batch contradicts the claimed direction |
| `SEAT_MIRROR` | orientation-split estimates consistent (matchup/card/profile claims) |
| `POPULATION_CHALLENGE` | challenge must not be inconclusive; failure narrows to `conditional_discovery` |
| `NO_UNRESOLVED_CONFOUND` | no check may remain inconclusive at promotion |

Verdict precedence: hard refutation (CI refutes / failed replication / seat confound) → `rejected`; all gates pass → `discovery`; all pass but population challenge failed → `conditional_discovery`; sample/width/grade gaps → `unresolved`.

Confidence is `HIGH` when the evidence grade reaches ROBUST with ≥3 passed replications, otherwise `MODERATE`.

## Seat confounds

Every confirm/replicate batch is mirrored AB/BA. A matchup signal whose direction is inconsistent across orientations is rejected as seat-confounded — and if the orientation gap itself is strong enough, DISCOVER spawns a new `seat`-category hypothesis mid-run (`spawned` journal event) rather than discarding the finding.

## Reproducibility

- Stage seeds derive deterministically: `stageSeed(runSeed, hypothesisId, stageKey)`.
- Every stage series is a normal Lab run persisted in the `runs` store; its `runId` is recorded on the stage and in `run.experiments`.
- A paused run resumes mid-stage: the partial series is persisted on stop and reloaded via `resumeStageRun` on the next `executeDiscoveryRun` call.
- Run and artifact envelopes carry `contentHash` over the canonical payload; historical loads re-validate hash + fingerprint and downgrade RUNNING to PAUSED.

## Storage

IndexedDB `intrilex-evolution-lab` schema v5 adds two stores:

- `discoveryRuns` — `intrilex-discovery-run` envelopes keyed by `payload.runId`
- `discoveries` — `intrilex-discovery` envelopes keyed by `payload.discoveryId`

Both share the existing `persistRunBytes` budget. Experiment runs are ordinary series artifacts in the existing `runs` store — discovery artifacts reference them by ID and never duplicate records.

## Browser workflow

`pnpm run build`, serve `apps/lab-web/dist`, open `#/discover`. Configure mode, game budget (128–64,000), confirm-stage size, workers, profile and run seed, then **Start Run**. The queue shows hypotheses with their score breakdown and stage status; the journal streams real state transitions; **Pause** stops cleanly mid-stage for resume; **Past Runs** reloads historical runs read-only; the **Discovery Library** lists promoted artifacts with inspectable gate ledgers and provenance.

## Files

| Layer | File |
|-------|------|
| Contracts, gates, artifacts | `packages/simulation-runtime/src/discovery-domain.mjs` |
| Evidence index + candidates | `packages/simulation-runtime/src/discovery-scan.mjs` |
| Orchestrator | `packages/simulation-runtime/src/discovery-engine.mjs` |
| Browser adapter | `apps/lab-web/src/evolution/discovery-runner.mjs` |
| Persistence | `apps/lab-web/src/evolution/evolution-store.mjs` (v5) |
| Workspace UI | `apps/lab-web/src/workspaces/discover.js` + `css/discover.css` |
| Tests | `test/discovery.test.mjs` |

## Known limitations

- V1 candidates come from the series-evidence store only; match-ledger and replay evidence are not scanned yet.
- Card hypotheses condition on a coarse used/unused cohort (`mechanicCounts > 0`), not timing or sequencing.
- The population challenge tests one control opponent; broader population studies remain future work.
- `turn-phase` candidates are descriptive anomalies (game-length outliers), not phase-mechanism claims.
- A `Theorist` mode, knowledge-graph relations, rule-mutation handoff, and long-lived research programs are architecturally unblocked but intentionally unimplemented.
