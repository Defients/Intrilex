# Changelog

## v0.24.1 — Network Truth Closure — Invite Alpha

### Summary

Critical network-multiplayer defect closure for invite-alpha online Direct Duel. Fixes seven P0 release-blocking defects and five P1 hardening items. Two players can now reliably interact online with strict privacy, deterministic persistence, and truthful capability presentation.

### P0 Defects Fixed

- **P0.1 Neutral spectator projection**: New `buildSpectatorView()` in `player-projection.mjs` hides both players' hands, legal actions, and opponent metadata from spectators. Spectator action submissions are rejected before validation with `PARTICIPANT_NOT_AUTHORIZED`.
- **P0.2 Canonical network-to-board DTO**: Server now sends `strictPolicyView` output (with `own`/`opponents` fields) instead of raw `privateStateView`. Added `gyTopCard` to the strict policy view for graveyard rendering.
- **P0.3 Network action submission**: `board-events.js` now recognizes network sessions — bypasses local lease check for `state.networkSession`, validates `RUNNING` status and pending-action guard before submission.
- **P0.4 Live opponent updates**: `renderNetworkActiveMatch` installs a durable `onStateChange` subscription that re-renders the board when the server pushes `MATCH_VIEW` updates (opponent acted). Subscription is idempotent (checks `_isNetworkBoardSubscription` flag).
- **P0.5 Ready-state monotonicity**: Added `_transition()` guard with `ALLOWED_TRANSITIONS` state machine. `RUNNING` and `TERMINAL` states never regress to `READY` or `IN_LOBBY`. `markReady()` only sets `READY` if not already `RUNNING`/`TERMINAL`.
- **P0.6 Request and connection semantics**: `connect()` settles exactly once via `_connectSettled` guard. `_request()` validates `readyState` before sending, tracks per-request timers, and rejects all pending on close. Structured errors include `code`, `message`, `requestId`, and `retryable` flag.
- **P0.7 Reconnect-record consistency**: Reconnect record now uses canonical `url` field (not `serverUrl`). `getSavedMatch()` supports both legacy `serverUrl` and canonical `url`. Schema version 2 with TTL validation. Matchmaking queue flow in `play-app.js` also uses canonical `url`.

### P1 Hardening

- **P1.8 Heartbeats**: `ws.on('pong')` handler now updates `lastHeartbeat` for liveness tracking. Dead-peer detection calls `handleDisconnect()` before `terminate()` for proper bookkeeping.
- **P1.9 Persistence integrity**: Snapshot schema v2 with `versionBinding` (product/protocol/engine/rules versions) and `integrity` hash. `fromSnapshot()` fails closed on version mismatch, integrity hash mismatch, or replay rejection. Revision verification after deterministic replay.
- **P1.10 Match lifetime**: `cleanExpired()` now uses status-specific TTL policies — unstarted lobbies expire by `createdAt`, active matches by `updatedAt`, terminal history by `updatedAt` with separate TTL. Backward-compatible with numeric `maxAgeMs` argument.
- **P1.11 Protocol state machine**: `LEFT_MATCH` response instead of `ERROR OK`. Conflicting create/join rejected with `MATCH_ALREADY_JOINED`. `x-forwarded-for` ignored without `TRUST_PROXY=1`.
- **P1.12 History and spectator discovery**: Public match history disabled by default (`INTRILEX_PUBLIC_HISTORY=1` to enable). Public matchmaking disabled by default (`INTRILEX_PUBLIC_MATCHMAKING=1`). Both configurable via `startServer()` opts for testing.

### Browser UI States

- Added `RECONNECTING`, `REJECTED`, and `EXPIRED` states to `NetworkSessionState`.
- State transition guard enforces monotonicity — no regression from terminal states.

### Tests

- **New test file**: `test/network-truth-closure.test.mjs` (20 behavioral tests covering all P0 and P1 fixes).
- **Existing tests updated**: Version-contract assertions, match-history tests (use `publicHistory: true`), source-text scan tests adapted for new code structure.
- **Total**: 2025 tests, 2024 pass, 0 fail, 1 skipped.

### Version Bump

All version surfaces updated to 0.24.1 (17 package.json files, version.mjs, version.js, save-integrity.js, index.html, release-identity.json, README.md, CHANGELOG.md, KNOWN_LIMITATIONS.md, server health check, CSS comments, source comments).

## v0.24.0 — Network UX Integration & Lobby UI

### Network UX Integration

- **Direct Duel lobby UI** (`apps/lab-web/src/play/network/network-lobby-renderer.mjs`): Full lobby renderer with create/join screens, invite code display, waiting room, ready check, opponent connection status, reconnection dialog, and error screens. Pure functions — never receives raw engine state, seed, RNG, or commands.
- **Play hub integration**: Added "Direct Duel" card to the Play hub (`#/play`), linking to the network lobby at `#/play/online`.
- **Network routes** (`apps/lab-web/src/play/play-app.js`): Four new sub-routes wired into the existing Play router: `/play/online` (lobby hub), `/play/online/create` (create flow), `/play/online/join` (join flow), `/play/online/match` (active network match). Reuses the existing `renderActiveMatch` board renderer for gameplay.
- **Board-events compatibility**: Added `submitHumanAction()` method to `NetworkPlaySession` — accepts the same submission shape as `PlaySession.submitHumanAction()` and delegates to `submitAction()` with a generated `clientCommandId`. The existing board interaction layer works unchanged for network matches.
- **Reconnection persistence**: `NetworkPlaySession` now persists match ID, participant token, and server URL to `localStorage` on create/join. On page refresh or navigation, the lobby hub detects saved matches and offers a "Reconnect" button. Terminal and leave actions clear the saved info. Saved info expires after 30 minutes.
- **Connection-lost dialog**: When the WebSocket drops mid-match, a modal dialog offers "Reconnect now" or "Forfeit and leave". Reconnection uses the stored participant token to resume the match.
- **Opponent status banner**: During active gameplay, a banner appears when the opponent disconnects, informing the player that the server is waiting for reconnect.
- **Server status indicator**: The lobby hub shows the configured authority server URL with an online/offline/connecting status badge.

### Dev Workflow

- **`pnpm dev:network`**: New script that starts both the dev server (with watch mode) and the match authority server on port 3099 in a single process. Prints the Direct Duel lobby URL.
- **`--with-network` flag**: The dev server (`scripts/dev-server.mjs`) now accepts `--with-network` to optionally start the match authority server alongside the static file server.

### Infrastructure

- **Version bump**: All version surfaces updated to 0.24.0 (package.json, workspace packages, version.mjs, version.js, save-integrity.js, index.html, release-identity.json, README.md, capability-manifest.json).
- **New test files**: `test/network-ux-integration.test.mjs` (51 tests), `test/match-store-persistence.test.mjs` (27 tests). Registered in package.json test script, ci.mjs stages.
- **New scripts**: `pnpm dev:network` (dev server + match server), `pnpm test:network` (now includes network-authority, network-ux-integration, and match-store-persistence tests).
- **Capability manifest**: Updated `networkAuthority` section with `lobbyUI`, `inviteCodeSharing`, `reconnectPersistence` features and `uxIntegration` object. Added `persistentStorage` feature.

### Durable Match Storage

- **SqliteMatchStore** (`packages/match-authority/src/match-store.mjs`): SQLite-backed durable match store using `node:sqlite` (Node.js 22+ built-in). Match state is serialized via `AuthoritativeMatchSession.toSnapshot()` and reconstructed via `AuthoritativeMatchSession.fromSnapshot()`. The engine state is deterministically replayed from seed + command log on retrieval. Survives server process restarts.
- **Snapshot serialization** (`AuthoritativeMatchSession.toSnapshot()/fromSnapshot()`): JSON-safe snapshot format capturing match metadata, participants, command log, decision journal, idempotency records, and timestamps. Engine state is NOT serialized — it is deterministically reconstructed from seed + command log replay.
- **Server default**: The match server now uses `SqliteMatchStore` by default with a file-based database at `runtime/match-server/matches.sqlite`. Can be configured via `startServer({ dbPath, persistent })`. Use `dbPath: ':memory:'` for volatile testing.
- **State persistence**: The server saves match state to the store after every state mutation (create, join, ready, start, action submission, disconnect, reconnect, leave).
- **Live cache**: `SqliteMatchStore` maintains an in-memory cache of live `AuthoritativeMatchSession` objects for performance. On `get()`, the cache is checked first before loading from the database.

### Public Matchmaking Queue

- **MatchmakingQueue** (`packages/match-authority/src/matchmaking-queue.mjs`): FIFO queue that pairs two waiting players into a new match by profile. No MMR or accounts — first-come-first-served. Players send `QUEUE_JOIN` and receive `QUEUE_JOINED` with position + estimated wait. When paired, both receive `QUEUE_MATCHED` with matchId + participantToken. Players can `QUEUE_LEAVE` to cancel.
- **Protocol additions**: `QUEUE_JOIN`, `QUEUE_LEAVE` (client→server); `QUEUE_JOINED`, `QUEUE_LEFT`, `QUEUE_MATCHED` (server→client). New reason codes: `QUEUE_FULL`, `QUEUE_TIMEOUT`, `NOT_IN_QUEUE`, `ALREADY_IN_QUEUE`.
- **Limits**: MAX_QUEUE_SIZE=200, QUEUE_TIMEOUT_MS=120000 (2 min). Stale entries cleaned up by the server's 60s cleanup timer.
- **Server integration**: The match server initializes the queue with an `onCreateMatch` callback that creates the match, adds both participants, saves to the store, and sends `QUEUE_MATCHED` to both connections. Queue cleanup on disconnect.

