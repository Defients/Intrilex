# Lab experimental trust — Wave 0 containment contract

Date: October 7, 2026 (America/New_York).

Scope: R00 only from the Phase 2 remediation plan. This is containment and an
executable acceptance contract, not certification of the experiment system.
The implementation started from clean commit
`34a12dd18059bc0690b48d3c1afdd26de210f674`. The audit inspected an earlier dirty
tree at `4f18ab5b610846450ff31d4513e0513753fb69ee`; focused reproductions establish
the applicable failures on the newer baseline. No second repository audit was run.

## Enabled and restricted capabilities

| Capability | Wave 0 behavior | Reopening gate |
|---|---|---|
| Training, deterministic simulation, descriptive analytics | Available as exploratory work; statistical summaries are not confirmatory authority. | No reopening required; later admission/cohort repairs still apply. |
| Profile automatic promotion | Suspended at `promotionAuthority`, including direct `ProfileStore.promote` callers. An `APPROVE` recommendation alone cannot change the Head. | R01/R05/R06 acceptance: complete identity, atomic challenge reservation and semantic evidence admission. |
| Confirmatory paired comparisons | Explicit confirmatory requests are refused. `canCompareMeasurements` without a purpose means descriptive compatibility only. | R01/R06/R07 acceptance. |
| New Discovery promotion | Statistical gates continue to run, but the containment gate prevents promoted/conditional discovery claims. Hypotheses, measurements and negative results remain available. | R01/R06/R07 acceptance. |
| Existing discovery/profile history | Retained and inspectable. Historical labels are not current recertification. | Purpose-specific admission in R06; never blanket approval. |
| Durable campaign start/resume without IndexedDB | Refused before writing a manifest, changing a retained manifest or starting execution. Existing memory-backed evidence remains inspectable/exportable. | R08 explicit session-only lifecycle, if introduced. |
| Manual activation, authored revisions, rollback | Remain explicit human choices with existing reasons, journal and Head checks. They do not become automatic promotion. | Existing invariants remain mandatory. |

The frozen policy `intrilex-lab-containment@1` is a capability policy version,
not a new persisted experiment schema. There is no UI, environment-variable,
imported-artifact or constructor override for production restrictions. Removing
a restriction requires a reviewed code change with its reopening evidence.

Current persistent campaigns remain exploratory and still have known concurrency,
coverage and resume defects. Wave 0 does not make those paths safe for confirmatory
research. It prevents specified uses and claims while retaining their reproductions.

## Frozen requirements for later implementations

These are acceptance requirements, not implemented new field layouts. Existing
storage, identity and artifact versions are unchanged.

1. Run occurrence identity must be unique across tabs; a display ordinal is not
   ownership. Only the store's current fenced owner may mutate a run.
2. Executable subject identity must include the actual compiled state/genome and
   appropriate immutable revision/checkpoint references. Policy names are labels.
3. Execution compatibility must account for all decision-affecting dependencies,
   rules, seed streams and limits. Analysis/protocol compatibility is separate.
4. A deterministic sample and an execution occurrence are different concepts.
   Repeated samples do not increase independent effective sample size; conflicting
   outcome digests for the same complete sample identity are integrity failures.
5. Batch commits must be atomic and idempotent. Coverage comes from retained,
   validated ordinals. A largest ordinal cannot certify contiguous coverage.
6. Completion, partial sealing, clean scientific eligibility and persistence are
   separate facts. Every claimed count must reconcile with retained evidence.
7. Cancellation, takeover, failure and finalization fence old callbacks. Resume
   uses original pinned inputs and compatible code, or refuses to resume.
8. Challenge-attempt eligibility and exposure must be reserved atomically. A
   cancelled or failed exposed attempt cannot disappear into an unrecorded retry.
9. Hash validity does not establish schema support, uniqueness, completeness,
   subject validity or compatibility. All admission paths need semantic checks.
10. A derived view and its evidence basis must publish as one coherent snapshot.
    Unknown identity or unsupported provenance cannot back confirmatory results.

## Historical evidence and migration policy

- Preserve original artifacts, hashes, IDs, references and raw exports.
- Missing historical provenance remains unknown. Never substitute a live profile,
  current engine version, present-day defaults or today's policy for missing data.
