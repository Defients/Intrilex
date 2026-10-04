# Strategy Intelligence repository audit

Inspected October 4, 2026 (America/New_York), before implementation. The canonical checkout is `Intrilex_dev-current`, clean `main`, remote `Defients/Intrilex`. Sibling checkouts are outside this change.

| Concern | Current owner and verified boundary |
| --- | --- |
| Routing / shell | `apps/lab-web/src/router.js`, `app.js`; hash workspaces with imperative renderers; React owns the tactical play client only. Preserve this architecture. |
| Evolution / Arena | `evolution-dashboard.js`, `evolution-cockpit*.js`, browser runner, Node `evolution-lab.mjs`; workers execute existing authority. |
| Profiles | `profile-contracts`, `profile-store`, `profile-science`, `profile-arena`; immutable CP/CP2 checkpoints, purpose-bound measurements, era/head snapshots, separate transactional IndexedDB. |
| Scientific contracts | `evolution-domain`, `evolution-research`, `evolution-session`, `evolution-evaluation`; result digests, paired seed plans, fixed evaluation budgets, frozen policy execution, retention and historical inspection. |
| Existing analytics | `evolution-analytics-model`, `evolution-analytics-charts`; clean-game filtering, explicit missing records, bounded plots, original hashes preserved. |
| Telemetry | `actionCoverage` and `seatBehavior` count unique opportunities per decision frame. `mechanicCounts` counts declarations, not resolutions. Rank attribution exists but is not a decision-context artifact. |
| Deep trace | `strategic-telemetry.mjs`: public scores, hand counts, board counts, scoring opportunity, public follow-ups. No full legal subject descriptors or maturity classification. |
| Policy scoring | `policies/scoring`, `action-evaluation`, `weighted-heuristic`; authorized estimates and policy decomposition, never alternative outcomes. Missing scores must remain null. |
| Authority / legality | Node `engine-adapter` decision frame and command vault; browser `autonomy-runtime` uses the same engine via `advance` / `actionView` / `strictView`. Never implement rules in Strategy. |
| Replay / branching | Certified replay, checkpoint reconstruction, runtime counterfactual and retained decision anchors already exist. A compact event can reference command index and hashes instead of storing a state per decision. |
| Persistence | Evolution IndexedDB `intrilex-evolution-lab` v2 stores envelopes/history/checkpoints/research. Strategy should use a separate versioned database with insert-or-verify records and indexed cursors. |
| Evaluation Era | `evolution-identity.mjs` hashes actual engine/policy/runtime sources; Profile eras additionally bind purpose/objective/pack semantics. New capture changes the runtime fingerprint; old evidence is historical, never rewritten. |
| Normal play | `play-controller.js` owns journal, vault, human/AI submission and command log; network projection omits seed/private engine state. Local completed replay ingestion can reconstruct decisions; network evidence remains summary-only without authorized capture. |
| Tests / browser | Node test runner; registration required in root package and `scripts/ci.mjs`. Playwright native Chrome harnesses serve built assets with `.mjs` MIME. |
| Integrity docs | `EVOLUTION_LAB`, `EVOLUTION_ANALYTICS`, `AGENT_PROFILES`, `STRATEGIC_RESEARCH_FORENSICS`; immutable history, correlation limits, real winner semantics, imported-unverified labels. |

## Data gap and implementation decisions

Capture legal opportunity descriptors at the authorized decision boundary. Never reconstruct opportunity rates from selections. A nonselected legal subject means an opportunity was skipped; it does not prove the player deliberately held that card. Deferred stack resolution makes immediate declaration deltas distinct from later public follow-up association.

Maturity uses current public score/goal, hands/counts, board and pile development plus a small turn signal, never terminal game length. Subject identities come from authorized source cards and emitted action family/mode/timing, not a manually written Three story.

Exact-state continuations retain hidden state. Their results are conditioned on that one hidden realization, so they are explicitly research-only and cannot upgrade ordinary player advice. A future player-actionable counterfactual study requires justified hidden-state sampling from the acting player's information set. No fixed hidden state or exposed replay seed enters an ordinary recommendation feature.

Old aggregate artifacts are ingested at their actual fidelity. A separately reproduced current replay may create new decision evidence with its own provenance; it cannot alter or upgrade the original historical artifact.
