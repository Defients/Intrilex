# Intrilex Simulation Lab — Development-State Audit v0.24.2

**Auditor:** Devin (GLM-5.2 High) · **Date:** 2026-08-09 · **Subject:** `Intrilex_dev-current` @ commit `19167e0` (with uncommitted advanced-card-rules feature)

**Method:** Forensic inventory grounded in file reads, subagent exploration of all 14 packages + 3 apps + 50 scripts + 108 test files, direct test execution, grep sweeps for stubs/TODOs, and cross-referencing of `package.json`, `ci.mjs`, `capability-manifest.json`, `self-audit.json`, `KNOWN_LIMITATIONS.md`, and `RANK_DATA_INTEGRITY_INVESTIGATION.md`.

**FACT** = directly observed in code/report/test output. **INFERENCE** = reasoned from observed patterns.

---

## 0) Audit Rules Compliance

- Exhaustive scan: 14 packages, 3 apps, 50 active scripts, 16 archived scripts, 108 test files, 15 workspaces, 5 schemas, 30+ docs, 90+ reports.
- Every claim cites a file path, function, or report.
- FACT vs INFERENCE labeled throughout.
- "Exists ≠ works" applied: several "shipping" components have known defects (see §3, §5).

---

## 1) Full System Scan — Component Index

### 1.1 Packages (14) — `packages/*/`

| # | Package | Files | Purpose |
|---|---------|-------|---------|
| 1 | `@intrilex/shared` | 4 src | Canonical JSON, SHA-256, version constants, provenance hashes, release-identity loader |
| 2 | `@intrilex/statistics` | 1 src | Wilson CI, BH FDR, bootstrap, McNemar, empirical Bayes, interaction estimates |
| 3 | `@intrilex/policy-sdk` | 1 src | `DeterministicPolicyRng` (xorshift32), `createPolicyDefinition`, capability validation |
| 4 | `@intrilex/policies` | 2 src | 5 baseline policies (random-legal, score-rush, control, tempo, value) + scoring weights |
| 5 | `@intrilex/game-ai` | 14 src | HYBIX AI: agent, perception, cognition (BT+GOAP), memory, personality (5-axis/6 archetypes), coordination, difficulty, failsafe, debug, rank-strategy, trace-adapter, config |
| 6 | `@intrilex/decision-intelligence` | 7 src | Decision traces, 45+ reason codes, 40+ mechanic registry, counterfactual anchors, policy diagnostics |
| 7 | `@intrilex/telemetry` | 3 src | Semantic telemetry schema v4 + rank telemetry v5 (counters, metrics, variant metrics) |
| 8 | `@intrilex/engine-adapter` | 2 src | Thin adapter over vendored engine: profile exports, replay parse/verify, public/private views, `deriveSecuredPoints`, replay-scoped public projector |
| 9 | `@intrilex/simulation-runtime` | 10 src | `runPolicyMatch`, `runCampaign` (worker-parallel, AB/BA), counterfactual, unified policy catalog, rank attribution/counterfactual/power, variant & anatomy registries |
| 10 | `@intrilex/analytics` | 3 src | Analytics pipeline: mechanic discovery, synergy detection, policy comparison, evidence grading, rank integration |
| 11 | `@intrilex/analytics-ai` | 13 src | Optional Ollama LLM layer: client, model discovery, sanitizer, deterministic-stats, context builder, response schema/validator/repair, prompt builder, cache, controller |
| 12 | `@intrilex/browser-crypto-shim` | 2 src | Browser-native SHA-256 + canonical JSON (mirrors shared) |
| 13 | `@intrilex/match-authority` | 4 src | `AuthoritativeMatchSession`, `player-projection` (hidden-info firewall), `match-store` (InMemory + SQLite), `matchmaking-queue` |
| 14 | `@intrilex/network-protocol` | 3 src | Wire protocol v1: message builders, 30+ reason codes, strict validators, 64KB limit |

### 1.2 Apps (3) — `apps/*/`

| App | Files | Purpose |
|-----|-------|---------|
| `@intrilex/lab-web` | ~82 src files | Browser UI: 15 workspaces + Play module + Analytics AI panel + PWA |
| `@intrilex/match-server` | 1 src (1,132 lines) | WebSocket gateway: 13 client→server message types, rate limiting, IP banning, SQLite persistence, matchmaking, spectator, replay auth |
| `@intrilex/batch-cli` | 1 src (52 lines) | CLI: `verify-corpus`, `capabilities`, `match`, `campaign` |

### 1.3 Browser UI Subsystems — `apps/lab-web/src/`

**Entry & Core:** `index.html`, `app.js` (orchestrator), `router.js` (15 workspaces + landing modes), `state.js`, `version.js`, `sw.js` + `sw-register.js` (PWA), `worker.js` (Web Worker: campaigns, counterfactuals, diagnostics, replay verification), `error-boundary.js`, `onboarding-tour.js`.

**Data & Authority:** `data-loader.js`, `anchor.js`, `autonomy-runtime.js` (29KB), `browser-proof.js`, `browser-analytics.js` (74KB — rank analytics, telemetry, power models), `card-face-data.js` (43KB), `card-face-renderer.js`, `card-art-registry.js`, `decision-intelligence.js` (28KB), `mechanic-registry-browser.js` (20KB), `observatory-analytics-browser.js` (38KB), `rank-attribution-browser.js`, `rank-power-model.js`, `rulebook-renderer.js`, `experiment-controls.js` (17KB), `integrity.js`.

