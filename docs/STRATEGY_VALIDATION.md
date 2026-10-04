# Strategy Intelligence validation record

October 4, 2026, America/New_York. Local Windows checkout:
`H:\myProjects\Intrilex-MASTER\Intrilex_dev-current`.
Native Chrome `154.0.8037.93`; Node `v22.14.0`.

This record describes executable local evidence, not remote CI, deployment or
production certification. Engine/rules and policy implementations were not
edited. New observation/analysis sources intentionally change the scientific
runtime fingerprint. Original historical artifacts are not rewritten.

## Information-set V1.1 hardening pass — final local validation

October 4, 2026, America/New_York. This section supersedes the V1
information-set record below for subject binding, symmetric inference,
Quick Read priority and inference calibration. Scientific fingerprint:
`b9a4cf9dcef22a556a96821192305d91553903d9bcb249e33821e619cacb5e6f`.

### Defects fixed (audit detail: docs/INFORMATION_SET_AUDIT.md)

1. **Subject binding.** `requestedSubject` is validated against the legal
   opportunity set and frozen into the sealed V2 plan; the recorded action is
   only the reference. A `rank:3` study launched over a recorded Draw stays a
   `rank:3` study or fails closed. Subject-aware dispositions
   (`USES_SUBJECT`, `PRESERVES_SUBJECT`, `CONSUMES_SUBJECT_OTHER_WAY`,
   `SUBJECT_UNAVAILABLE_AFTER_ACTION`, `DOES_NOT_INVOLVE_SUBJECT`) are computed
   from actual source handles plus authoritative after-state, bound to all
   matching visible copies for card/rank/suit subjects.
2. **Symmetric inference.** Precommitted `alternative − reference` contrasts
   are interpreted symmetrically by a sealed study `assessment`:
   `ALTERNATIVE_DOMINATES`, `REFERENCE_DOMINATES_ALL` (only when every tested
   alternative is dominated — never global optimality), `MIXED_DIRECTIONS`,
   `PARTIAL_REFERENCE_ADVANTAGE`, `UNRESOLVED`, `NOT_EVALUATED`. Claims carry
   `requestedSubject`, `referenceActionId`, `alternativeActionId`, `direction`,
   `dispositions`, `referenceDispositions` and `testedAlternatives` in
   `statementData` under the unchanged `STRATEGY_CLAIM_V1` contract.
3. **Quick Read priority.** Deterministic evidence hierarchy: actionable
   current controlled claim → other admissible controlled evidence →
   observational usage → unknown. Observational prose cannot overwrite
   controlled evidence; imported/historical/research-only/volatile/non-clean
   artifacts never drive the top answer.
4. **Inference practicality.** New V2 plans adopt
   `WORLD_PAIRED_EMPIRICAL_BERNSTEIN_BONFERRONI_95_V1` (variance-sensitive,
   valid for any bounded distribution, documented zero-variance floor,
   familywise Bonferroni across planned alternatives, worlds — not
   continuation repetitions — as independent N). V1 plans keep Hoeffding
   semantics forever; sealed artifacts are never re-interpreted.

### Method decision

Hoeffding + Bonferroni (V1) is valid at every variance but needs ~23.5 pp
observed effect at N=256/m=2 to certify the 5 pp floor. Paired Student-t was
rejected: asymptotic, invalid for degenerate/heavy-tailed small-N world
effects, and its interval collapses to zero width at zero variance — fake
certainty. Empirical Bernstein (AMS bound) is valid for any bounded
distribution at finite n, tightens with observed variance, and its additive
`3·ln(3m/0.05)/N` term keeps a floor at zero variance. At worst-case variance
it is slightly wider than V1 — conservative by construction, not chosen for
more Suggestive results. Full comparison: docs/INFORMATION_SET_STUDIES.md.

### World-count resolution and real benchmark

Approximate minimum resolvable effect (pp above the 5 pp floor, m=2):
V=0: 49.9/27.4/16.2/10.6/7.8; V=0.25: 77.2/46.8/29.9/20.3/14.6; worst case
V=1: 104.6/66.1/43.6/30.0/21.5 at N=32/64/128/256/512 — vs V1 Hoeffding
57.3/42.0/31.2/23.5/18.1 at any variance. The sampler ordinal domain was
raised 256→511 to match the accepted budget; ordinals 0–255 produce identical
worlds, so plans ≤256 worlds are unchanged.

`scripts/benchmark-information.mjs` real matched-world studies (3 actions × 2
continuations, Value/Tempo frozen checkpoints, same opening information set,
single-threaded Node on i7-13700F; all COMPLETE, 0 rejections, 0 faults):

