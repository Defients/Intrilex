# Intrilex current-runtime policy pilot

Output: reports/article-policy-pilot-20260907T203340644Z

Git HEAD: c43edb98ac5de59111d8ae2b86c80a9493d44af3

Study games: 216; preflight executions: 12. Stop: STUDY_TIME_BUDGET. Stable input hashes: true.

| Profile | A | B | Seeds | A-B-draw | A win % | Wilson95 (descriptive) | Paired bootstrap95 | Seed + / - / 0 | Sign p | Mean turns |
|---|---|---|---:|---|---|---|---|---|---:|---:|
| core-advanced-authority | score-rush | tempo | 11 | 13-9-0 | 59.1% | 38.7% to 76.7% | 40.9% to 77.3% | 3/1/7 | 0.625 | 4.59 |
| core-advanced-authority | score-rush | control | 11 | 18-4-0 | 81.8% | 61.5% to 92.7% | 68.2% to 95.5% | 7/0/4 | 0.0156 | 12.27 |
| core-advanced-authority | score-rush | value | 11 | 12-10-0 | 54.5% | 34.7% to 73.1% | 50.0% to 63.6% | 1/0/10 | 1.00 | 4.55 |
| core-advanced-authority | score-rush | hybrix-rusher-hard | 11 | 11-11-0 | 50.0% | 30.7% to 69.3% | 36.4% to 63.6% | 1/1/9 | 1.00 | 4.73 |
| core-advanced-authority | tempo | control | 11 | 18-4-0 | 81.8% | 61.5% to 92.7% | 68.2% to 95.5% | 7/0/4 | 0.0156 | 12.23 |
| core-advanced-authority | tempo | value | 11 | 9-13-0 | 40.9% | 23.3% to 61.3% | 22.7% to 59.1% | 1/3/7 | 0.625 | 5.36 |
| core-advanced-authority | tempo | hybrix-rusher-hard | 11 | 7-15-0 | 31.8% | 16.4% to 52.7% | 13.6% to 50.0% | 1/5/5 | 0.219 | 5.23 |
| core-advanced-authority | control | value | 11 | 6-16-0 | 27.3% | 13.2% to 48.2% | 9.1% to 45.5% | 1/6/4 | 0.125 | 12.14 |
| core-advanced-authority | control | hybrix-rusher-hard | 10 | 1-19-0 | 5.0% | 0.9% to 23.6% | 0.0% to 15.0% | 0/9/1 | 0.00391 | 11.50 |
| core-advanced-authority | value | hybrix-rusher-hard | 10 | 11-9-0 | 55.0% | 34.2% to 74.2% | 40.0% to 70.0% | 2/1/7 | 1.00 | 4.70 |

## Mirrors (not superiority evidence)

| Policy | Games | P1 wins | P2 wins | Draws | P1 Wilson95 |
|---|---:|---:|---:|---:|---|
| score-rush | 0 | 0 | 0 | 0 | - |
| tempo | 0 | 0 | 0 | 0 | - |
| control | 0 | 0 | 0 | 0 | - |
| value | 0 | 0 | 0 | 0 | - |
| hybrix-rusher-hard | 0 | 0 | 0 | 0 | - |

## Boundaries

Exploratory fixed-runtime heuristic pilot. Wilson intervals are descriptive marginal summaries; paired-seed estimates and sign tests honor AB/BA clustering. Different pairings reuse seeds, so do not pool games as independent. Unequal policy sample sizes and selected sensitivity pairs do not establish a global ranking. No adaptation ablation, human comparison, or clean-release source certification.

All raw per-game summaries, configuration, cap/invalid status, action diagnostics, and trajectory hashes are in raw-matches.jsonl. Full selected-decision records are in decisions-*.json.gz. Replay-certified preflight cases are in replay-*.json.gz. Seeds and conditional cost gates were written before study games. Input source and runtime hashes are preserved before and after. No gameplay changes or builds were made.
