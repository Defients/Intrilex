# Known Limitations — Intrilex Simulation Lab v0.29.0

> **AUTO-GENERATED** by `scripts/generate-capability-truth.mjs` from `config/capability-truth.json`.
> Generated: 2026-09-04T13:49:59.503Z
> Do not edit manually — run `pnpm run capability:generate` to regenerate.

## By Design (Scope Freeze)

### Canonical 3-4 player Multiplayer module is not available

- **ID:** MULTIPLAYER-01
- **Detail:** Online 1v1 Direct Duel is supported via networkAuthority. This entry blocks the canonical 3-4 player Multiplayer rules module only.
- **Reason code:** `SCOPE_FREEZE_AND_MULTIPLAYER_AUTHORITY_UNAVAILABLE`

### Optional modules are not available

- **ID:** OPTMODULES-01
- **Detail:** Optional game modules are blocked by scope freeze. The engine authority for optional modules is unavailable.
- **Reason code:** `SCOPE_FREEZE_AND_ENGINE_AUTHORITY_UNAVAILABLE`

## Technical Limitations

### Event-level state stepping is not available

- **ID:** EVENTSTEP-01
- **Detail:** The engine does not expose event-level state snapshots. Replay stepping operates at the command level.
- **Reason code:** `EVENT_STATE_SNAPSHOTS_UNAVAILABLE`

### Spectator mode uses NEUTRAL projection with a 50-spectator limit

- **ID:** SPECTATOR-01
- **Detail:** Spectators see a NEUTRAL projection of the game state — they do not see either player's authorized view. Spectator capacity is limited to 50 spectators per match.

## Environment Limitations

### Browser UI smoke and E2E certification require Chromium

- **ID:** BROWSER-TESTS-01
- **Detail:** scripts/browser-ui-smoke.mjs and scripts/browser-e2e-certification.mjs require a Chromium binary. Without it, they write FAIL reports. Do not leave orphaned processes running.

### Vendor engine directory may not be present in all workspaces

- **ID:** VENDOR-01
- **Detail:** The integration test for 121 certified replays skips gracefully when vendor/intrilex-engine-4.1.0/ is absent.

## Security Debt

### Git history contains a credential-bearing path (scripts/upload-key.cjs)

- **ID:** SEC-01-HISTORY
- **Detail:** The secret containment scan detects a credential-bearing path in 2 reachable commits. This requires Git history rewriting to fully resolve. The current working tree does not contain the credential.

## Evidence Limitations

### Lookahead, Tournament, and Human-meta-proxy policy tiers are not yet established

- **ID:** POLICY-TIER-01
- **Detail:** All 20 policies are classified as Fixture, Baseline, or Heuristic. No policy has been benchmarked to Lookahead, Tournament, or Human-meta-proxy tier. Claims are qualified by the highest established tier.

## Design Decisions

### No numerical card balance changes have been introduced

- **ID:** BALANCE-01
- **Detail:** The balance investigation found that engine correctness and policy quality must be established before balance tuning. No card values, costs, or effects have been changed for balance reasons.

## Profile Scope

### Advanced Core has replay-only systems

- **ID:** ADVANCED-REPLAY-ONLY
- **Detail:** In Advanced Core, the following systems are replay-only (not autonomously playable): complete-core, hidden-choice-supers, generated-effect-copy, sudden-death. Use Unrestricted Core for full autonomous play of these systems.
- **Items:** complete-core, hidden-choice-supers, generated-effect-copy, sudden-death

## Browser-Dependent Tests

Some tests require a Chromium binary:

- `scripts/browser-ui-smoke.mjs` — writes a FAIL report without Chromium
- `scripts/browser-e2e-certification.mjs` — requires Chrome/Chromium
- Do not leave orphaned browser-smoke processes running
