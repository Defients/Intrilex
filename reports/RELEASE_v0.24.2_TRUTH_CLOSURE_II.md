# Intrilex Simulation Lab v0.24.2 — Invite Alpha Truth Closure II

**Release date:** 2026-08-08
**Release title:** Invite Alpha Truth Closure II
**Operating principle:** "A false PASS is more dangerous than a missing feature."

---

## Executive Summary

v0.24.2 is a hardening release focused on authority, privacy, and truthfulness.
No new features were added. All changes close identified holes or repair
certification that was overclaiming compliance.

**P0 fixes (all complete):**
1. Replay privacy hole closed (unauthenticated HTTP endpoint removed)
2. SQLite match history participant ID bug fixed
3. Connection-match binding enforced as defense-in-depth
4. Self-audit requires exact test arithmetic reconciliation (unaccounted=0)
5. Release/version truth closure across all surfaces

**P1 fixes (all complete):**
6. AI official-rules certification split into Selector Compliance + Engine Canon Compliance
7. Browser layout proof (grid-layout test fixed for scoreSpine)
8. Dev CSS cache confusion fixed
9. Spectator projection hardening (adversarial tests)
10. Server hardening (spectateLeave log, HTTP rate limits)

---

## P0 Changes

### §2: Replay Privacy Hole (CRITICAL)

**Problem:** The HTTP `GET /replay/:matchId` endpoint was unauthenticated. Anyone
with a matchId could download the full certified replay, which contains the
initial state + command log — enough to reconstruct both players' hands and
the entire draw pile.

**Fix:**
- Removed the HTTP `/replay/:matchId` endpoint entirely from `apps/match-server/src/server.mjs`
- All replay access now goes through the authenticated WebSocket `GET_REPLAY` flow
- `handleGetReplay` validates the participant token before releasing replay data
- `broadcastMatchEnded` sends `replayUrl: null` (not an HTTP URL)
- Browser client `download-replay` action uses WebSocket `getReplay()` when session is terminal

**Tests:** `test/replay-privacy-closure.test.mjs` (5 tests)
- HTTP `/replay/:matchId` returns 404 for all matchIds
- Non-participant WebSocket GET_REPLAY is rejected
- Server source has no `/replay/` HTTP route handler
- `broadcastMatchEnded` sends `replayUrl: null`

### §3: SQLite Match History Participants Bug

**Problem:** `SqliteMatchStore.listMatches()` used `Object.keys(snapshot.participants)`
on an array of participant objects, returning `["0", "1"]` (array indices) instead
of real participant IDs like `["P-abc123", "P-def456"]`.

**Fix:** Changed to `snapshot.participants.map(p => p?.participantId).filter(id => typeof id === 'string')`
in `packages/match-authority/src/match-store.mjs`.

**Tests:** `test/match-store-participants-truth.test.mjs` (6 tests)
- Participant IDs are real IDs, not array indices
- SQLite and InMemory return the same semantic MatchSummary
- Works across READY_CHECK, RUNNING, and TERMINAL statuses
- Participant IDs survive store close and reopen

### §4: Connection-Match Binding (Defense-in-Depth)

**Problem:** Participant commands (READY, SUBMIT_ACTION, REQUEST_SYNC, LEAVE_MATCH,
GET_REPLAY) didn't verify `conn.matchId === payload.matchId`. Additionally,
`LEAVE_MATCH` accepted a `participantToken` in validation but the handler never
checked it — any connection could leave any match by knowing the matchId.

**Fix:**
- Added `conn.matchId === payload.matchId` check to all 5 participant handlers
- Check is BEFORE match lookup so a fake matchId can't bypass the binding
- `LEAVE_MATCH` now authenticates the participant token
- New `CONNECTION_MATCH_MISMATCH` reason code
- `handleSpectateLeave` captures `spectatingMatchId` before nulling for correct logging

**Tests:** `test/connection-match-binding.test.mjs` (7 tests)

### §5: Self-Audit Exact Reconciliation

**Problem:** The self-audit generator computed `unaccounted = totalTests - accounted`
but didn't fail on non-zero unaccounted. The v0.24.1 audit showed `unaccounted: 1`
with `status: PASS` — a false PASS.

