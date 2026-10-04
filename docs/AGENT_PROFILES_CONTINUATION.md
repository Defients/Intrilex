# Agent Profiles — Continuation Handoff

> **Superseded intake handoff — continuation verified 2026-10-04 (America/New_York).**
> Gates 0–4 are implemented and locally verified. See
> [AGENT_PROFILES_VALIDATION.md](AGENT_PROFILES_VALIDATION.md) for current results:
> 54 Profile tests, 16 browser acceptance scenarios plus a real 960-game challenge-runner
> check, 34 legacy Evolution browser scenarios, and the full suite (5,425 passed,
> 14 skipped, zero failures). Build/typecheck/lint passed (422 existing warnings).
> The browser script exists, submitted-budget redraw bugs are fixed, Experience status
> and counts render, and Profile tabs support arrow keys. The source below is retained
> as the original intake record, including its original date and preliminary findings.
> Its outstanding-work list and suggested commit commands are not current instructions.
> The continuation used actual execution evidence and did not change scientific thresholds
> or claim learned improvement from synthetic fixtures. No deployment is established here.

**Date:** 2025-07-18
**Branch:** `main` at commit `f7c5450` (all Profile work is uncommitted/unstaged)
**Workspace:** `H:\myProjects\Intrilex-MASTER\Intrilex_dev-current`
**Runtime:** Node.js 22.14.0, pnpm 10.11.0

---

## 1. What Was Built

The "Persistent Agent Profile Architecture" (spec v1.31 FINAL) is being implemented across four gates. Gates 0–2 are complete. Gate 3 (UI) and Gate 4 (normal-play consumer) are implemented but have remaining lint fixes and no browser acceptance validation yet. Nothing has been committed to Git.

### New files created (all untracked `??`)

| File | Lines | Purpose |
|------|-------|---------|
| `packages/simulation-runtime/src/profile-contracts.mjs` | 325 | Strict canonical forms, genome definition, trait catalog/compiler, objective instances, era/compatibility, revision validators, head-token comparison, source-lock |
| `packages/simulation-runtime/src/profile-journal.mjs` | 125 | Pure deterministic Learning Journal builder, dossier aggregation |
| `packages/simulation-runtime/src/profile-store.mjs` | 679 | Immutable artifact persistence (memory + IndexedDB backends), insert-or-verify, head transitions via generator-coroutine transactions, command receipts, fork/rollback/authored/manual/context, snapshot resolver, experience records, export/import, retention, V1 linkage |
| `packages/simulation-runtime/src/profile-science.mjs` | 466 | Series manifests, fenced execution, TRAINING-only selection, challenger nomination, held-out evaluation, promotion challenge, paired Student-t estimator with tail guard, decision rule, promotion journal, cross-era compatibility |
| `apps/lab-web/src/evolution/profile-workspace.js` | 259 | Browser UI: roster, create/import/fork/export, 4-tab workspace (Overview, Learn, Analyze & history, Tune & research), series control, challenge/promotion controls, dossier, measurement comparison, draft revisions, rollback, manual activation, V1 linkage |
| `test/agent-profile-contracts.test.mjs` | 131 | Gate 1 contract invariant tests |
| `test/agent-profile-store.test.mjs` | 337 | Gate 1 store invariant tests (A→B→A, idempotency, tx abort, import collision, retention, V1) |
| `test/agent-profile-science.test.mjs` | 260 | Gate 2 science tests (real-sim series, worker determinism, forged evidence, estimator validation, cross-era) |
| `test/agent-profile-consumer.test.mjs` | 99 | Gate 4 consumer tests (pinned snapshot, save/restore, tamper rejection, experience isolation, catalog backward compat) |
| `test/fixtures/agent-profile-fixtures.mjs` | 81 | Shared fixture helpers (memoryStore, createGraveMaw, fixtureSeries, fixtureChallenge) — all synthetic outcomes are self-labeled |
| `test/fixtures/agent-profile-contract-lock.json` | — | Source-lock artifact for contract versioning |
| `docs/AGENT_PROFILES.md` | 150 | Architecture overview, invariants, estimator design notes |

### Existing files modified (tracked `M`)

