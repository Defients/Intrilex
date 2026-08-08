# Engine Architecture

## Deterministic boundary

`IntrilexEngine.execute(state, command)` is a pure authoritative transition boundary. It clones the input, validates all accepted results, appends ordered events, and emits no event for a rejected command.

## Single-zone model

Every card has one authoritative zone and one matching container. Shared movement applies destination replacement and lifecycle cleanup before insertion.

## Transaction, stack, and replay

Phases 2–4 provide staging, total rollback, LIFO resolution, priority circulation, trigger queues, hidden-choice replay, canonical serialization, and SHA-256 certification.

## Lifecycle layer

Phase 5 owns exact Start-event expiration, Aegis and Tap replacement, reveal cleanup, Played-for-Effect OTT cleanup, and permanent Exile-Bound replacement.

## Rank layer

Phase 6 supplies the immutable 15-rank registry and gate-scoped rank resolution through `RESOLVE_RANK_ACTION`.

## Interaction authority layer

Phase 7 adds `RESOLVE_INTERACTION_ACTION` and four reusable services:

1. `evaluateProtection` — independent Guard, Aegis, rank immunity, Q♠, and Scuttle-immunity predicates.
2. `evaluateCounterAuthority` — exact counter-source/target matrix, Royal Shield, and two-Queen defense.
3. Scuttle resolver — ordinary, 8♠ Free, and ⭐8 Absolute profiles with named bypasses.
4. Attachment graph — reciprocal links, immediate revalidation, deterministic sever, and host restoration rules.

The runtime validator rejects committed invalid Attachment graphs. No UI or client policy can override these services.

## Hash compatibility

New commands are additive. Earlier fixtures still execute through their original command paths, preserving their state and event hashes exactly.

## Phase 8 orchestration layer

Phase 8 adds `RESOLVE_PHASE8_ACTION` and `src/phase8.ts` without changing earlier command paths.

1. The Ultra executor validates exact color recipes and resolves all internal roles atomically.
2. The Rank-10 wrapper applies once-per-FT containment and Exile-Bound before destination processing.
3. Voltage snapshots are captured once and stored by player/FT; resolution reads the frozen record.
4. The endgame processor executes numbered End Phase steps and returns immediately when a winner is produced.

Phase 8 runtime records live under `metadata.phase8`. This optional namespaced state preserves every Phase 2–7 canonical hash while still giving the new subsystem a typed authority boundary.

## Phase 9 profile layer

`src/phase9.ts` adds a capability-selection boundary above the existing kernel.

- `FIRST_CONTACT_PROFILE` is immutable configuration data.
- configuration validation rejects incompatible optional modules;
- declaration validation rejects disabled classes before source commitment;
- setup normalization sets two players, Goal 15, and one Mini-Turn;
- Start normalization performs profile-wide automatic untapping;
- destination routing rewrites Exile to GY;
- hand-entry normalization suppresses reveal markers.

The profile emits ordinary deterministic engine events and therefore receives the same hashing, replay, validation, and public-view treatment as every other accepted command.

## Phase 10 Trap boundary

`phase10.ts` owns non-stack hidden placement, eligibility detection, per-FT trigger limits, Board Lock suppression, named Trap-context resolution, module-3 Disable Tokens, and exact expiry ownership. `views.ts` redacts face-down identities before replay publication. The service delegates movement, protection, rank resolution, and command event commitment to existing layers.

## Phase 11 multiplayer layer

`phase11.ts` owns all player-count and team semantics. It does not duplicate rank handlers.

- relation evaluation maps player pairs to self, Ally, or Enemy;
- setup consumes explicit card assignments for deterministic replay;
- priority order derives from the shared turn order;
- per-player hands, Goals, rows, and limits remain isolated;
- team totals are derived only for explicit victory and tiebreak procedures;
- generated-play interception rebinds controller-relative legality before resolution.

This layer is additive: two-player state and event hashes from Phases 2–10 remain unchanged.

## Phase 13 — Time Bomb module

Time Bomb uses card-local structured Fuse state and runtime-owned forced-Action obligations. Fuse advancement is independent of tap status. Controller changes relocate PR authority without rewriting stage. Defuse is an atomic declaration procedure whose paid cards and Action-Phase skip survive countering. The scoring pipeline remains Core signed card contribution followed by one BattleRealm continuous-bonus pass.

## Phase 14 — Deffy setup reducer

Deffy Mode is isolated from gameplay resolution. `RESOLVE_PHASE14_ACTION` accepts configuration, pool, pick, refill, completion, assignment, timeout, and Mirror Me commands. It mutates setup state directly only after validation and emits deterministic setup events. Hidden pool cards are redacted in both public and player views until a rule reveals them. Every shuffle consumes the serialized engine RNG and records cursor movement in the Phase 14 runtime.

## Phase 15 — Tournament Seed setup profile

`phase15.ts` owns tournament-only setup and Scuttle modification without duplicating the Core engine.

- banned physical cards move to compatibility `VOID` and are indexed in the public Phase 15 Ban Pile record;
- category validators operate on exact card identity;
- category selections remove cards from DP immediately;
- High-Impact rankings resolve in deterministic category priority;
- the random sixth and Swap Bar consume serialized RNG and shared movement services;
- configuration rejects incompatible modules before any card moves;
- Tournament Seed Scuttle uses rank order only while retaining protection and immunity checks.

Fixture provenance is now explicit: executable IDs are package-unique, while `sourceTestId` records the authoritative upstream test identity. This permits immutable historical replay retention when an upstream correction exposes a collision.
