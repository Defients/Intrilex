# Evolution / Simulation Lab: Wave 3 evidence admission and coherent analytics

Date: October 8, 2026 (America/New_York).

Scope: R06 and R07 from the authoritative Phase 2 remediation plan. This
wave consumes the identity, receipt and recovery contracts established in
Waves 1 and 2. It does not implement Wave 4 capacity/backpressure work or
remove Wave 0 capability restrictions.

## Semantic admission (R06)

`packages/simulation-runtime/src/evidence-admission.mjs` provides the shared
`intrilex-admission@1` result. Existing artifact adapters still verify their
own envelopes, byte seals, schema contracts and storage boundaries. Admission
then reconciles retained sample/outcome identities, ordinal uniqueness,
claimed coverage, outcome counts, implementation provenance and compatibility.
Checksums alone do not establish scientific validity or authorship.

Raw-summary and batched Experiment artifacts receive the same semantic checks.
Batch checks additionally verify ordinal bounds, row counts, payload hashes
and retained receipts. Reload, inclusion, verification and export use the
same controller probe. A retained sealed manifest's descriptors, required
receipt hashes and headline counts are checked against its rows. Contradictory
counts, duplicate ordinals, changed outcomes or missing evidence cannot enter
analysis, including through "Include anyway".

Classification does not rewrite original evidence:

- **VERIFIED** means the retained contract is admissible for the stated
  analytical use. It does not establish external authorship, independent
  replication or promotion authority.
- **RESTRICTED_LEGACY** remains inspectable and exportable in its supported
  container but cannot enter scientific selection. Missing provenance or an
  unknown summary/identity schema is not filled from current defaults.
- Invalid or unreadable stored evidence is quarantined or marked unavailable
  and excluded. Verified export refuses a corrupt or incomplete chain.
  Unsupported outer envelopes are rejected at their existing adapter; the
  original external files are neither deleted nor silently converted.

Derived admission metadata resides outside the original immutable run hash.
Imports retain their original provenance and receive an explicit external
origin with no local promotion authority. Imported manifest headline metadata
is derived from the admitted original summaries and records its derivation;
original run/payload hashes remain unchanged. Historical imported manifests
without a headline are checked using retained rows, without inventing an
original headline.

Profile measurements retain paired sufficient statistics rather than raw
Experiment summaries. Their existing purpose, subject, pack, era and manifest
checks remain in place. Strict admission also checks unique opponents and
seeds, AB/BA scores, completion, clean/aborted/pair counts, paired scores and
the retained objective aggregate. The new behavior is registered as
`MEASUREMENT_ADMISSION@2`; the frozen version 1 function and source lock are
preserved for historical interpretation. Selection/optimizer rules and
promotion thresholds are unchanged.

Evolution inspection detects both execution and analysis identity drift. It
returns the original envelope plus a separate derived admission result.
Available retained Evolution count claims are reconciled against projected
rows. Foreign versions remain historical inputs rather than being certified
against the current implementation.

Decision fidelity is FULL only when every claimed row carries decision
evidence. Partial coverage is MIXED with covered/total counts. Replay coverage
does not equate an ordinal with reproducibility: it requires matching available
code and a reconstructed sample identity from retained inputs, including every
weighted seat's original state. A missing or different genome cannot pass.

## One accepted evidence snapshot (R07)

`intrilex-evidence-selection@1` records source artifact/admission digests,
receipt digests where retained, compatible cohorts, rejected sources, accepted
sample IDs, repeats and clean effective-sample counts. The selection and its
digest are immutable. Compatibility includes rules/profile/overrides,
execution and analysis fingerprints, and seed stream/catalog versions.

Identical deterministic samples contribute once. A contradictory outcome for
the same sample fails closed. Multiple compatible groups require an explicit
choice; the system does not select the largest or best-performing group.
Evolution and Manage Runs expose that choice while retaining other groups.

Evolution projections preserve executable subject, checkpoint, sample and
outcome identity. Analytical copies use executable subject IDs instead of
pooling different genomes under the same policy label. They also use the
deterministic sample as the analytical match ID, retaining the original
display ID in `sourceMatchId`. Original stored rows remain unchanged. This
keeps both numerical results and representative-match references distinct
when historical display IDs collide. Projection is idempotent for downstream
consumers. Meta Atlas labels distinguish subject snapshots.