| File | What changed |
|------|-------------|
| `apps/lab-web/src/css/evolution.css` | +3 lines: `.ap-layout`, `.ap-roster-list`, `.ap-facts`, `.ap-form` CSS classes and responsive breakpoint |
| `apps/lab-web/src/evolution/evolution-cockpit.js` | +5 lines: imports `mountProfileWorkspace`, adds `['profiles','Profiles','00']` to nav surfaces array, mounts/cleans up the Profile workspace |
| `apps/lab-web/src/play/play-controller.js` | +50 lines: `admitAgentSnapshot()` validates pinned snapshots at session start, `AGENT_POLICY_ID` constant, `_agent`/`_policyActions` fields on PlaySession, agent-aware legal action views, snapshot bound into save envelope and decision journal, restore path re-pins from the save's own snapshot, failure rollback restores `_agent` |
| `apps/lab-web/src/play/play-app.js` | +44 lines: `/play/agent/<id>` route, `startAgentProfileMatch()` resolves head once with no fallback, `recordAgentExperience()` writes observational Experience at terminal, wired into `handlePlayRoute` |
| `package.json` | Added `test:profiles` and `test:profiles:browser` scripts; appended 4 agent-profile test files to the main `test` script |
| `scripts/build.mjs` | Added `profile-contracts.mjs`, `profile-journal.mjs`, `profile-store.mjs`, `profile-science.mjs` to the browser module copy loop (line 85) |
| `scripts/ci.mjs` | Added `['agent-profiles', ...]` CI stage after `evolution-lab` (line 298) |

---

## 2. Current Test Results

**All 54 Agent Profile tests pass** (contracts 17 + store 15 + science 16 + consumer 6):

```
node --test test/agent-profile-contracts.test.mjs test/agent-profile-store.test.mjs test/agent-profile-science.test.mjs test/agent-profile-consumer.test.mjs
# tests 54
# pass 54
# fail 0
# duration_ms 35529
```

**Build:** `pnpm run build` passes (produces dist with Profile modules copied).

**Typecheck:** `npx tsc --noEmit` passes with 0 errors.

**Lint:** `pnpm run lint` reports **5 errors, all in `profile-store.mjs`**:

1. Line 123: `IDBKeyRange` → should be `globalThis.IDBKeyRange` (partially fixed — verify the edit took)
2. Lines 379, 514, 535: `require-yield` — three `function*` generators that `return` without `yield`. These are passed to `#command()` which calls `yield* plan(tx, head, transitionId, identity)` on them (line 343). The generators work correctly at runtime because `#command`'s outer generator does the yielding. Fix: convert these three from `function*` to regular functions that return the same object, OR add `/* eslint-disable-next-line require-yield */` above each, OR restructure to yield at least once.
3. Line 638: `no-control-regex` — a regex with `\x00`/`\x1f` control characters used for binary content validation. Fix: `/* eslint-disable-next-line no-control-regex */` is appropriate since the control chars are intentional.

**The pre-existing lint baseline is 422 warnings (all `no-unused-vars`). AGENTS.md says 0 errors expected.** These 5 new errors must be fixed before commit.

**Full test suite** (`pnpm test`): Not run in this session. Should be run after lint fixes to confirm no regressions across the 2400+ existing tests.

---

## 3. The Ten Mandatory Invariants and Their Test Coverage

Each invariant from the spec v1.31 maps to specific passing tests:

| # | Invariant | Key test(s) |
|---|-----------|------------|
| I1 | Historical evidence immutable | "immutable writes: identical repeats are idempotent; corrupted stored content is detected" |
| I2 | Training selects descendants (TRAINING only) | "selection admits TRAINING evidence only: forged labels, foreign manifests, wrong subjects and incomplete blocks are rejected" |
| I3 | Held-out measures, cannot select | "held-out and challenge results cannot change committed selection or nomination" |
| I4 | Promotion separate from generation winning | "frozen decision rule: APPROVE, REJECT, INCONCLUSIVE and INVALID" + "incomplete or mismatched challenge evidence is INVALID" |
| I5 | Stale challengers cannot overwrite newer head | "A → B → A rollback leaves old challenge authorization stale" + "two Series from one head: the first promotion makes the second authorization stale" |
| I6 | Promotion transactional and idempotent | "duplicate promotion after acknowledgement loss replays one transition" + "a failure at every write boundary of a promotion leaves no partial head, record, journal or receipt" |
| I7 | Authored ≠ learned | "drafts never move the head; authored activation previews replaced learned values" + "forking shares the exact checkpoint, edits independently" |
| I8 | Ordinary gameplay does not train | "ordinary-play experience writes observations only: no training, revision, genome or head change" + consumer test "ordinary play records observational Experience only" |
| I9 | Operations execute exact immutable snapshots | "snapshots are exact, digest-checked, frozen and never fall back" + consumer test "a running match stays pinned when the Profile head moves" |
| I10 | Scientific comparisons respect compatibility | "cross-era deltas are blocked; a common-era re-evaluation produces new comparable measurements" |

---

## 4. What Remains (in priority order)

