# Performance

Status: **PASS**

## Environment

- v22.16.0 linux/x64
- Certified summaries: **100**
- Scaled responsiveness rows: **10,800** (deterministic repetition for UI-scale testing only)
- Mechanics: **119**
- Synergy estimates: **229**

## Measurements

| Workload | Median | p95 |
|---|---:|---:|
| Summary NDJSON parse | 1.60 ms | 6.05 ms |
| Observatory JSON parse | 2.85 ms | 4.37 ms |
| 10,800-row cross-filter | 0.25 ms | 0.56 ms |
| Mechanics filter/rank | 0.01 ms | 0.01 ms |
| Synergy filter/rank | 0.01 ms | 0.04 ms |

Cross-filter p95 is within the 200 ms target. The 10,800-row workload measures data interaction scale, not 10,800 independent match findings. Browser frame-time evidence is limited to rendered Chromium smoke and responsive screenshots; no unsupported frame-rate claim is made.
