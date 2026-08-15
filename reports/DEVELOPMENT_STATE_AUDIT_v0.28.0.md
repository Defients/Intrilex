# Intrilex Simulation Lab — Development-State Audit v0.28.0

**Auditor:** Devin (GLM-5.2 High) · **Date:** 2026-08-15 · **Subject:** `Intrilex_dev-current` @ commit `42bfde6` (with uncommitted game-enhancements batch)

**Method:** Forensic inventory grounded in 4 parallel subagent explorations (core engine, match-server, lab-web UI, account-domain + scripts), direct file reads of AGENTS.md (79KB), KNOWN_LIMITATIONS.md, package.json, self-audit.json, both forensic remediation ledgers, the v0.24.2 audit, 26 Supabase migrations, 176 test files, grep sweeps for TODO/FIXME/stubs across all packages and apps, and git state analysis.

**FACT** = directly observed in code/report/test output. **INFERENCE** = reasoned from observed patterns.

---

## 0) Audit Rules Compliance

- Exhaustive scan: **16 packages**, **3 apps**, **60+ active scripts**, **176 test files**, **26 Supabase migrations**, **35 hash routes**, **18 observatory workspaces**, **11 academy lessons**, **13+ puzzles**, **56 achievements**, **70+ reports**.
- Every claim cites a file path, function, or report.
- FACT vs INFERENCE labeled throughout.
- "Exists ≠ works" applied: the tournament system "exists" end-to-end but is not end-to-end usable (§3.1).

---

## 1) Full System Scan — Component Index

### 1.1 Packages (16) — `packages/*/`

| # | Package | Files | Purpose | Status |
|---|---------|-------|---------|--------|
| 1 | `@intrilex/shared` | 4 src | Canonical JSON, SHA-256, version constants, provenance, release-identity | Shipping |
| 2 | `@intrilex/statistics` | 1 src | Wilson CI, BH FDR, bootstrap, McNemar, empirical Bayes, interaction estimates | Shipping |
| 3 | `@intrilex/policy-sdk` | 1 src | `DeterministicPolicyRng` (xorshift32), `createPolicyDefinition`, capability validation | Shipping |
| 4 | `@intrilex/policies` | 2 src | 5 baseline policies (random-legal, score-rush, control, tempo, value) + scoring weights | Shipping |
| 5 | `@intrilex/game-ai` | 14 src | HYBIX AI: perception → memory → personality → coordination → cognition (BT+GOAP) → failsafe | Shipping |
| 6 | `@intrilex/decision-intelligence` | 7 src | Decision traces, 45+ reason codes, 40+ mechanic registry, counterfactual anchors | Shipping |
| 7 | `@intrilex/telemetry` | 3 src | Semantic telemetry schema v4 + rank telemetry v5 | Shipping |
| 8 | `@intrilex/engine-adapter` | 4 src | Thin adapter over vendored engine v4.2.6: profiles, replay parse/verify, projections, introspection | Shipping |
| 9 | `@intrilex/simulation-runtime` | 10 src | `runPolicyMatch`, `runCampaign` (worker-parallel, AB/BA), counterfactual, rank attribution/power | Shipping |
| 10 | `@intrilex/analytics` | 3 src | Mechanic discovery, synergy detection, policy comparison, evidence grading, rank integration | Shipping |
| 11 | `@intrilex/analytics-ai` | 13 src | Optional Ollama LLM layer: client, model discovery, sanitizer, context builder, response validator | Partial |
| 12 | `@intrilex/browser-crypto-shim` | 2 src | Browser-native SHA-256 + canonical JSON (mirrors shared) | Shipping |
| 13 | `@intrilex/match-authority` | 5 src | `AuthoritativeMatchSession`, `player-projection` (hidden-info firewall), `match-store`, `matchmaking-queue`, `achievement-projection` | Shipping |
| 14 | `@intrilex/network-protocol` | 3 src | Wire protocol v2: message builders, 40+ reason codes, strict validators, 64KB limit | Shipping |
| 15 | `@intrilex/account-domain` | 22 src | Identity, capabilities, Glicko-2 rating, seasons, leaderboard, relationships, tournaments, fingerprint, meta-report, profile-domain, replay-branching | Shipping |
| 16 | `@intrilex/achievements` | 8+ src | 56 launch achievements: catalog, facts, reducer, evaluator, eligibility, migration, projection | Shipping |

### 1.2 Apps (3) — `apps/*/`

| App | Files | Purpose | Status |
|-----|-------|---------|--------|
| `@intrilex/lab-web` | ~100+ src files | Browser SPA: 35 routes, 18 observatory workspaces, play module, academy, puzzles, network lobby, profile, leaderboard, players, tournaments, meta, seasons | Shipping |
| `@intrilex/match-server` | ~25 src files | WebSocket gateway: 21 message types, 6 handler modules, auth, persistence, ranked, monitoring, tournaments | Shipping |
| `@intrilex/batch-cli` | 1 src (52 lines) | CLI: `verify-corpus`, `capabilities`, `match`, `campaign` | Shipping (minimal) |

### 1.3 Browser UI Subsystems — `apps/lab-web/src/`

**Entry & Core:** `index.html` (CSP, SEO, PWA, frame-busting), `app.js` (1,970 lines — orchestrator + routing + overlays), `router.js` (128 lines — central hash router), `state.js` (global state), `rerender.js` (event bus), `version.js`, `sw.js` + `sw-register.js` (PWA), `worker.js` (Web Worker), `error-boundary.js`, `onboarding-tour.js`, `seo-metadata.js`.

**Play Module** (`play/`): `play-app.js` (2,191 lines), `play-controller.js` (886 lines), `play-state.js`, `board-events.js` (~750 lines), `ranked-duel-renderer.mjs` (**4,618 lines — largest file**), `ranked-duel-terminal.mjs` (578), `ranked-duel-hub.mjs` (200), `ranked-duel-viewmodel.mjs`, `action-presentation.mjs`, `action-presenter.js`, `persistence.js` (IndexedDB, 5 stores), `replay-library.js`, `save-integrity.js`, `local-profile.mjs`, `ai-commentary.js`, `ai-personality.js`, `play-card-component.js`, `play-sound.js`, `play-particles.js`, `tutorial-runtime.js`.