**Workspaces (15):** `/watch`, `/replays`, `/history`, `/mechanics`, `/cards`, `/synergies`, `/ranks`, `/compare`, `/traces`, `/branches`, `/diagnostics`, `/tournament`, `/evidence`, `/profile`, `/intelligence`. Renderers in `workspaces/` + `workspaces/ranks/rank-anatomy-workspace.js` + `workspaces/tournament-scheduler.js`.

**Play Module** (`play/`): `play-app.js` (63KB controller), `play-controller.js` (31KB authoritative session), `ranked-duel-renderer.mjs` (100KB — the largest source file), `ranked-duel-viewmodel.mjs`, `board-events.js` (23KB), `action-presenter.js`, `ai-commentary.js`, `ai-personality.js`, `play-card-component.js`, `persistence.js` (IndexedDB), `replay-library.js`, `save-integrity.js`, `play-privacy.js`, `play-sound.js`, `play-particles.js`, `tutorial-runtime.js`, `local-profile.mjs`, `session-utils.js`, `hash.js`, `play-state.js`.

**Play Sub-modules:**
- `play/authority/` — `legal-action-adapter.js`, `priority-projection.js`, `reason-code-registry.js`, `visibility-projection.js`
- `play/intelligence/` — `action-explanation.js` (3-layer guidance), `decision-evidence.js`
- `play/orchestration/` — `declaration-flow.js`, `resolution-flow.js`
- `play/state/` — `play-lifecycle.js`, `session-lease.js` (BroadcastChannel dup-tab protection)
- `play/network/` — `network-session.mjs`, `network-lobby-renderer.mjs`, `network-protocol-client.mjs`
- `play/advanced-card-rules/` — **UNCOMMITTED** — `advanced-card-rules-controller.mjs`, `advanced-card-rules-view.mjs`, `card-rules-data.mjs` (62KB — canonical dossier for 54 cards)

**Analytics AI Panel** (`analytics-ai/`): `browser-controller.js`, `intelligence-panel.js`, `settings.js`, `styles.css`.

**CSS:** `styles.css`, `css/tokens-base.css` (37KB), `css/feature-components.css` (51KB), `css/pages-polish.css` (37KB), `css/advanced-card-rules.css` (uncommitted), `play/play-v3.css` (127KB), `play/ranked-duel.css` (108KB).

### 1.4 Scripts (50 active + 16 archived)

**Build (5):** build.mjs, build-engine-patch.mjs, build-card-art.mjs, bundle.mjs, typecheck.mjs
**Test/Verify (8):** benchmark.mjs, benchmark-hybrix.mjs, benchmark-observatory.mjs, engine-patch-test.mjs, engine-patch-conformance.mjs, validate-schema.mjs, validate-synthetic-analytics.mjs, vendor-verify.mjs
**Browser/Cert (5):** browser-parity.mjs, browser-ui-smoke.mjs, browser-e2e-certification.mjs, browser-network-e2e.mjs, certify-pass-priority-hotfix.mjs
**Generate (9):** generate-autonomy-campaign.mjs, generate-autonomy-replay-artifacts.mjs, generate-capability-manifest.mjs, generate-data.mjs, generate-decision-traces.mjs, generate-full-rank-audit.mjs, generate-observatory-analytics.mjs, generate-self-audit.mjs, generate-version.mjs
**Release (4):** package-release.mjs, package-engine-patch.mjs, manifest.mjs, engine-patch-integrity.mjs
**Campaign (2):** run-campaign-segment.mjs, regenerate-stale-replays.mjs
**Dev/CI (4):** dev-server.mjs, ci.mjs, check-package-graph.mjs, truth-drift-check.mjs
**Verify/Report (5):** verify-browser-{parity,proof,ui}-report.mjs, verify-build-determinism.mjs, verify-extracted.mjs
**Demo/Profile (2):** demo-hybrix.mjs, profile-cognition.mjs
**Other (2):** extract-analysis.mjs, falsification-sweep.mjs
**Archived (16):** in `scripts/archive/` (debug-*, _phase0-*, generate-release*, migrate-*, probe-*, etc.)

### 1.5 Config / Schemas / Docs / Reports / Data

- **config/:** `release-identity.json` (single source of truth for 17 version surfaces)
- **schemas/:** 5 JSON schemas (analytics 4.2.0, experiment 2.0.0, run-provenance 4.0.0, semantic-telemetry 4.0.0, telemetry)
- **docs/:** 30+ files (ARCHITECTURE, USER_GUIDE, METRIC_DICTIONARY, HYBRIX_AI_ARCHITECTURE, rulebooks v4.1.2 + v4.3.1, ADRs, guides, audit history)
- **reports/:** 90+ files (self-audit.json, capability-manifest.json, browser certs, version-specific audits v0.10.x–v0.17.0, logs)
- **sample-data/:** observatory/ (analytics.json, metric-registry, decision/resolution facts NDJSON), autonomy/ (aggregate, campaign-accounting, decision-trace-index, 100+ trace JSONs, replays)
- **vendor/:** TypeScript 5.8.3 toolchain
- **upstream/:** Engine v4.2.4 (advanced-core), v4.2.5 (priority-pass hotfix), v4.2.6 (attachment-integrity hotfix)

