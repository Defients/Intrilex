# Evolution Architecture Reconciliation

Inspected October 2, 2026 (America/New_York), clean HEAD `92d01cea128eae0b277cfa362bae15ba29b35ebb`. No commits or worktree changes follow the supplied foundation.

- **Authoritative:** `evolution-domain.mjs` owns admitted configuration, paired seeds, seat planning, checkpoints, evidence and artifact validation. `EvolutionSession` owns browser claims/epochs. Engine adapters own legal actions and transitions. Node/browser runners execute them.
- **Duplicate/incompatible:** Prototype Zero `evolution-core.mjs` admits arbitrary policy names, assigns different seeds to mirror seats, and owns an alternate worker schedule. Dashboard still consumes its aggregation and chart helpers.
- **Obsolete but reachable:** worker `run-evolution-series` remains callable despite no current dashboard caller. Its source-contract tests preserve deprecated behavior.
- **Still useful:** bounded chart decimation is presentation. Incremental result aggregation belongs beside canonical research metrics, using canonical clean-termination admission.
- **Orchestration risk:** default automatic execution stops at 16 commands; Lab allows 256. Known seed `3484793158` reaches a legitimate long transition chain. Budget exhaustion is an operational boundary, not a rule outcome. Investigate command-index stability before resumption.
- **Migration:** v1 checkpoint IDs include timestamps/runtime bytes. Preserve original bytes and hashes; do not rehash or silently upgrade. Old implementations remain inspectable as archival evidence but cannot execute under a different implementation identity.
- **Tests/dependencies:** `evolution-lab.test.mjs` imports Prototype Zero and asserts old worker strings. `evolution-foundation.test.mjs` tests canonical domain, real engines, workers and browser parity, but pins the ordinary 16-command failure. Build copies shared domain/session and emits an implementation fingerprint. IndexedDB v1 stores runs/history/checkpoints. Migrate these contracts alongside source.

Plan: remove Prototype Zero scheduling/protocol; isolate chart sampling; close orchestration parity; introduce shared experiments/packs/suites/comparison and v2 checkpoints; prove the foundation gate before enabling deterministic local heuristic evolution.
