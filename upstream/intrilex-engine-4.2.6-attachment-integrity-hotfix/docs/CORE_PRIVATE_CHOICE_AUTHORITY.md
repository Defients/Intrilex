# Intrilex Engine v4.2.3 — Core Private Choice Authority

## Governing rules authority

This patch implements the Intrilex v4.1.1 Interrupt timing hotfix. `Quick` and `Interrupt` are timing permissions, not generic turn taxes. Neither inherently spends a Mini-Turn or creates a skip. Only printed consequences remain: 10♠ Stack Theft applies its printed Full-Turn skips, and Time Bomb Defuse applies its printed Action-Phase skip.

The v4.1.0 aggregates remain historical evidence. The governing v4.1.1 identities are:

- Phase 2–18 aggregate: `e754dfc25e171bdd60a6d41025b42afd3e8120e0ae210c68b02d51d11bfeb211`
- Full 121-fixture aggregate: `8c91e8194e7fa3ab6bbb3eaa6946a97efd70343c36d5e5953ee8e1c0357013df`

## Certified profile

`core-private-choice-authority` is a strict superset of `core-response-authority`. It preserves Core Foundation, public effect declarations, priority circulation, and audited responses, then adds engine-owned sealed continuations for:

- Three: opponent presentation followed by controller take of up to two;
- Three: opponent discard until two remain;
- Five: recycle and post-mill rummage;
- Six: private dig, keep/discard or keep/return;
- Seven: topdeck assignment and a generated child effect that re-enters the response stack;
- Nine Anchor: opponent-selected discard.

## Constitutional boundary

- A pending choice is stored in canonical engine metadata with a token bound to actor, controller, source, options, stage, revision, and context.
- Policies receive semantic action handles only. The token and engine command vault remain private to the decision frame.
- Unauthorized, stale, malformed, or tampered submissions return the exact before-state and emit zero events.
- Public and unauthorized player projections use opaque hidden-card handles and redact choice tokens, option identities, and private selections.
- Seven's generated effect is revalidated against an engine-generated legal effect set and becomes a normal stack child declaration.

## Fail-closed exclusions

This profile does not certify private Quick suit enhancements, Supers, Rank 10, Voltage, Ultras, Royal Marriage, modules, or multiplayer. Those families never appear in legal policy frames.