### 4.1 Lint Fixes (BLOCKING — must fix before commit)

Five errors in `profile-store.mjs`. See section 2 above. Estimated effort: 5 minutes.

### 4.2 Full Test Suite Run

Run `pnpm test` end to end (all 2400+ tests, ~4 min). Confirm zero failures. The `test-coverage-meta.test.mjs` should now pass because the new test files were registered in both `package.json` and `scripts/ci.mjs`.

### 4.3 Git Commit

Nothing has been committed. All work is in the working tree. After lint fixes and full test pass:

```bash
git add -A
git commit -m "feat(evolution): persistent Agent Profile architecture — contracts, store, science, browser UI, normal-play consumer

Gates 0–4 of the v1.31 FINAL specification:
- Named Profiles with authored semantic traits and compiled genomes
- Immutable revisions, checkpoints, and objective instances
- Exact head tracking with monotonic head versions
- TRAINING-only selection with paired Student-t promotion challenges
- Held-out evaluation that cannot influence selection
- Atomic promotion with transactional receipts and Learning Journal
- Fork, rollback, manual activation with true provenance
- Normal-play pinned snapshot consumer (no fallback, digest-checked)
- Observational Experience records (cannot mutate scientific state)
- Export/import with conflict detection and imported-unverified provenance
- V1 checkpoint migration linkage (original ID/hash preserved)
- Browser Lab UI workspace (roster, learn, analyze, tune tabs)
- 54 tests covering all 10 mandatory invariants

Generated with Devin

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

### 4.4 Browser Acceptance Validation (NOT DONE)

The spec requires demonstrating 16 acceptance scenarios in the actual browser. None have been executed. The UI (`profile-workspace.js`) is wired into the Evolution cockpit as the first nav tab ("Profiles"), but no one has loaded it in Chromium yet.

**Required browser scenarios (per spec):**

1. Fresh Profile creation (GRAVE MAW, traits, compiler, genome, unevaluated Champion)
2. Series 1 starts from exact head/checkpoint/revision/objective
3. Real candidates produced, training selection committed, nomination or truthful no-change
4. Held-out does not alter selection; separate promotion challenge if Challenger exists
5. Qualified promotion is atomic (PromotionRecord + event + Journal + receipt) OR truthful rejection
6. Reload verifies active head and history persistence
7. Series 2 starts from resulting Champion, not hardcoded baseline; historical Series keep original objectives
8. Series A/B from one head: A promotes, B stale authorization
9. A → B → A rollback invalidates old challenge authorization
10. Fork changes a semantic trait, shows delta, explicit authored activation, source unchanged
11. Normal-play consumer uses pinned snapshot; head change during play doesn't affect running match
12. Experience encounters don't alter training/revisions/genome/head
13. Historical Champion rollback creates append-only history and fresh headVersion
14. Export/import preserves identity/hashes/head/Series/promotions/Journal; repeat is idempotent; conflicting head rejected
15. Migration-failure recovery and promotion-transaction abort without evidence loss
16. Incompatible-era measurements show no false delta; common-era re-evaluation can be appended and compared

**To run browser smoke:** The project has `scripts/browser-ui-smoke.mjs` and `scripts/browser-e2e-certification.mjs` as patterns. A Profile-specific browser script was registered as `test:profiles:browser` in `package.json` pointing to `scripts/agent-profile-browser.mjs` — **but that script does not exist yet.** It needs to be created. It should launch Chromium via the existing Puppeteer/CDP pattern, navigate to `#/evolution` (which now defaults to the Profiles tab), and exercise the scenarios above.

**Do NOT mark any browser scenario as PASS without actually executing it.**

### 4.5 Experience Record Integration Polish

The `recordAgentExperience()` function in `play-app.js` (line ~540) calls `buildExperienceRecord` from `profile-science.mjs` and writes to the store. This path is tested in Node (consumer test 6 passes). However:

- The `buildExperienceRecord` export must exist in `profile-science.mjs` — verify it's exported.
- The `state.experienceNotice` value set by `recordAgentExperience` is not currently rendered anywhere in the terminal screen UI. It should be shown so the player knows the encounter was recorded.
- Experience records should be visible in the Profile workspace's Analyze tab (currently the dossier shows measurements but not experience counts).

### 4.6 `resolveProfileHead` and `validateSnapshot` Exports

`play-controller.js` dynamically imports `'../evolution/profile-store.mjs'` for `validateSnapshot` and `'../evolution/identity.mjs'` for `LAB_IDENTITY`. These are browser-side `dist/` paths after build. Verify they resolve correctly in the built dist (the build copies the modules but import paths may need the `?v=` cache-bust suffix that the build script appends). The consumer tests pass in Node against `dist/play/play-controller.js`, which is a good sign, but browser module resolution can differ.

