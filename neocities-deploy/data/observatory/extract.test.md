# Mechanics Observatory — AI Agent Extract

**Extract version:** 1.0.0
**Analytics schema:** 4.2.0
**Source hash:** `ba5f1612c872e9e615f376019b28bf4fcff56811961268472750baf517b15603`
**Aggregate hash:** `e4a6921c4b8595bafe7b745b35a99911fc236e16ccaba2cba2f301141b699f48`
**Extract hash:** `4fe3c46c1824a47b09af27e45d9acd8405b86130e9347685f916d6795df88ef3`

## Executive Summary

Analysis covers 100 Advanced Core matches under Engine v4.2.6 / Rules v4.2.0. All matches completed without aborts. Highest win rate: hybrix-sniper at 91.7% (CI [0.646, 0.985], 12 games). No synergy pairs reached statistical significance after FDR correction. 106 mechanic(s) measured with evidence-backed associations. 27 anomaly/anomalies flagged (0 critical, 5 warning, 22 info). Data completeness: PASS (no unclassified facts). Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.

## Dataset

| Metric | Value |
|--------|-------|
| matchCount | 100 |
| completedMatchCount | 100 |
| abortCount | 0 |
| drawCount | 1 |
| detailedMatchCount | 12 |
| policyCount | 12 |
| mechanicCount | 106 |
| synergyCount | 1 |
| motifCount | 49 |
| anomalyCount | 27 |

## Policy Findings

### control

- **Win rate:** 28.6% (6/21 games, CI [0.138, 0.500])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=12.714, responseUse=5.762, advancedFrequency=2.571

### hybrix-baseline

- **Win rate:** 75.0% (6/8 games, CI [0.409, 0.929])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=8.250, responseUse=2.500, advancedFrequency=1.250

### hybrix-defender

- **Win rate:** 10.0% (2/20 games, CI [0.028, 0.301])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=13.800, responseUse=5.500, advancedFrequency=3.250

### hybrix-rusher

- **Win rate:** 55.0% (11/20 games, CI [0.342, 0.742])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, short matches
- **Fingerprint:** scoreAggression=6.100, responseUse=2.250, advancedFrequency=0.800

### hybrix-sniper

- **Win rate:** 91.7% (11/12 games, CI [0.646, 0.985])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=6.333, responseUse=1.667, advancedFrequency=0.667

### hybrix-support

- **Win rate:** 75.0% (6/8 games, CI [0.409, 0.929])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=7.000, responseUse=1.875, advancedFrequency=1.250

### hybrix-tank

- **Win rate:** 37.5% (3/8 games, CI [0.137, 0.694])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, long matches
- **Fingerprint:** scoreAggression=15.125, responseUse=7.750, advancedFrequency=2.875

### hybrix-trickster

- **Win rate:** 65.0% (13/20 games, CI [0.433, 0.819])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=6.800, responseUse=1.850, advancedFrequency=1.500

### random-legal

- **Win rate:** 14.3% (3/21 games, CI [0.050, 0.346])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, voltage-heavy, long matches
- **Fingerprint:** scoreAggression=11.429, responseUse=4.762, advancedFrequency=2.190

### score-rush

- **Win rate:** 66.7% (14/21 games, CI [0.454, 0.828])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy, short matches
- **Fingerprint:** scoreAggression=4.571, responseUse=1.286, advancedFrequency=0.571

### tempo

- **Win rate:** 52.4% (11/21 games, CI [0.324, 0.717])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=5.571, responseUse=1.571, advancedFrequency=1.429

### value

- **Win rate:** 65.0% (13/20 games, CI [0.433, 0.819])
- **Key traits:** high action frequency, response-heavy, advanced-heavy, ultra-heavy
- **Fingerprint:** scoreAggression=5.900, responseUse=1.300, advancedFrequency=1.050

## Mechanic Findings

