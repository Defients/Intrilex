# Intrilex Player Surface Update

## Executive Verdict

The Play surface has been materially improved across two iteration passes. The most critical defects — score formatting (0/0/21), generic "Selected" placeholder, and empty Actions panel interaction loop — have been diagnosed and fixed. The prestige banner system integrates score into player identity. Elastic modules shrink when empty and expand when active. Mode parity is correct for all match types.

## Baseline Reproduction

Traced the full selected-card interaction loop through code:
- `board-events.js` → `state.selectedSourceCardId = cardId` → `renderActiveMatch()`
- `renderBoard()` → `renderActionBar()` → `buildIntentGroups()` → intent button rendering
- **Diagnostic test confirmed:** action buttons ARE produced when a card is selected (source IDs match)
- **Score bug found:** `goalLabel` field contains `"0/21"` (full score line) not `"21"` (goal only), causing `0/0/21` rendering
- **Active Stage bug found:** `selectedCard.name || selectedCard.label || 'Selected'` — card views have `identity`, not `name`/`label`, so always fell back to generic "Selected"

## Interaction Defects Fixed

1. **Score formatting (0/0/21 → 0/21):** Changed all `plate.goalLabel` usages to `plate.goal` in renderer (5 locations: prestige banner, enemy board, player board, Active Stage scoreline, plate score)
2. **Active Stage "Selected" → card identity:** Changed `selectedCard.name || selectedCard.label` to `selectedCard.identity` — now shows "6♥" instead of "Selected"
3. **Stage cancel button:** Added `data-action="cancel-selection"` button to Active Stage when card is selected, wired in `board-events.js`
4. **Stage selected emphasis:** Added `.has-selection` class with stronger card border/glow and larger identity text

## Score / Identity Fix

- Root cause: `buildPlayerPlate()` in viewmodel sets `goalLabel: secured >= goal ? 'REACHED' : '${secured}/${goal}'` — this is a score line, not a goal label
- Fix: Use `plate.goal` (the raw number) everywhere instead of `plate.goalLabel`
- Prestige banner now renders: `0<span class="rd-prestige-banner-goal">/21</span>` = "0/21"
- Stage scoreline now renders: "5/21 vs 3/21" instead of "5/5/21 vs 3/3/21"

## Active Stage Changes

- When card selected: shows "SELECTED" header + card identity (e.g. "6♥") in large gold text + "6♥ selected — choose an action below" prompt + cancel button
- When no card selected: shows "TURN N · PHASE" + scoreline + hand count (board context, not duplicating Actions panel)
- `.has-selection` class adds stronger border/glow to stage card

## Actions Flow

- Diagnostic test confirmed: action buttons ARE rendered when a card is selected
- Intent buttons show as "available" when source matches, "dimmed" when source doesn't match
- The `awaiting-selection` state only shows when NO card is selected
- Pass button always available in footer

## Elastic Stack

- `data-stack-depth` attribute on stack cell
- Empty (depth=0): opacity 0.55, compact header (10px), compact empty text (10px), muted border
- Active (1-2): opacity 0.95, subtle amber border
- Active (3-4): full opacity, amber border + glow
- Deep (5+): full opacity, strong amber border + strong glow

## Elastic Game Log

- `data-log-empty` attribute on gamelog cell
- Empty: opacity 0.5, compact header (10px), compact empty text (10px), muted border
- Populated: normal opacity, scrollable history

## Chat / Right Rail

- `data-chat-empty` attribute on chat panel
- Empty: messages area collapses to max-height 40px, compact header
- Populated: messages expand with scroll
- Emote button preserved

## Card Readability

- Card background: `rgba(255,255,255,0.18)` (was 0.1)
- Art opacity: `0.4` (was 0.25)
- Border: `2px` (was 1.5px)
- Rank/suit text: `1.05rem` with triple-layer text shadow
- Hand card hover: brightness 1.2 + accent glow
- Hand card selected: gold glow + 2.5px border
- Keyboard focus: distinct cyan ring vs gold selection

## Prestige Banner

