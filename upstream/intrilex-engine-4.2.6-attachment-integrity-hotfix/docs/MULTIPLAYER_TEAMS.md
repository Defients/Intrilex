# Multiplayer and Teams — Phase 11

Phase 11 extends the certified Intrilex v4.1 kernel to three-player free-for-all and four-player Teams without forking the engine.

## Central relation model

Every player pair resolves to exactly one relation:

- `self`
- `ally` — same non-null team identifier
- `enemy` — every other player

Hostile text that names an opponent targets an Enemy. It cannot target self or an Ally unless the specific effect explicitly permits Ally targeting.

## Priority

Priority begins with the next player after the declarer, proceeds through turn order, and returns to the declarer. Resolution begins only after every player passes consecutively. An Ally has the same right to respond as an Enemy.

## Setup profiles

- Three-player FFA: hand sizes `5 / 6 / 6`; Goal 21; Swap Bar `2 face-down + 2 face-up`.
- Four-player Teams: two teams of two; alternating turn order; five cards each; Goal 21; Swap Bar `3 face-down + 2 face-up`.

Setup commands carry exact card assignments so replay never depends on implicit dealing assumptions.

## Team isolation and aggregation

Hands, rows, Goals, limits, and decision rights remain per player. Teams aggregate only where a rule explicitly says to aggregate:

- individual normal victory converts to that player's team;
- Sudden Death converts the activator into the activator's team;
- Exhausted compares combined active Anchors, then combined signed Secured PR Points.

## Partner procedures

Partner Royal Marriage remains one classified multi-card play. Matching cards stay in their respective Ally rows and do not create shared zones or ownership.

## Deterministic multiplayer services

- Ally/Enemy legality evaluation
- cyclic That's Urz assignment
- player-count Swap Bar scaling
- full priority-cycle validation
- deterministic Tournament Seed backup allocation
- controller-relative Source Intercept rebinding
- combined team endgame totals

All illegal multiplayer commands return the canonical before-image and emit no events.
