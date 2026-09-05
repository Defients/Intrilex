# Changelog

## v1.0.0 — Certified Public Baseline

This is a certification release, not a feature release. It establishes that everything built in v0.28.1 → v0.32.0 is stable and trustworthy.

### Certification Gates

Six-domain certification framework (`scripts/certification-gates.mjs`) verifying:

- **Rules & Engine**: version agreement across all surfaces, no known P0/P1 defects, canon determinism, engine adapter legal action enumeration, balance findings rerun.
- **Local Player Experience**: Academy onboarding, HYBRIX AI matches, save integrity with compatibility checking, replay system, puzzle ladder, accessibility suite, bounded lookahead AI.
- **Online Experience**: ranked season lifecycle, auth/reconnect, matchmaking, spectator projection, abandonment handling, durable persistence, backup, monitoring, moderation, privacy tests, tournament infrastructure.
- **Laboratory**: stable deterministic beat IDs, evidence-honest intelligence, report reproducibility, stale-conclusion invalidation, commentary contract, brain topology.
- **Release Engineering**: clean-room verification, deterministic build, CI, secret scan, release identity, engine manifest, self-audit PASS, capability truth, test accounting, version surface agreement.
- **Human Validation**: protocol documented with measurement criteria, Academy and investigation workflow supporting the session types.

### Acknowledged Limitations at Certification

- Lookahead is not labelled "expert"
- WAIT WHAT workflow is pure-function, not wired into CasterSession
- 2D brain topology is not the default renderer
- Evidence-honest labels not displayed in all player-facing surfaces
- Local TTS not implemented
- Human validation sessions documented but not yet conducted
- Pre-existing secret scan finding from commit `8dbdde7`

### New Files

- `scripts/certification-gates.mjs` — six-domain certification gate runner
- `test/v1.0.0-certified-baseline.test.mjs` — 49 certification tests


## v0.32.0 — Intelligence, Better AI, and Replay Caster v1

- **Bounded lookahead policy**: deterministic minimax search with fixed node/time budgets, opponent response sets, evaluation separated from search, and a benchmark suite. The policy is NOT labelled "expert" — benchmark evidence must justify that claim.
- **Replay Caster commentary contract**: fact-level authorization, versioned prompt provenance, deterministic fallback labels, and malformed-stream handling. Commentary never asserts facts not authorized by the replay/view data.
- **WAIT WHAT investigation workflow**: complete lifecycle (bookmark → preserve context → inspect alternatives → branch → compare → annotate → export) with automatic invalidation on authority hash change.
- **Brain topology formalization**: the Brain's job is now formally defined as a mechanic/evidence topology explorer, with a complete 2D SVG equivalent that requires no WebGL.
- **Evidence-honest player intelligence**: uncertainty labels, sample-size disclaimers, season/version boundaries, and human vs AI distinction. Player intelligence displays are now evidence-honest.
- New modules: `packages/game-ai/src/bounded-lookahead.mjs`, `packages/replay-caster/src/commentary-contract.mjs`, `packages/replay-caster/src/investigation-workflow.mjs`, `apps/lab-web/src/brain/brain-topology.mjs`, `packages/statistics/src/evidence-honest.mjs`.
- Tests: `test/v0.32.0-intelligence-caster.test.mjs` (59 tests).


## v0.31.0 — Competitive Operations

### Added

- **Tournament check-in & admin correction** — New pure tournament
  operations module (`tournament-operations.mjs`) with check-in
  lifecycle, withdrawal with deterministic reseeding, check-in-gated
  tournament start, admin result correction, player disqualification,
  match voiding, and structured audit entries with before/after
  snapshots. All operations preserve immutable-update conventions.
- **Ranked disconnect/abandonment handling** — New abandonment tracker
  (`abandonment-handler.mjs`) with configurable grace period (default
  60s), minimum turn threshold before forfeit (default 4), state
  machine (CONNECTED → GRACE_PERIOD → FORFEIT_PENDING → FORFEITED /
  RESUMED), server-authoritative forfeit result construction, and
  serializable state for recovery. Reconnect cancels forfeit.
- **Delayed broadcast buffer** — New broadcast module
  (`delayed-broadcast-buffer.mjs`) with configurable delay (default
  30s), FIFO buffer with capacity eviction, public vs judge projection
  types, caster handoff registry (one-caster-per-match invariant),
  caster transfer, and bracket-to-broadcast navigation link builder.
- **Social safety moderation service** — New moderation module
  (`moderation-service.mjs`) with report filing (6 reason categories),
  report review/action workflow, mute management with lazy expiry,
  display-name validation (length, charset, leet-speak profanity
  normalization, impersonation prevention), moderator audit log, and
  full serialization for persistence.
- **DB migration framework** — New migration runner
  (`migration-runner.mjs`) with version tracking table, migration
  registration and validation, ascending pending execution with
  per-migration transactions, rollback by version, rollback-to-target,
  status queries, and error wrapping with applied-before-failure
  context.
- **Monitoring dashboard endpoint** — New `/api/status` HTTP endpoint
  on the match server exposing detailed health metrics (active matches,
  connections, queue size, memory, event counters, auth/persistence
  state) for monitoring dashboards. Existing `/health` and `/metrics`
  remain sanitized for public exposure.
- **v0.31.0 test suite** — 57 new tests covering tournament check-in,
  withdrawal, admin correction, disqualification, match voiding, audit
  log, abandonment tracking, forfeit computation, result record
  building, broadcast buffer, caster handoff, bracket navigation,
  moderation service, display-name validation, migration runner, and
  monitoring endpoint.

### Changed

- Product version bumped from 0.30.0 to 0.31.0
- All workspace package versions bumped to 0.31.0
- Release identity, engine manifest, capability truth, and feature
  matrix regenerated for v0.31.0

## v0.30.0 — Player Experience