### 4.7 `evolution-cockpit.js` Integration

The cockpit edit adds `['profiles','Profiles','00']` as the first navigation entry and calls `mountProfileWorkspace(page('profiles'))`. The `page()` function creates a `<section>` element for each surface. Verify:

- The `page('profiles')` element exists when the cockpit mounts (check the `page` helper function in `evolution-cockpit.js`)
- The Profiles tab is selected by default or accessible via keyboard navigation
- Cleanup on cockpit teardown calls `profiles.cleanup()` before `cleanupCharts()`

### 4.8 Remaining Spec Items Not Yet Implemented

1. **Legacy template creation without permanent archetype** — The `TEMPLATE_CATALOG` in `profile-contracts.mjs` provides template snapshots. Templates are optional at creation time (tested: "template initialization snapshots values and leaves no permanent identity requirement"). This is done.

2. **Dossier era-boundary explanations** — `buildDossier()` in `profile-journal.mjs` groups measurements by era and marks which is the required era. The Analyze tab renders this. The visual presentation exists but has not been reviewed by a human.

3. **Accessibility** — The UI uses ARIA roles (`tablist`, `tabpanel`, `tab`, `aria-current`, `aria-selected`, `aria-describedby`, `aria-labelledby`, `aria-live`, `role="alert"`, `role="status"`), visible focus outlines (`.ap-layout *:focus-visible`), and `<caption>` on all data tables. Keyboard tab navigation uses the standard `tabindex` pattern. No screen reader testing has been done.

---

## 5. Architecture Quick Reference

### Module dependency graph

```
profile-contracts.mjs  (pure, no I/O)
    ↓ imported by
profile-journal.mjs    (pure, no I/O)
    ↓ imported by
profile-store.mjs      (I/O: IndexedDB or memory backend)
    ↓ imported by
profile-science.mjs    (orchestrates store + engine execution)
    ↓ imported by
profile-workspace.js   (browser UI, event delegation, renders HTML)
    ↓ mounted by
evolution-cockpit.js   (existing Lab cockpit, adds "Profiles" nav tab)

play-controller.js     (consumer: admitAgentSnapshot, pinned _agent field)
play-app.js            (consumer: /play/agent/<id> route, recordAgentExperience)
```

### Key types

- **AgentProfile**: `{ agentProfileId, displayName, tags, origin, createdAt, forkOf }`
- **Head (headToken)**: `{ agentProfileId, headVersion, activeRevisionId, championCheckpointId, requiredEvaluationEraId, promotionPolicyId, lastTransitionId }`
- **Artifact**: `{ id, kind, scope, body, origin, hash }` — kinds include `PROFILE_REVISION`, `CAPABILITY_OBJECTIVE`, `PROMOTION_POLICY`, `EVALUATION_ERA`, `SERIES_MANIFEST`, `GENERATION_SELECTION`, `CHALLENGER_NOMINATION`, `MEASUREMENT_MANIFEST`, `MEASUREMENT_RESULT`, `CHALLENGE_MANIFEST`, `CHALLENGE_DECISION`, `PROMOTION_RECORD`, `LEARNING_JOURNAL`, `EXPERIENCE_RECORD`, `EXPOSURE_RECORD`, `MIGRATION_LINK`
- **Checkpoint**: `{ checkpointId, agentId, schemaVersion, policyState: { weights }, mutation, generation, identity }`
- **Snapshot** (for consumers): `{ checkpointId, policyId, policyState, snapshotDigest, implementation, profile, rulesProfileId, displayName, resolvedAt }`

### Store backends

- **`MemoryBackend`**: In-memory Map-based, used by all Node tests. Supports the same generator-coroutine transaction protocol.
- **`IndexedDbBackend`**: Browser IndexedDB with `onSuperseded` callback for cross-tab upgrade detection. Object stores: `profiles`, `heads`, `events`, `artifacts`, `checkpoints`, `receipts`, `operations`, `traces`.

### The `#command()` transaction protocol

All head-changing operations go through `ProfileStore.#command(command, plan)` where `plan` is a generator function. The outer `write()` method drives the generator, yielding IDB operations. The `#command` wrapper handles: receipt-based idempotency, full head-token comparison (`sameHead`), transition ID generation, immutable artifact writes, checkpoint writes, executability check, journal validation, event append, head update, and receipt recording — all atomically within one IDB transaction.

