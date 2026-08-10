# Intrilex Simulation Lab — Agent Guide

## Stack
- **Runtime:** Node.js >=22
- **Package manager:** pnpm@10.11.0 (workspace monorepo)
- **Build:** `pnpm run build` (engine-patch build + browser dist bundle)
- **Test:** `pnpm test` (2400+ tests across 112+ suites, ~4 min; 0 fail expected)
- **Lint:** `pnpm run lint` (0 errors expected; ~242 no-unused-vars warnings are pre-existing)
- **Typecheck:** `npx tsc --noEmit` (0 errors; checkJs enabled via tsconfig.json)

## Key Commands
| Task | Command |
|------|---------|
| Build | `pnpm run build` |
| Full test suite | `pnpm test` |
| Lint | `pnpm run lint` |
| Self-audit regeneration | `pnpm run self-audit:generate` (runs test suite, ~2.5 min) |
| Version bump | `pnpm run version:generate` (writes version.mjs + version.js from package.json) |
| Determinism check | `pnpm run test:determinism` |
| Privacy check | `pnpm run test:privacy` |
| Regenerate stale replays | `pnpm run campaign:replays:regenerate` (re-runs retained matches with current engine) |
| Network dev server | `pnpm run dev:network` (dev server + match authority server on port 3099) |
| Network tests | `pnpm run test:network` (network-authority + network-ux-integration tests) |

## Version Surfaces (all must agree)
- `package.json` (root) — `version` field
- `packages/*/package.json` and `apps/*/package.json` — `version` field
- `packages/shared/src/version.mjs` — `LAB_VERSION` (auto-generated)
- `apps/lab-web/src/version.js` — `LAB_VERSION` (auto-generated)
- `apps/lab-web/src/play/save-integrity.js` — `PRODUCT_VERSION`, `RULES_VERSION`
- `apps/lab-web/src/index.html` — title, meta description, and rules stamp
- `apps/lab-web/src/rulebook-renderer.js` — TOC meta version
- `config/release-identity.json` — `version`, `officialRulesVersion`, `rulesVersion`
- `README.md` — title heading
- `reports/self-audit.json` — `generatedBy` (auto-regenerated)
- `scripts/manifest.mjs` — `rulesVersion`
- `packages/simulation-runtime/src/campaign.mjs` — `rulesVersion` (uses dynamic `RULES_VERSION`)
- `docs/INTRILEX_v{version}_COMPLETE_PLAYER_RULEBOOK.md` — filename and title heading

## Known Environment Limitations
- **Browser UI smoke** (`scripts/browser-ui-smoke.mjs`) requires a Chromium binary. Without it, the script writes a FAIL report to `reports/browser-ui-smoke.json`. Do not leave orphaned `browser-ui-smoke.mjs` processes running — they will continuously overwrite the committed PASS report with FAIL, causing test 96 in `v0.10.0-behavioral.test.mjs` to fail intermittently.
- **Real-browser E2E certification** (`scripts/browser-e2e-certification.mjs`) also requires Chrome/Chromium.
- **Vendor engine directory** (`vendor/intrilex-engine-4.1.0/`) is not present in all workspaces. The integration test for 121 certified replays skips gracefully when this directory is absent.

## Test Registration
When adding a new `test/*.test.mjs` file, it MUST be added to:
1. The `test` script in `package.json`
2. The CI script in `scripts/ci.sh`
Otherwise `test/test-coverage-meta.test.mjs` will fail.

## ESLint
- Browser globals (`document`, `window`, etc.) are declared for `apps/lab-web/src/**/*.js`
- Node globals are declared for `packages/**/*.mjs`, `scripts/**/*.mjs`, `test/**/*.mjs`
- `scripts/browser-e2e-certification.mjs` and `scripts/browser-network-e2e.mjs` have a file-specific override for `document`/`location` (CDP scripts serialize arrow functions via `.toString()` and evaluate them in the browser)