### Added

- **Game-start experience overhaul** — Rule profiles now have full
  player-language explanations with active systems and recommended
  audience. AI difficulty tiers show descriptions (Easy: forgiving,
  Hard: skilled, Nightmare: ruthless). Seed controls are hidden under
  an "Advanced options" disclosure. A resume prompt appears when a
  saved match exists. Compatibility warnings surface for old
  saves/replays.
- **Card Inspector educational bridge** — The inspector now shows
  protection and targeting status chips (Aegis, Guard, Tapped,
  Exile-Bound, Attachment). Unavailable action reasons include
  detailed text and rule references. Learning links connect each card
  to Academy lessons, Puzzle Ladder practice, and Rank Anatomy.
- **Academy explanation-first completion** — Foundations and Mechanics
  tier lessons now use OBJECTIVES completion mode: players demonstrate
  understanding of the mechanic without needing to win the match.
  Applied Play tier uses OBJECTIVES_AND_WIN for both demonstration and
  victory. A new `markUnderstood()` method on AcademyController allows
  explanation-first completion.
- **Puzzle → lesson recommendations** — The Academy hub now shows
  recommended lessons based on puzzle performance. When a player
  struggles with a puzzle (2+ failed attempts), the corresponding
  Academy lesson is recommended with a contextual reason.

### Changed

- 8 lessons switched from WIN to OBJECTIVES completion mode
- 2 lessons switched from WIN to OBJECTIVES_AND_WIN completion mode
- AI personality cards now show description text alongside archetype name
- Profile explainer updates dynamically when switching rule profiles

## v0.29.0 — Product Truth & Release Candidate

### Added

- **Generated capability truth** — A single machine-readable capability
  contract (`config/capability-truth.json`) now generates the feature
  matrix, known limitations, and README truth sections. Run
  `pnpm run capability:generate` to regenerate.
- **Three-lane navigation** — The observatory navigation is reorganized
  into three product lanes: **Play** (local, ranked, tournaments,
  replays), **Learn** (academy, puzzles, rules, card reference), and
  **Lab** (watch, caster, mechanics, ranks, evidence, traces, branches,
  diagnostics). An **Account** section groups profile, achievements,
  release notes, settings, and auth.
- **Feature matrix** — `docs/FEATURE_MATRIX.md` is auto-generated from
  the capability truth and documents all profiles, network features,
  product lanes, and limitations in a single place.
- **Product truth test suite** — 12 tests verify capability truth
  consistency, three-lanes navigation, and documentation drift prevention.

### Changed

- **README rewritten** — Replaced stale version prose (going back to
  v0.10.0) with a concise, current summary generated from capability
  truth. The new README accurately describes ranked matchmaking,
  accounts, seasons, tournaments, and all current capabilities.
- **KNOWN_LIMITATIONS.md regenerated** — Now auto-generated from the
  capability truth with accurate, categorized limitations.
- Version surfaces updated to 0.29.0.

### Removed

- Stale version prose from v0.10.0 through v0.16.1 in README.md.
- Old "Analysis/Investigation/System" navigation sections replaced by
  the three-lane organization.

## v0.28.2 — Evidence Recalibration

### Added

- **Evidence epoch tagging** — Every match, trace, and report now carries
  `evidenceEpoch`, `postRulesParityRepair`, `authorityHash`, and
  `releaseIdentityHash` metadata. This prevents evidence from different
  engine and policy epochs from being silently mixed.
- **Policy-strength tiers** — All 20 policies are classified into tiers
  (Fixture, Baseline, Heuristic). Lookahead, Tournament, and Human-meta
  proxy tiers are declared but not yet established. Claims are qualified
  by tier; no policy is called "experienced" or "expert" without
  benchmark support.
- **Self-play exclusion** — Self-play matches (same policy in both seats)
  are now flagged with `isSelfPlay` and excluded from cross-policy
  superiority aggregates in campaign analytics.
- **Experiment preset infrastructure** — Seven experiment presets
  (`config/experiments/EXP-01` through `EXP-07`) with reproducible
  specifications, hypothesis, independent variable, metrics,
  falsification criterion, and prerequisite gates.
- **Experiment runner** — `scripts/run-experiment.mjs` executes
  experiment presets against the repaired engine, producing
  evidence-epoch-tagged results with admissibility disclosure.
- **Seven post-repair experiments** — All seven proposed experiments
  executed against the repaired engine:
  - EXP-01: 2B2R Ultra hold-vs-fire policy ablation
  - EXP-02: Black Joker Board Lock lead-vs-comeback
  - EXP-03: 10♥ Tempo Spike opportunity cost
  - EXP-04: Queen Fortress breach window
  - EXP-05: 4♠ Total Clear rebound analysis
  - EXP-06: Unrestricted seat-balance benchmark
  - EXP-07: Counter retention value calibration
- **Post-repair balance report** — `reports/balance-check-v0.28.2/`
  contains the evidence recalibration report with missingness display,
  invalidated-conclusion flags, and admissibility disclosure.
- **Evidence epoch UI** — The `/evidence` workspace now shows evidence
  epoch metadata, policy-strength tiers, and admissibility disclosure.
- **Experiment preset selection** — The experiment controls panel now
  includes a preset dropdown for reproducible experiment configuration.

### Changed

- Version surfaces updated to 0.28.2.
- Campaign semantic object now includes `evidenceEpoch`,
  `postRulesParityRepair`, `authorityHash`, and `releaseIdentityHash`.
- Campaign aggregate now includes epoch fields and `selfPlayExcluded` flag.
- Match summaries now include `evidenceEpoch`, `postRulesParityRepair`,
  `authorityHash`, and `isSelfPlay` fields (excluded from matchResultHash).
- Run provenance now includes `evidenceEpoch` and `authorityHash`.

## v0.28.1 — Rules-Parity Hotfix

