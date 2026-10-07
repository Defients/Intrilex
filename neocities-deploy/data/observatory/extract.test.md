# Mechanics Observatory — AI Agent Extract

**Extract version:** 1.0.0
**Analytics schema:** 4.2.0
**Source hash:** `8f10ceeb04f46e114bc129093684bcc8709716d38481b7bb6b98db794a8482b6`
**Aggregate hash:** `3e3dd7a23ff2c2fab78c32fbe9e01e8f4a19814f07fac23d91d56158b396acb3`
**Extract hash:** `8939436bb89207cf1c2f9c39c715fb7d59d4e1d4e6bbfbb2009f547c7089fe5c`

## Executive Summary

Analysis covers 100 Advanced Core matches under Engine v4.2.6 / Rules v4.2.0. All matches completed without aborts. Highest win rate: control-conversion-tactical at 100.0% (CI [0.610, 1.000], 6 games). No synergy pairs reached statistical significance after FDR correction. 171 mechanic(s) measured with evidence-backed associations. 23 anomaly/anomalies flagged (0 critical, 5 warning, 18 info). Data completeness: PASS (no unclassified facts). Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.

## Dataset

| Metric | Value |
|--------|-------|
| matchCount | 100 |
| completedMatchCount | 100 |
| abortCount | 0 |
| drawCount | 0 |
| detailedMatchCount | 12 |
| policyCount | 17 |
| mechanicCount | 171 |
| synergyCount | 0 |
| motifCount | 60 |
| anomalyCount | 23 |

## Policy Findings

### control

- **Win rate:** 13.0% (3/23 games, CI [0.045, 0.321])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=9.913, responseUse=5.000, advancedFrequency=1.696

### control-conversion-tactical

- **Win rate:** 100.0% (6/6 games, CI [0.610, 1.000])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, voltage-heavy, short matches
- **Fingerprint:** scoreAggression=5.500, responseUse=2.333, advancedFrequency=0.667

### control-tactical

- **Win rate:** 50.0% (3/6 games, CI [0.188, 0.812])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=15.500, responseUse=7.000, advancedFrequency=2.000

### hybrix-baseline

- **Win rate:** 80.0% (4/5 games, CI [0.376, 0.964])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, voltage-heavy, short matches
- **Fingerprint:** scoreAggression=6.000, responseUse=2.600, advancedFrequency=0.600

### hybrix-defender

- **Win rate:** 33.3% (2/6 games, CI [0.097, 0.700])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=11.667, responseUse=5.167, advancedFrequency=3.667

### hybrix-rusher

- **Win rate:** 83.3% (5/6 games, CI [0.436, 0.970])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, short matches
- **Fingerprint:** scoreAggression=4.333, responseUse=2.333, advancedFrequency=1.000

### hybrix-sniper

- **Win rate:** 66.7% (4/6 games, CI [0.300, 0.903])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=7.500, responseUse=4.167, advancedFrequency=1.167

### hybrix-support

- **Win rate:** 50.0% (3/6 games, CI [0.188, 0.812])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=10.667, responseUse=4.333, advancedFrequency=0.667

### hybrix-tank

- **Win rate:** 80.0% (4/5 games, CI [0.376, 0.964])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=12.400, responseUse=7.000, advancedFrequency=1.600

### hybrix-trickster

- **Win rate:** 66.7% (4/6 games, CI [0.300, 0.903])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=11.167, responseUse=5.833, advancedFrequency=3.000

### random-legal

- **Win rate:** 8.7% (2/23 games, CI [0.024, 0.268])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=11.304, responseUse=5.565, advancedFrequency=1.783

### score-rush

- **Win rate:** 43.5% (10/23 games, CI [0.256, 0.632])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=5.783, responseUse=1.870, advancedFrequency=0.391

### score-rush-tactical

- **Win rate:** 66.7% (14/21 games, CI [0.454, 0.828])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=7.762, responseUse=2.429, advancedFrequency=1.381

### tempo

- **Win rate:** 60.9% (14/23 games, CI [0.408, 0.778])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=6.261, responseUse=2.609, advancedFrequency=1.261

### tempo-tactical

- **Win rate:** 83.3% (5/6 games, CI [0.436, 0.970])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=7.167, responseUse=4.500, advancedFrequency=2.000

### value

- **Win rate:** 47.8% (11/23 games, CI [0.292, 0.670])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, short matches
- **Fingerprint:** scoreAggression=5.304, responseUse=1.652, advancedFrequency=0.783

### value-tactical

- **Win rate:** 100.0% (6/6 games, CI [0.610, 1.000])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=6.000, responseUse=5.167, advancedFrequency=3.500

## Mechanic Findings

