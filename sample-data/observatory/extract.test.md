# Mechanics Observatory — AI Agent Extract

**Extract version:** 1.0.0
**Analytics schema:** 4.2.0
**Source hash:** `6de020461121d0b98b91149c962f439898996acb3e909f0f182397be2b779243`
**Aggregate hash:** `b7a6ff7b320f312ccfac7d0b00400e73e1f8d8f486b17feadebf33b4ff554742`
**Extract hash:** `963755e2d9278938c40059ba469021c0693db388d11265db385d2d160e77847b`

## Executive Summary

Analysis covers 100 Advanced Core matches under Engine v4.2.6 / Rules v4.2.0. All matches completed without aborts. Highest win rate: hybrix-baseline at 87.5% (CI [0.529, 0.978], 8 games). No synergy pairs reached statistical significance after FDR correction. 126 mechanic(s) measured with evidence-backed associations. 30 anomaly/anomalies flagged (0 critical, 5 warning, 25 info). Data completeness: PASS (no unclassified facts). Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.

## Dataset

| Metric | Value |
|--------|-------|
| matchCount | 100 |
| completedMatchCount | 100 |
| abortCount | 0 |
| drawCount | 1 |
| detailedMatchCount | 12 |
| policyCount | 12 |
| mechanicCount | 126 |
| synergyCount | 0 |
| motifCount | 60 |
| anomalyCount | 30 |

## Policy Findings

### control

- **Win rate:** 28.6% (6/21 games, CI [0.138, 0.500])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=14.857, responseUse=6.571, advancedFrequency=2.667

### hybrix-baseline

- **Win rate:** 87.5% (7/8 games, CI [0.529, 0.978])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, short matches
- **Fingerprint:** scoreAggression=6.500, responseUse=2.000, advancedFrequency=1.250

### hybrix-defender

- **Win rate:** 20.0% (4/20 games, CI [0.081, 0.416])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=14.000, responseUse=5.950, advancedFrequency=2.950

### hybrix-rusher

- **Win rate:** 65.0% (13/20 games, CI [0.433, 0.819])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=6.900, responseUse=1.500, advancedFrequency=0.650

### hybrix-sniper

- **Win rate:** 83.3% (10/12 games, CI [0.552, 0.953])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=9.417, responseUse=2.000, advancedFrequency=1.750

### hybrix-support

- **Win rate:** 87.5% (7/8 games, CI [0.529, 0.978])
- **Key traits:** high action frequency, response-heavy, conservative with responses, advanced-heavy, ultra-heavy, voltage-heavy
- **Fingerprint:** scoreAggression=7.375, responseUse=2.125, advancedFrequency=1.750

### hybrix-tank

- **Win rate:** 37.5% (3/8 games, CI [0.137, 0.694])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=17.375, responseUse=7.625, advancedFrequency=3.750

### hybrix-trickster

- **Win rate:** 65.0% (13/20 games, CI [0.433, 0.819])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=10.050, responseUse=2.200, advancedFrequency=1.700

### random-legal

- **Win rate:** 19.0% (4/21 games, CI [0.077, 0.400])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=14.905, responseUse=6.286, advancedFrequency=2.333

### score-rush

- **Win rate:** 42.9% (9/21 games, CI [0.245, 0.635])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=5.429, responseUse=1.333, advancedFrequency=0.810

### tempo

- **Win rate:** 42.9% (9/21 games, CI [0.245, 0.635])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=9.143, responseUse=1.857, advancedFrequency=1.476

### value

- **Win rate:** 70.0% (14/20 games, CI [0.481, 0.855])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=6.300, responseUse=1.300, advancedFrequency=1.100

## Mechanic Findings