### Fixed

- **IMPL-01: Special scoring riders** — Seven (7♣), 10♣, and Black Joker
  are no longer incorrectly rejected for scoring in Advanced and Unrestricted
  Core profiles. The fail-closed Advanced/Unrestricted rejection was removed
  from both the resolver and the enumerator.
- **IMPL-12: Declaration-class counter matrix** — Base Ace, A♠, and K♠
  counter authority now operates on declaration classes rather than
  restricting to only primary `ordinary-effect` declarations. Preserved
  constraints: Base Ace cannot counter A♠, Ultras, Sudden Death, Anchors,
  or Goal-Mods; A♠ retains source validation and multi-card target
  requirement; K♠ retains multi-card requirement and Ultra rejection.
- **DEG-01: Sudden Death** — repaired recipe validation (RJ+BJ or
  four-of-a-kind), target selection (Vulnerable enemy OTT card), timer
  initialization (counter set to 2), countdown (ticks at Full-Turn
  boundaries, excluded from activation Full Turn), and terminal behavior
  (`SUDDEN_DEATH_RESOLUTION` terminal reason added).
- **IMPL-03: ⭐6/⭐7 choice enumeration** — Super Dig and Sequential
  Topdeck candidates are now enumerated with executable declarations.
  Post-declaration choices flow through the existing private-choice
  lifecycle.
- **IMPL-04: 10♦ Mimic destination** — source card is now marked
  Exile-Bound and moves to Exile (not GY) after effect resolution.
  Expanded legal mimic menu to include solo rank-4, rank-5, rank-7,
  and paired rank-8, rank-J modes.
- **POL-A1: Solo Wild and Wild Sovereignty AI valuation** — added
  context-aware scoring for Solo Wild Copy (recipe awareness, Commandeer
  preservation) and Wild Sovereignty (Exile cost discounting, counter
  preservation).
- **POL-A2: Reactive card retention awareness** — added retention
  penalties for 8 Scuttle Counter, 9 Tap, and J Disrupt when the current
  threat doesn't justify spending them.
- **POL-A3: 3-Red Ultra heuristic** — replaced flat +300 bonus for all
  advanced families with context-dependent scaling based on opponent
  pressure and own progress.

### Changed

- Regenerated autonomy campaign, observatory analytics, decision traces,
  and replay artifacts from the clean post-repair engine epoch.
- Reconciled engine manifest and release identity with current codebase.
- Updated all version surfaces to 0.28.1.

## v0.28.0 — UX/Visual Polish & Social Graph

### Added

- **Player directory workspace** — browsable directory of players with
  recent-opponents, rivals/follows/blocks social graph (migrations 0013/0015/0016),
  backed by `@intrilex/account-domain/relationships` scoring.
- **Leaderboard overlay** — leaderboard rows integrated into the play hub with
  rank glyphs and tier/division projection.
- **Players & leaderboard overlays** wired into the SPA with offline/unavailable
  states and OAuth-gated access.
- **Puzzle mode experimental route** (`/dev/puzzles`) — engine-true puzzle
  runtime with generated fixtures, surfaced as a dev-only surface ahead of a
  player-facing Academy promotion.
- **SEO metadata centralization** — canonical SEO metadata management and
  homepage rebrand from "Lab" to game identity.
- **Pre-alpha notice overlay** and auth/settings workspaces enabled.

### Changed

- **Game Log panel overhaul** — entries now render with actor badges
  (P1=blue, P2=purple, SYS=amber), event-type icons per category, color-coded
  left-border accents, alternating row backgrounds, and a fade-in animation on
  new entries. Skin themes (light, cosmotech, corrupture) updated with matching
  badge/icon/accent overrides.
- **OAuth flow improvements** — guest→permanent migration is now detected on
  page load after an OAuth redirect, preserving progress for converting guests.
- **Network lobby UI polish** — versus cards, ranked "Find Match" featured card,
  queue waiting screen with live queue clock, server-reachability status.
- **Match config diagnosis on bootstrap** — structured warnings when
  `__INTRILEX_CONFIG__` is missing or incomplete in production.

### Fixed

- **Game Log CSS class mismatch** — skin themes targeted `.rd-game-log-entry`
  but HTML rendered `.rd-log-entry`; all 3 skin blocks corrected.
- **Game Log event count capped at 10** — `play-controller` sent only 10
  events to the renderer instead of 40; fixed to `slice(-40)`.
- **Game Log `PRIORITY_PASSED` miscategorization** — the `PASS` substring in
  `PRIORITY_PASSED` matched the `phase` category before the `priority` check;
  reordered category checks so priority is evaluated first.
- **Matchmaking stale-entry supersede** — a stale queue entry from a previous
  connection is now superseded instead of stranding the player in
  `ALREADY_IN_QUEUE` retry loops; reconnect flow hardened.
- **Network lobby UI flashing** and opponent-status display races in
  multiplayer matches resolved.
- **Player directory `ORDER BY` type mismatch** — split `ORDER BY CASE` to
  avoid bigint/text type mismatch on Supabase.

### Tests

- **Game Log regression tests** — 12 new tests in `v0.28-pvp-experience.test.mjs`
  covering `categorizeEvent`, `PRIORITY_PASSED` ordering, actor badges,
  `data-event-category`, event-type icons, `rd-log-new` animation, event count
  fix, and CSS accent/animation presence.
- Achievements package added to `tsc` typecheck scope.
- `terminal-outbox.sqlite` and supabase CLI `.temp` scratch files gitignored.

## v0.27.4 — Network Session Reliability Fixes

### Fixed

- **`reconnect()` socket leak on server error** — when `reconnect()` received
  an ERROR response (e.g. MATCH_NOT_FOUND), the WebSocket stayed open and
  `state.networkSession` held a broken session with an active socket. Now
  `reconnect()` calls `disconnect()` to close the socket and clean up
  listeners, then transitions back to ERROR so the caller can still detect
  the failure.