### WebSocket Compression

- **permessage-deflate**: The match server now explicitly configures `permessage-deflate` compression via the `ws` library. Messages above 256 bytes are compressed; smaller messages are sent uncompressed to avoid header overhead. `contextTakeover` is disabled to reduce memory overhead for low-frequency game messages. Window bits set to 13 for balanced memory/compression ratio.
- **Backward compatible**: Clients that do not request compression still work — the server gracefully falls back to uncompressed messages.

### Spectator Mode

- **Read-only spectating**: Spectators can join a RUNNING or TERMINAL match via `SPECTATE_MATCH` and receive `SPECTATE_JOINED` with the current match view. Spectators receive `MATCH_VIEW` updates on every state change (action submission, match start). Spectators cannot submit actions.
- **Protocol additions**: `SPECTATE_MATCH`, `SPECTATE_LEAVE` (client→server); `SPECTATE_JOINED`, `SPECTATE_LEFT` (server→client).
- **Privacy**: Spectators see P1's authorized view — no seed, RNG, command vault, or hidden state. The same player projection firewall applies.
- **Lifecycle**: Spectators can `SPECTATE_LEAVE` to stop watching. Disconnect automatically removes the spectator.

### Browser Network E2E Certification

- **New script** (`scripts/browser-network-e2e.mjs`): CDP-based Chrome E2E certification for the network lobby UI. Six scenarios: lobby renders, create match, join match (two-tab), opponent connection, ready check + match start, privacy check. Gracefully skips if Chrome is not installed.
- **New test** (`test/browser-network-e2e.test.mjs`): Verifies the certification report exists and all scenarios passed (or was gracefully skipped).

### Known Limitations (UX)

- Direct invite-only play still available; public matchmaking queue now provides an alternative (no accounts/ranked/MMM).
- Browser E2E certification requires Chrome binary (environment-dependent).
- Canonical 3-4 player Multiplayer module remains blocked (`SCOPE_FREEZE_AND_MULTIPLAYER_AUTHORITY_UNAVAILABLE`).

### Rate Limiting

- **Token bucket per connection**: Each WebSocket connection gets a token bucket with 10-token capacity, refilling 1 token/second. Messages above the burst limit receive `RATE_LIMITED` errors. After 5 rate-limit violations, the connection is terminated and the IP is banned for 60 seconds.
- **Per-IP connection limit**: Maximum 10 concurrent WebSocket connections per IP address. Excess connections are rejected with close code 1008.
- **IP banning**: After repeated rate-limit violations, the IP is banned for 60 seconds. New connections from banned IPs are rejected immediately. IP is extracted from `x-forwarded-for` header (for reverse proxy setups) or `req.socket.remoteAddress`.
- **Spectator count limit**: Maximum 50 spectators per match. Excess spectators receive `QUEUE_FULL` error.
- **Configuration**: `RATE_LIMIT_CAPACITY=10`, `RATE_LIMIT_REFILL_MS=1000`, `RATE_LIMIT_BAN_THRESHOLD=5`, `RATE_LIMIT_BAN_DURATION_MS=60000`, `MAX_CONNECTIONS_PER_IP=10`, `MAX_SPECTATORS_PER_MATCH=50`.
- **New tests**: `test/rate-limiting.test.mjs` (5 tests), `test/ip-rate-limiting.test.mjs` (5 tests).

### Bug Fix: Opponent Join Notification

- **Fixed**: When P2 joins a match via invite code, the server now sends a `PARTICIPANT_STATUS` message to P1, notifying them that the opponent has connected. Previously, P1's UI would not update to show "Opponent connected" until a manual refresh.
- **Impact**: The browser E2E certification (scenarios 4 and 5) now passes all 6/6 scenarios.

### Match History Endpoint

- **New protocol messages**: `MATCH_HISTORY` (client→server) and `MATCH_HISTORY_RESULT` (server→client).
- **Server handler**: `handleMatchHistory` queries the match store and returns a list of recent matches with metadata (matchId, status, createdAt, updatedAt, participants).
- **Store API**: Both `InMemoryMatchStore` and `SqliteMatchStore` now have a `listMatches({ status, limit })` method that returns match summaries sorted by `updatedAt` descending.
- **Browser UI**: New "Match History" card in the lobby hub. The history screen (`#/play/online/history`) shows recent matches with status badges, age, player count, and a spectate button for running/terminal matches.
- **Validation**: `validateMatchHistory` accepts optional `status` (string or null) and `limit` (1-100, default 20).
- **New tests**: `test/match-history.test.mjs` (27 tests).

### Browser Lobby UI — Matchmaking + Spectate

- **Find Match button**: The lobby hub now includes a "Find Match" card that navigates to the matchmaking queue flow. Players see their queue position and estimated wait time, and are automatically paired with the next available opponent.
- **Spectate button**: The lobby hub now includes a "Spectate" card that navigates to the spectate form. Players can enter a Match ID to watch a live game in read-only mode.
- **New render functions**: `renderNetworkQueueWaiting()`, `renderNetworkSpectateForm()`, `renderNetworkSpectating()` in `network-lobby-renderer.mjs`.
- **New protocol client builders**: `queueJoin()`, `queueLeave()`, `spectateMatch()`, `spectateLeave()` in `network-protocol-client.mjs`.
- **New routes**: `#/play/online/queue` (matchmaking), `#/play/online/spectate` (spectate form).
- **New test**: `test/network-lobby-ui.test.mjs` (18 tests).

## v0.23.0 — Network Authority Foundation

### Network Authority

- **Server-authoritative online Direct Duel** (`packages/match-authority/`, `apps/match-server/`): Two remote human players can now create/join a Direct Duel, connect to one authoritative server-owned Intrilex match, play a complete canonical 1v1 game, disconnect/reconnect safely, reach terminal state, and produce a verified replay — without either client ever possessing authoritative hidden state or raw engine commands.
- **Authoritative Match Session** (`packages/match-authority/src/authoritative-match-session.mjs`): Extracted server-neutral two-seat authority object from the existing PlaySession architecture. Owns engine state, command vault, decision frames, revision, frame hash, journal, command log, and replay generation. Knows nothing about DOM, renderer, WebSocket, or browser storage.
- **Network Protocol v1** (`packages/network-protocol/`): Versioned, explicitly validated protocol with strict message schemas, stable machine-readable reason codes, and size limits. Client→Server: CREATE_MATCH, JOIN_MATCH, RESUME_MATCH, READY, SUBMIT_ACTION, REQUEST_SYNC, LEAVE_MATCH. Server→Client: MATCH_CREATED, MATCH_JOINED, MATCH_VIEW, ACTION_RESULT, PARTICIPANT_STATUS, MATCH_STARTED, MATCH_ENDED, ERROR.
- **Match Server** (`apps/match-server/src/server.mjs`): WebSocket gateway with match registry, connection registry, CSPRNG credential generation, invite code system, participant authentication, per-match serialization, heartbeat, cleanup, and resource lifecycle management.
- **Player Projection Firewall** (`packages/match-authority/src/player-projection.mjs`): Explicit network DTO with allowlist approach. Never transmits raw EngineCommand, RNG, seed, opponent hand identities, draw-pile identities, private-choice tokens, or omniscient state. Validated by adversarial wire-capture tests.
- **Browser Network Client** (`apps/lab-web/src/play/network/`): NetworkPlaySession adapter exposing a view/interaction contract compatible with the existing Play renderer. Handles create/join lobby, ready state, action submission with pending state, reconnect/resync, and connection state display.
- **Idempotent action submission**: Per-participant, per-match idempotency records. Duplicate accepted requests return prior result without re-execution. Same clientCommandId with different payload is rejected.
- **Disconnect/reconnect safety**: Match remains canonical on server during disconnect. Reconnecting client receives fresh authorized snapshot — never asked what game state was. Old sockets are superseded.
- **Certified replay verification**: Completed network duels produce certified replays from server-held authority data. Replay winner matches live winner, final state hash matches, command sequence matches.

### Determinism

- **Network parity proof**: Two matches with identical seed and command sequence produce identical terminal state, winner, terminal reason, and decision count. Transport is semantically invisible to the rules engine.

### Infrastructure

- **Version bump**: All version surfaces updated to 0.23.0 (package.json, workspace packages, version.mjs, version.js, save-integrity.js, index.html, release-identity.json, README.md, KNOWN_LIMITATIONS.md).
- **New packages**: `@intrilex/match-authority` (0.23.0), `@intrilex/network-protocol` (0.23.0).
- **New app**: `@intrilex/match-server` (0.23.0).
- **New test file**: `test/network-authority.test.mjs` (43 tests). Registered in package.json test script, ci.mjs stages.
- **New scripts**: `pnpm network:dev`, `pnpm test:network`, `pnpm test:network:privacy`, `pnpm test:network:determinism`.
- **Capability manifest**: Added `networkAuthority` section distinguishing online 2P Direct Duel (SUPPORTED) from canonical 3-4 player Multiplayer module (BLOCKED).

