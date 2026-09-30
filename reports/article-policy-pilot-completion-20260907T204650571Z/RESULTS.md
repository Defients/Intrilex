# Completed Intrilex current-runtime policy pilot

Profile: core-advanced-authority. Git HEAD: c43edb98ac5de59111d8ae2b86c80a9493d44af3.

Study games: 348 (216 original + 132 completion); preflight executions: 12. Complete: false. Stable input hashes: true.

| A | B | Seeds | A-B-draw | A win % | Wilson95 descriptive | Paired bootstrap95 | Seed + / - / 0 | Sign p | Holm p | Mean scores A:B | Turns | Decisions |
|---|---|---:|---|---|---|---|---|---:|---:|---|---:|---:|
| score-rush | tempo | 16 | 18-14-0 | 56.3% | 39.3% to 71.8% | 43.8% to 68.8% | 3/1/12 | 0.625 | 1.00 | 18.75:18.41 | 4.59 | 15.19 |
| score-rush | control | 16 | 28-4-0 | 87.5% | 71.9% to 95.0% | 75.0% to 96.9% | 12/0/4 | 0.000488 | 0.00439 | 22.13:5.91 | 13.47 | 35.69 |
| score-rush | value | 16 | 18-14-0 | 56.3% | 39.3% to 71.8% | 50.0% to 65.6% | 2/0/14 | 0.500 | 1.00 | 19.56:18.63 | 4.78 | 15.63 |
| score-rush | hybrix-rusher-hard | 16 | 17-15-0 | 53.1% | 36.4% to 69.1% | 40.6% to 65.6% | 3/2/11 | 1.00 | 1.00 | 19.72:20.16 | 4.59 | 15.81 |
| tempo | control | 16 | 28-4-0 | 87.5% | 71.9% to 95.0% | 75.0% to 96.9% | 12/0/4 | 0.000488 | 0.00439 | 23.28:4.81 | 15.66 | 41.91 |
| tempo | value | 16 | 13-19-0 | 40.6% | 25.5% to 57.7% | 28.1% to 53.1% | 1/4/11 | 0.375 | 1.00 | 17.78:19.16 | 5.41 | 17.16 |
| tempo | hybrix-rusher-hard | 16 | 11-21-0 | 34.4% | 20.4% to 51.7% | 18.8% to 50.0% | 2/7/7 | 0.180 | 1.00 | 16.84:21.28 | 5.00 | 16.59 |
| control | value | 16 | 6-26-0 | 18.8% | 8.9% to 35.3% | 6.3% to 34.4% | 1/11/4 | 0.00635 | 0.0444 | 5.97:21.78 | 12.69 | 34.19 |
| control | hybrix-rusher-hard | 16 | 2-30-0 | 6.3% | 1.7% to 20.1% | 0.0% to 15.6% | 0/14/2 | 0.000122 | 0.00122 | 4.00:22.69 | 12.03 | 33.31 |
| value | hybrix-rusher-hard | 16 | 16-16-0 | 50.0% | 33.6% to 66.4% | 34.4% to 65.6% | 3/3/10 | 1.00 | 1.00 | 19.25:20.06 | 4.72 | 16.09 |

## Mirrors

| Policy | Games | P1 wins | P2 wins | Draws | P1 Wilson95 | Mean turns |
|---|---:|---:|---:|---:|---|---:|
| score-rush | 6 | 4 | 2 | 0 | 30.0% to 90.3% | 4.00 |
| tempo | 6 | 2 | 4 | 0 | 9.7% to 70.0% | 6.33 |
| control | 6 | 3 | 2 | 1 | 18.8% to 81.2% | 46.83 |
| value | 5 | 4 | 1 | 0 | 37.6% to 96.4% | 5.00 |
| hybrix-rusher-hard | 5 | 3 | 2 | 0 | 23.1% to 88.2% | 4.40 |

## Diagnostics

Canonical 348/348; capped 0; invalid 0; errors 0; rejected commands 0; compliance violations 0. Total policy decisions 8788; total commands 30012; maximum decisions per game 142 (cap 1800).

## Limitations

- Only 16 deterministic seed clusters per pairing; common seeds across comparisons; no independent 320-game sample.
- Wilson intervals are descriptive marginal summaries, not paired-data inferential intervals. Paired bootstrap and exact sign tests use seed clusters. Holm correction is supplementary.
- Existing heuristic configurations, not optimized or human-meta policies. HYBRIX memory receives own pending action records through this adapter; no opponent-learning or adaptation ablation claim.
- Default bounded profile only. No unrestricted/full-rules pilot or optional 32-seed expansion performed because of cost.
- Dirty snapshot: local runtime/upstream dist match byte-for-byte, but no build/transpile source certification performed.
- Replay verification covers 10 preflight runs, not every study game. Full decision logs and hashes are retained for study runs.

Original artifacts: reports/article-policy-pilot-20260907T203340644Z. Combined study results: combined-study-raw-matches.jsonl. Each row names its source directory for full decision logs.
