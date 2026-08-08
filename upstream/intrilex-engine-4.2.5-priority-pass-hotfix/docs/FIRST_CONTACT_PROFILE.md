# First Contact Profile

## Authority and scope

Roadmap Phase 9 implements First Contact as a validated configuration profile over the existing Intrilex v4.1 engine. It is not a fork, alternate reducer, or second rules implementation.

Official conformance gate:

- `CT-093` — suit-specific Rank-10 text is rejected before source commitment.
- `CT-119` — First Contact combined with optional modules is an illegal configuration unless a canonical teaching override explicitly defines that variant.

## Fixed profile

| Property | First Contact value |
|---|---|
| Players | 2 |
| Goal | 15 |
| Mini-Turns | exactly 1 per completed Full Turn |
| Actions | Draw, Play for Points, generic Play for Effect, Scuttle, Pass |
| Protection | Guard only |
| Tap maintenance | all controlled tapped OTT cards untap at Start |
| Hand reveal markers | suppressed |
| Exile | absent; would-be Exile destinations route to GY |

## Disabled systems

The profile rejects or suppresses:

- Swap Bar;
- Comboing and Supers;
- reserved advanced classes;
- Ultras and Sudden Death;
- Aegis and Royal Shield;
- Exile access;
- Revealed-Until-Start;
- Draw & Cast;
- Voltage;
- every suit-specific ability;
- every optional module.

Disabled declarations fail before source commitment. Illegal configuration and declaration results return the exact canonical before-image and commit no event.

## Generic-effect allowlist

The engine accepts only explicitly enabled generic rank text. The current profile-level rank allowlist is:

`3, 4, 5, 6, 7, 8, 9, J, Q, K, RJ, BJ`

This does not automatically make every mode of those ranks legal. Existing timing, target, source, action, and effect validation still applies.

## Lifecycle projection

- Start resets the active player to one Mini-Turn.
- Mini-Turn grants resolve as ignored profile events and never raise the player above one.
- All tapped cards controlled by the active player untap atomically at Start, regardless of Core Tap State source.
- Cards entering a hand are hidden; any reveal-until-Start marker is removed.
- A requested Exile destination is rewritten to GY before movement.

## Design invariant

First Contact selects capabilities from the production engine. It never duplicates stack, movement, scoring, hashing, replay, validation, or event logic.
