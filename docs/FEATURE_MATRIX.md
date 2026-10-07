# Feature Matrix

> **AUTO-GENERATED** by `scripts/generate-capability-truth.mjs` from `config/capability-truth.json`.
> Generated: 2026-10-07T06:25:50.453Z
> Version: 1.0.0 (Certified Public Baseline)

## Simulation Profiles

| Profile | Engine ID | Autonomy | Players | Covered | Replay-Only | Blocked |
|---------|-----------|----------|---------|---------|------------|---------|
| Advanced Core Authority — Two Player | core-advanced-authority | SUPPORTED | 2 | 16 systems | complete-core, hidden-choice-supers, generated-effect-copy, sudden-death | optional-modules, multiplayer |
| Unrestricted Core Authority — Two Player | core-unrestricted-authority | SUPPORTED | 2 | 19 systems | — | optional-modules, multiplayer |
| Complete Generic Two-Player First Contact | first-contact-trigger-closure | SUPPORTED | 2 | 8 systems | — | optional-modules, multiplayer, Core-only systems |

## Online Play

- **Status:** SUPPORTED
- **Transport:** WEBSOCKET
- **Authority:** SERVER
- **Profiles:** core-advanced-authority, core-unrestricted-authority, first-contact-trigger-closure

### Features

- ✅ serverAuthoritative
- ✅ hiddenInfoFirewall
- ✅ idempotentSubmission
- ✅ disconnectReconnect
- ✅ certifiedReplay
- ✅ deterministicParity
- ✅ lobbyUI
- ✅ inviteCodeSharing
- ✅ reconnectPersistence
- ✅ persistentStorage
- ✅ publicMatchmaking (enabled by default: false)
- ✅ webSocketCompression
- ✅ spectatorMode
- ✅ rateLimiting
- ✅ ipRateLimiting
- ✅ spectatorLimit
- ✅ matchHistory (enabled by default: false)

## Product Lanes

### Play — Local, ranked, tournaments, replays