- **`ALREADY_IN_QUEUE` retry timer not clearable** — the `setTimeout` for
  auto-retry was anonymous, so navigating away before the delay expired
  could race with a new queue flow. The timer ID is now stored and cleared
  on socket close.

### Changed

- **`_sendAuthenticate` and `refreshAccessToken` error logging** — both
  methods previously swallowed all errors silently. Now they emit a
  `console.warn` with the error message, improving debuggability without
  changing behavior.

### Tests

- Added 2 source-level regression tests in
  `test/network-ux-integration.test.mjs`:
  - "reconnect() disconnects socket on ERROR response"
  - "ALREADY_IN_QUEUE retry timer is stored and clearable"

## v0.27.3 — Matchmaking Block-Rejection Reliability Fix

### Fixed

- **`handleQueueJoin` block-check catch path** — when `blockChecker` threw an
  error, only the joining player was notified and the orphaned match was left in
  the store. The partner received `QUEUE_MATCHED` and was stuck waiting. Now the
  catch path fails closed identically to the blocked path: both players are
  notified with `BLOCKED_BY_PLAYER`, the match is deleted, and both connections
  are unbound.
- **Stale connection state after block rejection** — both the blocked and
  fail-closed paths now clear `participantId`/`matchId` on both connections so
  neither player is left bound to a deleted match. Previously the connections
  retained stale match bindings, causing confusing errors on subsequent actions.

### Changed

- **`MatchmakingQueue` `blockChecker` JSDoc** — corrected misleading
  documentation that claimed the queue itself skips blocked pairs. The queue
  accepts the option for injection-point compatibility but never invokes it;
  block enforcement is performed by the match server's `handleQueueJoin` after
  pairing.

### Tests

- Added two behavioral regression tests in
  `test/forensic-phase2-remediation.test.mjs`:
  - "blocked matchmaking pair notifies both players and deletes match"
  - "blockChecker throw fails closed — both players notified, match deleted"
  Both verify that both players receive `BLOCKED_BY_PLAYER`, the match is
  deleted, and connections are unbound (proven by successful re-queue).

## v0.27.2 — Homepage Revamp: Zero-Overflow Layout & Visual Polish

### Summary

Complete redesign of the Intrilex landing page for a 1920×1080 viewport at
100% zoom with zero vertical scrollbar. The page now fits entirely within the
viewport height with no overflow. Every surface, interaction, and motion cue
has been elevated to feel deliberate and high-end.

### Layout

- **Viewport-locked shell** — `.landing-app` locked to `100dvh` with
  `overflow:hidden`. No vertical scrollbar at 1920×1080.
- **Two-column content grid** — play panel (dominant left) + secondary rail
  (right), vertically centered.
- **Rail reorganized into 2-column card grid** — What's New | Rules, Ranking
  System (full width), Players | Leaderboard, Official Forums (full width).
- **CONTINUE DUEL moved to header** — compact pill button in the topbar with
  contextual metadata (turn + score), collapses when no save exists.
- **Hero card sized to content** — no longer stretches to fill the viewport;
  scaled to 125% natural height for visual dominance over the rail.

### Visual Polish

- **Crest softened** — opacity reduced 25%, mask shifted to dim upper region
  while preserving the bottom taper. No longer competes with PLAY NOW.
- **Rail card differentiation** — Rules + Ranking System are strongest
  secondary destinations (full accent, larger text); Players + Leaderboard
  are explicitly paired (shared violet); What's New + Forums have reduced
  prominence (muted, smaller, slight opacity reduction).
- **Mode selector glow calmed** — selected state uses muted cyan instead of
  bright cyan, reserving the most luminous treatment for the CTA. Clear
  choose → commit visual sequence.
- **Logo scale increased ~14%** — brand establishes itself before PLAY NOW
  takes over without becoming a giant masthead.
- **Cyan/violet color language unified** — What's New gold accent removed,
  play panel top hairline switched from amber to violet tint.
- **Footer contrast increased** — muted-bright text, stronger background.
- **Rail text brightened** — body text upgraded from `--muted` to
  `--muted-bright` for legibility at scale.

### Hero Copy

- "exactly-when spending" → "perfectly timed commitment"
- Removed redundant "Every decision matters." from tagline
- Removed redundant "Choose your mode. Make every decision count." subline
  (mode-specific sublines still appear on selection)

### Reliability Fixes

- **CSS animation fill-mode bug** — rail card entrance animation used `both`
  fill-mode, retaining `transform:translateY(0)` and overriding `:hover`
  transforms. Fixed to `backwards`.
- **Document click listener leak** — `bindLandingEvents` accumulated
  `document.addEventListener('click')` on every re-render. Fixed with
  `AbortController` pattern.
- **`loadContinueCard` race condition** — async import/listSaves could write
  to a detached slot after navigation. Added `isConnected` guard.
- **`showPreAlphaOverlay` timer** — could fire on wrong route after
  navigation. Added `landingContainer.isConnected` guard.
- **Safari compatibility** — added missing `-webkit-backdrop-filter` prefixes.

### Files Changed

| File | Change |
|------|--------|
| `apps/lab-web/src/css/landing-revamp.css` | New override layer: viewport lock, topbar, hero, play panel, rail grid, footer, animations, responsive guards |
| `apps/lab-web/src/styles.css` | Import `landing-revamp.css` |
| `apps/lab-web/src/app.js` | Continue slot moved to header, rail card reorder, `loadContinueCard` compact button, `bindLandingEvents` AbortController, race condition guards, hero copy updates |
| `test/landing-page.test.mjs` | Updated rail order test, added regression tests for fill-mode, listener leak, race conditions, Safari prefixes |

## v0.27.1 — Pre-Deploy Polish & UX Consistency