| Mechanic | Usage Rate | Sample | Association | Grade | Status |
|----------|-----------|--------|-------------|-------|--------|
| 2-black-2-red-draw | 34.0% | 68 | -0.056 | INSUFFICIENT | measured |
| 2-black-2-red-rummage | 6.5% | 13 | 0.288 | INSUFFICIENT | measured |
| ace | 5.5% | 11 | -0.048 | INSUFFICIENT | measured |
| ace-anchor | 3.5% | 7 | -0.074 | INSUFFICIENT | measured |
| ace-base | 13.0% | 26 | 0.023 | INSUFFICIENT | measured |
| ace-spade | 7.5% | 15 | -0.231 | INSUFFICIENT | measured |
| anchor | 20.5% | 41 | -0.094 | INSUFFICIENT | measured |
| anchor-private-choice | 6.0% | 12 | -0.048 | INSUFFICIENT | measured |
| attachment | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| board-lock | 15.5% | 31 | -0.393 | INSUFFICIENT | measured |
| bounce-top | 10.5% | 21 | -0.278 | INSUFFICIENT | measured |
| clear-er | 1.5% | 3 | -0.505 | INSUFFICIENT | measured |
| clear-pr | 3.5% | 7 | -0.222 | INSUFFICIENT | measured |
| club-foundation | 15.0% | 30 | 0.118 | INSUFFICIENT | measured |
| club-foundation-bonus | 6.0% | 12 | 0.048 | INSUFFICIENT | measured |
| counter | 29.5% | 59 | -0.037 | INSUFFICIENT | measured |
| deep-draw | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| deep-draw-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| diamond-mimic-paired-row-exchange-pr | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| diamond-mimic-row-exchange-er | 7.5% | 15 | -0.397 | INSUFFICIENT | measured |
| diamond-mimic-row-exchange-pr | 4.5% | 9 | -0.130 | INSUFFICIENT | measured |
| disrupt | 45.0% | 90 | -0.031 | INSUFFICIENT | measured |
| draw | 77.0% | 154 | -0.142 | INSUFFICIENT | measured |
| effect-ace | 3.0% | 6 | 0.172 | INSUFFICIENT | measured |
| effect-four | 10.5% | 21 | -0.167 | INSUFFICIENT | measured |
| effect-private-choice | 22.0% | 44 | -0.181 | INSUFFICIENT | measured |
| effect-red-joker | 6.5% | 13 | -0.177 | INSUFFICIENT | measured |
| effect-three | 10.5% | 21 | -0.278 | INSUFFICIENT | measured |
| eight-aegis-field | 20.5% | 41 | -0.112 | INSUFFICIENT | measured |
| eight-scuttle | 1.5% | 3 | 0.508 | INSUFFICIENT | measured |
| eight-spade-free-scuttle | 6.5% | 13 | 0.041 | INSUFFICIENT | measured |
| exhausted-pass | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| face-down | 54.5% | 109 | 0.010 | INSUFFICIENT | measured |
| face-up-draw | 14.0% | 28 | -0.125 | INSUFFICIENT | measured |
| five-gy-bottom | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| five-recycle | 6.5% | 13 | -0.266 | INSUFFICIENT | measured |
| five-refine | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |
| four-exchange-er | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-exchange-pr | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-10-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-3-♦ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-4-♥ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-5-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-8-♥ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| four-guess-A-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-A-♣ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-J-♠ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| four-guess-K-♦ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-Q-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♣ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♦ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-pr-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-row-clear-pr-♥ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-row-clear-pr-♦ | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| hand-swap | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| heart-tempo | 9.0% | 18 | 0.122 | INSUFFICIENT | measured |
| jack | 45.0% | 90 | -0.031 | INSUFFICIENT | measured |
| jack-pr | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| jack-tempo | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| king | 14.0% | 28 | -0.107 | INSUFFICIENT | measured |
| king-anchor | 4.0% | 8 | 0.000 | INSUFFICIENT | measured |
| king-spade | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| nine | 6.0% | 12 | -0.048 | INSUFFICIENT | measured |
| nine-anchor-discard | 3.0% | 6 | -0.172 | INSUFFICIENT | measured |
| nine-tap | 21.5% | 43 | -0.193 | INSUFFICIENT | measured |
| opponent-attack | 4.0% | 8 | -0.222 | INSUFFICIENT | measured |
| purge-aegis | 1.5% | 3 | -0.169 | INSUFFICIENT | measured |
| purge-anchor-bounce | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| queen | 5.0% | 10 | 0.000 | INSUFFICIENT | measured |
| queen-aegis | 18.0% | 36 | -0.087 | INSUFFICIENT | measured |
| rank10 | 33.0% | 66 | -0.034 | INSUFFICIENT | measured |
| rank10-stack-theft | 4.5% | 9 | 0.175 | INSUFFICIENT | measured |
| rank3-discard | 2.5% | 5 | -0.103 | INSUFFICIENT | measured |
| rank3-present | 2.0% | 4 | 0.169 | INSUFFICIENT | measured |
| rank3-take | 1.5% | 3 | -0.505 | INSUFFICIENT | measured |
| rank5-rummage | 6.5% | 13 | -0.266 | INSUFFICIENT | measured |
| rank6-keep-all-discard | 3.0% | 6 | -0.172 | INSUFFICIENT | measured |
| rank6-keep-return-bottom | 11.0% | 22 | -0.167 | INSUFFICIENT | measured |
| rank6-keep-return-top | 4.0% | 8 | 0.000 | INSUFFICIENT | measured |
| rank7-generated-ace-anchor | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-generated-four-row-clear | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-generated-king-anchor | 1.0% | 2 | -0.503 | INSUFFICIENT | measured |
| rank7-generated-score | 0.5% | 1 | N/A | INSUFFICIENT | measured |
| rank7-generated-unavailable | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-hand-and-effect | 2.5% | 5 | -0.510 | INSUFFICIENT | measured |
| rank7-hand-and-score | 5.5% | 11 | 0.316 | INSUFFICIENT | measured |
| recycle-five-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| recycle-five-♣ | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| royal-marriage | 2.0% | 4 | -0.508 | INSUFFICIENT | measured |
| score | 79.5% | 159 | 0.527 | INSUFFICIENT | measured |
| scuttle | 20.0% | 40 | -0.195 | INSUFFICIENT | measured |
| self-reset | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| seven-topdeck | 10.0% | 20 | 0.000 | INSUFFICIENT | measured |
| shuffle-reset | 1.5% | 3 | -0.169 | INSUFFICIENT | measured |
| six-dig | 16.0% | 32 | -0.196 | INSUFFICIENT | measured |
| solo-wild | 6.0% | 12 | -0.089 | INSUFFICIENT | measured |
| spade-recovery | 5.0% | 10 | -0.058 | INSUFFICIENT | measured |
| super | 4.5% | 9 | -0.175 | INSUFFICIENT | measured |
| super-ace | 6.0% | 12 | -0.089 | INSUFFICIENT | measured |
| swap-bar | 56.5% | 113 | 0.010 | INSUFFICIENT | measured |
| three-black-ace | 2.5% | 5 | -0.103 | INSUFFICIENT | measured |
| three-black-bounce-top | 3.5% | 7 | 0.000 | INSUFFICIENT | measured |
| three-black-clear-er | 2.5% | 5 | 0.103 | INSUFFICIENT | measured |
| three-black-clear-pr | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| three-black-jack-pr | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| three-black-king | 2.5% | 5 | -0.308 | INSUFFICIENT | measured |
| three-black-purge-aegis | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| three-black-queen | 2.5% | 5 | -0.308 | INSUFFICIENT | measured |
| three-bounce-♠ | 1.5% | 3 | -0.169 | INSUFFICIENT | measured |
| three-bounce-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| three-bounce-♥ | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| three-force-discard | 3.0% | 6 | 0.000 | INSUFFICIENT | measured |
| three-hand | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| three-points | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| three-present-take | 3.5% | 7 | -0.172 | INSUFFICIENT | measured |
| three-red-counter | 42.5% | 85 | 0.073 | INSUFFICIENT | measured |
| topdeck-seven-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| topdeck-seven-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| topdeck-seven-♦ | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| total-clear | 8.0% | 16 | -0.180 | INSUFFICIENT | measured |
| total-clear-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| two-hold | 2.5% | 5 | -0.308 | INSUFFICIENT | measured |
| ultra | 83.5% | 167 | -0.018 | INSUFFICIENT | measured |
| voltage | 5.5% | 11 | 0.048 | INSUFFICIENT | measured |
| wild-sovereignty | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |

<details><summary><b>2-black-2-red-draw</b></summary>

Used in 34.0% of participant observations (68/200). Outcome association: negative (-0.056, CI [-0.203, 0.090]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2516be2abfc3a4189b0b, M-6e405bd305ad3a8842b2, M-7c636f8f05e92aaa46d0, M-2c387191f87b601ea38b
</details>

<details><summary><b>2-black-2-red-rummage</b></summary>

Used in 6.5% of participant observations (13/200). Outcome association: positive (0.288, CI [0.048, 0.528]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-af613f3d635a9a9871dc, M-810f3ab0b42b3ae7412e, M-0d9c75ceaf31b3366b98, M-6dee115328a2f775aae6
</details>

<details><summary><b>ace</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: negative (-0.048, CI [-0.351, 0.255]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-2c387191f87b601ea38b, M-db1a7c5a8d04a411be38, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>ace-anchor</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.074, CI [-0.447, 0.299]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-14c08c9e7054d254f746, M-819cbc6e80612c370cca, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>ace-base</b></summary>

Used in 13.0% of participant observations (26/200). Outcome association: positive (0.023, CI [-0.187, 0.232]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2516be2abfc3a4189b0b, M-dfe81443257b324657ca, M-7c636f8f05e92aaa46d0, M-2688a4a154363a6767bf
</details>

<details><summary><b>ace-spade</b></summary>

Used in 7.5% of participant observations (15/200). Outcome association: negative (-0.231, CI [-0.478, 0.017]). Immediate point impact: mean 5.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-54db7c3beb97fdd5e766, M-7c636f8f05e92aaa46d0, M-6dee115328a2f775aae6
</details>

<details><summary><b>anchor</b></summary>

Used in 20.5% of participant observations (41/200). Outcome association: negative (-0.094, CI [-0.266, 0.078]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-54db7c3beb97fdd5e766, M-db1a7c5a8d04a411be38, M-2c387191f87b601ea38b
</details>

<details><summary><b>anchor-private-choice</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (-0.048, CI [-0.351, 0.255]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-3f06d7f4cfd593ad7365, M-a5c54bedb1d6ece158bc, M-e4875f3be5bec9be1782
</details>

<details><summary><b>attachment</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-fa500a672d37de80d9d3, M-767b191b1e8222dcfc0f, M-a5c54bedb1d6ece158bc, M-e18eeb49aff85674904b
</details>

<details><summary><b>board-lock</b></summary>

Used in 15.5% of participant observations (31/200). Outcome association: negative (-0.393, CI [-0.546, -0.240]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-0399a2ffce7ace60f207, M-e78e8c574d64f511e8b3, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>bounce-top</b></summary>

Used in 10.5% of participant observations (21/200). Outcome association: negative (-0.278, CI [-0.482, -0.075]). Immediate point impact: mean -5.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-e4875f3be5bec9be1782, M-e78e8c574d64f511e8b3, M-42d2dd7c46281c1e8e61
</details>

<details><summary><b>clear-er</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-0399a2ffce7ace60f207, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>clear-pr</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.222, CI [-0.564, 0.120]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-b900d83e98e6680b0589, M-db1a7c5a8d04a411be38, M-fa500a672d37de80d9d3
</details>

<details><summary><b>club-foundation</b></summary>

Used in 15.0% of participant observations (30/200). Outcome association: positive (0.118, CI [-0.073, 0.309]). Immediate point impact: mean 4.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-dfe81443257b324657ca, M-ec8c17a731cdf4766961, M-14c08c9e7054d254f746
</details>

<details><summary><b>club-foundation-bonus</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: positive (0.048, CI [-0.255, 0.351]). Immediate point impact: mean 4.25 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-9b182806ed3ffa95a472, M-a5c54bedb1d6ece158bc, M-e18eeb49aff85674904b
</details>

<details><summary><b>counter</b></summary>

Used in 29.5% of participant observations (59/200). Outcome association: negative (-0.037, CI [-0.191, 0.117]). Immediate point impact: mean 2.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2516be2abfc3a4189b0b, M-dfe81443257b324657ca, M-7c636f8f05e92aaa46d0, M-b99195b524b9bbddee43
</details>

<details><summary><b>deep-draw</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-fa500a672d37de80d9d3
</details>

<details><summary><b>deep-draw-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-e18eeb49aff85674904b
</details>

<details><summary><b>diamond-mimic-paired-row-exchange-pr</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-e4875f3be5bec9be1782
</details>

<details><summary><b>diamond-mimic-row-exchange-er</b></summary>

Used in 7.5% of participant observations (15/200). Outcome association: negative (-0.397, CI [-0.583, -0.210]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-b900d83e98e6680b0589, M-819cbc6e80612c370cca, M-810f3ab0b42b3ae7412e
</details>

<details><summary><b>diamond-mimic-row-exchange-pr</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: negative (-0.130, CI [-0.473, 0.213]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-af613f3d635a9a9871dc, M-54db7c3beb97fdd5e766, M-e78e8c574d64f511e8b3, M-0399a2ffce7ace60f207
</details>

<details><summary><b>disrupt</b></summary>

Used in 45.0% of participant observations (90/200). Outcome association: negative (-0.031, CI [-0.171, 0.109]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2516be2abfc3a4189b0b, M-13dd6adfbfad8f9c5ea8, M-7c636f8f05e92aaa46d0, M-2c058833d0cab8a83b36
</details>

<details><summary><b>draw</b></summary>

Used in 77.0% of participant observations (154/200). Outcome association: negative (-0.142, CI [-0.303, 0.020]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2516be2abfc3a4189b0b, M-13dd6adfbfad8f9c5ea8, M-7c636f8f05e92aaa46d0, M-2c058833d0cab8a83b36
</details>

<details><summary><b>effect-ace</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.172, CI [-0.212, 0.556]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-ca2dc7f0beba13b1e26d, M-a5c54bedb1d6ece158bc, M-54db7c3beb97fdd5e766
</details>

<details><summary><b>effect-four</b></summary>

Used in 10.5% of participant observations (21/200). Outcome association: negative (-0.167, CI [-0.388, 0.055]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-d7aca02b558eda3bb3ce, M-7c636f8f05e92aaa46d0, M-b99195b524b9bbddee43
</details>

<details><summary><b>effect-private-choice</b></summary>

Used in 22.0% of participant observations (44/200). Outcome association: negative (-0.181, CI [-0.346, -0.017]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-f40ee35c21df7437175a, M-7c636f8f05e92aaa46d0, M-e18eeb49aff85674904b
</details>

<details><summary><b>effect-red-joker</b></summary>

Used in 6.5% of participant observations (13/200). Outcome association: negative (-0.177, CI [-0.454, 0.099]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-d7aca02b558eda3bb3ce, M-a5c54bedb1d6ece158bc, M-2c058833d0cab8a83b36
</details>

<details><summary><b>effect-three</b></summary>

Used in 10.5% of participant observations (21/200). Outcome association: negative (-0.278, CI [-0.482, -0.075]). Immediate point impact: mean -5.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-e4875f3be5bec9be1782, M-e78e8c574d64f511e8b3, M-42d2dd7c46281c1e8e61
</details>

<details><summary><b>eight-aegis-field</b></summary>

Used in 20.5% of participant observations (41/200). Outcome association: negative (-0.112, CI [-0.285, 0.061]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-dfe81443257b324657ca, M-db1a7c5a8d04a411be38, M-b99195b524b9bbddee43
</details>

<details><summary><b>eight-scuttle</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.508, CI [0.438, 0.578]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6dee115328a2f775aae6, M-2c058833d0cab8a83b36, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>eight-spade-free-scuttle</b></summary>

Used in 6.5% of participant observations (13/200). Outcome association: positive (0.041, CI [-0.239, 0.322]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-d7aca02b558eda3bb3ce, M-db00406242aa588c413d, M-b99195b524b9bbddee43
</details>

<details><summary><b>exhausted-pass</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4f83e4902bf5c8b33228
</details>

<details><summary><b>face-down</b></summary>

Used in 54.5% of participant observations (109/200). Outcome association: positive (0.010, CI [-0.130, 0.150]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2dc606db06c2405f9f91, M-54db7c3beb97fdd5e766, M-7c636f8f05e92aaa46d0, M-13c2c14034fdbfbf3a37
</details>

<details><summary><b>face-up-draw</b></summary>

Used in 14.0% of participant observations (28/200). Outcome association: negative (-0.125, CI [-0.321, 0.071]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-e4875f3be5bec9be1782, M-db1a7c5a8d04a411be38, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>five-gy-bottom</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-af613f3d635a9a9871dc, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>five-recycle</b></summary>

Used in 6.5% of participant observations (13/200). Outcome association: negative (-0.266, CI [-0.521, -0.011]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-0399a2ffce7ace60f207, M-7c636f8f05e92aaa46d0, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>five-refine</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-af613f3d635a9a9871dc, M-6db13647ac8571e244c2, M-e4875f3be5bec9be1782
</details>

<details><summary><b>four-exchange-er</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-317e0a8bfd793db08483
</details>

<details><summary><b>four-exchange-pr</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ff6935d652fc5eed5d2e
</details>

<details><summary><b>four-guess-10-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>four-guess-3-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6db13647ac8571e244c2
</details>

<details><summary><b>four-guess-4-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dfe81443257b324657ca
</details>

<details><summary><b>four-guess-5-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>four-guess-8-♥</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dfe81443257b324657ca, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>four-guess-A-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dfe81443257b324657ca
</details>

<details><summary><b>four-guess-A-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-819cbc6e80612c370cca
</details>

<details><summary><b>four-guess-J-♠</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dfe81443257b324657ca, M-6db13647ac8571e244c2
</details>

<details><summary><b>four-guess-K-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dfe81443257b324657ca
</details>

<details><summary><b>four-guess-Q-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6db13647ac8571e244c2
</details>

<details><summary><b>four-row-clear-er-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>four-row-clear-er-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>four-row-clear-er-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2c058833d0cab8a83b36
</details>

<details><summary><b>four-row-clear-pr-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-cf1296dcf54913b1f236
</details>

<details><summary><b>four-row-clear-pr-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6
</details>

<details><summary><b>four-row-clear-pr-♦</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4f83e4902bf5c8b33228, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>hand-swap</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-3f06d7f4cfd593ad7365, M-2c058833d0cab8a83b36
</details>

<details><summary><b>heart-tempo</b></summary>

Used in 9.0% of participant observations (18/200). Outcome association: positive (0.122, CI [-0.115, 0.359]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-d05d8c1e4fca89aba5d7, M-a5c54bedb1d6ece158bc, M-b99195b524b9bbddee43
</details>

<details><summary><b>jack</b></summary>

Used in 45.0% of participant observations (90/200). Outcome association: negative (-0.031, CI [-0.171, 0.109]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2516be2abfc3a4189b0b, M-13dd6adfbfad8f9c5ea8, M-7c636f8f05e92aaa46d0, M-2c058833d0cab8a83b36
</details>

<details><summary><b>jack-pr</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-fa500a672d37de80d9d3, M-767b191b1e8222dcfc0f, M-a5c54bedb1d6ece158bc, M-e18eeb49aff85674904b
</details>

<details><summary><b>jack-tempo</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ec210a15b281dccc7eb6, M-810f3ab0b42b3ae7412e
</details>

<details><summary><b>king</b></summary>

Used in 14.0% of participant observations (28/200). Outcome association: negative (-0.107, CI [-0.307, 0.093]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-fa500a672d37de80d9d3, M-ec8c17a731cdf4766961, M-b99195b524b9bbddee43
</details>

<details><summary><b>king-anchor</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (0.000, CI [-0.354, 0.354]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-3f06d7f4cfd593ad7365, M-a5c54bedb1d6ece158bc, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>king-spade</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ec210a15b281dccc7eb6
</details>

<details><summary><b>nine</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (-0.048, CI [-0.351, 0.255]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-3f06d7f4cfd593ad7365, M-a5c54bedb1d6ece158bc, M-e4875f3be5bec9be1782
</details>

<details><summary><b>nine-anchor-discard</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.172, CI [-0.556, 0.212]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-af613f3d635a9a9871dc, M-bead709cd4f219321e60, M-4f83e4902bf5c8b33228, M-39106dfdfa58c1464a98
</details>

<details><summary><b>nine-tap</b></summary>

Used in 21.5% of participant observations (43/200). Outcome association: negative (-0.193, CI [-0.356, -0.030]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-54db7c3beb97fdd5e766, M-7c636f8f05e92aaa46d0, M-14c08c9e7054d254f746
</details>

<details><summary><b>opponent-attack</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (-0.222, CI [-0.564, 0.120]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-af613f3d635a9a9871dc, M-810f3ab0b42b3ae7412e, M-a5c54bedb1d6ece158bc, M-b30acfda6bb76eb9e35a
</details>

<details><summary><b>purge-aegis</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-ca2dc7f0beba13b1e26d, M-54db7c3beb97fdd5e766
</details>

<details><summary><b>purge-anchor-bounce</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-af613f3d635a9a9871dc, M-a5c54bedb1d6ece158bc, M-e4875f3be5bec9be1782
</details>

<details><summary><b>queen</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (0.000, CI [-0.318, 0.318]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ca2dc7f0beba13b1e26d, M-810f3ab0b42b3ae7412e, M-819cbc6e80612c370cca, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>queen-aegis</b></summary>

Used in 18.0% of participant observations (36/200). Outcome association: negative (-0.087, CI [-0.268, 0.094]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-f4ecfe366f987ad15764, M-0d9c75ceaf31b3366b98, M-1a2762234dcaa74115c8
</details>

<details><summary><b>rank10</b></summary>

Used in 33.0% of participant observations (66/200). Outcome association: negative (-0.034, CI [-0.183, 0.114]). Immediate point impact: mean 3.36 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-d05d8c1e4fca89aba5d7, M-e78e8c574d64f511e8b3, M-767b191b1e8222dcfc0f
</details>

<details><summary><b>rank10-stack-theft</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: positive (0.175, CI [-0.142, 0.491]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bead709cd4f219321e60, M-9965cd47f12b13d5be41, M-db1a7c5a8d04a411be38, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>rank3-discard</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.103, CI [-0.538, 0.333]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-fa500a672d37de80d9d3, M-a5c54bedb1d6ece158bc, M-e18eeb49aff85674904b
</details>

<details><summary><b>rank3-present</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-0399a2ffce7ace60f207, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>rank3-take</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-0399a2ffce7ace60f207, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>rank5-rummage</b></summary>

Used in 6.5% of participant observations (13/200). Outcome association: negative (-0.266, CI [-0.521, -0.011]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-0399a2ffce7ace60f207, M-7c636f8f05e92aaa46d0, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>rank6-keep-all-discard</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.172, CI [-0.556, 0.212]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-cf1296dcf54913b1f236, M-0d9c75ceaf31b3366b98, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>rank6-keep-return-bottom</b></summary>

Used in 11.0% of participant observations (22/200). Outcome association: negative (-0.167, CI [-0.388, 0.055]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-810f3ab0b42b3ae7412e, M-db1a7c5a8d04a411be38, M-b99195b524b9bbddee43
</details>

<details><summary><b>rank6-keep-return-top</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (0.000, CI [-0.354, 0.354]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-fa500a672d37de80d9d3, M-a5c54bedb1d6ece158bc, M-810f3ab0b42b3ae7412e
</details>

<details><summary><b>rank7-generated-ace-anchor</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0d9c75ceaf31b3366b98
</details>

<details><summary><b>rank7-generated-four-row-clear</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-af613f3d635a9a9871dc
</details>

<details><summary><b>rank7-generated-king-anchor</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-39106dfdfa58c1464a98, M-0399a2ffce7ace60f207
</details>

<details><summary><b>rank7-generated-score</b></summary>

Used in 0.5% of participant observations (1/200). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0399a2ffce7ace60f207
</details>

<details><summary><b>rank7-generated-unavailable</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4c809be83d9614517f25
</details>

<details><summary><b>rank7-hand-and-effect</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.510, CI [-0.581, -0.440]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-af613f3d635a9a9871dc, M-39106dfdfa58c1464a98, M-0d9c75ceaf31b3366b98, M-0399a2ffce7ace60f207
</details>

<details><summary><b>rank7-hand-and-score</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: positive (0.316, CI [0.058, 0.574]). Immediate point impact: mean 4.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bead709cd4f219321e60, M-b99195b524b9bbddee43, M-e78e8c574d64f511e8b3, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>recycle-five-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>recycle-five-♣</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>royal-marriage</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.508, CI [-0.578, -0.438]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-86f55758148090f8418c, M-0399a2ffce7ace60f207, M-f40ee35c21df7437175a
</details>

<details><summary><b>score</b></summary>

Used in 79.5% of participant observations (159/200). Outcome association: positive (0.527, CI [0.414, 0.640]). Immediate point impact: mean 2.97 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2dc606db06c2405f9f91, M-cc98c232170da69e3669, M-7c636f8f05e92aaa46d0, M-767b191b1e8222dcfc0f
</details>

<details><summary><b>scuttle</b></summary>

Used in 20.0% of participant observations (40/200). Outcome association: negative (-0.195, CI [-0.365, -0.026]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2516be2abfc3a4189b0b, M-e4875f3be5bec9be1782, M-7c636f8f05e92aaa46d0, M-2c058833d0cab8a83b36
</details>

<details><summary><b>self-reset</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-cf1296dcf54913b1f236
</details>

<details><summary><b>seven-topdeck</b></summary>

Used in 10.0% of participant observations (20/200). Outcome association: negative (0.000, CI [-0.242, 0.242]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-af613f3d635a9a9871dc, M-0399a2ffce7ace60f207, M-e78e8c574d64f511e8b3, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>shuffle-reset</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-810f3ab0b42b3ae7412e, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>six-dig</b></summary>

Used in 16.0% of participant observations (32/200). Outcome association: negative (-0.196, CI [-0.381, -0.012]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-e4875f3be5bec9be1782, M-db1a7c5a8d04a411be38, M-b99195b524b9bbddee43
</details>

<details><summary><b>solo-wild</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (-0.089, CI [-0.377, 0.199]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-6e405bd305ad3a8842b2, M-a5c54bedb1d6ece158bc, M-e18eeb49aff85674904b
</details>

<details><summary><b>spade-recovery</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (-0.058, CI [-0.391, 0.274]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-13dd6adfbfad8f9c5ea8, M-4f83e4902bf5c8b33228, M-810f3ab0b42b3ae7412e
</details>

<details><summary><b>super</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: negative (-0.175, CI [-0.491, 0.142]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-54db7c3beb97fdd5e766, M-ff6935d652fc5eed5d2e, M-9965cd47f12b13d5be41
</details>

<details><summary><b>super-ace</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (-0.089, CI [-0.377, 0.199]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6ea2acd7f3b5fb1f2561, M-6e405bd305ad3a8842b2, M-e78e8c574d64f511e8b3, M-b99195b524b9bbddee43
</details>

<details><summary><b>swap-bar</b></summary>

Used in 56.5% of participant observations (113/200). Outcome association: positive (0.010, CI [-0.130, 0.151]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2dc606db06c2405f9f91, M-54db7c3beb97fdd5e766, M-7c636f8f05e92aaa46d0, M-13c2c14034fdbfbf3a37
</details>

<details><summary><b>three-black-ace</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.103, CI [-0.538, 0.333]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8495c9c687c521492050, M-14c08c9e7054d254f746, M-ff6935d652fc5eed5d2e, M-31d6e5a6f7d11b406b12
</details>

<details><summary><b>three-black-bounce-top</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (0.000, CI [-0.406, 0.406]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ca2dc7f0beba13b1e26d, M-d17c8f9f219fa47920c9, M-ab3fca9d3a612ae31a29, M-810f3ab0b42b3ae7412e
</details>

<details><summary><b>three-black-clear-er</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.103, CI [-0.333, 0.538]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-215d8e92f73a10e4e662, M-e4875f3be5bec9be1782, M-db1a7c5a8d04a411be38, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>three-black-clear-pr</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-d9c02e7b42767a19bfbb
</details>

<details><summary><b>three-black-jack-pr</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-d0ba30aa7ccfce667588, M-dfe81443257b324657ca
</details>

<details><summary><b>three-black-king</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.308, CI [-0.665, 0.050]). Immediate point impact: mean 1.50 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-daa7558a859f7187a9dd, M-2c387191f87b601ea38b, M-0d9c75ceaf31b3366b98, M-2c058833d0cab8a83b36
</details>

<details><summary><b>three-black-purge-aegis</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-39106dfdfa58c1464a98
</details>

<details><summary><b>three-black-queen</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.308, CI [-0.665, 0.050]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ccaa89b6c12ab7982c9b, M-13dd6adfbfad8f9c5ea8, M-2688a4a154363a6767bf, M-810f3ab0b42b3ae7412e
</details>

<details><summary><b>three-bounce-♠</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-af613f3d635a9a9871dc, M-4f83e4902bf5c8b33228, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>three-bounce-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>three-bounce-♥</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-b99195b524b9bbddee43, M-4f83e4902bf5c8b33228
</details>

<details><summary><b>three-force-discard</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (0.000, CI [-0.406, 0.406]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-810f3ab0b42b3ae7412e, M-a5c54bedb1d6ece158bc, M-e18eeb49aff85674904b
</details>

<details><summary><b>three-hand</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-d0ba30aa7ccfce667588, M-2c387191f87b601ea38b, M-db1a7c5a8d04a411be38
</details>

<details><summary><b>three-points</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-db1a7c5a8d04a411be38
</details>

<details><summary><b>three-present-take</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.172, CI [-0.556, 0.212]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-bead709cd4f219321e60, M-a5c54bedb1d6ece158bc, M-e4875f3be5bec9be1782
</details>

<details><summary><b>three-red-counter</b></summary>

Used in 42.5% of participant observations (85/200). Outcome association: positive (0.073, CI [-0.068, 0.213]). Immediate point impact: mean 1.67 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2dc606db06c2405f9f91, M-f4ecfe366f987ad15764, M-43557da9ff61b06b4a97, M-13c2c14034fdbfbf3a37
</details>

<details><summary><b>topdeck-seven-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bead709cd4f219321e60
</details>

<details><summary><b>topdeck-seven-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6e405bd305ad3a8842b2
</details>

<details><summary><b>topdeck-seven-♦</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-cf1296dcf54913b1f236, M-a5c54bedb1d6ece158bc
</details>

<details><summary><b>total-clear</b></summary>

Used in 8.0% of participant observations (16/200). Outcome association: negative (-0.180, CI [-0.430, 0.069]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-13dd6adfbfad8f9c5ea8, M-7c636f8f05e92aaa46d0, M-b99195b524b9bbddee43
</details>

<details><summary><b>total-clear-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-7b5f7e5ec08d50cb3b6f
</details>

<details><summary><b>two-hold</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.308, CI [-0.665, 0.050]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-54db7c3beb97fdd5e766, M-506366a0ae72fba32d23, M-9965cd47f12b13d5be41
</details>

<details><summary><b>ultra</b></summary>

Used in 83.5% of participant observations (167/200). Outcome association: negative (-0.018, CI [-0.205, 0.169]). Immediate point impact: mean 0.50 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-2dc606db06c2405f9f91, M-bad0c69ab23edbca3d7b, M-7c636f8f05e92aaa46d0, M-e18eeb49aff85674904b
</details>

<details><summary><b>voltage</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: positive (0.048, CI [-0.255, 0.351]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-e4875f3be5bec9be1782, M-db1a7c5a8d04a411be38, M-2c387191f87b601ea38b
</details>

<details><summary><b>wild-sovereignty</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f83c09f46625d67047c6, M-fa500a672d37de80d9d3
</details>

## Synergy Findings

| Pair | Class | Effect | Shrunk | q-value | Status |
|------|-------|--------|--------|---------|--------|

## Causal Motifs

- **score → score** — 38 occurrence(s), 11 matches
- **unclassified → score** — 29 occurrence(s), 12 matches
- **unclassified → unclassified** — 23 occurrence(s), 7 matches
- **face-down → unclassified** — 19 occurrence(s), 11 matches
- **score → unclassified** — 18 occurrence(s), 8 matches
- **unclassified → 2-black-2-red-draw** — 13 occurrence(s), 8 matches
- **2-black-2-red-draw → score** — 6 occurrence(s), 4 matches
- **score → face-down** — 5 occurrence(s), 4 matches
- **unclassified → draw** — 5 occurrence(s), 5 matches
- **draw → unclassified** — 4 occurrence(s), 4 matches
- **2-black-2-red-draw → disrupt** — 3 occurrence(s), 3 matches
- **disrupt → score** — 3 occurrence(s), 3 matches
- **disrupt → unclassified** — 3 occurrence(s), 3 matches
- **2-black-2-red-rummage → unclassified** — 2 occurrence(s), 2 matches
- **club-foundation → club-foundation** — 2 occurrence(s), 2 matches
- **club-foundation → unclassified** — 2 occurrence(s), 2 matches
- **club-foundation-bonus → unclassified** — 2 occurrence(s), 2 matches
- **disrupt → disrupt** — 2 occurrence(s), 1 matches
- **draw → disrupt** — 2 occurrence(s), 2 matches
- **heart-tempo → unclassified** — 2 occurrence(s), 2 matches

## Anomalies

30 anomaly/anomalies: ORCHESTRATION_DENSITY (20), LONG_MATCH (5), RESPONSE_CHAIN_INTENSITY (5).

- ORCHESTRATION_DENSITY: 20
- LONG_MATCH: 5
- RESPONSE_CHAIN_INTENSITY: 5

## Recommendations

- 98 mechanic(s) have sample size below 20 — interpret with caution.

## Interpretation Boundary

Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.