### 1.6 Hidden / Background / Implicit Components

- **Service Worker** (`sw.js`) — offline-first PWA caching (FACT)
- **Web Worker** (`worker.js`) — offloads campaigns/counterfactuals/diagnostics (FACT)
- **Session Lease** (`session-lease.js`) — BroadcastChannel + localStorage dup-tab protection (FACT)
- **Heartbeat timer** in match-server (15s ping interval) (FACT)
- **Cleanup timer** in match-server (60s expired-match sweep) (FACT)
- **Campaign segment cache** — `runtime/campaign-segments-v070/` (gitignored, auto-invalidated on provenance change) (FACT)
- **SQLite WAL mode** — `runtime/match-server/matches.sqlite` (gitignored) (FACT)
- **TAP output redirect** — `reports/.self-audit-tap-output.txt` (transient, >256MB) (FACT)
- **Build-time import rewriting** — `scripts/build.mjs` rewrites `@intrilex/*` imports → browser paths, `node:crypto` → browser shim (FACT)

---

## 2) Progress Mapping — Component-by-Component

### 2.1 Packages Progress Matrix

| Package | Status | % | Dependencies | Blockers | User Reachable |
|---------|--------|---|--------------|----------|----------------|
| shared | Shipping | 95 | none | none | Yes (transitive) |
| statistics | Shipping | 95 | none | none | Yes (transitive) |
| policy-sdk | Shipping | 92 | shared | none | Yes (transitive) |
| policies | Shipping | 90 | policy-sdk | Only 5 baseline; 14 HYBRIX live in game-ai (fragmentation) | Yes via CLI/UI |
| game-ai | Shipping | 85 | policy-sdk, policies, decision-intelligence | 14 modules; `coordination.mjs` multi-bot blackboard unused in 2-player (INFERENCE) | Yes via Play/Campaign |
| decision-intelligence | Shipping | 90 | shared | none | Yes via /traces, /diagnostics |
| telemetry | Shipping | 88 | shared | Rank telemetry had double-counting bug (fixed per investigation doc) | Yes (transitive) |
| engine-adapter | Shipping | 90 | shared | Thin wrapper over vendored TS engine; recompilation required on engine change | Yes (transitive) |
| simulation-runtime | Shipping | 85 | 8 deps | Rank attribution had fractional multi-rank inconsistency (fixed); campaign segments cached | Yes via CLI/UI |
| analytics | Shipping | 82 | 6 deps | Rank integration had ORV sample-accounting + mislabeled-matrix bugs (fixed per investigation doc) | Yes via /ranks, /mechanics |
| analytics-ai | Partial→Integrated | 70 | none (isomorphic) | Requires Ollama running locally; disabled by default; no streaming UI progress in all modes | Yes via /intelligence (if Ollama up) |
| browser-crypto-shim | Shipping | 95 | none | none | Yes (transitive in browser) |
| match-authority | Shipping | 82 | engine-adapter, shared, network-protocol | SQLite `listMatches` had participant-ID bug (fixed v0.24.2); `LEAVE_MATCH` token auth added v0.24.2 | Yes via /play/online |
| network-protocol | Shipping | 88 | none | No CHAT message type despite UI chat scaffolding (gap) | Yes (transitive) |

### 2.2 Apps Progress Matrix

| App | Status | % | Blockers / Notes |
|-----|--------|---|------------------|
| lab-web | Integrated | 78 | Self-audit FAIL (score 78/92); 471MB orphaned zip in repo root; uncommitted advanced-card-rules feature; chat UI exists but no network chat protocol; `browser-analytics.js` is 74KB monolith duplicating server analytics |
| match-server | Integrated | 80 | Monolithic 1,132-line `server.mjs`; no graceful shutdown signal handling visible; public history/matchmaking disabled by default (invite-alpha) |
| batch-cli | Shipping | 85 | Minimal 52-line wrapper; only 4 commands; no `rank:audit` or `tournament` CLI command |

### 2.3 UI Workspaces Progress Matrix

| Workspace | Route | % | Status | Notes |
|-----------|-------|---|--------|-------|
| Watch | /watch | 88 | Shipping | Core match theatre; semantic stepping |
| Replays | /replays | 85 | Shipping | Verify/search/compare |
| History | /history | 82 | Shipping | Sortable ledger, pagination |
| Mechanics | /mechanics | 85 | Shipping | Atlas with opportunity/usage/impact |
| Card Faces | /cards | 80 | Shipping | Some cards show "Registry pending" (FACT: card-face-renderer.js line 113) |
| Synergies | /synergies | 82 | Shipping | Stratified synergy/anti-synergy |
| Ranks | /ranks | 65 | Integrated-fragile | **HAD CRITICAL DATA INTEGRITY BUGS** — NaN, double-counting, mislabeled matrix (per RANK_DATA_INTEGRITY_INVESTIGATION.md); fixes applied but artifact regeneration required |
| Compare | /compare | 82 | Shipping | Matched cohorts |
| Traces | /traces | 85 | Shipping | Per-decision traces |
| Branches | /branches | 80 | Shipping | Counterfactual lab |
| Diagnostics | /diagnostics | 82 | Shipping | Policy behavior |
| Tournament | /tournament | 72 | Partial | AI-vs-AI bracket; persistence; auto-play; **no human-in-loop tournament**; no export-to-replay-library per match |
| Evidence | /evidence | 85 | Shipping | Integrity registry |
| Profile | /profile | 68 | Partial | Rating, badges, history; **badges `tournament-champion`/`bracket-buster` require tournament integration with profile** (INFERENCE: profile reads `verifiedResults` but tournament results may not flow there) |
| Intelligence | /intelligence | 60 | Partial | Ollama panel; requires local LLM; deterministic checks work without Ollama |

