# Evolution / Simulation Lab: Wave 2 hardening

Date: October 7, 2026 (America/New_York).

Scope: the R02/R03 acceptance defects that remained after the Wave 1 baseline
(`5bbd6bc66d2887bfe26c3f1df6425034fa1e8171` plus the in-flight Wave 1 working
tree), the full-frame Caster authorization contract, manifest metadata scaling,
and Wave 0 policy-aware scientific eligibility in the evidence dashboard. This
document describes implemented repairs and their limits. It does not lift any
Wave 0 restriction and does not certify the experiment system for confirmatory
research.

## Store-authoritative sample-range allocation (R02)

`ExperimentStore.allocateRunManifest` now reserves the run occurrence AND the
sample-ordinal range in a single transaction over the runs and manifests
tables. The allocated base is computed from the store's authoritative state
(`ordinalReservationEnd` covers sealed runs, live/interrupted manifests and
imports), not from the caller's preliminary `nextRunOrdinalStart()` read.

- A caller base below the frontier is stale and is rebased upward; a base at
  or above the frontier is honored (ordinal gaps are legal).
- Caller-supplied segment ranges are shifted onto the allocated range before
  the manifest is written; the returned manifest is the only source of truth.
- `experiment-controls.js` drives workers from the allocated manifest's
  absolute ranges translated back to worker-relative ordinals. Two tabs can
  no longer receive overlapping deterministic samples.
- Resume reuses the manifest's pinned ranges; it never reserves a second
  range.

## Strict batch admission (R03)

`planManifestBatchCommit` is now a gate, not a flag. It runs inside
`ExperimentStore.commitRunBatch` against the manifest read in the same
transaction — a stale in-memory controller copy cannot admit evidence.

Rejected durably (integrity failure mark persisted, batch not stored,
committed coverage unchanged):

- `RUN_BATCH_EMPTY` — no carried summaries.
- `RUN_BATCH_ORDINAL_INVALID` — non-integer or negative ordinals.
- `RUN_BATCH_ORDINAL_DUPLICATE_IN_BATCH` — an ordinal appearing twice.
- `RUN_BATCH_ORDINAL_OUT_OF_SCHEDULE` — ordinals outside the reserved
  segment schedule (previously retained-and-flagged; now rejected).
- `RUN_BATCH_MATCH_COUNT_MISMATCH` — declared `matchCount` differs from the
  carried summary count.
- `RUN_BATCH_ORDINAL_RANGE_MISMATCH` — declared `[ordinalStart, ordinalEnd)`
  does not equal the exact contiguous span the batch carries.
- `RUN_BATCH_PARTIAL_OVERLAP` — some ordinals already retained but not all.
- `RUN_BATCH_OVERLAP_UNVERIFIED` — overlap whose retained digest cannot be
  resolved from manifest or committed batch rows.
- `RUN_BATCH_SAMPLE_CONFLICT` — a conflicting digest for a retained ordinal
  (prior evidence is preserved).

An identical whole-batch retry (every ordinal retained with matching digests)
is an idempotent no-op: `duplicate: true`, no coverage change, no new
descriptor.

For compact manifests, the store resolves retained digests for overlapping
ordinals from the committed batch rows before planning, so conflict detection
works without manifest-side per-ordinal hashes.

## Exact finalization coverage (R03)

`finalizeExperimentRun` and the store's `finalizeRun` both enforce that the
retained ordinal set is a subset of the reserved schedule —
`RUN_COVERAGE_MISMATCH` otherwise. A complete seal requires
`retained.size === requestedMatches`; combined with the subset check this is
exact set equality, so `{0, 1, 999}` can never seal as "3 of 3".

Intentionally partial seals remain honest: the run record carries
`requestedMatchCount` and explicit `ordinalCoverage`, and a `retentionNote`
states the deficit. `canonicalResultHash` is rebuilt from hash-verified batch
rows (`RUN_PAYLOAD_MISSING` / `RUN_PAYLOAD_HASH_MISMATCH` on any gap) — never
from manifest bookkeeping.

## Manifest metadata scaling (R03)

New manifests no longer carry a per-ordinal `retainedOrdinals` map, and
committed-batch descriptors no longer repeat per-match `matchResultHashes`.
Coverage derives from descriptor ranges (strict admission makes ranges exact);
per-match digests live once, in the committed batch rows.
`manifestRetainedOrdinals` reads all three representations, so legacy
manifests remain fully readable.

Measured metadata (manifest only, `EXPERIMENT_LIMITS.metaBytes` = 512 KB):

| Matches | Batches | Manifest bytes |
|---|---|---|
| 2,000 | 40 | ~8.3 KB |
| 6,000 | 120 | ~23.3 KB |
| 10,000 | 200 | ~38.5 KB |

## Full-frame Caster authorization

`detectHandAuthorization` scans every replay frame. Any frame with missing
hand identity, `HIDDEN`, `OPAQUE-HIDDEN` or otherwise redacted cards fails
closed to `PUBLIC` — a late-frame redaction revokes omniscience even when
earlier frames were authorized and the caller requested `OMNISCIENT`.
Requesting omniscient mode never grants authorization.

## Policy-bounded scientific eligibility

The Evidence workspace imports `LAB_TRUST_POLICY` and treats it as an explicit
eligibility input. A structural/analytics PASS is data quality, not authority:
while `confirmatoryComparison`/`automaticPromotion` are disabled the composite
reports `LIMITED` with an explanation, and the section lists the classification
and both blocked capabilities with their reason codes.

## Regression evidence

`test/lab-trust-wave2.test.mjs` (16 tests) is registered in `package.json`
and `scripts/ci.mjs`. It covers: cross-controller disjoint range allocation,
stale-base rebasing, above-frontier honoring, resume range pinning, every
admission rejection code, partial-overlap/idempotent-retry semantics, exact
finalization coverage on both controller and store paths, honest partial
sealing, manifest scaling at 2k/6k/10k, late-frame Caster redaction, and
Wave 0 policy-bounded eligibility.

`scripts/browser-proof-lab-trust-wave0.mjs` additionally asserts that two
independent IndexedDB-backed controllers receive distinct occurrences AND
non-overlapping sample ranges.

## Verification and limits

Verified on this tree:

```text
pnpm test                  # full suite
pnpm run lint              # 0 errors, 0 warnings
npx tsc --noEmit           # 0 errors
pnpm run build
pnpm run test:determinism  # 4/4
pnpm run test:privacy      # 3/3
pnpm run release:scan-secrets      # 0 violations
pnpm run release:identity:verify   # no drift
pnpm run engine:manifest:verify    # no drift
node scripts/browser-proof-lab-trust-wave0.mjs
```

Not done, not claimed:

- Wave 0 containment is unchanged: automatic promotion, confirmatory
  comparison and new Discovery promotion claims remain blocked; durable runs
  still require IndexedDB.
- R06 (semantic admission/migration of legacy artifacts) stays a deferred
  TODO gate in `test/lab-trust-wave1.test.mjs`.
- R04 worker/resume redesign, R07 cohort/snapshot repair, R09 bounded
  pipeline and R10 release certification remain later work.
- Memory-backend and imported artifacts remain exploratory evidence; passing
  suites do not recertify historical runs.
- Seal-time coverage checks enforce subset-of-schedule; completeness for a
  final seal additionally relies on `requestedMatches` matching the reserved
  schedule span, which `createRunManifest` keeps consistent.