### Known Limitations (Foundation)

- Direct invite-only play (no public matchmaking).
- No accounts, ranked networking, or MMR.
- InMemoryMatchStore — server process restart terminates in-memory matches.
- Canonical 3-4 player Multiplayer module remains blocked (`SCOPE_FREEZE_AND_MULTIPLAYER_AUTHORITY_UNAVAILABLE`).

## v0.22.0 — Tournament Evolution & Player Profile

### Tournament Evolution

- **AB/BA seat-swap fairness** (`apps/lab-web/src/workspaces/tournament-scheduler.js`): Best-of series now alternate P1/P2 seat assignments between games using an AB/BA pattern, ensuring neither policy benefits from first-player advantage across the series. The `getSeatSwapConfig` helper determines seat order per game.
- **Third-place match** (`tournament-scheduler.js`): Tournaments with 4+ policies now include a consolation match between the two semifinal losers. The `ensureThirdPlaceMatch` helper creates the match after semifinals complete, and `advanceTournament` tracks `runnerUp` and `thirdPlace` fields.
- **Post-tournament analytics** (`tournament-scheduler.js`): New `getTournamentAnalytics` function computes upsets, average games per match, sweep rate, bracket efficiency, and detailed per-policy performance metrics.
- **Tournament persistence** (`apps/lab-web/src/play/persistence.js`): Tournaments now persist to IndexedDB (DB_VERSION bumped to 3, new `tournaments` object store). Functions: `saveTournament`, `loadTournament`, `listTournaments`, `deleteTournament`. Tournaments can be resumed from the setup screen.
- **Auto-play** (`apps/lab-web/src/workspaces/tournament.js`): "Run All" button continuously executes all remaining matches without user interaction. Stop button halts auto-play. State persists between matches.
- **Tournament export** (`tournament.js`): Export button copies full tournament data (bracket, results, analytics) to clipboard as JSON.
- **Tournament schema bumped to 1.1.0** (`tournament-scheduler.js`): `TOURNAMENT_SCHEMA_VERSION` updated. New fields: `tournamentId`, `policySeeds`, `thirdPlaceMatch`, `runnerUp`, `thirdPlace`.

### Player Profile Deepening

- **Complete AI rating table** (`apps/lab-web/src/play/local-profile.mjs`): `getAiRating` now covers all 19 policies including baseline (random-legal, score-rush, control, tempo, value), HYBIX normal (rusher, defender, trickster, sniper, support, tank, baseline), and difficulty variants (easy, hard, nightmare).
- **Rating history tracking** (`local-profile.mjs`): Each rated match now appends to `ratingHistory` with timestamp, rating, delta, opponent, and outcome. Chart rendered as inline SVG in the profile workspace.
- **New badges** (`local-profile.mjs`): Tournament Champion, Bracket Buster, and Tactician badges added. Profile schema bumped to 1.1.0.
- **Match history expansion** (`local-profile.mjs`): Verified results now include `aiDifficulty`, `aiArchetype`, `profileId`, `matchStats`, and `ratingDelta`. Migration enriches older entries.
- **Archetype breakdown** (`local-profile.mjs`): Tracks wins/losses/draws per AI archetype, rendered as a table in the profile workspace.
- **New /profile workspace** (`apps/lab-web/src/workspaces/profile.js`): Observatory workspace showing rating card, streak card, rating history chart, badge gallery (earned + locked with progress), archetype breakdown table, and match history table. Integrated into router and navigation.

### AI Commentary System

- **Tactical commentary engine** (`apps/lab-web/src/play/ai-commentary.js`): New module generating board-state observations (effect row control, hand size, score pressure, close game detection, threat warnings for untapped Queens/Aces/Kings, tempo observations, swap bar awareness, stack activity). Gated by guidance mode (OFF/ESSENTIAL/GUIDED/DETAILED) with configurable interval.
- **Post-match analysis** (`ai-commentary.js`): `generatePostMatchAnalysis` produces a personality-flavored analysis paragraph covering match character, key turning points, super usage, counter play, tempo, and outcome assessment.
- **Expanded banter pools** (`apps/lab-web/src/play/ai-personality.js`): All 7 archetype banter pools doubled in size. New context-aware variants: early-game, mid-game, late-game, close-game, dominating, comeback. `getAiBanter` now accepts a `context` parameter with `gamePhase`, `scoreDiff`, and `isComeback` for context-sensitive message selection.

### Infrastructure

- **Version bump**: All version surfaces updated to 0.22.0 (package.json, workspace packages, version.mjs, version.js, save-integrity.js, index.html, sw.js, release-identity.json, README.md).
- **New test files**: `test/v0.22.0-tournament-evolution.test.mjs`, `test/v0.22.0-profile-deepening.test.mjs`, `test/v0.22.0-ai-commentary.test.mjs`. Registered in package.json test script, ci.mjs stages.
- **Service worker cache**: Bumped to `intrilex-v0.22.0`.

## v0.21.1 — Rank 7 Canon Restoration: Generated Topdeck Plays

### Rank 7 Scoring

- **Revealed cards from Rank 7 Topdeck Casting can now be played for either effect or points** (`upstream/.../src/ranks.ts`, `core-private-choice.ts`, `core-advanced.ts`, `core-autonomy.ts`): The previous implementation restricted revealed cards to hand or effect only. The canon restoration adds `scoreCardId` to the `topdeck-seven` `RankAction` type, enabling a revealed card to be moved directly to the Point Row (PR) with its `pointValue` set via `cardPointValue`.
- **New scoring modes for `core-rank7-assign` private choice** (`core-private-choice.ts`): `score-only` (single revealed card → PR) and `hand-and-score` (two revealed cards: one to hand, one to PR). The existing `hand-only`, `effect-only`, and `hand-and-effect` modes are preserved unchanged.
- **`scoreInstead` flag for `core-rank7-generated-effect`** (`core-private-choice.ts`): When a generated effect card is revealed, the player may choose to score it for points instead of resolving its effect. Emits `CORE_SEVEN_GENERATED_SCORE_RESOLVED` event.
- **Super 7 Topdeck (`advanced-super-seven-topdeck`) supports `scoreCardIds`** (`core-advanced.ts`): The ⭐7 advanced action now accepts a `scoreCardIds` array, allowing revealed cards from the 4-card topdeck to be assigned to PR. The `scoreCardIds` field is conditionally included in the `CORE_ADVANCED_SUPER_SEVEN_TOPDECK_RESOLVED` event payload (omitted when empty for backward compatibility).
- **Physical-Seven-only recursion validator** (`core-autonomy.ts`): Exported `canRecurseTopdeck(state, sourceCardId)` function that returns `true` only if the source card is a physical Rank 7 in the player's hand. This centralizes the rule that only physical Sevens can trigger recursive Topdeck Casting.
- **AI enumeration includes scoring options** (`core-autonomy.ts`): The `core-rank7-assign` enumeration now generates `rank7-score-only` and `rank7-hand-and-score` candidates. The `core-rank7-generated-effect` enumeration now generates `rank7-generated-score` candidates.
- **Backward-compatible event payloads** (`ranks.ts`): The `SEVEN_TOPDECK_RESOLVED` and `MIMIC_TOPDECK_SEVEN_RESOLVED` events conditionally include `scoreCardId` only when it has a value, preserving compatibility with all 121 existing certified replays.

### UI

- **Action presenter labels for new scoring modes** (`apps/lab-web/src/play/action-presenter.js`): Added `rank7-score-only` → "score for points", `rank7-hand-and-score` → "hand and score", `rank7-generated-score` → "score for points" to the `MODE_LABELS` map.

### Tests

- **39 regression tests** (`test/rank7-scoring.test.mjs`): Covers type validation, engine execution (score-only, hand-and-score, generated-effect scoreInstead), Super 7 Topdeck with scoreCardIds, action presenter labels, backward compatibility, physical-Seven-only recursion boundary, point value correctness, full match determinism, enumeration completeness, rulebook content verification, invalid submission rejection, distinct selection validation, and source card movement. Registered in `package.json` test script and `scripts/ci.sh`.

### Preserved

- All 121 certified replays still verify (no event payload breakage).
- All existing test suite tests continue to pass (1321 pass, 1 skip, 0 fail).
- No unrelated ranks or balance values changed.

## v0.21.0 — Full Rank Authority Reconciliation & AI Mastery Audit

### Authority Reconciliation