| Worlds | Branch executions | Elapsed | exec/s | Artifact size |
| --- | --- | --- | --- | --- |
| 64  | 384   | 119,119 ms  | 3.22 | 185,983 B   |
| 128 | 768   | 231,637 ms  | 3.32 | 354,572 B   |
| 256 | 1,536 | 453,668 ms  | 3.39 | 692,377 B   |
| 512 | 3,072 | 954,447 ms  | 3.22 | 1,367,970 B |

~3.2-3.4 real game continuations per second, ~0.54-0.56 accepted worlds per
second. A 512-world opt-in study takes ~16 min in a cancellable background
worker — long but feasible, and it is the only configuration that can certify
moderate-dispersion effects under ~15 pp. Browser cancellation and route-exit
termination are verified by acceptance scenarios.

### Real end-to-end result (V2)

`reports/local/strategy/browser/information-real-study.json`: the real UI
study, requested subject `family:phase`, reproduced byte-for-byte through the
Node authority — 4 worlds, 24 executions, COMPLETE, UNRESOLVED, intervals
[-1,1] → Experimental / UNKNOWN. `real-study.json`/`real-claims.json` and the
512-world benchmark tell the same honest story on the static Value/Tempo
fixture: observed +3.7 pp [-6.2, +13.6] and +4.1 pp [-4.4, +12.6] at N=512,
heterogeneity UNRESOLVED → Experimental / UNKNOWN. No real Suggestive
recommendation was manufactured; a null result is the truthful result.
`synthetic-ui-fixture.json` remains clearly labeled engineered evidence for
UI/confidence acceptance only.

### VERIFIED LOCALLY (final build, fingerprint b9a4cf9d)

- Focused Strategy tests: PASS — 170/170 (65 information + 105 intelligence).
- Full repository suite: PASS — 5,549 tests, 5,535 pass, 0 fail, 14 skipped
  (~413 s). An earlier run under concurrent benchmark+Chrome load showed two
  worker-count-invariance failures in `agent-profile-science.test.mjs`; both
  pass standalone and in the final clean suite — environmental load flakes,
  not defects of this pass.
- Chrome acceptance: Strategy 34/34, Evolution 34 (13 arena + 11 cockpit +
  10 analytics), Profiles 17/17, Profile Arena 7/7 — all on Chrome
  154.0.8037.93 against the final dist. Two intermediate runs failed on
  stale dist/artifact fingerprints (`resultHash` mismatch,
  `INCOMPATIBLE_IMPLEMENTATION`); root cause was a rebuild ordering issue,
  not test defects — all pass cleanly on the final build.
- Build: PASS. Typecheck (`tsc --noEmit`): PASS, 0 errors.
- Lint: PASS, 0 errors, 422 pre-existing warnings; focused lint on every
  touched file: 0 errors, 0 warnings.
- V1 sealed-plan compatibility: historical plans validate under original
  Hoeffding semantics (test: "historical V1 plans keep Hoeffding semantics").

### NOT VERIFIED

Remote CI, deployment, production certification, human visual acceptance,
and any machine other than this Windows checkout: NOT_RUN. Browser
responsiveness at 512 worlds inside the UI worker is benchmarked at Node
level only (executions are identical; the browser path is exercised at 4
worlds plus cancellation/route-exit scenarios).

### Limits and remaining blocker

Opening-only scope: certified first prepared P1 Start decision, unmodified
Core setup, uniform unseen assignment + fresh engine RNG (a conditional
model, not the posterior of the original deal), frozen continuation policies,
world-level paired effects. Moderate-dispersion effects below ~15 pp still
cannot certify inside the 512-world cap; a ~10 pp effect at V≈0.25 needs
roughly 2,000 worlds — beyond any offered budget by design. The exact
blocker to broader strategy advice is unchanged: there is no remembered-
information ledger or midgame information-set reconstruction, and only
opening decision evidence exists. Knowledge Farm, campaign orchestration and
multi-state replication remain out of scope.

## Information-set bridge: final local validation

October 4, 2026, America/New_York. This section supersedes the historical
Strategy baseline below for the current opening Information-set implementation.
Scientific fingerprint: `f2520db223a9314b85309348e5846e68d402eebe405bdc5ffee0d3a43ea43486`.

| Check | Result | Local evidence |
| --- | --- | --- |
| Focused Strategy tests | PASS: 85 passed, zero failures/skips | `reports/local/information-focused.log` |
| Full repository suite | PASS: 5,529 total, 5,515 passed, 14 skipped, zero failed/cancelled; 371.77 s | `reports/local/information-full-test.log` |
| Strategy Chrome acceptance | PASS: 32 scenarios, zero page errors | `reports/local/strategy/browser/acceptance.json`, `reports/local/information-browser.log` |
| Evolution Chrome regression | PASS: 34 scenarios | `reports/local/information-evolution-browser.log` |
| Profiles Chrome regression | PASS: 17 scenarios | `reports/local/information-profiles-browser.log` |
| Profile Arena Chrome regression | PASS: 7 scenarios | `reports/local/information-arena-browser.log` |
| Build | PASS | `reports/local/information-build.log` |
| Root/client typecheck | PASS | `reports/local/information-typecheck.log` |
| Repository lint | PASS: zero errors, 422 existing warnings | `reports/local/information-lint.log` |
| Focused lint | PASS: zero errors/warnings | `reports/local/information-lint-focused.log` |

