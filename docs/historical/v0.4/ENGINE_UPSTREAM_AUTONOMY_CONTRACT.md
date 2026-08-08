# Engine-Owned Autonomy Contract — Implemented State

The required setup, legal-action, private-vault, response, choice, trigger, orchestration, replay, and capability surfaces are implemented for complete generic canonical two-player First Contact in authority patch v4.1.5.

## Required and implemented exports

- deterministic `createAutonomyState` / profile-aware setup;
- `createAutonomyDecisionFrame(state, actorId, profileId)` with sanitized actions and a private immutable command vault;
- engine-owned orchestration advance until a policy decision, private choice, response, or terminal state;
- sealed choice tokens bound to actor, stage, options, revision, and decision frame;
- engine-owned priority circulation, stack/counter resolution, trigger queueing, Exhausted, and victory;
- machine-readable profile capability declarations;
- public, viewer-authorized, and omniscient projections;
- certified replay-v2 production and verification.

## Policy boundary

Policies select only a stable `actionId` from a canonically ordered `LegalAction[]`. They cannot inspect or author the corresponding command, arbitrary instructions, hidden opponent identities, unrelated sealed choices, engine RNG, or state mutation helpers.

## Supported complete profile

`first-contact-trigger-closure` is the explicit complete generic two-player First Contact authority profile. The inherited Baseline, Essentials, Response, and Private Choice profiles remain available as narrower regression tiers.

## Remaining upstream work

Core, optional modules, and multiplayer require new engine-owned capability surfaces and remain fail-closed. No Lab-side approximation is authorized.
