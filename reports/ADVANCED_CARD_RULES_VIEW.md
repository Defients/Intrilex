# Advanced Card Rules View — Coverage Audit & Implementation Report

**Version:** 1.0.0 · **Rules canon:** INTRILEX v4.3.1 Complete Player Rulebook · **Date:** 2025

## 1. Purpose

The Advanced Card Rules View is the exhaustive mechanical reference layer in the Intrilex player interface. It supplements the existing concise icon tooltips and the zoom card-face dialog with a structured, canonical dossier of every card's mechanical behavior, edge cases, official rulings, destinations, combinations, and persistent-state interactions.

It is **not** an enlarged card image and **not** a longer tooltip. It is the codex.

## 2. Information Hierarchy

The player-facing information hierarchy is now:

1. **Card Face** — the rendered card (board / lite / zoom views).
2. **Icon Tooltip** — concise per-ability `summary` text on hover/focus (unchanged).
3. **Advanced Card Rules View** — this view: canonical capabilities (static rules data) + a separate **Current Match** section (authoritative legal-action data from the engine).
4. **Current Match Legality** — derived only from the engine's authoritative legal-action contract; never invented by the view.

The canonical per-mode mechanical text (`summary` / `full` / `timing` / `restrictions`) lives in `card-face-data.js` and is reused by both the lightweight tooltips and this Advanced View. The dossier-level metadata (rulings, examples, destinations, combinations, generated/recursive behavior, persistent-state interactions, related-rule references) lives in `card-rules-data.mjs`.

## 3. Architecture

```
apps/lab-web/src/play/advanced-card-rules/
  card-rules-data.mjs                  ← canonical dossier data + validation + coverage audit
  advanced-card-rules-view.mjs         ← pure renderer (CardRulesDefinition + CurrentMatch → HTML)
  advanced-card-rules-controller.mjs   ← modal lifecycle, focus trap, hidden-info firewall,
                                          current-match derivation, tag filtering
apps/lab-web/src/css/advanced-card-rules.css
apps/lab-web/src/index.html            ← <dialog id="advanced-card-rules-dialog">
apps/lab-web/src/styles.css            ← @import advanced-card-rules.css
apps/lab-web/src/play/play-app.js      ← openAdvancedCardRules(), A shortcut, refresh on state update
apps/lab-web/src/play/board-events.js  ← Advanced Rules button + Shift+right-click context menu
apps/lab-web/src/play/ranked-duel-renderer.mjs ← inspector "Advanced Rules" affordance
test/advanced-card-rules.test.mjs      ← 23 tests (data, renderer, controller, integration, coverage)
```

## 4. Invocation

The Advanced View can be opened from any inspectable card location (hand, swap bar, discard, rows, stack) via four explicit affordances:

| Affordance | Trigger |
|---|---|
| **Inspector button** | "Advanced Rules" tab in the card inspector sidebar |
| **Hover popover button** | "Advanced Rules →" button in the lite hover popover |
| **Keyboard shortcut** | `A` — opens for the selected or inspected card |
| **Context menu** | `Shift + right-click` on any board or hand card |
| **Observatory / replay card tokens** | Click any card token in a replay or observatory view |

Plain right-click remains the lightweight inspector; `Shift + right-click` jumps straight to the Advanced View.

The old `#card-face-dialog` ("CARD FACE RENDERER v1" overlay) has been **completely removed**. All entry points that previously opened it now open the Advanced Card Rules View instead.

## 5. Hidden-Information Protection

The view never receives concealed information. Two layers enforce this:

1. **Caller guard (`play-app.js`):** `openAdvancedCardRules()` calls `isCardInspectable(snapshot, cardId)` before opening. Face-down or absent cards are refused.
2. **Controller firewall (`advanced-card-rules-controller.mjs`):** `findAuthorizedCard()` walks only the authorized player-view zones and returns `{ faceDown: true }` for face-down cards; `isCardInspectable()` returns `false` for any face-down or absent card. `openAdvancedCardRules()` refuses the literal `'FACE_DOWN'` / empty identities as defense-in-depth.

