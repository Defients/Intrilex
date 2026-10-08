# Evolution / Simulation Lab: Wave 1 trust foundations

Date: October 7, 2026 (America/New_York).

Scope: R01, R02, R05 and R08 in the Phase 2 remediation plan. This document
describes the Wave 1 implementation, its compatibility boundaries and its
verification. It does not authorize later waves or remove Wave 0 restrictions.

## Identity contracts (R01)

New implementation identities retain the existing fingerprint envelope and add
`identityContract: intrilex-implementation@2`. A reviewed dependency manifest
binds the execution sources separately from the analysis/protocol sources.
Literal imports are followed with the TypeScript parser; generated browser
mirrors resolve to their authoritative sources. Engine/vendor files, policy
implementations, workspace package metadata, the lockfile and build machinery
are bound. Source line endings are normalized before hashing. An unresolved
local dependency prevents identity generation.

- `fingerprint` binds execution behavior, engine/rules versions and policy code.
- `analysisFingerprint` binds that execution fingerprint and the analysis,
  telemetry, experiment and scientific protocol dependencies.
- `SUB2-…` identifies the ordered executable subject, including its compiled
  state, effective adaptive configuration and supplied checkpoint/revision/
  frozen-snapshot references. Display names are excluded.
- `M3-…` is `deterministicSampleId`, using `intrilex-sample@3`. Its inputs include
  the execution fingerprint, rules/profile/overrides, ordered seats/subjects,
  actual seed, seed stream/catalog versions, execution budgets and any supplied
  initial state. The display ordinal and run occurrence are excluded.
- `intrilex-outcome@1` binds the shared ordered command-stream digest, terminal
  state, winner, termination and scores. Node and browser use this same contract.
- `executionOccurrenceId` describes a particular execution. It is outside the
  canonical simulation summary and does not turn a repeated deterministic
  sample into independent evidence.

Existing `matchId`, `matchResultHash` and certified replay hashing remain intact.
The new identity retains `legacyMatchId`; historical IDs are not rewritten.
The adapters' legacy summary hashes can differ even when their commands and
terminal states agree. Cross-adapter outcome comparison uses the new versioned
outcome digest, rather than silently redefining the legacy hash.

New campaign manifests pin the full implementation and seed contracts at
allocation. Their immutable input digest prevents changes to their scientific
configuration or occurrence after allocation. A pinned manifest cannot accept
summaries missing the new identity or bearing different execution/analysis
fingerprints. Resume refuses unknown or changed execution/seed contracts;
finalization takes version provenance from the original manifest. It never
fills missing historical versions from today's build.

New evaluation eras use `EVALUATION_ERA@2` and bind the analysis fingerprint.
The original version 1 resolver and its source-lock entry remain unchanged for
historical identities. New contract behavior has its own source-lock entry.

The identity contract does not, by itself, implement semantic admission,
independence counting, conflict-aware pooling or compatible evidence views.
Those remain later-wave work under the existing capability restrictions.

## Store-owned allocation and ownership (R02)

Run allocation reads existing runs and manifests and writes the new manifest in
one transaction. Sealed records without manifests still reserve their run IDs.
Each new manifest has an independent occurrence ID; cached controller counters
do not confer ownership.

Ownership uses a monotonic fencing token and an expected `storageRevision`.
Writes, batches, sealing and destructive manifest operations verify stored
authority within their transaction. An old fence is rejected; a delayed write
from the same fence is also rejected after the content revision changes.
Immutable manifest inputs cannot be replaced through an otherwise valid owner.

A second controller's recovery pass leaves an unexpired foreign lease alone.
Recovery after expiry rereads storage atomically and invalidates the old fence.
Heartbeats verify the fence and expected revision but do not advance the content
revision themselves. Cancelled, failed and sealed states cannot be revived by
ordinary delayed callbacks. Explicit sealing of retained partial evidence is a
separate terminal operation; a sealed run cannot be reopened.

