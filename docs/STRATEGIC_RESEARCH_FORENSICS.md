# Strategic research forensic map

Inspected October 3, 2026 (America/New_York), starting HEAD `a3e8557296ccfa8f59c73ff2ae9aa6897fc5d801`; worktree clean before this task. This map precedes implementation. User-supplied 2,222-game evidence is an observation: its raw artifact is not present in the request, so exact historical counts and anomalous games cannot be independently certified.

| Pipeline | Source / owner | Entry / structure | Existing verification |
|---|---|---|---|
| Registry and versions | `packages/policies/src/index.mjs`, simulation `policy-catalog.mjs` | `CORE_POLICY_BY_ID`, `strategicPolicy` | tactical-policies, game-ai |
| Frozen policies / generation zero / schema 2 | simulation `evolution-domain.mjs`, `evolution-research.mjs`, `evolution-training.mjs` | `createCheckpoint`, `validateCheckpoint`, `createTrainableCheckpoint`, append-only generations | evolution-foundation/research/training/completion |
| Legal actions / response / choices / all advanced families | engine-adapter `adapter.mjs`, `action-composition.mjs`, `action-semantics.mjs`; engine `core-authority.js`, `core-advanced-authority.js` | `createSimulationDecisionFrame`, policyActions, command vault, `executeSimulationAction` | full-rank-legality, policy-action-coverage, tactical-policies |
| Ranking / tie breaks | policies `scoring.mjs`, `tactics.mjs`, `action-evaluation.mjs` | `rankPolicyActions`, `scorePolicyAction`, `tacticalScore`, `evaluateAction`; descending numeric score then lexical ID | tactical-policies, scoring-sensitivity |
| Authorized state | adapter `strictPolicyView`; browser `autonomy-runtime.js` | own hand and public board; opponent hand count; no hidden deck order | hidden-info, tactical-policies |
| Score, board, resource, counter and private-choice evaluation | policies `action-evaluation.mjs` | `evaluateAction`, `privateChoiceScore`, `boardPoints`, `handValue` | policy-action-coverage, tactical-policies |
| Normal / timers / exhaustion | engine `core-authority.js`; rulebook sections 4.5, 10.3, 11 | End phase; `CORE_NORMAL_VICTORY`, `CORE_SUDDEN_DEATH_RESOLVED`, `CORE_EXHAUSTED_RESOLVED` | engine authority and evolution-analytics |
| Decisions / action opportunities / resolution | simulation `runtime.mjs`; browser `autonomy-runtime.js` | strict view before choose, `recordActionCoverage` after accepted selection; resolution may occur in next frame | telemetry, policy-action-coverage, evolution tests |
| AB/BA / evidence hashes / workers | simulation `evolution-domain.mjs`, `evolution-lab.mjs`, `evolution-session.mjs`; browser runner / worker | `gamePlan`, `labGameSeed`, `gameEvidence`, `validateRecord`, claims and epochs | evolution-lab/foundation/completion, tactical-policies |
| Aggregation / uncertainty | simulation `evolution-domain.mjs`; UI analytics model | `summarizeRecords`, `arenaAnalytics`; complete seed-pair scores, conservative Hoeffding 95% bounds | evolution-analytics/research |
| Histograms / scatter / SVG | browser `evolution-analytics-model.mjs`, `evolution-analytics-charts.mjs` | histogram, `arenaAnalytics`, chart cards, SVG serialization | evolution-analytics |
| DOM / range state / persistence | `workspaces/evolution-dashboard.js`, `evolution-cockpit.js`, `evolution-store.mjs` | view.analytics separate from execution config; IndexedDB envelopes with hashes; historical inspection | evolution-cockpit/lab/completion |
| Frozen suite and fingerprints | simulation `evolution-evaluation.mjs`, `evolution-research.mjs` | `evaluateSuite`, `behaviorFingerprint`, TRAINING/EVALUATION purposes | evolution-research/training |
| Build / identity | `scripts/build.mjs`, `scripts/evolution-identity.mjs` | browser rewrites / copies; implementation fingerprint | browser parity, tactical-policies |

## Verified defects and interpretation boundaries

* Scatter uses `i % ceil(clean.length/300) === 0`. At 2,222 rows the stride is 8: alternating AB/BA records collapse to AB. Full aggregations are unaffected.
* Current tactical registry versions are **4.0.0** while Arena labels them **v3**. Do not substitute an inferred historical policy for this implementation. The successor must have a separate ID/version.
* Control's nonterminal scoring base is 650 plus 12 per point, versus control scuttle base 1080 plus target value and tactical removal value; optional effects also receive a large family baseline before utility. These incomparable family offsets establish a systematic investment preference. This is a verified mechanism, not proof explaining every observed loss.
* Tactical scoring already has a goal-reaching override and public opponent pressure. Terminal blindness is not established. Private-choice and resource branches already have specialized evaluators; do not assume they all need buffs.
* Exhausted compares active untapped Anchors, then points, then draw. Sudden Death awards its activator. Normal victory checks the active player's points against their own Goal, which may differ between players. Winner having fewer points is not itself an error.
* Action coverage counts one category opportunity per decision frame, not per legal permutation. It measures selected declarations, not resolved effects. Raw denominators already exist in records and table rows, but percentage tooltips and generic SVG titles obscure them.
* Deferred stack resolution occurs during a later decision-frame preparation. Immediate declaration deltas and subsequent public score changes must be labeled separately; neither proves counterfactual causality.
* Existing historical inspection validates against the artifact's original identity; current execution rejects a different implementation fingerprint. Extending source changes current identity, but must not rewrite old records or allow old checkpoints to execute as the new implementation.

No engine/rules changes are authorized by these findings. Baseline scientific checks and throughput are saved under `reports/local/strategic-baseline-*`.