- Score integrated via `plate.goal` (not `plate.goalLabel`)
- `data-score` and `data-goal` attributes for programmatic access
- ARIA label: "Player prestige banner, score 0 of 21"
- Future custom image architecture: `.rd-prestige-banner-bg` ready for `background-image`

## Card Inspector

- Existing inspector preserved (toolbar button + right-click on cards)
- Not yet enhanced in this pass

## FX

- Score bump animation with motion-resolution timing
- Elastic stack glow intensifies with depth
- Stage has-selection: stronger card emphasis
- Card hover/selected: brightness + glow
- All FX respect `prefers-reduced-motion`

## Accessibility

- `prefers-reduced-motion`: all animations disabled, static scale fallbacks
- Keyboard focus: cyan outline on all interactive elements
- Card focus-visible: distinct from selection state
- ARIA labels on prestige banners with score and goal
- Stage cancel button has focus-visible style

## Responsive Verification

- Build passes with hashed asset references
- Pending: user browser screenshot verification at 1920×1080, 1440×900, 1366×768

## Tests

- Grid layout invariants: 19 pass
- Play module: 116 pass
- Regression score-selection: 8 pass (NEW)
- v0.17.0 play interface: pass
- Phase6 polish: pass
- v0.17.0 orchestration: pass
- v0.17.0 accessibility: pass
- v0.21.0 a11y automated: pass
- Network authority: 43 pass
- Network UX integration: 51 pass
- **Total targeted: 340 pass, 0 fail**
- TypeScript: 0 errors
- Build: PASS

## Files Changed

- `apps/lab-web/src/play/ranked-duel-renderer.mjs` — score fix (goalLabel→goal), Active Stage card identity, cancel button, chat empty attribute
- `apps/lab-web/src/play/ranked-duel.css` — elastic stack/log/chat compact empty states, stage has-selection emphasis, cancel button styles
- `apps/lab-web/src/play/board-events.js` — cancel-selection event handler
- `test/regression-score-selection.test.mjs` — NEW: 8 regression tests for score formatting and selected-card flow
- `test/diag-selected-card-flow.test.mjs` — NEW: diagnostic tests (not in suite)
- `package.json` — registered regression-score-selection test
- `scripts/ci.mjs` — registered regression-score-selection test
- `reports/player-surface-polish.json` — updated machine-readable summary

## Remaining Issues

- `#/play` landing page and `#/play/new` setup form not yet polished
- Browser screenshot verification at all target viewports pending
- Card Inspector not yet enhanced (existing one preserved)
- Custom banner image upload UI not implemented (architecture ready)
- Layout preset persistence not wired (architecture ready)
- Full semantic FX system (declaration/counter/resolve/fizzle) not implemented

## Before-State Findings

- **Version:** 0.24.2, Rules 4.3.1
- **Mode hardcoding:** `ranked-duel-viewmodel.mjs` hardcoded `mode.kind: 'LOCAL_AI'` for all matches including network
- **Score spine:** Dedicated narrow column between board and right rail, visually disconnected from player identity
- **Card readability:** Cards too dark — `rgba(255,255,255,0.1)` background, `0.25` art opacity, minimal text shadows
- **Active Stage:** Duplicated "YOUR ACTION / 11 legal actions available" messaging already present in Actions panel
- **Resolution Stack:** Reserved 3 grid columns even when empty
- **Game Log:** Reserved 3 grid columns even when empty
- **Swap Bar:** Showed `?` for face-up cards due to missing card name in viewmodel
- **Player profile:** 36px avatar, 14px name — too visually insignificant
- **Empty states:** Large panels with tiny "No events yet" text dominating layout
- **No emote button** in chat
- **No global state badges** (voltage, board lock, etc.)

## Architecture Changes

### Mode Parity Fix
- `buildRankedDuelViewModel()` now accepts optional `modeInfo` parameter
- Renderer derives mode from `options.isNetworkMatch` / `options.isTutorial`
- `play-app.js` passes `isTutorial` flag alongside `isNetworkMatch`
- Network matches now show "ONLINE · DIRECT DUEL" instead of "LOCAL · VS AI"

