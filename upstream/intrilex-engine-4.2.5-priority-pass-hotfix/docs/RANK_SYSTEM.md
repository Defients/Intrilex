# Phase 6 Core Rank System

## Registry

`src/ranks.ts` defines the canonical fifteen-rank registry in Scuttle order:

`A < 2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < RJ < BJ`

Every definition records:

- PR Point value;
- Scuttle order;
- supported canonical mode keys;
- ordinary Scuttle immunity where applicable;
- ordinary PR Effect-target immunity where applicable;
- implementation notes for exceptional authority or lifecycle behavior.

The registry is immutable at runtime and separated from mutable `CardInstance` state.

## Resolution boundary

Rank behavior enters through `RESOLVE_RANK_ACTION`. The engine:

1. clones and validates the authoritative before-image;
2. invokes the rank resolver with a typed action;
3. rejects illegal declarations without committing events;
4. applies successful rank mutations through the shared movement and lifecycle services;
5. commits ordered events into the existing hash chain;
6. validates the resulting authoritative state.

Rank code does not maintain a parallel zone model, replay path, or hidden randomness source.

## Gate coverage

The Phase 6 corpus executes CT-064 through CT-081:

- ⭐2 control change blocked by Aegis;
- 4♠ structural bypass plus Exile-Bound destination replacement;
- Royal Shield versus Base Ace;
- ⭐4 exchange with an empty row and fresh Aegis;
- rank-5 recycle ordering;
- 6♠ declaration and private draw resolution;
- Seven topdeck assignment;
- Eight Aegis field with Nine exclusion;
- 9♠ Goal Shift and controller discard;
- 10♦ Mimic identity, recipe, limit, and Exile-Bound behavior;
- 10♣ Foundation pre-entry score check;
- Queen Anchor entry Aegis;
- 10♠ Stack Theft controller rebinding, fizzle destination, and skip penalties;
- Jack PR Attachment control and score bonus;
- Black Joker Board Lock activation record;
- Royal Marriage as a dedicated non-Combo class;
- ordinary Scuttle immunity;
- ⭐8 absolute Scuttle.

## Derived scoring

Rank Point values are definitions, not copied mutable truth. A card may carry an explicit current `pointValue` only when a resolving rule establishes one. Secured PR is derived from current PR membership, tap state, face-down state, and legal bonuses such as Jack's host bonus.

## Protection specificity

The resolver follows specificity rather than broad labels:

- ⭐2 bypasses Guard and ordinary control protection, not Aegis;
- 4♠ bypasses Aegis and ordinary clear immunity, but destination replacements still apply;
- 8♠-style rank/suit bypass does not imply Scuttle-immunity bypass;
- ⭐8 ignores ordinary Scuttle immunity but remains blocked by Aegis;
- Royal Shield blocks Base Ace authority but not broader authorities defined by canon.

## Scope boundary

This release implements the complete typed rank registry and the executable behavior required by the Phase 6 gate. It does **not** claim every branch of every rank, optional module modification, Combo recipe, Ultra recipe, or tournament profile is complete. Those must be added only through later roadmap gates with new fixtures and preserved regression hashes.
