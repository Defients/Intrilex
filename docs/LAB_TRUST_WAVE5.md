# Evolution / Simulation Lab: Wave 5 integrated local release gate

Date: October 8, 2026 (America/New_York). Scope: R10, the final wave in the authoritative Phase 2 remediation plan. This is local validation of the supported laboratory capabilities. It does not certify the production deployment or remove scientific containment.

## Repeatable validation

Run `pnpm run test:lab-trust:release`. The runner builds the engine and browser, executes the entire registered root test suite, lint, root/client type checks and all three native trust proofs. The default output is the ignored `reports/local/lab-trust-wave5` directory. An explicit absolute external evidence directory can be supplied with `node scripts/lab-trust-release.mjs --evidence-dir <directory>`.

The gate captures the actual implementation and analysis fingerprints, baseline commit, lockfile hash and byte hashes of every tracked source/input file and non-generated untracked file. It compares the source snapshot before and after validation. Every control records its command, start/end timestamps, exit code, timeout state and log hash. Missing scenarios, incomplete test accounting, changed source, stale browser identities or weakened capability restrictions produce FAIL. Build generation precedes the frozen validation snapshot. A failing control stops subsequent controls; unexecuted scenarios cannot be counted as PASS.

`test/lab-trust-wave5.test.mjs` is registered in the root suite and CI. It checks failure cases in evidence accounting and performs real deterministic replay of three committed baseline campaign fixtures. The fixture comes from Git HEAD, independently of generated working-tree data. Final state, winner, termination and scores must match. Scientific identities may evolve independently of gameplay outcomes; historical fixture identity remains inspection-only.

## Native integration coverage

| Required scenario | Native proof |
|---|---|
| Two-tab run start | Wave 5: two pages and database connections share one isolated origin; atomic ranges do not overlap |
| Owner takeover and stale writer | Wave 5: the other page takes the expired lease; old write, heartbeat, batch and delete authority fail |
| Duplicate/conflicting commit | Wave 5: genuine worker outcomes; duplicate is a no-op and contradictory retained digest fails |
| Middle-batch quota failure and reload/resume | Existing strict Wave 0 proof: actual UI, injected commit failure, browser reload and exact missing ordinals; Wave 4 adds genuine capacity-worker recovery |
| Worker failure | Wave 5: a real Worker throws; durable failure retains zero accepted outcomes |
| Cancel/restart race | Wave 5: cancellation during an in-flight genuine worker commit; retain that receipt, resume the missing ordinal, reject a captured old callback |
| Version-incompatible resume | Wave 5: manifests created with unavailable execution or analysis identities remain unchanged and refuse resume |
| Concurrent first challenge and changed Head | Wave 5: two-page reservations on explicitly labeled training fixtures; unique first-attempt authority, retained retry and stale Head refusal |
| Invalid import | Existing strict Wave 0 proof: checksummed duplicate-ordinal import fails without storing another run |
| Legacy classification | Wave 5: native import/export preserves original evidence and labels the archive RESTRICTED_LEGACY |
| Genome-distinct propagation | Existing strict Wave 0 proof: real weighted genomes with one historical display ID remain distinct analytical subjects |
| Duplicate sample inclusion | Wave 5: two stored runs with one deterministic sample yield one analytical row and disclose the repeat |
| Mixed-cohort view | Wave 5: native imported cohorts refuse silent pooling, retain the stale coherent view and require explicit cohort choice |
| Failed recomputation | Existing strict Wave 0 proof: injected aggregation worker failure retains the entire previous snapshot |
| Memory fallback | Existing strict Wave 0 proof: actual UI refuses durable execution when IndexedDB is unavailable |
| Bounded large-run behavior | Existing Wave 4 proof: 100 ordinary / 10 deep games, slow storage/aggregation, bounded queues, quota recovery and incremental checkpoint persistence; 1,000/10,000 remain restricted |

Wave 5 additionally upgrades the experiment database from the other page while old connections are open. The old writable connection must close and report `EXPERIMENT_STORAGE_SUPERSEDED`. Wave 4 preserves and reads version-5 Evolution originals when opening version 6 and verifies an atomic failed checkpoint plus recovery/export round trip. These use fresh browser contexts; they never access the user's browser profile.

## Supported capabilities and retained restrictions

Local browser campaigns and Evolution may execute at most 100 ordinary games, 10 deep games and four workers, within the independent row/byte/checkpoint limits in `LAB_TRUST_WAVE4.md`. Durable commits, fenced recovery, admitted exploratory analysis and immutable export are validated. A storage estimate is advisory and does not guarantee quota availability or total heap use.

Automatic promotion and confirmatory comparisons remain disabled. Challenge reservation/attempt tests validate authority bookkeeping; they do not grant promotion authority to labeled fixtures or imported evidence. Legacy or unavailable-provenance archives remain inspection/export only. Browser execution of 1,000/10,000 games, deployed-origin migration, production certification, cross-browser behavior and low-memory devices are NOT_RUN or restricted.

## Migration and rollback boundary

1. Keep original historical archives and explicit exports. Missing scientific provenance must never be filled by inference. Derived caches are disposable; originals are not.
2. On a database version change, close superseded connections and reload compatible code. An old tab must not retain writable authority. Current writable schema versions are experiment 2, profile 1 and Evolution 6; an older writable bundle must refuse a newer database.
3. Resume only when the pinned execution/analysis identities and seed protocols are available. Otherwise inspect/export and start a new occurrence. Never substitute current code into an old execution silently.
4. Rollback stops new-capability writes and uses a compatible reader or explicit export/recovery. Do not delete archives or blindly downgrade a writable bundle against a newer database.
5. Before deployment, separately validate migration and recovery on the deployed origin and run the repository's production certification process against a clean release tree. Local Wave 5 PASS is not production approval.

The detailed executed counts, scenario matrix, capacities, diagnostic logs and exact source snapshots are delivered in `WAVE5_VERIFICATION.json` and its colocated result document. No Wave 6 is defined by the remediation plan.
