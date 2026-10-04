# Information-set sampling boundary

Audited October 4, 2026, America/New_York, before implementation, in the nested
`Intrilex_dev-current` main checkout. Existing Strategy contracts, analysis,
exact branching, evidence, store, workspace, validation, Chrome harness and
fingerprint/build registration were inspected. The checkout started clean.

The authority is the compiled 4.2.6 attachment-integrity engine, built from
`upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/src`. Strategy must
continue to use its state constructor, command vault, decision frames and
execution. Certified reconstruction already binds the entire transcript and
pre-decision state to a Decision Event. Its hidden state is research provenance,
never the input to a player-information sampler.

| Dimension | Finding and V1 boundary |
| --- | --- |
| Cards | Core setup validates one 54-card universe, assigns positional `CORE-001`…`CORE-054` handles, deals five/six cards, two hidden and one visible Swap Bar card, then forty draw cards. Handles do not encode rank/suit. |
| Hidden allocation | Opponent hand, two face-down Swap Bar cards, and ordered draw identities must all be regenerated from the universe minus known cards. |
| RNG | Engine xorshift state/cursor are hidden. Never retain the original seed or cursor. A declared synthetic fresh stream is a modeling assumption, not the posterior of the original deterministic deal seed. |
| Card markers | Tap/aegis expiries, attachments, reveal lifetimes, private-choice holding, traps and draft staging exist. Strict policy projections expose only subsets. |
| Runtime | Private choices, suspended/pending stack state, triggers, disruption flags, generated-effect queues, voltage snapshots and restrictions can affect future execution. Do not infer absent data from a compact Strategy context. |
| Remembered information | Current state projections have no complete actor knowledge ledger. Returned/revealed draw cards and formerly public cards can remain known after the current projection hides them. General midgame sampling is unavailable. |
| Projections | Node `strictPolicyView` and browser `strictView` differ in schema and optional card fields. Use a common canonical projection only within an independently certified reconstruction boundary. |
| Legal surface | Action IDs bind revision and commands, not the whole hidden-state hash. Opening hidden identity changes can retain exactly the same action IDs and descriptors. |
| Optional systems | Core setup rejects optional modules; first-contact/module/trap/multiplayer states are outside V1. |

The defensible first boundary is **the first prepared P1 Start decision in an
unmodified Core setup**. Before any player action there is no reveal history,
secret marker, stack or mutable effect history to reconstruct. Admit a source
only if its complete non-identity, non-RNG structure exactly matches an
authority-created opening template, and its authorized projection/legal surface
can be reproduced from its six known identities. This comparison detects
unsupported hidden dimensions but does not copy them into the sampler.

The sampler itself accepts only a sealed information set and public scientific
identity. It constructs each world afresh through authoritative predetermined
setup and Start preparation. Uniform unseen assignment plus a fresh engine RNG
stream is an explicit conditional model, not a claim about opponents' beliefs
or the engine's original seed distribution. Every world must conserve cards,
match the projection and match the legal surface. Unsupported positions fail
closed as `INFORMATION_SET_SAMPLING_UNAVAILABLE`, with no actionable claim.

Exact `STRATEGY_BRANCH_V1` retains its permanent `RESEARCH_ONLY` ceiling.
World-level bounded paired inference, with continuation repetitions nested in
worlds and precommitted familywise correction, will use sampled worlds as N.
No general midgame sampler, knowledge ledger or replication campaign is included.