| Mechanic | Usage Rate | Sample | Association | Grade | Status |
|----------|-----------|--------|-------------|-------|--------|
| 2-black-2-red-draw | 31.0% | 62 | -0.130 | INSUFFICIENT | measured |
| 2-black-2-red-rummage | 4.0% | 8 | 0.000 | INSUFFICIENT | measured |
| ace | 4.0% | 8 | -0.261 | INSUFFICIENT | measured |
| ace-anchor | 4.0% | 8 | -0.130 | INSUFFICIENT | measured |
| ace-base | 16.0% | 32 | 0.134 | INSUFFICIENT | measured |
| ace-spade | 7.5% | 15 | 0.180 | INSUFFICIENT | measured |
| anchor | 20.0% | 40 | -0.293 | INSUFFICIENT | measured |
| anchor-private-choice | 5.0% | 10 | -0.175 | INSUFFICIENT | measured |
| attachment | 1.5% | 3 | -0.508 | INSUFFICIENT | measured |
| board-lock | 5.5% | 11 | -0.316 | INSUFFICIENT | measured |
| bounce-top | 10.0% | 20 | -0.087 | INSUFFICIENT | measured |
| clear-er | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |
| clear-pr | 3.0% | 6 | 0.103 | INSUFFICIENT | measured |
| club-foundation | 9.5% | 19 | 0.061 | INSUFFICIENT | measured |
| club-foundation-bonus | 5.5% | 11 | 0.144 | INSUFFICIENT | measured |
| counter | 29.5% | 59 | 0.195 | INSUFFICIENT | measured |
| deep-draw-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| diamond-mimic-paired-super-j-tempo | 2.5% | 5 | 0.103 | INSUFFICIENT | measured |
| diamond-mimic-row-exchange-er | 3.0% | 6 | -0.513 | INSUFFICIENT | measured |
| diamond-mimic-row-exchange-pr | 4.5% | 9 | -0.291 | INSUFFICIENT | measured |
| disrupt | 44.0% | 88 | 0.000 | INSUFFICIENT | measured |
| draw | 66.5% | 133 | -0.192 | INSUFFICIENT | measured |
| effect-ace | 3.0% | 6 | 0.000 | INSUFFICIENT | measured |
| effect-four | 6.0% | 12 | 0.105 | INSUFFICIENT | measured |
| effect-private-choice | 19.5% | 39 | -0.249 | INSUFFICIENT | measured |
| effect-red-joker | 5.0% | 10 | 0.175 | INSUFFICIENT | measured |
| effect-three | 10.0% | 20 | -0.087 | INSUFFICIENT | measured |
| eight-aegis-field | 27.5% | 55 | -0.064 | INSUFFICIENT | measured |
| eight-scuttle | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| eight-spade-free-scuttle | 6.0% | 12 | -0.266 | INSUFFICIENT | measured |
| exhausted-pass | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| face-down | 54.5% | 109 | -0.102 | INSUFFICIENT | measured |
| face-up-draw | 11.0% | 22 | -0.278 | INSUFFICIENT | measured |
| five-gy-bottom | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |
| five-recycle | 4.5% | 9 | -0.291 | INSUFFICIENT | measured |
| five-refine | 1.5% | 3 | -0.508 | INSUFFICIENT | measured |
| four-exchange-pr | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| four-guess-2-♠ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-4-♦ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-guess-7-♦ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♥ | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| four-row-clear-er-♦ | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| heart-tempo | 12.0% | 24 | -0.047 | INSUFFICIENT | measured |
| jack | 44.0% | 88 | 0.000 | INSUFFICIENT | measured |
| jack-pr | 1.5% | 3 | -0.508 | INSUFFICIENT | measured |
| king | 16.5% | 33 | -0.325 | INSUFFICIENT | measured |
| king-anchor | 2.5% | 5 | 0.513 | INSUFFICIENT | measured |
| king-spade | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| nine | 5.0% | 10 | -0.175 | INSUFFICIENT | measured |
| nine-anchor-discard | 3.5% | 7 | 0.000 | INSUFFICIENT | measured |
| nine-tap | 23.5% | 47 | -0.057 | INSUFFICIENT | measured |
| opponent-attack | 4.5% | 9 | 0.130 | INSUFFICIENT | measured |
| purge-aegis | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| purge-anchor-bounce | 2.5% | 5 | -0.169 | INSUFFICIENT | measured |
| queen | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |
| queen-aegis | 13.5% | 27 | -0.089 | INSUFFICIENT | measured |
| rank10 | 30.5% | 61 | -0.012 | INSUFFICIENT | measured |
| rank10-stack-theft | 3.0% | 6 | 0.000 | INSUFFICIENT | measured |
| rank3-discard | 2.5% | 5 | 0.103 | INSUFFICIENT | measured |
| rank3-present | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| rank3-take | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |
| rank5-rummage | 4.0% | 8 | -0.261 | INSUFFICIENT | measured |
| rank6-keep-all-discard | 2.0% | 4 | -0.510 | INSUFFICIENT | measured |
| rank6-keep-return-bottom | 6.0% | 12 | 0.000 | INSUFFICIENT | measured |
| rank6-keep-return-top | 8.0% | 16 | -0.384 | INSUFFICIENT | measured |
| rank7-generated-queen-anchor | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| rank7-generated-red-joker | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| rank7-generated-score | 1.5% | 3 | 0.508 | INSUFFICIENT | measured |
| rank7-hand-and-effect | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| rank7-hand-and-score | 2.5% | 5 | -0.308 | INSUFFICIENT | measured |
| recycle-five-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| recycle-five-♦ | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| royal-marriage | 1.0% | 2 | 0.505 | INSUFFICIENT | measured |
| score | 76.5% | 153 | 0.532 | INSUFFICIENT | measured |
| scuttle | 18.0% | 36 | -0.260 | INSUFFICIENT | measured |
| seven-topdeck | 5.5% | 11 | -0.144 | INSUFFICIENT | measured |
| shuffle-reset | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| six-dig | 13.0% | 26 | -0.237 | INSUFFICIENT | measured |
| solo-wild | 5.5% | 11 | -0.433 | INSUFFICIENT | measured |
| spade-recovery | 4.5% | 9 | 0.000 | INSUFFICIENT | measured |
| super | 3.5% | 7 | 0.370 | INSUFFICIENT | measured |
| super-ace | 4.5% | 9 | 0.058 | INSUFFICIENT | measured |
| swap-bar | 55.5% | 111 | -0.092 | INSUFFICIENT | measured |
| three-black-ace | 2.0% | 4 | 0.000 | INSUFFICIENT | measured |
| three-black-bounce-top | 4.5% | 9 | -0.130 | INSUFFICIENT | measured |
| three-black-clear-er | 2.0% | 4 | -0.508 | INSUFFICIENT | measured |
| three-black-clear-pr | 2.0% | 4 | 0.255 | INSUFFICIENT | measured |
| three-black-king | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |
| three-black-purge-anchor-bounce | 0.5% | 1 | 0.503 | INSUFFICIENT | measured |
| three-black-queen | 3.0% | 6 | -0.308 | INSUFFICIENT | measured |
| three-black-total-clear | 1.5% | 3 | -0.508 | INSUFFICIENT | measured |
| three-bounce-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| three-bounce-♣ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| three-force-discard | 3.5% | 7 | -0.222 | INSUFFICIENT | measured |
| three-hand | 1.0% | 2 | 0.000 | INSUFFICIENT | measured |
| three-points | 1.5% | 3 | -0.169 | INSUFFICIENT | measured |
| three-present-take | 2.0% | 4 | -0.255 | INSUFFICIENT | measured |
| three-red-counter | 45.0% | 90 | 0.082 | INSUFFICIENT | measured |
| topdeck-seven-♣ | 1.0% | 2 | -0.505 | INSUFFICIENT | measured |
| total-clear | 2.5% | 5 | 0.255 | INSUFFICIENT | measured |
| total-clear-♠ | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |
| two-hold | 2.5% | 5 | 0.308 | INSUFFICIENT | measured |
| ultra | 75.5% | 151 | -0.041 | INSUFFICIENT | measured |
| voltage | 4.0% | 8 | -0.261 | INSUFFICIENT | measured |
| wild-sovereignty | 0.5% | 1 | -0.503 | INSUFFICIENT | measured |