- **Official Rules v4.3.1 canonized as the authoritative rules version** (`config/release-identity.json`): The engine has implemented v4.3.0 (K♠ Wild Sovereignty) and v4.3.1 (Black Joker Board Lock Quick) mechanics since the v0.20.0 cycle, but all version surfaces still reported `rulesVersion: "4.2.0"` and `officialRulesVersion: "4.2.0"`. This release honestly reconciles every version surface to `4.3.1`.
- **Product version bumped to 0.21.0**: All 12 workspace packages, root `package.json`, generated version modules (`version.mjs`/`version.js`), `save-integrity.js` (`PRODUCT_VERSION`/`RULES_VERSION`), `index.html` title/meta, `README.md` title, `card-face-data.js` registry meta, `adapter.mjs` exports, `build.mjs` BUILD_INFO, `generate-capability-manifest.mjs`, `manifest.mjs`, and `reports/capability-manifest.json`/`browser-parity.json` updated to 0.21.0 / 4.3.1.
- **Rulebook renamed** `docs/INTRILEX_v4.2.0_COMPLETE_PLAYER_RULEBOOK.md` → `docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md`: The rulebook content already contained v4.3.0 and v4.3.1 canon; the filename and title heading now honestly reflect this. `scripts/build.mjs` dist copy updated. Historical v4.1.2 rulebook preserved immutable.
- **Save compatibility note**: `save-integrity.js` `RULES_VERSION` bumped from `4.2.0` to `4.3.1`. Existing saves authored under `rulesVersion: "4.2.0"` will be rejected as `INCOMPATIBLE_RULES_VERSION`. This is honest — saves from the previous canon are not compatible with the reconciled canon.
- **Version-contract test renamed** `test/v0.20.0-version-contract.test.mjs` → `test/v0.21.0-version-contract.test.mjs` with updated assertions. Registered in `package.json` test script, `scripts/ci.sh`, and `scripts/ci.mjs`.
- **Engine data-format version preserved**: The engine's internal `rulesVersion: "4.1"` field (in `state.ts`, `replay.ts`, `validation.ts`, etc.) is the v4.1 data-format/schema contract that v4.3.1 canon mechanics run on. This is intentionally separate from the human-facing Official Rules version and is not changed, to preserve replay/state validation compatibility.

### Rank/Mode Inventory

- **Complete rank/mode inventory audit** (`reports/full-rank-audit.json`): Machine-readable artifact covering every rank variant and mode from `RANK_REGISTRY`, with engine enumeration, resolution, counter authority, destination, UI exposure, AI recognition, and telemetry status per mode.

### AI Strategic Valuation

- **Rank-aware strategic evaluation** (`packages/game-ai/src/agent.mjs`, `packages/game-ai/src/cognition.mjs`): Extended the AI's action-family bonus model with rank-specific strategic features that distinguish scoring, effect use, anchor/attachment placement, combination commitment, counter reserve, and conservation. The AI now applies opportunity-cost penalties when a proposed action consumes a strategically valuable card needed for a future recipe or counter.

## v0.20.0 — Play Module Reliability & Code Health Polish

### Fixed

- **Heartbeat lease-loss crash** (`apps/lab-web/src/play/play-app.js`): The session lease heartbeat queried `document.querySelector('#play-container')`, but the actual play container element is `#play-root` (created by `app.js`). If another tab took over the lease, the heartbeat called `renderActiveMatch(null)`, crashing at `container.innerHTML`. The heartbeat now uses a tracked `_activeContainer` module reference, and `renderActiveMatch` guards against a null container (returns early instead of crashing).
- **Variable shadowing in confirm handler** (`apps/lab-web/src/play/play-app.js`): The inner `const snapshot = _session.getSnapshot()` in the card-play sound/particle block shadowed the outer `snapshot` variable from the confirm handler scope. Renamed to `postSubmitSnapshot` for clarity and safety — same anti-pattern previously fixed in `app.js` `renderBranchResult` (v0.14.2).
- **AI banter sound double-play** (`apps/lab-web/src/play/play-app.js`): The `generateBanterFromEvents` function had a separate `if (isAiEvent && eventType.includes('action'))` catch-all that fired *after* the `if/else if` chain. An AI event with type like `"super-action"` would match the `super/ultra` branch (playing `playAiAction()`) AND then match the generic catch-all (playing `playAiAction()` again). The catch-all is now an `else if` branch, so only one sound plays per event. The `SoundEngine` does not de-duplicate — each call creates a new oscillator.
- **Native `confirm()` replaced with custom dialog** (`apps/lab-web/src/play/play-app.js`, `apps/lab-web/src/play/play-v3.css`): The replay delete action used the browser's native `confirm()` dialog, which is visually inconsistent with the rest of the play UI (which uses custom modal overlays for lease conflicts, keyboard help, etc.). Replaced with a `showConfirmDialog()` function that renders a themed modal with focus management (auto-focus on confirm button), keyboard support (Enter to confirm, Escape to cancel), click-outside-to-cancel, and ARIA attributes (`role="dialog"`, `aria-modal="true"`). Added `.confirm-dialog-overlay` and `.confirm-dialog` CSS rules using existing design tokens.
- **Rank Anatomy Observatory data integrity failure** (`apps/lab-web/src/workspaces/ranks/rank-anatomy-workspace.js`, `sample-data/observatory/`): The integrity banner displayed "DATA INTEGRITY FAILURE: Selections exist without recorded opportunities" for J:spade (55 selections, 0 opportunities) and J:super:* variants. Root cause: the campaign data was generated before the DEFECT-001 runtime fix that added `variantOpportunities` to rank decision records. The analytics legacy fallback only credited `J` and `J:normal` opportunities — never `J:spade` or `J:super:*`. Fix: regenerated all campaign data (100 matches, 4 worker configurations) with the current runtime, which correctly records variant-level opportunities for all tiers (rank-overall, normal, spade, super). Also fixed a display bug in the integrity banner where `opp === 0` would trigger both the "zero opportunities" and "overflow" conditions, producing duplicate-looking violations (changed second `if` to `else if`).

### Refactored

- **`_statsUpdated` external property mutation removed** (`apps/lab-web/src/play/play-app.js`): The terminal-stats guard previously mutated `_session._statsUpdated` — an undeclared property on the `PlaySession` class set from outside the class. Moved to a module-level `_statsRecorded` flag, reset in `startNewMatch`, `continueMatch` (seeded from session status to avoid double-recording for already-terminal saves), and `cleanupPlay`. The `PlaySession` class surface is no longer modified from outside.
- **`_leaseMode` comment updated** (`apps/lab-web/src/play/play-app.js`): The comment listed only 4 states (`UNCLAIMED | CONTROLLED | READ_ONLY | CONFLICT`) but the code uses 6 — `LEASE_LOST` and `RELEASED` are also assigned. Comment now lists all 6 states.
- **155 unused-vars lint warnings eliminated** (58 files across `apps/`, `packages/`, `scripts/`, `test/`): Removed unused named imports, unused destructuring bindings, and unused `const` declarations across the codebase. Lint warnings reduced from 282 to 127 (55% reduction). Conservative approach: `let`/`var` declarations were not removed (they may be reassigned later), and initializers with potential side effects (function calls, `new` expressions, `await`) were preserved.

### Preserved

- All existing APIs, routes, and behavior unchanged.
- All 1269 tests pass across 66 test files (full suite verified).
- Lint: 0 errors, 127 warnings (down from 282 — remaining warnings are `let`/`var` "assigned but never used" and unused function parameters).

## Official Rules v4.3.1 — Black Joker Lockdown Update

### Canonized Rules (Official Rules v4.3.0 → v4.3.1)

- **Board Lock is now a Quick Effect** (`docs/INTRILEX_v4.2.0_COMPLETE_PLAYER_RULEBOOK.md`): Black Joker's Board Lock is now a Quick Effect that may be declared during its controller's own Full Turn without spending a Mini-Turn. Board Lock requires an open game state (empty stack, no queued triggers, no suspended children, no pending declarations).
- **Counter authority narrowed**: Only ⭐A authority may directly counter Board Lock. This includes a physical ⭐A, 10♦ legally mimicking ⭐A, and a 3 Red Ultra resolving as ⭐A. Base Ace, Anchor Ace, A♠, ordinary King, and K♠ cannot directly counter Board Lock.
- **Two-Queen Defense**: The normal ⭐A Two-Queen Defense applies — an opponent cannot declare ⭐A authority against Board Lock if the Board Lock controller controls at least two untapped Queens in their Enduring Row.
- **No Mini-Turn cost**: Declaring Board Lock does not spend a Mini-Turn and does not end the controller's Action Phase. The controller may continue their Full Turn after Board Lock resolves.
- **Preserved mechanics**: Board Lock retains its Counter 2 duration, its restrictions on non-counter Effect plays, Scuttle, and Trap placement/trigger suppression, and its existing End Phase timer logic (no tick on activation FT, −1 per following completed FT). Black Joker retains its 11-Point scoring value, PR immunity, and Exile Recycle scoring trigger.
- **Non-retroactive**: Board Lock does not retroactively cancel plays declared before it resolved.
- **Engine implementation**: Added `core-declare-board-lock-quick` action type, `board-lock-quick` CoreResponseKind, Quick declaration with open-state guards in `core-authority.ts`, Board Lock resolution in `core-resolve-response-top`, counter authority restrictions (Base Ace, A♠, King, K♠ rejected), Board Lock Quick enumeration in `core-autonomy.ts`, and `board-lock` family in `core-advanced.ts` profiles. The old Mini-Turn `black-joker-board-lock` rank action path is now blocked.

## Official Rules v4.3.0 — King of Spades Restoration Update

### Canonized Rules (Official Rules v4.2.0 → v4.3.0)