**Important lint note:** Three `plan` generators (CREATE_PROFILE at line 379, FORK at line 514, LINK_V1 at line 535) return without yielding. They work because `#command`'s outer generator does the yielding via `yield* plan(...)`. The `require-yield` eslint rule flags these. Fix with eslint-disable comments or convert to regular functions returning the plan object.

### Science pipeline

1. `startSeries()` — freezes manifest (head token, checkpoint, revision, objective, era, optimizer config, TRAINING pack with disjoint seeds)
2. `runSeries()` — executes generations with fenced ownership; each generation mutates, evaluates via real engine, selects by TRAINING fitness
3. Nomination — best-of-series checkpoint if it differs from the source
4. `prepareHeldOut()` / `runPlannedMeasurement()` — measures the nominee with held-out seeds; cannot change selection
5. `prepareChallenge()` / `runChallenge()` — promotion challenge with fresh disjoint seeds, paired Student-t estimator, tail-balance guard
6. `promoteChallenger()` — atomic head transition if decision is APPROVE and authorization is valid (same head, not replayed)

### Estimator design

Paired Student-t with per-opponent disjoint seed slices → composite i.i.d. blocks → one-sided 95% CI. A tail-balance guard rejects when `|skewBlock| > 2.5 * |meanBlock|` to prevent false approvals under skewed null distributions. Frozen before any real challenge ran; validated with Monte Carlo (test 26: "48 composite blocks with tail guard keep false approval near nominal under skew").

---

## 6. How to Continue

```bash
cd H:\myProjects\Intrilex-MASTER\Intrilex_dev-current

# 1. Fix the 5 lint errors in profile-store.mjs
#    - Line 123: globalThis.IDBKeyRange (may already be fixed, verify)
#    - Lines 379, 514, 535: add /* eslint-disable-next-line require-yield */
#    - Line 638: add /* eslint-disable-next-line no-control-regex */

# 2. Verify lint is clean
pnpm run lint    # expect 0 errors (warnings are pre-existing)

# 3. Run full test suite
pnpm test        # expect 0 failures across all 2400+ tests

# 4. Run focused Profile tests
node --test test/agent-profile-contracts.test.mjs test/agent-profile-store.test.mjs test/agent-profile-science.test.mjs test/agent-profile-consumer.test.mjs
# expect 54 pass, 0 fail

# 5. Typecheck
npx tsc --noEmit  # expect 0 errors

# 6. Build
pnpm run build    # must pass; copies profile modules to dist

# 7. Commit (see section 4.3 for message)

# 8. Create scripts/agent-profile-browser.mjs for browser acceptance
#    (see section 4.4 for the 16 scenarios)

# 9. Run browser acceptance with Chromium
#    pnpm run test:profiles:browser

# 10. Address experience record UI rendering (section 4.5)
```

### Files to read first

1. `docs/AGENT_PROFILES.md` — architecture overview and invariants
2. `packages/simulation-runtime/src/profile-contracts.mjs` — all type definitions and pure validators
3. `packages/simulation-runtime/src/profile-store.mjs` — the `#command()` pattern and all store operations
4. `test/fixtures/agent-profile-fixtures.mjs` — shared test helpers
5. `AGENTS.md` — project-wide build/test/lint commands and conventions

### Key lines in modified files

- `evolution-cockpit.js` lines 8–9: import + nav entry; lines 151–153: mount + cleanup
- `play-controller.js` lines 57–70: `admitAgentSnapshot()` + `AGENT_POLICY_ID`; lines 126–131: `_agent`/`_policyActions` fields
- `play-app.js` lines 206–208: `/play/agent/` route; lines 509–552: `startAgentProfileMatch` + `recordAgentExperience`
- `scripts/build.mjs` line 85: extended module copy list
- `scripts/ci.mjs` line 298: `agent-profiles` CI stage
- `package.json` scripts: `test:profiles`, `test:profiles:browser`

---

## 7. What NOT to Do

- Do not let held-out evaluation influence selection (invariant I3)
- Do not let ordinary gameplay mutate Profile state (invariant I8)
- Do not reclassify authored/forked/manual/rollback changes as learned (invariant I7)
- Do not use checkpoint equality without full head-token comparison (invariant I5)
- Do not promote twice on retry (invariant I6)
- Do not follow a moving Profile during a running operation (invariant I9)
- Do not fabricate evidence, deltas, or browser/concurrency PASS status
- Do not mark browser scenarios as PASS without actually executing them in Chromium
- Do not claim statistical strength from the small fixture samples used in tests
- Do not modify existing V1 Evolution module semantics
- Do not duplicate engine rules or authority boundaries
- The pre-existing 422 lint warnings (`no-unused-vars`) are documented in AGENTS.md — do not attempt to fix them
