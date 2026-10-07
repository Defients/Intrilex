# Intrilex Analysis Dossier

Schema `1.1.0` · generated 2026-10-06T23:21:06.662Z · dossier hash `d66f2a350b921afed6ffa56724228cc3eca498bc98e9f3ac3be611616a6726bb`

> The JSON export is authoritative — this document is a deterministic projection of it. Associations are conditioned on policies, seats, profiles and telemetry; they are not causal proof.

## Executive Summary

- Observatory dataset: 100 match summaries under authority profile "core-advanced-authority" (rules 4.3.1, engine 4.2.6, epoch post-rules-parity-repair-v0.28.1, post-parity-repair).
- Campaign aggregate: 100 matches, 100 completed, 0 aborts, 0 draws; seat-1 win rate 44.0% (Wilson95 [0.347, 0.538]).
- 162 mechanic entities tracked (18 registry-registered), 0 modelled synergies, 16 policies, 30 anomalies, completeness PASS.
- Rank power: 12/18 ladder entries are balance-qualified; descriptive leader 10:club; qualified leader 8.

## Build / Rules / Research Identity

| Field | Value |
| --- | --- |
| Engine | 4.2.6 |
| Rules | 4.3.1 |
| Official rules | 4.3.1 |
| Lab version | 1.0.0 |
| Analytics schema | 4.2.0 |
| Lab artifact schema | 1 |
| Authority profile | core-advanced-authority |
| Authority hash | 1b277ba0663a78cb754f00bba65acbbc5432376cba45ea915f290e44e68750f0 |
| Release identity hash | acbb9d386c748daded29119e3b0db889 |
| Capability hash | c694e02b8ad1cf15351e4814b9c3b90c835e1a7a3d5357ded65f3cb4ae9d4f0b |
| Lab fingerprint | — |

## Evidence Scope

| Field | Value |
| --- | --- |
| Dataset origin | CERTIFIED_CORPUS |
| Authority profile | core-advanced-authority |
| Experiment hash | 8c41081f41328880af83c8769bcdaa42771dbba17de851d5714b8814e5fe406d |
| Canonical result | c114149cc7900f4abdb812f108400cc84cdceb040dca0c81aa02c4d4661b3039 |
| Lab runs | none |
| Matrices | none |
| Research | none |
| Rule mutations | none |
| Experiment | unavailable — Experiment evidence store not supplied to this export. |

## Evidence Coverage

| Source | Count | Hash / provenance |
| --- | --- | --- |
| Observatory summaries | 100 | e575f12f7f704487 |
| Detailed matches | 12 |  |
| Retained replays | 100 |  |
| Campaign aggregate | 100 | 59791c83908dd300 |
| Corpus replays | 121 | 230017997cad8663 |
| Certified replay index | 221 | f09274c60229b31d |
| Lab replay index | 100 | 52d853fe9367b1ac |
| Lab runs | 0 | 0 records |
| Matrices | 0 |  |
| Research projects | 0 |  |
| Mutation experiments | 0 |  |
| Strategy sources | — |  |

## Companion Evidence

_Richer evidence that exists outside this dossier — the dossier is a synthesis layer; the listed artifacts remain authoritative._

| Domain | Companion evidence | Authoritative artifact |
| --- | --- | --- |
| Strategy decision evidence | unavailable — Evolution Lab storage not reachable from this context. |  |
| Lab run envelopes | unavailable — Evolution Lab store not supplied or unreachable. |  |
| Experiment run records | unavailable — Experiment evidence store not supplied to this export. |  |
| Retained replays | 100 ref(s) | Replay bodies live in the certified replay index, the lab replay index, and Evolution run envelopes. |
| Batch matrices | none |  |
| Research projects | none |  |
| Rule mutations | none |  |

## Integrity & Completeness

- Completeness: **PASS** (0 unclassified, tolerance 0)
- Reconciliation: invariant HOLDS · 144 unregistered telemetry tag(s) on tracked entities
- Quarantine: 144 unregistered tag(s) → 143 quarantined entit(ies) + 1 unregistered tag(s) on discovery-exempt entit(ies) (ledger-only, not quarantined)
- Opportunity telemetry: present · legacy schema: no
- Campaign health: 162 entities, 162 with opportunity data, 162 with adjusted association, 0 eligible synergy pairs (276 rejected), 100 incomplete AB/BA blocks

## Policy / Profile Performance

| Policy | Games | W-L-D | Win rate | Wilson 95% | Score margin |
| --- | --- | --- | --- | --- | --- |
| control | 23 | 1-20-0 | 4.8% | [0.008, 0.227] | 449 |
| control-tactical | 10 | 7-3-0 | 70.0% | [0.397, 0.892] | 108 |
| hybrix-baseline | 6 | 4-2-0 | 66.7% | [0.300, 0.903] | 91 |
| hybrix-defender | 6 | 4-2-0 | 66.7% | [0.300, 0.903] | 84 |
| hybrix-rusher | 6 | 5-1-0 | 83.3% | [0.436, 0.970] | 95 |
| hybrix-sniper | 6 | 5-1-0 | 83.3% | [0.436, 0.970] | 80 |
| hybrix-support | 6 | 3-3-0 | 50.0% | [0.188, 0.812] | 127 |
| hybrix-tank | 6 | 3-3-0 | 50.0% | [0.188, 0.812] | 85 |
| hybrix-trickster | 6 | 4-2-0 | 66.7% | [0.300, 0.903] | 96 |
| random-legal | 23 | 5-16-0 | 23.8% | [0.106, 0.451] | 386 |
| score-rush | 23 | 10-11-0 | 47.6% | [0.283, 0.676] | 300 |
| score-rush-tactical | 22 | 15-5-0 | 75.0% | [0.531, 0.888] | 332 |
| tempo | 23 | 9-12-0 | 42.9% | [0.245, 0.635] | 304 |
| tempo-tactical | 6 | 5-1-0 | 83.3% | [0.436, 0.970] | 98 |
| value | 22 | 11-9-0 | 55.0% | [0.342, 0.742] | 300 |
| value-tactical | 6 | 3-3-0 | 50.0% | [0.188, 0.812] | 97 |

## Rank Analysis

Balance qualification: 12/18 ladder entries qualified.

| Rank | RPI | Status | Confidence | Balance qualified | Integrity |
| --- | --- | --- | --- | --- | --- |
| 10:club | 0.8691 | OBSERVED | MEDIUM | false | PASS |
| BJ | 0.6859 | OBSERVED | MEDIUM | false | PASS |
| 10:diamond | 0.4995 | OBSERVED | MEDIUM | false | PASS |
| 8 | 0.4745 | OBSERVED | HIGH | true | PASS |
| J | 0.4735 | OBSERVED | HIGH | true | PASS |
| 9 | 0.4448 | OBSERVED | HIGH | true | PASS |
| K | 0.403 | OBSERVED | HIGH | true | PASS |
| 10:spade | 0.3792 | OBSERVED | MEDIUM | false | PASS |
| 6 | 0.375 | OBSERVED | HIGH | true | PASS |
| 7 | 0.3672 | OBSERVED | HIGH | true | PASS |
| 3 | 0.3299 | OBSERVED | HIGH | true | PASS |
| 10:heart | 0.3275 | OBSERVED | MEDIUM | false | PASS |
| A | 0.3084 | OBSERVED | HIGH | true | PASS |
| Q | 0.3032 | OBSERVED | HIGH | true | PASS |
| 5 | 0.2985 | OBSERVED | HIGH | true | PASS |
| 4 | 0.2912 | OBSERVED | HIGH | true | PASS |
| 2 | 0.1226 | OBSERVED | HIGH | true | PASS |
| RJ | 0.0889 | OBSERVED | MEDIUM | false | PASS |

Swap matrix present (18 keys). Ten-suit expansion present.

## Variant Analysis

61 variant keys tracked · metric registry 730a56fde2d7.

| Rank variant | Win rate | Play rate | Selection power | Victory power | Confidence |
| --- | --- | --- | --- | --- | --- |
| Rank A (overall) | 50.0% | 26.4% | 0.4397 | 0.6667 | HIGH |
| Rank 2 (overall) | 49.2% | 17.9% | 0.2979 | 0.6554 | HIGH |
| Rank 3 (overall) | 56.5% | 30.0% | 0.5005 | 0.7536 | HIGH |
| Rank 4 (overall) | 52.4% | 28.5% | 0.4749 | 0.6984 | HIGH |
| Rank 5 (overall) | 58.9% | 20.6% | 0.3435 | 0.7854 | HIGH |
| Rank 6 (overall) | 53.8% | 25.6% | 0.4273 | 0.7167 | HIGH |
| Rank 7 (overall) | 55.3% | 20.6% | 0.3428 | 0.7376 | HIGH |
| Rank 8 (overall) | 55.9% | 36.2% | 0.6032 | 0.7451 | HIGH |
| Rank 9 (overall) | 49.1% | 43.0% | 0.716 | 0.6552 | HIGH |
| Rank 10 (overall) | 54.6% | 47.8% | 0.7961 | 0.7283 | HIGH |
| Rank J (overall) | 54.6% | 43.8% | 0.7298 | 0.7285 | HIGH |
| Rank Q (overall) | 55.7% | 24.3% | 0.4051 | 0.7429 | HIGH |
| Rank K (overall) | 47.7% | 43.1% | 0.7178 | 0.6366 | HIGH |
| Rank RJ (overall) | 38.7% | 22.6% | 0.3771 | 0.5161 | HIGH |
| Rank BJ (overall) | 63.2% | 30.0% | 0.5 | 0.8421 | HIGH |

