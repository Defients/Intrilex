# Agent Profiles — verified continuation

Verified on **2026-10-04, America/New_York**, in `Intrilex_dev-current`, branch `main`,
starting from `f7c5450`. This report covers local implementation and execution of the
v1.31 FINAL specification. It does not establish remote CI or deployment status.

## Final checks

| Check | Result |
| --- | --- |
| `pnpm test` | PASS: 5,439 accounted; 5,425 passed; 14 skipped; zero failures/cancellations |
| `pnpm run test:profiles` | PASS: 54/54 |
| `pnpm run test:profiles:browser` | PASS: 16 acceptance scenarios plus one supplemental execution scenario; zero uncaught browser errors |
| `pnpm run test:evolution:browser` | PASS: 13 execution + 11 cockpit + 10 analytics scenarios; zero uncaught browser errors |
| `pnpm run build` | PASS |
| `pnpm run typecheck` | PASS: root and client TypeScript checks |
| `pnpm run lint` | PASS: zero errors, unchanged baseline of 422 warnings |
| `git diff --check` | PASS |

Native Chrome version: `154.0.8037.93`. Scientific implementation fingerprint:
`4855f737fafc313fdf9e9f84188f82aca828381b7801f05bfb36ba9a775f41d3`.
The original engine, policies, V1 scientific operators, and fingerprint inputs were preserved.
The existing browser navigation assertion now checks all seven surfaces, including Profiles.

## Continuation fixes

- Kept generator plans intact: the shared command coroutine requires iterable plans.
  Scoped lint annotations cover three intentionally yield-free plans and the intentional C0 regex.
- Captured Series settings, worker count, and held-out budget before progress redraws replace
  the form. Previously entered values reverted to defaults before manifest creation.
- Added arrow-key/Home/End navigation for Profile workflow tabs and a stable error-status selector.
- Rendered terminal Experience status, guarded async completion by session identity, and refreshed
  its text after terminal DOM replacement. Restored terminal sessions can record Experience even
  when player statistics have already been recorded. Stable encounter IDs prevent duplicate records.
- Added an observational Experience count and encounter table to Analyze; this path does not train.
- Added `scripts/agent-profile-browser.mjs`, using the built app, its actual bundled play module,
  real browser workers, and native IndexedDB. No production debug interface was added.

## Browser acceptance evidence

| # | Executed scenario | Evidence boundary |
| --- | --- | --- |
| 1 | Custom GRAVE MAW, semantic compiler, unevaluated Champion, keyboard tabs | UI + native IndexedDB |
| 2 | Exact source head/revision/checkpoint and submitted Series budget frozen before execution | UI + real simulation |
| 3 | Real candidates and TRAINING selection; truthful parent retention | Real simulation |
| 4 | Held-out measurement leaves selection/nomination unchanged | Real simulation; natural Series retained parent, so no Challenger challenge was applicable |
| 5 | Atomic promotion includes record, event, Journal and receipt; acknowledgment retry is idempotent | Explicitly labeled fixture outcomes; actual UI/store transaction |
| 6 | Reload retains exact head, history and Journal | UI + native IndexedDB |
| 7 | Series 2 starts from promoted Champion; historical Series stays unchanged | Promotion mechanics fixture + actual manifest creation |
| 8 | Two independent page connections race promotions: exactly one succeeds, one rejects stale | Labeled outcomes + actual concurrent IndexedDB transactions |
| 9 | A → B → A rollback cannot revive an old authorization | Labeled outcomes + actual head transitions |
| 10 | Fork, semantic trait delta, isolated draft, explicit authored activation | UI + native IndexedDB; source unchanged |
| 11 | Profile-backed play stays pinned across head movement; save/restore keeps the original snapshot | Actual play route/session + authored head transition |
| 12 | Legal terminal play records Experience and displays status/count without scientific mutation | Actual engine actions + production terminal renderer |
| 13 | Historical rollback appends history/Journal with a fresh head version | UI + native IndexedDB |
| 14 | Export/import preserves hashes, head, Series, promotions and Journals; repeat is idempotent; conflicting history rejects | UI download + isolated native IndexedDB; fixture evidence retains its labels |
| 15 | Abort all five promotion write boundaries; quota-failed V1 linkage recovers; aborted upgrade preserves evidence; superseded client stops | Native IndexedDB fault injection; promotion outcomes labeled fixtures |
| 16 | Cross-era delta blocked; common-era/pack remeasurements append new evidence and become comparable | Real simulation + UI |
| 17 | Entered held-out budget preserved; full challenge executes 960 real games, with no head movement | Fixed nominee from labeled fixture TRAINING; actual challenge outcomes are real |

The supplemental challenge returned `APPROVE` for that fixed nominee. It was **not promoted**.
Its nomination was a test fixture, so this is execution/decision-rule evidence, not evidence that
an actual training search learned a stronger Profile. No thresholds, defaults, contract versions,
or source-lock fixtures were changed in response to these results. Small training/held-out samples
are integration checks, not statistical strength claims.

## Mandatory invariant enforcement

| Invariant | Enforcement | Executed proof |
| --- | --- | --- |
| I1 Historical evidence immutable | Canonical IDs/digests; insert-or-verify; append-only transitions | Contract/store conflict tests; browser reload/export and abort checks |
| I2 Training selects descendants | `selectGeneration` admits manifest-bound TRAINING measurements only | Forged-purpose/foreign-manifest/subject/incomplete-block tests; real Series |
| I3 Held-out measures only | Separate measurement pipeline cannot write selection or nomination | Adversarial science tests; browser 4 and 17 |
| I4 Promotion separate from selection | Finalized decision and explicit transactional activation | Decision precedence tests; browser 3, 5 and 17 |
| I5 Stale Challenger cannot overwrite head | Full immutable head token plus monotonic `headVersion` checked in transaction | Browser cross-page race and A → B → A; Node stale tests |
| I6 Transactional/idempotent promotion | One multi-store transaction and command receipt | Browser 5 and every-write aborts in 15; Node acknowledgment-loss tests |
| I7 Authored is not learned | Separate checkpoint derivation and activation event types | Authored/fork/manual/rollback store tests; browser 10 and 13 |
| I8 Ordinary gameplay does not train | Observational Experience writes only | Consumer tests; browser compares head/checkpoints/events/scientific artifacts before/after play |
| I9 Exact immutable execution pinning | Digest-checked snapshots and frozen manifests; no fallback | Consumer tamper/restore tests; browser 2 and 11 |
| I10 Honest scientific eras | Compatibility verdict requires equal era and paired pack | Cross-era tests; real common-era browser remeasurement |

## Artifacts and limits

Detailed local evidence is under `reports/local/` (ignored by Git):

- `agent-profiles/browser/report.json`, screenshots and the explicitly named fixture export;
- `agent-profiles-{full-test,focused,browser,legacy-browser,lint,typecheck,build}.log`;
- `evolution-cockpit/{browser,interaction}/report.json` and `evolution-analytics/browser/report.json`.

The Profile report records console diagnostics, including unavailable Observatory replay-resource
requests and a transient unavailable semantic snapshot. There were zero uncaught page errors.
Screen-reader testing, other browser engines, remote CI, deployment and production acceptance were
not run. Test-generated Observatory extracts were restored after the suite; they are not research
outputs or changes in this delivery. Browser fixture databases are disposable and never share a
user's persistent browser data.
