# Intrilex Simulation Lab — Agent Guide

## Stack
- **Runtime:** Node.js >=22
- **Package manager:** pnpm@10.11.0 (workspace monorepo)
- **Build:** `pnpm run build` (engine-patch build + browser dist bundle)
- **Test:** `pnpm test` (2256 tests across 111 suites, ~4 min; 0 fail expected)
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
All 12 workspace packages have smoke tests in `packages/*/test/smoke.test.mjs`:
- `shared`, `statistics`, `policy-sdk`, `policies`, `decision-intelligence`, `telemetry`, `game-ai`, `analytics` (pre-existing)
- `browser-crypto-shim`, `engine-adapter`, `simulation-runtime` (added v0.21.0 P1.2)
- `analytics-ai` (added v0.21.0 — optional Ollama-powered analytics intelligence layer)
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