_Per-participant, per-seat, per-profile and sensitivity metrics are in the JSON `variants` section._

## Mechanics

162 tracked entities (143 quarantined). Top by legal-opportunity count:

| Mechanic | Category | Pick rate | Opportunities | Adj. win assoc | 95% CI | q-value | Grade | Quarantined |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Draw | resource | 22.6% | 1636 | 0.0431 | [-0.063, 0.149] | 0.0161 | EXPLORATORY | no |
| Swap Bar | resource | 13.2% | 1610 | -0.0341 | [-0.239, 0.171] | 0.0068 | EXPLORATORY | no |
| score | unknown | 37.8% | 1478 | 0.3826 | [0.257, 0.509] | — | INSUFFICIENT | no |
| face-up-draw | unknown | 4.6% | 1182 | 0.1196 | [0.003, 0.236] | — | INSUFFICIENT | yes |
| Private Choice Effect | advanced | 8.5% | 1053 | -0.0278 | [-0.166, 0.110] | 0.3722 | INSUFFICIENT | no |
| Anchor | protection | 12.4% | 629 | 0.0257 | [-0.087, 0.138] | 0.6139 | INSUFFICIENT | no |
| Scuttle | control | 26.2% | 443 | -0.3812 | [-0.466, -0.297] | 0.3722 | INSUFFICIENT | no |
| face-down | unknown | 36.9% | 428 | 0.25 | [-0.563, 1.063] | — | INSUFFICIENT | yes |
| seven-topdeck | unknown | 4.7% | 403 | 0.0817 | [-0.118, 0.282] | 0.5661 | INSUFFICIENT | yes |
| five-recycle | unknown | 4.8% | 355 | -0.0114 | [-0.120, 0.097] | 0.6412 | INSUFFICIENT | yes |
| Ultra | terminal | 33.4% | 332 | 0.1578 | [0.075, 0.240] | 0.4586 | INSUFFICIENT | no |
| solo-wild | unknown | 9.0% | 301 | 0.0257 | [-0.100, 0.152] | — | INSUFFICIENT | yes |
| six-dig | unknown | 12.8% | 289 | 0.1159 | [-0.079, 0.310] | 0.4665 | INSUFFICIENT | yes |
| ace | unknown | 5.8% | 274 | -0.1033 | [-0.212, 0.006] | 0.3722 | INSUFFICIENT | yes |
| eight-aegis-field | unknown | 17.8% | 264 | 0.0232 | [-0.076, 0.122] | 0.3722 | INSUFFICIENT | yes |
| Voltage | terminal | 46.0% | 263 | 0.2271 | [0.101, 0.353] | 0.0068 | EXPLORATORY | no |
| queen | unknown | 3.8% | 238 | -0.0646 | [-0.278, 0.149] | — | INSUFFICIENT | yes |
| king | unknown | 22.4% | 237 | 0.1479 | [0.044, 0.252] | 0.9165 | INSUFFICIENT | yes |
| clear-er | unknown | 1.7% | 230 | -0.1092 | [-0.219, 0.001] | — | INSUFFICIENT | yes |
| clear-pr | unknown | 8.3% | 230 | -0.143 | [-0.236, -0.050] | 1 | INSUFFICIENT | yes |
| Scout (4) | response | 10.9% | 230 | -0.1716 | [-0.267, -0.076] | 0.4561 | INSUFFICIENT | no |
| natural-four | unknown | 3.0% | 230 | -0.1122 | [-0.217, -0.008] | — | INSUFFICIENT | yes |
| three-force-discard | unknown | 3.4% | 204 | -0.127 | [-0.243, -0.011] | — | INSUFFICIENT | yes |
| three-present-take | unknown | 1.0% | 204 | 0.6621 | [0.464, 0.861] | — | INSUFFICIENT | yes |
| Anchor Private Choice | advanced | 6.4% | 188 | -0.1203 | [-0.290, 0.049] | 0.5018 | INSUFFICIENT | no |
| nine | unknown | 6.4% | 188 | -0.1203 | [-0.290, 0.049] | — | INSUFFICIENT | yes |
| nine-goal-shift-3 | unknown | 1.1% | 188 | -0.3571 | [-0.608, -0.106] | — | INSUFFICIENT | yes |
| nine-goal-shift-5 | unknown | 2.7% | 188 | 0.49 | [0.315, 0.665] | — | INSUFFICIENT | yes |
| 2-black-2-red-draw | unknown | 22.7% | 185 | -0.032 | [-0.151, 0.087] | 0.3722 | INSUFFICIENT | yes |
| Rank 10 Mechanic | advanced | 43.9% | 173 | 0.1343 | [0.030, 0.239] | 0.3722 | INSUFFICIENT | no |
| five-gy-bottom | unknown | 35.9% | 170 | 0.342 | [0.209, 0.475] | 0 | EXPLORATORY | yes |
| bounce-top | unknown | 20.3% | 158 | 0.2026 | [0.078, 0.327] | — | INSUFFICIENT | yes |
| Peek & Reveal (3) | response | 20.3% | 158 | 0.2026 | [0.078, 0.327] | 0.7575 | INSUFFICIENT | no |
| Disrupt | response | 61.8% | 152 | 0.1133 | [0.025, 0.201] | 0.9165 | INSUFFICIENT | no |
| jack | unknown | 61.8% | 152 | 0.1133 | [0.025, 0.201] | — | INSUFFICIENT | yes |
| Counter | response | 67.2% | 131 | 0.1979 | [0.102, 0.293] | 0.3722 | INSUFFICIENT | no |
| five-refine | unknown | 19.7% | 122 | 0.1847 | [0.000, 0.369] | — | INSUFFICIENT | yes |
| queen-aegis | unknown | 26.7% | 116 | 0.2957 | [0.205, 0.386] | — | INSUFFICIENT | yes |
| total-clear | unknown | 2.8% | 109 | -0.0716 | [-0.188, 0.045] | — | INSUFFICIENT | yes |
| board-lock | unknown | 7.7% | 104 | -0.1613 | [-0.301, -0.022] | — | INSUFFICIENT | yes |

_122 additional mechanics in the JSON export._

## Synergies & Anti-Synergies

_No modelled synergy pairs._

276 candidate pair(s) rejected/unmodelled — see integrity section for status counts.

## Motifs / Repeated Patterns

| Motif | Count | Outcomes |
| --- | --- | --- |
| score → score | 29 | NORMAL_VICTORY:29 |
| unclassified → score | 17 | NORMAL_VICTORY:17 |
| face-down → unclassified | 9 | NORMAL_VICTORY:9 |
| score → unclassified | 9 | NORMAL_VICTORY:9 |
| nine-tap → nine-tap | 6 | NORMAL_VICTORY:6 |
| unclassified → 2-black-2-red-draw | 6 | NORMAL_VICTORY:6 |
| score → nine-tap | 5 | NORMAL_VICTORY:5 |
| unclassified → club-foundation-bonus | 4 | NORMAL_VICTORY:4 |
| unclassified → heart-tempo | 4 | NORMAL_VICTORY:4 |
| club-foundation-bonus → club-foundation-bonus | 3 | NORMAL_VICTORY:3 |
| club-foundation-bonus → unclassified | 3 | NORMAL_VICTORY:3 |
| disrupt → score | 3 | NORMAL_VICTORY:3 |
| unclassified → unclassified | 3 | NORMAL_VICTORY:3 |
| 2-black-2-red-draw → disrupt | 2 | NORMAL_VICTORY:2 |
| 2-black-2-red-draw → score | 2 | NORMAL_VICTORY:2 |
| 2-black-2-red-rummage → score | 2 | NORMAL_VICTORY:2 |
| disrupt → disrupt | 2 | NORMAL_VICTORY:2 |
| disrupt → unclassified | 2 | NORMAL_VICTORY:2 |
| rank10-stack-theft → three-red-counter | 2 | NORMAL_VICTORY:2 |
| score → disrupt | 2 | NORMAL_VICTORY:2 |
| score → seven-scoring-trigger-take-CORE-017 | 2 | NORMAL_VICTORY:2 |
| three-red-counter → three-red-counter | 2 | NORMAL_VICTORY:2 |
| unclassified → draw | 2 | NORMAL_VICTORY:2 |
| 2-black-2-red-draw → anchor | 1 | NORMAL_VICTORY:1 |
| 2-black-2-red-draw → club-foundation-bonus | 1 | NORMAL_VICTORY:1 |
| ace-base → ace-base | 1 | NORMAL_VICTORY:1 |
| ace-base → unclassified | 1 | NORMAL_VICTORY:1 |
| ace-spade → eight-aegis-field | 1 | NORMAL_VICTORY:1 |
| anchor → anchor | 1 | NORMAL_VICTORY:1 |
| anchor → effect-private-choice | 1 | NORMAL_VICTORY:1 |