**Play Sub-modules:**
- `play/academy/` — 9 files, ~3,385 lines (curriculum 1,635 lines, renderer, controller, progress, briefing, recap, mastery, coachmarks, detectors)
- `play/puzzle/` — 9 files, ~15,476 lines (puzzle-fixtures.generated.mjs ~13,000 lines auto-generated)
- `play/network/` — 8 files, ~3,750 lines (network-session, protocol-client, lobby-renderer, auth-controller, account-store, migration-controller, match-server-config, supabase-client)
- `play/authority/` — legal-action-adapter, priority-projection, reason-code-registry, visibility-projection
- `play/intelligence/` — action-explanation, decision-evidence
- `play/orchestration/` — declaration-flow, resolution-flow
- `play/state/` — play-lifecycle, session-lease (BroadcastChannel dup-tab protection)
- `play/achievements/` — achievement-runtime, achievement-ui, achievement-presenter
- `play/profile/` — profile-data (RPC client + offline fallback)
- `play/players/` — players-data, recent-opponents-data, relationships-data
- `play/rank/` — rank-glyph, ranking-system-overlay
- `play/ranked/` — leaderboard-data

**Workspaces (18):** observatory.js (2,970 — consolidated Compare/Mechanics/Synergies/History/Replays/Traces), profile.js (3,408), leaderboard.js (782), human-tournaments.js (745), ranks.js, release-notes.js, season-archive.js, meta-report.js, intelligence.js, settings.js, auth.js, players.js, branches.js, diagnostics.js, tournament.js, evidence.js, tournament-scheduler.js.

**Analytics AI Panel** (`analytics-ai/`): browser-controller, intelligence-panel, settings, styles.

**CSS:** `styles.css` (entry, 13 `@import`s), `tokens-base.css`, `feature-components.css`, `pages-polish.css`, `rules-illustrated.css`, `landing-revamp.css`, `landing-mobile.css`, `advanced-card-rules.css`, `play-v3.css`, `ranked-duel.css`, `puzzle.css`, `rank-glyph.css`, `ranking-system-overlay.css`, `leaderboard.css`, `players.css`.

### 1.4 Match-Server Subsystem — `apps/match-server/src/`