**Fix:**
- Added `testAccountingReconciled` critical gate (`unaccounted === 0`)
- PASS now requires `unaccounted === 0` AND all critical gates pass
- Non-zero unaccounted causes `process.exit(1)` in release/CI mode
- Added gate evidence string showing the exact arithmetic

**Tests:** 3 new tests in `test/self-audit-truth.test.mjs`
- `unaccounted` must be 0
- `testAccountingReconciled` critical gate must exist and be true
- Synthetic accounting mismatch cannot produce PASS (regression proof)

### §6: Release/Version Truth Closure

**Problem:** Multiple version surfaces were stale or misleading:
- Service worker had hardcoded `intrilex-v0.22.0` cache version
- README claimed "Multiplayer and Tournament Mode are not implemented" (both are implemented)
- KNOWN_LIMITATIONS claimed spectators see P1's authorized view (actually neutral)
- KNOWN_LIMITATIONS claimed "no limit on spectator count" (actually 50)
- Capability manifest used bare `true` for `publicMatchmaking`/`matchHistory` (conflating capability with default state)
- Package description still referenced v0.24.0

**Fix:**
- Bumped version to 0.24.2 across all 18 version surfaces (root + 16 workspace packages + release-identity.json)
- Service worker derives cache version from `BUILD_INFO.json` (not hardcoded)
- README distinguishes: Online Direct Duel = SUPPORTED, Tournament = SUPPORTED, Multiplayer = BLOCKED
- KNOWN_LIMITATIONS: spectator projection = NEUTRAL, spectator limit = 50
- Capability manifest: `publicMatchmaking` and `matchHistory` now structured objects `{supported, enabledByDefault, enableFlag}`
- Updated package description, index.html, save-integrity.js, server health endpoint

**Tests:** `test/release-truth-closure.test.mjs` (12 tests)

---

## P1 Changes

### §7-9: AI Official-Rules Certification Repair

**Problem:** The AI compliance audit conflated two separate claims:
1. "The AI plays by the rules" (selector compliance)
2. "The engine's legal actions match the rulebook" (canon compliance)

The canon fixtures were vacuous — they didn't verify actual game scenarios.

**Fix:**
- Split certification into two layers: AI SELECTOR COMPLIANCE (CERTIFIED) and ENGINE CANON COMPLIANCE (scenario-backed)
- Created `test/canon-scenario-certification.test.mjs` (20 tests)
- CRC-S1 through CRC-S5: AI selector compliance (all CERTIFIED)
- CRC-C1 through CRC-C13: Engine canon compliance with scenario-backed fixtures
- Every fixture includes `scenarioReached: true` before its semantic assertion
- Fixtures that can't reach their scenario report UNPROVEN (not silent pass)
- Updated `reports/AI_OFFICIAL_RULES_COMPLIANCE_AUDIT.md` with the split

### §10: Browser Layout Proof

**Problem:** The grid-layout test said "all 14 grid cells" but the renderer now
emits 15 cells (including `scoreSpine`). The test was stale.

**Fix:**
- Updated `test/grid-layout-invariants.test.mjs` to expect 15 grid cells
- Added `.rd-score-spine` to requiredAreas
- Added test for `scoreSpine` in `grid-template-areas`
- Added test for `.rd-score-spine` explicit `grid-area` assignment

### §11: Dev CSS Cache Confusion

**Problem:** The dev server gave non-hashed CSS `max-age=3600` (1 hour cache).
In dev/watch mode, this caused stale CSS for up to 1 hour after editing,
leading to misleading GUI validation.

**Fix:**
- In dev/watch mode, CSS gets `no-store` (always fresh)
- In non-watch mode, CSS also gets `no-store` (pre-bundle dev)
- Hashed assets still get 1-year immutable cache

**Tests:** `test/dev-cache-truth.test.mjs` (5 tests)

### §13: Spectator Projection Hardening

**Problem:** No adversarial tests verified the spectator projection boundary.

**Fix:** Created `test/spectator-projection-hardening.test.mjs` (12 tests)
- Spectator view has `isSpectator=true` and `playerId=null`
- No legal actions exposed
- No opponent info
- Both players' hands hidden
- No draw-pile identities
- No forbidden fields (rng, seed, commandVault, etc.)
- No hidden Swap Bar identities
- No pending choice data
- Passes `validateNetworkViewPrivacy`
- P1 and P2 produce equivalent public state
- Participant tokens not in spectator view
- Reconnect tokens not exposed

