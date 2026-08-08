# Intrilex v4.1 Final Headless Engine Certification

**Verdict: PASS**

- Engine: `4.1.0`
- Certified authorized replays: **121/121**
- Canonical source IDs: **120/120**
- Missing source IDs: **0**
- Invalid-command invariant probes: **605**
- Public leak failures: **0**
- Independent runtime: `Python 3.13.5`, **121/121** pairs
- Preserved Phase 2–18 aggregate: `e754dfc25e171bdd60a6d41025b42afd3e8120e0ae210c68b02d51d11bfeb211`
- Final conformance aggregate: `8c91e8194e7fa3ab6bbb3eaa6946a97efd70343c36d5e5953ee8e1c0357013df`
- Simulation campaign: `1883275f3a68356c991217e29b610076313d95595cf2c26515ea44ea93e60fb3`
- Certification aggregate: `6d4e20266b1333df8c724f05844cfdf01cf43b5a5dca6ff351941f5fe4119bbc`

## Interpretation boundaries

- The Phase 19 campaign is a reproducible legal First Contact action-subset study under declared policies; it is not a claim of solved optimal play or complete advanced-module metagame balance.
- CT-063 intentionally has two provenance-separated executable projections because historical engine certification and the canon-locked upstream suite reused that identifier for different semantics.
- The Python verifier is an independent runtime and hash/checkpoint implementation; gameplay semantics remain authoritative in the TypeScript engine and are reproduced from every certified command stream there.
