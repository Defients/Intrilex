# Evolution research cockpit

## Inspection baseline — October 3, 2026 (America/New_York)

Clean starting commit: `3a25ddfb6e413c11c057668856d98be821a0cc9c`. All 50 existing Evolution tests passed before major frontend work. The prior V1 correctness implementation is preserved.

| Surface | Render owner / state | Actions and dependencies |
| --- | --- | --- |
| Frozen arena/configuration | evolution-dashboard.js / module-owned view, EvolutionSession | Existing domain admission, session claims/epochs, worker.js, incremental aggregation; IndexedDB save chain |
| Replays | dashboard / inspection worker, steps and selected command | Existing authoritative replay verification; owned worker timeout/termination; bookmarks persist through EvolutionStore |
| Research creation/evaluation | evolution-research-ui.js / project, selection, controller, progress, comparison | Authoritative constructors, evaluateSuite, compareCheckpoints, shared validation; store.saveResearch guards committed generation history |
| Training | evolution-training-ui.js / attached research API | Shared trainProject; TRAINING selects, EVALUATION measures; onSave commits suite/generation-boundary evidence |
| Historical inspection | dashboard archive / research archive | Inspect against original identity read-only; incompatible execution is rejected; imported claims remain unverified |
| Charts | chart-toolkit.js / sampled arena metrics, recorded held-out evaluations | SVG presentation only; missing observations must remain gaps |
| Ledger | EvolutionStore / IndexedDB v2 runs/history/checkpoints/research | No store deletion/migration or scientific-history rewriting for this redesign |

The dashboard originally replaced its DOM at operation boundaries; live arena targets update every 500 ms. Research replaces its section at persistence boundaries; progress writes cheap text targets per accepted game. Cockpit navigation/inspection must not restart either executor, create another session or change RNG.

Scientific objects already provide checkpoint ancestry, generation ranking/disqualifications, mutations, pack seed arrays, suite identities, complete/incomplete attempts, run references, descriptive regression findings and candidate family/mechanic telemetry. They do not provide rank/suit preferences, direct resource expenditure, inferred intent, universal strength or future performance.

The cockpit uses six primary workspaces (Overview, Arena, Evolution, Evidence, Forensics, Ledger), a shared inspector and an observed execution console. Selection, filters, pagination, residual drafts and console preferences belong to UI state only. The router supports a query suffix on the existing hash route; view links may name a workspace/inspector but never contain scientific payloads.

Residual drafts are non-committed inspection aids. No valid manual policy-seeding operation exists in the current training workflow. The editor must never invent checkpoint IDs, rewrite checkpoint weights, or offer an executable save for its draft.

## Working with the cockpit

1. Open **Arena** to select frozen policies, the rules profile, seed, mirrored seats and workers. Run/Pause/Resume/Stop preserve the original session and admission rules. Those configuration values supply a newly created research experiment; they do not overwrite an existing experiment.
2. Open **Evolution** to name and describe a scientific draft, create an ordinary comparison/evaluation experiment, or create independent A0/B0 weighted lineages. New-experiment fields retain your draft through progress and persistence renders. Committed configuration is explicitly read-only. Train/resume uses the committed configuration; editing the next-experiment form cannot change it.
3. Inspect a lineage node to see identity, implementation, origin, parent, direct descendants and recorded residual differences. Inspect its selection record for actual candidates, TRAINING ranking/disqualification, selected child, frozen packs and held-out completion. Filter nodes by lineage, generation range, regressions, faults or search. Roots and committed selections are distinct from unselected candidates.
4. In **Evidence**, choose before/after checkpoints or use root/parent/latest shortcuts. Comparisons use the shared authority's latest-complete matching evidence policy. Evaluations keep TRAINING and EVALUATION badges separate. Behavior is candidate decision family/mechanic frequency on matching complete held-out opponent evidence; unavailable telemetry is explicit. Regression findings link to the candidate/reference evidence and retain uncertainty.
5. In **Forensics**, verify a retained replay through the engine, step commands with controls or arrow keys, and use Home/End for endpoints. Command, phase, revision, turn and scores are readable before expanding raw event diagnostics. Bookmarks retain the original persistence path.
6. In **Ledger**, search run/experiment metadata and load compatible local evidence. Imports remain unverified. Historical inspection preserves original identity/content, locks execution controls and offers an exact archive export. Artifacts that fail their current contract expose that diagnostic and original content; derived claims are unavailable. Return to current work with the historical banner action.

