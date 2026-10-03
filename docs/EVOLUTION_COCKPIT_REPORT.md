# Evolution Lab research cockpit delivery report

Date: October 3, 2026 (America/New_York). Canonical checkout: `H:\myProjects\Intrilex-MASTER\Intrilex_dev-current`. Starting clean commit: `3a25ddfb6e413c11c057668856d98be821a0cc9c`.

## Implemented behavior

The existing dashboard now provides six connected research workspaces, a persistent execution/provenance context, a shared evidence inspector and an observational execution console. Arena sessions, browser workers, shared training/evaluation/comparison authorities, IndexedDB schema and original artifact envelopes retain their existing owners and semantics. No backend scientific source, policy implementation, RNG stream, game rule, selection algorithm or seed pack changed.

Overview exposes actual independent lineage heads, committed generation counts, complete held-out coverage and faults. Evolution separates the next experiment's scientific draft from immutable committed configuration, preserves draft fields through progress renders and provides a paginated lineage rail. Checkpoint and generation inspectors show actual ancestry, mutations, candidate ranking/disqualification, selection, pack identity, completion and recorded evidence. Evidence provides attributed complete-only comparisons, purpose-labeled attempts, matching-sample behavior frequencies and uncertainty-bearing regression findings. Forensics presents verified command/turn/phase/revision/score summaries with secondary raw diagnostics and keyboard replay transport. Ledger provides bounded, searchable metadata, current/historical provenance, compatible loading, exact original archive export and visible persistence recovery.

UI-only residual drafts enforce the existing six-feature integer bound, synchronize slider/number inputs, retain edits through navigation and support reset/copy. They cannot commit a checkpoint or enter training. This restriction follows the actual authority: there is no valid manual policy-seeding workflow to invoke.

Navigation and selection use the existing route query suffix without restarting executors. Mobile/tablet inspectors use a modal drawer, keyboard focus trapping, Escape and focus restoration. Evidence tabs and lineage controls support keyboard navigation; the Commands dialog reflects currently admitted actions. Purpose has explicit labels as well as color. Reduced-motion handling, table scrolling, bounded lists and explicit unavailable states are retained throughout.

## Preservation evidence and validation

Scientific fingerprint before and after this presentation pass:

`fdf1e469f1da605551ff342c69d1bb0de0d8f85d6f00cfd668e04e5d82059ea8`

Engine `4.2.6`; rules `4.3.1`. No artifact/store version increment. No new framework, chart engine, graph-layout dependency or external service.

Final local validation passed against the completed cockpit. The full repository run used stable, completed build output; browser harnesses used the final production build. The report does not convert the 14 repository skips into passes.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Existing Evolution baseline | PASS — 50 tests, no failures/skips before redesign | `reports/local/evolution-cockpit-baseline-tests.log` |
| Full repository tests | PASS — 5,279 tests: 5,265 passed, 14 skipped, 0 failed | `reports/local/evolution-cockpit-full-tests.log` |
| Focused Evolution tests | PASS — 61 passed, 0 failed/skipped; includes real one/four-worker reproduction | `reports/local/evolution-cockpit-focused-tests.log` |
| New pure presentation regressions | PASS — 11 cases; also registered in full/focused tests and CI | `test/evolution-cockpit.test.mjs` |
| Preserved real Chrome workflows | PASS — 13 scenarios, no page errors | `reports/local/evolution-cockpit/browser/report.json` |
| New cockpit interactions | PASS — 10 scenarios, no page errors; 23 total with the preservation harness | `reports/local/evolution-cockpit/interaction/report.json` |
| Browser-to-Node reproduction | PASS — fresh adaptive browser source, 2 generations reproduced with one Node worker | `reports/local/evolution-cockpit/cross-runtime.json` |
| Root/client TypeScript checks | PASS | `reports/local/evolution-cockpit-typecheck.log` |
| Scoped lint | PASS — zero errors and warnings after harness cleanup | `reports/local/evolution-cockpit-lint.log` |
| Production build | PASS | `reports/local/evolution-cockpit-build.log` |
| Scientific source identity | PASS — before/after fingerprint identical; no scientific source diff | `reports/local/evolution-cockpit/final-identity.json` |
| Native local preview | PASS — current cockpit, responsive focus/Escape, screenshots, no page errors | `reports/local/evolution-cockpit/preview-check.json` |

The browser preservation harness executes real workers and verifies pause/reload/resume, ordinal preservation, replay authority/bookmarks/keyboard transport, import integrity, paired-seat evaluation, stale-message handling, route cleanup, quota recovery, ordinary human-versus-AI play, cloning, complete-only comparison, historical content export, adaptive failure/stop/retry, global research stop during workspace navigation, generation advancement, committed-selection recovery and schema-1 IndexedDB migration. The cockpit harness imports the newly produced adaptive artifact through the real validator, compares full exported payloads/content hashes before/after UI exploration, and verifies draft isolation, linked inspection, comparison shortcuts, actual behavior, keyboard tabs/search, command admission, console controls, missing local run recovery, active-session load admission, archive execution locks, recovery visibility and layout/focus at 390/768/1024/1600 pixels, including a live desktop-to-tablet modal transition.

