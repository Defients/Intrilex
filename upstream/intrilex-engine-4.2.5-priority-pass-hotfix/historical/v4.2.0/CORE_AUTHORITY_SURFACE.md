# Intrilex Engine v4.2.0 — Core Foundation Authority

## Purpose

This authority surface introduces a lawful autonomous Core vertical slice without duplicating advanced Core effect semantics outside the certified engine.

## Canonical profile

- Profile ID: `core-foundation-authority`
- Canonical rules family: `CORE`
- Players: exactly two
- Optional modules: none
- Goal: 21
- Opening hands: P1 = 5, P2 = 6
- Draw Pile after setup: 40
- Swap Bar: two face-down cards plus one face-up card

## Engine-owned lifecycle

The engine owns setup, Start, Action, End, Between Turns, active-player progression, Full-Turn limits, victory, and Exhausted resolution.

Supported semantic actions:

1. Apply standard Core setup
2. Begin Start phase
3. Perform the once-per-Full-Turn face-down Swap exchange
4. Enter Action phase
5. Draw from DP
6. Take the face-up Swap card
7. Play a hand card for Points
8. Scuttle a legal opposing scored card
9. Pass the Action phase
10. Complete the turn

All consequences are submitted through `IntrilexEngine.execute` using the typed `RESOLVE_CORE_AUTHORITY_ACTION` boundary.

## Visibility

Face-down Swap Bar cards are hidden from public and player-authorized projections. Stable private card IDs are replaced by deterministic opaque handles. The face-up Swap card remains public.

## Unsupported families

The following do not appear in legal decision frames:

- suit/rank effects;
- Quick, Instant, and Interrupt timing;
- Core response/counter chains;
- Supers and Ultras;
- Voltage and advanced rank-10 actions;
- optional modules;
- multiplayer and teams.

Unsupported features fail closed with machine-readable capability reasons. This release is a Core foundation, not complete Core.