The Experiment controller computes the accepted rows in its aggregation
worker. Evolution propagation uses the existing analytical builders. Both
publish aggregate, Observatory data, rank/swap/variant data, evidence basis,
selection digest and view status together only after computation succeeds.
A failure preserves the complete previous snapshot and records staleness
separately; the UI explains that it is showing the previous results. Library
curation cannot silently overwrite the basis attached to existing charts.
An explicit baseline restore clears the selected snapshot.

Meta Atlas caches by the full evidence content and selection digest, rather
than the count and endpoint IDs. Editing a middle row invalidates the cache.

Discover keeps its existing saved-Lab-run evidence scope. Admission excludes
historical implementations, imported claims, missing/restricted evidence and
subjects the scanner cannot execute faithfully. Its frozen snapshot includes
the exact accepted selection digest and unique samples. Scanning changed
source rows fails instead of silently using a different dataset. Missing
frozen source runs block ordinary evidence-driven discovery. The existing
auditor path based on previously retained targets remains separate. This does
not resolve or assert the audit's unproven checkpoint-confirmation hypothesis.

## Verification

Evidence directory:
`C:\Users\mcmll\.codex\visualizations\2026\10\07\01a11713-77b6-7e90-aa17-e129b39e5f3b\intrilex-audit`.

The registered `test/lab-trust-wave3.test.mjs` adds 19 focused regressions.
Existing storage, portability, discovery, Profile and Evolution tests were
adapted only where their fixtures or expectations overstated valid evidence.
Tests remain registered in both `package.json` and `scripts/ci.mjs`.

| Gate | Final result | Evidence |
|---|---|---|
| Repaired admission/portability/Discover/Profile contract checks | PASS: 113/113, zero skips/TODO | `wave3-repaired-focused.log` |
| Broader focused tests after final build | PASS: 327/327, zero skips/TODO | `wave3-focused-after-build.log` |
| Full root suite | PASS: 6,374 passed / 6,388 tests; 14 skips, zero fail/TODO | `wave3-full-suite-final.log` |
| Build | PASS | `wave3-build-final2.log` |
| Lint | PASS: zero errors/warnings | `wave3-lint-complete.log` |
| Root/client type checks | PASS | `wave3-typecheck-complete.log` |
| Native Chromium proof | PASS: six groups, zero page errors | `wave3-browser-final.json` |
| Source/built identity equality | PASS | `wave3-verified-identity.json` |

The native proof uses actual IndexedDB and the actual aggregation worker. It
verifies distinct genomes despite an identical display ID, two analytical
rows, failed recomputation preserving every snapshot component, rejection of
the 999-declared/two-row/duplicate-ordinal import, and retention of only the
valid import. It also reruns the prior-wave ownership/reservation/parity,
quota/reload-resume and capability-containment proofs.

An earlier broader run exposed the frozen admission-source contract and ran
consumer identity checks during a rebuild. The contract was versioned rather
than overwriting its historical lock. The final gate uses the completed build.
No failed or stale intermediate result is counted as a final pass.

## Remaining boundary

Automatic promotion and confirmatory comparison remain disabled. Existing
normal/deep execution limits remain in force. This is local functional
verification, not production, deployment, cross-browser or release approval.

Compatibility selection currently retains candidate rows before computation.
It does not establish a bounded-memory union, byte-aware backpressure or
capacity recovery guarantee. Those are R09 / Wave 4 work. Native browser
coverage is Chromium, not Firefox/WebKit, power-loss testing or a long-running
capacity soak. Historical evidence without executable subjects remains
restricted rather than being automatically upgraded.

The first complete suite reported 6,388 tests: 6,373 passed, one obsolete
export source-location assertion failed, and 14 were explicitly skipped. The
assertion now follows the shared snapshot publication path and its 11-test
export suite passes. The final full-suite rerun passed: 6,374 passed, zero failures, zero TODOs and 14 skips. The skips are one
missing vendor-corpus check and 13 service-worker checks disabled by the
existing PWA kill switch; they do not count as verified behavior.

After the final full suite, source, built and retained implementation
identities were rechecked and remained equal. The structured result is
`WAVE3_VERIFICATION.json`; final execution time was 384.36 seconds.
