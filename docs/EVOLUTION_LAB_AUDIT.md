# Evolution Lab architecture audit

Initial architecture inspection: October 2, 2026 (America/New_York), starting from clean foundation commit `92d01cea128eae0b277cfa362bae15ba29b35ebb`. The V1 completion correction pass re-inspected clean commit `e0aed7fbaeb6f4dfe3c85265c7da223347408eef`; its findings are recorded below and its final gates in `EVOLUTION_LAB_REPORT.md`. See `EVOLUTION_ARCHITECTURE_RECONCILIATION.md` for the initial architecture evidence.

| Authority | Responsibility |
| --- | --- |
| Canonical engine / engine adapter | Rules, legal frames, transitions, scores, victory and replay execution |
| `evolution-domain.mjs` | Configuration admission, same-seed mirrored planning, run/checkpoint/evidence identities, validation, retention and aggregation |
| `evolution-session.mjs` | Claims, deduplication, ownership and stale epoch rejection |
| `evolution-research.mjs` | Scientific manifests/clones, packs, named suites, shared semantic evaluation/project validation, reference registration, attributable comparison, behavior, ancestry and read-only archive inspection |
| `evolution-evaluation.mjs` | Shared frozen-suite orchestration and descriptive matchup regressions; no update hooks |
| `evolution-training.mjs` | Shared deterministic mutation/selection, disjoint data, append-only generations, repeatable held-out/regression finalization and required-work completion |
| `weighted-heuristic.mjs` | Bounded residual scoring over existing authorized policy decomposition |
| Node/browser adapters | Existing game runners and worker pools; no independent seed or rule implementation |
| `evolution-retention.mjs` | Operational research-purpose annotation and selective forensic persistence; no outcome or selection semantics |
| Browser presentation/store | Forms, vectors/timeline, bounded charts and transactional local persistence |

## Resolved findings

1. Prototype Zero had distinct per-ordinal seeds, permissive admission and a reachable obsolete series-worker protocol. Removed both scheduler/protocol, migrated tests, moved canonical aggregation and isolated chart sampling.
2. Ordinary simulation could abort a legitimate automatic transition after 16 commands while Evolution completed it. Automatic execution now continues operational slices with stable indices and a separate 256-command guard. No gameplay rule was changed.
3. Runs did not capture scientific questions. First-class experiments distinguish scientific identity from scheduling/clocks and preserve explicit parent/diff provenance.
4. Evaluations lacked frozen named catalogs/suites. Explicit seed arrays and checkpoint suites now provide historical apples-to-apples comparisons.
5. Schema 1 could not hold learned state. Version 2 adds independently identified immutable trainable checkpoints while schema-1 IDs remain untouched.
6. Project validation initially cloned checkpoints without freezing them. Fixed: returned checkpoints are validated immutable objects. This defect was caught before final validation.
7. Node execution could accept a caller-supplied historical identity without comparing the executing implementation. Adapters now attest the module's actual identity and fail closed.
8. Persisted research histories could have been replaced by shorter exports. Transactional saves reject committed generation rewrites/checkpoint removal. Import checksums remain integrity checks, not signatures.

## Boundary findings

- Training/evaluation orchestration is shared across environments; selection accepts TRAINING purpose only. Different mutation streams cannot change frozen evaluation arrays.
- V1 timestamps remain part of historical checkpoint hashes. V2 metadata timestamps are excluded from semantic checkpoint IDs; annotations are not learned policy state.
- Old artifacts remain read-only attributable evidence. They are not silently upgraded or executed under a new fingerprint. Engine/runtime source changes intentionally invalidate current execution compatibility.
- Candidate-seat telemetry is measured from actual runtime decisions/mechanic tags. Historical missing telemetry is unavailable. No strategic archetypes or rank/suit behavior are inferred.
- Every parent, candidate and selected checkpoint is preserved; complete generation ancestry is reconstructible. A held-out evaluation cannot change an already committed selection on resume.
- Internal mirrored-series admission is separate from scientific purpose. Saved training artifacts/history explicitly show TRAINING, and held-out artifacts show EVALUATION. Training persistence keeps one ordinary transcript plus retained failures/bookmarks and all slim game records. The headless CLI writes validated companion run artifacts, avoiding unresolved execution references.
- Retained rich replay evidence is bounded per run. Projects retain normalized result references and summaries. Long-history pruning remains deferred; no automatic protected-checkpoint deletion exists.
- Research resume retries incomplete suites, while ordinary arena resume is ordinal-granular. This is an explicit operational boundary.
- Local checks do not establish deployment, release certification, broad scientific strength or statistical convergence. Current exact validation is in `EVOLUTION_LAB_REPORT.md`.

## V1 completion correction pass

Starting commit `e0aed7fbaeb6f4dfe3c85265c7da223347408eef`, clean tree, October 2, 2026. Regression tests first reproduced weak evaluation validation, historical-error status poisoning, skipped resumed regression finalization and Cartesian comparison duplication, plus unbounded public selection scores. Shared validators now enforce metric/reference/selection/regression consistency. Required-work status and one repeatable generation-finalization path preserve failed attempts and committed selections. Comparison selects one complete attempt per pack/suite and exposes provenance. Manual-suite writers register execution references; clones reset derived regression results. Historical research inspection preserves original content without execution admission. Selective evidence retention precedes replay verification.

Current verification and exact completion status are recorded in EVOLUTION_LAB_REPORT.md; initial-pass evidence is preserved in EVOLUTION_LAB_REPORT_INITIAL_V1.md.