When the game state updates while the view is open, `refreshCurrentMatch()` re-checks inspectability and **closes the view** if the inspected card is no longer inspectable (e.g. it was revealed, then concealed again), preventing stale-information leakage.

## 6. Current Match Legality

The **Current Match** section is visibly separated from canonical capabilities (orange-bordered panel vs. the rest of the dossier). It shows only facts derivable from the engine's authoritative legal-action contract:

- Zone, actor, state revision
- Legal actions for this card (label, form, timing class, response/super tags)
- Legal target count (when available)
- A neutral "Unavailable in the current state." message when no legal actions exist
- A provenance note: "Derived from the authoritative legal-action contract. Engine authority decides current legality."

The view **never** invents an illegality reason. It does not say "Board Lock prevents this" or "you lack a Mini-Turn" — it only reports what the engine authorizes.

## 7. State Safety

Opening the Advanced View does **not**:
- select a card
- submit an action
- advance a declaration
- consume priority
- change hover legality
- mutate any game state

The view is purely presentational. The controller's `openAdvancedCardRules()` only reads the snapshot and renders; it never calls `session.submit()` or any state-mutating API.

## 8. Keyboard Accessibility

- `A` opens the view for the selected/inspected card.
- `Escape` closes the view (handled by the dialog key handler and the document-level handler).
- Focus is trapped within the dialog (`Tab` / `Shift+Tab` cycle through focusable elements).
- Focus returns to the element that opened the view on close.
- The close button is auto-focused on open.
- Ruling tag filter chips are keyboard-operable (`aria-pressed` toggle).
- Collapsible sections use native `<details>`/`<summary>` (keyboard-operable by default).

## 9. Complex Card Coverage

The following cards have full dossier coverage (rulings, examples, destinations, combinations, generated/recursive behavior, persistent-state interactions):

