# Mechanics Observatory — AI Agent Extract

**Extract version:** 1.0.0
**Analytics schema:** 4.2.0
**Source hash:** `9bcbb4b9e8ee8dc0989676456972c8461fc45434ecec482a3c5b3433ba200333`
**Aggregate hash:** `b69e06b237c3d0482ac2a9aa96e445e520a6e7d84b9984ccae5677902953fcd9`
**Extract hash:** `67d00f47d610e7d7aa5ae876cdaceddf7e7b0ff9b403434ebace428fa1220ee6`

## Executive Summary

Analysis covers 100 Advanced Core matches under Engine v4.2.6 / Rules v4.2.0. All matches completed without aborts. Highest win rate: hybrix-sniper at 66.7% (CI [0.391, 0.862], 12 games). No synergy pairs reached statistical significance after FDR correction. 115 mechanic(s) measured with evidence-backed associations. 37 anomaly/anomalies flagged (0 critical, 6 warning, 31 info). Data completeness: PASS (no unclassified facts). Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.

## Dataset

| Metric | Value |
|--------|-------|
| matchCount | 100 |
| completedMatchCount | 100 |
| abortCount | 0 |
| drawCount | 2 |
| detailedMatchCount | 12 |
| policyCount | 12 |
| mechanicCount | 115 |
| synergyCount | 3 |
| motifCount | 55 |
| anomalyCount | 37 |

## Policy Findings

### control

- **Win rate:** 23.8% (5/21 games, CI [0.106, 0.451])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=15.571, responseUse=7.238, advancedFrequency=2.619

### hybrix-baseline

- **Win rate:** 62.5% (5/8 games, CI [0.306, 0.863])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=8.875, responseUse=1.500, advancedFrequency=1.625

### hybrix-defender

- **Win rate:** 25.0% (5/20 games, CI [0.112, 0.469])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=15.950, responseUse=6.100, advancedFrequency=3.300

### hybrix-rusher

- **Win rate:** 65.0% (13/20 games, CI [0.433, 0.819])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=8.800, responseUse=1.750, advancedFrequency=0.500

### hybrix-sniper

- **Win rate:** 66.7% (8/12 games, CI [0.391, 0.862])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=8.583, responseUse=2.167, advancedFrequency=0.917

### hybrix-support

- **Win rate:** 50.0% (4/8 games, CI [0.215, 0.785])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=14.125, responseUse=5.375, advancedFrequency=2.875

### hybrix-tank

- **Win rate:** 62.5% (5/8 games, CI [0.306, 0.863])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=20.125, responseUse=8.625, advancedFrequency=4.125

### hybrix-trickster

- **Win rate:** 65.0% (13/20 games, CI [0.433, 0.819])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=10.550, responseUse=2.650, advancedFrequency=1.650

### random-legal

- **Win rate:** 28.6% (6/21 games, CI [0.138, 0.500])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=12.952, responseUse=5.952, advancedFrequency=2.667

### score-rush

- **Win rate:** 52.4% (11/21 games, CI [0.324, 0.717])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=6.476, responseUse=1.524, advancedFrequency=0.714

### tempo

- **Win rate:** 52.4% (11/21 games, CI [0.324, 0.717])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=6.810, responseUse=2.238, advancedFrequency=1.524

### value

- **Win rate:** 60.0% (12/20 games, CI [0.387, 0.781])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=7.700, responseUse=1.200, advancedFrequency=1.200

## Mechanic Findings