### 2.4 Play Module Progress Matrix

| Sub-module | % | Status | Notes |
|------------|---|--------|-------|
| Play Hub | 85 | Shipping | Route dispatch, lazy-load |
| New Match Setup | 82 | Shipping | Policy/difficulty/seed selection |
| Tutorial (First Contact) | 80 | Shipping | 13 chapters, real engine authority |
| Active Match (Ranked Duel) | 78 | Integrated | 100KB renderer monolith; chat UI scaffolding but no network chat; sound + particles |
| Replay Library | 82 | Shipping | IndexedDB, certified verification |
| Save/Resume | 80 | Shipping | IndexedDB + quarantine |
| Network Lobby | 72 | Partial | Create/join/queue/spectate/history; reconnect; **no in-match chat over network** |
| Advanced Card Rules | 55 | **Uncommitted** | Controller + view + 62KB data; 23 tests pass; **NOT in package.json test script or ci.mjs** → test-coverage-meta will FAIL if committed as-is |
| AI Commentary | 70 | Partial | Deterministic tactical commentary; gated by guidance mode |
| AI Personality | 72 | Partial | Banter pools; 6 archetypes |
| Local Profile | 68 | Partial | Rating/badges; tournament badge wiring unclear |

---

## 3) Behavioral & Logic Diagnostics — Reality vs Intent

### 3.1 Self-Audit System (CRITICAL)

**Today:** `reports/self-audit.json` reports `status: FAIL`, `score: 78`, `threshold: 92`. The generator ran in `--quick` mode (only 4 of 108 test files executed: unit, determinism, analytics, telemetry). `testFileCount: 106`, `filesExecuted: 4`, `quickMode: true`.

