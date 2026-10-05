# Batch Profile Matrix

The Evolution Lab's **Batch Matrix** is a scientific round robin over 2–8
participants: Custom Profiles and/or supported static policies. It generalizes
the existing static-policy frozen round robin (`matchup-lab.mjs`, artifact
schemaVersion 1) so a participant can also be a frozen Custom Profile head
snapshot, using the same `intrilex-profile-arena@1` resolution contract the
one-on-one Arena already uses.

Select participants → choose games per matchup → Start. Intrilex freezes the
manifest, executes every unique pairing as one balanced AB/BA series, and
renders a head-to-head matrix plus a descriptive aggregate leaderboard.

## Participants and configuration

- 2–8 participants; duplicates (same participant identity) and self-play are
  rejected. A participant is `{ kind: 'STATIC_POLICY', policyId }` or
  `{ kind: 'AGENT_PROFILE', agentProfileId }` with a stable
  `static:<policyId>` / `profile:<agentProfileId>` participant ID. Two Profiles
  on the same policy family remain distinct participants.
- `gamesPerMatchup` must be a positive even integer within `LAB_LIMITS.games`;
  every seed unit retains complete AB/BA balance. A single matrix `seed`
  derives per-ordinal game seeds through the existing `labGameSeed`.
- `workerCount` (1–`LAB_LIMITS.workers`) is operational only and does not enter
  the scientific identity. `strategicTrace` does.
- All Profile participants must resolve snapshots whose `rulesProfileId` equals
  the configured rules profile; incompatible or unavailable Profiles block
  Start with the reason surfaced in the roster.

## Freeze semantics

`createBatchMatrix` resolves each Custom Profile **exactly once** through
`store.resolveProfileHead`, reads the immutable head checkpoint, and stores the
full snapshot (head version, head-token digest, active revision, genome,
snapshot digest, rules profile, implementation fingerprint) plus the checkpoint
in the frozen manifest. Static participants get the same deterministic
`matrix:<policyId>` checkpoint the v1 lab used.

`matrixId = MX-<hash>` over the scientific manifest (participants, checkpoint
IDs, snapshot digests, games, seed, rules, trace flag, implementation
identity). Worker count and created-at time do not change it.

Changing a live Profile head, renaming, or removing the live Profile afterward
cannot retarget the matrix: execution and resume read only the frozen manifest.
Resume never calls `resolveProfileHead`.

## Execution

`runBatchMatrix` iterates the deterministic `i<j` cell plan. Each cell is a
normal Evolution Lab series (`kind: 'EVALUATION'`, `mirrorSeats: true`) created
by `batchCellRun`: it embeds the exact frozen checkpoints, carries
`matrixCell = { matrixId, seatA, seatB }` binding, and — when a Profile
participates — seat-aligned `arenaProfiles` snapshots validated by
`validateProfileArenaRun`. Cells execute through the existing
`runLabSeries`/`executeBrowserSeries`, which accept a prepared run and skip
already-committed ordinals, so an interrupted cell resumes at game granularity
without duplicating evidence.

Stop aborts future dispatch promptly, keeps every accepted record, and marks
the matrix `STOPPED` — a partial matrix can never claim `COMPLETE` (validation
throws `INCOMPLETE_MATRIX_CLAIM`). Resume skips `COMPLETE` cells, re-validates
incomplete runs against the manifest, and continues under frozen authority.
Mutation of the manifest during execution throws `MATRIX_MUTATED_MANIFEST`.

## Artifacts

Format `intrilex-matchup-lab`, **schemaVersion 2**, contract
`intrilex-batch-matrix@1`, `kind: 'FROZEN_ROUND_ROBIN'`, `purpose: 'EVALUATION'`.

- `batchMatrixArtifact(lab)` — self-contained export: frozen manifest plus all
  cell runs, content-hash bound. `validateBatchMatrixArtifact` re-validates the
  hash, manifest, every run envelope, snapshot digests, checkpoint bindings,
  cell uniqueness and completion claims.
- `batchMatrixManifest(lab)` — compact persisted form (`kind: 'MANIFEST'`):
  the frozen plan plus `runRefs` (`seatA/seatB/runId/status/records`); cell
  evidence stays in the run store and is never duplicated.
  `rehydrateBatchMatrix(manifest, loadRun)` rebuilds a resumable lab; missing
  runs leave cells pending, and a `COMPLETE` claim without its evidence fails
  closed.
- `validateMatrixEnvelope` dispatches: v1 static artifacts →
  `validateMatchupArtifact` (unchanged), v2 full artifacts, v2 manifests.
  Anything else fails closed.

## Storage

The browser `EvolutionStore` database is at version 3 with a dedicated
`matrices` object store. Only the compact manifest is persisted there; cell
runs persist through the existing `runs`/`history`/`checkpoints` path on cell
completion (and every 50 accepted games mid-cell). Replay retention remains
bounded by `LAB_LIMITS.replays` per run — clean replays are not hoarded.
`saveMatrix`/`save` enforce `LAB_LIMITS.persistRunBytes` with a distinct
`RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE` error; quota aborts surface as
`BROWSER_STORAGE_QUOTA_EXCEEDED`, and failed writes are queued separately so
completed evidence in memory is unaffected and exportable.

## Evaluation-only boundary

Matrix evidence is descriptive matrix performance — not a transitive rating,
not held-out measurement, not promotion evidence. No code path in the matrix
calls Profile mutation, training, selection or promotion APIs; runs carry the
existing `EVALUATION` kind. Changing live heads still requires the normal
authored-revision commands, exactly as before.

## Known limitations

- Maximum 8 participants (28 matchups); no self-play, no cross-rules matrices,
  no Swiss/brackets/ratings.
- An unsaved mid-cell run resumes at the last persisted boundary (completed
  runs are saved per cell; in-flight cells save every 50 games). In-memory
  resume is finer-grained.
- Estimated evidence footprint shown in preflight is advisory, not a measured
  guarantee.
- Aggregates are unweighted descriptive scores; no interval is fabricated at
  the matrix level (per-cell paired intervals come from the existing series
  metrics).