Generic imports/deletes cannot overwrite or remove an owned active occurrence.
IndexedDB version changes close the old connection, invalidate its authority
and require reload. Blocked/refused storage is disclosed. Memory storage has
serialized operations and rollback semantics for diagnostics and session use;
it does not establish cross-tab durability.

## Atomic challenge reservation (R05)

`ProfileStore.reserveChallenge` reads the Head, prior attempts and known exposure
inside the same transaction that writes the challenge, seed/exposure artifacts
and idempotent command receipt. The receipt is checked before constructing a
fresh reservation. A retry returns the original challenge, even after exposure
or Head state changes; reusing a command ID for different inputs is rejected.

The attempt scope binds challenger, incumbent, objective, evaluation era and
promotion-policy digest. The expected Head token is frozen in the challenge.
Head-version churn does not reset an already consumed budget for the same
scientific scope. Concurrent reservations get distinct attempt numbers, and
only the first is eligible under the first-attempt rule.

Consumption occurs at `RESERVATION_COMMIT`. A transaction abort leaves no
challenge, exposure or receipt. After commit, failure, cancellation, reload and
retry do not release or reroll the attempt. Promotion rechecks the stored
receipt, reservation and attempt history inside the Head transition transaction,
alongside the existing decision authority, Head compare-and-swap and journal.
This closes reservation authority; it does not enable automatic promotion while
Wave 0 containment is active.

## Acknowledged persistence (R08)

Execution status and persistence status are separate:

| State | Meaning | User label |
|---|---|---|
| `PENDING` | A save has started; required storage has not acknowledged it | Save pending |
| `LOCALLY_COMMITTED` | Required local persistence acknowledged the save | Saved locally |
| `FAILED` | The attempted save failed | Save failed |
| `SESSION_ONLY` | Evidence is retained only for the current session | Session only |

Campaign sealing awaits the store transaction before reporting local completion.
Successful memory writes do not report durable persistence. Legacy campaign
registration retains payload/metadata/set failure disclosures and reports
session-only evidence when the required payload did not persist.

Evolution dashboard and research saves snapshot the requested state and expose
pending status before awaiting the save. Save revisions/run identity prevent an
older acknowledgement from marking a newer result saved. Quota errors remain
visible. Execution can be `COMPLETE` while its save is pending or failed.
Imported and newly created runs start as session-only; acknowledged stored loads
can report saved locally.

## Verification and limits

`test/lab-trust-wave1.test.mjs` is registered in the root test command and CI.
It covers dependency perturbations, sample inputs, allocation, ownership/version
checks, immutable manifest inputs, historical sample rejection, reservation
concurrency/retry/rollback and delayed save acknowledgement. Arena tests exercise
ordered frozen references through actual game execution. Golden genome tests
retain the pre-Wave-1 legacy result hashes and terminal outcomes.

`scripts/browser-proof-lab-trust-wave0.mjs` retains its existing command name and
now includes Wave 1 proofs using real IndexedDB connections and an isolated
browser context. It verifies allocation, challenge reservation/reopen retry,
stale mutation rejection, terminal protection, transaction rollback, database
upgrade invalidation, persistence states and actual Node/browser game identity
and outcome parity. Its source overlay does not touch user browser storage.

Run verification from the nested checkout:

```text
pnpm test
pnpm run typecheck
pnpm run lint
node scripts/browser-proof-lab-trust-wave0.mjs
```

Build validation uses `INTRILEX_SKIP_AUTONOMY_REPLAY_REGEN=1` with `pnpm build`
to preserve the historical replay corpus. Generated browser identity is checked
against the current source identity. The root TypeScript configurations cover
their declared packages/client sources; they do not type-check all modified
simulation and browser JavaScript.

The accompanying Wave 1 result records exact final counts, source fingerprints,
shared-checkout changes and evidence paths. The unresolved R06 regression stays
an explicit TODO. Automatic promotion and confirmatory comparison remain
disabled. No deployment, release certification, consumer migration, capacity
guarantee or later-wave completion is implied by these checks.
