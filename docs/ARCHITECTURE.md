# Architecture

## Boundary

The manifest-bound Engine v4.2.5 is the sole rules authority. The Lab requests authorized action frames, selects semantic action IDs through policies, privately resolves IDs to commands, executes through `IntrilexEngine.execute`, and observes accepted results.

## Layers

- `apps/lab-web`: twelve-workspace browser Observatory and Web Worker campaigns.
- `apps/batch-cli`: Node matches, campaigns, corpus verification.
- `packages/engine-adapter`: one audited engine bridge and projections.
- `packages/simulation-runtime`: deterministic policy loop, facts, replay generation.
- `packages/telemetry`: schema v4 semantic facts/counters.
- `packages/analytics`: metric registry, intervals, bootstrap, FDR, shrinkage, mechanics, relationships, motifs, fingerprints, anomalies, rank power, swap matrix.
- `packages/simulation-runtime`: immutable evidence, resumable runs, campaign, counterfactual, rank power.
- `schemas/`: 5 JSON Schema contracts (analytics, experiment, run-provenance, semantic-telemetry, telemetry) validated at build time by `scripts/validate-schema.mjs`.
- `vendor`: immutable historical base and toolchain.
- `upstream/intrilex-engine-4.2.5-priority-pass-hotfix`: current manifest-bound source.

Telemetry, analytics, layouts, and FX can be disabled without changing commands, states, RNG, winners, or replay hashes. Execution worker count is provenance, not canonical match identity.

## Schema Validation

Generated artifacts are validated against JSON Schema contracts at build time by `scripts/validate-schema.mjs` — a self-contained lightweight validator (no external dependencies) supporting the JSON Schema Draft 2020-12 subset used by Intrilex: type, required, properties, const, enum, minimum, items, additionalProperties. CI stage `schema-validation` runs 17 tests covering both validator unit tests and integration tests against real artifacts.

## Rank Power Observatory

The `/ranks` workspace visualizes cohort-relative rank power across all 15 canonical ranks (A, 2-10, J, Q, K, RJ, BJ). Data flows from `buildRankAnalytics()` in `packages/analytics/src/rank-integration.mjs`, which computes:
- **Rank Power Index (RPI)**: normalized 6-axis power profile per rank
- **Counterfactual Decision Value (CDV)**: observational proxy comparing rank pairs
- **Swap Matrix**: 15×15 heatmap of decision value differentials between all rank pairs
- **Balance Watchlist**: ranks flagged as overpowered/underpowered/dominant/negligible

Build-time assertion in `scripts/build.mjs` verifies `rankPower.ranks` has 15 entries before shipping. CI stage `rank-pipeline-liveness` runs 5 tests verifying data presence and structure in both sample-data and dist.