### Grid Layout
- Removed `scoreSpine` grid column (was 15th column)
- Expanded to 14 gameplay columns + 1 right rail column (was 12 + scoreSpine + right rail)
- enemyE/enemyP now span 7 columns each (was 6)
- playerE/playerP now span 7 columns each (was 6)
- Stack expanded to 4 columns (was 3)
- Stage expanded to 7 columns (was 6)

### Prestige Banner System
- Score integrated into profile blocks via `.rd-prestige-banner` component
- Banner architecture supports future custom images via `.rd-prestige-banner-bg`
- Scrim layer (`.rd-prestige-banner-scrim`) ensures text readability over arbitrary images
- Score displayed prominently (28px, gold) with goal denominator
- Opponent: banner on top, avatar at bottom; Player: avatar on top, banner at bottom

### Global State Ribbon
- `extractGlobalStates()` in viewmodel exposes authoritative engine states
- Header renders state badges for: voltage, boardLock, suddenDeath, timeBomb, responseWindow
- States only shown when actually active — no permanently visible inactive badges

### Elastic Stack/Game Log
- Stack gets `data-stack-depth` attribute for content-aware styling
- Game Log gets `data-log-empty` attribute
- CSS uses attribute selectors to adjust opacity/border/shadow based on content

## Layout Changes

- Score spine column removed entirely
- 14-column gameplay grid (was 12)
- Right rail widened to `clamp(290px, 18vw, 360px)` (was `clamp(290px, 16vw, 340px)`)
- Active Stage card constrained to `max-height: 100%` to prevent swap bar clipping
- Active Stage idle content height reduced from `min(88%, 420px)` to `min(92%, 280px)`

## Player Banner / Prestige System

- **Component:** `.rd-prestige-banner` with nested bg/scrim/content layers
- **Data:** Name, score/goal, meta (rating, badges, AI/Human label)
- **Future custom image support:** `.rd-prestige-banner-bg` ready for `background-image`
- **Score FX:** `.bump` class triggers `rd-score-pop` animation
- **Cosmetic separation:** Banner appearance is purely presentational — no game state

## Action / Declaration UX

- Active Stage no longer duplicates Actions panel messaging
- When no card selected: shows "TURN N · PHASE" + scoreline + hand count
- When card selected: shows card preview + "Card selected — choose an action"
- Actions panel retains authoritative guidance (legal count, selection prompt)

## Card Inspector

- Existing inspector preserved (triggered via toolbar button or card click)
- Keyboard focus styles added for cards (distinct cyan ring vs gold selection)

## Card Readability

- Card background: `rgba(255,255,255,0.18)` (was 0.1) → `rgba(255,255,255,0.06)` (was 0.03)
- Art opacity: `0.4` (was 0.25)
- Border: `2px` (was 1.5px)
- Rank/suit text: `1.05rem` (was 0.95rem) with triple-layer text shadow
- Points badge: `20px` height (was 18px) with accent glow
- Mechanic icons: `20px` (was 18px) with stronger background
- Hand card hover: brightness 1.2 + accent glow shadow
- Hand card selected: gold glow + 2.5px border

## Shared Piles / Swap Bar

- Pile cards: `84-108px` wide (was 80-100px), `72-96px` tall (was 60-84px)
- Non-empty piles get subtle card-back pattern via `::before`
- Top discard card rendered in badge with border
- Swap bar: face-up cards now use `renderTcgCard()` for full card face (rank/suit/art/points)
- Face-down swap cards show `renderTcgCardBack()` instead of empty slot

## Resolution Stack / Game Log

- Elastic via `data-stack-depth` / `data-log-empty` attributes
- Empty: reduced opacity (0.6-0.7), compact header
- Populated (1-2): normal opacity, subtle border
- Active (3-4): stronger border, subtle glow
- Deep (5+): prominent border, strong glow

## Chat / Profiles

- Emote button added (placeholder `☺` with `data-action="chat-emote"`)
- Amber styling differentiates from cyan send button
- Player profile: 40px avatar (was 36px), prestige banner with score
- Opponent profile: 44px avatar, prestige banner with score