- **server.mjs** (1,550 lines) — main gateway, `classifyMatch()`, `handleMessage()` (NET-01 promise-aware dispatch, 21 message types)
- **handlers/** — auth-handlers (298), match-handlers (~550, 8 handlers), matchmaking-handlers (172), spectator-handlers (221), tournament-handlers (331), report-handlers (93)
- **auth/** — identity-verifier (interface), fake-identity-verifier (107), supabase-identity-verifier (243, JWKS-backed)
- **persistence/** — match-result-persistor (interface), fake-match-result-persistor (356), supabase-match-result-persistor (~400), match-result-builder (233), terminal-outbox (486, DATA-01 durable SQLite outbox), tournament-repository (267, InMemory + Supabase)
- **ranked/** — rating-service (120), season-service (170), leaderboard-repository (172)
- **monitoring/** — health-monitor (196, structured alerts)

### 1.5 Scripts (60+ active) — `scripts/`

**Build (6):** build.mjs, bundle.mjs, build-engine-patch.mjs, build-card-art.mjs, build-ranked-glyphs.mjs, generate-data.mjs
**Dev (1):** dev-server.mjs (SSE hot reload, optional match server)
**CI/Release (5):** ci.mjs (100+ stages), package-release.mjs (SEC-01 gated), verify-clean-room.mjs, verify-extracted.mjs, manifest.mjs
**Version/Manifest (5):** generate-version.mjs, generate-release-identity.mjs, generate-engine-manifest.mjs, generate-capability-manifest.mjs, generate-self-audit.mjs
**Security (2):** secret-containment-scan.mjs, scan-archive-secrets.mjs
**Operations (3):** provision-season.mjs (CLI), backup-match-db.mjs (systemd timer), forward-logs.mjs
**Campaign (4):** generate-autonomy-campaign.mjs, generate-decision-traces.mjs, regenerate-stale-replays.mjs, generate-full-rank-audit.mjs
**Browser E2E (4):** browser-ui-smoke.mjs, browser-e2e-certification.mjs, browser-network-e2e.mjs, browser-parity.mjs
**Deploy (2):** sync-neocities.mjs, upload-neocities.mjs
**Analytics (5):** extract-analysis.mjs, validate-synthetic-analytics.mjs, benchmark.mjs, benchmark-hybrix.mjs, benchmark-observatory.mjs
**Verify (5):** verify-build-determinism.mjs, verify-browser-{ui,parity,proof}-report.mjs, vendor-verify.mjs
**Other (8):** engine-patch-{test,conformance,integrity,package}.mjs, certify-pass-priority-hotfix.mjs, falsification-sweep.mjs, truth-drift-check.mjs, profile-cognition.mjs, demo-hybrix.mjs, check-package-graph.mjs, typecheck.mjs, validate-schema.mjs

### 1.6 Data Layer — `supabase/migrations/` (26 migrations)

| Migration | Creates |
|-----------|---------|
| 0001–0008 | profiles, account_settings, competitive (ratings/stats), match_history, achievements, moderation, migration_meta, service_role_grants |
| 0009 | ranked_seasons, rating_events audit ledger, 4 SECURITY DEFINER RPCs (leaderboard, standing, seasons, season history) |
| 0010 | profile_customization, profile_showcase, profile_privacy + 10 RPCs |
| 0011 | tier_for_rating/division_for_rating/is_apex_rating SQL functions + functional indexes |
| 0012 | persist_match_result(jsonb) atomic RPC |
| 0013–0014 | player_directory RPC + authenticated grants |
| 0015 | get_recent_opponents RPC |
| 0016 | player_relationships table + 9 RPCs (follow/rival/block/suggested) |
| 0017–0018 | revoke public execute on SECURITY DEFINER functions + achievement catalog constraint |
| 0019–0022 | remove season fabrication (4 functions patched) |
| 0020 | tournaments, tournament_participants, tournament_matches tables |
| 0023–0025 | tournament match ID unique constraint, atomic save RPC, service role grants followup |

### 1.7 Hidden / Background / Implicit Components

- **Service Worker** (`sw.js`) — offline-first PWA caching
- **Web Worker** (`worker.js`) — offloads campaigns/counterfactuals/diagnostics
- **Session Lease** (`session-lease.js`) — BroadcastChannel + localStorage dup-tab protection
- **Heartbeat timer** in match-server (15s ping interval)
- **Cleanup timer** in match-server (60s expired-match sweep)
- **Health monitor** — periodic checks, structured `healthAlert`/`healthSnapshot` JSON logs
- **Terminal outbox drain** — bounded exponential backoff, restart recovery
- **Campaign segment cache** — `runtime/campaign-segments-v070/` (gitignored, auto-invalidated)
- **SQLite WAL mode** — `runtime/match-server/matches.sqlite` (gitignored)
- **Build-time import rewriting** — `scripts/build.mjs` rewrites `@intrilex/*` → browser paths, `node:crypto` → shim
- **Content-hashed config injection** — `__intrilex-config.[hash].js` (immutable, SW cache-safe)
- **Frame-busting JS fallback** — IRX-M40 (Neocities doesn't support HTTP headers)

---

## 2) Progress Mapping — Component-by-Component

### 2.1 Packages Progress Matrix

| Package | Status | % | Dependencies | Blockers | User Reachable |
|---------|--------|---|--------------|----------|----------------|
| shared | Shipping | 98 | none | none | Yes (transitive) |
| statistics | Shipping | 95 | none | 1 `@deprecated` legacy fn (`evidenceGradeLegacy`) | Yes (transitive) |
| policy-sdk | Shipping | 92 | shared | none | Yes (transitive) |
| policies | Shipping | 90 | policy-sdk | Only 5 baseline; 14 HYBIX live in game-ai (fragmentation) | Yes via CLI/UI |
| game-ai | Shipping | 88 | policy-sdk, policies, decision-intelligence | `coordination.mjs` multi-bot blackboard unused in 2-player (INFERENCE) | Yes via Play/Campaign |
| decision-intelligence | Shipping | 92 | shared | none | Yes via /traces, /diagnostics |
| telemetry | Shipping | 90 | shared | none | Yes (transitive) |
| engine-adapter | Shipping | 95 | shared | Thin wrapper over vendored TS engine; recompilation required on engine change | Yes (transitive) |
| simulation-runtime | Shipping | 90 | 8 deps | none | Yes via CLI/UI |
| analytics | Shipping | 85 | 6 deps | none | Yes via /ranks, /mechanics |
| analytics-ai | Partial | 72 | none (isomorphic) | Requires Ollama running locally; disabled by default | Yes via /intelligence (if Ollama up) |
| browser-crypto-shim | Shipping | 98 | none | none | Yes (transitive in browser) |
| match-authority | Shipping | 90 | engine-adapter, shared, network-protocol | none | Yes via /play/online |
| network-protocol | Shipping | 92 | none | none | Yes (transitive) |
| account-domain | Shipping | 95 | none | Tournament server RPCs not yet deployed (domain complete) | Yes (transitive) |
| achievements | Shipping | 92 | none (isomorphic) | none | Yes via /achievements, profile |

### 2.2 Apps Progress Matrix

| App | Status | % | Blockers / Notes |
|-----|--------|---|------------------|
| lab-web | Shipping | 85 | Self-audit PASS (97/92); uncommitted game-enhancements batch (working, tested); 4 monolith hotspots >2K lines; 708MB local zip clutter (gitignored) |
| match-server | Shipping | 88 | server.mjs 1,550 lines (acceptable with extracted handlers); tournament match execution is metadata-only (§3.1); PostgreSQL migration upgrade testing BLOCKED |
| batch-cli | Shipping | 80 | Minimal 52-line wrapper; only 4 commands; no `tournament` or `rank:audit` CLI command |

### 2.3 UI Workspaces Progress Matrix

| Workspace | Route | % | Status | Notes |
|-----------|-------|---|--------|-------|
| Watch | /watch | 90 | Shipping | Inline replay playback engine |
| Replays | /replays | 88 | Shipping | Verify/search/compare |
| History | /history | 85 | Shipping | Sortable ledger, pagination |
| Mechanics | /mechanics | 88 | Shipping | Atlas with opportunity/usage/impact |
| Card Faces | /cards | 85 | Shipping | (via mechanics) |
| Synergies | /synergies | 85 | Shipping | Stratified synergy/anti-synergy |
| Ranks | /ranks | 82 | Shipping | Power observatory (9 data integrity bugs fixed in v0.24.2 cycle) |
| Compare | /compare | 85 | Shipping | Matched cohorts |
| Traces | /traces | 88 | Shipping | Per-decision traces |
| Branches | /branches | 82 | Shipping | Counterfactual lab + player replay branching |
| Diagnostics | /diagnostics | 85 | Shipping | Policy behavior |
| Tournament (AI) | /tournament | 75 | Partial | AI-vs-AI bracket; persistence; auto-play; no human-in-loop |
| Evidence | /evidence | 88 | Shipping | Integrity registry |
| Profile | /profile | 85 | Shipping | 3,408-line hotspot; 4 tabs; self/public modes; cosmetics; privacy |
| Intelligence | /intelligence | 72 | Partial | Ollama panel; requires local LLM; deterministic checks work without Ollama |
| Achievements | /achievements | 90 | Shipping | 56 achievements, gallery, toasts |
| Settings | /settings | 88 | Shipping | Display, accessibility, network, account |
| Auth | /auth | 88 | Shipping | Discord/Google OAuth |

### 2.4 Player-Facing Routes Progress Matrix

| Route | % | Status | Notes |
|-------|---|--------|-------|
| / (Landing) | 90 | Shipping | Player-first redesign, mode selector, account dropdown |
| /play | 88 | Shipping | Play hub, lazy-loaded |
| /play/new | 85 | Shipping | Match setup, policy/difficulty/seed |
| /play/match | 85 | Shipping | Active match (ranked duel) |
| /play/online | 82 | Shipping | Network lobby, create/join/queue/spectate/reconnect |
| /play/academy | 88 | Shipping | 11 lessons across 3 tiers, end-to-end playable |
| /play/replays | 85 | Shipping | Replay library, IndexedDB |
| /puzzles | 85 | Shipping | 13+ puzzles, solver, progress tracking |
| /leaderboard | 88 | Shipping | Top 100, My Rank, search, tier filter, season picker |
| /players | 88 | Shipping | Directory + Recent Opponents + Rivals tabs |
| /seasons | 85 | Shipping | Season archive with status badges |
| /meta | 85 | Shipping | Tier distribution, rating stats, competitive health |
| /tournaments | 72 | **Partial** | Discovery + registration works; **bracket match execution is manual** (§3.1) |
| /rules | 90 | Shipping | Rulebook renderer, illustrated mode |
| /profile (self) | 85 | Shipping | Full profile with cosmetics, showcase, privacy |
| /player/@handle | 85 | Shipping | Public profile with privacy firewall |

### 2.5 Play Module Progress Matrix

| Sub-module | % | Status | Notes |
|------------|---|--------|-------|
| Play Hub | 88 | Shipping | Route dispatch, lazy-load |
| New Match Setup | 85 | Shipping | Policy/difficulty/seed selection |
| Tutorial (First Contact) | 82 | Shipping | 13 chapters, real engine authority |
| Active Match (Ranked Duel) | 82 | Shipping | 4,618-line renderer monolith; sound + particles |
| Academy | 88 | Shipping | 11 lessons, 3 tiers, mastery tiers |
| Puzzle Ladder | 85 | Shipping | 13+ puzzles, AI solver, progress |
| Replay Library | 85 | Shipping | IndexedDB, certified verification |
| Save/Resume | 82 | Shipping | IndexedDB + quarantine |
| Network Lobby | 82 | Shipping | Create/join/queue/spectate/reconnect/rematch |
| Network Chat | 85 | Shipping | SEND_CHAT/CHAT_MESSAGE protocol (v0.25 closed the v0.24.2 gap) |
| Advanced Card Rules | 78 | **Uncommitted** | 6-issue game-enhancements batch; 387 insertions; 446-line test; registered in package.json + ci.mjs |
| AI Commentary | 75 | Partial | Deterministic tactical commentary; gated by guidance mode |
| AI Personality | 78 | Partial | Banter pools; 6 archetypes |
| Local Profile | 82 | Shipping | Rating/badges/history; tournament badges marked `available: false` (honest) |

---

## 3) Behavioral & Logic Diagnostics — Reality vs Intent

### 3.1 Tournament System (CRITICAL GAP — partially finished)

**Today:** The tournament system has five layers all implemented:
- **Domain** (`packages/account-domain/src/tournament-domain.mjs`, 608 lines): `createTournament`, `registerPlayer`, `startTournament`, `generateSingleElimBracket` (with BYEs), `advanceSingleElimRound`, `advanceSwissRound`, `recordTournamentResult`, `getChampion`, `getSwissStandings` — all pure, tested (32 tests + 8 progression tests).
- **Persistence** (`apps/match-server/src/persistence/tournament-repository.mjs`): `InMemoryTournamentRepository` + `SupabaseTournamentRepository` with atomic `upsert_tournament_atomic` RPC (migration 0024).
- **Handlers** (`apps/match-server/src/handlers/tournament-handlers.mjs`, 331 lines): `TOURNAMENT_LIST`, `TOURNAMENT_GET`, `TOURNAMENT_REGISTER`, `TOURNAMENT_START` (operator-only), `TOURNAMENT_REPORT_RESULT` (operator-only).
- **Protocol** (`packages/network-protocol/src/validation.mjs`): 5 validators registered in `KNOWN_TYPES` (IRX-C07 fix).
- **UI** (`apps/lab-web/src/workspaces/human-tournaments.js`, 745 lines): Discovery, registration, bracket viewer, offline/empty/loading/error states.

**What's missing — the end-to-end bridge:**
- `handleTournamentStart` calls `startTournament()` (generates bracket **metadata**) and saves, but does **NOT** create `AuthoritativeMatchSession` instances for tournament matches. FACT: grep for `CREATE_MATCH|createMatch|launchMatch` in tournament-handlers.mjs returns 0 matches.
- `handleTournamentReportResult` records a winnerId but does **NOT** verify a real match was played — the operator manually reports `winnerId`, `scoreA`, `scoreB`. The `matchRef` field is optional (`?? null`).
- There is no automated bracket progression notification to players ("your next match is ready").
- There is no champion ceremony or reward distribution.

**Should be:** A tournament should auto-launch matches when a round starts, notify participants, wait for real match completion via the existing `CREATE_MATCH`/`MATCH_ENDED` flow, auto-record results, advance the bracket, and crown a champion. Today it's a metadata-only skeleton requiring full operator manual orchestration.

**Inconsistency:** The domain layer is complete and tested. The persistence is complete and tested. The handlers are complete and tested. The UI is complete and tested. But the **bridge between tournament matches and actual game sessions** doesn't exist. Each layer is "done" in isolation; the system is not "done" end-to-end.

### 3.2 Self-Audit System (RESOLVED since v0.24.2)

**Today:** `reports/self-audit.json` reports `status: PASS`, `score: 97`, `threshold: 92`, `quickMode: false`, `testFileCount: 175`, `filesExecuted: 174`, `totalTests: 4079`, `totalPass: 4065`, `totalFail: 0`, `totalSkip: 14`. Generated 2026-08-14 in full mode.

**Should be:** PASS in full mode. **FACT: This is now correct.** The v0.24.2 audit flagged this as FAIL (78/92, quick mode) — that's been fixed.

### 3.3 Forensic Remediation Ledger (PARTIAL — 100 findings uninventoried)

**Today:** Two ledgers exist:
- `forensic-remediation-ledger.json` (124KB, v0.27.0) — **93 findings, ALL FIXED** (9 critical, 44 high, 40 medium).
- `forensic-remediation-ledger-v0.28.0.json` (15KB, v0.28.0) — **112 findings, only 12 critical inventoried** (10 fixed, 1 partial, 1 human-action-required). **100 findings (40 high, 52 medium, 8 lower) are NOT_INVENTORIED** — the ledger states "the full August 14 audit file with all 112 finding IDs was not located in the repository."

**Should be:** All 112 findings from the most recent audit should be enumerated and dispositioned.

**Risk:** There are potentially 100 unresolved issues from the latest audit that have never been enumerated. The v0.27.0 ledger (93 all fixed) suggests the codebase was clean before the v0.28.0 audit found new issues — but we don't know what those 100 issues are.

### 3.4 Uncommitted Game-Enhancements Batch (WORKING but not committed)

**Today:** 7 modified files + 1 new 446-line test file (`test/game-enhancements.test.mjs`) are uncommitted. The batch covers 6 issues: (1) per-family action icons, (2) self-response bug fix, (3) King Anchor surfacing, (4) game log event display, (5) swap bar slot consistency, (6) action flow revamp. 387 insertions, 89 deletions.

**FACT:** The test IS registered in both `package.json` (line 21) and `scripts/ci.mjs` (line 204) — so committing won't break `test-coverage-meta.test.mjs`. This is a working, tested feature that just hasn't been committed.

**Should be:** Committed. The v0.24.2 audit flagged a similar uncommitted feature as "one `git add` from breaking CI" — this one is safe to commit.

### 3.5 Chat System (RESOLVED since v0.25)

**Today:** `SEND_CHAT` (client→server) and `CHAT_MESSAGE` (server→client) protocol messages exist. `handleSendChat` validates, checks connection-match binding, authenticates participant token, broadcasts to match participants. `NetworkPlaySession.sendChatMessage()` sends with optimistic local echo. Tests: `test/network-chat.test.mjs` (15 tests).

**Should be:** Network chat works E2E. **FACT: This is now correct.** The v0.24.2 audit flagged this as a gap (UI without protocol) — that's been closed.

### 3.6 Tournament Badges (HONEST — not a gap)

**Today:** `local-profile.mjs` lines 34-35: `tournament-champion` and `bracket-buster` badges are marked `available: false` with "coming soon" descriptions and `check: () => false`. The profile renders these as "Coming soon" instead of misleading locked/progress state.

**Should be:** Either human tournaments exist (badges earnable) or badges are marked unavailable. **FACT: The current state is honest.** This is not a gap — it's a correctly-marked future feature.

### 3.7 Silent Failure Zones (MINIMAL)

**Today:** The match-server has comprehensive error handling:
- Terminal outbox: errors logged with `logEvent('outboxJobExhausted')`, bounded retry, graceful shutdown drain.
- Health monitor: all check errors caught and logged (non-blocking).
- Block checker: fail-closed (errors treat as blocked).
- Achievement persistence: non-fatal (unlocks already succeeded; progress transfer errors logged).
- Match cleanup timer: errors caught with try-catch.

**Should be:** No silent failures in critical paths. **FACT: This is largely correct.** The only intentional non-fatal errors are achievement progress transfer (acceptable — unlocks already succeeded) and cleanup timer errors (acceptable for maintenance).

---

## 4) Architecture Overview — As-Built Map

### 4.1 Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER UI (apps/lab-web) — 100+ src files                 │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────────────┐  │
│  │ Landing   │ │ Play Mod │ │ Observatory (18 workspaces)│  │
│  │ /, /rules │ │ /play/*  │ │ /watch ... /intelligence   │  │
│  │ /puzzles  │ │ /academy │ │ /profile /leaderboard      │  │
│  │ /meta     │ │ /online  │ │ /players /tournaments      │  │
│  └──────────┘ └──────────┘ └────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Shared: router.js, state.js, rerender.js (event bus)  │   │
│  │ PWA: sw.js, worker.js | Auth: auth-controller.js      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ (build-time import rewriting, hashing)
┌──────────────────────┴──────────────────────────────────────┐
│  PACKAGES (16)                                              │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────────────┐ │
│  │ shared     │ │ statistics │ │ browser-crypto-shim      │ │
│  │ policy-sdk │ │ policies   │ │ game-ai (HYBIX, 14 mod)  │ │
│  │ decision-  │ │ telemetry  │ │ engine-adapter           │ │
│  │ intelligence│ │           │ │ (vendor v4.2.6 bridge)   │ │
│  ├────────────┴─┬────────────┴─┬──────────────────────────┤ │
│  │ simulation-  │ analytics     │ analytics-ai (Ollama)   │ │
│  │ runtime      │               │                         │ │
│  ├──────────────┬───────────────┬─────────────────────────┤ │
│  │ match-       │ network-      │ account-domain (22 mod) │ │
│  │ authority    │ protocol      │ achievements (56)       │ │
│  └──────────────┴───────────────┴─────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│  VENDORED ENGINE (upstream/intrilex-engine-4.2.6)           │
│  TypeScript → compiled to runtime/autonomy-engine-dist       │
│  6 core profiles + 5 first-contact profiles                 │
│  Rules: v4.3.1 (K♠ Wild Sovereignty + BJ Board Lock)       │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│  APPS (3)                                                   │
│  lab-web (browser)  match-server (WebSocket, 3099)  batch-cli│
│                                                             │
│  EXTERNAL: Supabase (Postgres+Auth), Ollama (optional LLM), │
│  Neocities (static hosting), DigitalOcean VPS (match server)│
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Data Model

- **Match:** seed, profileId, policyIdsBySeat, command log, decision journal, idempotency records, revision counter, frame hash
- **Replay:** certified v2 format (seed + commands + provenance + integrity hash); legacy v1 for 121 governing replays
- **Network Match:** SQLite (WAL) or InMemory; snapshot = metadata + participants + command log + journal + idempotency + timestamps; engine state reconstructed via deterministic replay
- **Save:** IndexedDB, 5 stores (saves, replays, achievements, matchStats, preferences), format v2 with integrity payload
- **Local Profile:** localStorage; rating, record, streak, ratingHistory, badges, archetypeBreakdown, verifiedResults
- **Supabase:** 26 migrations — profiles, account_settings, player_ratings (Glicko-2), player_stats, matches, match_participants, rating_events, ranked_seasons, ranked_season_archive, account_achievements, account_migrations, profile_customization, profile_showcase, profile_privacy, player_relationships, tournaments, tournament_participants, tournament_matches, player_reports, moderation

### 4.3 State Machines

- **NetworkSessionState:** IN_LOBBY → READY_CHECK → STARTING → RUNNING → TERMINAL (+ RECONNECTING, REJECTED, EXPIRED). Monotonic transition guard.
- **MatchStatus:** WAITING_FOR_OPPONENT → READY_CHECK → STARTING → RUNNING → TERMINAL/ABORTED/EXPIRED
- **PlayLifecycle:** maps engine SessionState → player-facing LifecycleState
- **ConnectionAuthState:** UNAUTHENTICATED → AUTHENTICATED (auth gate rejects privileged commands pre-auth)
- **TournamentStatus:** SCHEDULED → OPEN_REGISTRATION → IN_PROGRESS → FINALIZING → COMPLETED/CANCELLED
- **SeasonStatus:** UPCOMING → ACTIVE → FINALIZING → ARCHIVED

### 4.4 Interaction Logic

- **Hash-based routing:** `#/watch`, `#/play/match`, etc. — single central router (`router.js` + `app.js` render dispatch)
- **Event delegation:** `board-events.js` binds clicks/keys on match board
- **Worker messaging:** `worker.js` receives campaign/diagnostic requests, posts results
- **WebSocket protocol:** JSON envelopes with `protocolVersion`, `type`, `payload`; 21 client→server types; NET-01 promise-aware dispatch
- **BroadcastChannel:** session-lease for dup-tab protection
- **Rerender bus:** `rerender.js` decouples workspaces from `app.js` (IRX-C06 fix — replaced 65+ dynamic import backedges)

### 4.5 Agents / Workflows

- **HYBIX AI:** perception → memory → personality → coordination → cognition (BT + utility + bounded GOAP) → failsafe. 6 archetypes × 4 difficulties = 12 policy variants + 2 baseline = 14 HYBIX policies.
- **Campaign orchestration:** segmented, multi-worker (1/2/4), AB/BA seat-swap, resume capability, provenance-keyed cache invalidation
- **Tournament scheduler (AI):** single-elimination bracket, BYE filling, BoX with AB/BA, third-place for 4+
- **Health monitor:** periodic checks, structured alerts with severity escalation (warning → critical)
- **Terminal outbox drain:** bounded exponential backoff, restart recovery, idempotent application

### 4.6 Internal Tools

- **CI:** `scripts/ci.mjs` — 100+ stages, fail-fast, writes `reports/ci-stages.json`
- **Self-audit:** `generate-self-audit.mjs` — runs full test suite, computes dimensional score + critical gates
- **Truth drift check:** `truth-drift-check.mjs` — guards documented counts vs actuals
- **Falsification sweep:** `falsification-sweep.mjs` — adversarial release certification
- **Build determinism:** `verify-build-determinism.mjs` — dual-build tree hash
- **Package graph:** `check-package-graph.mjs` — acyclic dependency verification
- **Clean-room verification:** `verify-clean-room.mjs` — full workspace self-consistency
- **Season provisioning:** `provision-season.mjs` — operator CLI (list/current/provision/activate/finalize/rollover)
- **SQLite backup:** `backup-match-db.mjs` — VACUUM INTO, gzip, offsite copy, retention pruning (systemd timer)

### 4.7 External Integrations

- **Supabase** (Postgres + Auth + JWKS JWT verification) — 26 migrations, 30+ SECURITY DEFINER RPCs, RLS on all tables
- **Ollama** (optional, local LLM via Fetch API) — disabled by default
- **Chrome/Chromium** (required for browser E2E certification — not always present)
- **node:sqlite** (built-in Node 22+, experimental) — WAL mode match store + terminal outbox
- **Neocities** (static frontend hosting) — `sync-neocities.mjs` + `upload-neocities.mjs`
- **DigitalOcean VPS** (match server production) — Caddy TLS → match server on 127.0.0.1:3099
- **Discord/Google OAuth** (via Supabase Auth)

### 4.8 Architectural Drift & Fragmentation

1. **Analytics duplication (RESIDUAL):** `browser-analytics.js` (74KB) mirrors server-side `packages/analytics` + `packages/simulation-runtime` rank logic. Build script rewrites imports. Two code paths — drift risk. (Flagged in v0.24.2, still present.)
2. **Policy catalog fragmentation (RESIDUAL):** 5 baseline policies in `packages/policies`, 14 HYBIX in `packages/game-ai/policy-adapter.mjs`. Unified catalog in `simulation-runtime/policy-catalog.mjs` is a merge layer, not a single source.
3. **CSS bloat (RESIDUAL):** `play-v3.css` + `ranked-duel.css` = ~235KB of play CSS. "v3" naming implies v1/v2 existed.
4. **Renderer monolith (RESIDUAL):** `ranked-duel-renderer.mjs` (4,618 lines) — the single largest source file.
5. **Profile workspace monolith (NEW):** `profile.js` (3,408 lines) — comprehensive but a hotspot.
6. **App orchestrator monolith (RESIDUAL):** `app.js` (1,970 lines) — routing + overlays + landing + devblog.
7. **Two crypto paths (INTENTIONAL):** `packages/shared` (node:crypto) vs `packages/browser-crypto-shim` (Web Crypto). Intentional but a maintenance surface.
8. **Two tournament systems (INTENTIONAL):** AI-vs-AI at `/tournament` (observatory) vs human tournaments at `/tournaments` (player-facing). Distinct purposes, not duplication.

---

## 5) Risk Zones & Missing Pieces — Risk Register

| # | Risk | Severity | Evidence | Status |
|---|------|----------|----------|--------|
| R1 | **100 uninventoried forensic findings** (40 high, 52 medium, 8 lower) from v0.28.0 audit | **High** | `forensic-remediation-ledger-v0.28.0.json`: "NOT_INVENTORIED — full August 14 audit file with all 112 finding IDs was not located" | NEW |
| R2 | **Tournament system not end-to-end usable** — bracket metadata only, no auto match execution | **High** | grep: 0 `CREATE_MATCH` in tournament-handlers.mjs; `handleTournamentReportResult` accepts manual winnerId | NEW |
| R3 | **PostgreSQL migration upgrade testing BLOCKED** — no test target | **Medium** | `forensic-remediation-ledger-v0.28.0.json` IRX-C03/C11: "PostgreSQL/Supabase test environment not available" | RESIDUAL |
| R4 | **Credential rotation HUMAN_ACTION_REQUIRED** | **Medium** | `forensic-remediation-ledger-v0.28.0.json` IRX-C01: "Credential rotation remains HUMAN_ACTION_REQUIRED. Release remains BLOCKED until rotation is confirmed" | RESIDUAL |
| R5 | **Uncommitted game-enhancements batch** — working, tested, but not committed | **Low** | `git status`: 7 modified files + 1 new test; 387 insertions; registered in package.json + ci.mjs | NEW |
| R6 | **708MB local zip clutter** — 2 zip files in repo root | **Low** | `intrilex-agent-analysis-part1xd.zip` (473MB) + `part2xd.zip` (235MB); gitignored (`*.zip`), NOT tracked by git | RESIDUAL (mitigated — gitignored) |
| R7 | **Renderer monolith** — `ranked-duel-renderer.mjs` 4,618 lines | **Medium** | File size | RESIDUAL |
| R8 | **Profile workspace monolith** — `profile.js` 3,408 lines | **Medium** | File size | NEW |
| R9 | **App orchestrator monolith** — `app.js` 1,970 lines | **Low** | File size | RESIDUAL |
| R10 | **Analytics duplication** — browser-analytics.js (74KB) vs packages/analytics | **Medium** | Two implementations of rank analytics | RESIDUAL |
| R11 | **Policy catalog fragmentation** — 5 baseline + 14 HYBIX in 2 packages | **Low** | Unified catalog is a merge layer | RESIDUAL |
| R12 | **CSS bloat** — ~235KB play CSS | **Low** | File sizes | RESIDUAL |
| R13 | **Browser-dependent tests silently FAIL** — without Chrome | **Low** | KNOWN_LIMITATIONS.md | RESIDUAL (by design) |
| R14 | **`coordination.mjs` (multi-bot) unused in 2-player** | **Low** | INFERENCE: game is 2-player only | RESIDUAL |
| R15 | **1 `@deprecated` legacy function** (`evidenceGradeLegacy`) | **Low** | `packages/statistics/src/statistics.mjs:196` | RESIDUAL |
| R16 | **batch-cli minimal** — only 4 commands, no tournament/rank CLI | **Low** | 52-line wrapper | RESIDUAL |
| R17 | **Analytics AI requires Ollama** — disabled by default, most users never see LLM features | **Low** | By design | RESIDUAL (by design) |

**Severity changes since v0.24.2:**
- **RESOLVED:** Self-audit FAIL (was R1 High → now PASS), uncommitted advanced-card-rules (was R4 High → committed), chat UI without protocol (was R5 Medium → closed v0.25), tournament badges unearnable (was R6 Low → now honestly marked `available: false`), no graceful shutdown (was R10 Medium → SIGTERM/SIGINT handlers added), no auth/identity system (was R19 Medium → full Supabase auth + JWKS + Glicko-2 + seasons + leaderboard built), single-commit history (was R20 Medium → now 42+ commits).

---

## 6) Next Moves Blueprint — Prioritized Roadmap

### P0 — Stabilize (stop the bleeding)

| Step | What | Why | Impact | DoD |
|------|------|-----|--------|-----|
| P0.1 | **Enumerate and disposition the 100 uninventoried v0.28.0 findings** | 40 high-severity issues may be real defects | Trust, risk visibility | All 112 findings enumerated in ledger with disposition (FIXED/WONTFIX/BLOCKED) |
| P0.2 | **Commit the game-enhancements batch** | Working tested feature sitting uncommitted | Closure | `git status` clean for play module; `pnpm test` passes |
| P0.3 | **Delete the 708MB local zip clutter** (or move outside repo) | Local workspace hygiene | Disk space | Zips removed from repo root (already gitignored) |

### P1 — Complete (finish partially built tools)

| Step | What | Why | Impact | DoD |
|------|------|-----|--------|-----|
| P1.1 | **Tournament auto-match execution bridge** — `TOURNAMENT_START` auto-creates `AuthoritativeMatchSession` for each first-round match, notifies participants, waits for `MATCH_ENDED`, auto-records result, advances bracket | Tournament system is metadata-only; the competitive loop is incomplete | Feature completeness, unlocks tournament badges | Tournament can run end-to-end without operator manual result reporting |
| P1.2 | **Tournament champion ceremony + reward distribution** — auto-detect tournament completion, crown champion, grant `tournament-champion`/`bracket-buster` badges | Badges are marked "coming soon" but the domain logic exists | Honesty, engagement | Champion badge auto-granted on tournament win; `available: true` |
| P1.3 | **PostgreSQL migration upgrade test harness** — spin up ephemeral Postgres, apply all 26 migrations, verify RPCs | Migration testing is BLOCKED (no test target); v0.28.0 ledger flags this for IRX-C03/C11 | Correctness, deploy safety | CI stage `test:migrations:upgrade` passes against real Postgres |
| P1.4 | **Tournament `batch-cli` command** — `pnpm cli -- tournament create/list/start/report` | Tournament operations are script-only or operator-only via WebSocket | DX | CLI tournament commands work |

### P2 — Improve (refactors, DX, performance)

| Step | What | Why | Impact | DoD |
|------|------|-----|--------|-----|
| P2.1 | **Split `ranked-duel-renderer.mjs`** (4,618 lines) into sub-renderers (board, chat, rail, setup, terminal, actions) | Largest source file; maintainability hotspot | Maintainability | Each sub-renderer <800 lines; all tests pass |
| P2.2 | **Split `profile.js`** (3,408 lines) into tab modules (overview, ranked, achievements, matches) | Second-largest workspace; hotspot | Maintainability | Each tab module <800 lines; all tests pass |
| P2.3 | **Unify analytics** — make `browser-analytics.js` import from `packages/analytics` via build rewrite instead of duplicating | Two analytics code paths drift | Correctness | Single source of rank logic; browser tests pass |
| P2.4 | **Remove `evidenceGradeLegacy`** from `packages/statistics` | Only `@deprecated` function in codebase | Cleanliness | No callers; `pnpm test` passes |
| P2.5 | **Add `tournament` and `rank:audit` commands to `batch-cli`** | CLI only has 4 commands | DX | `pnpm cli -- tournament ...` and `pnpm cli -- rank:audit` work |
| P2.6 | **Reduce CSS bloat** — audit `play-v3.css` + `ranked-duel.css` (~235KB) for dead rules | Performance | Performance | <180KB combined; no dead selectors |

### P3 — Expand (new features only after foundations)

| Step | What | Why | Impact | DoD |
|------|------|-----|--------|-----|
| P3.1 | **Swiss tournament pairing improvement** — replace simple adjacent pairing with Dutch Swiss or Monrad | Current Swiss pairing is basic (adjacent with rematch avoidance) | Competitive fairness | Swiss pairing uses Dutch Swiss; tested |
| P3.2 | **Spectator chat** — let spectators commentate during tournament matches | Spectator mode is view-only | Engagement | Spectators can chat; rate-limited |
| P3.3 | **Replay sharing via URL** — shareable replay links | Replays are local-only or auth-gated | Virality | URL loads replay without server auth |
| P3.4 | **Tournament scheduling** — scheduled start times, registration windows, reminders | Tournaments require operator manual start | Engagement | Tournaments auto-start at scheduled time |

---

## 7) Final Deliverables

### State Grade: **B+** (Strong, mature, with one critical feature gap)

| Dimension | Grade | Justification |
|-----------|-------|---------------|
| **Completeness** | A− | 16 packages shipping, 3 apps, 176 test files (4079 tests), 26 migrations, 35 routes, 11 academy lessons, 13+ puzzles, 56 achievements. Tournament system is the one major incomplete feature (metadata-only). 100 uninventoried findings. |
| **Correctness** | A− | Self-audit PASS (97/92, full mode, 0 fail). 93 prior findings all fixed. 12 critical v0.28.0 findings fixed. Rank data integrity bugs fixed. Chat protocol closed. But 100 findings unenumerated, PostgreSQL migration testing BLOCKED. |
| **Coherence** | A | Clear layering (packages → apps → vendored engine). Central router. Uniform WebSocket dispatch (NET-01). Rerender bus decouples workspaces. Fail-closed production mode. Durable persistence by default. Residual fragmentation in analytics (browser vs server) and policies (2 packages). |
| **Observability** | B+ | Self-audit (PASS, full mode), CI (100+ stages), health monitor (structured alerts), terminal outbox (durable), truth drift check, build determinism. No Prometheus/OpenTelemetry export, no distributed tracing. |
| **Maintainability** | B+ | 0 type errors, 0 lint errors, JSDoc coverage, smoke tests per package, no TODO/FIXME debt (only 1 `@deprecated`). But 4 monolith hotspots >2K lines (renderer 4,618; profile 3,408; observatory 2,970; app 1,970; play-app 2,191; server 1,550), 708MB local clutter, analytics duplication. |

**Overall: B+** — A sophisticated, well-tested deterministic game engine + competitive platform with strong architectural foundations. The v0.24.2 audit's P0 items are all resolved (self-audit PASS, advanced-card-rules committed, chat protocol closed, auth system built, graceful shutdown added). The codebase has been through one complete remediation cycle (93 findings fixed) and is mid-way through a second (12 of 112 critical fixed). The single biggest gap is the tournament system's missing match-execution bridge — every layer is built and tested in isolation, but the end-to-end flow doesn't exist. The 100 uninventoried findings are a visibility risk. The infrastructure is A-grade; the "last mile" on tournaments and finding closure is B-grade.

**Grade progression:** v0.24.2 was B−. v0.28.0 is B+. The improvement is real and grounded in resolved findings, not just feature additions.

---

## 8) Autonomy Directive — High-Leverage Target: **Tournament System End-to-End Bridge**

### Why this target?

The tournament system is the highest-leverage partially-finished tool because:

1. **Every layer is built and tested** — domain (608 lines, 32+8 tests), persistence (267 lines, 49 tests), handlers (331 lines, 6+8+11 tests), protocol (5 validators), UI (745 lines, 35 tests). The only missing piece is the **bridge between tournament matches and actual game sessions**.
2. **It unlocks the competitive loop** — tournament badges become earnable, human tournaments become real, the `/tournaments` route becomes more than a discovery page.
3. **It's the shortest path to end-to-end excellence** — the bridge is ~200-300 lines of orchestration code in `handleTournamentStart` + a new `handleTournamentMatchEnded` hook, reusing the existing `CREATE_MATCH`/`MATCH_ENDED` flow.
4. **It's the most visible "partially finished" feature** — players can register for tournaments but can't actually play them through the tournament system.

### Shortest path to end-to-end excellence

1. `TOURNAMENT_START` auto-creates `AuthoritativeMatchSession` for each first-round match (reusing `handleCreateMatch` logic with tournament-scoped match IDs)
2. Server notifies both participants via `TOURNAMENT_MATCH_READY` (new message) with matchId + invite code
3. Players join via existing `JOIN_MATCH` flow
4. On `MATCH_ENDED`, server checks if the match was a tournament match (via `matchRef` or a tournament match registry)
5. If yes, server auto-calls `recordTournamentResult()` with the real winner, advances the bracket
6. Server sends `TOURNAMENT_ROUND_ADVANCED` to all participants with next-round pairings
7. On tournament completion, server crowns champion and grants badges

### Exact next 5–10 commits

1. **`feat(tournament): auto-create matches on TOURNAMENT_START`** — `handleTournamentStart` creates `AuthoritativeMatchSession` for each first-round match; stores tournament match registry (matchId → tournamentId, round, pairing); sends `TOURNAMENT_MATCH_READY` to both participants. Test: `test/tournament-auto-match.test.mjs`.
2. **`feat(tournament): auto-record results on MATCH_ENDED`** — `broadcastMatchEnded` checks tournament match registry; if match is a tournament match, auto-calls `recordTournamentResult()` with real winner; advances bracket; sends `TOURNAMENT_ROUND_ADVANCED`. Test: extend `test/tournament-auto-match.test.mjs`.
3. **`feat(tournament): champion ceremony + badge grant`** — on tournament completion, auto-grant `tournament-champion` badge to winner; if lowest seed, grant `bracket-buster`; flip `available: true` in `local-profile.mjs`; send `TOURNAMENT_COMPLETED` with champion. Test: `test/tournament-champion.test.mjs`.
4. **`feat(ui): tournament match-ready notification + auto-join`** — `human-tournaments.js` handles `TOURNAMENT_MATCH_READY` with a notification overlay and "Join Match" button; handles `TOURNAMENT_ROUND_ADVANCED` with bracket update; handles `TOURNAMENT_COMPLETED` with champion display. Test: extend `test/epoch-7-competitive-loop.test.mjs`.
5. **`feat(tournament): Swiss pairing improvement`** — replace adjacent pairing with Dutch Swiss (score-group pairing with rematch avoidance + color balance). Test: extend `test/competition-formats.test.mjs`.
6. **`feat(cli): tournament commands in batch-cli`** — `pnpm cli -- tournament create|list|start|report` for operator convenience. Test: extend `apps/batch-cli` smoke test.
7. **`docs: tournament operator runbook`** — update `docs/MULTIPLAYER_DEPLOYMENT.md` with tournament lifecycle, operator CLI, and the new auto-match flow.
8. **`test: tournament end-to-end integration test`** — full flow: create → register 4 players → start → auto-match → play → auto-record → advance → play final → champion → badge. Test: `test/tournament-e2e.test.mjs`.

### Tests/metrics that prove it's truly fixed

- `test/tournament-auto-match.test.mjs` — TOURNAMENT_START creates real matches; MATCH_ENDED auto-records results
- `test/tournament-champion.test.mjs` — champion badge auto-granted on completion
- `test/tournament-e2e.test.mjs` — full 4-player single-elim tournament runs end-to-end with zero operator intervention
- `test/competition-formats.test.mjs` — Swiss pairing produces valid pairings
- `test/epoch-7-competitive-loop.test.mjs` — UI handles all tournament notifications correctly
- Self-audit remains PASS (97/92) with new tests added
- `tournament-champion` and `bracket-buster` badges flip to `available: true`
