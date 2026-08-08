# Intrilex Simulation Lab v0.24.2 — Invite Alpha Truth Closure II

A local, static-hostable deterministic match theatre, replay laboratory, rank anatomy observatory, decision intelligence system, counterfactual branch lab, mechanics atlas, synergy observatory, comparison system, evidence registry, batch simulator, and **interactive player experience** built on **Intrilex Engine v4.2.6** under **Official Rules v4.3.1** (K♠ Wild Sovereignty + Black Joker Board Lock Quick). The engine implements v4.3.1 semantics including Queen's Court legal-action generation, stack resolution, the corrected counter-target classification, K♠ Wild Sovereignty, and Black Joker Board Lock as a Quick Effect. Complete Advanced and Unrestricted Core are supported. Save format v2 with full-envelope integrity binding. Session ownership prevents duplicate-tab conflicts.

## What changed

v0.22.0 introduces **Tournament Evolution & Player Profile** — AB/BA seat-swap fairness for best-of series, third-place consolation match, post-tournament analytics (upsets, sweeps, bracket efficiency), tournament persistence to IndexedDB with resume capability, auto-play mode, tournament export. Player profile deepened with complete AI ratings for all 19 policies, rating history chart, archetype breakdown, 3 new badges (Tournament Champion, Bracket Buster, Tactician), and a new `/profile` observatory workspace. AI commentary system adds tactical board-state commentary, post-match analysis paragraphs, and doubled context-aware banter pools (early/mid/late-game, close-game, dominating, comeback variants).

v0.16.1 is a **verification and repair release** that certifies the Rank Anatomy functionality from v0.16.0. Key changes: resolved Rank 2 semantics (distinct play form, not printed effect), consolidated duplicate analytics implementations (deleted browser-rank-analytics.js), reverted unauthorized schema version bump (4.2.0 → 4.1.0), fixed CI stage discrepancy (added package-smoke-tests to ci.sh), created 29 attribution fixture tests, completed real browser certification (27/27 tests pass with Chrome), and fixed mobile viewport overflow.

v0.16.0 introduced the **Rank Anatomy Observatory** — a decomposed analytics system that separates each rank's performance into ordinary baseline, mechanically distinct Spades variant, individual Super declarations, and individual Super effect components. The release includes a canonical Rank Anatomy registry artifact (15 ranks, 13 Spades variants, 9 Super effects), variant analytics wired into the deterministic build (schema 4.1.0), an anatomy rail UI with Overall/Ordinary/Spades/Supers/Evidence tabs, Super declaration funnels, effect dossiers, contribution decomposition, frequency-potency tables, and origin filtering.

v0.15.0 introduced the **Play module** — a full interactive player experience that lets humans play against the AI policies previously only observable in the Observatory. The Play module is lazy-loaded via dynamic import, keeping the initial bundle size unchanged for Observatory-only users. Features include a 13-chapter First Contact tutorial, Play vs AI (easy/normal/hard/nightmare), a local replay library with certified verification, and IndexedDB save/resume with autosave and quarantine.

v0.14.1 introduced the Truth & Reliability Patch — Engine Integrity Hotfix (v4.2.6: Mimic 10♦ attachment severance), Causal Telemetry Repair (schema v4.1.0), Honest Rank Intelligence (missingness-aware axes, ORV rename, balance watchlist gating), Matched AB/BA Experiments (paired McNemar test, paired bootstrap), Truthful Status and Evidence UI, and Single-Source Release Truth.

v0.14.0 introduced the Landing Page — a hero-style entry point with three destinations: **Play**, **Rules**, and **Sim**. The landing page uses the same design tokens but with a dramatic, spacious hero aesthetic distinct from the dense observatory UI.

v0.13.0 introduced Advanced Continuations — 10♣ Foundation, ⭐2 Hold, Voltage 3/4, Voltage 5 Refine, and special scoring riders are now fully implemented. Hidden Super branches (⭐3/5/6/7), generated effect copy, and Sudden Death remain fail-closed.