- **K♠ Wild Sovereignty** (`docs/INTRILEX_v4.2.0_COMPLETE_PLAYER_RULEBOOK.md`): K♠ now has a Wild Sovereignty Effect mode. When legally played for Effect, K♠ may function as the complete Spade 🛠 Base effect of rank 3, 4, 5, 6, or 7. It remains K♠ for all identity checks and is sent to Exile after its Wild use.
- **4♠ Total Clear cost**: Choosing the 4♠ Total Clear effect through Wild Sovereignty requires discarding exactly one other card from hand as a mandatory declaration cost. The cost is not refunded if the play is countered or fizzles.
- **Wild-Exile-Bound**: When a legal Wild Sovereignty play is declared, K♠ is marked Wild-Exile-Bound. K♠ is sent to Exile when the play resolves, fizzles, or is countered. The marker applies only to the Wild Sovereignty mode.
- **Single-card restriction**: Wild Sovereignty is always a single-card Effect play. K♠ cannot combine with a 2, count as rank 3–7 for a Super recipe, or copy more than one Spade Base effect per declaration.
- **Counter authority**: Wild Sovereignty is treated as the chosen Spade Base effect for counter eligibility. K♠'s own Counter Multi-Play authority does not protect its Wild Sovereignty play.
- **Preserved modes**: K♠ retains its 8-Point PR value, 9-value King Anchor mode, Counter Multi-Play authority, and Royal Marriage eligibility. Each declaration uses exactly one chosen legal mode.
- **Engine implementation**: Added `wild-sovereignty` to the `RankAction` union, `RANK_REGISTRY` K modes, `resolveRankAction` resolution, `enumerateWildSovereigntyCandidates` legal-action enumeration (gated by Advanced/Unrestricted Core profiles), and `core-declare-primary` Wild-Exile-Bound destination handling with declaration-time 4♠ cost payment.

## Official Rules v4.2.0 — Queen's Court Update

### Canonized Rules (Official Rules v4.1.2 → v4.2.0)

- **Queen's Court** (`docs/INTRILEX_v4.2.0_COMPLETE_PLAYER_RULEBOOK.md`): New Core multi-card Anchor Play. Exactly two suited Queens from hand commit as one composite stack item for one Mini-Turn, once per Full Turn. On resolution both Queens enter ER simultaneously, untapped, each with normal protected-entry Aegis. Q♠ is a legal component; suits need not match. No Point scoring, no partial resolution, no special refund.
- **Counter authority correction**: Queen's Court is an Anchor Play directly counterable only by K♠ among standard counters. Ace-family counters (Base Ace, Anchor Ace, A♠, ⭐A) no longer counter Anchor or Goal-Mod plays solely because they are multi-card; their multi-card authority is narrowed to eligible multi-card Effect plays. Ordinary Kings counter only single-card Anchor/Goal-Mod plays.
- **Royal Marriage alignment**: Brought into the corrected Anchor counter taxonomy — only K♠ directly counters Royal Marriage; Base Ace, Anchor Ace, A♠, and ⭐A no longer counter it via generic multi-card authority.
- **Counter-authority matrix** (§16.1) and glossary/FAQ rebuilt to reflect the Effect-versus-Anchor class boundaries.
- **Version surfaces**: `config/release-identity.json` adds `officialRulesVersion: "4.2.0"` alongside the engine-implemented `rulesVersion: "4.1.2"`. Derived `version.mjs`/`version.js` now export `OFFICIAL_RULES_VERSION`. Documentation, README, and in-application rules displays reference v4.2.0 as the Official Rules. Engine, campaign, and save-integrity surfaces honestly retain `rulesVersion: "4.1.2"` because the engine has not been modified. Historical v4.1.2 rulebook preserved immutable.
- **Runtime status**: Official Rules v4.2.0 is fully implemented in the engine. Queen's Court legal-action generation, stack resolution, and the corrected counter-target classification are all live. The engine now reports `rulesVersion: "4.2.0"`.

## v0.19.0 — Player Experience Polish

### Bug Fix: First Contact Tutorial Saves

- **Save integrity profile fix** (`apps/lab-web/src/play/save-integrity.js`): Added `first-contact-trigger-closure` to the `SUPPORTED_PROFILES` trusted registry. Tutorial saves were being rejected during validation because the profile was missing from the trusted set, preventing tutorial progress from being saved or restored.

### Player Experience Polish

#### Match Chat Activation
- **Chat form wiring** (`apps/lab-web/src/play/play-app.js`): Wired up the chat form submit handler in `bindBoardEvents`. Player messages are stored in a session-level array and rendered in the Match Chat panel.
- **System messages from engine events** (`apps/lab-web/src/play/play-renderer-v3.js`): System messages are derived via `deriveChatFromEvents` from recent engine events.
- **AI banter messages** (`apps/lab-web/src/play/ai-personality.js`, `play-app.js`): AI opponents now send contextual personality-flavored messages triggered by game events (score, counter, super declaration). Each HYBIX archetype has a unique message pool.

#### Post-Match Statistics
- **Stats computation** (`apps/lab-web/src/play/play-controller.js`): `getSnapshot()` now populates `humanStats` and `opponentStats` from the decision journal. Tracks: securedPoints, cardsPlayed, supersDeclared, responses, passes.
- **Journal enrichment**: Decision journal entries now include `family` and `isSuper` fields to enable stats computation without requiring the original action frame.
- **Terminal screen**: The post-match analysis section now displays real data instead of empty placeholders.

#### Guidance Mode Toggle
- **Guidance mode selector** (`apps/lab-web/src/play/play-renderer-v3.js`, `play-app.js`): Added a guidance mode toggle button to the action dock header. Cycles through OFF → ESSENTIAL → GUIDED → DETAILED. The preference is persisted via IndexedDB.

#### Enter-to-Confirm
- **Keyboard shortcut** (`apps/lab-web/src/play/play-app.js`): Added Enter key handler that clicks the confirm button when an action is selected. Natural UX expectation for card game players.

#### Board Card Hover Preview
- **Hover tooltips** (`apps/lab-web/src/play/play-renderer-v3.js`): Extended `renderCardRow` to include hover preview tooltips for board cards, reusing the `tcg-hover-preview` pattern from hand cards.

### Persistent Player Profile

#### IndexedDB Player Stats Store
- **New object store** (`apps/lab-web/src/play/persistence.js`): Added `player-stats` object store (DB version bumped to 2). Tracks: totalMatches, wins, losses, draws, supersDeclared, totalDecisions, profileBreakdown, difficultyBreakdown, recentResults.
- **`getPlayerStats()` and `updatePlayerStats(matchResult)`**: New functions for reading and updating aggregate player statistics.

#### Play Hub Stats Dashboard
- **Stats display** (`apps/lab-web/src/play/play-renderer-v3.js`, `play-app.js`): The Play hub now shows win/loss record, total matches, AI difficulty breakdown, and recent match results (last 5).

### AI Personality Enrichment

#### Personality Descriptions
- **New module** (`apps/lab-web/src/play/ai-personality.js`): Added `ARCHETYPE_PERSONALITIES` with description, playStyle, and traits for each HYBIX archetype:
  - **Rusher**: aggressive tempo, scores early, sacrifices defense
  - **Defender**: reactive, counters opponent plays, builds late-game advantage
  - **Trickster**: misdirection, swap bar manipulation, effect-heavy
  - **Sniper**: precision removal, targets key cards, resource-efficient
  - **Support**: utility-focused, stack manipulation, protects own cards
  - **Tank**: endurance, high-defense, grinds out value over long games
- **New match setup**: The AI opponent selection screen now displays personality descriptions and play styles for each archetype.

#### AI Banter Messages
- **Contextual banter** (`apps/lab-web/src/play/ai-personality.js`): Each archetype has a personality-flavored message pool triggered by game events (score, counter, super declaration, win, loss).
- **Terminal banter**: The terminal screen displays a personality-flavored message from the AI opponent.

### Version Updates

- Root `package.json`: 0.18.0 → 0.19.0
- All workspace packages: 0.18.0 → 0.19.0
- `apps/lab-web/src/version.js`: 0.18.0 → 0.19.0
- `packages/shared/src/version.mjs`: 0.18.0 → 0.19.0
- `apps/lab-web/src/play/save-integrity.js`: PRODUCT_VERSION 0.18.0 → 0.19.0
- `apps/lab-web/src/index.html`: v0.18.0 → v0.19.0
- `config/release-identity.json`: 0.18.0 → 0.19.0

## v0.15.0 — Playerization

### Player Experience Module

The v0.15.0 release introduces the **Play module** — a full interactive player experience that lets humans play against the AI policies previously only observable in the Observatory. The Play module is lazy-loaded via dynamic import, keeping the initial bundle size unchanged for Observatory-only users.

#### New Play Modules (`apps/lab-web/src/play/`)

