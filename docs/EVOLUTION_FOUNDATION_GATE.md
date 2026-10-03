# Adaptive Learning Foundation Gate

Evaluated October 2, 2026 (America/New_York), before implementing the trainer.

**PASS:** 29/29 focused tests, 0 failed/skipped; 9/9 real Chrome browser scenarios, zero page errors. Evidence: `reports/local/evolution-foundation-gate.log`, `reports/local/evolution-browser/report.json` (local, ignored artifacts).

- One domain owns config, seeds, mirrored seats, checkpoints and evidence. Prototype Zero protocol and scheduling removed.
- Repeated seeds, Node/browser trajectories across three admitted profiles, and serial/multi-worker execution covered by foundation tests.
- Known long-chain seed `3484793158`: normal 16-command slices and Lab 256-command slices execute identical commands, rule compliance and final hash; independent guard remains 256 automatic commands per decision boundary.
- Experiments separate scientific identity from worker count/clocks; cloning preserves variables and records structured changes.
- Explicit frozen packs and named five-opponent suites validated; evaluation cannot mutate a checkpoint.
- V1 remains immutable/readable. V2 supports deterministic serialized heuristic state, content-derived identity, explicit parent/lineage/generation and comparison.
- Candidate-seat behavior telemetry is measured, with missing telemetry marked unavailable.
- Browser creation, cloning, evaluation, comparison, import/export, persistence/reload, stop/stale workers and ordinary play startup pass.

Decision: proceed to a small local `(1 + λ)` weighted-heuristic strategy. Final validation must additionally prove mutation, selection, complete lineage and worker-count reproducibility; this gate is not a release or deployment certificate.
