# Benchmark Report

## Node replay verification

- Environment: v22.14.0 win32/x64
- Governing replays: **121**
- Commands: **285**
- Events: **373**
- Duration: **259.93 ms**
- Throughput: **465.5 replays/s**
- RSS: **47.1 MiB**

## Chromium parity workload

- Status: **PASS**
- Main thread: **807 ms**
- Web Worker: **798 ms**
- Node/browser/Worker hash: `0f38ef8a8b0bb0502937f88f5b678b233328fc9d0a5569bf0a39831ee97c108c`

## Advanced Core campaign throughput

- workers-2: **1.36 matches/s** (100 matches; 2 workers)
- workers-4: **2.38 matches/s** (100 matches; 4 workers)
- workers-4-clean-rerun: **2.48 matches/s** (100 matches; 4 workers)

Every execution produced canonical result hash `7c089f6de736399a9cd74e0db93ae30245e90e216d5a558ee2bdce5e2bc9f975`.

Advanced campaign figures apply only to the bounded two-player Core authority profile.