| Mechanic | Usage Rate | Sample | Association | Grade | Status |
|----------|-----------|--------|-------------|-------|--------|
| 2-black-2-red-draw | 23.0% | 46 | -0.113 | INSUFFICIENT | measured |
| 2-black-2-red-rummage | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| ace | 7.5% | 15 | -0.180 | INSUFFICIENT | measured |
| ace-anchor | 6.0% | 12 | -0.177 | INSUFFICIENT | measured |
| ace-base | 20.5% | 41 | 0.107 | INSUFFICIENT | measured |
| ace-spade | 8.0% | 16 | 0.408 | EXPLORATORY | measured |
| anchor | 22.0% | 44 | -0.117 | INSUFFICIENT | measured |
| anchor-private-choice | 3.0% | 6 | -0.172 | INSUFFICIENT | measured |
| attachment | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| bj-exile-recycle-CORE-009-CORE-010 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| bj-exile-recycle-CORE-020 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| bj-exile-recycle-skip | 3.5% | 7 | 0.370 | INSUFFICIENT | measured |
| board-lock | 5.0% | 10 | -0.316 | EXPLORATORY | measured |
| bounce-top | 11.5% | 23 | -0.123 | INSUFFICIENT | measured |
| clear-er | 3.0% | 6 | -0.172 | INSUFFICIENT | measured |
| clear-pr | 7.0% | 14 | -0.077 | INSUFFICIENT | measured |
| club-foundation | 3.0% | 6 | 0.344 | INSUFFICIENT | measured |
| club-foundation-bonus | 9.0% | 18 | 0.244 | EXPLORATORY | measured |
| combo | 56.0% | 112 | -0.020 | INSUFFICIENT | measured |
| counter | 35.0% | 70 | 0.176 | EXPLORATORY | measured |
| deep-draw-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| diamond-mimic-paired-super-j-tempo | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| diamond-mimic-row-exchange-er | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| diamond-mimic-row-exchange-pr | 6.0% | 12 | 0.266 | INSUFFICIENT | measured |
| disrupt | 38.5% | 77 | -0.053 | INSUFFICIENT | measured |
| draw | 55.0% | 110 | -0.202 | EXPLORATORY | measured |
| effect-ace | 3.5% | 7 | -0.074 | INSUFFICIENT | measured |
| effect-four | 11.0% | 22 | -0.051 | INSUFFICIENT | measured |
| effect-private-choice | 22.5% | 45 | -0.129 | INSUFFICIENT | measured |
| effect-red-joker | 3.0% | 6 | 0.172 | INSUFFICIENT | measured |
| effect-three | 11.5% | 23 | -0.123 | INSUFFICIENT | measured |
| eight-absolute-scuttle | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| eight-aegis-field | 15.5% | 31 | -0.019 | INSUFFICIENT | measured |
| eight-scuttle | 2.5% | 5 | 0.103 | INSUFFICIENT | measured |
| eight-spade-free-scuttle | 6.0% | 12 | -0.089 | INSUFFICIENT | measured |
| exhausted-pass | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| face-down | 53.5% | 107 | 0.171 | INSUFFICIENT | measured |
| face-up-draw | 15.0% | 30 | -0.314 | INSUFFICIENT | measured |
| five-gy-bottom | 8.5% | 17 | 0.354 | EXPLORATORY | measured |
| five-recycle | 6.5% | 13 | -0.123 | INSUFFICIENT | measured |
| five-refine | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| four-exchange-pr | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| four-guess-10-♣ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-10-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-10-♦ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-2-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-4-♣ | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| four-guess-5-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-6-♥ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-7-♣ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-7-♥ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-8-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-9-♥ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-J-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-K-♥ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-Q-♣ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♦ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-row-clear-pr | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-pr-♠ | 1.5% | 3 | -0.169 | INSUFFICIENT | measured |
| four-row-clear-pr-♣ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| four-row-clear-pr-♥ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| four-row-clear-pr-♦ | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| hand-swap | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| heart-tempo | 9.0% | 18 | 0.000 | INSUFFICIENT | measured |
| jack | 38.5% | 77 | -0.053 | INSUFFICIENT | measured |
| jack-pr | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| jack-tempo | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| king | 15.0% | 30 | -0.039 | INSUFFICIENT | measured |
| king-anchor | 2.5% | 5 | 0.103 | INSUFFICIENT | measured |
| king-spade | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| natural-four | 3.0% | 6 | -0.172 | INSUFFICIENT | measured |
| natural-four-reorder-draw-CORE-026-CORE-024-CORE-022-CORE-020 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| natural-four-reorder-draw-CORE-035-CORE-037-CORE-039-CORE-041 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| natural-four-reorder-draw-CORE-038-CORE-040-CORE-042-CORE-044 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| nine | 3.0% | 6 | -0.172 | INSUFFICIENT | measured |
| nine-anchor-discard | 3.0% | 6 | 0.172 | INSUFFICIENT | measured |
| nine-goal-shift-3 | 1.5% | 3 | -0.169 | INSUFFICIENT | measured |
| nine-spade-goal-shift-5 | 2.5% | 5 | -0.103 | INSUFFICIENT | measured |
| nine-tap | 25.0% | 50 | -0.107 | INSUFFICIENT | measured |
| opponent-attack | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| purge-anchor-bounce | 3.5% | 7 | -0.074 | INSUFFICIENT | measured |
| queen | 4.0% | 8 | -0.130 | INSUFFICIENT | measured |
| queen-aegis | 14.0% | 28 | 0.083 | INSUFFICIENT | measured |
| rank10 | 27.5% | 55 | 0.188 | EXPLORATORY | measured |
| rank10-stack-theft | 2.5% | 5 | -0.308 | INSUFFICIENT | measured |
| rank3-discard | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| rank3-present | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| rank3-take | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| rank5-rummage | 5.5% | 11 | -0.144 | INSUFFICIENT | measured |
| rank6-keep-all-discard | 4.5% | 9 | 0.291 | INSUFFICIENT | measured |
| rank6-keep-return-bottom | 8.5% | 17 | 0.032 | INSUFFICIENT | measured |
| rank6-keep-return-top | 5.5% | 11 | -0.241 | INSUFFICIENT | measured |
| rank7-generated-advanced-ultra-three-black | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-generated-three-bounce | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-hand-and-effect | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| rank7-hand-and-score | 4.0% | 8 | 0.130 | INSUFFICIENT | measured |
| recycle-five | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| recycle-five-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| recycle-five-♦ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| royal-marriage | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| score | 81.0% | 162 | 0.520 | INSUFFICIENT | measured |
| scuttle | 27.0% | 54 | -0.127 | INSUFFICIENT | measured |
| self-reset | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-003 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-004 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-005 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-012 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-013 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-015 | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-016 | 5.5% | 11 | 0.241 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-017 | 2.5% | 5 | -0.103 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-018 | 5.0% | 10 | 0.211 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-019 | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-020 | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-021 | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-022 | 1.5% | 3 | 0.508 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-023 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-024 | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-025 | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-026 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-028 | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-032 | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-035 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-036 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-040 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-041 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-042 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-044 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-046 | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-scoring-trigger-take-CORE-051 | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| seven-topdeck | 5.0% | 10 | 0.000 | INSUFFICIENT | measured |
| six-dig | 16.0% | 32 | -0.074 | INSUFFICIENT | measured |
| six-dig-♦ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| solo-wild | 11.0% | 22 | -0.255 | INSUFFICIENT | measured |
| spade-recovery | 3.0% | 6 | 0.000 | INSUFFICIENT | measured |
| super | 10.0% | 20 | 0.167 | INSUFFICIENT | measured |
| super-ace | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| swap-bar | 55.0% | 110 | 0.141 | EXPLORATORY | measured |
| three-black-ace | 2.5% | 5 | -0.513 | INSUFFICIENT | measured |
| three-black-bounce-top | 2.5% | 5 | 0.103 | INSUFFICIENT | measured |
| three-black-clear-er | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| three-black-clear-pr | 2.5% | 5 | 0.308 | INSUFFICIENT | measured |
| three-black-jack-pr | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| three-black-king | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| three-black-purge-anchor-bounce | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| three-black-queen | 1.5% | 3 | -0.508 | INSUFFICIENT | measured |
| three-black-total-clear | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| three-bounce | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| three-bounce-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| three-bounce-♥ | 3.0% | 6 | -0.344 | INSUFFICIENT | measured |
| three-force-discard | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| three-hand | 1.5% | 3 | 0.508 | INSUFFICIENT | measured |
| three-points | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| three-present-take | 3.0% | 6 | -0.344 | INSUFFICIENT | measured |
| three-red-counter | 14.0% | 28 | 0.083 | INSUFFICIENT | measured |
| topdeck-seven | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| topdeck-seven-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| topdeck-seven-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| topdeck-seven-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| topdeck-seven-♦ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| total-clear | 3.5% | 7 | -0.074 | INSUFFICIENT | measured |
| total-clear-♠ | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| two-hold | 2.5% | 5 | 0.308 | INSUFFICIENT | measured |
| two-quick-discard | 15.0% | 30 | 0.118 | INSUFFICIENT | measured |
| two-score | 3.5% | 7 | 0.074 | INSUFFICIENT | measured |
| two-score-discard | 18.0% | 36 | -0.136 | INSUFFICIENT | measured |
| ultra | 48.5% | 97 | -0.010 | INSUFFICIENT | measured |
| voltage | 13.0% | 26 | 0.309 | EXPLORATORY | measured |
| wild-sovereignty | 2.5% | 5 | -0.103 | INSUFFICIENT | measured |