### Summary

Final polish pass before live deployment. No new features — all changes are
enhancements to existing UI: layout fit, visual consistency, accessibility,
and test reliability.

### Online Lobby (`#/play/online`)

- **No-scrollbar layout for 1920×1080** — compacted spacing throughout (hero,
  grid, server-info, features, notice) and added a wide-screen `@media
  (min-width: 1200px)` breakpoint that switches the bento grid to a 4-column
  single row with vertical centering (`min-height: 100vh; flex; justify-content:
  center`). Content height dropped from ~1100px (overflow) to ~580px.
- **Find Match (Ranked) premium card** — replaced the green accent with the
  game's gold ranked identity (`--tcg-goal: #d8b25c`). Added an animated
  gradient border, shimmer sweep, pulsing trophy icon, "RANKED" gold badge
  (top-right, fades on hover), and enhanced hover glow. Updated description to
  "Climb the ranked ladder."
- **Beautified hover arrows** — moved from bottom-right to top-right, enlarged
  to 32×32px circular pills with per-card accent colors (cyan, violet, gold,
  purple). Smooth scale+translate entrance animation. RANKED badge fades out
  on hover to make room.

### Sign In Overlay

- **Replaced "IX" text glyph with `intrilex-icon.png`** across all three auth
  states (unconfigured, authenticated/guest, signed-out). Added explicit
  `width="56" height="56"` attributes to prevent layout shift.

### Leaderboard Overlay

- **Beautified dropdown menus** — replaced flat fallback colors with real
  design tokens (`--surface-2`, `--border`, `--text`, `--cyan`). Added
  gradient background, custom cyan SVG dropdown arrow (via `appearance: none`),
  hover/focus states with cyan glow ring, and themed `<option>` backgrounds.

### Back Button Consistency (app-wide)

- **Standardized all 5 back button variants** to a unified pill style:
  999px border-radius, dark glass background (`rgba(12,24,34,0.8)` +
  `backdrop-filter: blur(8px)`), `--border-soft` border, 13px/600 text,
  cyan hover (border + text + `translateX(-2px)` slide), gold focus ring
  (`:focus-visible`), active reset.
- Affected classes: `.back-button`, `.play-hub-back`, `.play-setup-back`,
  `.rd-header-back`, `.legal-back-home`.
- Added missing `:focus-visible` to `.back-button` in `pages-polish.css`.
- Added reduced-motion overrides for new hover transforms.

### Test Reliability

- **Fixed stale `browser-contract` test** — was hardcoded to `v0.24.2` in a
  regex; now reads `package.json` version dynamically. This was a pre-existing
  regression from the v0.27.0 version bump.
- **Fixed `network-lobby-ui` test** — updated card-count regex to tolerate
  extra classes on the featured Find Match card (`network-lobby-card-featured`).

### Files Changed

| File | Change |
|------|--------|
| `apps/lab-web/src/play/play-v3.css` | Lobby layout, Find Match card, hover arrows, back buttons, reduced-motion |
| `apps/lab-web/src/play/network/network-lobby-renderer.mjs` | Find Match card HTML (featured class, ranked badge, shimmer, trophy icon) |
| `apps/lab-web/src/play/ranked-duel.css` | `rd-header-back` standardized to pill |
| `apps/lab-web/src/css/feature-components.css` | `.back-button` hover/active, `.legal-back-home` pill, leaderboard select override |
| `apps/lab-web/src/css/pages-polish.css` | `.auth-glyph` overflow + `.auth-glyph-icon`, `.back-button` focus-visible |
| `apps/lab-web/src/play/ranked/leaderboard.css` | `.lb-select` / `.lb-search` beautification |
| `apps/lab-web/src/workspaces/auth.js` | `intrilex-icon.png` image with dimensions |
| `test/browser-contract.test.mjs` | Dynamic version in product-identity test |
| `test/network-lobby-ui.test.mjs` | Flexible card-class regex |

## v0.27 — Online Lobby Streamline & Beautification

### Summary