The focused scientific suite includes fresh real one-versus-four-worker two-generation reproduction. Browser-to-Node reproduction is an additional current runtime parity check, rather than an inference from an unchanged source fingerprint. Root TypeScript does not cover every browser JS module; scoped lint and real browser behavior complement that boundary. The 14 full-suite skips remain explicit and are not represented as passes.

Two closeout findings were corrected: evidence selection now transfers focus to the inspector, including a responsive transition into its modal presentation; reference loading checks arena/historical admission before and after its asynchronous storage read, preventing replacement of an active session. One earlier full-suite run overlapped dist regeneration and reported eight ENOENT failures. That orchestration failure is preserved in `reports/local/evolution-cockpit-full-tests-build-race.log`; the final run above followed a completed build and passed without source/test exceptions.

Current preview: `http://127.0.0.1:4173/#/evolution`. Screenshots include `reports/local/evolution-cockpit/interaction/overview-1600.png`, the corresponding 390/768/1024 views, `reports/local/evolution-cockpit/cockpit-mobile-inspector.png`, and `reports/local/evolution-cockpit/lineage-workbench.png`. The sample artifact intentionally includes a controlled worker failure from the recovery scenario; its retained fault is real recorded evidence, not a fabricated demo status. Complete before/after UI artifacts are in the interaction directory.

## Grouped file inventory

Presentation — new:

- `apps/lab-web/src/evolution/evolution-view-model.mjs` — pure projections, matching-evidence admission, ancestry shortcuts and non-committed draft validation.
- `apps/lab-web/src/evolution/evolution-cockpit-views.js` — structured workspaces, inspectors, bounded tables and recorded held-out trend.
- `apps/lab-web/src/evolution/evolution-cockpit.js` — UI state/lifecycle, navigation, filters, responsive drawer, command dialog, console and authority adapters.

Presentation — modified:

- `apps/lab-web/src/workspaces/evolution-dashboard.js` — cockpit mounting/cleanup, global error observation, metadata search and structured/keyboard replay inspection.
- `apps/lab-web/src/evolution/evolution-research-ui.js` — shared UI subscriptions, draft field retention, research ownership adapter, ledger metadata search and historical execution guard.
- `apps/lab-web/src/evolution/evolution-training-ui.js` — compact scientific draft controls and committed training heads; shared algorithm remains the execution authority.
- `apps/lab-web/src/css/evolution.css` — scoped tokens, workspace/inspector/console presentation, responsive layouts and reduced-motion/focus states.
- `apps/lab-web/src/css/evolution-foundation.css` — remove competing legacy rules; retain compatible stylesheet entrypoint.

Validation and registration:

- `test/evolution-cockpit.test.mjs` — new; eleven meaningful projection/admission/immutability regressions.
- `scripts/evolution-cockpit-browser.mjs` — new; real imported-fixture UI/immutability/accessibility/archive/recovery checks and screenshots.
- `scripts/evolution-browser.mjs` — preserve original scientific/recovery scenarios, navigate actual workspaces and verify global research stop/replay keyboard behavior; evidence goes to the new delivery directory.
- `package.json` — register cockpit tests in full/focused commands; browser command runs both harnesses in order.
- `scripts/ci.mjs` — register the new test file in the existing Evolution gate.

Documentation:

- `docs/EVOLUTION_COCKPIT.md` — new; inspection baseline, state ownership, operating guide, bounds, validation and justified limitations.
- `docs/EVOLUTION_COCKPIT_REPORT.md` — new; this report, preservation evidence and grouped inventory.
- `docs/EVOLUTION_LAB.md` — add current workspace, control, draft and recovery guidance with links to the cockpit documents.

Sixteen source/config/documentation files changed or added. No source files removed. Generated local logs/artifacts/screenshots are retained under `reports/local/evolution-cockpit*`; the previous V1 report and evidence directory remain historical evidence. No commit, push or deployment was performed.

## Remaining limits and justified deferrals

- Residual drafts are inspection aids, without authoritative manual commitment or predictive fitness.
- Rank/suit preferences, direct resource expenditure and inferred policy intent are unavailable. Observed family/mechanic frequency is sample-bound behavior.
- Small frozen samples and regression findings remain descriptive. They do not establish broad strength, causality, convergence, significance or a discovered metagame.
- Research resume retains the existing suite/generation boundary contract. It does not provide invented pause semantics or arbitrary mid-game recovery.
- Local storage remains browser-origin specific. A run reference may be valid while its local artifact file is absent; the inspector reports that availability separately and preserves attribution. Export remains portability/recovery.
- Contract-invalid historical artifacts expose original content and their diagnostic; they do not receive derived current scientific claims or execution admission.
- Lists and SVG views are bounded; no claim of performance on arbitrary maximum-sized archives or other browsers is established by these checks.
- Resizable split panes and a dedicated graph-layout engine were optional and are deferred in favor of responsive rails/drawers and paginated lineage records. No additional scientific algorithm or policy family was added.
- Remote CI, deployment and production certification are NOT_RUN. This is local engineering completion and validation evidence.
