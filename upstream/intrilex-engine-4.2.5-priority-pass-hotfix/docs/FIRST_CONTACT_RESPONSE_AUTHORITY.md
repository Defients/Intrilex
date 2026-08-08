# First Contact Response Authority v4.1.3

## Authority objective

v4.1.3 adds the smallest engine-owned response layer capable of lawfully scheduling First Contact response windows without duplicating card resolution outside the certified transition boundary.

Canonical mutation remains:

```ts
const result = new IntrilexEngine().execute(state, command);
```

The autonomy bridge may enumerate and schedule. It does not independently resolve counters, card effects, destinations, scoring, protection, turn consumption, or victory.

## Profile identity

```text
profileId: first-contact-response
teachingOverrideId: AUTONOMY_RESPONSE_AUTHORITY_V1
players: 2
modules: none
```

The profile inherits the v4.1.2 Effects & Guard allowlist and adds engine-owned response timing.

## Engine-owned timing contract

1. A policy selects a high-level root action.
2. The private command vault resolves the semantic action ID to `autonomy-declare-response-action`.
3. The engine validates the underlying root action on a clone before commitment.
4. Source and declared cost cards move to canonical pending destinations.
5. A sealed stack item records the immutable engine-owned action payload.
6. Priority opens with the opponent.
7. The current holder receives only enumerated pass/counter/disrupt actions.
8. Any response resets priority after its declarer.
9. Consecutive passes equal to the player count close priority.
10. Engine orchestration resolves the top stack item.
11. A counter removes its current target; a countered root still consumes the Mini-Turn.
12. Jack Disrupt records the root Mini-Turn action type and draws one but does not negate the target.

Rewind is never reverse mutation; deterministic replay reconstructs from the initial state and command sequence.

## Supported response families

### Base Ace

- May counter the current eligible ordinary effect or counter/disrupt item.
- Counter chains are allowed.
- Red Joker shuffle-reset remains ineligible because its First Contact counter authority belongs to disabled Super Ace text.

### Rank 8 Scuttle Counter

- May target only the current pending Scuttle root.
- The Scuttle source is spent when countered.
- The Scuttle target remains in place.

### King specialized counter

- May target only a current single-card Anchor or Goal-Mod root.
- It cannot counter arbitrary ordinary effects.

### Jack Disrupt

- May respond only to the opponent's current root Mini-Turn action.
- Records one of `draw`, `play-for-points`, `play-for-effect`, `scuttle`, or `pass`.
- Draws one card when available.
- Does not remove or counter the root action.
- The disruption marker clears at that player's completed Full Turn boundary. In the current one-Mini-Turn teaching override, this is informational authority rather than a repeated-action lock.

## Policy boundary

Policies receive `AuthorizedLegalAction` only:

- semantic action ID;
- actor ID;
- public family/mode/timing;
- authorized source and target handles;
- numeric/boolean feature vector;
- command hash.

They do not receive:

- `EngineCommand`;
- `targetStackItemId` command payloads;
- raw `RESOLVE_PHASE9_ACTION` objects;
- omniscient state;
- opponent hand identities;
- arbitrary `PlayDefinition.instructions`.

## Fail-closed exclusions

The following remain unsupported because they require sealed private-choice continuations or broader canon authority:

- Rank 3 opponent choice;
- Rank 5 post-mill choice;
- Rank 6 private draw choice;
- Rank 7 generated-effect selection;
- Nine Anchor discard choice;
- optional modules;
- three/four-player autonomous priority;
- complete First Contact autonomy.

Direct low-level Phase 9 primitives remain engine-internal. Their existence does not make them policy-selectable.

## Required proofs

- every enumerated response is accepted from its exact decision frame;
- wrong-holder and wrong-target responses reject with exact before-image and zero events;
- Ace may counter counters;
- Eight is Scuttle-only;
- King is Anchor/Goal-Mod-only;
- Jack resolves without negating the root;
- authorized action views contain no private command vault;
- 121 original conformance fixtures preserve the certified aggregate;
- Node, Chromium main thread, and Web Worker produce identical replay and response-match hashes.