The desktop inspector is a sticky evidence rail. At widths of 1100 pixels or less it becomes a modal drawer with trapped keyboard focus, Escape dismissal and focus restoration. Closing the inspector explicitly clears its selection. Evidence tabs implement arrow/Home/End navigation; lineage buttons implement arrow/Home/End focus navigation. `/` focuses evidence search only within the cockpit, without intercepting typing in an editor. The optional Commands dialog includes only currently admitted execution actions.

## Presentation ownership and bounds

`evolution-view-model.mjs` contains pure projections and draft validation. `evolution-cockpit-views.js` contains templates and chart projections. `evolution-cockpit.js` owns the UI selection/filter/drawer/console lifecycle and subscribes to the existing research owner. The dashboard continues to own arena sessions, persistence and replay verification; the research/training modules continue to call the existing shared algorithms. Cleanup unsubscribes UI listeners and retains the original executor cleanup contract.

Navigation/inspection update the existing hash route with `history.replaceState`; they do not dispatch a route transition. The workspace preference alone may be saved in `intrilex.evolution.cockpit.v1` localStorage. Selection, filters, draft residuals and console state never enter a scientific artifact. A route may include `?view=evidence&inspect=checkpoint:CP2-...`; the corresponding experiment must be loaded on that browser origin. No scientific payload is encoded in the URL.

The lineage rail displays 25 nodes per page. Checkpoint diagnostics, regressions and saved-history metadata display at most 50 matching rows; evaluation attempts display the latest 30; behavior tables display the first 60 ranked measures; console reception history retains 100 events. Ledger search runs across all saved metadata before limiting displayed rows. Run inspectors show bounded summaries and link to Forensics/complete export rather than inserting an entire retained artifact into the inspector DOM. SVG chart gaps remain gaps. No graph-layout dependency, canvas engine, random animation or rendering RNG was added.

The execution console is observational: actual progress, completed/attempted/failed games, available generation/checkpoint/pack attribution, observed status changes and errors, with explicit UTC reception times. It does not synthesize individual game log events. Research throughput is a wall-clock execution observation, excluded from scientific identity. Pause display, clear display buffer and auto-follow affect the console only; UI reception timestamps are not claimed as original engine event times.

## Validation and limits

Run `pnpm test:evolution` for the shared scientific regressions and pure cockpit projections. Run `pnpm test:evolution:browser` after building for both the preserved real-worker workflows and new cockpit interactions. The interaction harness uses the adaptive artifact produced by the first harness, validates through the real importer, then compares complete exported payloads/content hashes before and after UI exploration. It tests four viewport widths, focus trapping/restoration, bounded draft validation, comparison shortcuts, keyboard tabs, archive admission/exact export and visible storage failure recovery.

The scientific source fingerprint remains `fdf1e469f1da605551ff342c69d1bb0de0d8f85d6f00cfd668e04e5d82059ea8`. Current counts, logs, screenshots, reproduction and the grouped file inventory are in [the delivery report](EVOLUTION_COCKPIT_REPORT.md). Browser module coverage is supplemented by scoped lint and behavioral tests; root TypeScript checks do not cover every browser JavaScript file. Local checks do not establish remote CI or deployment approval.

Resizable split panes and a dedicated graph-layout engine were optional and are deferred. Inspectors, responsive grids and bounded paginated lineage records provide the required navigation without changing the stack. Arbitrary manual checkpoint commitment, rank/suit/resource telemetry, neural policies and scientific algorithm changes remain outside the existing authority and this presentation upgrade.
