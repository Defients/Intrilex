# Mechanics Observatory — AI Agent Extract

**Extract version:** 1.0.0
**Analytics schema:** 4.2.0
**Source hash:** `0b5695684f16b02bb0271069d1c7a38cd82fc762e2ce30265dd1272822696170`
**Aggregate hash:** `59791c83908dd300acb667002e5988fc54717ef43737c0c993aff8ba115abac2`
**Extract hash:** `3ec8e980c1a1e751a6426664e34e09965e6168cf8c86989baf1e8c11f1e12f96`

## Executive Summary

Analysis covers 100 Advanced Core matches under Engine v4.2.6 / Rules v4.2.0. All matches completed without aborts. Highest win rate: hybrix-rusher at 83.3% (CI [0.436, 0.970], 6 games). No synergy pairs reached statistical significance after FDR correction. 162 mechanic(s) measured with evidence-backed associations. 30 anomaly/anomalies flagged (0 critical, 5 warning, 25 info). Data completeness: PASS (no unclassified facts). Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.

## Dataset

| Metric | Value |
|--------|-------|
| matchCount | 100 |
| completedMatchCount | 100 |
| abortCount | 0 |
| drawCount | 0 |
| detailedMatchCount | 12 |
| policyCount | 16 |
| mechanicCount | 162 |
| synergyCount | 2 |
| motifCount | 60 |
| anomalyCount | 30 |

## Policy Findings

### control

- **Win rate:** 8.7% (2/23 games, CI [0.024, 0.268])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=11.130, responseUse=5.043, advancedFrequency=2.174

### control-tactical

- **Win rate:** 70.0% (7/10 games, CI [0.397, 0.892])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=15.400, responseUse=5.600, advancedFrequency=2.400

### hybrix-baseline

- **Win rate:** 66.7% (4/6 games, CI [0.300, 0.903])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=7.000, responseUse=3.000, advancedFrequency=1.333

### hybrix-defender

- **Win rate:** 66.7% (4/6 games, CI [0.300, 0.903])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=13.167, responseUse=6.000, advancedFrequency=2.000

### hybrix-rusher

- **Win rate:** 83.3% (5/6 games, CI [0.436, 0.970])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=6.167, responseUse=2.000, advancedFrequency=0.333

### hybrix-sniper

- **Win rate:** 83.3% (5/6 games, CI [0.436, 0.970])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=8.167, responseUse=2.833, advancedFrequency=1.333

### hybrix-support

- **Win rate:** 50.0% (3/6 games, CI [0.188, 0.812])
- **Key traits:** high action frequency, response-heavy, advanced-heavy
- **Fingerprint:** scoreAggression=7.333, responseUse=2.667, advancedFrequency=0.667

### hybrix-tank

- **Win rate:** 50.0% (3/6 games, CI [0.188, 0.812])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=14.667, responseUse=4.667, advancedFrequency=2.333

### hybrix-trickster

- **Win rate:** 66.7% (4/6 games, CI [0.300, 0.903])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=8.500, responseUse=3.500, advancedFrequency=2.500

### random-legal

- **Win rate:** 26.1% (6/23 games, CI [0.125, 0.465])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=12.217, responseUse=5.739, advancedFrequency=3.217

### score-rush

- **Win rate:** 47.8% (11/23 games, CI [0.292, 0.670])
- **Key traits:** high action frequency, response-heavy
- **Fingerprint:** scoreAggression=4.739, responseUse=1.652, advancedFrequency=0.174

### score-rush-tactical

- **Win rate:** 72.7% (16/22 games, CI [0.518, 0.868])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=7.091, responseUse=3.409, advancedFrequency=2.182

### tempo

- **Win rate:** 43.5% (10/23 games, CI [0.256, 0.632])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=5.826, responseUse=1.826, advancedFrequency=1.087

### tempo-tactical

- **Win rate:** 83.3% (5/6 games, CI [0.436, 0.970])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=7.500, responseUse=3.500, advancedFrequency=2.833

### value

- **Win rate:** 54.5% (12/22 games, CI [0.347, 0.731])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=7.636, responseUse=1.955, advancedFrequency=1.091

### value-tactical

- **Win rate:** 50.0% (3/6 games, CI [0.188, 0.812])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=6.833, responseUse=2.500, advancedFrequency=0.833

## Mechanic Findings