<details><summary><b>2-black-2-red-draw</b></summary>

Used in 23.0% of participant observations (46/200). Outcome association: negative (-0.113, CI [-0.276, 0.050]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3a3ab827dcd1075b2312, M-dcf452adff15fcef7302, M-823b91aeb6863c9213fe, M-7685104a0dff44c3cb7e
</details>

<details><summary><b>2-black-2-red-rummage</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-b15ac4537093dcb78d9e, M-10e906b68f564a404af3
</details>

<details><summary><b>ace</b></summary>

Used in 7.5% of participant observations (15/200). Outcome association: negative (-0.180, CI [-0.429, 0.069]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1e0a8ae4b4442d9640cf, M-fb151a512f79ad9d26cf, M-ecb9b494d74db6f2d2da, M-0ed06d7836b1e9f31a1b
</details>

<details><summary><b>ace-anchor</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (-0.177, CI [-0.453, 0.099]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 7 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-1e0a8ae4b4442d9640cf, M-bd9fa9f2b1a86c24f812, M-ecb9b494d74db6f2d2da, M-bbc346d896606590e3e6
</details>

<details><summary><b>ace-base</b></summary>

Used in 20.5% of participant observations (41/200). Outcome association: positive (0.107, CI [-0.062, 0.277]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1e0a8ae4b4442d9640cf, M-bfb4911cab03e0e69503, M-0ead2e03f49701751682, M-d6119be6f69c3e5c4f03
</details>

<details><summary><b>ace-spade</b></summary>

Used in 8.0% of participant observations (16/200). Outcome association: positive (0.408, CI [0.230, 0.585]). Evidence grade: EXPLORATORY (weak). Choice identification: limited — only 9 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-3a3ab827dcd1075b2312, M-80c9d5031d1eb9d7ea35, M-68e85cbe73e41181ad4b, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>anchor</b></summary>

Used in 22.0% of participant observations (44/200). Outcome association: negative (-0.117, CI [-0.282, 0.049]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1e0a8ae4b4442d9640cf, M-6b70490e3e758f2cff70, M-0ead2e03f49701751682, M-6be86d4c8f8c2c312526
</details>

<details><summary><b>anchor-private-choice</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.172, CI [-0.556, 0.212]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-bd9fa9f2b1a86c24f812, M-43926dd2a83622811654, M-1cabf7e1358a430a03fc
</details>

<details><summary><b>attachment</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6b34be9d915e5f425096, M-7f0fb54a0a4c7a02d5be, M-43926dd2a83622811654, M-7fa10d60b9110d3847b5
</details>

<details><summary><b>bj-exile-recycle-CORE-009-CORE-010</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-59bfa112712b2f3d6244
</details>

<details><summary><b>bj-exile-recycle-CORE-020</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-8a5ccb67f29c5fb760ee
</details>

<details><summary><b>bj-exile-recycle-skip</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: positive (0.370, CI [0.101, 0.639]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 2 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-7f0fb54a0a4c7a02d5be, M-ed123e23841332200c85, M-68e85cbe73e41181ad4b, M-bfb4911cab03e0e69503
</details>

<details><summary><b>board-lock</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (-0.316, CI [-0.574, -0.058]). Evidence grade: EXPLORATORY (weak).

Replay refs: M-c6f2df43037417ae933d, M-be864244dda67d163d04, M-bf5564dd869c1d3dad59, M-c3aa986ff508a6eeee5c
</details>

<details><summary><b>bounce-top</b></summary>

Used in 11.5% of participant observations (23/200). Outcome association: negative (-0.123, CI [-0.335, 0.090]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-59bfa112712b2f3d6244, M-823b91aeb6863c9213fe, M-44f3c3b26dd3188cfb1c
</details>

<details><summary><b>clear-er</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.172, CI [-0.556, 0.212]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8a5ccb67f29c5fb760ee, M-1fce2e8feaceff1507d0, M-43926dd2a83622811654, M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>clear-pr</b></summary>

Used in 7.0% of participant observations (14/200). Outcome association: negative (-0.077, CI [-0.346, 0.192]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1bf76059b3e86070f410, M-fe46f3098ae1178f5428, M-ecb9b494d74db6f2d2da, M-7685104a0dff44c3cb7e
</details>

<details><summary><b>club-foundation</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.344, CI [0.037, 0.650]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0e77a3229088035a6e06, M-bd9fa9f2b1a86c24f812, M-ab005c31fb9e696b935a, M-bfb4911cab03e0e69503
</details>

<details><summary><b>club-foundation-bonus</b></summary>

Used in 9.0% of participant observations (18/200). Outcome association: positive (0.244, CI [0.025, 0.463]). Immediate point impact: mean 9.17 over undefined measured declarations. Evidence grade: EXPLORATORY (weak). Choice identification: limited — only 12 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-7f0fb54a0a4c7a02d5be, M-def67daf60c80e4f1835, M-823b91aeb6863c9213fe, M-0ed06d7836b1e9f31a1b
</details>

<details><summary><b>combo</b></summary>

Used in 56.0% of participant observations (112/200). Outcome association: negative (-0.020, CI [-0.160, 0.119]). Immediate point impact: mean 2.28 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3a3ab827dcd1075b2312, M-0abbb36eea637c1b8c25, M-823b91aeb6863c9213fe, M-a4c8c5b0f6b579f5059e
</details>

<details><summary><b>counter</b></summary>

Used in 35.0% of participant observations (70/200). Outcome association: positive (0.176, CI [0.033, 0.318]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: EXPLORATORY (weak).

Replay refs: M-3a3ab827dcd1075b2312, M-80c9d5031d1eb9d7ea35, M-0ead2e03f49701751682, M-bf8173423a3f80544774
</details>

<details><summary><b>deep-draw-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f519f533a84455253ef3
</details>

<details><summary><b>diamond-mimic-paired-super-j-tempo</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 9 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-bf8173423a3f80544774, M-dc85fd40da0ee11844ae
</details>

<details><summary><b>diamond-mimic-row-exchange-er</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-62fdff6544b65b495076, M-bd9fa9f2b1a86c24f812, M-6be86d4c8f8c2c312526, M-bfb4911cab03e0e69503
</details>

<details><summary><b>diamond-mimic-row-exchange-pr</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: positive (0.266, CI [0.011, 0.521]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1bf76059b3e86070f410, M-0abbb36eea637c1b8c25, M-105cc67103dbca1477fb, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>disrupt</b></summary>

Used in 38.5% of participant observations (77/200). Outcome association: negative (-0.053, CI [-0.195, 0.089]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1e0a8ae4b4442d9640cf, M-1cabf7e1358a430a03fc, M-823b91aeb6863c9213fe, M-7685104a0dff44c3cb7e
</details>

<details><summary><b>draw</b></summary>

Used in 55.0% of participant observations (110/200). Outcome association: negative (-0.202, CI [-0.338, -0.066]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: EXPLORATORY (weak).

Replay refs: M-1e0a8ae4b4442d9640cf, M-dcf452adff15fcef7302, M-823b91aeb6863c9213fe, M-7685104a0dff44c3cb7e
</details>

<details><summary><b>effect-ace</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.074, CI [-0.447, 0.299]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c2d7ac654cf6fa83830b, M-bd9fa9f2b1a86c24f812, M-dc85fd40da0ee11844ae, M-6b70490e3e758f2cff70
</details>

<details><summary><b>effect-four</b></summary>

Used in 11.0% of participant observations (22/200). Outcome association: negative (-0.051, CI [-0.272, 0.170]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3a3ab827dcd1075b2312, M-fe46f3098ae1178f5428, M-dc85fd40da0ee11844ae, M-7685104a0dff44c3cb7e
</details>

<details><summary><b>effect-private-choice</b></summary>

Used in 22.5% of participant observations (45/200). Outcome association: negative (-0.129, CI [-0.292, 0.034]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781, M-c3aa986ff508a6eeee5c, M-823b91aeb6863c9213fe, M-43926dd2a83622811654
</details>

<details><summary><b>effect-red-joker</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.172, CI [-0.212, 0.556]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7a682d224e41c60f69a5, M-1011c764e8b424cf09eb, M-d5cf43da2cca5b2f434f, M-bbc346d896606590e3e6
</details>

<details><summary><b>effect-three</b></summary>

Used in 11.5% of participant observations (23/200). Outcome association: negative (-0.123, CI [-0.335, 0.090]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-59bfa112712b2f3d6244, M-823b91aeb6863c9213fe, M-44f3c3b26dd3188cfb1c
</details>

<details><summary><b>eight-absolute-scuttle</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 9 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c6f2df43037417ae933d, M-105cc67103dbca1477fb, M-896cd21d0090f74b8ff3
</details>

<details><summary><b>eight-aegis-field</b></summary>

Used in 15.5% of participant observations (31/200). Outcome association: negative (-0.019, CI [-0.210, 0.172]). Immediate point impact: mean 3.33 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1bf76059b3e86070f410, M-1fce2e8feaceff1507d0, M-dc85fd40da0ee11844ae, M-0ed06d7836b1e9f31a1b
</details>

<details><summary><b>eight-scuttle</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.103, CI [-0.333, 0.538]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 1 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-1e0a8ae4b4442d9640cf, M-3149ccff03221e0fcec8, M-7685104a0dff44c3cb7e, M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>eight-spade-free-scuttle</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (-0.089, CI [-0.377, 0.199]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 6 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-a1e68d9b732dda228781, M-62fdff6544b65b495076, M-3de8965082511d7fe42f, M-6be86d4c8f8c2c312526
</details>

<details><summary><b>exhausted-pass</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>face-down</b></summary>

Used in 53.5% of participant observations (107/200). Outcome association: positive (0.171, CI [0.034, 0.308]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1e0a8ae4b4442d9640cf, M-0abbb36eea637c1b8c25, M-823b91aeb6863c9213fe, M-d5cf43da2cca5b2f434f
</details>

<details><summary><b>face-up-draw</b></summary>

Used in 15.0% of participant observations (30/200). Outcome association: negative (-0.314, CI [-0.483, -0.145]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1bf76059b3e86070f410, M-1fd45926dbd9f10b8374, M-bf5564dd869c1d3dad59, M-d5cf43da2cca5b2f434f
</details>

<details><summary><b>five-gy-bottom</b></summary>

Used in 8.5% of participant observations (17/200). Outcome association: positive (0.354, CI [0.158, 0.549]). Evidence grade: EXPLORATORY (weak).

Replay refs: M-a1e68d9b732dda228781, M-0abbb36eea637c1b8c25, M-ecb9b494d74db6f2d2da, M-d5cf43da2cca5b2f434f
</details>

<details><summary><b>five-recycle</b></summary>

Used in 6.5% of participant observations (13/200). Outcome association: negative (-0.123, CI [-0.397, 0.151]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c2d7ac654cf6fa83830b, M-0ed06d7836b1e9f31a1b, M-5b85d0f6a30826ddc9eb, M-43926dd2a83622811654
</details>

<details><summary><b>five-refine</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781, M-c2d7ac654cf6fa83830b, M-1fce2e8feaceff1507d0
</details>

<details><summary><b>four-exchange-pr</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Immediate point impact: mean -1.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0e77a3229088035a6e06, M-28d14df4ee30228a466c, M-63bf07ca92d9230c709e, M-43926dd2a83622811654
</details>

<details><summary><b>four-guess-10-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bfb4911cab03e0e69503
</details>

<details><summary><b>four-guess-10-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0bbf983c64d0d67755b4
</details>

<details><summary><b>four-guess-10-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-43926dd2a83622811654
</details>

<details><summary><b>four-guess-2-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bfb4911cab03e0e69503
</details>

<details><summary><b>four-guess-4-♣</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-43926dd2a83622811654, M-0ead2e03f49701751682
</details>

<details><summary><b>four-guess-5-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8aa82c3381a9a4b56820
</details>

<details><summary><b>four-guess-6-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-43926dd2a83622811654
</details>

<details><summary><b>four-guess-7-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-28d14df4ee30228a466c
</details>

<details><summary><b>four-guess-7-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-63bf07ca92d9230c709e
</details>

<details><summary><b>four-guess-8-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-43926dd2a83622811654
</details>

<details><summary><b>four-guess-9-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0ead2e03f49701751682
</details>

<details><summary><b>four-guess-J-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0abbb36eea637c1b8c25
</details>

<details><summary><b>four-guess-K-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bfb4911cab03e0e69503
</details>

<details><summary><b>four-guess-Q-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0ead2e03f49701751682
</details>

<details><summary><b>four-row-clear-er-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-75163a5f7bea7b5b1f54
</details>

<details><summary><b>four-row-clear-er-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781
</details>

<details><summary><b>four-row-clear-er-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781
</details>

<details><summary><b>four-row-clear-pr</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-68e85cbe73e41181ad4b
</details>

<details><summary><b>four-row-clear-pr-♠</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c1293284c7373e63e49a, M-bfb4911cab03e0e69503, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>four-row-clear-pr-♣</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7fa10d60b9110d3847b5, M-c3aa986ff508a6eeee5c
</details>

<details><summary><b>four-row-clear-pr-♥</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7685104a0dff44c3cb7e, M-105cc67103dbca1477fb
</details>

<details><summary><b>four-row-clear-pr-♦</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8529501c4d6da9b719cc, M-105cc67103dbca1477fb, M-ac49629ef9b831f05b7c, M-896cd21d0090f74b8ff3
</details>

<details><summary><b>hand-swap</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7a682d224e41c60f69a5, M-bbc346d896606590e3e6, M-d5cf43da2cca5b2f434f, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>heart-tempo</b></summary>

Used in 9.0% of participant observations (18/200). Outcome association: negative (0.000, CI [-0.242, 0.242]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3a3ab827dcd1075b2312, M-bbc346d896606590e3e6, M-dc85fd40da0ee11844ae, M-6be86d4c8f8c2c312526
</details>

<details><summary><b>jack</b></summary>

Used in 38.5% of participant observations (77/200). Outcome association: negative (-0.053, CI [-0.195, 0.089]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1e0a8ae4b4442d9640cf, M-1cabf7e1358a430a03fc, M-823b91aeb6863c9213fe, M-7685104a0dff44c3cb7e
</details>

<details><summary><b>jack-pr</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6b34be9d915e5f425096, M-7f0fb54a0a4c7a02d5be, M-43926dd2a83622811654, M-7fa10d60b9110d3847b5
</details>

<details><summary><b>jack-tempo</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 10 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c0b6a96902862a0be848
</details>

<details><summary><b>king</b></summary>

Used in 15.0% of participant observations (30/200). Outcome association: negative (-0.039, CI [-0.233, 0.154]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1e0a8ae4b4442d9640cf, M-6b70490e3e758f2cff70, M-0ead2e03f49701751682, M-6be86d4c8f8c2c312526
</details>

<details><summary><b>king-anchor</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.103, CI [-0.333, 0.538]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 3 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-389f15f16aa7e2d911f0, M-0ed06d7836b1e9f31a1b, M-0ead2e03f49701751682, M-dc85fd40da0ee11844ae
</details>

<details><summary><b>king-spade</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-3209e9849473fd96dfe9
</details>

<details><summary><b>natural-four</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.172, CI [-0.556, 0.212]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-1fce2e8feaceff1507d0, M-1b8ddabb2fbe2d2e9766, M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>natural-four-reorder-draw-CORE-026-CORE-024-CORE-022-CORE-020</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>natural-four-reorder-draw-CORE-035-CORE-037-CORE-039-CORE-041</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>natural-four-reorder-draw-CORE-038-CORE-040-CORE-042-CORE-044</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-0ed06d7836b1e9f31a1b
</details>

<details><summary><b>nine</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.172, CI [-0.556, 0.212]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-bd9fa9f2b1a86c24f812, M-43926dd2a83622811654, M-1cabf7e1358a430a03fc
</details>

<details><summary><b>nine-anchor-discard</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.172, CI [-0.212, 0.556]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c6f2df43037417ae933d, M-bd9fa9f2b1a86c24f812, M-43926dd2a83622811654, M-1cabf7e1358a430a03fc
</details>

<details><summary><b>nine-goal-shift-3</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781, M-c2d7ac654cf6fa83830b, M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>nine-spade-goal-shift-5</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.103, CI [-0.538, 0.333]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-75163a5f7bea7b5b1f54, M-1b8ddabb2fbe2d2e9766, M-68e85cbe73e41181ad4b, M-d5cf43da2cca5b2f434f
</details>

<details><summary><b>nine-tap</b></summary>

Used in 25.0% of participant observations (50/200). Outcome association: negative (-0.107, CI [-0.265, 0.052]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3a3ab827dcd1075b2312, M-dcf452adff15fcef7302, M-823b91aeb6863c9213fe, M-44f3c3b26dd3188cfb1c
</details>

<details><summary><b>opponent-attack</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-62fdff6544b65b495076
</details>

<details><summary><b>purge-anchor-bounce</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.074, CI [-0.447, 0.299]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 18 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c2d7ac654cf6fa83830b, M-bd9fa9f2b1a86c24f812, M-dc85fd40da0ee11844ae, M-6b70490e3e758f2cff70
</details>

<details><summary><b>queen</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (-0.130, CI [-0.473, 0.213]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781, M-75e6cb05d36bb0e24e64, M-42f4facd94b10989657e, M-0ed06d7836b1e9f31a1b
</details>

<details><summary><b>queen-aegis</b></summary>

Used in 14.0% of participant observations (28/200). Outcome association: positive (0.083, CI [-0.115, 0.281]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1bf76059b3e86070f410, M-21f76fbae3a2850d8b89, M-dfec43fa96fba5186121, M-44f3c3b26dd3188cfb1c
</details>

<details><summary><b>rank10</b></summary>

Used in 27.5% of participant observations (55/200). Outcome association: positive (0.188, CI [0.037, 0.339]). Immediate point impact: mean 6.11 over undefined measured declarations. Evidence grade: EXPLORATORY (weak).

Replay refs: M-3a3ab827dcd1075b2312, M-ed123e23841332200c85, M-823b91aeb6863c9213fe, M-bf8173423a3f80544774
</details>

<details><summary><b>rank10-stack-theft</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.308, CI [-0.665, 0.050]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 4 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-a1e68d9b732dda228781, M-7a682d224e41c60f69a5, M-dc85fd40da0ee11844ae, M-9a3926a666ef22118da0
</details>

<details><summary><b>rank3-discard</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-1fce2e8feaceff1507d0, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>rank3-present</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c2d7ac654cf6fa83830b, M-1fce2e8feaceff1507d0, M-0bbf983c64d0d67755b4, M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>rank3-take</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-1fce2e8feaceff1507d0, M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>rank5-rummage</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: negative (-0.144, CI [-0.437, 0.149]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c2d7ac654cf6fa83830b, M-0ed06d7836b1e9f31a1b, M-5b85d0f6a30826ddc9eb, M-43926dd2a83622811654
</details>

<details><summary><b>rank6-keep-all-discard</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: positive (0.291, CI [0.010, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-bd9fa9f2b1a86c24f812, M-ecb9b494d74db6f2d2da, M-bbc346d896606590e3e6
</details>

<details><summary><b>rank6-keep-return-bottom</b></summary>

Used in 8.5% of participant observations (17/200). Outcome association: positive (0.032, CI [-0.216, 0.280]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2288bda13a819c674a8f, M-bd9fa9f2b1a86c24f812, M-dc85fd40da0ee11844ae, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>rank6-keep-return-top</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: negative (-0.241, CI [-0.513, 0.032]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781, M-1fce2e8feaceff1507d0, M-823b91aeb6863c9213fe, M-dc85fd40da0ee11844ae
</details>

<details><summary><b>rank7-generated-advanced-ultra-three-black</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-61b47f042b1cf10539c7
</details>

<details><summary><b>rank7-generated-three-bounce</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-8a5ccb67f29c5fb760ee
</details>

<details><summary><b>rank7-hand-and-effect</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 10 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-61b47f042b1cf10539c7, M-8a5ccb67f29c5fb760ee
</details>

<details><summary><b>rank7-hand-and-score</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: positive (0.130, CI [-0.213, 0.473]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 2 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c6f2df43037417ae933d, M-0ed06d7836b1e9f31a1b, M-ac49629ef9b831f05b7c, M-7685104a0dff44c3cb7e
</details>

<details><summary><b>recycle-five</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-10e906b68f564a404af3
</details>

<details><summary><b>recycle-five-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4c77090a591dcaa0733e
</details>

<details><summary><b>recycle-five-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f519f533a84455253ef3
</details>

<details><summary><b>royal-marriage</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 7 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-079cffef4cdcf37d8209, M-8a5ccb67f29c5fb760ee, M-dc85fd40da0ee11844ae, M-ab005c31fb9e696b935a
</details>

<details><summary><b>score</b></summary>

Used in 81.0% of participant observations (162/200). Outcome association: positive (0.520, CI [0.406, 0.634]). Immediate point impact: mean 4.16 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3a3ab827dcd1075b2312, M-dcf452adff15fcef7302, M-823b91aeb6863c9213fe, M-d5cf43da2cca5b2f434f
</details>

<details><summary><b>scuttle</b></summary>

Used in 27.0% of participant observations (54/200). Outcome association: negative (-0.127, CI [-0.281, 0.027]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1e0a8ae4b4442d9640cf, M-1fce2e8feaceff1507d0, M-3de8965082511d7fe42f, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>self-reset</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1011c764e8b424cf09eb
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-003</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-26d898be79a2d56affc0
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-004</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-0ead2e03f49701751682
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-005</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-bbc346d896606590e3e6
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-012</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 1 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-0abbb36eea637c1b8c25
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-013</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-0abbb36eea637c1b8c25
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-015</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 13 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-6ef8292c3bd5e8e2553f, M-5f67f9ec4d9473a55a83, M-44f3c3b26dd3188cfb1c
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-016</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: positive (0.241, CI [-0.032, 0.513]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 3 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-1e0a8ae4b4442d9640cf, M-1fd45926dbd9f10b8374, M-68e85cbe73e41181ad4b, M-d5cf43da2cca5b2f434f
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-017</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.103, CI [-0.538, 0.333]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 10 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c128e39b535820ff1a1e, M-73634389d3772f229bd8, M-28ff342982dcc17a35db, M-c3aa986ff508a6eeee5c
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-018</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: positive (0.211, CI [-0.082, 0.503]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 4 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-3a3ab827dcd1075b2312, M-fe46f3098ae1178f5428, M-3de8965082511d7fe42f, M-73634389d3772f229bd8
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-019</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 5 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-8d5986425d68643eca93, M-4fd97b7d981279b857c4, M-21f76fbae3a2850d8b89, M-3209e9849473fd96dfe9
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-020</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 5 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-2bc8ef1b255aa686db5e, M-c3aa986ff508a6eeee5c
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-021</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 1 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c1293284c7373e63e49a, M-ab005c31fb9e696b935a, M-dfec43fa96fba5186121
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-022</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.508, CI [0.438, 0.577]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 1 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c1293284c7373e63e49a, M-dcf452adff15fcef7302, M-ecb9b494d74db6f2d2da
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-023</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 5 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-2bc8ef1b255aa686db5e
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-024</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-105cc67103dbca1477fb, M-f6d1bce1d5ea2ced9cc0
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-025</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 1 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-dcf452adff15fcef7302, M-f6d1bce1d5ea2ced9cc0
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-026</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 1 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-6b70490e3e758f2cff70
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-028</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-bfb4911cab03e0e69503, M-f6d1bce1d5ea2ced9cc0
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-032</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-8529501c4d6da9b719cc, M-bbc346d896606590e3e6
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-035</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-bbc346d896606590e3e6
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-036</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 1 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-2288bda13a819c674a8f
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-040</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-75163a5f7bea7b5b1f54
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-041</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 1 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-1fce2e8feaceff1507d0
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-042</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 1 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-105cc67103dbca1477fb
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-044</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-75163a5f7bea7b5b1f54
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-046</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-dc85fd40da0ee11844ae
</details>

<details><summary><b>seven-scoring-trigger-take-CORE-051</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-105cc67103dbca1477fb
</details>

<details><summary><b>seven-topdeck</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (0.000, CI [-0.318, 0.318]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-bd9fa9f2b1a86c24f812, M-ac49629ef9b831f05b7c, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>six-dig</b></summary>

Used in 16.0% of participant observations (32/200). Outcome association: negative (-0.074, CI [-0.262, 0.113]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781, M-c3aa986ff508a6eeee5c, M-823b91aeb6863c9213fe, M-105cc67103dbca1477fb
</details>

<details><summary><b>six-dig-♦</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>solo-wild</b></summary>

Used in 11.0% of participant observations (22/200). Outcome association: negative (-0.255, CI [-0.455, -0.055]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781, M-8529501c4d6da9b719cc, M-823b91aeb6863c9213fe, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>spade-recovery</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (0.000, CI [-0.406, 0.406]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 8 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-a1e68d9b732dda228781, M-1fce2e8feaceff1507d0, M-1b8ddabb2fbe2d2e9766, M-80c9d5031d1eb9d7ea35
</details>

<details><summary><b>super</b></summary>

Used in 10.0% of participant observations (20/200). Outcome association: positive (0.167, CI [-0.055, 0.388]). Immediate point impact: mean -1.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-fb62340c04aa2456b48c, M-3de8965082511d7fe42f, M-43926dd2a83622811654
</details>

<details><summary><b>super-ace</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 5 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-21f76fbae3a2850d8b89, M-1011c764e8b424cf09eb
</details>

<details><summary><b>swap-bar</b></summary>

Used in 55.0% of participant observations (110/200). Outcome association: positive (0.141, CI [0.004, 0.279]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: EXPLORATORY (weak).

Replay refs: M-1e0a8ae4b4442d9640cf, M-0abbb36eea637c1b8c25, M-823b91aeb6863c9213fe, M-d5cf43da2cca5b2f434f
</details>

<details><summary><b>three-black-ace</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.513, CI [-0.583, -0.443]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-b15ac4537093dcb78d9e, M-bd9fa9f2b1a86c24f812, M-42f4facd94b10989657e, M-bbc346d896606590e3e6
</details>

<details><summary><b>three-black-bounce-top</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.103, CI [-0.333, 0.538]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 9 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-c6f2df43037417ae933d, M-26d898be79a2d56affc0, M-0ead2e03f49701751682, M-0abbb36eea637c1b8c25
</details>

<details><summary><b>three-black-clear-er</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c3aa986ff508a6eeee5c, M-59bfa112712b2f3d6244, M-7685104a0dff44c3cb7e
</details>

<details><summary><b>three-black-clear-pr</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.308, CI [-0.050, 0.665]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7a682d224e41c60f69a5, M-ed123e23841332200c85, M-105cc67103dbca1477fb, M-43926dd2a83622811654
</details>

<details><summary><b>three-black-jack-pr</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Immediate point impact: mean 6.50 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-389f15f16aa7e2d911f0, M-52fcc60c7ed50ba7b744, M-ab005c31fb9e696b935a, M-77268ba404d7385345ad
</details>

<details><summary><b>three-black-king</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-75e6cb05d36bb0e24e64, M-dc85fd40da0ee11844ae
</details>

<details><summary><b>three-black-purge-anchor-bounce</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 2 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>three-black-queen</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.508, CI [-0.577, -0.438]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1e0a8ae4b4442d9640cf, M-1bf76059b3e86070f410, M-73634389d3772f229bd8
</details>

<details><summary><b>three-black-total-clear</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 16 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-dcf452adff15fcef7302
</details>

<details><summary><b>three-bounce</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1fce2e8feaceff1507d0
</details>

<details><summary><b>three-bounce-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>three-bounce-♥</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.344, CI [-0.650, -0.037]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-c2d7ac654cf6fa83830b, M-ac49629ef9b831f05b7c, M-75e6cb05d36bb0e24e64
</details>

<details><summary><b>three-force-discard</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1fce2e8feaceff1507d0, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>three-hand</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.508, CI [0.438, 0.577]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0abbb36eea637c1b8c25, M-c3aa986ff508a6eeee5c, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>three-points</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1fce2e8feaceff1507d0
</details>

<details><summary><b>three-present-take</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.344, CI [-0.650, -0.037]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-61b47f042b1cf10539c7, M-c2d7ac654cf6fa83830b, M-0bbf983c64d0d67755b4, M-1fce2e8feaceff1507d0
</details>

<details><summary><b>three-red-counter</b></summary>

Used in 14.0% of participant observations (28/200). Outcome association: positive (0.083, CI [-0.115, 0.281]). Immediate point impact: mean 5.67 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3a3ab827dcd1075b2312, M-fe46f3098ae1178f5428, M-bf5564dd869c1d3dad59, M-a4c8c5b0f6b579f5059e
</details>

<details><summary><b>topdeck-seven</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781
</details>

<details><summary><b>topdeck-seven-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c2d7ac654cf6fa83830b
</details>

<details><summary><b>topdeck-seven-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c2d7ac654cf6fa83830b
</details>

<details><summary><b>topdeck-seven-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>topdeck-seven-♦</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c6f2df43037417ae933d, M-823b91aeb6863c9213fe
</details>

<details><summary><b>total-clear</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.074, CI [-0.447, 0.299]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3a3ab827dcd1075b2312, M-bbc346d896606590e3e6, M-dc85fd40da0ee11844ae, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>total-clear-♠</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781, M-ac49629ef9b831f05b7c
</details>

<details><summary><b>two-hold</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.308, CI [-0.050, 0.665]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 11 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-61b47f042b1cf10539c7, M-75163a5f7bea7b5b1f54, M-3de8965082511d7fe42f, M-bd9fa9f2b1a86c24f812
</details>

<details><summary><b>two-quick-discard</b></summary>

Used in 15.0% of participant observations (30/200). Outcome association: positive (0.118, CI [-0.073, 0.308]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient). Choice identification: unsupported — only 0 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-1e0a8ae4b4442d9640cf, M-21f76fbae3a2850d8b89, M-ab005c31fb9e696b935a, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>two-score</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: positive (0.074, CI [-0.299, 0.447]). Evidence grade: INSUFFICIENT (insufficient). Choice identification: limited — only 9 legal-but-unselected frame(s); pick rate is selection regularity, not preference evidence.

Replay refs: M-4c77090a591dcaa0733e, M-fb62340c04aa2456b48c, M-ecb9b494d74db6f2d2da, M-baf0e3363783b4461603
</details>

<details><summary><b>two-score-discard</b></summary>

Used in 18.0% of participant observations (36/200). Outcome association: negative (-0.136, CI [-0.312, 0.041]). Immediate point impact: mean 1.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1e0a8ae4b4442d9640cf, M-21f76fbae3a2850d8b89, M-ab005c31fb9e696b935a, M-1b8ddabb2fbe2d2e9766
</details>

<details><summary><b>ultra</b></summary>

Used in 48.5% of participant observations (97/200). Outcome association: negative (-0.010, CI [-0.149, 0.129]). Immediate point impact: mean 2.69 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3a3ab827dcd1075b2312, M-dcf452adff15fcef7302, M-823b91aeb6863c9213fe, M-7685104a0dff44c3cb7e
</details>

<details><summary><b>voltage</b></summary>

Used in 13.0% of participant observations (26/200). Outcome association: positive (0.309, CI [0.131, 0.488]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: EXPLORATORY (weak).

Replay refs: M-a1e68d9b732dda228781, M-28d14df4ee30228a466c, M-0ead2e03f49701751682, M-d5cf43da2cca5b2f434f
</details>

<details><summary><b>wild-sovereignty</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.103, CI [-0.538, 0.333]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a1e68d9b732dda228781, M-10e906b68f564a404af3, M-68e85cbe73e41181ad4b, M-1fce2e8feaceff1507d0
</details>

## Synergy Findings

| Pair | Class | Effect | Shrunk | q-value | Status |
|------|-------|--------|--------|---------|--------|

## Causal Motifs

- **score → score** — 39 occurrence(s), 12 matches
- **unclassified → score** — 22 occurrence(s), 11 matches
- **face-down → unclassified** — 12 occurrence(s), 8 matches
- **unclassified → 2-black-2-red-draw** — 9 occurrence(s), 7 matches
- **score → unclassified** — 8 occurrence(s), 6 matches
- **2-black-2-red-draw → score** — 5 occurrence(s), 4 matches
- **score → face-down** — 5 occurrence(s), 4 matches
- **combo → unclassified** — 4 occurrence(s), 4 matches
- **two-score-discard → two-quick-discard** — 4 occurrence(s), 3 matches
- **two-score-discard → two-score-discard** — 4 occurrence(s), 3 matches
- **2-black-2-red-draw → disrupt** — 3 occurrence(s), 3 matches
- **club-foundation-bonus → unclassified** — 3 occurrence(s), 3 matches
- **combo → combo** — 3 occurrence(s), 3 matches
- **disrupt → score** — 3 occurrence(s), 3 matches
- **unclassified → club-foundation-bonus** — 3 occurrence(s), 3 matches
- **unclassified → combo** — 3 occurrence(s), 2 matches
- **unclassified → two-score-discard** — 3 occurrence(s), 2 matches
- **ace-base → disrupt** — 2 occurrence(s), 2 matches
- **club-foundation-bonus → club-foundation-bonus** — 2 occurrence(s), 2 matches
- **disrupt → eight-aegis-field** — 2 occurrence(s), 2 matches

## Anomalies

23 anomaly/anomalies: ORCHESTRATION_DENSITY (17), LONG_MATCH (5), RESPONSE_CHAIN_INTENSITY (1).

- ORCHESTRATION_DENSITY: 17
- LONG_MATCH: 5
- RESPONSE_CHAIN_INTENSITY: 1

## Recommendations

- 141 mechanic(s) have sample size below 20 — interpret with caution.

## Interpretation Boundary

Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.