- **`action-presenter.js`**: Action presentation registry with 100% family coverage. Maps engine action families to human-readable labels, short labels, and summaries. Includes priority explainer for decision context and audit coverage checker.
- **`play-controller.js`**: Session state machine with command vault pattern. Manages human/AI decision turns, staleness checking (revision + frame hash), and certified replay generation. Exposes `createSession`, `restoreSession`, `PlaySession` class, and `SessionState` enum.
- **`play-renderer.js`**: Board renderer with action composer, priority explainer, and terminal/error states. Includes ARIA labels, `data-testid` attributes, and responsive layout for desktop/tablet/mobile.
- **`persistence.js`**: IndexedDB persistence with autosave, quarantine support, and AI continuity. Stores saves, replays, preferences, and quarantined sessions across browser sessions.
- **`replay-library.js`**: Certified replay verification and public/private export. Private exports include full certified replay + seed; public exports redact private choices and seed.
- **`tutorial-runtime.js`**: First Contact tutorial with 16 chapters covering core mechanics. Uses semantic completion predicates (action family, event type) — never card IDs. Supports skip, restore, and save state.
- **`play-privacy.js`**: Snapshot privacy validator and differential privacy checker. Rejects forbidden fields (rng, seed, cards), command bodies in legal actions, and DOM leaks (ARIA, text).
- **`play-app.js`**: Play route handler integrating all play modules. Exports `handlePlayRoute` and `cleanupPlay` for the main router.
- **`play.css`**: Responsive styles with breakpoints at 1366px, 768px, and 390px. Includes focus-visible styles, prefers-reduced-motion support, and play-specific component styles.
- **`hash.js`**: Deterministic hash utility (FNV-1a) for play module content integrity. Works in both browser and Node.js without top-level await.

#### Router Integration (`apps/lab-web/src/app.js`)

- **Lazy loading**: Play routes (`#/play`, `#/play/*`) are handled via dynamic `import('./play/play-app.js')`, keeping the initial bundle size unchanged.
- **`isPlayRoute` helper**: Detects play routes for router and boot logic.
- **`renderPlayMode` function**: Lazy-loads the play module and renders the play hub.
- **Boot optimization**: Observatory data loading is skipped for play routes, enabling instant play hub rendering.

#### Browser UI Smoke Test

- **`browser-ui-smoke-server.mjs`**: New server-based smoke test that loads the app from the dev server instead of blob URLs. Tests all 14 workspaces (landing, play hub, rules, watch, replay, autonomy, analytics, observatory, rank, diagnostics, extract, campaign, about) with real Chromium.

### Test Coverage

- **`test/play-module.test.mjs`**: 56 tests covering action-presenter, tutorial-runtime, play-privacy, replay-library, static file patterns, and engine adapter integration.
- **Updated tests**: `landing-page.test.mjs`, `browser-contract.test.mjs`, `regression.test.mjs` updated for v0.15.0 version strings and new play module architecture.
- **Full suite**: 719 tests pass with 0 failures. Self-audit status PASS (score 97/92).

### Version Updates

- Root `package.json`: 0.14.1 → 0.15.0
- All workspace packages: 0.14.1 → 0.15.0
- `index.html`: v0.14.0 → v0.15.0
- CI script and self-audit updated to include `play-module.test.mjs`

## v0.14.1 — Truth & Reliability Patch

### Engine Integrity Hotfix (v4.2.6)

- **Mimic 10♦ attachment severance** (`upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/src/ranks.ts`): The Mimic 10♦ row-exchange logic swapped rows and changed card controllers without calling `revalidateAttachments`, causing `CORE_ORCHESTRATION_REJECTED:STATE_INVALID` on seed 3068743422. The native ⭐4 row-exchange had the same omission. Both now call `revalidateAttachments` after any controller-changing row exchange.
- **Engine version promoted** from 4.2.5 to 4.2.6 across all runtime, adapter, campaign, and script references.

### Causal Telemetry Repair (schema v4.1.0)

- **Causal boundary** (`packages/simulation-runtime/src/runtime.mjs`): The state delta previously spanned from pre-frame state (before stack resolution) to post-action state, conflating the previous declaration's deferred resolution with the current decision. The runtime now maintains a pending-causality ledger that credits deferred stack resolution to the originating declaration, not to whichever player receives the next decision frame.
- **Schema versions** bumped from 4.0.0 to 4.1.0 across telemetry, analytics, and campaign modules.

### Honest Rank Intelligence

- **Missingness-aware axes** (`packages/simulation-runtime/src/rank-power.mjs`): Power axes without causal state deltas are now labeled `not-observable` and never normalize to 0, 0.5, or HIGH. The `normalizeMinimaxAware` function treats null entries as unavailable rather than zero.
- **ORV rename** (`packages/analytics/src/rank-integration.mjs`): The observational proxy formerly called "counterfactual decision value (CDV)" is now "Observed Rank Value (ORV)". All counterfactual terminology removed from the observational proxy. ORV is explicitly labeled as descriptive, cohort-relative, and confounded by selection bias.
- **Balance watchlist gating** (`packages/simulation-runtime/src/rank-power.mjs`): Balance flags now require all mandatory axes (selection, victory, score, board) to be observed with valid causal provenance. If requirements are unmet, the watchlist is suppressed with an explicit reason.
- **Confidence cap** (`packages/simulation-runtime/src/rank-power.mjs`): Confidence is capped at MEDIUM when causal axes (score, board) are not-observable, even if opportunity count would otherwise qualify for HIGH.

### Matched AB/BA Experiments

- **Paired McNemar test** (`packages/statistics/src/statistics.mjs`): Added `mcnemarPairedTest` for paired binary outcomes in AB/BA seat-swap design. Uses exact binomial test for <25 discordant pairs, chi-square with continuity correction otherwise. Tests policy advantage (A wins both seats vs B wins both seats) and reports seat-effect concordant pairs separately.
- **Paired bootstrap** (`packages/statistics/src/statistics.mjs`): Added `pairedBootstrapABBA` for resampling paired AB/BA blocks with 2000 iterations.
- **Observatory integration** (`packages/analytics/src/analytics.mjs`): `buildPairedABBAAnalysis` is now wired into `buildObservatoryAnalytics`, producing per-policy-pair McNemar and bootstrap results with explicit interpretation boundaries.
- **UI semantics** (`apps/lab-web/src/app.js`): Experiment preflight now displays "matched AB/BA seat-swap · paired McNemar + bootstrap" instead of "fixed-seat".

### Truthful Status and Evidence UI

- **4-state integrity status** (`apps/lab-web/src/app.js`): The integrity dialog now shows PASS / PARTIAL / NOT_VERIFIED instead of the binary "Hash-verified" / "Missing hashes". PASS requires all artifact hashes and zero aborts; PARTIAL requires all hashes but allows aborts; NOT_VERIFIED is shown when hashes are missing.
- **Engine version references** (`apps/lab-web/src/app.js`): Hardcoded `engineVersion:'4.2.5'` in `aggregateSegmentResults` replaced with `ENGINE_VERSION` from version.js.

### Single-Source Release Truth

- **Version alignment**: All version references updated to lab v0.14.1, engine v4.2.6, rules v4.1.2, telemetry/analytics schema v4.1.0.
- **Workspace packages**: All 11 workspace packages and batch-cli updated to v0.14.1.
- **Campaign artifacts regenerated**: 100-match Advanced Core campaign with worker counts [1, 2, 4], 31 retained replay artifacts, observatory analytics with 130 mechanics and 193 synergies.

### Test Results

- 448 tests pass across 44 test files.
- All rank analytics, telemetry, determinism, engine-boundary, campaign-artifacts, and behavioral tests pass.
- Engine fix confirmed: seed 3068743422 now produces NORMAL_VICTORY with no error.

## v0.14.2 — Visual Fixes, Performance & Code Health

### Fixed

- **Invisible CSS variables** (`apps/lab-web/src/styles.css`): `--blue` and `--danger` were referenced in `app.js` inline styles for bar fills (trace score decomposition, branch result charts) but never defined in `:root`. Added `--blue:#5b9cf0` and `--danger:var(--red)`. Also added missing `.status-badge.danger` rule used by FAIL audit checks in trace detail view.
- **Stale version strings** (`apps/lab-web/src/app.js`): `aggregateSegmentResults` hardcoded `labVersion:'0.10.1'` and `showIntegrity` fell back to `'0.11.0'`. Both now use `LAB_VERSION` imported from auto-generated `version.js` (currently `0.14.0`).
- **N+1 sequential fetch in `runDiagnostics`** (`apps/lab-web/src/app.js`): Trace shards were loaded one-by-one with `await` in a loop. Replaced with `Promise.all` parallel fetch, matching the pattern already used in `ensureTraceShardsLoaded`.
- **Missing error handling in `renderTraces`** (`apps/lab-web/src/app.js`): Two `.then(renderTraces)` async chains had no `.catch()`. Failed loads would hang on "Loading…" forever. Added error handlers that render a visible error state.
- **Trace index failure caching** (`apps/lab-web/src/app.js`): `loadTraceIndex` cached failed results (empty fallback), preventing retries on subsequent calls. Now only caches successful loads; failed calls return the fallback without storing it, allowing retry.

### Improved

- **Default `.notice` background** (`apps/lab-web/src/styles.css`): Plain `.notice` elements (without `.warning` or `.danger` modifier) were visually indistinguishable from surrounding content. Added subtle `rgba(90,215,232,.04)` base background.

### Refactored