| Mechanic | Usage Rate | Sample | Association | Grade | Status |
|----------|-----------|--------|-------------|-------|--------|
| 2-black-2-red-draw | 21.0% | 42 | -0.121 | INSUFFICIENT | measured |
| 2-black-2-red-rummage | 4.5% | 9 | -0.175 | INSUFFICIENT | measured |
| ace | 6.5% | 13 | -0.206 | INSUFFICIENT | measured |
| ace-anchor | 3.5% | 7 | -0.222 | INSUFFICIENT | measured |
| ace-base | 16.5% | 33 | 0.163 | INSUFFICIENT | measured |
| ace-spade | 9.0% | 18 | 0.122 | INSUFFICIENT | measured |
| anchor | 23.0% | 46 | -0.056 | INSUFFICIENT | measured |
| anchor-private-choice | 5.5% | 11 | -0.144 | INSUFFICIENT | measured |
| attachment | 3.0% | 6 | 0.344 | INSUFFICIENT | measured |
| bj-exile-recycle-CORE-003-CORE-016 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| bj-exile-recycle-CORE-007 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| bj-exile-recycle-CORE-011 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| bj-exile-recycle-skip | 2.5% | 5 | 0.513 | INSUFFICIENT | measured |
| board-lock | 3.5% | 7 | -0.518 | INSUFFICIENT | measured |
| bounce-top | 13.0% | 26 | -0.044 | INSUFFICIENT | measured |
| clear-er | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |
| clear-pr | 8.0% | 16 | 0.000 | INSUFFICIENT | measured |
| club-foundation | 3.0% | 6 | 0.344 | INSUFFICIENT | measured |
| club-foundation-bonus | 12.0% | 24 | 0.142 | INSUFFICIENT | measured |
| counter | 32.5% | 65 | 0.103 | INSUFFICIENT | measured |
| deep-draw | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| deep-draw-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| diamond-mimic-paired-super-j-tempo | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| diamond-mimic-row-exchange-er | 3.5% | 7 | -0.074 | INSUFFICIENT | measured |
| diamond-mimic-row-exchange-pr | 5.5% | 11 | 0.241 | INSUFFICIENT | measured |
| disrupt | 35.5% | 71 | 0.011 | INSUFFICIENT | measured |
| draw | 50.5% | 101 | -0.210 | EXPLORATORY | measured |
| effect-ace | 6.0% | 12 | -0.177 | INSUFFICIENT | measured |
| effect-four | 10.5% | 21 | -0.133 | INSUFFICIENT | measured |
| effect-private-choice | 23.0% | 46 | -0.113 | INSUFFICIENT | measured |
| effect-red-joker | 2.5% | 5 | 0.103 | INSUFFICIENT | measured |
| effect-three | 13.0% | 26 | -0.044 | INSUFFICIENT | measured |
| eight-absolute-scuttle | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| eight-aegis-field | 18.0% | 36 | -0.136 | INSUFFICIENT | measured |
| eight-scuttle | 5.5% | 11 | 0.241 | INSUFFICIENT | measured |
| eight-spade-free-scuttle | 5.5% | 11 | 0.241 | INSUFFICIENT | measured |
| exhausted-pass | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| face-down | 53.5% | 107 | 0.211 | INSUFFICIENT | measured |
| face-up-draw | 17.5% | 35 | -0.017 | INSUFFICIENT | measured |
| five-gy-bottom | 11.0% | 22 | 0.460 | EXPLORATORY | measured |
| five-recycle | 6.0% | 12 | 0.089 | INSUFFICIENT | measured |
| five-refine | 4.5% | 9 | 0.058 | INSUFFICIENT | measured |
| four-exchange-er | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-exchange-pr | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| four-guess-2-♠ | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| four-guess-2-♣ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-3-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-3-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-4-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-4-♦ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-5-♦ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-6-♣ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-7-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-7-♦ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| four-guess-9-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-9-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-A-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-A-♥ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-J-♠ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| four-guess-J-♥ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| four-row-clear-er-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♦ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-pr-♠ | 2.5% | 5 | -0.308 | INSUFFICIENT | measured |
| four-row-clear-pr-♣ | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| four-row-clear-pr-♥ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-row-clear-pr-♦ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| hand-swap | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| heart-tempo | 10.5% | 21 | -0.027 | INSUFFICIENT | measured |
| jack | 35.5% | 71 | 0.011 | INSUFFICIENT | measured |
| jack-pr | 3.0% | 6 | 0.344 | INSUFFICIENT | measured |
| jack-tempo | 1.5% | 3 | -0.169 | INSUFFICIENT | measured |
| king | 16.5% | 33 | 0.018 | INSUFFICIENT | measured |
| king-anchor | 5.0% | 10 | -0.421 | INSUFFICIENT | measured |
| king-spade | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| natural-four | 3.5% | 7 | -0.074 | INSUFFICIENT | measured |
| natural-four-reorder-CORE-026-CORE-022-CORE-024-CORE-028 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| natural-four-reorder-draw-CORE-019-CORE-001-CORE-017-CORE-021 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| natural-four-reorder-draw-CORE-019-CORE-017-CORE-021-CORE-023 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| natural-four-reorder-draw-CORE-038-CORE-040-CORE-042-CORE-044 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| natural-four-reorder-draw-CORE-040-CORE-042-CORE-044-CORE-046 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| nine | 5.5% | 11 | -0.144 | INSUFFICIENT | measured |
| nine-anchor-discard | 4.0% | 8 | 0.260 | INSUFFICIENT | measured |
| nine-goal-shift-3 | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| nine-goal-shift-5 | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| nine-spade-goal-shift-5 | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| nine-tap | 28.0% | 56 | -0.248 | INSUFFICIENT | measured |
| purge-aegis | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |
| purge-anchor-bounce | 5.0% | 10 | -0.211 | INSUFFICIENT | measured |
| queen | 3.5% | 7 | -0.074 | INSUFFICIENT | measured |
| queen-aegis | 13.0% | 26 | 0.177 | INSUFFICIENT | measured |
| queens-court | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank10 | 31.5% | 63 | 0.104 | INSUFFICIENT | measured |
| rank10-stack-theft | 3.5% | 7 | -0.222 | INSUFFICIENT | measured |
| rank3-discard | 3.5% | 7 | 0.370 | INSUFFICIENT | measured |
| rank3-present | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| rank3-take | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| rank5-rummage | 5.5% | 11 | 0.048 | INSUFFICIENT | measured |
| rank6-keep-all-discard | 3.0% | 6 | 0.172 | INSUFFICIENT | measured |
| rank6-keep-return-bottom | 4.0% | 8 | -0.130 | INSUFFICIENT | measured |
| rank6-keep-return-top | 5.0% | 10 | -0.211 | INSUFFICIENT | measured |
| rank7-generated-advanced-ultra-three-black | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-generated-four-row-clear | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| rank7-hand-and-effect | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| rank7-hand-and-score | 7.0% | 14 | 0.154 | INSUFFICIENT | measured |
| recycle-five | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| recycle-five-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| recycle-five-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| recycle-five-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| recycle-five-♦ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| royal-marriage | 4.5% | 9 | -0.058 | INSUFFICIENT | measured |
| score | 80.5% | 161 | 0.462 | INSUFFICIENT | measured |
| scuttle | 24.0% | 48 | -0.137 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-001 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-003 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-006 | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-015 | 4.5% | 9 | 0.175 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-016 | 4.5% | 9 | 0.058 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-017 | 2.5% | 5 | 0.308 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-018 | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-019 | 3.5% | 7 | 0.370 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-020 | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-021 | 1.5% | 3 | -0.169 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-022 | 3.0% | 6 | 0.344 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-023 | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-024 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-025 | 2.0% | 4 | 0.510 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-027 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-028 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-038 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-041 | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-053 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| seven-topdeck | 8.5% | 17 | 0.096 | INSUFFICIENT | measured |
| shuffle-reset | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| six-dig | 12.5% | 25 | -0.114 | INSUFFICIENT | measured |
| solo-wild | 10.5% | 21 | -0.133 | INSUFFICIENT | measured |
| spade-recovery | 1.5% | 3 | -0.169 | INSUFFICIENT | measured |
| super | 8.5% | 17 | 0.096 | INSUFFICIENT | measured |
| swap-bar | 55.5% | 111 | 0.233 | EXPLORATORY | measured |
| three-black-ace | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| three-black-bounce-top | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| three-black-clear-er | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| three-black-clear-pr | 1.5% | 3 | -0.508 | INSUFFICIENT | measured |
| three-black-jack-pr | 1.5% | 3 | 0.508 | INSUFFICIENT | measured |
| three-black-king | 2.5% | 5 | -0.513 | INSUFFICIENT | measured |
| three-black-queen | 3.0% | 6 | -0.172 | INSUFFICIENT | measured |
| three-black-total-clear | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| three-bounce-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| three-bounce-♥ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| three-bounce-♦ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| three-force-discard | 3.5% | 7 | -0.370 | INSUFFICIENT | measured |
| three-hand | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| three-points | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| three-present-take | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| three-red-counter | 16.0% | 32 | 0.074 | INSUFFICIENT | measured |
| topdeck-seven-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| total-clear | 1.5% | 3 | -0.169 | INSUFFICIENT | measured |
| two-hold | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| two-score | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| ultra | 46.0% | 92 | -0.081 | INSUFFICIENT | measured |
| voltage | 16.0% | 32 | 0.298 | EXPLORATORY | measured |
| wild-sovereignty | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |

<details><summary><b>2-black-2-red-draw</b></summary>

Used in 21.0% of participant observations (42/200). Outcome association: negative (-0.121, CI [-0.288, 0.047]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-281a5cd2113c6a01ede0, M-3e56af56c419de97ddc8, M-cc250cc50515a292f3e3, M-4756067b923a59fad42d
</details>

<details><summary><b>2-black-2-red-rummage</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: negative (-0.175, CI [-0.491, 0.142]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8668f8812e8f342f70dc, M-84269db284883330999c, M-1b9ce7c6ecb94b540b09, M-4e938b55c5c081cf4195
</details>

<details><summary><b>ace</b></summary>

Used in 6.5% of participant observations (13/200). Outcome association: negative (-0.206, CI [-0.467, 0.055]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-ec8f8ba09f1121a2d16f, M-9c890ada2c2ec493c6f9, M-581e8e1bf1c1db31783f
</details>

<details><summary><b>ace-anchor</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.222, CI [-0.564, 0.120]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-581e8e1bf1c1db31783f, M-9c890ada2c2ec493c6f9, M-4e938b55c5c081cf4195
</details>

<details><summary><b>ace-base</b></summary>

Used in 16.5% of participant observations (33/200). Outcome association: positive (0.163, CI [-0.017, 0.344]). Immediate point impact: mean 3.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9e5f57461794b4359633, M-3e56af56c419de97ddc8, M-1b9ce7c6ecb94b540b09, M-71fc87e2f89eabd4d70c
</details>

<details><summary><b>ace-spade</b></summary>

Used in 9.0% of participant observations (18/200). Outcome association: positive (0.122, CI [-0.115, 0.359]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-97e74d496af22ec1ef0c, M-581e8e1bf1c1db31783f, M-e50eb7181b42fcaf3c35, M-a6073e68be3dfa99914b
</details>

<details><summary><b>anchor</b></summary>

Used in 23.0% of participant observations (46/200). Outcome association: negative (-0.056, CI [-0.221, 0.108]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-0ff40b5b215e28c298ff, M-1b9ce7c6ecb94b540b09, M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>anchor-private-choice</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: negative (-0.144, CI [-0.437, 0.149]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a0945b1315ef7a1c6d20, M-4756067b923a59fad42d, M-1b9ce7c6ecb94b540b09, M-0cb7ff81422b13b69064
</details>

<details><summary><b>attachment</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.344, CI [0.037, 0.650]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0eb5279a20c8b5c7fadc, M-1e315378d0c99486e181, M-5f2660010ee9acaad412, M-4e938b55c5c081cf4195
</details>

<details><summary><b>bj-exile-recycle-CORE-003-CORE-016</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-97e74d496af22ec1ef0c
</details>

<details><summary><b>bj-exile-recycle-CORE-007</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-04f952648982b1b60b68
</details>

<details><summary><b>bj-exile-recycle-CORE-011</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f1291cd390d331a3ffbb
</details>

<details><summary><b>bj-exile-recycle-skip</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.513, CI [0.443, 0.583]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-67e0e95c9279752ebbb3, M-46ef419cc3ad42da20d8, M-d42c5a76b1a43e8227de, M-97ab3f793f2aeef24f57
</details>

<details><summary><b>board-lock</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.518, CI [-0.589, -0.448]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0ff40b5b215e28c298ff, M-1eda409b45784512a347, M-1b9ce7c6ecb94b540b09, M-4756067b923a59fad42d
</details>

<details><summary><b>bounce-top</b></summary>

Used in 13.0% of participant observations (26/200). Outcome association: negative (-0.044, CI [-0.250, 0.161]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-dfab048a83e3b8acc06c, M-1b9ce7c6ecb94b540b09, M-b5430fc382f70a768507
</details>

<details><summary><b>clear-er</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7b7e7ab66d88f3491867, M-950f525deedd2a7736c7, M-4e938b55c5c081cf4195
</details>

<details><summary><b>clear-pr</b></summary>

Used in 8.0% of participant observations (16/200). Outcome association: negative (0.000, CI [-0.255, 0.255]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-67e0e95c9279752ebbb3, M-4e938b55c5c081cf4195, M-f468fb9b0431f3ac6637, M-900dab4d200274290b44
</details>

<details><summary><b>club-foundation</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.344, CI [0.037, 0.650]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2e7aa9b5e00505294fc0, M-fa05d1e275802242db55, M-1d9b0db8df3efa98ae2c, M-84269db284883330999c
</details>

<details><summary><b>club-foundation-bonus</b></summary>

Used in 12.0% of participant observations (24/200). Outcome association: positive (0.142, CI [-0.065, 0.349]). Immediate point impact: mean 6.75 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1ab884d86fec8ccf132f, M-dfab048a83e3b8acc06c, M-5f2660010ee9acaad412, M-8275bf044c49fd222874
</details>

<details><summary><b>counter</b></summary>

Used in 32.5% of participant observations (65/200). Outcome association: positive (0.103, CI [-0.044, 0.249]). Immediate point impact: mean 2.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-f1291cd390d331a3ffbb, M-1b9ce7c6ecb94b540b09, M-5ef9d016ebb1846cf10b
</details>

<details><summary><b>deep-draw</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-950f525deedd2a7736c7, M-e50eb7181b42fcaf3c35
</details>

<details><summary><b>deep-draw-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-522454b71d0726b45836
</details>

<details><summary><b>diamond-mimic-paired-super-j-tempo</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-031ed40318b12b46cc1e, M-97ab3f793f2aeef24f57
</details>

<details><summary><b>diamond-mimic-row-exchange-er</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.074, CI [-0.447, 0.299]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-29d8421ee41250f8c875, M-7d6730d8dab297d9def5, M-1b9ce7c6ecb94b540b09, M-0cb7ff81422b13b69064
</details>

<details><summary><b>diamond-mimic-row-exchange-pr</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: positive (0.241, CI [-0.032, 0.513]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-281a5cd2113c6a01ede0, M-4637c7fa222fd4f0e395, M-a6073e68be3dfa99914b, M-a478ccdcc1e81c64bdb5
</details>

<details><summary><b>disrupt</b></summary>

Used in 35.5% of participant observations (71/200). Outcome association: positive (0.011, CI [-0.134, 0.156]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-67e0e95c9279752ebbb3, M-3e56af56c419de97ddc8, M-cc250cc50515a292f3e3, M-4e938b55c5c081cf4195
</details>

<details><summary><b>draw</b></summary>

Used in 50.5% of participant observations (101/200). Outcome association: negative (-0.210, CI [-0.346, -0.075]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: EXPLORATORY (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-754f798f908f9e4f73d8, M-d42c5a76b1a43e8227de, M-3dc3510153eebdf54abb
</details>

<details><summary><b>effect-ace</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (-0.177, CI [-0.453, 0.099]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-8c60ef2014c378bcb9ff, M-1b9ce7c6ecb94b540b09, M-0cb7ff81422b13b69064
</details>

<details><summary><b>effect-four</b></summary>

Used in 10.5% of participant observations (21/200). Outcome association: negative (-0.133, CI [-0.353, 0.087]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-67e0e95c9279752ebbb3, M-a26aba35b5810012c4f3, M-f468fb9b0431f3ac6637, M-015b0b148b1e1f8a9876
</details>

<details><summary><b>effect-private-choice</b></summary>

Used in 23.0% of participant observations (46/200). Outcome association: negative (-0.113, CI [-0.276, 0.050]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-3e56af56c419de97ddc8, M-d42c5a76b1a43e8227de, M-4e938b55c5c081cf4195
</details>

<details><summary><b>effect-red-joker</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.103, CI [-0.333, 0.538]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a0945b1315ef7a1c6d20, M-0eb5279a20c8b5c7fadc, M-b615ae18bd3e0f132ef8, M-5f2660010ee9acaad412
</details>

<details><summary><b>effect-three</b></summary>

Used in 13.0% of participant observations (26/200). Outcome association: negative (-0.044, CI [-0.250, 0.161]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-dfab048a83e3b8acc06c, M-1b9ce7c6ecb94b540b09, M-b5430fc382f70a768507
</details>

<details><summary><b>eight-absolute-scuttle</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-fd7699a659985da0fd8b, M-82d0158eacf1f693fe2a, M-0cb7ff81422b13b69064, M-1e315378d0c99486e181
</details>

<details><summary><b>eight-aegis-field</b></summary>

Used in 18.0% of participant observations (36/200). Outcome association: negative (-0.136, CI [-0.312, 0.041]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-1eda409b45784512a347, M-1b9ce7c6ecb94b540b09, M-5ef9d016ebb1846cf10b
</details>

<details><summary><b>eight-scuttle</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: positive (0.241, CI [-0.032, 0.513]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9db1549bec3c58b78cff, M-4637c7fa222fd4f0e395, M-7d2e54be2e472d2f7c7d, M-754f798f908f9e4f73d8
</details>

<details><summary><b>eight-spade-free-scuttle</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: positive (0.241, CI [-0.032, 0.513]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7b7e7ab66d88f3491867, M-f1291cd390d331a3ffbb, M-b615ae18bd3e0f132ef8, M-a6073e68be3dfa99914b
</details>

<details><summary><b>exhausted-pass</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>face-down</b></summary>

Used in 53.5% of participant observations (107/200). Outcome association: positive (0.211, CI [0.075, 0.347]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-dfab048a83e3b8acc06c, M-d42c5a76b1a43e8227de, M-a6073e68be3dfa99914b
</details>

<details><summary><b>face-up-draw</b></summary>

Used in 17.5% of participant observations (35/200). Outcome association: negative (-0.017, CI [-0.200, 0.165]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-7d6730d8dab297d9def5, M-d42c5a76b1a43e8227de, M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>five-gy-bottom</b></summary>

Used in 11.0% of participant observations (22/200). Outcome association: positive (0.460, CI [0.319, 0.600]). Evidence grade: EXPLORATORY (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-8fcc52b645373191c478, M-b615ae18bd3e0f132ef8, M-84269db284883330999c
</details>

<details><summary><b>five-recycle</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: positive (0.089, CI [-0.199, 0.377]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-2e7aa9b5e00505294fc0, M-1b9ce7c6ecb94b540b09, M-581e8e1bf1c1db31783f
</details>

<details><summary><b>five-refine</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: positive (0.058, CI [-0.274, 0.390]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7b7e7ab66d88f3491867, M-4e938b55c5c081cf4195, M-b615ae18bd3e0f132ef8, M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>four-exchange-er</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f1291cd390d331a3ffbb
</details>

<details><summary><b>four-exchange-pr</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-84269db284883330999c, M-ce9543d13e2c07e82e66, M-1b9ce7c6ecb94b540b09
</details>

<details><summary><b>four-guess-2-♠</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-43ee676468dfdd29d4e0, M-a478ccdcc1e81c64bdb5, M-ee7b17238b5a8fc4f4f8
</details>

<details><summary><b>four-guess-2-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ee7b17238b5a8fc4f4f8
</details>

<details><summary><b>four-guess-3-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-43ee676468dfdd29d4e0
</details>

<details><summary><b>four-guess-3-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a478ccdcc1e81c64bdb5
</details>

<details><summary><b>four-guess-4-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ee7b17238b5a8fc4f4f8
</details>

<details><summary><b>four-guess-4-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-5f0d1c1b8066da4877b9
</details>

<details><summary><b>four-guess-5-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a478ccdcc1e81c64bdb5
</details>

<details><summary><b>four-guess-6-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a478ccdcc1e81c64bdb5
</details>

<details><summary><b>four-guess-7-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a478ccdcc1e81c64bdb5
</details>

<details><summary><b>four-guess-7-♦</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c0ba3f945ece330667df, M-a478ccdcc1e81c64bdb5
</details>

<details><summary><b>four-guess-9-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c0ba3f945ece330667df
</details>

<details><summary><b>four-guess-9-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-43ee676468dfdd29d4e0
</details>

<details><summary><b>four-guess-A-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0cb7ff81422b13b69064
</details>

<details><summary><b>four-guess-A-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0cb7ff81422b13b69064
</details>

<details><summary><b>four-guess-J-♠</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c0ba3f945ece330667df, M-ee7b17238b5a8fc4f4f8
</details>

<details><summary><b>four-guess-J-♥</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-43ee676468dfdd29d4e0, M-ee7b17238b5a8fc4f4f8
</details>

<details><summary><b>four-row-clear-er-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0cb7ff81422b13b69064
</details>

<details><summary><b>four-row-clear-er-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a0945b1315ef7a1c6d20
</details>

<details><summary><b>four-row-clear-er-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-950f525deedd2a7736c7
</details>

<details><summary><b>four-row-clear-pr-♠</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.308, CI [-0.665, 0.050]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9db1549bec3c58b78cff, M-8c60ef2014c378bcb9ff, M-b615ae18bd3e0f132ef8, M-ee7b17238b5a8fc4f4f8
</details>

<details><summary><b>four-row-clear-pr-♣</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-c16d20b1a2a555dc6b2a, M-7d2e54be2e472d2f7c7d, M-950f525deedd2a7736c7
</details>

<details><summary><b>four-row-clear-pr-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a6073e68be3dfa99914b
</details>

<details><summary><b>four-row-clear-pr-♦</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2e7aa9b5e00505294fc0, M-b615ae18bd3e0f132ef8
</details>

<details><summary><b>hand-swap</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9e5f57461794b4359633, M-0eb5279a20c8b5c7fadc, M-b615ae18bd3e0f132ef8, M-5f2660010ee9acaad412
</details>

<details><summary><b>heart-tempo</b></summary>

Used in 10.5% of participant observations (21/200). Outcome association: negative (-0.027, CI [-0.252, 0.199]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-84269db284883330999c, M-d42c5a76b1a43e8227de, M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>jack</b></summary>

Used in 35.5% of participant observations (71/200). Outcome association: positive (0.011, CI [-0.134, 0.156]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-67e0e95c9279752ebbb3, M-3e56af56c419de97ddc8, M-cc250cc50515a292f3e3, M-4e938b55c5c081cf4195
</details>

<details><summary><b>jack-pr</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.344, CI [0.037, 0.650]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0eb5279a20c8b5c7fadc, M-1e315378d0c99486e181, M-5f2660010ee9acaad412, M-4e938b55c5c081cf4195
</details>

<details><summary><b>jack-tempo</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9e5f57461794b4359633, M-97e74d496af22ec1ef0c, M-71fc87e2f89eabd4d70c
</details>

<details><summary><b>king</b></summary>

Used in 16.5% of participant observations (33/200). Outcome association: positive (0.018, CI [-0.168, 0.205]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-0ff40b5b215e28c298ff, M-1b9ce7c6ecb94b540b09, M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>king-anchor</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (-0.421, CI [-0.620, -0.222]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ec8f8ba09f1121a2d16f, M-84269db284883330999c, M-1b9ce7c6ecb94b540b09, M-4756067b923a59fad42d
</details>

<details><summary><b>king-spade</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9e5f57461794b4359633, M-1b9ce7c6ecb94b540b09
</details>

<details><summary><b>natural-four</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.074, CI [-0.447, 0.299]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-9ac093c9da6330a6fdec, M-1d9b0db8df3efa98ae2c, M-581e8e1bf1c1db31783f
</details>

<details><summary><b>natural-four-reorder-CORE-026-CORE-022-CORE-024-CORE-028</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9ac093c9da6330a6fdec
</details>

<details><summary><b>natural-four-reorder-draw-CORE-019-CORE-001-CORE-017-CORE-021</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916
</details>

<details><summary><b>natural-four-reorder-draw-CORE-019-CORE-017-CORE-021-CORE-023</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-97ab3f793f2aeef24f57
</details>

<details><summary><b>natural-four-reorder-draw-CORE-038-CORE-040-CORE-042-CORE-044</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1d9b0db8df3efa98ae2c
</details>

<details><summary><b>natural-four-reorder-draw-CORE-040-CORE-042-CORE-044-CORE-046</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-581e8e1bf1c1db31783f
</details>

<details><summary><b>nine</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: negative (-0.144, CI [-0.437, 0.149]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a0945b1315ef7a1c6d20, M-4756067b923a59fad42d, M-1b9ce7c6ecb94b540b09, M-0cb7ff81422b13b69064
</details>

<details><summary><b>nine-anchor-discard</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: positive (0.260, CI [-0.048, 0.569]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a0945b1315ef7a1c6d20, M-7d2e54be2e472d2f7c7d, M-1b9ce7c6ecb94b540b09, M-97ab3f793f2aeef24f57
</details>

<details><summary><b>nine-goal-shift-3</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-67e0e95c9279752ebbb3, M-ec8f8ba09f1121a2d16f
</details>

<details><summary><b>nine-goal-shift-5</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9ac093c9da6330a6fdec, M-a6073e68be3dfa99914b, M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>nine-spade-goal-shift-5</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-581e8e1bf1c1db31783f, M-7d2e54be2e472d2f7c7d, M-1d9b0db8df3efa98ae2c
</details>

<details><summary><b>nine-tap</b></summary>

Used in 28.0% of participant observations (56/200). Outcome association: negative (-0.248, CI [-0.395, -0.101]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-f1291cd390d331a3ffbb, M-cc250cc50515a292f3e3, M-4756067b923a59fad42d
</details>

<details><summary><b>purge-aegis</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2e7aa9b5e00505294fc0, M-8c60ef2014c378bcb9ff, M-1d9b0db8df3efa98ae2c, M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>purge-anchor-bounce</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (-0.211, CI [-0.503, 0.082]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-7d2e54be2e472d2f7c7d, M-1b9ce7c6ecb94b540b09, M-0cb7ff81422b13b69064
</details>

<details><summary><b>queen</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.074, CI [-0.447, 0.299]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-9ac093c9da6330a6fdec, M-0cb7ff81422b13b69064, M-a6073e68be3dfa99914b
</details>

<details><summary><b>queen-aegis</b></summary>

Used in 13.0% of participant observations (26/200). Outcome association: positive (0.177, CI [-0.021, 0.374]). Immediate point impact: mean 2.50 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-d5b17d7b99557deb8cf5, M-1eda409b45784512a347, M-d42c5a76b1a43e8227de, M-9c890ada2c2ec493c6f9
</details>

<details><summary><b>queens-court</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-51c5b0a7f314d910b2df
</details>

<details><summary><b>rank10</b></summary>

Used in 31.5% of participant observations (63/200). Outcome association: positive (0.104, CI [-0.044, 0.252]). Immediate point impact: mean 4.15 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-6d0b4f6682536c727bbc, M-d42c5a76b1a43e8227de, M-5ef9d016ebb1846cf10b
</details>

<details><summary><b>rank10-stack-theft</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.222, CI [-0.564, 0.120]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-67e0e95c9279752ebbb3, M-a70f77adb2c9476531b2, M-c7e06b8e9ceba7badd1b, M-950f525deedd2a7736c7
</details>

<details><summary><b>rank3-discard</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: positive (0.370, CI [0.101, 0.639]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-43ee676468dfdd29d4e0, M-4e938b55c5c081cf4195, M-1d9b0db8df3efa98ae2c, M-3dc3510153eebdf54abb
</details>

<details><summary><b>rank3-present</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7d2e54be2e472d2f7c7d, M-0cb7ff81422b13b69064
</details>

<details><summary><b>rank3-take</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0cb7ff81422b13b69064
</details>

<details><summary><b>rank5-rummage</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: positive (0.048, CI [-0.255, 0.351]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-2e7aa9b5e00505294fc0, M-1b9ce7c6ecb94b540b09, M-581e8e1bf1c1db31783f
</details>

<details><summary><b>rank6-keep-all-discard</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.172, CI [-0.212, 0.556]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-d5b17d7b99557deb8cf5, M-581e8e1bf1c1db31783f, M-1b9ce7c6ecb94b540b09, M-84269db284883330999c
</details>

<details><summary><b>rank6-keep-return-bottom</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (-0.130, CI [-0.473, 0.213]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9e5f57461794b4359633, M-9ac093c9da6330a6fdec, M-1d9b0db8df3efa98ae2c, M-8c60ef2014c378bcb9ff
</details>

<details><summary><b>rank6-keep-return-top</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (-0.211, CI [-0.503, 0.082]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-82d0158eacf1f693fe2a, M-031ed40318b12b46cc1e, M-1b9ce7c6ecb94b540b09, M-0cb7ff81422b13b69064
</details>

<details><summary><b>rank7-generated-advanced-ultra-three-black</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1d9b0db8df3efa98ae2c
</details>

<details><summary><b>rank7-generated-four-row-clear</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>rank7-hand-and-effect</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7d2e54be2e472d2f7c7d, M-1d9b0db8df3efa98ae2c
</details>

<details><summary><b>rank7-hand-and-score</b></summary>

Used in 7.0% of participant observations (14/200). Outcome association: positive (0.154, CI [-0.107, 0.415]). Immediate point impact: mean 8.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-950f525deedd2a7736c7, M-1d9b0db8df3efa98ae2c, M-84269db284883330999c
</details>

<details><summary><b>recycle-five</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9ac093c9da6330a6fdec
</details>

<details><summary><b>recycle-five-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>recycle-five-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0cb7ff81422b13b69064
</details>

<details><summary><b>recycle-five-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-e50eb7181b42fcaf3c35
</details>

<details><summary><b>recycle-five-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-e50eb7181b42fcaf3c35
</details>

<details><summary><b>royal-marriage</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: negative (-0.058, CI [-0.390, 0.274]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-cc2da4250ea78f0c5da4, M-b615ae18bd3e0f132ef8, M-fa05d1e275802242db55
</details>

<details><summary><b>score</b></summary>

Used in 80.5% of participant observations (161/200). Outcome association: positive (0.462, CI [0.332, 0.591]). Immediate point impact: mean 3.43 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-c7fa95689d660a49366b, M-d42c5a76b1a43e8227de, M-4e938b55c5c081cf4195
</details>

<details><summary><b>scuttle</b></summary>

Used in 24.0% of participant observations (48/200). Outcome association: negative (-0.137, CI [-0.297, 0.022]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-67e0e95c9279752ebbb3, M-a478ccdcc1e81c64bdb5, M-cc250cc50515a292f3e3, M-a6073e68be3dfa99914b
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-001</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a478ccdcc1e81c64bdb5
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-003</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-97e74d496af22ec1ef0c
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-006</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-44dff5891c6198671640
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-015</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: positive (0.175, CI [-0.142, 0.491]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-34f95691dcfd17f93e47, M-171e3ddc109606355fe8, M-71fc87e2f89eabd4d70c, M-4637c7fa222fd4f0e395
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-016</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: positive (0.058, CI [-0.274, 0.390]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-34f95691dcfd17f93e47, M-c0ba3f945ece330667df, M-be23c86bf5150b63b8ce, M-3dc3510153eebdf54abb
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-017</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.308, CI [-0.050, 0.665]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-281a5cd2113c6a01ede0, M-015b0b148b1e1f8a9876, M-5f2660010ee9acaad412, M-9c21702da5d01e560631
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-018</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f1291cd390d331a3ffbb, M-7d6730d8dab297d9def5, M-ee7b17238b5a8fc4f4f8, M-1b16b9dae9b5e9933821
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-019</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: positive (0.370, CI [0.101, 0.639]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a70f77adb2c9476531b2, M-031ed40318b12b46cc1e, M-cc250cc50515a292f3e3, M-5f2660010ee9acaad412
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-020</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-fd7699a659985da0fd8b, M-a478ccdcc1e81c64bdb5, M-f468fb9b0431f3ac6637, M-031ed40318b12b46cc1e
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-021</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0eb5279a20c8b5c7fadc, M-c7fa95689d660a49366b, M-f468fb9b0431f3ac6637
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-022</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.344, CI [0.037, 0.650]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a0945b1315ef7a1c6d20, M-d5b17d7b99557deb8cf5, M-cc250cc50515a292f3e3, M-97ab3f793f2aeef24f57
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-023</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-45801dddc6b525246c7c, M-6f27bc08a55e9f60beda
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-024</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4756067b923a59fad42d
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-025</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.510, CI [0.440, 0.580]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-67e0e95c9279752ebbb3, M-dfab048a83e3b8acc06c, M-46ef419cc3ad42da20d8, M-754f798f908f9e4f73d8
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-027</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c16d20b1a2a555dc6b2a
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-028</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9e5f57461794b4359633
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-038</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a6073e68be3dfa99914b
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-041</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-950f525deedd2a7736c7, M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-053</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0cb7ff81422b13b69064
</details>

<details><summary><b>seven-topdeck</b></summary>

Used in 8.5% of participant observations (17/200). Outcome association: positive (0.096, CI [-0.148, 0.341]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-c7fa95689d660a49366b, M-1b9ce7c6ecb94b540b09, M-7d2e54be2e472d2f7c7d
</details>

<details><summary><b>shuffle-reset</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a0945b1315ef7a1c6d20
</details>

<details><summary><b>six-dig</b></summary>

Used in 12.5% of participant observations (25/200). Outcome association: negative (-0.114, CI [-0.320, 0.092]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9e5f57461794b4359633, M-581e8e1bf1c1db31783f, M-d42c5a76b1a43e8227de, M-4756067b923a59fad42d
</details>

<details><summary><b>solo-wild</b></summary>

Used in 10.5% of participant observations (21/200). Outcome association: negative (-0.133, CI [-0.353, 0.087]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-950f525deedd2a7736c7, M-e50eb7181b42fcaf3c35, M-ee7b17238b5a8fc4f4f8
</details>

<details><summary><b>spade-recovery</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3e56af56c419de97ddc8, M-04f952648982b1b60b68, M-0cb7ff81422b13b69064
</details>

<details><summary><b>super</b></summary>

Used in 8.5% of participant observations (17/200). Outcome association: positive (0.096, CI [-0.148, 0.341]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-f1291cd390d331a3ffbb, M-1b9ce7c6ecb94b540b09, M-5ef9d016ebb1846cf10b
</details>

<details><summary><b>swap-bar</b></summary>

Used in 55.5% of participant observations (111/200). Outcome association: positive (0.233, CI [0.097, 0.368]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: EXPLORATORY (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-dfab048a83e3b8acc06c, M-d42c5a76b1a43e8227de, M-5ef9d016ebb1846cf10b
</details>

<details><summary><b>three-black-ace</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a70f77adb2c9476531b2, M-4e938b55c5c081cf4195
</details>

<details><summary><b>three-black-bounce-top</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ebe73b4e96d2314f230f, M-44dff5891c6198671640, M-4e938b55c5c081cf4195, M-1eda409b45784512a347
</details>

<details><summary><b>three-black-clear-er</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7d2e54be2e472d2f7c7d, M-9c890ada2c2ec493c6f9, M-1d9b0db8df3efa98ae2c, M-6f27bc08a55e9f60beda
</details>

<details><summary><b>three-black-clear-pr</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.508, CI [-0.577, -0.438]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9c9a76ea4e99e1871ffa, M-581e8e1bf1c1db31783f, M-38bc37c903f30b850762
</details>

<details><summary><b>three-black-jack-pr</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.508, CI [0.438, 0.577]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-cd7618de7602f750b9aa, M-5f0108d242d5ab67d089, M-ec8f8ba09f1121a2d16f
</details>

<details><summary><b>three-black-king</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.513, CI [-0.583, -0.443]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-29d8421ee41250f8c875, M-3e56af56c419de97ddc8, M-0cb7ff81422b13b69064, M-4e938b55c5c081cf4195
</details>

<details><summary><b>three-black-queen</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.172, CI [-0.556, 0.212]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7b7e7ab66d88f3491867, M-754f798f908f9e4f73d8, M-1b9ce7c6ecb94b540b09, M-84269db284883330999c
</details>

<details><summary><b>three-black-total-clear</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-d42c5a76b1a43e8227de
</details>

<details><summary><b>three-bounce-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7b7e7ab66d88f3491867
</details>

<details><summary><b>three-bounce-♥</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-b615ae18bd3e0f132ef8
</details>

<details><summary><b>three-bounce-♦</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-67e0e95c9279752ebbb3, M-0cb7ff81422b13b69064
</details>

<details><summary><b>three-force-discard</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.370, CI [-0.639, -0.101]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-43ee676468dfdd29d4e0, M-4e938b55c5c081cf4195, M-1d9b0db8df3efa98ae2c, M-3dc3510153eebdf54abb
</details>

<details><summary><b>three-hand</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a478ccdcc1e81c64bdb5, M-9c890ada2c2ec493c6f9, M-b615ae18bd3e0f132ef8, M-5f2660010ee9acaad412
</details>

<details><summary><b>three-points</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7d2e54be2e472d2f7c7d, M-9c890ada2c2ec493c6f9, M-b615ae18bd3e0f132ef8
</details>

<details><summary><b>three-present-take</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7d2e54be2e472d2f7c7d, M-0cb7ff81422b13b69064
</details>

<details><summary><b>three-red-counter</b></summary>

Used in 16.0% of participant observations (32/200). Outcome association: positive (0.074, CI [-0.113, 0.262]). Immediate point impact: mean 4.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-6d0b4f6682536c727bbc, M-d42c5a76b1a43e8227de, M-0cb7ff81422b13b69064
</details>

<details><summary><b>topdeck-seven-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0cb7ff81422b13b69064
</details>

<details><summary><b>total-clear</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9ac093c9da6330a6fdec, M-3e56af56c419de97ddc8, M-0cb7ff81422b13b69064
</details>

<details><summary><b>two-hold</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-5ef9d016ebb1846cf10b, M-4e938b55c5c081cf4195
</details>

<details><summary><b>two-score</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-34f95691dcfd17f93e47, M-29d8421ee41250f8c875
</details>

<details><summary><b>ultra</b></summary>

Used in 46.0% of participant observations (92/200). Outcome association: negative (-0.081, CI [-0.219, 0.058]). Immediate point impact: mean 1.43 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-da33bf6f5bb04f175916, M-c7fa95689d660a49366b, M-d42c5a76b1a43e8227de, M-a6073e68be3dfa99914b
</details>

<details><summary><b>voltage</b></summary>

Used in 16.0% of participant observations (32/200). Outcome association: positive (0.298, CI [0.130, 0.465]). Evidence grade: EXPLORATORY (insufficient).

Replay refs: M-f3fba5744ac97b09f3e9, M-889076167d236a1a97c2, M-b615ae18bd3e0f132ef8, M-015b0b148b1e1f8a9876
</details>

<details><summary><b>wild-sovereignty</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-9ac093c9da6330a6fdec, M-950f525deedd2a7736c7, M-e50eb7181b42fcaf3c35, M-0cb7ff81422b13b69064
</details>

## Synergy Findings

| Pair | Class | Effect | Shrunk | q-value | Status |
|------|-------|--------|--------|---------|--------|
| draw::2-black-2-red-draw | anti-synergy | 0.667 | 0.854 | 0.9010 | inconclusive |
| draw::jack | synergy | 1.214 | 1.115 | 0.9010 | inconclusive |

## Causal Motifs

- **score → score** — 29 occurrence(s), 10 matches
- **unclassified → score** — 17 occurrence(s), 11 matches
- **face-down → unclassified** — 9 occurrence(s), 7 matches
- **score → unclassified** — 9 occurrence(s), 6 matches
- **nine-tap → nine-tap** — 6 occurrence(s), 4 matches
- **unclassified → 2-black-2-red-draw** — 6 occurrence(s), 5 matches
- **score → nine-tap** — 5 occurrence(s), 5 matches
- **unclassified → club-foundation-bonus** — 4 occurrence(s), 4 matches
- **unclassified → heart-tempo** — 4 occurrence(s), 3 matches
- **club-foundation-bonus → club-foundation-bonus** — 3 occurrence(s), 3 matches
- **club-foundation-bonus → unclassified** — 3 occurrence(s), 3 matches
- **disrupt → score** — 3 occurrence(s), 3 matches
- **unclassified → unclassified** — 3 occurrence(s), 3 matches
- **2-black-2-red-draw → disrupt** — 2 occurrence(s), 2 matches
- **2-black-2-red-draw → score** — 2 occurrence(s), 2 matches
- **2-black-2-red-rummage → score** — 2 occurrence(s), 1 matches
- **disrupt → disrupt** — 2 occurrence(s), 2 matches
- **disrupt → unclassified** — 2 occurrence(s), 2 matches
- **rank10-stack-theft → three-red-counter** — 2 occurrence(s), 2 matches
- **score → disrupt** — 2 occurrence(s), 2 matches

## Anomalies

30 anomaly/anomalies: LONG_MATCH (5), ORCHESTRATION_DENSITY (24), RESPONSE_CHAIN_INTENSITY (1).

- LONG_MATCH: 5
- ORCHESTRATION_DENSITY: 24
- RESPONSE_CHAIN_INTENSITY: 1

## Recommendations

- Most synergy findings are inconclusive — consider increasing match count for statistical power.
- 133 mechanic(s) have sample size below 20 — interpret with caution.

## Interpretation Boundary

Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.