| Card | Sections populated | Notable content |
|---|---|---|
| **7 / 7♠** | 9/9 | Topdeck Casting recursion (physical-Seven-only), generated card combination, scrapping order, ⭐7 sequential state, scoring-trigger semantics |
| **10♦** | 9/9 | Mimic definition (what copies / what doesn't), Paired Mimic exclusions, always-Rank-10 identity, Instant timing window mimicry |
| **10♠** | 9/9 | Stack Theft target exclusions, fizzle semantics, Full-Turn skip is printed (not Interrupt keyword), countered-theft skip asymmetry |
| **K♠** | 9/9 | Wild Sovereignty scope, Wild-Exile-Bound (even if countered), not-a-counter-limit, via Draw & Cast / Seven, Royal Marriage combination |
| **Q♠** | 9/9 | Special Protection scope, clear immunity, Queen's Court component |
| **Q (all)** | 9/9 | Queen's Court declaration restrictions, counter authority (only K♠), Guard semantics, Royal Shield |
| **BJ** | 9/9 | Board Lock declaration restrictions, ⭐A-only counter, not-retroactive, Exile Recycle + Exhausted, PR immunity scope |
| **2 (all)** | 9/9 | One-2-Quick-pending limit, Solo Wild Copy suit requirement, ⭐2 Aegis interaction |
| **4 (all)** | 9/9 | Row Clear scope (Guard/Aegis), 4♠ Total Clear structural bypass, ⭐4 Row Exchange Aegis |
| **A (all)** | 8/9 | Base Ace counter scope, Purge dual modes, Anchor Ace sacrifice, A♠ Exile counter |

## 10. Coverage Audit

```
Status   Count  Cards
────────────────────────────────────────────────────────────────
COMPLETE    20  2♣ 2♦ 2♥ 2♠ 4♣ 4♦ 4♥ 4♠ 7♣ 7♦ 7♥ 7♠ 10♦ 10♠ Q♣ Q♦ Q♥ Q♠ K♠ BJ
PARTIAL     34  A♣ A♦ A♥ A♠ 3♣ 3♦ 3♥ 3♠ 5♣ 5♦ 5♥ 5♠ 6♣ 6♦ 6♥ 6♠ 8♣ 8♦ 8♥ 8♠
                9♣ 9♦ 9♥ 9♠ 10♣ 10♥ J♣ J♦ J♥ J♠ K♣ K♦ K♥ RJ
MINIMAL      0
```

- **COMPLETE** (≥7 of 9 sections populated): all complex cards listed in §9.
- **PARTIAL** (4–6 sections): cards with simpler mechanical profiles (e.g. 3, 5, 6, 8, 9, J, K, A, 10♣, 10♥, RJ) — they have overview + abilities + destinations + rulings but lack generated/recursive behavior or combinations.
- **MINIMAL** (≤3 sections): none.

Every canonical identity (54 cards) has at least an overview, abilities, and destinations. No card is empty.

## 11. Validation (Rules-Drift Protection)

`validateCardRulesData()` runs on every test suite execution and enforces:

- Every canonical identity has a definition with `overview` and `canonSource`.
- Every ability has `summary` and `full` text.
- No ruling has an empty `id` or empty `ruling` text.
- No intra-card duplicate ruling ids.
- No cross-card ruling id has conflicting text (rank-level rulings are intentionally shared across suits with identical text — this is allowed).
- Tooltip summaries remain concise (≤220 chars) while `full` text is at least as long.

## 12. Tests

`test/advanced-card-rules.test.mjs` — 23 tests across 6 groups:

1. **Canonical data model** (5 tests): meta, every identity has overview, validation succeeds, no duplicate ruling ids, tooltip conciseness.
2. **Renderer** (5 tests): simple card, Rank 7 structured rulings, K♠ multi-section, empty sections absent, Current Match separation.
3. **Controller — hidden-info firewall** (2 tests): face-down card not inspectable, current legal actions derived correctly.
4. **Controller — open/close/focus** (3 tests, DOM shim): opens/closes, refuses concealed identity, focus return.
5. **Integration source-text** (5 tests): index.html dialog, styles.css import, play-app wiring, board-events wiring, inspector affordance.
6. **Coverage audit** (1 test): all 54 cards covered; complex cards COMPLETE.

## 13. Files Touched

**New:**
- `apps/lab-web/src/play/advanced-card-rules/card-rules-data.mjs`
- `apps/lab-web/src/play/advanced-card-rules/advanced-card-rules-view.mjs`
- `apps/lab-web/src/play/advanced-card-rules/advanced-card-rules-controller.mjs`
- `apps/lab-web/src/css/advanced-card-rules.css`
- `test/advanced-card-rules.test.mjs`
- `reports/ADVANCED_CARD_RULES_VIEW.md` (this file)

**Modified:**
- `apps/lab-web/src/index.html` — added `<dialog id="advanced-card-rules-dialog">`; **removed** old `<dialog id="card-face-dialog">`
- `apps/lab-web/src/styles.css` — `@import` advanced-card-rules.css
- `apps/lab-web/src/play/play-app.js` — `openAdvancedCardRules()`, `A` shortcut, Escape handling, state-refresh hook; **removed** `openCardFaceDialog()`; popover "Full Zoom →" now opens Advanced View
- `apps/lab-web/src/play/board-events.js` — Advanced Rules button + Shift+right-click handler; **removed** old dossier handler + `openCardFaceDialog` callback
- `apps/lab-web/src/play/ranked-duel-renderer.mjs` — inspector "Advanced Rules" affordance + keyboard help entry; **removed** old "Full dossier" button
- `apps/lab-web/src/app.js` — observatory/replay card tokens now open Advanced View; **removed** `renderCardFace` import + old dialog wiring
- `apps/lab-web/src/play/play-state.js` — updated comment
- `package.json` — registered `test/advanced-card-rules.test.mjs`
- `scripts/ci.mjs` — registered `advanced-card-rules` test stage
- `test/card-face-renderer.test.mjs` — updated assertions for removed dialog

## 14. Verification

- `node --test test/advanced-card-rules.test.mjs` — 23/23 pass
- `npx tsc --noEmit` — 0 errors
- `pnpm run lint` — 0 errors (0 new warnings on new files)
- `pnpm run build` — PASS
- `node --test test/test-coverage-meta.test.mjs` — 4/4 pass (registration verified)
- `node --test test/v0.17.0-play-interface.test.mjs test/mimic-ten-diamond.test.mjs test/advanced-continuations.test.mjs` — 56/56 pass (no regressions)