_30 additional motifs in the JSON export._

## AB/BA & Seat Effects

Design: matched AB/BA seat-swap · 0 complete paired blocks · 100 incomplete · pairing by pairedRunId

> pairedRunIds are present but none grouped ≥2 matches — the campaign schedule did not repeat pair blocks, so AB/BA pairing is not possible on this dataset

## Choice Analysis

Coverage: 4006/4006 usable decision frames (2868 multi-option). 1016 contexts, 277 entities.

> Conditional choice analysis: opportunities are frames where the option was simultaneously legal — joint legality does not by itself mean substitutable alternatives. Entropy measures selection diversity within an identical offered set only — different choice sets are never pooled. Deterministic selection is decision behavior, not balance evidence. choiceSupport reports legal-but-unselected frames: without them a pick rate describes what happened, not what was preferred. Pair relation marks rivals that were never independently selectable (relation !== independent-rival) — conditional share on such pairs is structural, not preference.

## Strategy Analysis

_Unavailable — Evolution Lab storage not reachable from this context.._

## Arena Results

_Unavailable — Evolution Lab storage not reachable from this context.._

## Batch Experiment Results

_No batch matrices._

## Evolution / Learning Results

_No research projects._

## Rule Mutation Experiments

_No rule-mutation experiments persisted._

## Anomalies

