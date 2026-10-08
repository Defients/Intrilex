# Evolution / Simulation Lab: Wave 2 receipts and execution recovery

Date: October 8, 2026 (America/New_York).

Scope: R03 and R04 in the authoritative Phase 2 remediation plan. This wave
builds on Wave 1 ownership and identity contracts. It does not remove Wave 0
capability restrictions or implement Wave 3 evidence admission.

## Atomic evidence receipts (R03)

Each newly accepted batch stores an immutable `intrilex-batch-receipt@1` with
its run and batch IDs, accepting owner and fence, payload digest, exact sorted
ordinals, implementation/protocol fingerprints and carried schema references.
The receipt hash is also bound into the manifest's batch descriptor. Batch
payload, receipt and manifest advancement commit in one storage transaction.

An identical retry returns the original receipt without increasing counts.
Reusing a batch identity or ordinal range with changed payload fails. Partial
overlap cannot become a second accepted batch. Malformed, foreign or conflicting
coverage cannot advance the manifest. Metadata retains compact ranges rather
than a growing per-match hash map; authoritative payloads resolve overlaps.

Coverage comes from validated retained ordinals. A high maximum ordinal does
not imply that earlier ordinals were retained. Out-of-order batches may be
stored, but missing ranges remain explicit and resume schedules those ranges.
Each segment's counts and contiguous frontier are recalculated from coverage.

Before resume or seal, recovery reads current stored manifests and batch rows
and reconciles payload hashes, receipt hashes, descriptor bounds, exact
ordinals, headline counts and contradictory outcomes for the same deterministic
sample. A new descriptor requiring a receipt cannot silently become a legacy
descriptor when its receipt is removed. Historical rows without new receipts
remain inspectable under strict payload/coverage checks; this code does not
invent historical schema or implementation provenance.

Seal repeats reconciliation inside the transaction that writes the run record,
payload descriptor and terminal manifest. It checks folded outcome counts,
canonical result and payload digests against actual retained rows. Aborting
that transaction leaves all seal records uncommitted and preserves the prior
manifest and batch evidence.

There are three separate claims:

- A retained dataset may be intentionally sealed as partial, with original
  requested count and exact retained coverage disclosed.
- A successful worker execution must retain every requested ordinal before
  sealing. Worker completion messages alone cannot establish this claim.
- Scientific eligibility is governed by the existing capability gates and
  later evidence-admission work. Complete storage is not clean-sample approval.

## One fenced worker lifecycle (R04)

`campaignExecution` owns the lifecycle of one execution. Worker requests and
responses carry run ID, owner ID, fence and a unique invocation epoch. The epoch
is transport authority and stays outside deterministic scientific identity.
Transport worker indexes remain distinct even when multiple resume holes belong
to the same original segment.

The first failed commit stops the execution, terminates its workers and rejects
queued callbacks. Work already being persisted may finish; the terminal failure
or cancellation transition waits for that work. Duplicate completion, wrong
tokens and late callbacks cannot increment completion or mutate a newer run.
Worker errors, message errors, startup failures, inactivity timeout and explicit
cancellation use the same single-terminal protocol. The default inactivity
timeout is three minutes; valid traffic resets it. Fenced heartbeats run every
15 seconds while workers are active.

All workers must finish, queued commits must settle successfully, and the store
must acknowledge a complete seal before the UI reports successful completion.
The UI also checks which execution it currently displays, preventing a cancelled
run's late callback from changing a newly started run's controls or status.

Resume rereads stored evidence, validates immutable inputs and checks the pinned
execution, analysis/protocol and seed contracts before acquiring a new fence.
Changed or unavailable implementations require inspection/export or a new run;
they cannot be represented as continuation. Worker configuration preserves the
original executable subjects, frozen snapshot/checkpoint/revision references,
adaptive settings, rule overrides, seed inputs and execution budgets. Seat
reversal reverses all ordered subject arrays together.

## Verification and boundaries

Focused regressions cover retry conflicts, malformed coverage, retained holes,
corrupt/missing rows and receipts, inaccurate counts, seal rollback, stale
execution tokens, duplicate completion, failure with already queued batches,
cancel/start, worker errors/timeouts and incompatible resume inputs. Existing
run durability, retention and portability regressions are included.

The native Chromium proof uses the actual UI, Worker transport and IndexedDB.
It injects a quota failure on the middle batch of a six-match run after later
messages have already been queued. Only ordinals 0 and 1 remain; the manifest
is failed, ordinals 2 through 5 remain pending, and no sealed run exists. After
reload, resume advances the fence and fills exactly those holes, producing
ordinals 0 through 5 and a six-match sealed run. This fault scenario uses
synthetic valid summaries to control transport order; it is lifecycle/storage
evidence, not new game-outcome evidence. The proof also retains the existing
actual Node/browser simulation parity and Wave 0/1 native-storage checks.

Validation totals and artifact identities are recorded in the accompanying
`WAVE2_IMPLEMENTATION_RESULT.md` audit artifact. Browser proof uses isolated
contexts and does not alter the user's browser storage. Generated replay
regeneration is skipped during the build to preserve historical replay evidence.

Automatic promotion and confirmatory comparisons remain disabled. R06 semantic
admission, independent-sample counting, evidence-pooling changes and other
later-wave consumers are deferred. No production deployment or release
certification is established by these local checks.
