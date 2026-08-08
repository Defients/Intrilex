# Known Limitations — Intrilex Simulation Lab v0.24.2

## Browser-Dependent Tests

The following tests require a real Chromium/Chrome binary and will produce FAIL reports if the browser is not available:

- `scripts/browser-ui-smoke.mjs` — writes `reports/browser-ui-smoke.json`
- `scripts/browser-e2e-certification.mjs` — writes `reports/browser-e2e-certification.json`
- `scripts/browser-parity.mjs` — writes `reports/browser-parity.json`

On Windows, Chrome is expected at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
On Linux, `/usr/lib/chromium/chromium` or WSL path `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`.

## Campaign Execution Time

- 100-match diagnostic campaign: ~30 seconds
- 10,000-match full campaign: ~10-30 minutes depending on CPU cores
- Campaign segments are cached in `runtime/campaign-segments-v070/` and reused on resume
- Segment cache is invalidated automatically when any provenance field changes

## Linting Warnings

- ~164 `no-unused-vars` warnings are pre-existing and not introduced by v0.22.0
- 0 errors expected

## Replay Data Version

- `REPLAY_DATA_VERSION` is `0.10.1` and is intentionally separate from the product version
- It only changes when the replay data format itself changes (breaking backward compatibility)
- Existing replay artifacts remain valid across product version bumps

## Optional Modules and Multiplayer

- Optional modules are blocked (`SCOPE_FREEZE_AND_ENGINE_AUTHORITY_UNAVAILABLE`)
- Canonical 3-4 player Multiplayer module is blocked (`SCOPE_FREEZE_AND_MULTIPLAYER_AUTHORITY_UNAVAILABLE`)
- Online 1v1 Direct Duel is supported via Network Authority Foundation (v0.23.0)
- Event-level state stepping is blocked (`EVENT_STATE_SNAPSHOTS_UNAVAILABLE`)

## Network Authority (v0.23.0)

- Server-authoritative online Direct Duel is supported for 2 players via `core-unrestricted-authority` profile
- Direct invite-only play — no public matchmaking, accounts, or ranked networking
- Server must run on a reachable host; development defaults to `ws://127.0.0.1:3099`
- Browser WebSocket client requires the match server to be running (`pnpm network:dev` or `pnpm dev:network`)

## Network UX Integration (v0.24.1)

- Lobby UI is integrated into the Play app at `#/play/online`
- Reconnection persistence uses `localStorage` — clearing browser storage prevents reconnect
- Saved reconnect info expires after 30 minutes
- The `pnpm dev:network` script starts both the dev server and match server in one process
- Browser E2E certification of the lobby UI requires Chrome binary (environment-dependent)

## Durable Match Storage (v0.24.1)

- `SqliteMatchStore` is the default match store, using `node:sqlite` (Node.js 22+ built-in, experimental)
- Database file: `runtime/match-server/matches.sqlite` (gitignored)
- Match state is reconstructed via deterministic replay from seed + command log
- `InMemoryMatchStore` is still available for testing via `startServer({ persistent: false })`
- SQLite database is in WAL mode for concurrent read/write performance

## Public Matchmaking Queue (v0.24.1)

- FIFO queue pairs two waiting players by profile (no MMR, no accounts)
- First-come-first-served; no skill-based matching
- Queue timeout: 2 minutes (stale entries are cleaned)
- Max queue size: 200 players
- Players can cancel via `QUEUE_LEAVE`

## WebSocket Compression (v0.24.1)

- `permessage-deflate` is enabled with a 256-byte compression threshold
- `contextTakeover` is disabled (reduces memory overhead for low-frequency game messages)
- Clients without compression support still work (backward compatible)

## Spectator Mode (v0.24.1)

- Spectators can join RUNNING or TERMINAL matches only
- Spectators see a NEUTRAL projection — no player hands, no seed, no RNG, no legal actions, no private data from either player
- Spectators cannot submit actions — read-only
- No spectator chat or interaction — view-only
- Maximum 50 spectators per match (`MAX_SPECTATORS_PER_MATCH = 50`)

## Engine Authority

- Engine is `@intrilex/headless-engine` v4.2.6 with attachment integrity hotfix
- Rules authority is v4.3.1 (K♠ Wild Sovereignty + Black Joker Board Lock Quick)
- Pass priority is exhausted-pass-only (no ordinary pass)
- Interrupt timing ruling: keyword tax is false