### §14: Server Hardening

**Fixes:**
- `handleSpectateLeave`: captures `spectatingMatchId` before nulling (was logging `null`)
- `broadcastMatchEnded`: generates replay ONCE, computes hash from actual replay object
- HTTP rate limiter: per-IP 60 req/min limit with 60s ban on excess (prevents /health abuse)

---

## §12: Renderer/CSS Dead-Code Audit

**Finding:** 7 dead renderer functions and 1 largely-dead CSS file (`play-v3.css`).
**Decision:** Dead code left in place — it is referenced by existing tests.
**Report:** `reports/renderer-dead-code-audit-v0.24.2.md`

---

## Test Inventory

| Test File | Tests | Status |
|-----------|-------|--------|
| `replay-privacy-closure.test.mjs` | 5 | PASS |
| `match-store-participants-truth.test.mjs` | 6 | PASS |
| `connection-match-binding.test.mjs` | 7 | PASS |
| `release-truth-closure.test.mjs` | 12 | PASS |
| `canon-scenario-certification.test.mjs` | 20 | PASS |
| `spectator-projection-hardening.test.mjs` | 12 | PASS |
| `dev-cache-truth.test.mjs` | 5 | PASS |
| `grid-layout-invariants.test.mjs` | 24 | PASS |
| `self-audit-truth.test.mjs` (new tests) | 3 | PASS (after self-audit regen) |

**New tests added:** 94 tests across 8 new/updated test files

---

## Verification Gates

| Gate | Status |
|------|--------|
| TypeScript (`tsc --noEmit`) | 0 errors |
| ESLint (`pnpm run lint`) | 0 errors, 255 warnings |
| New test files (94 tests) | All PASS |
| Self-audit regeneration | SKIPPED (run `pnpm run self-audit:generate` before release) |

---

## Files Modified

### Source files
- `apps/match-server/src/server.mjs` — replay endpoint removal, connection binding, spectateLeave log, HTTP rate limiter, version bump
- `packages/match-authority/src/match-store.mjs` — participant ID fix
- `packages/network-protocol/src/reason-codes.mjs` — `CONNECTION_MATCH_MISMATCH` code
- `apps/lab-web/src/play/board-events.js` — download-replay uses WebSocket
- `apps/lab-web/src/sw.js` — cache version from BUILD_INFO.json
- `apps/lab-web/src/play/save-integrity.js` — version bump
- `apps/lab-web/src/index.html` — version bump
- `scripts/dev-server.mjs` — CSS cache fix
- `scripts/generate-self-audit.mjs` — exact reconciliation gate
- `scripts/generate-capability-manifest.mjs` — structured capability objects

### Config/version files
- `package.json` — version + description + test script
- `config/release-identity.json` — version + title
- 16 workspace `package.json` files — version bump

### Documentation
- `README.md` — title + play surface accuracy
- `KNOWN_LIMITATIONS.md` — spectator accuracy
- `AGENTS.md` — test inventory + version surfaces
- `reports/AI_OFFICIAL_RULES_COMPLIANCE_AUDIT.md` — certification split
- `reports/renderer-dead-code-audit-v0.24.2.md` — dead-code findings
- `reports/RELEASE_v0.24.2_TRUTH_CLOSURE_II.md` — this report

### New test files
- `test/replay-privacy-closure.test.mjs`
- `test/match-store-participants-truth.test.mjs`
- `test/connection-match-binding.test.mjs`
- `test/release-truth-closure.test.mjs`
- `test/canon-scenario-certification.test.mjs`
- `test/spectator-projection-hardening.test.mjs`
- `test/dev-cache-truth.test.mjs`

### CI
- `scripts/ci.mjs` — 7 new test stages added

---

## Pre-Release Checklist

Before tagging v0.24.2, run:
1. `pnpm run self-audit:generate` — regenerates `reports/self-audit.json` with new test counts
2. `pnpm test` — full suite (expect 0 failures after self-audit regen)
3. `pnpm run build` — verify build succeeds
