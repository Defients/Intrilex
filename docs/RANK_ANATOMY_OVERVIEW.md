# Rank Anatomy Observatory — v0.16.0

> **Release:** v0.16.0 — Rank Anatomy Observatory
> **Status:** Production-ready
> **Date:** 2026-08-03

## Overview

The Rank Anatomy Observatory decomposes each rank's performance into its constituent parts: ordinary baseline, mechanically distinct Spades variant, individual Super declarations, and individual Super effect components. This separation prevents the conflation errors that occur when a Spades card inside a Super declaration inflates ordinary Spades use, or when a generated effect is counted as if it were a natural one.

## Canonical Registry

The `rank-anatomy-registry.json` artifact is generated during the build from engine authority. It contains:

- **15 canonical ranks** (A, 2-10, J, Q, K, RJ, BJ)
- **13 Spades variants** (all ranks except Jokers)
- **9 Super effects** (A, 2, 3, 4, 5, 6, 7, 8, J)
- **Authority hashes** linking each rank to the engine's canonical rank registry
- **Origin kind enumeration** (natural, generated, copied, mimicked, replayed, transferred, unknown)
- **Evidence grades** (measured, provisional, weak, insufficient, not-observable, unsupported)
- **Descriptive classifications** (never balance verdicts)

### Rank 2 Eligibility

Rank 2 (2♠) is **eligible** for independent Spades variant analysis. The distinction is subtle: 2♠ Solo Wild Copy may target spade-enhanced Base modes (3♠/4♠/6♠/7♠) that 2♣/2♦/2♥ cannot copy. This is a mechanically distinct behavior, not a cosmetic difference.

### Super Effect Inventory

| Rank | Effect ID | Display Name | Profiles |
|------|-----------|-------------|----------|
| A | super-ace | ⭐A Super Counter | Advanced + Unrestricted |
| 2 | super-two | ⭐2 Commandeer | Advanced + Unrestricted |
| 3 | super-three-raid | ⭐3 Super Raid | Unrestricted only |
| 4 | super-four-exchange | ⭐4 Row Exchange | Advanced + Unrestricted |
| 5 | super-five-recycle | ⭐5 Super Recycle | Unrestricted only |
| 6 | super-six-dig | ⭐6 Super Dig | Unrestricted only |
| 7 | super-seven-topdeck | ⭐7 Sequential Topdeck | Unrestricted only |
| 8 | super-eight-scuttle | ⭐8 Absolute Scuttle | Advanced + Unrestricted |
| J | super-jack-tempo | ⭐J Tempo Force | Advanced + Unrestricted |

Ranks 9, 10, Q, K, RJ, BJ have no Super effects.

## Analytics Pipeline

### Build-Time (Deterministic)

`buildObservatoryAnalytics()` now calls `buildVariantAnalytics()` and includes the result in the observatory artifact with hash identity. The analytics schema version has been incremented from 4.1.0 to **4.2.0**.

The variant analytics output includes:
- `variantMetrics` — 59 aggregate variant metrics
- `rankComparisons` — 13 rank-level comparison facets
- `variantPower` — power profiles per variant
- `confidence` — per-variant confidence classifications
- `metricRegistryHash` — hash of the variant metric registry
- `variantRegistry` — canonical variant registry with entity hash

### Browser Runtime

The browser prefers the pre-computed variant analytics from the observatory artifact. A fallback computes variant analytics at runtime for live campaign results (when the user runs a new campaign in the browser).

## UI Components

The Rank Anatomy Observatory UI is rendered by `workspaces/ranks/rank-anatomy-workspace.js` and includes:

1. **Anatomy Rail** — tab navigation: Overall / Ordinary / Spades / Supers / Evidence
2. **Overall Tab** — aggregate rank performance with contribution decomposition and frequency-potency table
3. **Ordinary Tab** — normal suit baseline (♣/♦/♥ combined, excluding Spades/Super)
4. **Spades Tab** — exact Spades variant comparison with ordinary vs Spades table
5. **Supers Tab** — Super declaration funnel and individual effect dossiers
6. **Evidence Tab** — authority hashes, registry info, provenance, interpretation boundary
7. **Origin Filter** — natural/generated/copied/mimicked/replayed/all
8. **Profile Filter** — all/advanced-core/unrestricted-core

## Interpretation Boundary

All metrics are observational associations conditioned on policy, seat, profile, and telemetry. They are **not** causal claims or balance verdicts. The registry defines descriptive classifications (e.g., "investigate-high-impact", "rare-high-potency") that never include balance verdicts like "overpowered" or "underpowered".

## Files

| File | Purpose |
|------|---------|
| `packages/simulation-runtime/src/rank-anatomy-registry.mjs` | Canonical registry generator |
| `packages/analytics/src/rank-integration.mjs` | Variant analytics with metric registry hash |
| `packages/analytics/src/analytics.mjs` | Observatory build with variant analytics wired in |
| `apps/lab-web/src/workspaces/ranks/rank-anatomy-workspace.js` | UI rendering module |
| `apps/lab-web/src/app.js` | renderRanks integration |
| `apps/lab-web/src/styles.css` | Rank Anatomy CSS |
| `test/rank-anatomy.test.mjs` | 22 canonical registry and falsification tests |
| `sample-data/observatory/rank-anatomy-registry.json` | Generated registry artifact |
| `sample-data/observatory/rank-2-eligibility.json` | Rank 2 eligibility record |
| `sample-data/observatory/rank-eligibility-summary.json` | Per-rank eligibility summary |
| `schemas/analytics.schema.json` | Updated to 4.2.0 with variantAnalytics property |