- [Play Hub](#/play) — Game start, resume, and new match setup
- [New Game](#/play/new) — Configure a match vs AI or online
- [Academy](#/play/academy) — 5 sequential interactive lessons
- [Puzzles](#/puzzles) — Progressive puzzle ladder
- [Replay Library](#/play/replays) — Browse, watch, and verify replays
- [Tournaments](#/tournaments) — AI bracket tournaments
- [Ranked Seasons](#/seasons) — Ranked play, placements, and leaderboards

### Learn — Academy, puzzles, rules, card reference

- [Rulebook](#/rules) — Complete player rulebook
- [Academy](#/play/academy) — Interactive tutorial lessons
- [Puzzles](#/puzzles) — Puzzle ladder with progression
- [Card Reference](#/cards) — All 54 canonical card faces

### Lab — Watch, Caster, mechanics, ranks, evidence, traces, branches, diagnostics

- [Watch](#/watch) — Match theatre
- [Caster](#/caster) — Live replay broadcast
- [Replays](#/replays) — Verification
- [History](#/history) — Match ledger
- [Mechanics](#/mechanics) — Atlas
- [Synergies](#/synergies) — Relationships
- [Ranks](#/ranks) — Power observatory
- [Compare](#/compare) — Matched cohorts
- [Traces](#/traces) — Decision intelligence
- [Branches](#/branches) — Counterfactual lab
- [Diagnostics](#/diagnostics) — Policy behavior
- [Tournament](#/tournament) — AI bracket
- [Evidence](#/evidence) — Integrity and provenance
- [Analytics AI](#/intelligence) — Ollama interpretation

## Limitations

### Canonical 3-4 player Multiplayer module is not available

- **ID:** MULTIPLAYER-01
- **Severity:** by-design
- **Detail:** Online 1v1 Direct Duel is supported via networkAuthority. This entry blocks the canonical 3-4 player Multiplayer rules module only.
- **Reason code:** SCOPE_FREEZE_AND_MULTIPLAYER_AUTHORITY_UNAVAILABLE

### Optional modules are not available

- **ID:** OPTMODULES-01
- **Severity:** by-design
- **Detail:** Optional game modules are blocked by scope freeze. The engine authority for optional modules is unavailable.
- **Reason code:** SCOPE_FREEZE_AND_ENGINE_AUTHORITY_UNAVAILABLE

### Event-level state stepping is not available

- **ID:** EVENTSTEP-01
- **Severity:** technical
- **Detail:** The engine does not expose event-level state snapshots. Replay stepping operates at the command level.
- **Reason code:** EVENT_STATE_SNAPSHOTS_UNAVAILABLE

### Advanced Core has replay-only systems

- **ID:** ADVANCED-REPLAY-ONLY
- **Severity:** profile-scope
- **Detail:** In Advanced Core, the following systems are replay-only (not autonomously playable): complete-core, hidden-choice-supers, generated-effect-copy, sudden-death. Use Unrestricted Core for full autonomous play of these systems.

### Browser UI smoke and E2E certification require Chromium

- **ID:** BROWSER-TESTS-01
- **Severity:** environment
- **Detail:** scripts/browser-ui-smoke.mjs and scripts/browser-e2e-certification.mjs require a Chromium binary. Without it, they write FAIL reports. Do not leave orphaned processes running.

### Vendor engine directory may not be present in all workspaces

- **ID:** VENDOR-01
- **Severity:** environment
- **Detail:** The integration test for 121 certified replays skips gracefully when vendor/intrilex-engine-4.1.0/ is absent.

### Historical credential revocation requires operator evidence

- **ID:** SEC-01-HISTORY
- **Severity:** security-debt
- **Detail:** Earlier audits reported scripts/upload-key.cjs as credential-bearing. The October 1, 2026 scan found no occurrence in this non-shallow checkout or its locally reachable refs and no current-tree secret findings. Provider revocation and other remote refs, forks, caches, and clones remain unverified. Obtain provider rotation evidence; coordinate a history purge only where exposure is still reachable.

### Lookahead, Tournament, and Human-meta-proxy policy tiers are not yet established

- **ID:** POLICY-TIER-01
- **Severity:** evidence
- **Detail:** All 20 policies are classified as Fixture, Baseline, or Heuristic. No policy has been benchmarked to Lookahead, Tournament, or Human-meta-proxy tier. Claims are qualified by the highest established tier.

### No numerical card balance changes have been introduced

- **ID:** BALANCE-01
- **Severity:** design
- **Detail:** The balance investigation found that engine correctness and policy quality must be established before balance tuning. No card values, costs, or effects have been changed for balance reasons.

### Spectator mode uses NEUTRAL projection with a 50-spectator limit

- **ID:** SPECTATOR-01
- **Severity:** technical
- **Detail:** Spectators see a NEUTRAL projection of the game state — they do not see either player's authorized view. Spectator capacity is limited to 50 spectators per match.

### Bounded lookahead policy is NOT labelled "expert"

- **ID:** CERT-LOOKAHEAD-01
- **Severity:** evidence
- **Detail:** The bounded lookahead policy has not been benchmarked to justify an "expert" strength claim. The default evaluation function is a placeholder heuristic.

### WAIT WHAT is integrated; branching uses the specialized branches workspace

- **ID:** CERT-WAITWHAT-01
- **Severity:** technical
- **Detail:** Caster wires capture, investigation creation, annotation, authority-hash invalidation, and branch handoff in caster-workspace.js. Behavioral coverage is in v1.0.0-behavioral-play-journey.test.mjs. This integration does not establish human usability validation or live Ollama quality.

### Evidence-honest intelligence labels not displayed in all player-facing surfaces

- **ID:** CERT-EVIDENCE-DISPLAY-01
- **Severity:** technical
- **Detail:** Evidence-honest labels are computed by the statistics package but not yet displayed in every player-facing UI surface.

### Local TTS is not implemented

- **ID:** CERT-TTS-01
- **Severity:** technical
- **Detail:** Textual commentary is the validated contract. Local text-to-speech has been deferred.

### Human validation sessions documented but not yet conducted

- **ID:** CERT-HUMAN-VALIDATION-01
- **Severity:** manual
- **Detail:** The human validation protocol is documented in ROADMAP.md with measurement criteria, but actual sessions have not yet been conducted and recorded by the developer.

### Experiment run artifacts carry match summaries, not full replays

- **ID:** EXP-PORTABILITY-01
- **Severity:** technical
- **Detail:** Experiment campaign runs persist per-match summaries plus aggregate analytics in committed batches (IndexedDB runBatches). Full command transcripts are not retained for campaign games — matches are re-executable by seed + ordinal but are not stored replays. The research package manifest (intrilex-research-package) declares this: replayCoverage.gamesWithFullTranscript stays 0 and gamesReproducible counts seed-executable ordinals. Decision-evidence fidelity is grounded in the retained summaries themselves — FULL_DECISION_EVIDENCE is reported only when committed summaries provably carry decision-level capture, never from the strategicTrace request flag; when evidence cannot be inspected or trusted the run reports UNRESOLVED. Per-run fidelity is FULL_DECISION_EVIDENCE, SUMMARY_ONLY, NONE, UNRESOLVED, or MIXED at cohort level.