The 14 skips are the existing absent legacy corpus check and 13 checks disabled
by the existing PWA kill switch. Combined browser coverage is 90 scenarios in
Chrome 154.0.8037.93; Node is v22.14.0. Existing optional Profile replay fetch
noise remains; these results do not claim a silent browser console.

### Real end-to-end result

`reports/local/strategy/browser/information-real-study.json` is the actual UI
study, reproduced byte-for-byte through the Node authority. The frozen authored
`weighted-heuristic-v1` checkpoint faced `value`: four accepted worlds, zero
rejections, continuation seeds 101 and 102, three action branches, and a 300-step
budget. All 24 executions completed cleanly. Both alternative effects were 0.0,
with simultaneous intervals [-1, 1]. Heterogeneity was UNRESOLVED for one and
VOLATILE for the other. Both claims remain Experimental / UNKNOWN.

`reports/local/strategy/information/real-study.json` is a separate real static
Value/Tempo study. Its two effects were +0.25 with intervals [-1, 1], so it also
produces Experimental / UNKNOWN. Its observed execution cost was 8,469.8526 ms
under concurrent validation, not a scalability benchmark. Serialized JSON sizes
were 27,794 bytes for the study, 3,210 for the plan, 11,509 for the Information-set,
and 11,653 for claims: 54,166 bytes combined, not IndexedDB disk usage. A collection
of complete hidden states is not persisted.

`synthetic-ui-fixture.json` and the responsive Suggestive screenshots use clearly
labeled engineered terminal scores for acceptance only. They are not discoveries
and must not be cited as real evidence.

### Scientific and lifecycle coverage

The 45 added tests cover authorization, strict opening certificates, deck
conservation, hidden-state anti-leakage, legal equivalence, deterministic world
sampling, immutable plans/checkpoints, matched continuations, independent-world
inference, heterogeneity, trust and confidence gates, cancellation/fault invalidation,
and replay. The anti-leak test changes opponent cards, facedown Swap Bar cards,
draw order, source RNG seed and cursor while keeping the authorized input equal.
The two raw source hashes differ; their Information-set IDs, six-world manifests
and complete reconstructed world arrays match exactly under sampler seed 88.
Current source/Information-set hashes are recorded in
`reports/local/strategy/information/measurement.json` and `anti-leakage.json`.

Browser coverage includes real execution and Node reproduction, pre-execution
IndexedDB plan commit, frozen transported inputs, late Stop/result races, route
cancellation, fault/censor handling, v1 database migration, unverified V2 import
and re-export, confidence rendering, keyboard disclosure and responsive layouts.
The original exact-state branch remains RESEARCH_ONLY. Imported studies never
become trusted local guides without reproduction.

### Delivery scope and limits

Modified files: `CHANGELOG.md`, `README.md`,
`apps/lab-web/src/strategy/strategy-store.mjs`,
`apps/lab-web/src/strategy/strategy-workspace.js`, `apps/lab-web/src/worker.js`,
`docs/STRATEGY_AUDIT.md`, `docs/STRATEGY_INTELLIGENCE.md`, this validation record,
`package.json`, `packages/simulation-runtime/package.json`,
`packages/simulation-runtime/src/strategy-analysis.mjs`,
`packages/simulation-runtime/src/strategy-evidence.mjs`, `scripts/build.mjs`,
`scripts/ci.mjs`, `scripts/evolution-identity.mjs`, and `scripts/strategy-browser.mjs`.
New files: `docs/INFORMATION_SET_AUDIT.md`, `docs/INFORMATION_SET_STUDIES.md`,
`packages/simulation-runtime/src/strategy-information.mjs`, and
`test/strategy-information.test.mjs`. Engine and policy mechanics are unchanged.
Generated Observatory test artifacts were restored to their original contents.

Support is restricted to the certified first prepared P1 Start decision in
canonical two-player Core setup. The model is uniform unseen-card allocation
plus fresh engine randomness; it is not a posterior over the original deal seed.
General midgame sampling remains unavailable. Resume verifies by replaying the
frozen plan, rather than accelerating from an incremental execution checkpoint.
No Strong/Established producer, Knowledge Farm or campaign orchestration was added.
Remote CI, deployment, production certification and human offline acceptance
remain NOT_RUN / unverified. No commit, push or deployment was performed.

## Historical Strategy baseline

The following record predates the opening Information-set bridge. Its statement
that no justified Information-set sampler existed is superseded only for the
certified opening scope described above; its general-midgame limitation remains.

## Baseline checks

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
