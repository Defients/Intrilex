# Canonical Fixture Provenance

Intrilex v4.1 is bound to the official canon-lock authority order:

1. Canonical Rules
2. Decision Ledger
3. Digital Engine Contract
4. Test Vectors
5. Conformance Tests
6. Change Ledger
7. Implementation Roadmap
8. Agent Handoff
9. Validation Report
10. Historical material

## Canon-lock closure

The Phase 2–18 RC represented 115 of 120 unique canonical source IDs. Stable 4.1.0 adds explicit projections for:

- `CT-013` — ⭐4 empty-row exchange and Nine Aegis immunity
- `CT-021` — ⭐7 with one available child card
- `CT-023` — ⭐5 remains a DP/GY interaction when Exile is empty
- `CT-034` — a skipped turn slot creates no Full Turn and resets nothing
- `CT-035` — controller changes never mutate original ownership

These are stored in `fixtures/phase20-canonical-closure.json`.

## Duplicate upstream drafts

Multiple v4.1 test-suite drafts were discovered with incompatible CT-number meanings. Stable certification binds to the canon-lock lineage and the authoritative test-vector schema, rather than combining drafts by filename similarity.

`CT-063` remains the only intentional source-ID duplication in the executable corpus:

- historical engine fixture `CT-063` — King/K♠ counter-authority separation;
- official Tournament Seed projection `CT-063@TOURNAMENT-SEED`, with `sourceTestId: CT-063`.

The historical fixture is retained to preserve prior release hashes. The official projection remains separately traceable. No replay or aggregate was overwritten.