- **Variable shadowing in `renderBranchResult`** (`apps/lab-web/src/app.js`): `.map(r=>...)` shadowed the function parameter `r` (the branch result object). Renamed callback parameter to `rollout` for clarity and safety.

### Preserved

- All existing APIs, routes, and behavior unchanged.
- All 190+ tests pass across all suites.

## v0.14.1 — Reliability & Error-Handling Polish

### Fixed

- **Silent catch diagnostics** (`apps/lab-web/src/app.js`): All 10 silent `catch {}` blocks now emit `console.warn` with context (URL, error message, fixture ID). Affected: `text()` fetch helper, `parseNdjsonSafe`, `loadTraceIndex`, `loadTraceData`, `computeVariantAnalyticsFromSummaries`, `cleanupWorkers`, `cancelBrowserCampaign`.
- **Race condition in `loadReplay`** (`apps/lab-web/src/app.js`): Concurrent calls to `loadReplay` (e.g. rapid replay selection changes) could clobber `state.replay` with stale data. Added a `Symbol`-based load token guard — if a newer load starts, the older one's state write is skipped.
- **`loadAuthorized` unhandled rejection** (`apps/lab-web/src/app.js`): If the authorized replay file was missing, `loadAuthorized` threw an unhandled rejection. Now catches the error, logs a warning, and sets `state.authorized = null` so the UI gracefully falls back to public visibility.
- **`parseNdjsonSafe` silent data loss** (`apps/lab-web/src/app.js`): Malformed NDJSON lines were silently dropped. Now logs a warning with the first 80 chars of the offending line for diagnosability.
- **Clipboard fallback robustness** (`apps/lab-web/src/app.js`): `execCommand('copy')` fallback now has feature detection for `navigator.clipboard`, proper error handling on both paths, visual "Copy failed" state if both methods fail, and hidden textarea positioning to avoid layout flicker.
- **DRY worker cleanup** (`apps/lab-web/src/app.js`): `cancelBrowserCampaign` now delegates to `cleanupWorkers` instead of duplicating `try/catch w.terminate()` logic.
- **Counterfactual error diagnostics** (`apps/lab-web/src/decision-intelligence.js`): All 6 silent `catch {}` blocks in `runCounterfactualBranch` and `runPairedCounterfactual` now emit `console.warn` with function name and error message before returning `notSupportedResult`.

### Preserved

- All existing APIs, routes, and behavior unchanged.
- All 190+ tests pass across all suites.

## v0.14.0 — Landing Page: Play · Rules · Sim

### Added

- **Landing Page** (`apps/lab-web/src/app.js`, `apps/lab-web/src/index.html`, `apps/lab-web/src/styles.css`): a hero-style entry point with three CTA cards — Play, Rules, Sim. Animated aurora background, large title, and spacious hero aesthetic distinct from the dense observatory UI. The landing page uses the same design tokens but with a dramatic presentation.
  - `#/` (or empty hash) renders the landing page with three CTA cards
  - `#/play` renders a teaser stub with planned features (Play vs AI, Multiplayer, Tournament Mode) as disabled cards with "Not yet available" badges
  - `#/rules` renders the full player rulebook with stylized typography, sticky table of contents sidebar, and collapsible part sections
  - `#/sim` is an alias for `#/watch` — the existing observatory
  - Observatory shell and side-rail are hidden on landing, play, and rules pages
  - Boot guard skips replay data loading for landing modes — pages render instantly
  - Deferred replay loading: first observatory entry from landing mode loads replay data on demand
  - Responsive: landing cards stack on mobile; rules TOC collapses on mobile
  - Reduced-motion accessibility: aurora animation and hover transforms disabled
- **Rulebook Renderer** (`apps/lab-web/src/rulebook-renderer.js`): a lightweight vanilla-JS markdown renderer handling ATX headers, pipe tables, ordered/unordered lists, bold/italic, inline code, fenced code blocks, blockquotes, horizontal rules, and paragraphs. Builds a table of contents from h1/h2 headers and wraps `# PART` sections in collapsible `<details>` elements. Fetches `data/rulebook.md` on demand.
- **Build Step** (`scripts/build.mjs`): copies `docs/INTRILEX_v4.1.2_COMPLETE_PLAYER_RULEBOOK.md` to `dist/data/rulebook.md` during build.
- **Test Suite** (`test/landing-page.test.mjs`): 34 static source tests covering routes, render functions, render guards, boot guards, rulebook renderer, HTML container, CSS presence, responsive styles, reduced-motion, and build artifacts.
- **CI Stage**: `landing-page` added to `scripts/ci.sh` and `package.json` test scripts.
- **Contract Tests**: `test/browser-contract.test.mjs` and `test/e2e-static.test.mjs` updated with landing page assertions.
- **Accessibility Tests**: `test/accessibility.test.mjs` updated with landing page skip-link, focus-visible, and reduced-motion assertions.

### Preserved

- All existing workspace routes (`#/watch`, `#/replays`, etc.) continue to work unchanged.
- All existing replay hashes remain valid.
- Engine v4.2.5 and rules v4.1.2 authority boundary unchanged.

## v0.13.0 — Advanced Continuations

### Added

- **10♣ Foundation** (`upstream/.../src/core-advanced.ts`): 10♣ Foundation is now fully playable. Scores 10♣ to PR with Aegis, grants bonus score card if pre-entry points are 0. Removed from `excludedSystems`, added `rank10-club-foundation` to `supportedFamilies`. 10♣ is now also allowed as a score card in Ultra Three Black.
- **⭐2 Hold** (`upstream/.../src/core-advanced.ts`): ⭐2 Hold disposition is now implemented. Target card stays tapped in its row with `start-phase` tap state that expires at the next Start phase. Removed `super-two-hold-child` from `excludedSystems`, added `super-two-hold` to `supportedFamilies`. Hold candidates enumerated alongside score candidates.
- **Voltage 3** (`upstream/.../src/core-advanced.ts`): Voltage 3 is now playable. When rank-3 threshold is met (3+ cards drawn), take top DP card to hand or score it for Points. Removed `voltage-three-choice` from `excludedSystems`, added `voltage-three-choice` to `supportedFamilies`.
- **Voltage 4** (`upstream/.../src/core-advanced.ts`): Voltage 4 is now playable. When rank-4 threshold is met (4+ cards drawn), guess rank+suit of top DP card. If correct, score it for Points. Removed `voltage-four-private-prediction` from `excludedSystems`, added `voltage-four-prediction` to `supportedFamilies`.
- **Voltage 5 Refine** (`upstream/.../src/core-advanced.ts`): Voltage 5 Refine branch is now playable. Discard a card from hand to draw a replacement from DP. Removed `voltage-five-refine-private` from `excludedSystems`, added `voltage-five-refine` to `supportedFamilies`.
- **Special Scoring Riders** (`upstream/.../src/core-advanced.ts`): Removed `special-scoring-riders-seven-ten-club-black-joker` from `excludedSystems`, added `special-scoring-riders` to `supportedFamilies`.
- **Test Suite** (`test/advanced-continuations.test.mjs`): 19 tests covering 10♣ Foundation, ⭐2 Hold, Voltage 3/4/5 Refine, scoring riders, 10♣ as Ultra score card, replay compatibility, determinism, and multi-policy pairings.
- **CI Stage**: `advanced-continuations` added to `scripts/ci.sh` and `package.json` test scripts.

### Preserved

- All existing replay hashes remain valid.
- Hidden Super branches (⭐3/5/6/7), generated effect copy, and Sudden Death remain fail-closed.
- Engine v4.2.5 and rules v4.1.2 authority boundary unchanged.

## v0.12.0 — 10♦ Mimic Closure

### Added

- **10♦ Mimic Closure** (`upstream/intrilex-engine-4.2.5-priority-pass-hotfix/src/ranks.ts`, `src/core-advanced.ts`, `src/types.ts`): 10♦ Mimic is now fully implemented for ⭐4 (Row Exchange), ⭐8 (Absolute Scuttle), and ⭐J (Tempo Force). Solo mimic supports ranks 3–7; paired mimic (with a Two) extends to A, 3–7, 8, J.
  - New `MimicCopiedAction` type in `types.ts` carries the copied effect parameters.
  - `mimic-ten-diamond` RankAction now includes `mimicAction` field for inline dispatch.
  - `advanced-rank10-diamond-mimic` added to `CoreAdvancedAction` type.
  - Removed `ten-diamond-mimic` from `excludedSystems`; added `rank10-diamond-mimic` to `supportedFamilies` in `CORE_ADVANCED_AUTHORITY_PROFILE`.
  - `enumerateAdvancedCoreCandidates` now enumerates solo and paired mimic candidates.
  - Score decomposition in `policies/scoring.mjs` includes mimic synergy and risk components.
  - Complex private-choice mimic effects (⭐3, ⭐5, ⭐6, ⭐7, ⭐A) remain fail-closed.
- **Test Suite** (`test/mimic-ten-diamond.test.mjs`): 11 tests covering profile registration, candidate enumeration, row-exchange resolution, paired absolute-scuttle, super-j-tempo, determinism, score decomposition, replay compatibility, rank-10 limit enforcement, and exile-bound behavior.
- **CI Stage**: `mimic-ten-diamond` added to `scripts/ci.sh` and `package.json` test scripts.

