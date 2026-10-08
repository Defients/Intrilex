# Evolution / Simulation Lab: Wave 4 bounded browser execution

Date: October 8, 2026 (America/New_York).

Scope: R09 in the authoritative Phase 2 remediation plan. Wave 5 / R10 release integration remains separate. Scientific containment from Wave 0 and the admission/ownership contracts from Waves 1–3 remain in force.

## Supported and restricted tiers

Browser campaign and Evolution execution accept at most **100 ordinary games per run**, or **10 games when deep tracing is requested**, with at most four workers. Counts of 1,000 and 10,000 are explicitly restricted in browser execution. Guards apply at the execution boundary, independently of form validation; they reject the requested configuration and do not silently reduce its count. Offline domain/archive validation retains its existing 10,000-game contract, which does not establish browser support.

Preflight record-size projections name the October 7, 2026 audit observations: approximately 11.7 MB for 100 ordinary games and 4.4 MB for 10 deep games. Linear projections are advisory, workload dependent, exclude archive overhead and do not reserve storage or confer capacity authority. Actual measured results belong to the Wave 4 verification report. Preflight renders immediately and updates while typing; it does not wait until field blur to expand the text and move the Run button between pointer-down and pointer-up. Browser quota failures still halt execution and preserve recovery boundaries.

`packages/simulation-runtime/src/browser-capacity.mjs` defines shared hard resource limits:

| Boundary | Limit |
|---|---:|
| Outstanding campaign batches | One per worker, at most four |
| Serialized campaign batch | 8 MiB |
| Outstanding serialized campaign payloads | 32 MiB total |
| Ordinary batch | At most five rows |
| Deep batch | One row |
| Aggregation transport | One acknowledged page, at most five rows / 8 MiB |
| Raw analysis window | At most 1,000 input rows and 32 MiB, independently enforced |
| Analysis sources | At most 1,000 |
| Evolution record references per checkpoint | At most 100 ordinary / 10 deep records |
| Evolution retained replay references | Existing limit of 12 |
| Evolution checkpoint header | 512 KiB |
| Evolution persisted checkpoint and newly captured payloads | 32 MiB |

These are serialized payload and collection bounds, not a claim that total JavaScript heap use is limited to 32 MiB. Engine working state, retained replay commands and analytical projections also consume memory. A compact historical analysis under the row/byte ceilings is not certification of a 1,000-game execution tier.

## Commit acknowledgements and bounded analytics

A campaign worker produces one bounded batch, then waits for an acknowledgement matching its run, owner, fencing token, epoch, worker index and batch sequence. The driver grants that credit only after the existing transactional commit returns. A second batch without credit, an oversized payload or premature completion stops the execution. Cancellation and failure drain an already-started write, discard queued work and retain one terminal owner. Heartbeats coalesce instead of building another unbounded queue.

The credited campaign adapter invokes the existing deterministic runtime with the same absolute ordinals, seeds, policy/seat bindings and trace settings. Existing campaign-core and manifest-headline collectors keep sufficient statistics and bounded outcome indexes; they do not accumulate raw rows across the campaign.

Analysis uses the shared Wave 3 admission contract within an explicit raw window. The native capacity proof exposed that the shipped browser produces summary schema `4.0.0`; this exact known schema is now admitted alongside `4.1.0`, with all identity, provenance, outcome and coverage checks intact. Unknown schemas and rows without current identity remain restricted. Batch verification streams retained pages; aggregation waits for acknowledgement before sending the next page. Analyses that need raw decisions use the bounded window with the existing mathematical builders. They are not advertised as an incremental analytical engine for arbitrary archives. Exceeding capacity, a worker error or an incompatible cohort leaves the previous coherent analytical snapshot intact and marks it stale. Finalization can retain verified manifest headline statistics if optional analytical recomputation fails; there is no full-union main-thread fallback.

## Incremental Evolution persistence and recovery

IndexedDB version 6 adds `runChunks` without rewriting existing version-5 envelopes. New checkpoints contain small metadata plus content-addressed record/replay references. A transaction writes new immutable evidence chunks, checkpoint references, history and checkpoint identities together. Unchanged accepted records are not copied and written again at each checkpoint. Existing completed export envelopes retain their public schema and canonical evidence hash after reconstruction.

One active save and one coalesced latest request replace a queue of cloned growing runs. Browser execution waits for the durable checkpoint acknowledgement before dispatching another ordinal. A quota or persistence failure stops dispatch; accepted session evidence remains available for rescue/export while the previous durable checkpoint stays intact. Reload validates every referenced chunk and rejects missing or corrupted evidence. Explicit size ceilings are reported as capacity failures, independently of genuine browser quota errors.

Mandatory sample identities, outcomes, retained telemetry and provenance are not silently trimmed to make a save fit. An oversized uncommitted batch is rejected visibly and its missing ordinals remain recoverable from the reserved schedule. Deep tracing is explicit, and existing replay selection retains at most 12 replay artifacts. Export fidelity and coverage continue to describe actual retained rows, decisions and replays; a complete game ledger does not imply complete replay coverage.

## Verification

`test/lab-trust-wave4.test.mjs` is registered in the root test command and CI. Its focused tests cover durable credit, stalled commits, rejected storage, protocol overrun, independent row/byte ceilings, restricted tiers, ordinal-preserving batching, checkpoint request coalescing, stalled aggregation, callback failure and advisory estimates.

`node scripts/browser-proof-lab-trust-wave4.mjs` executes real campaign/Evolution workers against native Chromium IndexedDB. It measures the 100-game ordinary and 10-game deep workloads, introduces slow storage and aggregation acknowledgements, injects quota failures, reopens storage and resumes missing ordinals, verifies version-5 preservation and checks incremental checkpoint/export integrity. The earlier native trust proof remains runnable with the credited protocol.

Validation results and workload measurements are recorded in `WAVE4_VERIFICATION.json` and `WAVE4_IMPLEMENTATION_RESULT.md` beside the authoritative audit and remediation plan. Local PASS results do not establish production release approval, large-tier support or removal of disabled scientific capabilities.
