# Complete First Contact Integration

Intrilex Simulation Lab v0.4.0 consumes the separately certified engine v4.1.5 Trigger Closure authority surface without modifying the immutable v4.1.0 certified payload.

## Decision frames

A frame contains an actor-authorized projection, canonically sorted semantic actions, stable action IDs, public feature vectors, and policy RNG. The associated commands remain in a private immutable vault. Response and private-choice frames obey the same contract.

## Complete-profile execution

The runtime advances engine-owned orchestration until a policy decision is required, submits exactly one selected action through `IntrilexEngine.execute`, records ordered events and state hashes, and repeats until canonical victory, draw, Exhausted resolution, or a classified safety abort. The shipped 10,000-match campaign contains no aborts.

## Browser integration

The static build uses a narrow generated engine closure and the same shared policy scorer. Real Chromium tests compare replay aggregates, complete-profile command streams, policy decisions, choice/trigger telemetry, and terminal state hashes between Node, the main thread, and a module Worker.

## Certification campaign

The semantic catalog contains 10,000 global ordinals distributed across all 25 ordered pairings of Random Legal, Score Rush, Control, Tempo, and Value. The catalog was executed at worker counts 1, 2, and 4 plus a clean four-worker rerun. Segments are merged only after exact ordinal coverage, experiment identity, and per-match semantic hash equivalence pass.
