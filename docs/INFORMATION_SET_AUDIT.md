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

## V1.1 hardening audit — four defects found in the shipped V1 path

Audited October 4, 2026 against the live `main` implementation before the V1.1
pass. The sampling boundary above remains correct; these defects were semantic
and presentational, not sampler soundness:

1. **Study subject binding.** The Field Manual launched studies with only the
   decision event; `prepareInformationStudy` derived `question.subject` from
   `selectedActionId`'s first candidate subject. A page subject that was legal
   but not the recorded action's subject silently redirected the study
   question — a `rank:3` study launched from a recorded Draw could become a
   `family:draw` study. The machinery could answer the wrong question
   correctly. Fixed by freezing `requestedSubject` into the sealed plan and
   rejecting any subject absent from the legal opportunity set.
2. **Asymmetric inference.** Only `alternative − reference` effects with a
   positive lower bound could qualify, so a dominating recorded action could
   never earn advice. Fixed by a deterministic sealed `assessment` computed
   from the precommitted contrasts, allowing a reference-direction claim only
   when every tested alternative is dominated.
3. **Quick Read priority.** The card page rendered observational "no supported
   recommendation" prose above valid controlled claims. Fixed by a
   deterministic evidence priority: actionable controlled claim → other
   admissible controlled evidence → observational → unknown.
4. **Inference practicality.** Fixed Hoeffding needs ~23.5 pp observed effect
   at N=256/m=2 to certify a 5 pp meaningful effect — moderate effects were
   unreachable. Replaced for new V2 plans with variance-sensitive empirical
   Bernstein plus a documented zero-variance floor, and added labeled
   pre-study resolution diagnostics. V1 plans keep Hoeffding semantics
   forever.
