# Phase 19 Balance Simulation

## Evidence produced

The stable release contains two deterministic evidence layers:

1. **121 conformance scenarios**, executed through the production engine.
2. **10,800 complete policy-driven matches**, run twice from the same serialized seed catalog.

The full-match campaign uses the First Contact legal-action subset:

- Draw
- Play for Points
- Scuttle
- Pass

It evaluates nine pairings across three explicit policies: score-first, balanced, and control-first. Starting seats alternate, every seed is serialized, and the second campaign must reproduce the first campaign hash exactly.

## Results

- Matches: **10,800**
- Decisive matches: **10,800**
- Draws: **0**
- Mean turns: **5.79**
- Median turns: **4**
- 95th percentile: **14**
- First-player win rate: **68.46%**
- 95% Wilson interval: **67.58%–69.33%**
- Campaign hash: `1883275f3a68356c991217e29b610076313d95595cf2c26515ea44ea93e60fb3`

## Watchlist

The starting-seat result is a real warning for this restricted policy environment. It is not silently labeled “balanced.” The likely contributors include tempo from moving first and the intentionally limited policy/action set, which excludes most disruption, counters, effects, protection, and advanced systems.

The result therefore supports a **balance watchlist**, not a rules rewrite. Any semantic change still requires a new canonical decision, exact reproduction, synchronized rules artifacts, and a new rules version.

## Boundary

This campaign completes the roadmap requirement for a reproducible simulation harness, telemetry schema, signed scenario catalog, confidence bounds, and sustained autonomous samples. It does not claim solved optimal play or universal advanced-module balance.