Removes the redundant "Match History" card from the Online Direct Duel lobby
(the homepage's Match History overlay already covers local match history) and
revamps the lobby layout into a cleaner 2-column bento grid with a feature-pill
row. No gameplay, engine, or server-protocol changes.

### Online Lobby (`#/play/online`)

- **Removed** the "Match History" card, the `#/play/online/history` route, the
  `renderNetworkMatchHistory` renderer, and the `renderNetworkHistoryFlow` /
  `bindHistoryActions` controllers in `play-app.js`. The server-side
  `MATCH_HISTORY` protocol and match-store `listMatches` remain available for
  API/spectator clients.
- **Revamped bento grid** — switched from a 3-column grid (which left an empty
  slot after the removal) to a balanced 2-column layout: "Create Duel" spans
  both columns as the hero card, "Join with Code" + "Find Match" sit
  side-by-side, and "Spectate" spans both columns as a wide card.
- **Feature-pill row** — added a compact pill strip under the server-info bar
  highlighting Real-time, Anti-cheat, Reconnect anytime, and Ranked.
- **CSS cleanup** — removed all `.network-history*` and
  `.network-lobby-card[data-action="network-history"]` styles, plus the orphaned
  responsive rules. Updated tablet/mobile breakpoints for the new 2-column grid.

## v0.26 — Release Notes Workspace, SEO & Social, Neocities Deploy Tooling

### Summary

Surfaces the project's changelog inside the app as a first-class workspace,
adds production-grade SEO/social-share metadata, and introduces a complete
Neocities deploy pipeline. Also lands the browser-side guest→permanent
account migration controller that pairs with the v0.25 server-side
migration protocol. No gameplay or engine changes.

### Release Notes Workspace (`/release-notes`)

- **New workspace** `apps/lab-web/src/workspaces/release-notes.js` — fetches
  `data/changelog.md` and renders it with the existing lightweight markdown
  renderer from `rulebook-renderer.js`.
- **Version summary cards** at the top of the workspace show the current
  `LAB_VERSION`, `ENGINE_VERSION`, `RULES_VERSION`, and a count of release
  entries parsed from the changelog.
- **Quick-nav sidebar** lists every `## v…` version header; clicking a
  version smooth-scrolls to that header and briefly highlights it. The
  sidebar is sticky on desktop and collapses above the content on mobile.
- **Loading and error states** — a spinner while the changelog fetches,
  and a clear danger notice if `data/changelog.md` is unavailable.
- **Router integration** — `/release-notes` registered in `router.js`
  under the "System" section with its own icon, label, and description.
  Wired into `app.js` dispatch and the landing rail as a "What's new" card.
- **CSS** — full styling in `feature-components.css` including responsive
  collapse (`@media max-width:900px`) and a flash-highlight keyframe.
- **Slugify deduplication** — `slugify()` is now exported from
  `rulebook-renderer.js` and imported by `release-notes.js`, eliminating
  the duplicated implementation. Header IDs and quick-nav slugs are
  guaranteed to match because they share one function.
- **Build pipeline** — `scripts/build.mjs` copies root `CHANGELOG.md` →
  `dist/data/changelog.md` so the workspace works in the built bundle.

### SEO & Social Share

- **`og-image.png` generator** (`scripts/generate-og-image.mjs`) — renders
  a deterministic 1200×630 PNG from an inline SVG via `sharp`, branded with
  the IX glyph, wordmark, tagline, and current version stamp. Deterministic
  skip-unchanged via a source-hash sidecar (`og-image.hash`). No
  timestamps or randomness — same input always yields byte-identical
  output.
- **Wired into the build** — `scripts/build.mjs` now invokes
  `generate-og-image.mjs` on every build so the share image always reflects
  the current brand design and version. (Previously the build carried a
  stale "hand-authored" comment; the image is now generated, not manual.)
- **Open Graph + Twitter Card metadata** in `index.html` — `og:image`,
  `og:image:secure_url`, `og:image:type/width/height/alt`, `twitter:card`,
  `twitter:site`, `twitter:title/description/image/alt`. All point at the
  canonical `https://intrilex.cards/assets/og-image.png`.
- **`robots.txt`** — allows all crawlers with `Allow: /` (the app is a
  hash-routed SPA served from the root, so there are no disallowed paths).
- **Meta description** and `robots` meta tag (`index, follow,
  max-image-preview:large`) already present in `index.html`.

### Neocities Deploy Pipeline

- **`scripts/sync-neocities.mjs`** — one-way mirror from
  `apps/lab-web/dist` → `neocities-deploy/`. Validates the build, deletes
  stale hashed `app.*.js` / `styles.*.css` bundles, recursively copies
  dist over deploy (preserving neocities-only extras like `404.html` and
  `assets/fonts/`), prunes stale data files no longer in dist, and
  verifies the result (index.html refs, bundle sizes, preserved extras).
  Supports `--build` to run `pnpm run build` first.
- **`scripts/upload-neocities.mjs`** — uploads `neocities-deploy/` to
  neocities.org with correct relative paths (walks the folder and uploads
  each file at its path relative to the deploy root, avoiding the
  `neocities-deploy/` subdirectory problem the upstream CLI creates).
  Credentials are read only from `NEOCITIES_API_KEY` (preferred) or the
  `NEOCITIES_USERNAME` + `NEOCITIES_PASSWORD` environment pair. Supports
  `--dry-run`. Makes real network calls — intentionally not run by the build.
- **New scripts** in `package.json`: `build:neocities` (build + sync),
  `sync:neocities` (sync only), `upload:neocities` (upload only).

### Guest→Permanent Migration Controller (Browser)

- **`apps/lab-web/src/play/network/migration-controller.js`** —
  self-contained controller that runs the guest→permanent account
  migration when the auth controller detects an
  ANONYMOUS→AUTHENTICATED transition.
- **Flow** — reads local achievements from IndexedDB, opens a short-lived
  WebSocket to the match server, authenticates with the current access
  token, sends `MIGRATE_GUEST` with source/target identity + achievements,
  waits for `MIGRATION_RESULT`, closes the WebSocket, and marks local
  achievements as migrated (data preserved as backup, never deleted).
- **Status machine** — `IDLE → CONNECTING → AUTHENTICATING → MIGRATING →
  DONE/ERROR` with a subscriber API (`onMigrationStatusChange`) for UI
  feedback. Idempotent guard prevents concurrent migration runs.
- **Pairs with v0.25 server** — `handleMigrateGuest()` in `server.mjs`,
  `MIGRATE_GUEST`/`MIGRATION_RESULT` protocol messages, and the
  `account_migrations` Supabase table.

### Tests

- **New test file**: `test/release-notes-workspace.test.mjs` (20 static
  contract tests — workspace exports, slugify dedup, router/app
  integration, version summary, quick-nav wiring, loading/error states,
  CSS classes, changelog pipeline, OG/SEO metadata, neocities scripts,
  robots.txt). Registered in `package.json` and `scripts/ci.mjs`.

## v0.25.3 — Backlog Completion (Ranked Leaderboard Hardening)

### Summary

Completes all 6 deferred backlog items from the v0.25.2 polish phase.
No new user-facing features — infrastructure hardening, performance
optimization, and defensive validation.

### BACKLOG 1: AbortController in leaderboard-data.js

- All four fetch functions (`fetchLeaderboard`, `fetchPlayerStanding`,
  `fetchSeasons`, `fetchPlayerSeasonHistory`) now accept an optional
  `AbortSignal` parameter, passed through to the Supabase client RPC call.
- `leaderboard.js` workspace creates a new `AbortController` on each
  `load()` call and aborts the previous one. `destroyLeaderboard()` and
  `renderLeaderboard()` also abort in-flight requests.
- This prevents wasted bandwidth and stale responses when the user
  changes filters rapidly or navigates away.

### BACKLOG 2: Functional indexes for SQL search

- Migration `0011_tier_helpers_and_indexes.sql` creates two functional
  indexes on `profiles`:
  - `idx_profiles_handle_lower` on `lower(handle)`
  - `idx_profiles_display_name_lower` on `lower(display_name)`
- These accelerate leaderboard search and profile handle lookups that
  use `lower(p.handle) LIKE lower(v_search)`.

### BACKLOG 3: Tier boundary extraction to SQL helper functions

- Migration `0011_tier_helpers_and_indexes.sql` creates three IMMUTABLE,
  PARALLEL SAFE SQL helper functions:
  - `tier_for_rating(integer)` — returns tier name for a rating
  - `division_for_rating(integer)` — returns division (I/II/III/NULL)
  - `is_apex_rating(integer)` — returns boolean for apex (>=2400)
- All 6 RPCs in migrations 0009 and 0010 (`get_ranked_leaderboard`,
  `get_player_standing`, `get_player_season_history`,
  `get_public_profile`, `get_self_profile`) are refactored to use
  these helpers instead of duplicated inline CASE statements.
- The tier filter in `get_ranked_leaderboard` now uses
  `tier_for_rating(e.rating) = p_tier_filter` instead of 8 hardcoded
  `OR` clauses with explicit rating thresholds.
- Tier thresholds are now defined in ONE place. Changing a threshold
  requires updating only the helper function, not 6 RPCs.

### BACKLOG 4: Transaction wrapping in match result persistence

- Migration `0012_atomic_persist_match_result.sql` creates a new
  `persist_match_result(jsonb)` RPC that performs all multi-table
  writes (matches, match_participants, player_ratings, rating_events,
  player_stats) in a single database transaction.
- The RPC is SECURITY DEFINER, restricted to `service_role` only
  (revoked from authenticated and anon).
- Includes idempotency gate (returns `alreadyPersisted: true` if match
  exists), exception handler for automatic rollback, and all
  `ON CONFLICT DO NOTHING` clauses for defense-in-depth.
- `SupabaseMatchResultPersistor.persistMatchResult()` now calls the
  atomic RPC first. If the RPC doesn't exist (migration 0012 not yet
  applied), it falls back to the legacy multi-call path via
  `_isMissingRpcError()` detection.