v0.12.0 introduced 10♦ Mimic Closure — the 10♦ Mimic effect is now fully implemented for ⭐4 (Row Exchange), ⭐8 (Absolute Scuttle), and ⭐J (Tempo Force). Solo mimic supports ranks 3–7; paired mimic (with a Two) extends to A, 3–7, 8, J. Complex private-choice mimic effects (⭐3, ⭐5, ⭐6, ⭐7, ⭐A) remain fail-closed.

v0.11.0 introduced the Rank Power Observatory — a dedicated analytics workspace for understanding how each of the 15 canonical ranks performs in actual play, with evidence-linked observed performance, counterfactual decision value, and cohort-relative power profiles.

> HYBIX action envelope → lifecycle isolation → trace shard loading → branch fixtureId → diagnostics stale closure → hidden-info proof → version truth

### New in v0.10.2

- **HYBIX Action Envelope Fix (BL-04)** — `choosePolicy` now resolves HYBIX `{actionId, metadata}` envelope to canonical action before runtime access
- **Lifecycle Isolation (BL-05)** — `matchId` computed before decision loop; fresh `executionInstanceToken` per run; complete deterministic context passed to HYBRIX adapter
- **Trace Shard Loading (BL-07)** — `renderTraces` now loads shard files via `ensureTraceShardsLoaded` instead of reading empty `r.traces` from index
- **Branch fixtureId Fix (BL-08)** — `renderBranches` and `runPairedCounterfactual` use `fixtureId` from lab-replay-index, not undefined `matchId`
- **Diagnostics Stale Closure Fix (BL-09)** — Run button reads current selector values from DOM at click time
- **Smoke Opponent-Hand Fix (BL-10)** — smoke test sets viewer to P1, uses correct `.card-token` selector, checks P2 hand zone
- **Integrity Badge Conditioning (BL-23)** — Watch "Verified" badge and integrity dialog status now conditional on actual artifact hashes
- **Version Truth (BL-12)** — integrity dialog uses capability manifest version, not hardcoded 0.10.0

### Preserved from v0.10.1

- **Hidden-Information Lockdown** — draw-pile card identities and RNG seeds stripped from all public/player views; browser cardToken hides draw-pile unless judge mode; 12-test privacy matrix
- **Campaign Accounting Truth** — three-state campaignStatus (PASS/PARTIAL/FAIL); mutually exclusive terminal categories; accountingInvariant check; campaign-accounting.json output
- **HYBRIX Cross-Run Isolation** — runInstanceId passed to policy context; 10-test evidence-envelope matrix (repeat/interleave/worker/self-play/provenance/determinism)
- **Browser Policy Parity** — all 19 policies (5 baseline + 14 HYBRIX) now available in browser; HYBIX agent modules ported with import rewriting
- **Self-Audit Truth** — v1.0.0 PASS/94 with false gates rejected; regenerated as v2.0.0 with all gates true and executable evidence
- **Diagnostics Positive Fixtures** — 31 decision trace files verified as positive evidence; diagnostics pipeline tested end-to-end

### Preserved from v0.10.0

- **Decision Evidence Contract v2** — lossless decision traces with actual policy-emitted candidate scores, selection metadata, and evidence-derived rule audits
- **Paired Counterfactual Branch Lab** — one-request paired experiments with verified decision anchors, matched continuation streams, and focal-seat utility
- **Policy Diagnostics** — instrumented diagnosis with normalized decision fields, loaded decision evidence, and unavailable-vs-zero distinction
- **HYBIX Domain-Native AI** — Intrilex-native cognition with run-instance isolation, deterministic replay, and trace transport
- **Seat-Balanced Benchmarking** — named-policy attribution with accounting invariants and self-play exclusion
- **Campaign Reliability** — structured failure preservation, no silent error filtering

### Preserved from prior versions

- Twelve evidence-linked workspaces: Watch, Replays, History, Mechanics, Card Faces, Synergies, Ranks, Compare, Traces, Branches, Diagnostics, Evidence
- Ordinary Pass is unavailable. The only gameplay Pass is the forced Exhausted Pass under its exact legality condition
- Complete First Contact and bounded Advanced Core support
- All canon corrections remain intact

## Evidence snapshot

