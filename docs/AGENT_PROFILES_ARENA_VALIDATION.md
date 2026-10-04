# Custom Profiles in Arena

Local integration verified on **2026-10-04, America/New_York**, starting from
`ec4baa6`. This closes the Arena dropdown and checkpoint-consumer gap. It is not
a claim that every v1.31 roadmap requirement is complete or that the published
site has been updated.

## Behavior and authority

- Both Arena seats list local Custom Profiles alongside the ten shipped policies.
  Names and current head versions distinguish Profiles sharing one policy family.
  Incompatible rules or non-executable heads remain visible with an unavailable reason.
- The UI uses `agent-profile:<id>` references. The new `profile-arena.mjs` consumer
  resolves each selected Profile once at start, reads its immutable checkpoint by
  ID, and passes the existing policy ID and exact checkpoint to the existing engine.
  One Profile selected in both seats shares one resolution, including during head changes.
- Profile runs carry optional `arenaProfiles` metadata under
  `intrilex-profile-arena@1`: two seat-aligned snapshots, with null for static seats.
  Snapshots retain checkpoint, revision, head version, head-token digest, rules,
  implementation, genome and snapshot digest. Run IDs distinguish participant
  snapshots even when policy IDs and creation times coincide.
- Admission, current artifact import/load, and resume validate this metadata against
  the saved checkpoints and current implementation. Resume needs no live Profile
  lookup. A head change, rename, or missing live Profile cannot retarget a saved run.
  Historical implementation inspection retains the existing read-only path.
- Arena results use the existing run/evaluation format. This consumer performs no
  Profile writes and supplies no training selection or promotion authority.
  Evaluate A/B remains descriptive Arena evaluation, separate from held-out
  Profile evaluation and promotion challenges. Legacy Research rejects Custom
  Profile selections explicitly instead of creating a weighted baseline experiment.
- Rosters refresh on Arena entry, window focus, rules changes and explicit refresh.
  Selected Profile references survive refresh and Reset. Pending starts are fenced
  against duplicate starts and workspace teardown. Static runs preserve their
  existing artifact shape, engine execution and policy defaults.

## Executed validation

| Check | Result |
| --- | --- |
| Full `pnpm test` | 5,444 accounted; 5,430 passed; 14 skipped; zero failures/cancellations |
| `pnpm run test:profiles` | 59/59 passed, including five new Arena contract tests |
| `pnpm run test:profiles:arena:browser` | Seven Chromium scenarios passed; zero uncaught page errors |
| `pnpm run test:profiles:browser` | 17 scenarios passed; original scientific and fixture evidence labels retained |
| `pnpm run test:evolution:browser` | 34 scenarios passed: 13 execution, 11 cockpit, 10 analytics |
| Build and root/client typecheck | Passed |
| Lint | Zero errors; unchanged baseline of 422 warnings |
| Scoped diff whitespace check | Passed |

The seven new browser scenarios exercise both dropdowns, Profile versus static,
Profile versus Profile, a Champion change during execution followed by pause/reload/
resume, rules compatibility and refreshed head labels, Evaluate B, and a stale
missing-Profile selection rejected without fallback. Games use the real engine.
The injected missing choice is labeled failure-path testing, not game evidence.
The Node tests additionally reject tampered snapshot genomes and substituted
checkpoints, and verify exact static artifact compatibility and no scientific writes.

Local detailed evidence: `reports/local/agent-profiles/arena-browser/report.json`
and `custom-profile-dropdowns.png`; command logs are
`reports/local/agent-profiles-arena-*.log`. These generated reports are not committed.
Scientific implementation fingerprint remains
`4855f737fafc313fdf9e9f84188f82aca828381b7801f05bfb36ba9a775f41d3`.

## Remaining boundaries

The previously identified retention protection race, general Profile-workspace
cross-tab invalidation, and required before/after performance/storage evidence
remain separate work. Arena roster refresh does not establish general store
notifications. No remote CI, deployment, other browser, or screen-reader acceptance
claim is made here. Existing deployment-directory changes are outside this commit.