- The legacy path is preserved as `_persistMatchResultLegacy()` for
  backward compatibility.

### BACKLOG 5: Catalog ID uniqueness validation

- New `validateCatalogConsistency()` function in `profile-domain.mjs`
  checks that cosmetic catalog IDs are globally unique across all
  catalogs (titles, frames, card backs, badges).
- Detects both cross-catalog collisions (same ID in different catalogs)
  and within-catalog duplicates (same ID twice in one catalog).
- The known `'none'` sentinel (shared between titles and frames as the
  "no cosmetic equipped" default) is detected and reported as a known
  collision — it is harmless because lookup functions are
  catalog-specific.
- Exported from `@intrilex/account-domain` package index.

### Additional: Profile.js request ID tracking (user contribution)

- `profile.js` workspace now uses a monotonic `_renderRequestId` to
  guard against stale async responses when navigating between profiles.
- Modal overlay cleanup on re-entry prevents zombie interactions.
- Tab content cache (`_tabCache`) with invalidation on profile change
  and after mutations (edit, customize, privacy save).
- WAI-ARIA tabs pattern: `aria-controls`, `tabindex` roving, `role="tablist"`.
- Malformed profile data guard (`INVALID_PROFILE` error state).

### Test Updates

- 14 new tests added to `ranked-leaderboard.test.mjs` covering all
  backlog items. Total: 76 tests (was 62).
- `supabase-schema.test.mjs` updated to include migrations 0011 and 0012.
- `v0.22.0-profile-deepening.test.mjs` updated for renamed profile.js
  functions (`renderRatingHistoryChart`, `renderShowcaseSection`,
  `renderRankedDetailCard`, `renderRecentMatches`, `renderMatchesTab`).
- `ranked-glyphs.test.mjs` updated for `profile-ranked-hero` class name.
- `analytics-ai-ui.test.mjs` updated for `/leaderboard` in System routes.
- Total test suite: 2839 tests (was 2825), 0 failures.

### Migrations

- `0011_tier_helpers_and_indexes.sql` — tier helper functions + functional indexes + RPC refactors
- `0012_atomic_persist_match_result.sql` — atomic persist RPC

## v0.25.2 — Ranked Leaderboard Polish (Enhancement-First)

### Summary

Surgical reliability and robustness fixes for the Ranked Leaderboard ecosystem
introduced in v0.25.1. No new features — bug fixes, edge-case guards, memory
leak prevention, and regression tests.

### Reliability Fixes

- **Glicko-2 opponent validation** — `glicko2Update()` now validates each
  opponent's `rating` (finite), `ratingDeviation` (> 0), and `score` ([0, 1])
  before computation. Previously, NaN/invalid inputs propagated silently
  through the rating calculation, producing NaN ratings.
- **Glicko-2 zero-variance guard** — Added defensive check for `vInv === 0`
  (degenerate opponent RD) to prevent Infinity ratings.
- **computeWinRate input sanitization** — NaN and negative inputs are now
  clamped to 0 before division. Previously, `computeWinRate(NaN, 5, 0)` would
  return NaN instead of 0.
- **Season finalization rollback** — `SeasonService.finalizeSeason()` now wraps
  the `processPendingMatches` and `snapshotStandings` hooks in try-catch. On
  failure, the season is rolled back to ACTIVE (not stuck in FINALIZING
  forever). The `activateNextSeason` hook failure is logged but does not roll
  back (the season is correctly archived).