## TypeScript (checkJs)
- `tsconfig.json` enables `checkJs` (strict mode) — all `.mjs`/`.js` files are type-checked by `tsc --noEmit`
- **0 type errors** across the entire project
- Type annotations are added via JSDoc (`@param`, `@returns`, `@typedef`, `@type`) — no `@ts-nocheck` or `@ts-ignore`
- Packages with full JSDoc type coverage: `packages/statistics`, `packages/match-authority`, `packages/network-protocol`, `packages/engine-adapter`
- Run `npx tsc --noEmit` to verify type safety

## Archived Scripts
- `scripts/archive/` contains 16 obsolete/debug scripts archived during v0.21.0 cleanup (P1.4 + P2)
- These scripts are not referenced by CI, package.json, build, or tests
- See `scripts/archive/README.md` for the archival manifest

## Package Tests
All 13 workspace packages have smoke tests in `packages/*/test/smoke.test.mjs`:
- `shared`, `statistics`, `policy-sdk`, `policies`, `decision-intelligence`, `telemetry`, `game-ai`, `analytics` (pre-existing)
- `browser-crypto-shim`, `engine-adapter`, `simulation-runtime` (added v0.21.0 P1.2)
- `analytics-ai` (added v0.21.0 — optional Ollama-powered analytics intelligence layer)
- `achievements` (added v0.24.2 — 56 launch achievements with deterministic detection, career tracking, and legacy migration)
- All package smoke tests run as a single CI stage: `package-smoke-tests`

## Analytics AI (Ollama Integration)
- Optional local-LLM analytics interpretation layer in `packages/analytics-ai`
- Browser UI panel lives in `apps/lab-web/src/analytics-ai/` and is mounted on the `/evidence` workspace
- The package is self-contained (no workspace imports; uses only the Fetch API) so it is isomorphic
- `scripts/build.mjs` copies `packages/analytics-ai/src/*.mjs` → `apps/lab-web/dist/analytics-ai/` (no import rewriting needed)
- `scripts/dev-server.mjs` serves `.mjs` with `text/javascript` MIME and watches `packages/analytics-ai/src` for rebuilds
- CSP `connect-src` allows `http://localhost:*` and `http://127.0.0.1:*` for the default Ollama endpoint; non-local endpoints show a warning banner
- No Ollama dependency is required for the rest of the app to function; the feature is disabled by default
- Tests: `test/analytics-ai-{ollama,context,parsing,integrity,ui}.test.mjs` (5 files) + `packages/analytics-ai/test/smoke.test.mjs`
- Deterministic checks are computed locally and shown separately from LLM interpretations; the LLM never replaces deterministic statistics

