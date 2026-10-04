# Strategy Intelligence validation record

October 4, 2026, America/New_York. Local Windows checkout:
`H:\myProjects\Intrilex-MASTER\Intrilex_dev-current`.
Native Chrome `154.0.8037.93`; Node `v22.14.0`.

This record describes executable local evidence, not remote CI, deployment or
production certification. Engine/rules and policy implementations were not
edited. New observation/analysis sources intentionally change the scientific
runtime fingerprint. Original historical artifacts are not rewritten.

## Final checks

| Check | Result | Local evidence |
| --- | --- | --- |
| Strategy scientific regressions | PASS, 40/40 | `reports/local/strategy-unit.log` |
| Strategy native Chrome acceptance | PASS, 22 scenarios, no page errors, including final single-landmark markup | `reports/local/strategy/browser/acceptance.json` |
| Full repository suite | PASS, 5,484 total / 5,470 passed / 14 skipped / 0 failed or cancelled, 423.51 s | `reports/local/strategy-full-test.log` |
| Existing Evolution execution/cockpit/analytics browser suites | PASS, 34 scenarios, no page errors | `reports/local/strategy-regression-evolution-browser.log` |
| Existing Profile browser suite | PASS, 17 scenarios, no page errors | `reports/local/strategy-regression-profiles-browser.log` |
| Existing Profile Arena browser suite | PASS, 7 scenarios | `reports/local/strategy-regression-arena-browser.log` |
| Root and client typecheck | PASS | `reports/local/strategy-typecheck.log` |
| Build | PASS, final assets rebuilt and accepted in Chrome | `reports/local/strategy-build.log` |
| Repository lint | PASS, 0 errors / 422 existing warnings | `reports/local/strategy-lint-full.log` |
| Focused Strategy lint, including browser `.mjs` | PASS, 0 errors / warnings | `reports/local/strategy-lint-focused.log` |
| Small real-workload benchmark | PASS | `reports/local/strategy/benchmark.json` |

The fourteen skips are one absent legacy engine-corpus check and thirteen
service-worker checks explicitly disabled by the existing PWA kill switch.
They are not counted as passes. The final full suite used stable assets; the
subsequent semantic markup adjustment was rebuilt and rechecked by the Strategy
Chrome suite. No scientific source changed after the final full-suite run.

Combined native Chrome acceptance/regression coverage: eighty scenarios across
Strategy, Evolution, Profiles and Profile Arena. Profile browser console output
includes existing missing/aborted optional public-replay fetches; its acceptance
report records no page errors. No browser-console perfection claim is made.

The 40 scientific tests exercise real engine trajectories, canonical identities,
legal opportunity/selection sets, mirrored checkpoint/head mapping, slim worker
metadata, authorized context, null signals, privacy rejection, maturity fixtures,
source/transcript binding, opportunity normalization, filtering, fault exclusion,
era isolation, old fidelity, tampered imports, confidence ceilings/uncertainty,
deterministic prose and provenance, exact reconstruction, fixed-budget paired
continuations, checkpoint immutability, cancellation/censoring, motif boundaries,
guide honesty, CI/build integration, distinct branch claims and shared mirrored
transcripts. Counterfactual tests execute and reproduce actual continuations.

Chrome acceptance exercises fresh/empty onboarding, all shipped ranks, keyboard
details and the single main landmark, real paired worker production, byte-for-byte
Node/browser result and decision parity, timing/skip denominators, context and
matchup filters, policy and checkpoint comparison, actual committed branch studies,
visible errors/retry, guide/manifest exports, discovery states, bundles, immutable
conflict rollback and duplicate-row transactions, partial historic fidelity,
historical execution isolation, imported original-ID preservation and unverified
archives, three viewport widths, completed local human/AI capture, real weighted
Profile H1/H2 capture/comparison and owned-worker route cancellation.

The imported-only acceptance check verifies that original sealed evidence is
preserved byte-for-byte, exported operational origins remain unverified, and
external studies survive in the separate archive without entering trusted guides.
Historical fixtures and disposable authored test Profiles are labeled explicitly.

## Measured small-workload performance

`pnpm run benchmark:strategy` ran three alternating baseline/deep pairs after
warm-up, eight mirrored Value/Tempo games per run, master seed 1337, one worker.
Machine: Intel Core i7-13700F; no full regression run was active during measurement.

| Metric | Observed |
| --- | --- |
| Decisions in one eight-game workload | 192 |
| Baseline median | 2,383.03 ms |
| Deep-capture median | 2,854.40 ms |
| Incremental deep-capture time | 19.78% |
| Total game-envelope bytes | 1,798,441 bytes |
| Envelope bytes per decision | 9,366.88 bytes, about 9.1 KiB |
| Largest game envelope | 388,413 bytes, about 379 KiB |
| Retained replay list | 161,748 bytes |
| Pure streaming aggregate median | 0.383 ms, twenty repetitions over those 192 rows |

Action-sequence and final-state hashes matched traced/untraced runs. Deep
evidence is optional; UI producers are bounded. Cursor queries do not collect
a campaign-sized array. The reverse follow-up pass avoids scanning every later
decision separately. Portable envelopes and indexed rows duplicate some disk
storage; the envelope metric is not total IndexedDB disk usage. Aggregate timing
excludes IndexedDB cursor cost. No million-game, million-event or cloud benchmark
was run, and no large-scale speed claim follows from this small workload.

## Defects found and repaired during validation

- Slim worker metadata omitted top-level purpose; capture now uses the validated
  configuration's purpose rather than introducing undefined scientific JSON.
- Evidence refresh cleared work errors too early; errors remain visible until
  explicit retry/new work.
- Equal branch labels/outcomes collapsed different legal alternatives into one
  claim ID; exact alternative IDs now enter claim identity. Duplicate rows in
  one transaction are idempotent; conflicting duplicates fail before mutation.
- Mirrored transcript deduplication made ordinal-only lookup miss available
  replay evidence; verified replay-ID resolution preserves existing retention.
- A generated browser identity was imported eagerly by the pure replay-library
  dependency; it now loads only inside browser decision capture. Existing replay
  export/render tests pass without a generated source identity file.

An intermediate full-suite run overlapped an asset rebuild and lost a generated
puzzle module; an intermediate browser regression used an older fingerprint.
Those intermediate runs are not final evidence. The final run uses a completed
build without concurrent asset mutation.

## Explicit limits and unverified boundaries

Exact hidden-state branches are RESEARCH_ONLY, not normal player advice. One
recorded position is not replicated strategic evidence. Observational decision
states are correlated; no fabricated independent-state count or causal interval
is produced. No Strong/Established strategy conclusions are generated.

Motifs are a bounded exploration sample, not an exhaustive campaign census.
Network/legacy replays without authorized decision capture remain summaries.
There is no new cloud persistence, destructive retention manager, justified
information-set sampler or multi-state replication orchestrator. Private local
research bundles contain retained engine transcripts; normal public replay
exports remain unchanged.

Remote CI, deployment parity, live multiplayer infrastructure, production
certification, a fresh-profile offline run and human visual acceptance: NOT_RUN.
No commit, push or deployment is part of this change.