### Memory & Race Condition Fixes

- **Leaderboard stale-request guard** — `load()` now uses a monotonic `_loadId`
  to ignore stale async responses when the user changes filters rapidly. This
  prevents the UI from flashing stale data after a newer request completes.
- **Leaderboard timer cleanup** — `destroyLeaderboard()` export clears the
  pending search debounce timer. `renderLeaderboard()` also clears any
  leftover timer on re-entry. Prevents memory leaks when navigating away.
- **Leaderboard listener accumulation** — Target-level delegation listeners
  (click, keydown) are now added once per target element (tracked via
  `_wiredTarget`), preventing listener accumulation across re-renders.

### Robustness Improvements

- **RPC response validation** — `leaderboard-data.js` now validates that RPC
  responses are arrays via `Array.isArray()` before mapping. Previously,
  malformed responses would throw cryptic errors.
- **Error message context** — All RPC error messages now include request
  parameters (season, tier, queue) for faster debugging.

### Code Health

- **Lint warnings reduced** — Removed 4 unused-var warnings (unused `i` in
  skeleton renderer, unused imports `deriveOutcome`, `Division`,
  `buildMatchResultRecord` in test file). Total warnings: 311 (was 315).
- **8 regression tests added** — Tests for Glicko-2 opponent validation,
  computeWinRate sanitization, season-service rollback, leaderboard.js
  stale-request guard, and RPC response validation. Total: 62 tests (was 54).

## v0.25.1 — Ranked Leaderboard & Competitive Standing

### Summary

Complete Ranked Leaderboard ecosystem with Glicko-2 rating model, server-side
deterministic ranking, season lifecycle, idempotent persistence, and a
canonical leaderboard UI. The browser is never authoritative — rating,
position, and season state are all server-owned.

### Rating System (Glicko-2)

- **Glicko-2 rating model** (`packages/account-domain/src/glicko2.mjs`) replaces
  the legacy Elo system. Tracks rating, rating deviation (RD), and volatility
  per player per season. RD widens during inactivity and shrinks with play.
- **Soft-reset season transitions** — RD is increased (never a destructive hard
  reset). Rating and volatility are preserved across season boundaries.
- **Peak rating tracking** — `peak_rating` column stores the highest rating
  achieved in a season, updated monotonically.
- **Placements** — 5 placement matches required before entering the ladder.
  `placements_played` capped at `PLACEMENTS_REQUIRED`.

### Database (Migration 0009)

- `ranked_seasons` table with `UPCOMING`/`ACTIVE`/`FINALIZING`/`ARCHIVED`
  status lifecycle and a partial unique index enforcing the single-active-season
  invariant.
- `player_ratings` extended with `rating_deviation`, `volatility`, `peak_rating`,
  `placements_played`, `last_rated_at`, `last_rated_match_id`.
- `rating_events` — server-owned audit ledger with `UNIQUE(match_id, user_id)`
  idempotency constraint. Owner-only SELECT via RLS.
- `ranked_season_archive` — read-only final standings snapshots. Owner-only
  SELECT via RLS.
- Canonical leaderboard index: `rating DESC, rating_deviation ASC,
  rated_matches DESC, last_rated_at DESC`.
- 4 SECURITY DEFINER RPCs with locked `search_path = public`:
  `get_ranked_leaderboard`, `get_player_standing`, `get_ranked_seasons`,
  `get_player_season_history`. All use `ROW_NUMBER()` for derived position
  (never stored mutable state). Banned/suspended players excluded.

### Server Rating Service

- `RatingService` (`apps/match-server/src/ranked/rating-service.mjs`) —
  orchestrates idempotent application of terminal Ranked match results.
  Rejects non-ranked/non-terminal/self-match/anonymous results.
- `SeasonService` (`apps/match-server/src/ranked/season-service.mjs`) —
  resolves active season, lists seasons, idempotent season finalization.
- `LeaderboardRepository` (`apps/match-server/src/ranked/leaderboard-repository.mjs`)
  — server-side leaderboard queries via Supabase RPCs.
- `SupabaseMatchResultPersistor` — idempotency gate via `isMatchPersisted()`;
  writes Glicko-2 state, peak, placements, rating events, and last-rated
  metadata. Re-persisting the same matchId is a safe no-op.
- `FakeMatchResultPersistor` — updated for Glicko-2 state, seasons, peak,
  placements, and rating event ledger.

### Leaderboard UI

- `/leaderboard` workspace — canonical Ranked leaderboard with Top 100, My Rank
  (works outside Top 100), search, tier filter, season picker, top-3 emphasis,
  loading skeletons, empty/error/unavailable states.
- Server-side ranking via RPCs — the browser never sorts the full table.
- Responsive collapse to card view on narrow widths.
- Accessibility: semantic table, `aria-sort`, `aria-live`, `aria-busy`,
  keyboard-activatable rows, visually-hidden labels, reduced-motion support.
- `leaderboard-data.js` — browser-side data fetcher using authenticated
  Supabase client. Returns structured "unavailable" result when Supabase is
  not configured (graceful offline mode).

### Privacy / RLS

- `toLeaderboardEntry()` strips all private fields (`user_id`, `email`,
  `ratingDeviation`, `volatility`) — only safe public columns in the DTO.
- Leaderboard RPC returns `public_player_id` (never `user_id`).
- `rating_events` and `ranked_season_archive` are owner-only SELECT via RLS.
- No client write grants on any ranked table — service role only.
- No service-key references in any browser-side source file.

### Tests

- `test/ranked-leaderboard.test.mjs` — 54 tests covering Glicko-2 model, rank
  tiers, leaderboard contract, seasons domain, idempotent persistence, peak
  tracking, placements, RatingService, SeasonService, privacy/RLS, and UI
  structure. Registered in `package.json` and `scripts/ci.mjs`.

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