| Type | Severity | Match | Value | Baseline | Detail |
| --- | --- | --- | --- | --- | --- |
| LONG_MATCH | warning | M-0cb7ff81422b13b69064 | 56 | 50.05 | 56 completed turns ≥ p95 baseline (50.05 turns); tail detector flags ~5% of matches by construction |
| ORCHESTRATION_DENSITY | info | M-0eb5279a20c8b5c7fadc | 34 | — | 34 automatic priority advances > max(30, 8×3 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-1b9ce7c6ecb94b540b09 | 129 | — | 129 automatic priority advances > max(30, 8×9 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-1d9b0db8df3efa98ae2c | 116 | — | 116 automatic priority advances > max(30, 8×7 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-2e7aa9b5e00505294fc0 | 109 | — | 109 automatic priority advances > max(30, 8×6 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-4756067b923a59fad42d | 67 | — | 67 automatic priority advances > max(30, 8×7 response opportunities) |
| LONG_MATCH | warning | M-4e938b55c5c081cf4195 | 51 | 50.05 | 51 completed turns ≥ p95 baseline (50.05 turns); tail detector flags ~5% of matches by construction |
| ORCHESTRATION_DENSITY | info | M-4e938b55c5c081cf4195 | 134 | — | 134 automatic priority advances > max(30, 8×12 response opportunities) |
| RESPONSE_CHAIN_INTENSITY | info | M-4e938b55c5c081cf4195 | 23 | — | 23 response plays > 20 per match |
| ORCHESTRATION_DENSITY | info | M-522454b71d0726b45836 | 32 | — | 32 automatic priority advances > max(30, 8×2 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-5f0d1c1b8066da4877b9 | 46 | — | 46 automatic priority advances > max(30, 8×4 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-5f2660010ee9acaad412 | 73 | — | 73 automatic priority advances > max(30, 8×3 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-7b7e7ab66d88f3491867 | 68 | — | 68 automatic priority advances > max(30, 8×5 response opportunities) |
| LONG_MATCH | warning | M-7d2e54be2e472d2f7c7d | 52 | 50.05 | 52 completed turns ≥ p95 baseline (50.05 turns); tail detector flags ~5% of matches by construction |
| ORCHESTRATION_DENSITY | info | M-7d2e54be2e472d2f7c7d | 126 | — | 126 automatic priority advances > max(30, 8×8 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-82d0158eacf1f693fe2a | 36 | — | 36 automatic priority advances > max(30, 8×2 response opportunities) |
| LONG_MATCH | warning | M-8c60ef2014c378bcb9ff | 52 | 50.05 | 52 completed turns ≥ p95 baseline (50.05 turns); tail detector flags ~5% of matches by construction |
| ORCHESTRATION_DENSITY | info | M-8c60ef2014c378bcb9ff | 124 | — | 124 automatic priority advances > max(30, 8×9 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-950f525deedd2a7736c7 | 74 | — | 74 automatic priority advances > max(30, 8×6 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-a478ccdcc1e81c64bdb5 | 40 | — | 40 automatic priority advances > max(30, 8×4 response opportunities) |
| LONG_MATCH | warning | M-a6073e68be3dfa99914b | 52 | 50.05 | 52 completed turns ≥ p95 baseline (50.05 turns); tail detector flags ~5% of matches by construction |
| ORCHESTRATION_DENSITY | info | M-a6073e68be3dfa99914b | 124 | — | 124 automatic priority advances > max(30, 8×14 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-a70f77adb2c9476531b2 | 40 | — | 40 automatic priority advances > max(30, 8×2 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-b615ae18bd3e0f132ef8 | 65 | — | 65 automatic priority advances > max(30, 8×4 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-be23c86bf5150b63b8ce | 44 | — | 44 automatic priority advances > max(30, 8×5 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-c16d20b1a2a555dc6b2a | 98 | — | 98 automatic priority advances > max(30, 8×9 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-d42c5a76b1a43e8227de | 31 | — | 31 automatic priority advances > max(30, 8×2 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-dfab048a83e3b8acc06c | 40 | — | 40 automatic priority advances > max(30, 8×3 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-f3fba5744ac97b09f3e9 | 38 | — | 38 automatic priority advances > max(30, 8×1 response opportunities) |
| ORCHESTRATION_DENSITY | info | M-f468fb9b0431f3ac6637 | 42 | — | 42 automatic priority advances > max(30, 8×5 response opportunities) |

## Statistical Uncertainty

- **paired-analysis:** AB/BA pairing: 0 complete paired blocks, 100 incomplete
- **ranks:** Axis coverage {"boardPower":1,"observedRankValue":0.9444444444444444,"responsePower":1,"scorePower":1,"selectionPower":1,"victoryPower":1}

## Findings

### flagged (30)

| Domain | Subject | Claim | Effect | CI | p | q | n | Grade |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| integrity | LONG_MATCH | 56 completed turns ≥ p95 baseline (50.05 turns); tail detector flags ~5% of matches by construction | 56 | unavailable | — | — | — | — |
| integrity | LONG_MATCH | 51 completed turns ≥ p95 baseline (50.05 turns); tail detector flags ~5% of matches by construction | 51 | unavailable | — | — | — | — |
| integrity | LONG_MATCH | 52 completed turns ≥ p95 baseline (50.05 turns); tail detector flags ~5% of matches by construction | 52 | unavailable | — | — | — | — |
| integrity | LONG_MATCH | 52 completed turns ≥ p95 baseline (50.05 turns); tail detector flags ~5% of matches by construction | 52 | unavailable | — | — | — | — |
| integrity | LONG_MATCH | 52 completed turns ≥ p95 baseline (50.05 turns); tail detector flags ~5% of matches by construction | 52 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 34 automatic priority advances > max(30, 8×3 response opportunities) | 34 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 129 automatic priority advances > max(30, 8×9 response opportunities) | 129 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 116 automatic priority advances > max(30, 8×7 response opportunities) | 116 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 109 automatic priority advances > max(30, 8×6 response opportunities) | 109 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 67 automatic priority advances > max(30, 8×7 response opportunities) | 67 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 134 automatic priority advances > max(30, 8×12 response opportunities) | 134 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 32 automatic priority advances > max(30, 8×2 response opportunities) | 32 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 46 automatic priority advances > max(30, 8×4 response opportunities) | 46 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 73 automatic priority advances > max(30, 8×3 response opportunities) | 73 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 68 automatic priority advances > max(30, 8×5 response opportunities) | 68 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 126 automatic priority advances > max(30, 8×8 response opportunities) | 126 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 36 automatic priority advances > max(30, 8×2 response opportunities) | 36 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 124 automatic priority advances > max(30, 8×9 response opportunities) | 124 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 74 automatic priority advances > max(30, 8×6 response opportunities) | 74 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 40 automatic priority advances > max(30, 8×4 response opportunities) | 40 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 124 automatic priority advances > max(30, 8×14 response opportunities) | 124 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 40 automatic priority advances > max(30, 8×2 response opportunities) | 40 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 65 automatic priority advances > max(30, 8×4 response opportunities) | 65 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 44 automatic priority advances > max(30, 8×5 response opportunities) | 44 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 98 automatic priority advances > max(30, 8×9 response opportunities) | 98 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 31 automatic priority advances > max(30, 8×2 response opportunities) | 31 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 40 automatic priority advances > max(30, 8×3 response opportunities) | 40 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 38 automatic priority advances > max(30, 8×1 response opportunities) | 38 | unavailable | — | — | — | — |
| integrity | ORCHESTRATION_DENSITY | 42 automatic priority advances > max(30, 8×5 response opportunities) | 42 | unavailable | — | — | — | — |
| integrity | RESPONSE_CHAIN_INTENSITY | 23 response plays > 20 per match | 23 | unavailable | — | — | — | — |

### measured (178)

| Domain | Subject | Claim | Effect | CI | p | q | n | Grade |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mechanic | 2-black-2-red-draw | 2-black-2-red-draw: selected in 42 of 185 legal opportunities; adjusted win association -0.032 | -0.032 | [-0.151, 0.087] | 0.1587 | 0.3722 | 42 | INSUFFICIENT |
| mechanic | 2-black-2-red-rummage | 2-black-2-red-rummage: selected in 9 of 32 legal opportunities; adjusted win association -0.2597 | -0.2597 | [-0.391, -0.128] | 0.2791 | — | 9 | INSUFFICIENT |
| mechanic | ace | ace: selected in 16 of 274 legal opportunities; adjusted win association -0.1033 | -0.1033 | [-0.212, 0.006] | 0.1223 | 0.3722 | 13 | INSUFFICIENT |
| mechanic | ace-anchor | ace-anchor: selected in 8 of 14 legal opportunities; adjusted win association -0.0477 | -0.0477 | [-0.164, 0.068] | 0.2032 | — | 7 | INSUFFICIENT |
| mechanic | ace-base | ace-base: selected in 39 of 57 legal opportunities; adjusted win association 0.0623 | 0.0623 | [-0.038, 0.162] | 0.0766 | 0.3722 | 33 | INSUFFICIENT |
| mechanic | ace-spade | ace-spade: selected in 18 of 31 legal opportunities; adjusted win association 0.2092 | 0.2092 | [0.121, 0.298] | 0.3119 | 0.4953 | 18 | INSUFFICIENT |
| mechanic | Anchor | anchor: selected in 78 of 629 legal opportunities; adjusted win association 0.0257 | 0.0257 | [-0.087, 0.138] | 0.5002 | 0.6139 | 46 | INSUFFICIENT |
| mechanic | Anchor Private Choice | anchor-private-choice: selected in 12 of 188 legal opportunities; adjusted win association -0.1203 | -0.1203 | [-0.290, 0.049] | 0.3345 | 0.5018 | 11 | INSUFFICIENT |
| mechanic | Attachment | attachment: selected in 7 of 32 legal opportunities; adjusted win association 0.2372 | 0.2372 | [0.065, 0.409] | 0.0279 | — | 6 | INSUFFICIENT |
| mechanic | bj-exile-recycle-CORE-003-CORE-016 | bj-exile-recycle-CORE-003-CORE-016: selected in 1 of 1 legal opportunities; adjusted win association 0.8333 | 0.8333 | [0.535, 1.132] | 0 | — | 1 | INSUFFICIENT |
| mechanic | bj-exile-recycle-CORE-007 | bj-exile-recycle-CORE-007: selected in 1 of 2 legal opportunities; adjusted win association 0.2 | 0.2 | [-0.151, 0.551] | 0 | — | 1 | INSUFFICIENT |
| mechanic | bj-exile-recycle-CORE-011 | bj-exile-recycle-CORE-011: selected in 1 of 1 legal opportunities; adjusted win association 0.5333 | 0.5333 | [0.281, 0.786] | 0 | — | 1 | INSUFFICIENT |
| mechanic | bj-exile-recycle-skip | bj-exile-recycle-skip: selected in 5 of 8 legal opportunities; adjusted win association 0.5132 | 0.5132 | [0.374, 0.653] | 0 | — | 5 | INSUFFICIENT |
| mechanic | board-lock | board-lock: selected in 8 of 104 legal opportunities; adjusted win association -0.1613 | -0.1613 | [-0.301, -0.022] | 0 | — | 7 | INSUFFICIENT |
| mechanic | bounce-top | bounce-top: selected in 32 of 158 legal opportunities; adjusted win association 0.2026 | 0.2026 | [0.078, 0.327] | 0.6733 | — | 26 | INSUFFICIENT |
| mechanic | clear-er | clear-er: selected in 4 of 230 legal opportunities; adjusted win association -0.1092 | -0.1092 | [-0.219, 0.001] | 0.245 | — | 4 | INSUFFICIENT |
| mechanic | clear-pr | clear-pr: selected in 19 of 230 legal opportunities; adjusted win association -0.143 | -0.143 | [-0.236, -0.050] | 1 | 1 | 16 | INSUFFICIENT |
| mechanic | club-foundation | club-foundation: selected in 6 of 70 legal opportunities; adjusted win association 0.0702 | 0.0702 | [-0.037, 0.177] | 0.0279 | — | 6 | INSUFFICIENT |
| mechanic | club-foundation-bonus | club-foundation-bonus: selected in 25 of 45 legal opportunities; adjusted win association 0.1225 | 0.1225 | [0.040, 0.205] | 0.1792 | 0.3722 | 24 | INSUFFICIENT |
| mechanic | Counter | counter: selected in 88 of 131 legal opportunities; adjusted win association 0.1979 | 0.1979 | [0.102, 0.293] | 0.1711 | 0.3722 | 65 | INSUFFICIENT |
| mechanic | deep-draw | deep-draw: selected in 2 of 56 legal opportunities; adjusted win association -0.3571 | -0.3571 | [-0.608, -0.106] | 0 | — | 2 | INSUFFICIENT |
| mechanic | deep-draw-♠ | deep-draw-♠: selected in 1 of 77 legal opportunities; adjusted win association -0.3333 | -0.3333 | [-0.572, -0.095] | 0 | — | 1 | INSUFFICIENT |
| mechanic | diamond-mimic-paired-super-j-tempo | diamond-mimic-paired-super-j-tempo: selected in 2 of 4 legal opportunities; adjusted win association -0.0819 | -0.0819 | [-0.198, 0.034] | 0 | — | 2 | INSUFFICIENT |
| mechanic | diamond-mimic-row-exchange-er | diamond-mimic-row-exchange-er: selected in 8 of 55 legal opportunities; adjusted win association -0.0553 | -0.0553 | [-0.146, 0.035] | 0.6976 | — | 7 | INSUFFICIENT |
| mechanic | diamond-mimic-row-exchange-pr | diamond-mimic-row-exchange-pr: selected in 11 of 55 legal opportunities; adjusted win association -0.0469 | -0.0469 | [-0.141, 0.047] | 0.0839 | — | 11 | INSUFFICIENT |
| mechanic | Disrupt | disrupt: selected in 94 of 152 legal opportunities; adjusted win association 0.1133 | 0.1133 | [0.025, 0.201] | 0.8825 | 0.9165 | 71 | INSUFFICIENT |
| mechanic | Draw | draw: selected in 370 of 1636 legal opportunities; adjusted win association 0.0431 | 0.0431 | [-0.063, 0.149] | 0.0024 | 0.0161 | 101 | EXPLORATORY |
| mechanic | effect-ace | effect-ace: selected in 16 of 69 legal opportunities; adjusted win association 0.0046 | 0.0046 | [-0.162, 0.171] | 0.2082 | — | 12 | INSUFFICIENT |
| mechanic | Scout (4) | effect-four: selected in 25 of 230 legal opportunities; adjusted win association -0.1716 | -0.1716 | [-0.267, -0.076] | 0.2365 | 0.4561 | 21 | INSUFFICIENT |
| mechanic | Private Choice Effect | effect-private-choice: selected in 89 of 1053 legal opportunities; adjusted win association -0.0278 | -0.0278 | [-0.166, 0.110] | 0.1736 | 0.3722 | 46 | INSUFFICIENT |
| mechanic | Red Joker Effect | effect-red-joker: selected in 5 of 85 legal opportunities; adjusted win association 0.2129 | 0.2129 | [0.080, 0.345] | 0.6441 | — | 5 | INSUFFICIENT |
| mechanic | Peek & Reveal (3) | effect-three: selected in 32 of 158 legal opportunities; adjusted win association 0.2026 | 0.2026 | [0.078, 0.327] | 0.6733 | 0.7575 | 26 | INSUFFICIENT |
| mechanic | eight-absolute-scuttle | eight-absolute-scuttle: selected in 4 of 14 legal opportunities; adjusted win association 0.2253 | 0.2253 | [0.018, 0.433] | 0.245 | — | 4 | INSUFFICIENT |
| mechanic | eight-aegis-field | eight-aegis-field: selected in 47 of 264 legal opportunities; adjusted win association 0.0232 | 0.0232 | [-0.076, 0.122] | 0.1327 | 0.3722 | 36 | INSUFFICIENT |
| mechanic | eight-scuttle | eight-scuttle: selected in 11 of 12 legal opportunities; adjusted win association 0.1229 | 0.1229 | [0.028, 0.218] | 0.0839 | — | 11 | INSUFFICIENT |
| mechanic | eight-spade-free-scuttle | eight-spade-free-scuttle: selected in 11 of 13 legal opportunities; adjusted win association 0.2551 | 0.2551 | [0.157, 0.353] | 0.0839 | — | 11 | INSUFFICIENT |
| mechanic | Exhausted Pass | exhausted-pass: selected in 1 of 1 legal opportunities; adjusted win association 0.7333 | 0.7333 | [0.510, 0.957] | 0 | — | 1 | INSUFFICIENT |
| mechanic | face-down | face-down: selected in 158 of 428 legal opportunities; adjusted win association 0.25 | 0.25 | [-0.563, 1.063] | 0.0023 | — | 107 | INSUFFICIENT |
| mechanic | face-up-draw | face-up-draw: selected in 54 of 1182 legal opportunities; adjusted win association 0.1196 | 0.1196 | [0.003, 0.236] | 0.8523 | — | 35 | INSUFFICIENT |
| mechanic | five-gy-bottom | five-gy-bottom: selected in 61 of 170 legal opportunities; adjusted win association 0.342 | 0.342 | [0.209, 0.475] | 0 | 0 | 22 | EXPLORATORY |
| mechanic | five-recycle | five-recycle: selected in 17 of 355 legal opportunities; adjusted win association -0.0114 | -0.0114 | [-0.120, 0.097] | 0.5462 | 0.6412 | 12 | INSUFFICIENT |
| mechanic | five-refine | five-refine: selected in 24 of 122 legal opportunities; adjusted win association 0.1847 | 0.1847 | [0.000, 0.369] | 0.7315 | — | 9 | INSUFFICIENT |
| mechanic | four-exchange-er | four-exchange-er: selected in 1 of 23 legal opportunities; adjusted win association 0.5333 | 0.5333 | [0.281, 0.786] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-exchange-pr | four-exchange-pr: selected in 3 of 23 legal opportunities; adjusted win association 0.0828 | 0.0828 | [-0.162, 0.328] | 0.5376 | — | 3 | INSUFFICIENT |
| mechanic | four-guess-2-♠ | four-guess-2-♠: selected in 3 of 64 legal opportunities; adjusted win association 0.0535 | 0.0535 | [-0.104, 0.210] | 0.5376 | — | 3 | INSUFFICIENT |
| mechanic | four-guess-2-♣ | four-guess-2-♣: selected in 1 of 64 legal opportunities; adjusted win association 0.3333 | 0.3333 | [0.095, 0.572] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-3-♠ | four-guess-3-♠: selected in 1 of 64 legal opportunities; adjusted win association -0.3333 | -0.3333 | [-0.572, -0.095] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-3-♥ | four-guess-3-♥: selected in 1 of 64 legal opportunities; adjusted win association -0.7333 | -0.7333 | [-0.957, -0.510] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-4-♠ | four-guess-4-♠: selected in 1 of 64 legal opportunities; adjusted win association 0.3333 | 0.3333 | [0.095, 0.572] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-4-♦ | four-guess-4-♦: selected in 1 of 64 legal opportunities; adjusted win association 0.3333 | 0.3333 | [0.095, 0.572] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-5-♦ | four-guess-5-♦: selected in 1 of 64 legal opportunities; adjusted win association 0.4 | 0.4 | [-0.029, 0.829] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-6-♣ | four-guess-6-♣: selected in 1 of 64 legal opportunities; adjusted win association 0.4 | 0.4 | [-0.029, 0.829] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-7-♥ | four-guess-7-♥: selected in 1 of 64 legal opportunities; adjusted win association -0.7333 | -0.7333 | [-0.957, -0.510] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-7-♦ | four-guess-7-♦: selected in 2 of 64 legal opportunities; adjusted win association -0.1604 | -0.1604 | [-0.369, 0.048] | 1 | — | 2 | INSUFFICIENT |
| mechanic | four-guess-9-♠ | four-guess-9-♠: selected in 1 of 64 legal opportunities; adjusted win association -0.3333 | -0.3333 | [-0.572, -0.095] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-9-♣ | four-guess-9-♣: selected in 1 of 64 legal opportunities; adjusted win association -0.3333 | -0.3333 | [-0.572, -0.095] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-A-♠ | four-guess-A-♠: selected in 1 of 64 legal opportunities; adjusted win association 0.4 | 0.4 | [-0.029, 0.829] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-A-♥ | four-guess-A-♥: selected in 1 of 64 legal opportunities; adjusted win association 0.4 | 0.4 | [-0.029, 0.829] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-guess-J-♠ | four-guess-J-♠: selected in 2 of 64 legal opportunities; adjusted win association 0 | 0 | [-0.169, 0.169] | 1 | — | 2 | INSUFFICIENT |
| mechanic | four-guess-J-♥ | four-guess-J-♥: selected in 2 of 64 legal opportunities; adjusted win association 0 | 0 | [-0.169, 0.169] | 1 | — | 2 | INSUFFICIENT |
| mechanic | four-row-clear-er-♠ | four-row-clear-er-♠: selected in 1 of 89 legal opportunities; adjusted win association 0.4 | 0.4 | [-0.029, 0.829] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-row-clear-er-♣ | four-row-clear-er-♣: selected in 1 of 83 legal opportunities; adjusted win association -0.8 | -0.8 | [-1.151, -0.449] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-row-clear-er-♦ | four-row-clear-er-♦: selected in 1 of 83 legal opportunities; adjusted win association -0.3333 | -0.3333 | [-0.572, -0.095] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-row-clear-pr-♠ | four-row-clear-pr-♠: selected in 5 of 89 legal opportunities; adjusted win association 0.264 | 0.264 | [0.084, 0.444] | 0.0917 | — | 5 | INSUFFICIENT |
| mechanic | four-row-clear-pr-♣ | four-row-clear-pr-♣: selected in 5 of 83 legal opportunities; adjusted win association 0 | 0 | [-0.165, 0.165] | 1 | — | 4 | INSUFFICIENT |
| mechanic | four-row-clear-pr-♥ | four-row-clear-pr-♥: selected in 1 of 64 legal opportunities; adjusted win association 0.4 | 0.4 | [-0.029, 0.829] | 0 | — | 1 | INSUFFICIENT |
| mechanic | four-row-clear-pr-♦ | four-row-clear-pr-♦: selected in 2 of 83 legal opportunities; adjusted win association 0 | 0 | [-0.304, 0.304] | 1 | — | 2 | INSUFFICIENT |
| mechanic | hand-swap | hand-swap: selected in 4 of 85 legal opportunities; adjusted win association 0.3818 | 0.3818 | [0.239, 0.525] | 0.245 | — | 4 | INSUFFICIENT |
| mechanic | heart-tempo | heart-tempo: selected in 21 of 49 legal opportunities; adjusted win association -0.1211 | -0.1211 | [-0.220, -0.022] | 0.8174 | — | 21 | INSUFFICIENT |
| mechanic | jack | jack: selected in 94 of 152 legal opportunities; adjusted win association 0.1133 | 0.1133 | [0.025, 0.201] | 0.8825 | — | 71 | INSUFFICIENT |
| mechanic | jack-pr | jack-pr: selected in 7 of 30 legal opportunities; adjusted win association 0.2372 | 0.2372 | [0.065, 0.409] | 0.0279 | — | 6 | INSUFFICIENT |
| mechanic | jack-tempo | jack-tempo: selected in 3 of 12 legal opportunities; adjusted win association -0.4181 | -0.4181 | [-0.657, -0.179] | 0.5376 | — | 3 | INSUFFICIENT |
| mechanic | king | king: selected in 53 of 237 legal opportunities; adjusted win association 0.1479 | 0.1479 | [0.044, 0.252] | 0.8489 | 0.9165 | 33 | INSUFFICIENT |
| mechanic | king-anchor | king-anchor: selected in 10 of 19 legal opportunities; adjusted win association -0.2406 | -0.2406 | [-0.333, -0.149] | 0 | — | 10 | INSUFFICIENT |
| mechanic | king-spade | king-spade: selected in 2 of 2 legal opportunities; adjusted win association -0.2 | -0.2 | [-0.551, 0.151] | 0 | — | 2 | INSUFFICIENT |
| mechanic | natural-four | natural-four: selected in 7 of 230 legal opportunities; adjusted win association -0.1122 | -0.1122 | [-0.217, -0.008] | 0.6976 | — | 7 | INSUFFICIENT |
| mechanic | natural-four-reorder-CORE-026-CORE-022-CORE-024-CORE-028 | natural-four-reorder-CORE-026-CORE-022-CORE-024-CORE-028: selected in 1 of 1 legal opportunities; adjusted win association 0.7333 | 0.7333 | [0.510, 0.957] | 0 | — | 1 | INSUFFICIENT |
| mechanic | natural-four-reorder-draw-CORE-019-CORE-001-CORE-017-CORE-021 | natural-four-reorder-draw-CORE-019-CORE-001-CORE-017-CORE-021: selected in 1 of 1 legal opportunities; adjusted win association -0.8 | -0.8 | [-1.151, -0.449] | 0 | — | 1 | INSUFFICIENT |
| mechanic | natural-four-reorder-draw-CORE-019-CORE-017-CORE-021-CORE-023 | natural-four-reorder-draw-CORE-019-CORE-017-CORE-021-CORE-023: selected in 1 of 1 legal opportunities; adjusted win association -0.0667 | -0.0667 | [-0.193, 0.060] | 0 | — | 1 | INSUFFICIENT |
| mechanic | natural-four-reorder-draw-CORE-038-CORE-040-CORE-042-CORE-044 | natural-four-reorder-draw-CORE-038-CORE-040-CORE-042-CORE-044: selected in 1 of 1 legal opportunities; adjusted win association 0.6 | 0.6 | [0.171, 1.029] | 0 | — | 1 | INSUFFICIENT |
| mechanic | natural-four-reorder-draw-CORE-040-CORE-042-CORE-044-CORE-046 | natural-four-reorder-draw-CORE-040-CORE-042-CORE-044-CORE-046: selected in 1 of 1 legal opportunities; adjusted win association 0.6 | 0.6 | [0.171, 1.029] | 0 | — | 1 | INSUFFICIENT |
| mechanic | nine | nine: selected in 12 of 188 legal opportunities; adjusted win association -0.1203 | -0.1203 | [-0.290, 0.049] | 0.3345 | — | 11 | INSUFFICIENT |
| mechanic | nine-anchor-discard | nine-anchor-discard: selected in 9 of 9 legal opportunities; adjusted win association 0.471 | 0.471 | [0.298, 0.644] | 0.0978 | — | 8 | INSUFFICIENT |
| mechanic | nine-goal-shift-3 | nine-goal-shift-3: selected in 2 of 188 legal opportunities; adjusted win association -0.3571 | -0.3571 | [-0.608, -0.106] | 0 | — | 2 | INSUFFICIENT |
| mechanic | nine-goal-shift-5 | nine-goal-shift-5: selected in 5 of 188 legal opportunities; adjusted win association 0.49 | 0.49 | [0.315, 0.665] | 0.245 | — | 4 | INSUFFICIENT |
| mechanic | nine-spade-goal-shift-5 | nine-spade-goal-shift-5: selected in 3 of 56 legal opportunities; adjusted win association 0.4777 | 0.4777 | [0.095, 0.861] | 0.5376 | — | 3 | INSUFFICIENT |
| mechanic | nine-tap | nine-tap: selected in 73 of 90 legal opportunities; adjusted win association -0.1445 | -0.1445 | [-0.232, -0.057] | 0.0009 | — | 56 | INSUFFICIENT |
| mechanic | purge-aegis | purge-aegis: selected in 4 of 25 legal opportunities; adjusted win association -0.0691 | -0.0691 | [-0.186, 0.047] | 0.245 | — | 4 | INSUFFICIENT |
| mechanic | purge-anchor-bounce | purge-anchor-bounce: selected in 12 of 44 legal opportunities; adjusted win association -0.0827 | -0.0827 | [-0.264, 0.099] | 0.1587 | — | 10 | INSUFFICIENT |
| mechanic | queen | queen: selected in 9 of 238 legal opportunities; adjusted win association -0.0646 | -0.0646 | [-0.278, 0.149] | 0.6976 | — | 7 | INSUFFICIENT |
| mechanic | queen-aegis | queen-aegis: selected in 31 of 116 legal opportunities; adjusted win association 0.2957 | 0.2957 | [0.205, 0.386] | 0.0791 | — | 26 | INSUFFICIENT |
| mechanic | queens-court | queens-court: selected in 1 of 28 legal opportunities; adjusted win association -0.1667 | -0.1667 | [-0.465, 0.132] | 0 | — | 1 | INSUFFICIENT |
| mechanic | Rank 10 Mechanic | rank10: selected in 76 of 173 legal opportunities; adjusted win association 0.1343 | 0.1343 | [0.030, 0.239] | 0.1674 | 0.3722 | 63 | INSUFFICIENT |
| mechanic | rank10-stack-theft | rank10-stack-theft: selected in 8 of 14 legal opportunities; adjusted win association -0.1465 | -0.1465 | [-0.243, -0.050] | 0.2032 | — | 7 | INSUFFICIENT |
| mechanic | rank3-discard | rank3-discard: selected in 7 of 7 legal opportunities; adjusted win association 0.0947 | 0.0947 | [-0.007, 0.196] | 0.0069 | — | 7 | INSUFFICIENT |
| mechanic | rank3-present | rank3-present: selected in 2 of 2 legal opportunities; adjusted win association -0.3962 | -0.3962 | [-0.605, -0.188] | 0 | — | 2 | INSUFFICIENT |
| mechanic | rank3-take | rank3-take: selected in 1 of 1 legal opportunities; adjusted win association 0.4 | 0.4 | [-0.029, 0.829] | 0 | — | 1 | INSUFFICIENT |
| mechanic | rank5-rummage | rank5-rummage: selected in 16 of 16 legal opportunities; adjusted win association -0.0473 | -0.0473 | [-0.153, 0.058] | 0.7555 | — | 11 | INSUFFICIENT |
| mechanic | rank6-keep-all-discard | rank6-keep-all-discard: selected in 6 of 31 legal opportunities; adjusted win association -0.1899 | -0.1899 | [-0.355, -0.025] | 0.3801 | — | 6 | INSUFFICIENT |
| mechanic | rank6-keep-return-bottom | rank6-keep-return-bottom: selected in 11 of 31 legal opportunities; adjusted win association -0.0562 | -0.0562 | [-0.165, 0.053] | 0.4567 | — | 8 | INSUFFICIENT |
| mechanic | rank6-keep-return-top | rank6-keep-return-top: selected in 14 of 31 legal opportunities; adjusted win association 0.0149 | 0.0149 | [-0.142, 0.172] | 0.1587 | — | 10 | INSUFFICIENT |
| mechanic | rank7-generated-advanced-ultra-three-black | rank7-generated-advanced-ultra-three-black: selected in 1 of 1 legal opportunities; adjusted win association -0.0667 | -0.0667 | [-0.193, 0.060] | 0 | — | 1 | INSUFFICIENT |
| mechanic | rank7-generated-four-row-clear | rank7-generated-four-row-clear: selected in 1 of 1 legal opportunities; adjusted win association 0.7333 | 0.7333 | [0.510, 0.957] | 0 | — | 1 | INSUFFICIENT |
| mechanic | rank7-hand-and-effect | rank7-hand-and-effect: selected in 2 of 18 legal opportunities; adjusted win association 0.1264 | 0.1264 | [0.016, 0.236] | 1 | — | 2 | INSUFFICIENT |
| mechanic | rank7-hand-and-score | rank7-hand-and-score: selected in 16 of 18 legal opportunities; adjusted win association -0.0046 | -0.0046 | [-0.160, 0.151] | 0.2488 | — | 14 | INSUFFICIENT |
| mechanic | recycle-five | recycle-five: selected in 1 of 61 legal opportunities; adjusted win association -0.6 | -0.6 | [-1.029, -0.171] | 0 | — | 1 | INSUFFICIENT |
| mechanic | recycle-five-♠ | recycle-five-♠: selected in 1 of 89 legal opportunities; adjusted win association 0.7333 | 0.7333 | [0.510, 0.957] | 0 | — | 1 | INSUFFICIENT |
| mechanic | recycle-five-♣ | recycle-five-♣: selected in 1 of 83 legal opportunities; adjusted win association -0.3333 | -0.3333 | [-0.572, -0.095] | 0 | — | 1 | INSUFFICIENT |
| mechanic | recycle-five-♥ | recycle-five-♥: selected in 1 of 64 legal opportunities; adjusted win association -0.3333 | -0.3333 | [-0.572, -0.095] | 0 | — | 1 | INSUFFICIENT |
| mechanic | recycle-five-♦ | recycle-five-♦: selected in 1 of 83 legal opportunities; adjusted win association -0.3333 | -0.3333 | [-0.572, -0.095] | 0 | — | 1 | INSUFFICIENT |
| mechanic | Royal Marriage | royal-marriage: selected in 9 of 17 legal opportunities; adjusted win association -0.111 | -0.111 | [-0.204, -0.018] | 0.7315 | — | 9 | INSUFFICIENT |
| mechanic | score | score: selected in 558 of 1478 legal opportunities; adjusted win association 0.3826 | 0.3826 | [0.257, 0.509] | 0 | — | 161 | INSUFFICIENT |
| mechanic | Scuttle | scuttle: selected in 116 of 443 legal opportunities; adjusted win association -0.3812 | -0.3812 | [-0.466, -0.297] | 0.0921 | 0.3722 | 48 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-001 | seven-scoring-trigger-take-CORE-001: selected in 1 of 1 legal opportunities; adjusted win association 0.4 | 0.4 | [-0.029, 0.829] | 0 | — | 1 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-003 | seven-scoring-trigger-take-CORE-003: selected in 1 of 1 legal opportunities; adjusted win association -0.4667 | -0.4667 | [-0.719, -0.214] | 0 | — | 1 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-006 | seven-scoring-trigger-take-CORE-006: selected in 2 of 3 legal opportunities; adjusted win association -0.0128 | -0.0128 | [-0.240, 0.214] | 1 | — | 2 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-015 | seven-scoring-trigger-take-CORE-015: selected in 9 of 17 legal opportunities; adjusted win association 0.1129 | 0.1129 | [-0.026, 0.252] | 0.2791 | — | 9 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-016 | seven-scoring-trigger-take-CORE-016: selected in 9 of 20 legal opportunities; adjusted win association -0.0036 | -0.0036 | [-0.123, 0.116] | 0.7315 | — | 9 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-017 | seven-scoring-trigger-take-CORE-017: selected in 5 of 11 legal opportunities; adjusted win association 0.1669 | 0.1669 | [0.031, 0.302] | 0.0917 | — | 5 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-018 | seven-scoring-trigger-take-CORE-018: selected in 4 of 10 legal opportunities; adjusted win association 0.453 | 0.453 | [0.268, 0.638] | 0.245 | — | 4 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-019 | seven-scoring-trigger-take-CORE-019: selected in 7 of 11 legal opportunities; adjusted win association 0.2712 | 0.2712 | [0.148, 0.394] | 0.0069 | — | 7 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-020 | seven-scoring-trigger-take-CORE-020: selected in 4 of 11 legal opportunities; adjusted win association -0.2942 | -0.2942 | [-0.447, -0.142] | 1 | — | 4 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-021 | seven-scoring-trigger-take-CORE-021: selected in 3 of 6 legal opportunities; adjusted win association -0.2455 | -0.2455 | [-0.436, -0.055] | 0.5376 | — | 3 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-022 | seven-scoring-trigger-take-CORE-022: selected in 6 of 8 legal opportunities; adjusted win association 0.3968 | 0.3968 | [0.256, 0.538] | 0.0279 | — | 6 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-023 | seven-scoring-trigger-take-CORE-023: selected in 2 of 4 legal opportunities; adjusted win association 0.5675 | 0.5675 | [0.340, 0.795] | 0 | — | 2 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-024 | seven-scoring-trigger-take-CORE-024: selected in 1 of 6 legal opportunities; adjusted win association 0.2 | 0.2 | [-0.151, 0.551] | 0 | — | 1 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-025 | seven-scoring-trigger-take-CORE-025: selected in 4 of 5 legal opportunities; adjusted win association 0.4769 | 0.4769 | [0.308, 0.645] | 0 | — | 4 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-027 | seven-scoring-trigger-take-CORE-027: selected in 1 of 2 legal opportunities; adjusted win association -0.5333 | -0.5333 | [-0.786, -0.281] | 0 | — | 1 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-028 | seven-scoring-trigger-take-CORE-028: selected in 1 of 1 legal opportunities; adjusted win association 0.5333 | 0.5333 | [0.281, 0.786] | 0 | — | 1 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-038 | seven-scoring-trigger-take-CORE-038: selected in 1 of 1 legal opportunities; adjusted win association -0.4667 | -0.4667 | [-0.719, -0.214] | 0 | — | 1 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-041 | seven-scoring-trigger-take-CORE-041: selected in 2 of 2 legal opportunities; adjusted win association 0.7333 | 0.7333 | [0.510, 0.957] | 0 | — | 2 | INSUFFICIENT |
| mechanic | seven-scoring-trigger-take-CORE-053 | seven-scoring-trigger-take-CORE-053: selected in 1 of 1 legal opportunities; adjusted win association -0.3333 | -0.3333 | [-0.572, -0.095] | 0 | — | 1 | INSUFFICIENT |
| mechanic | seven-topdeck | seven-topdeck: selected in 19 of 403 legal opportunities; adjusted win association 0.0817 | 0.0817 | [-0.118, 0.282] | 0.4403 | 0.5661 | 17 | INSUFFICIENT |
| mechanic | shuffle-reset | shuffle-reset: selected in 1 of 85 legal opportunities; adjusted win association -0.8 | -0.8 | [-1.151, -0.449] | 0 | — | 1 | INSUFFICIENT |
| mechanic | six-dig | six-dig: selected in 37 of 289 legal opportunities; adjusted win association 0.1159 | 0.1159 | [-0.079, 0.310] | 0.2765 | 0.4665 | 25 | INSUFFICIENT |
| mechanic | solo-wild | solo-wild: selected in 27 of 301 legal opportunities; adjusted win association 0.0257 | 0.0257 | [-0.100, 0.152] | 0.2365 | — | 21 | INSUFFICIENT |
| mechanic | spade-recovery | spade-recovery: selected in 3 of 9 legal opportunities; adjusted win association -0.0951 | -0.0951 | [-0.201, 0.011] | 0.5376 | — | 3 | INSUFFICIENT |
| mechanic | Super Play | super: selected in 17 of 58 legal opportunities; adjusted win association -0.0017 | -0.0017 | [-0.093, 0.089] | 0.4403 | 0.5661 | 17 | INSUFFICIENT |
| mechanic | Swap Bar | swap-bar: selected in 212 of 1610 legal opportunities; adjusted win association -0.0341 | -0.0341 | [-0.239, 0.171] | 0.0008 | 0.0068 | 111 | EXPLORATORY |
| mechanic | three-black-ace | three-black-ace: selected in 2 of 43 legal opportunities; adjusted win association -0.16 | -0.16 | [-0.273, -0.047] | 0 | — | 2 | INSUFFICIENT |
| mechanic | three-black-bounce-top | three-black-bounce-top: selected in 4 of 24 legal opportunities; adjusted win association -0.239 | -0.239 | [-0.444, -0.034] | 1 | — | 4 | INSUFFICIENT |
| mechanic | three-black-clear-er | three-black-clear-er: selected in 4 of 39 legal opportunities; adjusted win association 0.1708 | 0.1708 | [0.057, 0.285] | 1 | — | 4 | INSUFFICIENT |
| mechanic | three-black-clear-pr | three-black-clear-pr: selected in 3 of 39 legal opportunities; adjusted win association -0.1885 | -0.1885 | [-0.298, -0.079] | 0 | — | 3 | INSUFFICIENT |
| mechanic | three-black-jack-pr | three-black-jack-pr: selected in 3 of 6 legal opportunities; adjusted win association 0.5 | 0.5 | [0.196, 0.804] | 0 | — | 3 | INSUFFICIENT |
| mechanic | three-black-king | three-black-king: selected in 5 of 41 legal opportunities; adjusted win association -0.1469 | -0.1469 | [-0.272, -0.021] | 0 | — | 5 | INSUFFICIENT |
| mechanic | three-black-queen | three-black-queen: selected in 6 of 51 legal opportunities; adjusted win association -0.2029 | -0.2029 | [-0.379, -0.027] | 0.3801 | — | 6 | INSUFFICIENT |
| mechanic | three-black-total-clear | three-black-total-clear: selected in 1 of 24 legal opportunities; adjusted win association 0.7333 | 0.7333 | [0.510, 0.957] | 0 | — | 1 | INSUFFICIENT |
| mechanic | three-bounce-♣ | three-bounce-♣: selected in 1 of 70 legal opportunities; adjusted win association -0.1667 | -0.1667 | [-0.465, 0.132] | 0 | — | 1 | INSUFFICIENT |
| mechanic | three-bounce-♥ | three-bounce-♥: selected in 2 of 50 legal opportunities; adjusted win association 0.4091 | 0.4091 | [0.230, 0.588] | 1 | — | 2 | INSUFFICIENT |
| mechanic | three-bounce-♦ | three-bounce-♦: selected in 2 of 71 legal opportunities; adjusted win association -0.1132 | -0.1132 | [-0.322, 0.095] | 1 | — | 2 | INSUFFICIENT |
| mechanic | three-force-discard | three-force-discard: selected in 7 of 204 legal opportunities; adjusted win association -0.127 | -0.127 | [-0.243, -0.011] | 0.0069 | — | 7 | INSUFFICIENT |
| mechanic | three-hand | three-hand: selected in 10 of 59 legal opportunities; adjusted win association 0.7064 | 0.7064 | [0.500, 0.913] | 0.245 | — | 4 | INSUFFICIENT |
| mechanic | three-points | three-points: selected in 5 of 59 legal opportunities; adjusted win association 0.4601 | 0.4601 | [0.286, 0.634] | 0.5376 | — | 3 | INSUFFICIENT |
| mechanic | three-present-take | three-present-take: selected in 2 of 204 legal opportunities; adjusted win association 0.6621 | 0.6621 | [0.464, 0.861] | 0 | — | 2 | INSUFFICIENT |
| mechanic | three-red-counter | three-red-counter: selected in 32 of 64 legal opportunities; adjusted win association 0.2357 | 0.2357 | [0.148, 0.323] | 0.4374 | 0.5661 | 32 | INSUFFICIENT |
| mechanic | topdeck-seven-♥ | topdeck-seven-♥: selected in 1 of 64 legal opportunities; adjusted win association -0.3333 | -0.3333 | [-0.572, -0.095] | 0 | — | 1 | INSUFFICIENT |
| mechanic | total-clear | total-clear: selected in 3 of 109 legal opportunities; adjusted win association -0.0716 | -0.0716 | [-0.188, 0.045] | 0.5376 | — | 3 | INSUFFICIENT |
| mechanic | two-hold | two-hold: selected in 2 of 10 legal opportunities; adjusted win association -0.16 | -0.16 | [-0.273, -0.047] | 0 | — | 2 | INSUFFICIENT |
| mechanic | two-score | two-score: selected in 4 of 10 legal opportunities; adjusted win association 0.1605 | 0.1605 | [0.012, 0.309] | 0.245 | — | 4 | INSUFFICIENT |
| mechanic | Ultra | ultra: selected in 111 of 332 legal opportunities; adjusted win association 0.1578 | 0.1578 | [0.075, 0.240] | 0.2548 | 0.4586 | 92 | INSUFFICIENT |
| mechanic | Voltage | voltage: selected in 121 of 263 legal opportunities; adjusted win association 0.2271 | 0.2271 | [0.101, 0.353] | 0.0005 | 0.0068 | 32 | EXPLORATORY |
| mechanic | wild-sovereignty | wild-sovereignty: selected in 4 of 61 legal opportunities; adjusted win association -0.2528 | -0.2528 | [-0.446, -0.059] | 0.245 | — | 4 | INSUFFICIENT |
| policy | control | control: 1W/20L/0D in 23 cross-policy games — win rate 0.0476 | 0.0476 | [0.008, 0.227] | — | — | 21 | — |
| policy | control-tactical | control-tactical: 7W/3L/0D in 10 cross-policy games — win rate 0.7 | 0.7 | [0.397, 0.892] | — | — | 10 | — |
| policy | hybrix-baseline | hybrix-baseline: 4W/2L/0D in 6 cross-policy games — win rate 0.6667 | 0.6667 | [0.300, 0.903] | — | — | 6 | — |
| policy | hybrix-defender | hybrix-defender: 4W/2L/0D in 6 cross-policy games — win rate 0.6667 | 0.6667 | [0.300, 0.903] | — | — | 6 | — |
| policy | hybrix-rusher | hybrix-rusher: 5W/1L/0D in 6 cross-policy games — win rate 0.8333 | 0.8333 | [0.436, 0.970] | — | — | 6 | — |
| policy | hybrix-sniper | hybrix-sniper: 5W/1L/0D in 6 cross-policy games — win rate 0.8333 | 0.8333 | [0.436, 0.970] | — | — | 6 | — |
| policy | hybrix-support | hybrix-support: 3W/3L/0D in 6 cross-policy games — win rate 0.5 | 0.5 | [0.188, 0.812] | — | — | 6 | — |
| policy | hybrix-tank | hybrix-tank: 3W/3L/0D in 6 cross-policy games — win rate 0.5 | 0.5 | [0.188, 0.812] | — | — | 6 | — |
| policy | hybrix-trickster | hybrix-trickster: 4W/2L/0D in 6 cross-policy games — win rate 0.6667 | 0.6667 | [0.300, 0.903] | — | — | 6 | — |
| policy | random-legal | random-legal: 5W/16L/0D in 23 cross-policy games — win rate 0.2381 | 0.2381 | [0.106, 0.451] | — | — | 21 | — |
| policy | score-rush | score-rush: 10W/11L/0D in 23 cross-policy games — win rate 0.4762 | 0.4762 | [0.283, 0.676] | — | — | 21 | — |
| policy | score-rush-tactical | score-rush-tactical: 15W/5L/0D in 22 cross-policy games — win rate 0.75 | 0.75 | [0.531, 0.888] | — | — | 20 | — |
| policy | tempo | tempo: 9W/12L/0D in 23 cross-policy games — win rate 0.4286 | 0.4286 | [0.245, 0.635] | — | — | 21 | — |
| policy | tempo-tactical | tempo-tactical: 5W/1L/0D in 6 cross-policy games — win rate 0.8333 | 0.8333 | [0.436, 0.970] | — | — | 6 | — |
| policy | value | value: 11W/9L/0D in 22 cross-policy games — win rate 0.55 | 0.55 | [0.342, 0.742] | — | — | 20 | — |
| policy | value-tactical | value-tactical: 3W/3L/0D in 6 cross-policy games — win rate 0.5 | 0.5 | [0.188, 0.812] | — | — | 6 | — |

## Recommendations

- 133 mechanic(s) have sample size below 20 — interpret with caution.
- 144 telemetry tag(s) are quarantined pending canonical mechanic registry entries — extend the registry before treating them as canonical mechanics.

## Open Questions

- 143 tracked entit(ies) are quarantined pending canonical mechanic registry classification — their measurements are descriptive, not canonical.
- 162 mechanic entit(ies) lack identified choice-support or carry weak evidence grades — additional matched-opportunity data is required before preference claims.
- 276 candidate synergy pair(s) were rejected or remain unmodelled ({"FAILED":12,"INSUFFICIENT_DATA":263,"NOT_IDENTIFIABLE":1}) — interactions in those cells are unmeasured, not absent.
- 100 incomplete AB/BA pair block(s) reduce paired seat-swap power; seat effects on those blocks are unresolved.
- pairedRunIds are present but none grouped ≥2 matches — the campaign schedule did not repeat pair blocks, so AB/BA pairing is not possible on this dataset

## Evidence Gaps

| Domain | Gap | Severity | Suggested evidence |
| --- | --- | --- | --- |
| paired-analysis | No complete matched AB/BA pair blocks in the Observatory dataset | high | Mirror-seats campaign or Arena runs with pairedRunId linkage |
| synergies | No synergy pairs cleared the modelling threshold | medium | More joint-opportunity observations for candidate pairs |
| arena | No Arena run analytics in this export | medium | Run an Arena series in the Evolution Lab |
| batch-experiments | No Batch Matrix results persisted or live | low | Create and execute a Batch Matrix round robin |
| evolution | No research projects persisted | low | Commit an experiment in the Evolution Lab Research panel |
| rule-mutation | No Rule Mutation Chamber experiments persisted | low | Run a mutation experiment in the Mutation Chamber |
| integrity | 30 anomalies flagged for review | medium | Manual inspection of flagged matchIds / retained replays |

## Interpretation Boundaries

- Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.
- Policy-conditioned Advanced Core observation. Associations are not causal proof; unsupported branches remain fail-closed. Self-play matches excluded from cross-policy superiority aggregates.
- AB/BA pairs are linked by pairedRunId. Discordant-pair McNemar and paired bootstrap control for seat assignment. AB and BA ordinals use distinct derived seeds; pairing is by policy-pair block, not by identical deal seed.
- Conditional choice analysis: opportunities are frames where the option was simultaneously legal — joint legality does not by itself mean substitutable alternatives. Entropy measures selection diversity within an identical offered set only — different choice sets are never pooled. Deterministic selection is decision behavior, not balance evidence. choiceSupport reports legal-but-unselected frames: without them a pick rate describes what happened, not what was preferred. Pair relation marks rivals that were never independently selectable (relation !== independent-rival) — conditional share on such pairs is structural, not preference.
- Associations, win rates and adjusted estimates in this dossier are policy-, seat-, profile- and telemetry-conditioned observations — not causal proof and not balance canon.
- Zero and "unavailable" are distinct: a null or available:false marks unmeasured domains; a measured zero is reported as the number 0.
- Historical artifacts whose identity fingerprint differs from the current lab identity are flagged historical:true and are not merged into current-authority claims.
- Specialized artifacts (Evolution run envelopes, Batch Matrix artifacts/manifests, research envelopes, strategy bundles) remain the authoritative records for their own domains; this dossier is a synthesis layer above them.

## Provenance

| Field | Value |
| --- | --- |
| Observatory hash | e575f12f7f70448743e77b00393638d78cb419467aee6e5d90b0462986d0b03d |
| Aggregate hash | 59791c83908dd300acb667002e5988fc54717ef43737c0c993aff8ba115abac2 |
| Evidence epoch | post-rules-parity-repair-v0.28.1 |
| Post-rules parity repair | true |
| Source hashes | {"aggregate":"59791c83908dd300acb667002e5988fc54717ef43737c0c993aff8ba115abac2","retention":"6b73a73464b93ed332cd91043149965e8d972ad46d6a2df6d4b2c81c59982950","summaries":"c114149cc7900f4abdb812f108400cc84cdceb040dca0c81aa02c4d4661b3039"} |
| Extract hash | c913bce446eae14c6284c4310fbaba634b8a20d37f9314eb142da9e396735352 |
| Replay index hash | f09274c60229b31dd5554f51fd4badd7950a565bfc4c72f5a071ef49ba1240b8 |
| Lab replay index hash | 52d853fe9367b1acca679c55ed6e136c40786e2cc1f9d07458dce19fc6a05a44 |

## Unavailable Domains

| Domain | Reason |
| --- | --- |
| arena | Evolution Lab storage not reachable from this context. |
| strategy | Evolution Lab storage not reachable from this context. |
| experiment | Experiment evidence store not supplied to this export. |

## Structured Appendix

The authoritative machine-readable content (full mechanic rows, synergy diagnostics, metric registry, choice entities, run record rows, and the analysis extract) is in the JSON export — this Markdown is a faithful projection of the same object.

- Metric registry entries: 14
- Rank anatomy registry: absent
- Analysis extract embedded: yes (extractHash c913bce446eae14c6284c4310fbaba634b8a20d37f9314eb142da9e396735352)