- Engine authority and Lab regression suites: run with `pnpm run engine-patch:test` and `pnpm test`
- Governing compatibility replays: **121**
- Semantic Pass/Priority fixtures: **25**
- Decision intelligence tests: **1474 tests across 73 test files** (see `pnpm test` output for current count; generated by self-audit)
- Canon audit: per-match checks for Pass, response timing, Stack Theft targets/skips, and 3 Red Queen defense
- Mechanic attribution: per participant; synergy input uses one primary mechanic per decision
- Worker parity: **1, 2, and 4 workers plus clean rerun**
- Browser: Node ↔ Chromium main ↔ Web Worker parity
- CI: **96 stages** (see `scripts/ci.mjs` for the canonical stage list; `ci.sh` delegates to `ci.mjs`)

## Run

```bash
pnpm install --offline --frozen-lockfile
pnpm run dev
```

```bash
pnpm run cli -- match --profile core-advanced-authority --seed 123 --p1 score-rush --p2 control
pnpm run cli -- campaign --profile core-advanced-authority --matches 100 --workers 4 --p1 tempo --p2 value
```

## Verify

```bash
pnpm run ci          # full pipeline (vendor, build, all tests, parity, a11y)
pnpm run test:decision-intelligence  # decision trace, counterfactual, policy diagnostics
pnpm run test:build-determinism
pnpm run release:verify-extracted
```

## Scope

Complete First Contact, bounded two-player Advanced Core, and **complete Unrestricted Core** are all supported and human-playable. Unrestricted Core includes hidden super branches, generated effect copies, 10♦ Mimic, and Sudden Death. Modules and multiplayer remain blocked by design.

## Landing Page

Open `#/` in the browser application to see the hero landing page with three destinations:

- **Play** (`#/play`) — interactive player experience: First Contact tutorial, Play vs AI (easy/normal/hard/nightmare), local replay library with certified verification, and online Direct Duel lobby. Online 1v1 Direct Duel is SUPPORTED via Network Authority. Tournament workspace is SUPPORTED with bracket play, AB/BA seat-swap, and post-tournament analytics. The canonical 3–4 player Multiplayer rules module is BLOCKED (`SCOPE_FREEZE_AND_MULTIPLAYER_AUTHORITY_UNAVAILABLE`).
- **Rules** (`#/rules`) — the complete player rulebook with stylized typography, sticky table of contents, and collapsible parts
- **Sim** (`#/sim`) — the mechanics observatory with rank anatomy, analytics, traces, branches, diagnostics, and evidence (alias for `#/watch`)

The landing page uses a dramatic, spacious hero aesthetic with animated aurora background, distinct from the dense observatory UI. All existing workspace routes (`#/watch`, `#/replays`, etc.) continue to work unchanged.

## Play Module

Open `#/play` in the browser application to play against the AI. The Play module is lazy-loaded via dynamic import, keeping the initial bundle size unchanged for Observatory-only users.

- **First Contact Tutorial** (`#/play/tutorial`) — a 13-chapter interactive tutorial covering core mechanics: goal and secured points, drawing, playing for points, effects and scuttle, mini-turns, the shared swap bar, the stack, response windows, automatic priority, card inspection, and save/resume.
- **New Game vs AI** (`#/play/new`) — configure a match with profile selection (First Contact, Advanced Core), seat selection (P1, P2, Random), AI difficulty (easy, normal, hard, nightmare), and manual seed input.
- **Replay Library** (`#/play/replays`) — browse completed matches, watch replays, export private/public replays, delete replays, and verify certified replay hashes.
- **Save/Resume** — IndexedDB persistence with autosave, manual save, continue from hub, import/export saves, and quarantine for corrupt saves.

The Play module includes a privacy system that validates snapshots, scans the DOM for hidden information leaks, sanitizes public replays, and performs differential privacy checks.

## Card Face Renderer

Open `#/cards` in the browser application to inspect suit-specific card faces in Board, Lite, and Full Zoom modes. All 54 canonical cards (A, 2–10, J, Q, K across four suits plus Red Joker and Black Joker) are canonically registered under rules v4.2.0. See `docs/CARD_FACE_RENDERER.md`.