- Later admission may classify an artifact as verified for a specific purpose,
  restricted/legacy, or invalid/quarantined. None of these requires deleting it.
- A checksum-valid legacy artifact is not automatically semantically valid.
- Existing imported claims cannot create local automatic promotion authority.
- Rebuild derived indexes from admitted evidence when that later wave lands.
  Do not treat saved chart caches as authoritative evidence.
- No data migration, database version bump, checkpoint rewrite or ID rewrite is
  part of Wave 0.

## Regression evidence and commands

Run from the repository root:

```powershell
node --test test/lab-trust-wave0.test.mjs
node scripts/browser-proof-lab-trust-wave0.mjs
```

The unit suite has active containment assertions and seven **executed TODO
acceptance assertions** for unresolved later-wave defects. TODO does not mean
repaired or skipped: their desired invariants are asserted and currently fail.
The native browser command separately reproduces the allocation collision using
two actual IndexedDB connections. It reports that case as `KNOWN_FAILURE`, not
PASS, alongside containment results. It uses isolated browser contexts and an
ephemeral loopback server; it does not touch the user's browser data.

The browser harness bundles the current changed source modules in memory using
the existing built engine and assets. Version-query imports resolve once, so
stale hashed bundles and duplicate state modules cannot hide the change. This
is a source integration proof, not a complete production-build certification.
The normal build copies the shared policy to the browser's portable directory.

Verification on the frozen Wave 0 source reproduces the allocation defect.
The shared workspace subsequently received separate allocation, ownership,
sample-identity and coverage changes. The current browser command includes
their allocation assertion; its passing result belongs to that additional
work. It does not certify those later tickets as part of Wave 0. Retain the
baseline reproduction and run strict acceptance checks before reopening any
restricted scientific capability.

To enforce the deferred acceptance conditions as failing gates:

```powershell
$env:INTRILEX_TRUST_STRICT = '1'
node --test test/lab-trust-wave0.test.mjs
Remove-Item Env:INTRILEX_TRUST_STRICT
node scripts/browser-proof-lab-trust-wave0.mjs --strict
```

Strict mode is a test-runner setting only; it cannot enable a production feature.
Until the later tickets are implemented, these commands are expected to exit
nonzero. Do not use a normal-mode zero exit code to claim those tickets passed.

| Captured defect | Desired assertion | Deferred ticket |
|---|---|---|
| Cached run allocation collision | Two controllers retain distinct occurrences; native IDB proof accompanies unit harness. | R02 |
| Boot invalidates live owner | Opening a second controller leaves the live owner's run running. | R02 |
| Failed middle batch disappears from frontier | Ordinals 2 and 3 remain pending after retaining 0,1,4,5. | R03 |
| Identical batch increases count | Retry cannot increase committed sample count. | R03 |
| Two executable genomes share match identity | Different real outcomes from distinct genomes cannot collapse under the current consumer key. | R01 |
| Concurrent challenges both claim attempt 1 | At most one first attempt is automatically eligible. Wave 0 blocks promotion independently. | R05 |
| Hash-valid contradictory legacy artifact admitted | Two duplicate rows cannot certify a declared 999-match dataset. | R06 |

The controller diagnostic fixture explicitly advertises persistence over memory
to reach unresolved controller paths. It is not a durability proof. Only the
separate native test establishes the observed IndexedDB collision.

Existing generic Head transaction, rollback, retention, snapshot and export tests
use explicit manual activation where their setup previously auto-promoted a
fixture. They continue to test the live production store without bypassing its
containment policy. A separate journal-preparation test captures the proposed
artifact without committing it. Automatic promotion rejection itself is tested
through both the science entry point and the store authority boundary.

## Wave boundary

Not implemented: R01 identity redesign; R02 transactional allocation/fencing;
R03 receipt/coverage repair; R04 worker/resume redesign; R05 atomic reservation;
R06 semantic admission/migration; R07 cohort/snapshot repair; R08 persistence
state redesign; R09 bounded pipeline; R10 final release certification.

The storage-availability check and suspension policy are R00 containment, not
completion of those later tickets. No engine rules, RNG, policy weights,
statistical thresholds, seed allocation or training selection changed.