### Preserved

- All existing replay hashes remain valid.
- Engine v4.2.5 and rules v4.1.2 authority boundary unchanged.

## Card Face Renderer v1.0.0 — 2026-07-31

- Added deterministic suit-specific card rendering with Board, Lite, and Full Zoom views.
- Added canonical King and Rank 10 registries under rules v4.1.2.
- Added Card Faces workspace, exact-card gallery, and replay card inspector.
- Separated WebP artwork from canonical values, timing, restrictions, and rules text.
- Added fail-visible scaffolding for all 54 exact card identities.
- Added renderer tests, responsive layouts, forced-colors behavior, and browser smoke coverage.

## v0.10.0 — HYBRIX AI Integration & Decision Evidence v2

### Added

- **Decision Evidence Contract v2** (`packages/decision-intelligence/src/decision-trace.mjs`): schema bumped to 2.0.0. Traces now use actual policy-emitted candidate scores and selection metadata instead of reconstructed scores. Random policy traces correctly emit null selection margin. Rule audits are evidence-derived with status, observed, and evidence fields.

- **Real Counterfactual Branching** (`packages/decision-intelligence/src/counterfactual.mjs`): schema bumped to 2.0.0. `runCounterfactualBranch` now restores checkpoint state from certified replay, validates alternative action legality, executes it, and runs continuation rollouts from post-action state. Paired continuation seeds exclude `alternativeActionId` for fair comparison. All NOT_SUPPORTED returns include `resultHash`.

- **HYBRIX Domain-Native Cognition** (`packages/game-ai/src/agent.mjs`): replaced spatial `tick()` call in `choose()` with `assessIntrilexBoardState()` — an Intrilex-native cognition pass that evaluates board state (score gap, stack depth, threat level, resource pressure) and influences action scoring directly. No spatial action vocabulary (ATTACK/DEFEND/MOVE/RETREAT) remains in the active Intrilex path.

- **Seat-Balanced Benchmarking** (`scripts/benchmark-hybrix.mjs`): matchups now alternate seat assignment for balance. Wilson 95% confidence intervals reported per matchup and overall. Per-seat win rates and imbalance metrics included.

- **Contract Tests** (`test/v0.10.0-contract.test.mjs`): 32 tests covering counterfactual truth, paired seeds, decision evidence, evidence-derived rule audits, diagnostics truth, HYBRIX trace extraction, HYBRIX domain-native, hidden information invariance, determinism, counterfactual comparison, and package integrity.

### Changed

- Version strings updated from `0.9.0` to `0.10.0` across all `package.json` files, `runtime.mjs` `LAB_VERSION`, `index.html`, `BUILD_INFO.json`, and regression tests.
- `POLICY_DIAGNOSTICS_VERSION` bumped to `2.0.0` with normalized decision fields accepting both telemetry and trace data sources. Low-margin decisions use `decisionId` instead of `checkpointId`.
- Browser-side `decision-intelligence.js` updated to match v2.0.0 contracts (paired seeds, contentHash requirement, NOT_SUPPORTED with resultHash).
- Browser worker `run-diagnostics` handler now passes actual decisions to `diagnosePolicy` instead of empty array.
- `mapHybrixReasonCodes` in `trace-adapter.mjs` fixed: broken `find(() => false)` predicate corrected, reason codes mapped to valid vocabulary entries only.
- `game-ai` package exports `./trace-adapter` path.

### Architecture

- **Circular dependency broken**: `@intrilex/policies` no longer depends on `@intrilex/game-ai`. HYBRIX policy composition moved to `@intrilex/policies/hybrix` entry point. Core policies (`POLICY_CATALOG`, `POLICY_BY_ID`) are now `CORE_POLICY_CATALOG` / `CORE_POLICY_BY_ID` in the main entry. Consumers needing HYBRIX policies import from `@intrilex/policies/hybrix`.

### Tooling

- **Cognition Pass Profiler** (`scripts/profile-cognition.mjs`): benchmarks individual pipeline stages (domain scoring, cognition overhead, personality, memory, difficulty) with configurable iteration counts. Reports per-operation latency, throughput, and cognition overhead percentage.

- **Research-Grade Benchmark** (`scripts/benchmark-hybrix.mjs`): upgraded to 200 matches/matchup (configurable via `BENCH_MATCHES` env var). Now reports Wilson 99% CI alongside 95% CI, Cohen's h effect size with magnitude interpretation, per-seat Wilson CIs for seat balance assessment, and live progress indicator for long-running benchmarks.

### Autonomous Upgrades

- **Cognition-Personality Urgency Dampening** (`packages/game-ai/src/agent.mjs`): `applyPersonalityToLegalAction` now receives cognition context. When board urgency > 0.6, personality penalties on scoring actions are dampened by 70%, preventing low-aggression archetypes (Defender, Tank) from refusing to close winning positions.
- **Campaign Worker Error Resilience** (`packages/simulation-runtime/src/worker.mjs`): per-match try-catch in worker thread prevents a single match failure from crashing the entire worker batch. Errored matches are filtered and reported with warnings in campaign aggregation.
- **Stale Version Sweep**: fixed remaining `0.9.0` references in `scripts/build.mjs`, `scripts/generate-capability-manifest.mjs`, and `packages/simulation-runtime/src/campaign.mjs` (labVersion). Regenerated capability manifest with correct `0.10.0` version.
- **Worker.js Dist Sync**: synced stale `apps/lab-web/dist/worker.js` to match current `src/worker.js`.

### Preserved

- All v0.8.0 and v0.9.0 canon corrections remain intact.
- All 121 certified authorized replays remain valid.
- Engine v4.2.5 and rules v4.1.2 authority boundary unchanged.

## v0.8.0 — Decision Intelligence

### Added

- **Decision Trace Authority** (`packages/decision-intelligence/src/decision-trace.mjs`): versioned, deterministic decision-trace model for every meaningful policy frame. Each trace includes schema version, stable decision ID, checkpoint hash, seat, policy ID, decision kind (MINI_TURN/RESPONSE/PRIVATE_CHOICE), phase, turn, redacted public context, authorized context hash, legal options with score decomposition and reason codes, selected action, selection margin, own-item-on-top flag, and rule audit. Score components (terminal, points, resource, tempo, defense, synergy, risk) reconcile exactly. Public exports redact private context. Traces are deterministic across reruns.

- **Reason Code Vocabulary** (`packages/decision-intelligence/src/reason-codes.mjs`): finite vocabulary of 28 reason codes with human-readable displays and categories. Replaces generic "best move" explanations. Unknown codes fail validation. Vocabulary hash is deterministic.

- **Canonical Mechanic Registry** (`packages/decision-intelligence/src/mechanic-registry.mjs`): one shared mechanic registry with 31 canonical mechanics, each with stable ID, display name, category, description, authority references, eligible families, and analytics flags. Excludes phase names, timing keywords, suits, orchestration commands, and aliases. Unknown tags enter a quarantine ledger.

- **Counterfactual Branch Lab** (`packages/decision-intelligence/src/counterfactual.mjs`): deterministic, analysis-only branch evaluation from command checkpoints. Derives continuation seeds from `matchId + checkpointHash + alternativeActionId + rolloutIndex + analysisVersion`. All branches marked `analysisOnly: true`. Results are excluded from canonical cohorts. Uses the term "policy-conditioned counterfactual estimate" — never "solved play" or "true regret."

- **Policy Diagnostics** (`packages/decision-intelligence/src/policy-diagnostics.mjs`): instrumented diagnosis of policy behavior including decision margins, self-counter rate, response conservation, timing analysis, and win rate. Comparison function produces descriptive (not prescriptive) comparisons.

- **Score Decomposition** (`packages/policies/src/scoring.mjs`): `decomposePolicyScore` and `rankPolicyActionsWithDecomposition` functions producing per-action score components for decision traces.

- **Decision Trace Integration** (`packages/simulation-runtime/src/runtime.mjs`): `runPolicyMatch` now accepts `decisionTracesEnabled: true` to capture decision traces alongside the existing decision loop. Trace generation does not affect policy output, canonical state, RNG consumption, winners, or replay hashes.

- **Decision Intelligence Tests** (`test/decision-intelligence.test.mjs`): 24 tests covering reason codes, mechanic registry, decision traces, counterfactual branches, policy diagnostics, and runtime integration.

### Changed

- Version strings updated from `0.7.0` to `0.8.0` across `package.json`, `runtime.mjs`, `campaign.mjs`, `facts.mjs`, `build.mjs`, `index.html`, `app.js`, `worker.js`, `browser-analytics.js`, and `README.md`.
- Lab identity updated from "Mechanics Observatory" to "Decision Intelligence" in UI and documentation.
- Regression test updated to expect version `0.8.0`.

### Preserved

- All v0.7.0 canon corrections remain intact: 10♠ Stack Theft targeting, 3 Red Ultra declaration restrictions, policy self-counter prevention, participant-level mechanic attribution, synergy input using one primary mechanic per decision, and per-match canon audits.
- All existing tests, replays, and evidence artifacts remain valid.
- Engine v4.2.5 and rules v4.1.2 authority boundary unchanged.