| Mechanic | Usage Rate | Sample | Association | Grade | Status |
|----------|-----------|--------|-------------|-------|--------|
| 2-black-2-red-draw | 31.0% | 62 | -0.107 | INSUFFICIENT | measured |
| 2-black-2-red-rummage | 5.5% | 11 | -0.048 | INSUFFICIENT | measured |
| ace | 6.5% | 13 | -0.288 | INSUFFICIENT | measured |
| ace-anchor | 6.5% | 13 | 0.041 | INSUFFICIENT | measured |
| ace-base | 13.0% | 26 | 0.115 | INSUFFICIENT | measured |
| ace-spade | 7.0% | 14 | 0.154 | INSUFFICIENT | measured |
| anchor | 21.5% | 43 | -0.262 | INSUFFICIENT | measured |
| anchor-private-choice | 3.0% | 6 | 0.103 | INSUFFICIENT | measured |
| board-lock | 12.5% | 25 | -0.025 | INSUFFICIENT | measured |
| bounce-top | 13.0% | 26 | -0.095 | INSUFFICIENT | measured |
| clear-er | 2.5% | 5 | -0.103 | INSUFFICIENT | measured |
| clear-pr | 3.0% | 6 | -0.103 | INSUFFICIENT | measured |
| club-foundation | 17.5% | 35 | 0.178 | INSUFFICIENT | measured |
| club-foundation-bonus | 7.0% | 14 | 0.041 | INSUFFICIENT | measured |
| counter | 32.5% | 65 | 0.189 | INSUFFICIENT | measured |
| deep-draw-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| diamond-mimic-paired-super-j-tempo | 2.5% | 5 | -0.103 | INSUFFICIENT | measured |
| diamond-mimic-row-exchange-er | 2.5% | 5 | 0.000 | INSUFFICIENT | measured |
| diamond-mimic-row-exchange-pr | 5.0% | 10 | -0.105 | INSUFFICIENT | measured |
| disrupt | 48.5% | 97 | -0.051 | INSUFFICIENT | measured |
| draw | 78.5% | 157 | -0.253 | INSUFFICIENT | measured |
| effect-ace | 4.5% | 9 | 0.074 | INSUFFICIENT | measured |
| effect-four | 12.0% | 24 | -0.027 | INSUFFICIENT | measured |
| effect-private-choice | 23.5% | 47 | -0.194 | INSUFFICIENT | measured |
| effect-red-joker | 4.0% | 8 | 0.074 | INSUFFICIENT | measured |
| effect-three | 13.0% | 26 | -0.095 | INSUFFICIENT | measured |
| eight-aegis-field | 25.0% | 50 | -0.182 | INSUFFICIENT | measured |
| eight-scuttle | 2.5% | 5 | 0.255 | INSUFFICIENT | measured |
| eight-spade-free-scuttle | 12.0% | 24 | -0.047 | INSUFFICIENT | measured |
| exhausted-pass | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| face-down | 54.5% | 109 | 0.051 | INSUFFICIENT | measured |
| face-up-draw | 14.0% | 28 | -0.177 | INSUFFICIENT | measured |
| five-gy-bottom | 2.5% | 5 | -0.103 | INSUFFICIENT | measured |
| five-recycle | 5.0% | 10 | -0.291 | INSUFFICIENT | measured |
| five-refine | 3.0% | 6 | 0.172 | INSUFFICIENT | measured |
| four-guess-4-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-4-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-7-♦ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-A-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-K-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-Q-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-guess-Q-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-er | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♣ | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| four-row-clear-er-♦ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| heart-tempo | 13.0% | 26 | -0.069 | INSUFFICIENT | measured |
| jack | 48.5% | 97 | -0.051 | INSUFFICIENT | measured |
| king | 18.5% | 37 | -0.296 | INSUFFICIENT | measured |
| king-anchor | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| king-spade | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| nine | 3.0% | 6 | 0.103 | INSUFFICIENT | measured |
| nine-anchor-discard | 3.5% | 7 | -0.172 | INSUFFICIENT | measured |
| nine-tap | 27.5% | 55 | -0.194 | INSUFFICIENT | measured |
| opponent-attack | 4.0% | 8 | 0.074 | INSUFFICIENT | measured |
| purge-aegis | 1.5% | 3 | 0.508 | INSUFFICIENT | measured |
| purge-anchor-bounce | 3.0% | 6 | -0.255 | INSUFFICIENT | measured |
| queen | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| queen-aegis | 17.0% | 34 | -0.164 | INSUFFICIENT | measured |
| rank10 | 37.5% | 75 | 0.055 | INSUFFICIENT | measured |
| rank10-stack-theft | 5.5% | 11 | 0.144 | INSUFFICIENT | measured |
| rank3-discard | 1.5% | 3 | 0.169 | INSUFFICIENT | measured |
| rank3-present | 3.5% | 7 | 0.222 | INSUFFICIENT | measured |
| rank3-take | 3.0% | 6 | -0.344 | INSUFFICIENT | measured |
| rank5-rummage | 4.5% | 9 | -0.261 | INSUFFICIENT | measured |
| rank6-keep-all-discard | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| rank6-keep-return-bottom | 8.0% | 16 | -0.124 | INSUFFICIENT | measured |
| rank6-keep-return-top | 4.0% | 8 | -0.344 | INSUFFICIENT | measured |
| rank7-generated-ace-anchor | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-generated-four-row-clear | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-generated-jack-attach | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| rank7-generated-nine-anchor | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| rank7-generated-red-joker | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-generated-score | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| rank7-generated-three-bounce | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-generated-three-hand-raid | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-hand-and-effect | 6.0% | 12 | 0.000 | INSUFFICIENT | measured |
| rank7-hand-and-score | 5.0% | 10 | -0.105 | INSUFFICIENT | measured |
| rank7-hand-only | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| recycle-five-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| recycle-five-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| recycle-five-♦ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| royal-marriage | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| score | 76.0% | 152 | 0.447 | INSUFFICIENT | measured |
| scuttle | 26.5% | 53 | -0.119 | INSUFFICIENT | measured |
| seven-topdeck | 12.5% | 25 | -0.095 | INSUFFICIENT | measured |
| six-dig | 13.5% | 27 | -0.190 | INSUFFICIENT | measured |
| solo-wild | 6.0% | 12 | -0.444 | INSUFFICIENT | measured |
| spade-recovery | 4.0% | 8 | 0.222 | INSUFFICIENT | measured |
| super | 4.5% | 9 | 0.408 | INSUFFICIENT | measured |
| super-ace | 7.0% | 14 | 0.124 | INSUFFICIENT | measured |
| swap-bar | 56.0% | 112 | 0.052 | INSUFFICIENT | measured |
| three-black-ace | 3.5% | 7 | 0.074 | INSUFFICIENT | measured |
| three-black-bounce-top | 5.5% | 11 | 0.000 | INSUFFICIENT | measured |
| three-black-clear-er | 2.0% | 4 | -0.169 | INSUFFICIENT | measured |
| three-black-clear-pr | 2.5% | 5 | -0.103 | INSUFFICIENT | measured |
| three-black-jack-pr | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| three-black-king | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| three-black-purge-aegis | 0.5% | 1 | N/A | INSUFFICIENT | measured |
| three-black-purge-anchor-bounce | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| three-black-queen | 3.0% | 6 | -0.308 | INSUFFICIENT | measured |
| three-black-total-clear | 0.5% | 1 | N/A | INSUFFICIENT | measured |
| three-bounce-♠ | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| three-bounce-♣ | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| three-bounce-♦ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| three-force-discard | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |
| three-present-take | 3.5% | 7 | -0.222 | INSUFFICIENT | measured |
| three-red-counter | 43.5% | 87 | 0.104 | INSUFFICIENT | measured |
| topdeck-seven-♣ | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| topdeck-seven-♥ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| total-clear | 8.0% | 16 | -0.077 | INSUFFICIENT | measured |
| two-hold | 4.5% | 9 | 0.408 | INSUFFICIENT | measured |
| ultra | 75.5% | 151 | -0.014 | INSUFFICIENT | measured |
| voltage | 4.0% | 8 | 0.000 | INSUFFICIENT | measured |
| wild-sovereignty | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |

<details><summary><b>2-black-2-red-draw</b></summary>

Used in 31.0% of participant observations (62/200). Outcome association: negative (-0.107, CI [-0.257, 0.043]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23287ef301f13d4bcc02, M-56cb16e6cdcdf5dbd1a1, M-3cb981c1175c545aa7bf, M-f64ab908222f007aaf8d
</details>

<details><summary><b>2-black-2-red-rummage</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: negative (-0.048, CI [-0.351, 0.255]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-fe2ff9f65c08231020eb, M-a526bfd4b58f3e7c1278, M-257e716f34030889c9b8
</details>

<details><summary><b>ace</b></summary>

Used in 6.5% of participant observations (13/200). Outcome association: negative (-0.288, CI [-0.529, -0.048]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-e8afd8ba50aa2cf5c2ef, M-6eb96a20b1344ba12321, M-030616815bfed08a875f
</details>

<details><summary><b>ace-anchor</b></summary>

Used in 6.5% of participant observations (13/200). Outcome association: positive (0.041, CI [-0.239, 0.322]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-63ffa5487eb8677b1b3e, M-eb968361e3bdc82164ce, M-6eb96a20b1344ba12321, M-d854e1ad2e3c98faee9f
</details>

<details><summary><b>ace-base</b></summary>

Used in 13.0% of participant observations (26/200). Outcome association: positive (0.115, CI [-0.092, 0.321]). Immediate point impact: mean 1.67 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-e35cccea15951261a2cc, M-946f016b3c900b654616, M-13a4ae5e72c9ed243842
</details>

<details><summary><b>ace-spade</b></summary>

Used in 7.0% of participant observations (14/200). Outcome association: positive (0.154, CI [-0.107, 0.415]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-9842c2873a237904997e, M-946f016b3c900b654616, M-9ac410d55ff6857e19e9
</details>

<details><summary><b>anchor</b></summary>

Used in 21.5% of participant observations (43/200). Outcome association: negative (-0.262, CI [-0.422, -0.102]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-c37124f0bd32b32d2f71, M-946f016b3c900b654616, M-5e4dcf25c4d23d2e66dc
</details>

<details><summary><b>anchor-private-choice</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.103, CI [-0.333, 0.538]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-c37124f0bd32b32d2f71, M-6eb96a20b1344ba12321, M-56cb16e6cdcdf5dbd1a1
</details>

<details><summary><b>board-lock</b></summary>

Used in 12.5% of participant observations (25/200). Outcome association: negative (-0.025, CI [-0.242, 0.193]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-56cb16e6cdcdf5dbd1a1, M-946f016b3c900b654616, M-c27e931b3ffd72a2bc10
</details>

<details><summary><b>bounce-top</b></summary>

Used in 13.0% of participant observations (26/200). Outcome association: negative (-0.095, CI [-0.306, 0.116]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-de1b456110c82ac594d5, M-a526bfd4b58f3e7c1278, M-8f654e4c1d345533ccbf
</details>

<details><summary><b>clear-er</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.103, CI [-0.538, 0.333]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dca045bdd34e77aba406, M-116e5b92d1902f724f70, M-8f654e4c1d345533ccbf, M-eb968361e3bdc82164ce
</details>

<details><summary><b>clear-pr</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.103, CI [-0.538, 0.333]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f5ba7a1426637e83d01, M-56cb16e6cdcdf5dbd1a1, M-6e75ba582c29437816eb, M-cf0dc613991d03a1f8a6
</details>

<details><summary><b>club-foundation</b></summary>

Used in 17.5% of participant observations (35/200). Outcome association: positive (0.178, CI [-0.000, 0.356]). Immediate point impact: mean 5.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-c37124f0bd32b32d2f71, M-946f016b3c900b654616, M-030616815bfed08a875f
</details>

<details><summary><b>club-foundation-bonus</b></summary>

Used in 7.0% of participant observations (14/200). Outcome association: positive (0.041, CI [-0.239, 0.322]). Immediate point impact: mean 6.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-cf0dc613991d03a1f8a6, M-db10a45b83e5e68eb1fd, M-6e75ba582c29437816eb
</details>

<details><summary><b>counter</b></summary>

Used in 32.5% of participant observations (65/200). Outcome association: positive (0.189, CI [0.042, 0.335]). Immediate point impact: mean 1.43 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-116e5b92d1902f724f70, M-946f016b3c900b654616, M-030616815bfed08a875f
</details>

<details><summary><b>deep-draw-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f5ba7a1426637e83d01
</details>

<details><summary><b>diamond-mimic-paired-super-j-tempo</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.103, CI [-0.538, 0.333]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-eb968361e3bdc82164ce, M-a526bfd4b58f3e7c1278, M-9842c2873a237904997e
</details>

<details><summary><b>diamond-mimic-row-exchange-er</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-56cb16e6cdcdf5dbd1a1, M-f64ab908222f007aaf8d, M-cf0dc613991d03a1f8a6
</details>

<details><summary><b>diamond-mimic-row-exchange-pr</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (-0.105, CI [-0.417, 0.207]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-e23351a3b5866db76481, M-946f016b3c900b654616, M-8d371b9bb7fea569d285
</details>

<details><summary><b>disrupt</b></summary>

Used in 48.5% of participant observations (97/200). Outcome association: negative (-0.051, CI [-0.191, 0.089]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-56cb16e6cdcdf5dbd1a1, M-a526bfd4b58f3e7c1278, M-13a4ae5e72c9ed243842
</details>

<details><summary><b>draw</b></summary>

Used in 78.5% of participant observations (157/200). Outcome association: negative (-0.253, CI [-0.411, -0.095]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23287ef301f13d4bcc02, M-fe2ff9f65c08231020eb, M-3cb981c1175c545aa7bf, M-c27e931b3ffd72a2bc10
</details>

<details><summary><b>effect-ace</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: positive (0.074, CI [-0.299, 0.448]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-e8afd8ba50aa2cf5c2ef, M-6eb96a20b1344ba12321, M-6e75ba582c29437816eb
</details>

<details><summary><b>effect-four</b></summary>

Used in 12.0% of participant observations (24/200). Outcome association: negative (-0.027, CI [-0.253, 0.199]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-aa8f4a129617fe179fe4, M-6eb96a20b1344ba12321, M-cf0dc613991d03a1f8a6
</details>

<details><summary><b>effect-private-choice</b></summary>

Used in 23.5% of participant observations (47/200). Outcome association: negative (-0.194, CI [-0.357, -0.031]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-116e5b92d1902f724f70, M-a526bfd4b58f3e7c1278, M-030616815bfed08a875f
</details>

<details><summary><b>effect-red-joker</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: positive (0.074, CI [-0.299, 0.448]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f6d290c5a5c388920148, M-9764f9a75800787b9cb7, M-946f016b3c900b654616, M-030616815bfed08a875f
</details>

<details><summary><b>effect-three</b></summary>

Used in 13.0% of participant observations (26/200). Outcome association: negative (-0.095, CI [-0.306, 0.116]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-de1b456110c82ac594d5, M-a526bfd4b58f3e7c1278, M-8f654e4c1d345533ccbf
</details>

<details><summary><b>eight-aegis-field</b></summary>

Used in 25.0% of participant observations (50/200). Outcome association: negative (-0.182, CI [-0.341, -0.023]). Immediate point impact: mean 2.50 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-56cb16e6cdcdf5dbd1a1, M-946f016b3c900b654616, M-13a4ae5e72c9ed243842
</details>

<details><summary><b>eight-scuttle</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-ce099e622a899fa5cb74, M-de1b456110c82ac594d5, M-aa8f4a129617fe179fe4
</details>

<details><summary><b>eight-spade-free-scuttle</b></summary>

Used in 12.0% of participant observations (24/200). Outcome association: negative (-0.047, CI [-0.260, 0.165]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23287ef301f13d4bcc02, M-c37124f0bd32b32d2f71, M-946f016b3c900b654616, M-d854e1ad2e3c98faee9f
</details>

<details><summary><b>exhausted-pass</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.697, 0.697]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71, M-8f654e4c1d345533ccbf
</details>

<details><summary><b>face-down</b></summary>

Used in 54.5% of participant observations (109/200). Outcome association: positive (0.051, CI [-0.089, 0.192]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23287ef301f13d4bcc02, M-c37124f0bd32b32d2f71, M-db10a45b83e5e68eb1fd, M-13a4ae5e72c9ed243842
</details>

<details><summary><b>face-up-draw</b></summary>

Used in 14.0% of participant observations (28/200). Outcome association: negative (-0.177, CI [-0.375, 0.020]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-eec6e8dbac8062940f40, M-a526bfd4b58f3e7c1278, M-8f654e4c1d345533ccbf
</details>

<details><summary><b>five-gy-bottom</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.103, CI [-0.538, 0.333]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-c37124f0bd32b32d2f71, M-eb968361e3bdc82164ce, M-cc0bcbd24dd43f95a1b9
</details>

<details><summary><b>five-recycle</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (-0.291, CI [-0.572, -0.010]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-c37124f0bd32b32d2f71, M-946f016b3c900b654616, M-6e75ba582c29437816eb
</details>

<details><summary><b>five-refine</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.172, CI [-0.212, 0.556]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-8f5ba7a1426637e83d01, M-8f654e4c1d345533ccbf, M-cc0bcbd24dd43f95a1b9
</details>

<details><summary><b>four-guess-4-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71
</details>

<details><summary><b>four-guess-4-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71
</details>

<details><summary><b>four-guess-7-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71
</details>

<details><summary><b>four-guess-A-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71
</details>

<details><summary><b>four-guess-K-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71
</details>

<details><summary><b>four-guess-Q-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-690e14c1ad1c3c20a4fe
</details>

<details><summary><b>four-guess-Q-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71
</details>

<details><summary><b>four-row-clear-er</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71
</details>

<details><summary><b>four-row-clear-er-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13
</details>

<details><summary><b>four-row-clear-er-♣</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.576, -0.435]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-44d7c9fa35f12273eb68, M-6eb96a20b1344ba12321
</details>

<details><summary><b>four-row-clear-er-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-d0bd4d4955859b96f1e3
</details>

<details><summary><b>heart-tempo</b></summary>

Used in 13.0% of participant observations (26/200). Outcome association: negative (-0.069, CI [-0.277, 0.140]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-d489bd6594b2deaa366a, M-946f016b3c900b654616, M-8f654e4c1d345533ccbf
</details>

<details><summary><b>jack</b></summary>

Used in 48.5% of participant observations (97/200). Outcome association: negative (-0.051, CI [-0.191, 0.089]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-56cb16e6cdcdf5dbd1a1, M-a526bfd4b58f3e7c1278, M-13a4ae5e72c9ed243842
</details>

<details><summary><b>king</b></summary>

Used in 18.5% of participant observations (37/200). Outcome association: negative (-0.296, CI [-0.460, -0.132]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-cc0bcbd24dd43f95a1b9, M-946f016b3c900b654616, M-5e4dcf25c4d23d2e66dc
</details>

<details><summary><b>king-anchor</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-c9d2d8963a8026c2e2b0, M-d854e1ad2e3c98faee9f
</details>

<details><summary><b>king-spade</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.576, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-9842c2873a237904997e
</details>

<details><summary><b>nine</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.103, CI [-0.333, 0.538]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-c37124f0bd32b32d2f71, M-6eb96a20b1344ba12321, M-56cb16e6cdcdf5dbd1a1
</details>

<details><summary><b>nine-anchor-discard</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.172, CI [-0.556, 0.212]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-56cb16e6cdcdf5dbd1a1, M-6eb96a20b1344ba12321, M-de1b456110c82ac594d5
</details>

<details><summary><b>nine-tap</b></summary>

Used in 27.5% of participant observations (55/200). Outcome association: negative (-0.194, CI [-0.347, -0.041]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-56cb16e6cdcdf5dbd1a1, M-3cb981c1175c545aa7bf, M-c27e931b3ffd72a2bc10
</details>

<details><summary><b>opponent-attack</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: positive (0.074, CI [-0.299, 0.448]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-f6d290c5a5c388920148, M-9764f9a75800787b9cb7, M-946f016b3c900b654616, M-030616815bfed08a875f
</details>

<details><summary><b>purge-aegis</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.508, CI [0.437, 0.578]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-6e75ba582c29437816eb, M-a6002589304eda5d8923
</details>

<details><summary><b>purge-anchor-bounce</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-fe2ff9f65c08231020eb, M-e8afd8ba50aa2cf5c2ef, M-6eb96a20b1344ba12321, M-de1b456110c82ac594d5
</details>

<details><summary><b>queen</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c9d2d8963a8026c2e2b0, M-e3e961e04b6b65b898c7, M-d854e1ad2e3c98faee9f, M-c37124f0bd32b32d2f71
</details>

<details><summary><b>queen-aegis</b></summary>

Used in 17.0% of participant observations (34/200). Outcome association: negative (-0.164, CI [-0.345, 0.017]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-cc0bcbd24dd43f95a1b9, M-946f016b3c900b654616, M-13a4ae5e72c9ed243842
</details>

<details><summary><b>rank10</b></summary>

Used in 37.5% of participant observations (75/200). Outcome association: positive (0.055, CI [-0.090, 0.201]). Immediate point impact: mean 3.50 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-c37124f0bd32b32d2f71, M-db10a45b83e5e68eb1fd, M-f64ab908222f007aaf8d
</details>

<details><summary><b>rank10-stack-theft</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: positive (0.144, CI [-0.149, 0.438]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-de1b456110c82ac594d5, M-a526bfd4b58f3e7c1278, M-8f654e4c1d345533ccbf
</details>

<details><summary><b>rank3-discard</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.169, CI [-0.369, 0.707]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-941d10feb328a0f8bf3e, M-eb968361e3bdc82164ce, M-946f016b3c900b654616
</details>

<details><summary><b>rank3-present</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: positive (0.222, CI [-0.120, 0.564]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-de1b456110c82ac594d5, M-6eb96a20b1344ba12321, M-030616815bfed08a875f
</details>

<details><summary><b>rank3-take</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.344, CI [-0.650, -0.037]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-de1b456110c82ac594d5, M-6eb96a20b1344ba12321, M-030616815bfed08a875f
</details>

<details><summary><b>rank5-rummage</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: negative (-0.261, CI [-0.569, 0.048]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-e8afd8ba50aa2cf5c2ef, M-946f016b3c900b654616, M-e32149ebf24466103ea9
</details>

<details><summary><b>rank6-keep-all-discard</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-8f5ba7a1426637e83d01, M-eb968361e3bdc82164ce, M-116e5b92d1902f724f70
</details>

<details><summary><b>rank6-keep-return-bottom</b></summary>

Used in 8.0% of participant observations (16/200). Outcome association: negative (-0.124, CI [-0.398, 0.151]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-63ffa5487eb8677b1b3e, M-56cb16e6cdcdf5dbd1a1, M-6eb96a20b1344ba12321, M-030616815bfed08a875f
</details>

<details><summary><b>rank6-keep-return-top</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (-0.344, CI [-0.650, -0.037]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-56cb16e6cdcdf5dbd1a1, M-c27e931b3ffd72a2bc10, M-941d10feb328a0f8bf3e
</details>

<details><summary><b>rank7-generated-ace-anchor</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-690e14c1ad1c3c20a4fe
</details>

<details><summary><b>rank7-generated-four-row-clear</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-e8afd8ba50aa2cf5c2ef
</details>

<details><summary><b>rank7-generated-jack-attach</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.432, 0.573]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f654e4c1d345533ccbf
</details>

<details><summary><b>rank7-generated-nine-anchor</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.576]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-de1b456110c82ac594d5, M-6eb96a20b1344ba12321
</details>

<details><summary><b>rank7-generated-red-joker</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6e75ba582c29437816eb
</details>

<details><summary><b>rank7-generated-score</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-fbecf3ec38b4cc094d0e, M-cdbb93aac376239f7748, M-946f016b3c900b654616, M-c37124f0bd32b32d2f71
</details>

<details><summary><b>rank7-generated-three-bounce</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321
</details>

<details><summary><b>rank7-generated-three-hand-raid</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13
</details>

<details><summary><b>rank7-hand-and-effect</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (0.000, CI [-0.292, 0.292]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-de1b456110c82ac594d5, M-946f016b3c900b654616, M-690e14c1ad1c3c20a4fe
</details>

<details><summary><b>rank7-hand-and-score</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (-0.105, CI [-0.417, 0.207]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-63ffa5487eb8677b1b3e, M-c37124f0bd32b32d2f71, M-a6002589304eda5d8923, M-e8afd8ba50aa2cf5c2ef
</details>

<details><summary><b>rank7-hand-only</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321
</details>

<details><summary><b>recycle-five-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.432, 0.573]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f654e4c1d345533ccbf
</details>

<details><summary><b>recycle-five-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-eec6e8dbac8062940f40
</details>

<details><summary><b>recycle-five-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bf73664f5127cc77a797
</details>

<details><summary><b>royal-marriage</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-eb968361e3bdc82164ce
</details>

<details><summary><b>score</b></summary>

Used in 76.0% of participant observations (152/200). Outcome association: positive (0.447, CI [0.316, 0.579]). Immediate point impact: mean 3.30 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23287ef301f13d4bcc02, M-fe2ff9f65c08231020eb, M-3cb981c1175c545aa7bf, M-c27e931b3ffd72a2bc10
</details>

<details><summary><b>scuttle</b></summary>

Used in 26.5% of participant observations (53/200). Outcome association: negative (-0.119, CI [-0.277, 0.038]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-56cb16e6cdcdf5dbd1a1, M-a526bfd4b58f3e7c1278, M-030616815bfed08a875f
</details>

<details><summary><b>seven-topdeck</b></summary>

Used in 12.5% of participant observations (25/200). Outcome association: negative (-0.095, CI [-0.306, 0.116]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-c37124f0bd32b32d2f71, M-946f016b3c900b654616, M-8f654e4c1d345533ccbf
</details>

<details><summary><b>six-dig</b></summary>

Used in 13.5% of participant observations (27/200). Outcome association: negative (-0.190, CI [-0.393, 0.013]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-c37124f0bd32b32d2f71, M-a526bfd4b58f3e7c1278, M-030616815bfed08a875f
</details>

<details><summary><b>solo-wild</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (-0.444, CI [-0.616, -0.272]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-c37124f0bd32b32d2f71, M-6eb96a20b1344ba12321, M-8811e3475a0078c9b67d
</details>

<details><summary><b>spade-recovery</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: positive (0.222, CI [-0.120, 0.564]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-de1b456110c82ac594d5, M-946f016b3c900b654616, M-a6002589304eda5d8923
</details>

<details><summary><b>super</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: positive (0.408, CI [0.190, 0.625]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-c37124f0bd32b32d2f71, M-e32149ebf24466103ea9, M-9ac410d55ff6857e19e9
</details>

<details><summary><b>super-ace</b></summary>

Used in 7.0% of participant observations (14/200). Outcome association: positive (0.124, CI [-0.151, 0.398]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-1b4ede32232a72df0a86, M-a6002589304eda5d8923, M-941d10feb328a0f8bf3e
</details>

<details><summary><b>swap-bar</b></summary>

Used in 56.0% of participant observations (112/200). Outcome association: positive (0.052, CI [-0.089, 0.192]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23287ef301f13d4bcc02, M-c37124f0bd32b32d2f71, M-db10a45b83e5e68eb1fd, M-13a4ae5e72c9ed243842
</details>

<details><summary><b>three-black-ace</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: positive (0.074, CI [-0.299, 0.448]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f5ba7a1426637e83d01, M-030616815bfed08a875f, M-dcc47c0a70b0e1ec0c2c, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>three-black-bounce-top</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: negative (0.000, CI [-0.318, 0.318]). Immediate point impact: mean 1.50 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-de1b456110c82ac594d5, M-946f016b3c900b654616, M-dcc47c0a70b0e1ec0c2c
</details>

<details><summary><b>three-black-clear-er</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-e3e961e04b6b65b898c7, M-56cb16e6cdcdf5dbd1a1, M-946f016b3c900b654616, M-030616815bfed08a875f
</details>

<details><summary><b>three-black-clear-pr</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.103, CI [-0.538, 0.333]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-28d0b14f0f5d88c51a31, M-e8afd8ba50aa2cf5c2ef, M-946f016b3c900b654616, M-8811e3475a0078c9b67d
</details>

<details><summary><b>three-black-jack-pr</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.432, 0.573]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bc89088eea84e3c5dfa0
</details>

<details><summary><b>three-black-king</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.697, 0.697]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c04f8342320e37395ec0, M-a6002589304eda5d8923
</details>

<details><summary><b>three-black-purge-aegis</b></summary>

Used in 0.5% of participant observations (1/200). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-aa8f4a129617fe179fe4
</details>

<details><summary><b>three-black-purge-anchor-bounce</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.432, 0.573]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-030616815bfed08a875f
</details>

<details><summary><b>three-black-queen</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.308, CI [-0.666, 0.050]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-63ffa5487eb8677b1b3e, M-946f016b3c900b654616, M-e509e77b0eba15e480d1
</details>

<details><summary><b>three-black-total-clear</b></summary>

Used in 0.5% of participant observations (1/200). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-aa8f4a129617fe179fe4
</details>

<details><summary><b>three-bounce-♠</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.576, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71, M-e8afd8ba50aa2cf5c2ef
</details>

<details><summary><b>three-bounce-♣</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.697, 0.697]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f654e4c1d345533ccbf, M-690e14c1ad1c3c20a4fe
</details>

<details><summary><b>three-bounce-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.432, 0.573]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f654e4c1d345533ccbf
</details>

<details><summary><b>three-force-discard</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-941d10feb328a0f8bf3e, M-946f016b3c900b654616, M-eb968361e3bdc82164ce
</details>

<details><summary><b>three-present-take</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.222, CI [-0.564, 0.120]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-de1b456110c82ac594d5, M-6eb96a20b1344ba12321, M-030616815bfed08a875f
</details>

<details><summary><b>three-red-counter</b></summary>

Used in 43.5% of participant observations (87/200). Outcome association: positive (0.104, CI [-0.036, 0.245]). Immediate point impact: mean 2.78 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-fe2ff9f65c08231020eb, M-db10a45b83e5e68eb1fd, M-13a4ae5e72c9ed243842
</details>

<details><summary><b>topdeck-seven-♣</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.576, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71, M-8811e3475a0078c9b67d
</details>

<details><summary><b>topdeck-seven-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.573, -0.432]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321
</details>

<details><summary><b>total-clear</b></summary>

Used in 8.0% of participant observations (16/200). Outcome association: negative (-0.077, CI [-0.346, 0.192]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-aa8f4a129617fe179fe4, M-6eb96a20b1344ba12321, M-eec6e8dbac8062940f40
</details>

<details><summary><b>two-hold</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: positive (0.408, CI [0.190, 0.625]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-c37124f0bd32b32d2f71, M-e32149ebf24466103ea9, M-9ac410d55ff6857e19e9
</details>

<details><summary><b>ultra</b></summary>

Used in 75.5% of participant observations (151/200). Outcome association: negative (-0.014, CI [-0.175, 0.148]). Immediate point impact: mean 1.33 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23287ef301f13d4bcc02, M-e81dcb1f989a3c62c3ae, M-db10a45b83e5e68eb1fd, M-f64ab908222f007aaf8d
</details>

<details><summary><b>voltage</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (0.000, CI [-0.354, 0.354]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13, M-c37124f0bd32b32d2f71, M-690e14c1ad1c3c20a4fe, M-eb968361e3bdc82164ce
</details>

<details><summary><b>wild-sovereignty</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.576, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71, M-eec6e8dbac8062940f40
</details>

## Synergy Findings

| Pair | Class | Effect | Shrunk | q-value | Status |
|------|-------|--------|--------|---------|--------|
| jack::eight-aegis-field | anti-synergy | 3.000 | 2.689 | 0.7896 | inconclusive |
| jack::three-red-counter | anti-synergy | 0.500 | 0.455 | 0.7896 | inconclusive |
| scuttle::three-red-counter | synergy | 0.200 | 0.179 | 0.7896 | inconclusive |

## Causal Motifs

- **score → score** — 41 occurrence(s), 11 matches
- **unclassified → score** — 23 occurrence(s), 10 matches
- **face-down → unclassified** — 15 occurrence(s), 10 matches
- **score → unclassified** — 13 occurrence(s), 7 matches
- **unclassified → 2-black-2-red-draw** — 10 occurrence(s), 8 matches
- **2-black-2-red-draw → score** — 6 occurrence(s), 5 matches
- **draw → unclassified** — 6 occurrence(s), 5 matches
- **unclassified → draw** — 6 occurrence(s), 6 matches
- **nine-tap → nine-tap** — 5 occurrence(s), 3 matches
- **score → face-down** — 4 occurrence(s), 3 matches
- **ace-base → ace-base** — 3 occurrence(s), 2 matches
- **nine-tap → face-down** — 3 occurrence(s), 3 matches
- **score → disrupt** — 3 occurrence(s), 3 matches
- **score → nine-tap** — 3 occurrence(s), 3 matches
- **three-red-counter → three-red-counter** — 3 occurrence(s), 2 matches
- **unclassified → heart-tempo** — 3 occurrence(s), 3 matches
- **2-black-2-red-draw → three-red-counter** — 2 occurrence(s), 2 matches
- **anchor → anchor** — 2 occurrence(s), 2 matches
- **disrupt → ace-base** — 2 occurrence(s), 2 matches
- **eight-aegis-field → unclassified** — 2 occurrence(s), 2 matches

## Anomalies

37 anomaly/anomalies: ORCHESTRATION_DENSITY (30), LONG_MATCH (6), RESPONSE_CHAIN_INTENSITY (1).

- ORCHESTRATION_DENSITY: 30
- LONG_MATCH: 6
- RESPONSE_CHAIN_INTENSITY: 1

## Recommendations

- Most synergy findings are inconclusive — consider increasing match count for statistical power.
- 86 mechanic(s) have sample size below 20 — interpret with caution.

## Interpretation Boundary

Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.