<details><summary><b>2-black-2-red-draw</b></summary>

Used in 31.0% of participant observations (62/200). Outcome association: negative (-0.130, CI [-0.279, 0.019]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-e81dcb1f989a3c62c3ae, M-cdbb93aac376239f7748, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>2-black-2-red-rummage</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (0.000, CI [-0.354, 0.354]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-030616815bfed08a875f, M-cdbb93aac376239f7748, M-946f016b3c900b654616
</details>

<details><summary><b>ace</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (-0.261, CI [-0.569, 0.048]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-fbecf3ec38b4cc094d0e, M-e8afd8ba50aa2cf5c2ef, M-c04f8342320e37395ec0, M-030616815bfed08a875f
</details>

<details><summary><b>ace-anchor</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (-0.130, CI [-0.473, 0.213]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-e8afd8ba50aa2cf5c2ef, M-c37124f0bd32b32d2f71, M-f6d290c5a5c388920148
</details>

<details><summary><b>ace-base</b></summary>

Used in 16.0% of participant observations (32/200). Outcome association: positive (0.134, CI [-0.054, 0.321]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ebc1b4121f20b128752f, M-a6002589304eda5d8923, M-44d7c9fa35f12273eb68, M-0a64cce5e87cfe339b3b
</details>

<details><summary><b>ace-spade</b></summary>

Used in 7.5% of participant observations (15/200). Outcome association: positive (0.180, CI [-0.069, 0.430]). Immediate point impact: mean 3.67 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-cdac69cf264532483783, M-cdbb93aac376239f7748, M-c27e931b3ffd72a2bc10
</details>

<details><summary><b>anchor</b></summary>

Used in 20.0% of participant observations (40/200). Outcome association: negative (-0.293, CI [-0.453, -0.133]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-8f5ba7a1426637e83d01, M-cdbb93aac376239f7748, M-030616815bfed08a875f
</details>

<details><summary><b>anchor-private-choice</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (-0.175, CI [-0.491, 0.142]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-690e14c1ad1c3c20a4fe, M-cdbb93aac376239f7748, M-0fbb81ca3aeeda551d13
</details>

<details><summary><b>attachment</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.508, CI [-0.578, -0.438]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-690e14c1ad1c3c20a4fe, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>board-lock</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: negative (-0.316, CI [-0.574, -0.058]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-030616815bfed08a875f, M-cdbb93aac376239f7748, M-db10a45b83e5e68eb1fd
</details>

<details><summary><b>bounce-top</b></summary>

Used in 10.0% of participant observations (20/200). Outcome association: negative (-0.087, CI [-0.321, 0.146]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-de1b456110c82ac594d5, M-cdbb93aac376239f7748, M-e32149ebf24466103ea9
</details>

<details><summary><b>clear-er</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-eb968361e3bdc82164ce, M-cdbb93aac376239f7748, M-8f5ba7a1426637e83d01
</details>

<details><summary><b>clear-pr</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: positive (0.103, CI [-0.333, 0.538]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f5ba7a1426637e83d01, M-56cb16e6cdcdf5dbd1a1, M-cdbb93aac376239f7748, M-6e75ba582c29437816eb
</details>

<details><summary><b>club-foundation</b></summary>

Used in 9.5% of participant observations (19/200). Outcome association: positive (0.061, CI [-0.180, 0.302]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-ce645ce7a5c5594556ee, M-946f016b3c900b654616, M-c37124f0bd32b32d2f71
</details>

<details><summary><b>club-foundation-bonus</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: positive (0.144, CI [-0.149, 0.438]). Immediate point impact: mean 9.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-aa8f4a129617fe179fe4, M-44d7c9fa35f12273eb68, M-db10a45b83e5e68eb1fd
</details>

<details><summary><b>counter</b></summary>

Used in 29.5% of participant observations (59/200). Outcome association: positive (0.195, CI [0.047, 0.344]). Immediate point impact: mean 1.38 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-a9a7afa9ee474bf45536, M-cdbb93aac376239f7748, M-030616815bfed08a875f
</details>

<details><summary><b>deep-draw-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f5ba7a1426637e83d01
</details>

<details><summary><b>diamond-mimic-paired-super-j-tempo</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.103, CI [-0.333, 0.538]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-eb968361e3bdc82164ce, M-ce099e622a899fa5cb74, M-0fbb81ca3aeeda551d13, M-a526bfd4b58f3e7c1278
</details>

<details><summary><b>diamond-mimic-row-exchange-er</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.513, CI [-0.583, -0.442]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-f64ab908222f007aaf8d, M-cdbb93aac376239f7748, M-56cb16e6cdcdf5dbd1a1
</details>

<details><summary><b>diamond-mimic-row-exchange-pr</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: negative (-0.291, CI [-0.572, -0.010]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-e23351a3b5866db76481, M-6e75ba582c29437816eb, M-c27e931b3ffd72a2bc10
</details>

<details><summary><b>disrupt</b></summary>

Used in 44.0% of participant observations (88/200). Outcome association: negative (0.000, CI [-0.141, 0.141]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-0496791615f3cfbfb548, M-cdbb93aac376239f7748, M-657a4bf619e288635b74
</details>

<details><summary><b>draw</b></summary>

Used in 66.5% of participant observations (133/200). Outcome association: negative (-0.192, CI [-0.335, -0.048]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-eea877acab1a61f410d4, M-cdbb93aac376239f7748, M-c3e39fc33a594c40202f
</details>

<details><summary><b>effect-ace</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-fbecf3ec38b4cc094d0e, M-56cb16e6cdcdf5dbd1a1, M-eb968361e3bdc82164ce
</details>

<details><summary><b>effect-four</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: positive (0.105, CI [-0.207, 0.417]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-e23351a3b5866db76481, M-cdbb93aac376239f7748, M-0fbb81ca3aeeda551d13
</details>

<details><summary><b>effect-private-choice</b></summary>

Used in 19.5% of participant observations (39/200). Outcome association: negative (-0.249, CI [-0.415, -0.083]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-a6002589304eda5d8923, M-cdbb93aac376239f7748, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>effect-red-joker</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: positive (0.175, CI [-0.142, 0.491]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-eb968361e3bdc82164ce, M-56cb16e6cdcdf5dbd1a1, M-946f016b3c900b654616, M-690e14c1ad1c3c20a4fe
</details>

<details><summary><b>effect-three</b></summary>

Used in 10.0% of participant observations (20/200). Outcome association: negative (-0.087, CI [-0.321, 0.146]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-de1b456110c82ac594d5, M-cdbb93aac376239f7748, M-e32149ebf24466103ea9
</details>

<details><summary><b>eight-aegis-field</b></summary>

Used in 27.5% of participant observations (55/200). Outcome association: negative (-0.064, CI [-0.221, 0.092]). Immediate point impact: mean 1.50 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-690e14c1ad1c3c20a4fe, M-cdbb93aac376239f7748, M-e32149ebf24466103ea9
</details>

<details><summary><b>eight-scuttle</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-aa8f4a129617fe179fe4
</details>

<details><summary><b>eight-spade-free-scuttle</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (-0.266, CI [-0.521, -0.011]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-fbecf3ec38b4cc094d0e, M-d854e1ad2e3c98faee9f, M-946f016b3c900b654616, M-ce645ce7a5c5594556ee
</details>

<details><summary><b>exhausted-pass</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321
</details>

<details><summary><b>face-down</b></summary>

Used in 54.5% of participant observations (109/200). Outcome association: negative (-0.102, CI [-0.241, 0.037]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-8811e3475a0078c9b67d, M-cdbb93aac376239f7748, M-0a64cce5e87cfe339b3b
</details>

<details><summary><b>face-up-draw</b></summary>

Used in 11.0% of participant observations (22/200). Outcome association: negative (-0.278, CI [-0.482, -0.075]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-cc0bcbd24dd43f95a1b9, M-cdbb93aac376239f7748, M-c37124f0bd32b32d2f71
</details>

<details><summary><b>five-gy-bottom</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-fbecf3ec38b4cc094d0e, M-eb968361e3bdc82164ce, M-c37124f0bd32b32d2f71, M-8f5ba7a1426637e83d01
</details>

<details><summary><b>five-recycle</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: negative (-0.291, CI [-0.572, -0.010]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-8f5ba7a1426637e83d01, M-6e75ba582c29437816eb, M-e32149ebf24466103ea9
</details>

<details><summary><b>five-refine</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.508, CI [-0.578, -0.438]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-fbecf3ec38b4cc094d0e, M-eb968361e3bdc82164ce, M-8f654e4c1d345533ccbf
</details>

<details><summary><b>four-exchange-pr</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-eb968361e3bdc82164ce, M-941d10feb328a0f8bf3e
</details>

<details><summary><b>four-guess-2-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71
</details>

<details><summary><b>four-guess-4-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71
</details>

<details><summary><b>four-guess-7-♦</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71
</details>

<details><summary><b>four-row-clear-er-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-0fbb81ca3aeeda551d13
</details>

<details><summary><b>four-row-clear-er-♥</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f5ba7a1426637e83d01
</details>

<details><summary><b>four-row-clear-er-♦</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-d0bd4d4955859b96f1e3
</details>

<details><summary><b>heart-tempo</b></summary>

Used in 12.0% of participant observations (24/200). Outcome association: negative (-0.047, CI [-0.260, 0.165]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-a6002589304eda5d8923, M-cdbb93aac376239f7748, M-e32149ebf24466103ea9
</details>

<details><summary><b>jack</b></summary>

Used in 44.0% of participant observations (88/200). Outcome association: negative (0.000, CI [-0.141, 0.141]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-0496791615f3cfbfb548, M-cdbb93aac376239f7748, M-657a4bf619e288635b74
</details>

<details><summary><b>jack-pr</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.508, CI [-0.578, -0.438]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-690e14c1ad1c3c20a4fe, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>king</b></summary>

Used in 16.5% of participant observations (33/200). Outcome association: negative (-0.325, CI [-0.490, -0.160]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-8811e3475a0078c9b67d, M-cdbb93aac376239f7748, M-c37124f0bd32b32d2f71
</details>

<details><summary><b>king-anchor</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.513, CI [0.442, 0.583]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-0496791615f3cfbfb548, M-44d7c9fa35f12273eb68, M-c37124f0bd32b32d2f71
</details>

<details><summary><b>king-spade</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c
</details>

<details><summary><b>nine</b></summary>

Used in 5.0% of participant observations (10/200). Outcome association: negative (-0.175, CI [-0.491, 0.142]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-690e14c1ad1c3c20a4fe, M-cdbb93aac376239f7748, M-0fbb81ca3aeeda551d13
</details>

<details><summary><b>nine-anchor-discard</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (0.000, CI [-0.406, 0.406]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-56cb16e6cdcdf5dbd1a1, M-cdbb93aac376239f7748, M-c37124f0bd32b32d2f71
</details>

<details><summary><b>nine-tap</b></summary>

Used in 23.5% of participant observations (47/200). Outcome association: negative (-0.057, CI [-0.221, 0.108]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-cdac69cf264532483783, M-cdbb93aac376239f7748, M-0a64cce5e87cfe339b3b
</details>

<details><summary><b>opponent-attack</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: positive (0.130, CI [-0.213, 0.473]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-eb968361e3bdc82164ce, M-0496791615f3cfbfb548, M-946f016b3c900b654616, M-030616815bfed08a875f
</details>

<details><summary><b>purge-aegis</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-6eb96a20b1344ba12321
</details>

<details><summary><b>purge-anchor-bounce</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-fbecf3ec38b4cc094d0e, M-56cb16e6cdcdf5dbd1a1, M-eb968361e3bdc82164ce
</details>

<details><summary><b>queen</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c9d2d8963a8026c2e2b0, M-d854e1ad2e3c98faee9f, M-c37124f0bd32b32d2f71, M-8f5ba7a1426637e83d01
</details>

<details><summary><b>queen-aegis</b></summary>

Used in 13.5% of participant observations (27/200). Outcome association: negative (-0.089, CI [-0.293, 0.116]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-e8afd8ba50aa2cf5c2ef, M-cdbb93aac376239f7748, M-c37124f0bd32b32d2f71
</details>

<details><summary><b>rank10</b></summary>

Used in 30.5% of participant observations (61/200). Outcome association: negative (-0.012, CI [-0.164, 0.140]). Immediate point impact: mean 4.50 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-56cb16e6cdcdf5dbd1a1, M-cdbb93aac376239f7748, M-e32149ebf24466103ea9
</details>

<details><summary><b>rank10-stack-theft</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (0.000, CI [-0.406, 0.406]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-23b161f118906ca74279, M-cf05fedc6a076a2b8ce9, M-cdbb93aac376239f7748, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>rank3-discard</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.103, CI [-0.333, 0.538]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-cc0bcbd24dd43f95a1b9, M-946f016b3c900b654616, M-941d10feb328a0f8bf3e
</details>

<details><summary><b>rank3-present</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-a6002589304eda5d8923, M-c37124f0bd32b32d2f71, M-030616815bfed08a875f
</details>

<details><summary><b>rank3-take</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-a6002589304eda5d8923, M-c37124f0bd32b32d2f71, M-030616815bfed08a875f
</details>

<details><summary><b>rank5-rummage</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (-0.261, CI [-0.569, 0.048]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-8f5ba7a1426637e83d01, M-6e75ba582c29437816eb, M-e32149ebf24466103ea9
</details>

<details><summary><b>rank6-keep-all-discard</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.510, CI [-0.581, -0.440]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-eb968361e3bdc82164ce, M-152dc2ebb7f84e8d1124, M-116e5b92d1902f724f70
</details>

<details><summary><b>rank6-keep-return-bottom</b></summary>

Used in 6.0% of participant observations (12/200). Outcome association: negative (0.000, CI [-0.318, 0.318]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-56cb16e6cdcdf5dbd1a1, M-cdbb93aac376239f7748, M-c27e931b3ffd72a2bc10
</details>

<details><summary><b>rank6-keep-return-top</b></summary>

Used in 8.0% of participant observations (16/200). Outcome association: negative (-0.384, CI [-0.581, -0.187]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-1ea1d8ce019931620b14, M-cdbb93aac376239f7748, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>rank7-generated-queen-anchor</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-cdbb93aac376239f7748
</details>

<details><summary><b>rank7-generated-red-joker</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6e75ba582c29437816eb
</details>

<details><summary><b>rank7-generated-score</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: positive (0.508, CI [0.438, 0.578]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71, M-946f016b3c900b654616, M-cdbb93aac376239f7748
</details>

<details><summary><b>rank7-hand-and-effect</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-c37124f0bd32b32d2f71, M-946f016b3c900b654616, M-cdbb93aac376239f7748, M-6e75ba582c29437816eb
</details>

<details><summary><b>rank7-hand-and-score</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: negative (-0.308, CI [-0.665, 0.050]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-e8afd8ba50aa2cf5c2ef, M-eec6e8dbac8062940f40, M-030616815bfed08a875f
</details>

<details><summary><b>recycle-five-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f654e4c1d345533ccbf
</details>

<details><summary><b>recycle-five-♦</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bf73664f5127cc77a797, M-d854e1ad2e3c98faee9f
</details>

<details><summary><b>royal-marriage</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: positive (0.505, CI [0.435, 0.575]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-eb968361e3bdc82164ce, M-db10a45b83e5e68eb1fd
</details>

<details><summary><b>score</b></summary>

Used in 76.5% of participant observations (153/200). Outcome association: positive (0.532, CI [0.419, 0.645]). Immediate point impact: mean 3.60 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-0496791615f3cfbfb548, M-cdbb93aac376239f7748, M-0a64cce5e87cfe339b3b
</details>

<details><summary><b>scuttle</b></summary>

Used in 18.0% of participant observations (36/200). Outcome association: negative (-0.260, CI [-0.428, -0.092]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-ce645ce7a5c5594556ee, M-cdbb93aac376239f7748, M-c04f8342320e37395ec0
</details>

<details><summary><b>seven-topdeck</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: negative (-0.144, CI [-0.438, 0.149]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-030616815bfed08a875f, M-cdbb93aac376239f7748, M-eec6e8dbac8062940f40
</details>

<details><summary><b>shuffle-reset</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f5ba7a1426637e83d01
</details>

<details><summary><b>six-dig</b></summary>

Used in 13.0% of participant observations (26/200). Outcome association: negative (-0.237, CI [-0.433, -0.041]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-56cb16e6cdcdf5dbd1a1, M-cdbb93aac376239f7748, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>solo-wild</b></summary>

Used in 5.5% of participant observations (11/200). Outcome association: negative (-0.433, CI [-0.618, -0.249]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-bf73664f5127cc77a797, M-e8afd8ba50aa2cf5c2ef, M-0fbb81ca3aeeda551d13, M-d854e1ad2e3c98faee9f
</details>

<details><summary><b>spade-recovery</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: negative (0.000, CI [-0.354, 0.354]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-a6002589304eda5d8923, M-cdbb93aac376239f7748, M-e32149ebf24466103ea9
</details>

<details><summary><b>super</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: positive (0.370, CI [0.101, 0.639]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-e8afd8ba50aa2cf5c2ef, M-941d10feb328a0f8bf3e, M-b15f0ccdbc77e5d6ea16
</details>

<details><summary><b>super-ace</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: positive (0.058, CI [-0.274, 0.391]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-4dbd281c5bbb2e29b64c, M-9842c2873a237904997e, M-162a3dd6e3f1dcc41083, M-2ed2f5a777fed1ed2bb2
</details>

<details><summary><b>swap-bar</b></summary>

Used in 55.5% of participant observations (111/200). Outcome association: negative (-0.092, CI [-0.231, 0.048]). Immediate point impact: mean 0.00 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-8811e3475a0078c9b67d, M-cdbb93aac376239f7748, M-0a64cce5e87cfe339b3b
</details>

<details><summary><b>three-black-ace</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (0.000, CI [-0.495, 0.495]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-9ac410d55ff6857e19e9, M-9764f9a75800787b9cb7, M-030616815bfed08a875f
</details>

<details><summary><b>three-black-bounce-top</b></summary>

Used in 4.5% of participant observations (9/200). Outcome association: negative (-0.130, CI [-0.473, 0.213]). Immediate point impact: mean 1.50 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-6fde7fe703a4f13b5b61, M-6e75ba582c29437816eb, M-e35cccea15951261a2cc
</details>

<details><summary><b>three-black-clear-er</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.508, CI [-0.578, -0.438]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-e3e961e04b6b65b898c7, M-56cb16e6cdcdf5dbd1a1, M-946f016b3c900b654616, M-030616815bfed08a875f
</details>

<details><summary><b>three-black-clear-pr</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ce099e622a899fa5cb74, M-e8afd8ba50aa2cf5c2ef, M-946f016b3c900b654616, M-28d0b14f0f5d88c51a31
</details>

<details><summary><b>three-black-king</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-d854e1ad2e3c98faee9f, M-a6002589304eda5d8923, M-c04f8342320e37395ec0, M-8811e3475a0078c9b67d
</details>

<details><summary><b>three-black-purge-anchor-bounce</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: positive (0.503, CI [0.433, 0.572]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-030616815bfed08a875f
</details>

<details><summary><b>three-black-queen</b></summary>

Used in 3.0% of participant observations (6/200). Outcome association: negative (-0.308, CI [-0.665, 0.050]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-63ffa5487eb8677b1b3e, M-946f016b3c900b654616, M-56cb16e6cdcdf5dbd1a1
</details>

<details><summary><b>three-black-total-clear</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.508, CI [-0.578, -0.438]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-aa8f4a129617fe179fe4, M-0496791615f3cfbfb548, M-afdcc6f2781ba6f857b7
</details>

<details><summary><b>three-bounce-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-e8afd8ba50aa2cf5c2ef
</details>

<details><summary><b>three-bounce-♣</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-8f654e4c1d345533ccbf
</details>

<details><summary><b>three-force-discard</b></summary>

Used in 3.5% of participant observations (7/200). Outcome association: negative (-0.222, CI [-0.564, 0.120]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-cc0bcbd24dd43f95a1b9, M-946f016b3c900b654616, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>three-hand</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (0.000, CI [-0.696, 0.696]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-6eb96a20b1344ba12321
</details>

<details><summary><b>three-points</b></summary>

Used in 1.5% of participant observations (3/200). Outcome association: negative (-0.169, CI [-0.707, 0.369]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-6eb96a20b1344ba12321, M-8811e3475a0078c9b67d
</details>

<details><summary><b>three-present-take</b></summary>

Used in 2.0% of participant observations (4/200). Outcome association: negative (-0.255, CI [-0.685, 0.175]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-a6002589304eda5d8923, M-c37124f0bd32b32d2f71, M-030616815bfed08a875f
</details>

<details><summary><b>three-red-counter</b></summary>

Used in 45.0% of participant observations (90/200). Outcome association: positive (0.082, CI [-0.058, 0.221]). Immediate point impact: mean 0.80 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-690e14c1ad1c3c20a4fe, M-cdbb93aac376239f7748, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>topdeck-seven-♣</b></summary>

Used in 1.0% of participant observations (2/200). Outcome association: negative (-0.505, CI [-0.575, -0.435]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-6eb96a20b1344ba12321, M-690e14c1ad1c3c20a4fe
</details>

<details><summary><b>total-clear</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.255, CI [-0.175, 0.685]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-ce099e622a899fa5cb74, M-56cb16e6cdcdf5dbd1a1, M-0fbb81ca3aeeda551d13, M-eec6e8dbac8062940f40
</details>

<details><summary><b>total-clear-♠</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-eb968361e3bdc82164ce
</details>

<details><summary><b>two-hold</b></summary>

Used in 2.5% of participant observations (5/200). Outcome association: positive (0.308, CI [-0.050, 0.665]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-1197243e3d684bf9b83d, M-e8afd8ba50aa2cf5c2ef, M-e32149ebf24466103ea9, M-b15f0ccdbc77e5d6ea16
</details>

<details><summary><b>ultra</b></summary>

Used in 75.5% of participant observations (151/200). Outcome association: negative (-0.041, CI [-0.202, 0.120]). Immediate point impact: mean 0.39 over undefined measured declarations. Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-0496791615f3cfbfb548, M-cdbb93aac376239f7748, M-152dc2ebb7f84e8d1124
</details>

<details><summary><b>voltage</b></summary>

Used in 4.0% of participant observations (8/200). Outcome association: negative (-0.261, CI [-0.569, 0.048]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-dcc47c0a70b0e1ec0c2c, M-eb968361e3bdc82164ce, M-c37124f0bd32b32d2f71, M-8f5ba7a1426637e83d01
</details>

<details><summary><b>wild-sovereignty</b></summary>

Used in 0.5% of participant observations (1/200). Outcome association: negative (-0.503, CI [-0.572, -0.433]). Evidence grade: INSUFFICIENT (insufficient).

Replay refs: M-eec6e8dbac8062940f40
</details>

## Synergy Findings

| Pair | Class | Effect | Shrunk | q-value | Status |
|------|-------|--------|--------|---------|--------|
| jack::eight-aegis-field | synergy | 1.333 | 1.201 | 0.9090 | inconclusive |

## Causal Motifs

- **score → score** — 48 occurrence(s), 12 matches
- **unclassified → score** — 26 occurrence(s), 12 matches
- **score → unclassified** — 16 occurrence(s), 11 matches
- **face-down → unclassified** — 14 occurrence(s), 9 matches
- **unclassified → 2-black-2-red-draw** — 11 occurrence(s), 10 matches
- **2-black-2-red-draw → score** — 6 occurrence(s), 6 matches
- **score → nine-tap** — 5 occurrence(s), 5 matches
- **unclassified → draw** — 5 occurrence(s), 5 matches
- **2-black-2-red-draw → disrupt** — 4 occurrence(s), 4 matches
- **draw → unclassified** — 3 occurrence(s), 3 matches
- **nine-tap → nine-tap** — 3 occurrence(s), 3 matches
- **score → disrupt** — 3 occurrence(s), 3 matches
- **score → face-down** — 3 occurrence(s), 3 matches
- **ace-base → ace-base** — 2 occurrence(s), 1 matches
- **disrupt → ace-spade** — 2 occurrence(s), 2 matches
- **disrupt → eight-aegis-field** — 2 occurrence(s), 1 matches
- **disrupt → score** — 2 occurrence(s), 2 matches
- **disrupt → three-red-counter** — 2 occurrence(s), 2 matches
- **draw → face-down** — 2 occurrence(s), 2 matches
- **eight-aegis-field → eight-aegis-field** — 2 occurrence(s), 1 matches

## Anomalies

27 anomaly/anomalies: ORCHESTRATION_DENSITY (21), LONG_MATCH (5), RESPONSE_CHAIN_INTENSITY (1).

- ORCHESTRATION_DENSITY: 21
- LONG_MATCH: 5
- RESPONSE_CHAIN_INTENSITY: 1

## Recommendations

- Most synergy findings are inconclusive — consider increasing match count for statistical power.
- 82 mechanic(s) have sample size below 20 — interpret with caution.

## Interpretation Boundary

Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.