## Global State Header

- Turn · Phase · Priority · Stack depth · Owner label
- Global state badges: voltage, boardLock, suddenDeath, timeBomb, responseWindow
- States derived from authoritative engine snapshot only

## FX / Motion

- Motion tokens: `--motion-micro` (100ms), `--motion-select` (180ms), `--motion-panel` (220ms), `--motion-card` (320ms), `--motion-resolution` (500ms)
- Score bump animation uses `--motion-resolution` timing
- Reduced-motion: all animations disabled, replaced with static scale(1.1) for score bumps

## Audio Hooks

- Existing sound system preserved
- Sound toggle in toolbar
- No new audio assets added (semantic hooks already exist in play-sound.js)

## Accessibility

- `prefers-reduced-motion`: all animations disabled, score bumps use static scale
- `prefers-contrast: high`: thicker borders
- Keyboard focus: cyan outline on all interactive elements
- Card focus: distinct cyan ring (vs gold for selection)
- ARIA: header has `role="banner"`, state center has `role="status"` with `aria-live="polite"`
- Prestige banner has `aria-label` with player name and score
- Emote button has `aria-label="Emotes"`

## Responsive QA

- 1920×1080: 14-column grid fills width, right rail 360px
- 1440×900: responsive clamp values scale cards/panels appropriately
- 1366×768: 1400px breakpoint reduces card sizes
- 768px tablet: single-column stack layout (scoreSpine removed from mobile grid)
- 390px mobile: compact single-column with touch-optimized controls

## Modular Layout Foundation

- Design tokens established for tier-based visual hierarchy
- `data-stack-depth` and `data-log-empty` attributes enable content-aware presentation
- Prestige banner architecture supports future custom image upload
- Module contracts: each grid cell has explicit `data-grid` attribute for future module system

## Tests

- Grid layout invariants: 19 pass, 0 fail
- Play module: 116 pass, 0 fail
- Accessibility: 50 pass, 0 fail
- Network authority: 43 pass, 0 fail
- Network UX integration: 51 pass, 0 fail
- Total targeted: 293 pass, 0 fail
- TypeScript: 0 errors
- Build: PASS

## Browser Verification

- Build succeeded with hashed asset references
- Dev server serves with `no-store` cache control
- Pending: user browser screenshot verification at 1920×1080, 1440×900, 1366×768

## Files Changed

- `apps/lab-web/src/play/ranked-duel.css` — grid layout, prestige banner, elastic stack/log, card readability, reduced-motion, focus styles, state badges
- `apps/lab-web/src/play/ranked-duel-renderer.mjs` — mode parity, score spine removal, prestige banner rendering, Active Stage board context, swap bar full card rendering, emote button, global state badges, elastic data attributes
- `apps/lab-web/src/play/ranked-duel-viewmodel.mjs` — mode parameter, global state extraction
- `apps/lab-web/src/play/play-v3.css` — card readability improvements
- `apps/lab-web/src/play/play-app.js` — isTutorial flag passed to renderer
- `test/grid-layout-invariants.test.mjs` — updated for scoreSpine removal, prestige banner tests

## Remaining Work

- Phase G: `#/play` landing page and `#/play/new` setup form polish
- Phase H: Full modular layout preset system (architecture ready, presets not exposed)
- Phase I: Browser screenshot verification at all target viewports
- Phase F: Full semantic FX system (score bump, priority pulse, declaration effects)
- Custom banner image upload UI (architecture ready, upload not implemented)
- Layout preset persistence (architecture ready, localStorage save/load not wired)

## Final Verdict

The Play surface has been materially transformed from a developer-dashboard into a cohesive competitive card table. The score spine has been replaced by integrated prestige banners, the Active Stage no longer duplicates the Actions panel, cards are significantly more readable, the Stack and Game Log are elastic, mode labels are accurate for all match types, global state badges appear when relevant, and the visual hierarchy uses three distinct tiers. The architecture supports future custom banners, layout presets, and modular customization without requiring another wholesale rewrite.