## Network Authority (v0.23.0+)
- Server-authoritative online Direct Duel for 2 remote human players via WebSocket
- **Packages:** `@intrilex/match-authority` (server-neutral authority), `@intrilex/network-protocol` (versioned wire protocol)
- **App:** `@intrilex/match-server` (WebSocket gateway, port 3099 in dev)
- **Browser client:** `apps/lab-web/src/play/network/` — `network-session.mjs` (NetworkPlaySession), `network-lobby-renderer.mjs` (lobby UI), `network-protocol-client.mjs` (WebSocket client)
- **Lobby UI:** Integrated into Play app at `#/play/online` with create/join/ready/reconnect flows
- **Dev workflow:** `pnpm run dev:network` starts both dev server and match server; `--with-network` flag on `scripts/dev-server.mjs`
- **Reconnection:** `NetworkPlaySession` persists match ID + participant token to `localStorage` (30-min TTL); lobby hub offers reconnect on reload
- **Hidden-info firewall:** `packages/match-authority/src/player-projection.mjs` — never transmits seed, RNG, opponent hand, draw-pile identities, or raw commands
- **Tests:** `test/network-authority.test.mjs` (43 tests), `test/network-ux-integration.test.mjs` (51 tests), `test/match-store-persistence.test.mjs` (27 tests), `test/matchmaking-queue.test.mjs` (26 tests), `test/websocket-compression.test.mjs` (5 tests), `test/spectator-mode.test.mjs` (12 tests), `test/browser-network-e2e.test.mjs` (9 tests), `test/rate-limiting.test.mjs` (5 tests), `test/network-lobby-ui.test.mjs` (18 tests), `test/ip-rate-limiting.test.mjs` (5 tests), `test/match-history.test.mjs` (27 tests), `test/network-truth-closure.test.mjs` (20 tests), `test/replay-privacy-closure.test.mjs` (5 tests), `test/match-store-participants-truth.test.mjs` (6 tests), `test/connection-match-binding.test.mjs` (7 tests), `test/spectator-projection-hardening.test.mjs` (12 tests), `test/network-chat.test.mjs` (15 tests), `test/local-online-parity.test.mjs` (14 tests), `test/tutorial-guidance-parity.test.mjs` (11 tests)
- **Capability manifest:** `networkAuthority` section is generated by `scripts/generate-capability-manifest.mjs` (not manually edited — edits will be wiped on rebuild)
- **Durable storage:** `SqliteMatchStore` is the default (survives server restart via `node:sqlite`); `InMemoryMatchStore` available for testing via `startServer({ persistent: false })`; both implement `listMatches({ status, limit })` for match history queries
- **Public matchmaking:** `MatchmakingQueue` (`packages/match-authority/src/matchmaking-queue.mjs`) — FIFO queue pairs two players by profile; `QUEUE_JOIN`/`QUEUE_LEAVE`/`QUEUE_MATCHED` protocol messages; lobby UI has "Find Match" button
- **WebSocket compression:** `permessage-deflate` enabled with 256-byte threshold; `contextTakeover` disabled for low-frequency game messages
- **Spectator mode:** `SPECTATE_MATCH`/`SPECTATE_LEAVE` protocol messages; spectators receive read-only match views (P1's authorized view, no seed/RNG); cannot submit actions; lobby UI has "Spectate" button; max 50 spectators per match
- **Rate limiting:** Token bucket per connection (10-token capacity, 1/sec refill, 5-hit ban threshold → IP ban for 60s); per-IP connection limit (10 concurrent); `RATE_LIMITED` reason code before termination; `MAX_CONNECTIONS_PER_IP=10`, `MAX_SPECTATORS_PER_MATCH=50`
- **Match history:** `MATCH_HISTORY`/`MATCH_HISTORY_RESULT` protocol messages; `handleMatchHistory` queries the match store; lobby UI has "Match History" card; history screen at `#/play/online/history` shows recent matches with spectate buttons for running/terminal matches
- **Replay storage:** `GET_REPLAY`/`REPLAY_AVAILABLE`/`REPLAY_DATA` protocol messages; `handleGetReplay` authenticates participant token and returns certified replay; v0.24.2: unauthenticated HTTP `GET /replay/:matchId` endpoint REMOVED — replays are available ONLY via authenticated WebSocket `GET_REPLAY` flow; `broadcastMatchEnded` sends `REPLAY_AVAILABLE` with `replayUrl: null` + SHA-256 hash (computed once from actual replay object, not empty-string fallback); browser client `NetworkPlaySession.getReplay()` fetches via WebSocket and verifies SHA-256 hash via Web Crypto API; terminal screen shows "Download certified replay" button for network matches (conditioned on `status === 'TERMINAL'`, not `replayUrl`); `createNetworkReplayRecord()` in `replay-library.js` saves network replays to IndexedDB with `isNetworkMatch: true` flag; `rateLimitCapacity` option on `startServer()` for testing
- **Connection-match binding (v0.24.2):** All participant commands (READY, SUBMIT_ACTION, REQUEST_SYNC, LEAVE_MATCH, GET_REPLAY) enforce `conn.matchId === payload.matchId` as defense-in-depth; `CONNECTION_MATCH_MISMATCH` reason code for violations; `LEAVE_MATCH` now authenticates the participant token (previously accepted token in validation but handler never checked it); `handleSpectateLeave` captures `spectatingMatchId` before nulling for correct logging
- **SQLite match history (v0.24.2):** `SqliteMatchStore.listMatches()` fixed to extract `participantId` from the participants array in the snapshot (previously used `Object.keys()` on an array, returning `["0","1"]` instead of real participant IDs); SQLite and InMemory now return the same semantic `MatchSummary`
- **Browser network E2E:** `scripts/browser-network-e2e.mjs` — CDP-based Chrome certification (6/6 scenarios pass); gracefully skips if Chrome not installed; CSP allows `ws://` and `wss://` to localhost
- **Network chat (v0.25):** `SEND_CHAT` (client→server) and `CHAT_MESSAGE` (server→client) protocol messages; `handleSendChat` validates payload, checks connection-match binding, authenticates participant token, broadcasts to all match participants; `NetworkPlaySession.sendChatMessage()` sends via WebSocket with optimistic local echo; `board-events.js` routes chat to networkSession for online matches or local echo for Local vs AI; chat messages merge from `networkSession.chatMessages` when available; spectators do not receive chat (out of scope for v0.25); match-server graceful shutdown via SIGTERM/SIGINT handlers
- **Tournament badge honesty (v0.25):** `tournament-champion` and `bracket-buster` badges marked as `available: false` with "coming soon" descriptions (tournaments are AI-only; human tournaments don't exist yet); profile workspace renders unavailable badges as "Coming soon" instead of misleading locked/progress state

## Achievements System (v0.24.2+)
- **Package:** `@intrilex/achievements` (`packages/achievements/`) — 56 launch achievements with deterministic detection, career tracking, and legacy migration
- **Self-contained:** No workspace imports; isomorphic for browser transport (same pattern as `analytics-ai`)
- **Browser transport:** `scripts/build.mjs` copies `packages/achievements/src/*.mjs` → `apps/lab-web/dist/achievements/`; `scripts/dev-server.mjs` watches `packages/achievements/src` for rebuilds
- **Browser runtime:** `apps/lab-web/src/play/achievements/achievement-runtime.js` — singleton `AchievementRuntime` orchestrates fact generation, reducer, evaluator, and persistence
- **Browser UI:** `apps/lab-web/src/play/achievements/achievement-ui.js` — gallery workspace at `#/achievements` with filter/category buttons (event delegation, active state highlighting); `achievement-presenter.js` — toast notifications (aria-live, reduced-motion aware, timer leak-safe with clearTimeout on manual dismissal, dedup set capped at 200 entries) and terminal match summary
- **Terminal summary:** `buildTerminalSummaryHtml(unlocks)` renders achievement list with rarity colors, AP totals, and HTML escaping; injected into terminal screen via `achievementSummaryHtml` prop in `ranked-duel-terminal.mjs`; cached in `state._achievementSummaryHtml` to persist across re-renders
- **Persistence:** `apps/lab-web/src/play/persistence.js` — `ACHIEVEMENTS` IndexedDB store (key: `intrilex-achievements-v1`); localStorage fallback; `getAchievementState`/`saveAchievementState`/`resetAchievementState`
- **Catalog:** 56 achievements across 7 categories (FIRST_STEPS, CORE_SYSTEMS, STACK_COUNTERPLAY, CARD_MASTERY, TACTICAL_WINS, PLAYSTYLE, PROGRESSION); 4 rarity tiers (COMMON=10AP, CLEVER=20AP, RARE=40AP, INTRILEX=75AP); total 1320 AP; 4 hidden achievements (`the-stackening`, `recursive-seven`, `plan-b-was-plan-a`, `black-magic`)
- **Launch constraints:** `LAUNCH_CONSTRAINTS` in `constants.mjs` — 56 total, 22 COMMON, 20 CLEVER, 10 RARE, 4 INTRILEX, 4 hidden, 1320 total AP
- **Fact projector:** `facts.mjs` — `deriveAchievementFacts(events, ctx)` translates canonical engine events into achievement facts (29 fact kinds); self-contained pattern-matching on event type strings (no engine imports); idempotent fact IDs
- **Reducer:** `reducer.mjs` — pure fact reducer for match-scoped tracker and career tracker; idempotent (processed fact IDs tracked)
- **Evaluator:** `evaluator.mjs` — `evaluateAchievements(tracker, career, profileState, ctx)` — deterministic detection for all 56 achievements; returns `newUnlocks` and `progressUpdates`; `applyUnlocks` mutates profile state; uses canonical `isEligible()` from `eligibility.mjs` (not inline scope checks)
- **Eligibility:** `eligibility.mjs` — `isQualifyingMatch(ctx)` excludes simulations, replays, spectators, AI-vs-AI; `isEligible(id, ctx)` checks scope (COMPETITIVE_ONLY blocks tutorial, TUTORIAL_ALLOWED/QUALIFYING_DUEL allow)
- **Migration:** `migration.mjs` — `migrateLegacyData(legacyProfile, legacyStats)` — evidence-preserving migration from legacy badges/stats; only grants achievements where legacy data proves the condition; `isMigrated(state)` checks migration status
- **Network authority:** `packages/match-authority/src/achievement-projection.mjs` — `evaluateMatchAchievements(ctx, careerByParticipant)` — server-side per-participant evaluation with player-safe projection (no opponent hand/seed/RNG leakage); uses `NETWORK_AUTHORITY` provenance; `AuthoritativeMatchSession.getAllEvents()` collects all engine events from command log for evaluation
- **Network protocol:** `ACHIEVEMENTS_EARNED` message (server→client) — sent after `MATCH_ENDED` with per-participant unlock records and progress updates; client merges via `applyServerUnlocks()` which skips already-earned achievements
- **Play integration:** `apps/lab-web/src/play/play-controller.js` — `_achievementConsumer` callback hook (set by `play-app.js`); `_buildAchievementSnapshot()` and `_notifyAchievementConsumer(events)` at session boundaries; `play-state.js` resets `_networkAchievementsApplied` and `_achievementSummaryHtml` on new match
- **Profile integration:** `apps/lab-web/src/workspaces/profile.js` — `renderAchievementSummary()` shows earned count, total AP with percentage, and latest unlock name; links to full gallery
- **CSS:** `apps/lab-web/src/css/feature-components.css` — achievement toast, gallery, card, terminal summary, and profile summary styles with rarity-specific colors and responsive breakpoints
- **Tests:** `test/achievements.test.mjs` (157 tests — catalog, facts, evaluator for all 56, eligibility, persistence, migration, network, privacy, UI, determinism, polish regressions) + `packages/achievements/test/smoke.test.mjs` (22 tests)
- **Privacy:** Achievement facts never contain seed, RNG, or draw-pile identities; server-side projection does not expose opponent hand cards to client results

## Account Infrastructure (v0.24.2+)
- **Package:** `@intrilex/account-domain` — identity contracts, capabilities, validation (handle/display name sanitization, public player ID generation, participant token hashing)
- **Identity hierarchy:** Supabase user UUID (accountId) → publicPlayerId (PLY_…) → participantId → participantToken → P1/P2 engine seat
- **Protocol v2:** `PROTOCOL_VERSION=2`; new messages `AUTHENTICATE`/`AUTH_REFRESH` (client→server) and `AUTHENTICATED` (server→client); new reason codes `AUTH_REQUIRED`, `AUTH_ACCOUNT_MISMATCH`, `AUTH_ACCOUNT_SUSPENDED`, `AUTH_ACCOUNT_BANNED`, `AUTH_PERMANENT_ACCOUNT_REQUIRED`, `AUTH_PROVIDER_ERROR`, `AUTH_CONFIG_UNAVAILABLE`
- **Server auth:** `apps/match-server/src/auth/` — `identity-verifier.mjs` (interface), `fake-identity-verifier.mjs` (deterministic test verifier), `supabase-identity-verifier.mjs` (production JWKS-backed JWT verification via `getClaims()`)
- **Auth modes:** `INTRILEX_AUTH_MODE=required` (production — all connections must AUTHENTICATE before privileged commands) or `disabled` (dev — no auth required); server fails startup loudly if `required` but no verifier configured
- **Connection auth context:** Each connection has `authState` (UNAUTHENTICATED/AUTHENTICATED) and `account` (accountId, publicPlayerId, capabilities, tokenExpiresAt); auth gate rejects privileged commands pre-auth with `AUTH_REQUIRED`
- **Account-bound participants:** `addParticipant(id, token, accountId)` — participant records store `accountId`; snapshot schema bumped to v3 (backward-compatible with v2/v1 — accountId defaults to null)
- **Reconnect security:** `RESUME_MATCH` verifies `conn.account.accountId === participant.accountId` when auth is enabled; stolen participant tokens cannot be reused by different accounts
- **Self-match prevention:** `JOIN_MATCH` rejects same-account self-join with `AUTH_ACCOUNT_MISMATCH`; `MatchmakingQueue` prevents same-account pairing
- **Matchmaking account-aware:** `enqueue(connectionId, profileId, accountId)` — one queue entry per account; `_tryPair` skips same-account candidates
- **Browser auth stubs:** `apps/lab-web/src/play/network/` — `supabase-client.js` (singleton browser client factory), `auth-controller.js` (auth state machine: UNCONFIGURED→SIGNED_OUT→ANONYMOUS/AUTHENTICATED), `account-store.js` (reactive store); `network-session.mjs` sends `AUTHENTICATE` on WebSocket open, handles `AUTHENTICATED` response, `refreshAccessToken()` for token refresh
- **Supabase migrations:** `supabase/migrations/` — 7 SQL files (profiles, account_settings, competitive, match_history, achievements, moderation, migration_meta); RLS on all tables; server-authoritative tables (ratings, stats, matches, moderation) block all client writes; `handle_new_user()` trigger auto-creates profiles on auth user creation; `supabase/config.toml` for local dev; `.env.example` documents required env vars
- **Tests:** `test/auth-protocol.test.mjs` (11), `test/auth-server.test.mjs` (13), `test/auth-reconnect.test.mjs` (5), `test/supabase-schema.test.mjs` (13), `packages/account-domain/test/smoke.test.mjs` (47), `test/match-result-persistence.test.mjs` (13)

## Match Result Persistence + Rating System (v0.24.2+)
- **Rating system:** `packages/account-domain/src/rating.mjs` — Elo with configurable K-factor (K_PROVISIONAL=40 for <10 matches, K_ESTABLISHED=24 after), rating clamped to [0, 5000], draw support, `computeRatingUpdate()` is pure (no I/O), `deriveOutcome()` maps winner→WIN_A/WIN_B/DRAW
- **Persistor interface:** `apps/match-server/src/persistence/match-result-persistor.mjs` — `persistMatchResult()` + `getRatingState()` + `close()`; idempotent (re-persisting same matchId is safe)
- **Fake persistor:** `apps/match-server/src/persistence/fake-match-result-persistor.mjs` — in-memory for tests; `seedRating()` for specific rating scenarios; inspection helpers (`getMatch`, `getParticipants`, `getStats`)
- **Supabase persistor:** `apps/match-server/src/persistence/supabase-match-result-persistor.mjs` — production; writes to `matches`, `match_participants`, `player_ratings`, `player_stats` via service-role client; upserts for idempotency
- **Result builder:** `apps/match-server/src/persistence/match-result-builder.mjs` — `buildMatchResultRecord()` extracts data from terminal `AuthoritativeMatchSession`, fetches current ratings via persistor, computes Elo updates, returns `MatchResultRecord` ready for persistence
- **Server integration:** `broadcastMatchEnded()` in `server.mjs` fires-and-forgets `buildMatchResultRecord()` + `persistMatchResult()`; persistence failures are logged but don't crash the server or block MATCH_ENDED delivery; `matchResultPersistor` exposed on server API object; health endpoint reports `persistence.persistorType`
- **Server config:** `startServer({ matchResultPersistor })` or `startServer({ supabaseUrl, supabaseServiceKey })` or env vars `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`; defaults to `FakeMatchResultPersistor` in dev
- **Queue ID derivation:** `match.profileId.includes('ranked') ? 'ranked' : 'casual'` — private duels and casual matchmaking use 'casual', ranked queues use 'ranked'

## Achievement Cloud Sync (v0.24.2+)
- **Module:** `packages/account-domain/src/achievement-sync.mjs` — pure functions for computing sync deltas between local (IndexedDB) and cloud (Supabase `account_achievements`) achievements
- **Provenance:** `AchievementProvenance` enum — SERVER (service-role only), LOCAL_DEVICE, LOCAL_AI, UNVERIFIED (client-writable)
- **Sync flow:** `computeSyncDelta()` → `toUpload` (local-only), `toDownload` (cloud-only), `conflicts` (both with different timestamps); `resolveConflict()` prefers earlier unlock; `mergeAchievements()` produces unified set
- **Security:** `toCloudRow()` rejects SERVER provenance from clients (RLS enforces this too); only the match server service role can write SERVER-provenance achievements

## Guest→Permanent Migration (v0.24.2+)
- **Module:** `packages/account-domain/src/guest-migration.mjs` — pure functions for planning guest→permanent account migrations
- **Migration ID:** Deterministic — `mig_{sourceIdentity}_{targetIdentity}` — ensures idempotency
- **Migration plan:** 4 steps — achievements (required), stats (required), ratings (optional), match_history (optional)
- **Idempotency:** `isMigrationCompleted()` checks existing migration records; re-running is safe
- **DB table:** `account_migrations` (migration 0007) — service-role writes only; RLS allows owner SELECT

## Leaderboard (v0.24.2+)
- **Module:** `packages/account-domain/src/leaderboard.mjs` — pure functions for building and processing leaderboard queries
- **Types:** `TOP_RATED` (player_ratings, ordered by rating desc), `MOST_WINS` (player_stats, ordered by online_wins desc), `BEST_STREAK` (player_stats, ordered by best_win_streak desc)
- **Query builder:** `buildLeaderboardQuery()` returns table, select, filters, order, limit — caller executes via Supabase client
- **Processing:** `processLeaderboardRows()` assigns 1-based ranks, computes win rates, joins profile data (displayName, handle, avatarUrl)
- **Limits:** Default 50, max 200; provisional players excluded by default from TOP_RATED

## Server-Side Achievement Evaluation (v0.24.2+)
- **Module:** `packages/match-authority/src/achievement-projection.mjs` — `evaluateMatchAchievements()` runs server-side with full engine state (no hidden-info firewall), produces per-participant unlock records
- **Protocol:** `ACHIEVEMENTS_EARNED` message (server→client) — sent after `MATCH_ENDED` + `REPLAY_AVAILABLE`; contains `unlocks[]` and `progressUpdates{}` for the individual participant
- **Server integration:** `broadcastMatchEnded()` in `server.mjs` calls `evaluateMatchAchievements()` using `match.getAuthoritativeState()` + `match.getAllEvents()`; results sent per-participant (each player only receives their own unlocks); evaluation errors are caught and logged (non-fatal)
- **Client integration:** `NetworkPlaySession` handles `ACHIEVEMENTS_EARNED` → stores `achievementUnlocks` + `achievementProgressUpdates`; `AchievementRuntime.applyServerUnlocks()` merges server unlocks into local profile (skips already-earned), persists to IndexedDB
- **Security:** Server unlocks have `provenance: NETWORK_AUTHORITY`; client merges but cannot forge server-provenance unlocks; `toCloudRow()` in achievement-sync rejects SERVER provenance from clients
- **Validation:** `ACHIEVEMENTS_EARNED` registered in `KNOWN_TYPES` in `validation.mjs`; envelope validation passes for well-formed messages
- **Server-side persistence:** `MatchResultPersistor.persistAchievementUnlocks()` writes SERVER-provenance rows to `account_achievements` via service role; called from `broadcastMatchEnded()` after evaluation; idempotent via PK `(user_id, achievement_id)`; only authenticated participants (with accountId) are persisted; fire-and-forget with error logging
- **Client wiring:** `play-app.js` calls `applyServerUnlocks()` when `networkSession.status === TERMINAL` and `achievementUnlocks.length > 0`; guarded by `state._networkAchievementsApplied` flag to prevent double-application; both initial render and `onStateChange` subscription paths handle it; toasts queued via `presenter.queueUnlocks()`
- **Tests:** `test/match-result-persistence.test.mjs` (20 tests: 13 match persistence + 7 achievement persistence + E2E), `packages/match-authority/test/smoke.test.mjs` (10 tests: 6 original + 4 achievement-projection), `packages/network-protocol/test/smoke.test.mjs` (12 tests: 10 original + 2 ACHIEVEMENTS_EARNED)