**Should be:** Self-audit should run the full suite (or a representative subset that exercises all dimensions) and PASS. The `falseAnalyticClaim` gate is `false` (correct — it shouldn't pass when score < threshold), but the **score itself is deflated because quick mode skips 102 test files**. The `analyticsStatistics` dimension awards 12 points (threshold for >400 passes not met in 4-file quick run).

**Inconsistency:** The README claims "1474 tests across 73 test files" and AGENTS.md claims "2130+ tests across 57+ suites". The self-audit ran 23 tests. **The committed self-audit.json does not represent the real state of the project.**

**Root cause:** `pnpm run self-audit:generate` runs full mode (~2.5 min), but the committed report was generated by `self-audit:generate:quick` (per `quickMode: true` field). The quick report was committed instead of a full one.

### 3.2 Rank Power Observatory (CRITICAL — partially fixed)

**Today:** The `RANK_DATA_INTEGRITY_INVESTIGATION.md` documents 9 confirmed root causes that made the /ranks display "not trustworthy as a balance verdict":
- A. Server/browser schema drift → NaN (fixed in ranks.js)
- B. ORV sample accounting used wrong field (fixed in rank-counterfactual.mjs)
- C. Deferred resolutions not attributed to declaring rank (fixed in runtime.mjs)
- D. Missing causal telemetry treated as valid zero (fixed in telemetry + rank-power + analytics)
- E. Response Power double-counted counters (fixed in rank-power + telemetry + browser-analytics)
- F. Decision Power mixed incomparable scales (fixed in rank-power)
- G. Matrix mislabeled as counterfactual (fixed in analytics + ranks + browser-analytics)
- H. Filters implied unavailable capabilities (fixed in anatomy-workspace + ranks + state)
- I. Fractional multi-rank telemetry inconsistent (fixed in runtime + analytics + telemetry)

**Should be:** After regeneration of the 2,500-match artifact, the ranking should be trustworthy. **INFERENCE: the artifact has not been regenerated yet** — `sample-data/observatory/rank-analytics.json` is modified (per `git status`), but there's no evidence the full campaign was re-run with the fixed telemetry. The fixes are in code, but the data may still reflect old bugs.

### 3.3 Chat System (GAP)

**Today:** The ranked-duel-renderer renders chat UI (`data-chat-input`, `rd-chat-messages`, `tcg-chat-message` CSS classes). `board-events.js` wires local chat: pushing messages to `state.chatMessages` and re-rendering. `play-state.js` initializes `chatMessages: []`. The AI commentary and personality systems feed messages.

**Should be:** For network matches, chat should transmit over WebSocket. **FACT: `packages/network-protocol/src` has zero CHAT message types.** The network lobby has no chat. The chat panel in network matches is local-only (player talks to themselves).

**Inconsistency:** UI implies multiplayer chat; protocol doesn't support it. This is a partially-built feature.

### 3.4 Advanced Card Rules (UNCOMMITTED)

**Today:** Three files in `apps/lab-web/src/play/advanced-card-rules/` (controller, view, 62KB data) + CSS + test file are **untracked in git** (`??` in git status). The test file `test/advanced-card-rules.test.mjs` passes (23/23). The controller is imported by `app.js` (line 7) and `play-app.js` (line 24).

**Should be:** Committed, with test registered in `package.json` test script and `scripts/ci.mjs`. **FACT: `test-coverage-meta.test.mjs` enforces that every `*.test.mjs` on disk is listed in both** — if committed without registration, CI breaks.

**Risk:** The feature works but is one `git add` away from breaking CI. The modified `package.json` and `scripts/ci.mjs` (per git status) may contain the registration, but they're also uncommitted.

### 3.5 Tournament → Profile Integration (INFERENCE — likely gap)

**Today:** Tournament workspace (`tournament.js`) runs AI-vs-AI brackets, persists to IndexedDB, has auto-play. Profile workspace (`profile.js`) shows badges including `tournament-champion` and `bracket-buster`. `local-profile.mjs` tracks `verifiedResults`.

**Should be:** Since tournaments are AI-vs-AI, human players can't earn tournament badges. **INFERENCE: the tournament-champion/bracket-buster badges are likely unearnable** — they'd require a human tournament mode that doesn't exist. The profile reads `verifiedResults` from play matches, not tournament results.

### 3.6 Analytics AI (Ollama) — Partial

**Today:** 13-module isomorphic package, browser controller, settings panel, intelligence panel with Executive Summary / Balance / Anomaly / Ask modes. Deterministic checks run locally without Ollama. LLM interpretation requires `http://localhost:11434`.

**Should be:** Graceful degradation when Ollama is down (deterministic checks still show). **FACT: this works** (per architecture). But the feature is disabled by default and requires manual setup. **INFERENCE: most users will never see the LLM features.** The streaming UI progress may not work in all modes (per subagent note).

### 3.7 Match Server Monolith

**Today:** `apps/match-server/src/server.mjs` is 1,132 lines containing startup, HTTP endpoints, WebSocket handling, message routing (13 types), rate limiting, IP banning, matchmaking, spectator, replay auth, logging, metrics.

**Should be:** Separated into modules (connection handler, message router, rate limiter, match registry, spectator manager). The monolith is a maintainability hotspot.

---

## 4) Architecture Overview — As-Built Map

### 4.1 Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│  BROWSER UI (apps/lab-web)                              │
│  ┌───────────┐ ┌───────────┐ ┌───────────────────────┐ │
│  │ Landing    │ │ Play Mod  │ │ Observatory (15 WS)   │ │
│  │ /, /rules  │ │ /play/*   │ │ /watch ... /intelligence│ │
│  └───────────┘ └───────────┘ └───────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Shared UI: state.js, router.js, error-boundary    │  │
│  │ PWA: sw.js, worker.js (Web Worker)                │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │ (build-time import rewriting)
┌──────────────────────┴──────────────────────────────────┐
│  PACKAGES (14)                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ shared      │  │ statistics   │  │ browser-crypto │ │
│  │ (canonical, │  │ (Wilson, BH, │  │ -shim (browser │ │
│  │  hash, ver) │  │  bootstrap)  │  │  SHA-256)      │ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ policy-sdk  │  │ policies (5) │  │ game-ai (HYBIX │ │
│  │ (RNG, defs) │  │              │  │  14 modules)   │ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ decision-   │  │ telemetry    │  │ engine-adapter │ │
│  │ intelligence│  │ (schema v4/5)│  │ (vendor bridge)│ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ simulation- │  │ analytics    │  │ analytics-ai   │ │
│  │ runtime     │  │ (pipeline)   │  │ (Ollama, iso)  │ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐                      │
│  │ match-      │  │ network-     │                      │
│  │ authority   │  │ protocol     │                      │
│  └─────────────┘  └──────────────┘                      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│  VENDORED ENGINE (upstream/intrilex-engine-4.2.6)       │
│  TypeScript → compiled to runtime/autonomy-engine-dist   │
│  Profiles: core-advanced-authority, core-unrestricted,   │
│  first-contact-trigger-closure                           │
│  Rules: v4.3.1 (K♠ Wild Sovereignty + BJ Board Lock)    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│  APPS (3)                                               │
│  lab-web (browser)  match-server (WebSocket)  batch-cli  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Data Model

- **Match:** seed, profileId, policyIdsBySeat, command log, decision journal, idempotency records, revision counter, frame hash
- **Replay:** certified v2 format (seed + commands + provenance + integrity hash); legacy v1 for 121 governing replays
- **Telemetry:** semantic facts (decision, resolution, state-delta, causal edges) + rank counters/metrics + variant counters/metrics
- **Campaign:** segments (cached in runtime/), aggregate, accounting (PASS/PARTIAL/FAIL), retention index
- **Save:** IndexedDB, format v2, integrity payload (product/protocol/engine/rules version binding + hash)
- **Network Match:** SQLite (WAL mode) or InMemory; snapshot = metadata + participants + command log + journal + idempotency + timestamps; engine state reconstructed via deterministic replay
- **Local Profile:** localStorage; rating, record, streak, ratingHistory, badges, archetypeBreakdown, verifiedResults
- **Tournament:** IndexedDB; bracket, matches, results, analytics

### 4.3 State Machines

- **NetworkSessionState:** IN_LOBBY → READY_CHECK → STARTING → RUNNING → TERMINAL (+ RECONNECTING, REJECTED, EXPIRED). Monotonic transition guard (`ALLOWED_TRANSITIONS`).
- **MatchStatus:** WAITING_FOR_OPPONENT → READY_CHECK → STARTING → RUNNING → TERMINAL/ABORTED/EXPIRED
- **PlayLifecycle:** maps engine SessionState → player-facing LifecycleState
- **ConnectionState:** CONNECTED → DISCONNECTED → (reconnect or terminate)

### 4.4 Interaction Logic

- **Hash-based routing:** `#/watch`, `#/play/match`, etc. — no history API
- **Event delegation:** `board-events.js` binds clicks/keys on match board
- **Worker messaging:** `worker.js` receives campaign/diagnostic requests, posts results
- **WebSocket protocol:** JSON envelopes with `protocolVersion`, `type`, `payload`; 13 client→server types
- **BroadcastChannel:** session-lease for dup-tab protection

### 4.5 Agents / Workflows

- **HYBIX AI:** perception → memory → personality → coordination → cognition (BT + utility + bounded GOAP) → failsafe → debug. 6 archetypes × 4 difficulties = 12 policy variants + 2 baseline = 14 HYBIX policies.
- **Campaign orchestration:** segmented, multi-worker (1/2/4), AB/BA seat-swap, resume capability, provenance-keyed cache invalidation
- **Tournament scheduler:** single-elimination bracket, BYE filling, BoX with AB/BA, third-place for 4+

### 4.6 Internal Tools

- **CI:** `scripts/ci.mjs` — 96+ stages, fail-fast, writes `reports/ci-stages.json`
- **Self-audit:** `generate-self-audit.mjs` — runs tests, computes dimensional score + critical gates
- **Truth drift check:** `truth-drift-check.mjs` — guards documented counts vs actuals
- **Falsification sweep:** `falsification-sweep.mjs` — adversarial release certification
- **Build determinism:** `verify-build-determinism.mjs` — dual-build tree hash
- **Package graph:** `check-package-graph.mjs` — acyclic dependency verification

### 4.7 External Integrations

- **Ollama** (optional, local LLM via Fetch API)
- **Chrome/Chromium** (required for browser E2E certification — not always present)
- **node:sqlite** (built-in Node 22+, experimental)

### 4.8 Architectural Drift & Fragmentation

1. **Analytics duplication:** `browser-analytics.js` (74KB) mirrors server-side `packages/analytics` + `packages/simulation-runtime` rank logic. Build script rewrites imports. Two code paths for the same analytics — **drift risk**.
2. **Policy catalog fragmentation:** 5 baseline policies in `packages/policies`, 14 HYBIX in `packages/game-ai/policy-adapter.mjs`. Unified catalog in `simulation-runtime/policy-catalog.mjs` is a merge layer, not a single source.
3. **CSS bloat:** `play-v3.css` (127KB) + `ranked-duel.css` (108KB) = 235KB of play CSS. "v3" naming implies v1/v2 existed (drift).
4. **Renderer monolith:** `ranked-duel-renderer.mjs` (100KB, 2000+ lines) is the single largest source file — a hotspot.
5. **Match server monolith:** `server.mjs` (1,132 lines) — all server logic in one file.
6. **Two crypto paths:** `packages/shared` (node:crypto) vs `packages/browser-crypto-shim` (Web Crypto). Intentional but a maintenance surface.

---

## 5) Risk Zones & Missing Pieces — Risk Register

| # | Risk | Severity | Evidence |
|---|------|----------|----------|
| R1 | **Self-audit reports FAIL (78/92)** — committed report doesn't represent real state | High | `reports/self-audit.json` status=FAIL, quickMode=true |
| R2 | **Rank data may be stale** — fixes in code but artifact regeneration not confirmed | High | `RANK_DATA_INTEGRITY_INVESTIGATION.md` §3; `git status` shows modified rank-analytics.json |
| R3 | **471MB orphaned zip** in repo root (`intrilex-agent-analysis(new).zip`) — not gitignored, bloats clone | Medium | `Get-Item` confirms 471.4MB; not in .gitignore |
| R4 | **Uncommitted advanced-card-rules** — feature works, tests pass, but untracked; committing without test registration breaks CI | High | `git status` shows `??` for 4 files; `test-coverage-meta.test.mjs` enforces registration |
| R5 | **Chat UI without network protocol** — UI implies multiplayer chat; protocol has no CHAT type | Medium | grep: 0 CHAT matches in network-protocol; chat UI in ranked-duel-renderer + board-events |
| R6 | **Tournament badges unearnable** — tournament is AI-only; profile badges require human tournament | Low | INFERENCE from profile.js badge defs vs tournament.js AI-only design |
| R7 | **Match server monolith** — 1,132 lines, all concerns in one file | Medium | `apps/match-server/src/server.mjs` |
| R8 | **Renderer monolith** — 100KB ranked-duel-renderer.mjs | Medium | File size |
| R9 | **Analytics duplication** — browser-analytics.js (74KB) vs packages/analytics | Medium | Two implementations of rank analytics |
| R10 | **No graceful shutdown** in match server — SIGTERM/SIGINT handling not evident | Medium | INFERENCE from server.mjs structure |
| R11 | **Browser-dependent tests silently FAIL** — without Chrome, smoke/e2e/parity write FAIL reports | Low | KNOWN_LIMITATIONS.md |
| R12 | **242 pre-existing lint warnings** (no-unused-vars) | Low | AGENTS.md, lint-tmp.txt |
| R13 | **Public matchmaking/history disabled by default** — invite-alpha limitation | Low | KNOWN_LIMITATIONS.md, feature flags |
| R14 | **No event-level state stepping** — blocked by design | Low | capability-manifest unsupportedCombinations |
| R15 | **Optional modules + multiplayer blocked** — scope freeze | Low | capability-manifest |
| R16 | **`coordination.mjs` (multi-bot) unused in 2-player** — over-engineered for current scope | Low | INFERENCE: game is 2-player only |
| R17 | **Card Face Registry incomplete** — some cards show "Registry pending" | Low | card-face-renderer.js line 113 |
| R18 | **No observability/metrics export** — server has /metrics but no Prometheus/OpenTelemetry | Low | INFERENCE |
| R19 | **No auth/identity system** — participant tokens only; no accounts | Medium | By design (invite-alpha) but limits production |
| R20 | **Single commit history** — `git log` shows only 1 commit ("Initial commit") | Medium | All development compressed into one commit; no incremental history |

---

## 6) Next Moves Blueprint — Prioritized Roadmap

### P0 — Stabilize (stop the bleeding)

| Step | What | Why | Impact | DoD |
|------|------|-----|--------|-----|
| P0.1 | **Regenerate self-audit in full mode** and commit PASS report | Self-audit FAIL is the most visible signal of instability | Trust | `reports/self-audit.json` status=PASS, score≥92, quickMode=false |
| P0.2 | **Commit advanced-card-rules** with test registration in package.json + ci.mjs | Untracked feature is one `git add` from breaking CI | Stability | `git status` clean; `pnpm test` passes including test-coverage-meta |
| P0.3 | **Delete or gitignore the 471MB zip** | Bloats repo, slows clones | Repo hygiene | File removed or in .gitignore |
| P0.4 | **Regenerate rank analytics artifact** with fixed telemetry | Rank data integrity was the most severe logic bug | Correctness | `pnpm run campaign:sample` + `generate-observatory-analytics.mjs`; /ranks shows no NaN, no degenerate-as-meaningful |
| P0.5 | **Verify full test suite passes** (`pnpm test`) | Baseline confirmation | Confidence | 0 fail |

### P1 — Complete (finish partially built tools)

| Step | What | Why | Impact | DoD |
|------|------|-----|--------|-----|
| P1.1 | **Add CHAT message type to network-protocol** + wire match-server + network-session + lobby renderer | Chat UI exists but is local-only in network matches | Feature completeness | Network chat works E2E; test in network-authority.test.mjs |
| P1.2 | **Wire tournament results → profile badges** (or mark AI-only badges as unearnable) | Tournament-champion/bracket-buster badges are likely unearnable | Honesty | Profile shows locked badges correctly; or human tournament mode |
| P1.3 | **Complete Card Face Registry** — fill remaining "Registry pending" cards | Some cards show incomplete data | Polish | All 54 cards have full dossier; card-face-renderer test covers |
| P1.4 | **Add graceful shutdown (SIGTERM/SIGINT)** to match-server | No clean shutdown signal handling | Stability | Server closes WS connections + flushes SQLite on signal |
| P1.5 | **Analytics AI: verify streaming progress in all modes** | Streaming may not work in all modes | UX | All 4 modes (Summary/Balance/Anomaly/Ask) show progress |

### P2 — Improve (refactors, DX, performance)

| Step | What | Why | Impact | DoD |
|------|------|-----|--------|-----|
| P2.1 | **Split match-server monolith** into modules (connection, router, rate-limiter, spectator, replay) | 1,132-line file is a maintainability hotspot | Maintainability | Each module <300 lines; all tests pass |
| P2.2 | **Split ranked-duel-renderer monolith** into sub-renderers (board, chat, rail, setup, terminal) | 100KB file is the largest source | Maintainability | Each sub-renderer <500 lines |
| P2.3 | **Unify analytics** — make browser-analytics.js import from packages/analytics (via build rewrite) instead of duplicating | Two analytics code paths drift | Correctness | Single source of rank logic; browser tests pass |
| P2.4 | **Add `tournament` and `rank:audit` commands to batch-cli** | CLI only has 4 commands; tournament/rank audit are script-only | DX | `pnpm cli -- tournament ...` works |
| P2.5 | **Reduce CSS bloat** — audit play-v3.css (127KB) + ranked-duel.css (108KB) for dead rules | 235KB of play CSS | Performance | <150KB combined; no dead selectors |
| P2.6 | **Add observability** — structured logging + metrics export (Prometheus format) | Server has /metrics but no standard export | Ops | `/metrics` returns Prometheus format |

### P3 — Expand (new features only after foundations)

| Step | What | Why | Impact | DoD |
|------|------|-----|--------|-----|
| P3.1 | **Human tournament mode** — let human players enter brackets | Tournament is AI-only; badges unearnable | Feature | Human can play in tournament; results flow to profile |
| P3.2 | **Spectator chat** — let spectators commentate | Spectator mode is view-only | Engagement | Spectators can chat; rate-limited |
| P3.3 | **Replay sharing via URL** — shareable replay links | Replays are local-only | Virality | URL loads replay without server auth |
| P3.4 | **Mobile-responsive play board** | Current board is desktop-optimized | Reach | Playable on <768px viewport |
| P3.5 | **Account/identity system** — for ranked play | Currently token-only | Production | Optional account; rated matches |

---

## 7) Final Deliverables

### State Grade: **B−** (Strong infrastructure, incomplete closure)

| Dimension | Grade | Justification |
|-----------|-------|---------------|
| **Completeness** | B | 14 packages shipping, 15 workspaces, 108 test files, 96 CI stages. But self-audit FAIL, uncommitted feature, chat gap, tournament-profile gap. |
| **Correctness** | B− | Rank data had 9 critical bugs (fixed in code, artifact regen pending). Self-audit doesn't represent reality. Tests pass when run. |
| **Coherence** | B+ | Clear layering (packages → apps → vendored engine). But fragmentation in analytics (browser vs server), policies (2 packages), CSS (v3 naming), renderer monoliths. |
| **Observability** | C+ | Self-audit exists but reports FAIL. CI writes stage reports. Server has /metrics. No Prometheus, no tracing, no error tracking. |
| **Maintainability** | B | 0 type errors, 0 lint errors, JSDoc coverage, smoke tests per package. But 242 lint warnings, 2 monoliths (server + renderer), 471MB orphaned zip, single-commit history. |

**Overall: B−** — A sophisticated, well-tested deterministic game engine + observatory with strong architectural foundations, dragged down by incomplete closure on self-audit, rank data regeneration, an uncommitted feature, and a few partially-built tools (chat, tournament-profile wiring). The infrastructure is A-grade; the "last mile" is C-grade.

---

## 8) Autonomy Directive — High-Leverage Target: **Self-Audit Truth Closure**

### Why this target?

The self-audit is the project's **meta-truth signal** — it's the first thing anyone checks to assess project health. Right now it says FAIL (78/92) because it was run in quick mode (4 of 108 test files). This is the highest-leverage fix because:

1. It's the **visible face of quality** — a FAIL self-audit undermines confidence in everything else
2. It's **cheap to fix** — run the full suite, commit the real report
3. It **unblocks trust** in the rank data fixes (which also need artifact regeneration)
4. It **surfaces real failures** hidden by the quick-mode skip

### Shortest path to end-to-end excellence

1. Run `pnpm run self-audit:generate` (full mode, ~2.5 min) — not `:quick`
2. If any tests fail, fix them (the quick report showed 23/23 pass, but full suite may surface failures in the 102 skipped files)
3. If score < 92, investigate which dimensions are deflated and whether the scoring rubric needs adjustment (e.g., `analyticsStatistics` awards max 19 only if >400 tests pass — full suite has 2130+, so this should jump to 19)
4. Commit the PASS report
5. Add a CI guard that **rejects commits where self-audit.json is FAIL or quickMode=true**

### Exact next 5–10 commits

1. **`chore: remove orphaned 471MB zip from repo root`** — delete `intrilex-agent-analysis(new).zip`, add to `.gitignore`
2. **`feat: commit advanced-card-rules with test registration`** — `git add` the 4 untracked files + modified package.json + ci.mjs; verify `pnpm test` passes including test-coverage-meta
3. **`chore: regenerate self-audit in full mode`** — run `pnpm run self-audit:generate`; commit PASS report
4. **`fix: add CI guard rejecting FAIL/quickMode self-audit`** — new test in `test/self-audit-truth.test.mjs` asserting `status === 'PASS'` and `quickMode === false` in committed `reports/self-audit.json`
5. **`fix: regenerate rank analytics artifact with corrected telemetry`** — run `pnpm run campaign:sample` + `pnpm run manifest:generate` + `generate-observatory-analytics.mjs`; verify /ranks shows no NaN
6. **`feat(network): add CHAT protocol message type`** — add `CHAT` client→server + `CHAT_MESSAGE` server→client to `packages/network-protocol/src/protocol.mjs` + validators + reason codes
7. **`feat(server): wire chat relay in match-server`** — handler in `server.mjs` that broadcasts chat to match participants (not spectators unless spectator chat enabled)
8. **`feat(ui): wire network chat in network-session + lobby renderer`** — `NetworkPlaySession.sendChat()`; board-events chat send delegates to network session when active
9. **`test: add network chat tests`** — `test/network-chat.test.mjs` (protocol validation, relay, privacy, rate limit); register in package.json + ci.mjs
10. **`refactor: split match-server monolith into modules`** — `connection-handler.mjs`, `message-router.mjs`, `rate-limiter.mjs`, `spectator-manager.mjs`, `replay-handler.mjs`; server.mjs becomes ~200-line orchestrator

### Tests/metrics that prove it's truly fixed

- `reports/self-audit.json` → `status: "PASS"`, `score: ≥92`, `quickMode: false`, `filesExecuted: ≥100`
- `pnpm test` → 0 fail, 0 unaccounted
- `test/self-audit-truth.test.mjs` → asserts PASS + not quickMode
- `test/test-coverage-meta.test.mjs` → passes (all test files registered)
- `/ranks` workspace → no NaN, no "No counterfactual data" when matrix is populated, degenerate axes labeled as such
- `test/network-chat.test.mjs` → chat messages relay E2E, spectators don't see private chat (if gated), rate-limited
- `git status` → clean (no untracked feature files)
- Repo size → <1MB working tree (excluding node_modules) after zip removal
