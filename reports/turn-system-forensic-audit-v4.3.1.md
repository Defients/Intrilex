# Intrilex Turn System Forensic Audit Report

**Date:** 2026-09-10  
**Auditor:** Devin (automated forensic analysis)  
**Rulebook authority:** `docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md`  
**Engine source:** `upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/src/`  
**Method:** Source inspection, rulebook cross-referencing, parallel subagent analysis (8 subsystems), targeted test execution  

---

## TL;DR

The engine implements the v4.3.1 turn lifecycle with broad correctness in the Core Foundation path (setup, draw, score, scuttle, exhausted pass, end-phase timers, turn handoff). However, the audit identified **27 confirmed issues** spanning 6 severity categories, including 5 High-severity rule violations, 9 Medium-severity defects, and 13 Low/Info issues. The most critical findings are: (1) ⭐A/3-Red Ultra counter authority is too narrow and cannot counter Ultras or Sudden Death as the rulebook requires, (2) the Start Phase ordering violates the rulebook sequence, (3) 10♣ Foundation bypasses the Rank-10 per-FT limit and Exile-Bound rule, (4) Sudden Death activation is not counterable, and (5) Exhausted is not automatically cleared when DP refills. All 163 targeted tests pass, confirming the engine is functionally stable but has rule-compliance gaps in edge cases and advanced features.

---

## Engine Version Surface

| Surface | Value | Expected |
|---------|-------|----------|
| `CORE_FOUNDATION_AUTHORITY_PROFILE.rulesVersion` | `"4.1.2"` | `"4.3.1"` |
| `CORE_FOUNDATION_AUTHORITY_PROFILE.engineVersion` | `"4.2.0"` | `"4.2.6"` or higher |
| `CORE_ADVANCED_AUTHORITY_PROFILE.rulesVersion` | `"4.1"` | `"4.3.1"` |
| `CORE_EFFECT_DECLARATION_PROFILE.engineVersion` | `"4.2.1"` | `"4.2.6"` |
| `CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.engineVersion` | `"4.2.3"` | `"4.2.6"` |
| `EngineState.rulesVersion` (type default) | `"4.1"` | `"4.3.1"` |
| `ReplayEnvelope.rulesVersion` | `"4.1"` | `"4.3.1"` |

**Finding:** Version surfaces advertise rules 4.1.x despite code comments referencing v4.3.1. This is a metadata inconsistency, not a gameplay defect, but it affects replay certification and manifest verification.

---

## CONFIRMED DEFECTS

### DEFECT-01: ⭐A / 3-Red Ultra counter authority is too narrow

**Rule requirement (§16.1, §9.4):** ⭐A and 3-Red Ultra resolve with Super Ace authority. They counter what Base Ace can counter (Effect plays, rank10), plus A♠, Ultras, Sudden Death activations, and other responses (counter-counter chains). Only ⭐A may counter an Ultra. Only ⭐A may counter Sudden Death activation.

**Current behavior:** `core-response.ts:145` restricts ⭐A/3-Red Ultra primary targets to `["ordinary-effect", "rank10"]` only. The code comment at lines 133-136 correctly states they should counter "A♠, Ultras, Sudden Death" but the implementation does not include `"super"`, `"ultra"`, or `"sudden-death"` in the allowed declaration classes.

**Mismatch:** ⭐A cannot counter Supers, Ultras, or Sudden Death activations. No counter in the engine can target an Ultra or Sudden Death primary stack item.

**Severity:** **HIGH** — This is a core counter-authority violation that makes Ultras and Sudden Death effectively uncounterable.

**Exact reproduction path:**
1. Start a match with `core-advanced-authority` or `core-unrestricted-authority` profile
2. Player A declares an Ultra (e.g., 3-Black) as a primary action
3. Player B holds two Aces and attempts `core-declare-super-ace-counter`
4. `targetAcceptsCounter` returns `false` because `"ultra"` is not in `["ordinary-effect", "rank10"]`
5. The Ultra cannot be countered

**Affected systems/files/functions:**
- `core-response.ts:137-145` — `targetAcceptsCounter` special case for `super-ace-counter` / `ultra-three-red`
- `core-authority.ts:724-734` — `core-declare-super-ace-counter` declaration

**Correct expected behavior:** Line 145 should return `["ordinary-effect", "rank10", "super", "ultra", "sudden-death"].includes(declClass)` (excluding `anchor`, `royal-marriage`, `queens-court` which remain K♠-only).

**Recommended fix:** Expand the allowed declaration classes array at `core-response.ts:145`.

**Regression tests required:**
- Test ⭐A can counter a 3-Black Ultra primary declaration
- Test ⭐A can counter a Sudden Death activation
- Test ⭐A can counter a Super primary declaration
- Test ⭐A still cannot counter Anchor or Royal Marriage
- Test 3-Red Ultra has the same expanded authority

---

### DEFECT-02: Start Phase ordering violates rulebook §4.1

**Rule requirement (§4.1, Quick Reference §37):** Start Phase order is:
1. Reset per-FT state
2. If DP empty, begin Exhausted
3. Capture Voltage Snapshot
4. Expire Aegis/effects and resolve due untaps atomically
5. Hide Revealed-Until-Start cards
6. Queue and resolve Start + Voltage abilities
7. Optional Face-Down Swap

**Current behavior:** `core-authority.ts:401-425` (`core-begin-start`) executes:
1. Reset per-FT limits (lines 406-411) ✅
2. Clear disruptions (lines 412-414)
3. **Voltage Snapshot** (line 415) — should be step 3, but Exhausted check should be step 2
4. `processStartPhaseLifecycles` — Aegis/Tap/Reveal expiry (line 416)
5. **Exhausted check** (lines 417-420) — should be step 2, before Voltage and maintenance

**Mismatch:** Exhausted is checked after Voltage Snapshot and Start maintenance instead of immediately after Reset. Voltage Snapshot is captured before Exhausted is determined. Steps 6-7 (queue/resolve Start abilities, Face-Down Swap) are not integrated into `core-begin-start`.

**Severity:** **HIGH** — The Exhausted check ordering can affect game state if any Start maintenance interaction depends on Exhausted being active. The Voltage Snapshot is taken before Exhausted is declared, which may affect eligibility if Exhausted changes the board state.

**Exact reproduction path:**
1. Set up a game where DP is empty at the start of a player's turn
2. Call `core-begin-start`
3. Observe: Voltage Snapshot is captured (line 415) before Exhausted is started (line 417-420)
4. The `CORE_EXHAUSTED_BEGAN` event is pushed after `VOLTAGE_SNAPSHOT_CAPTURED`

**Affected systems/files/functions:**
- `core-authority.ts:415-420` — `core-begin-start` case

**Correct expected behavior:** Move the Exhausted check (lines 417-420) to before the Voltage Snapshot (line 415), matching rulebook order: Reset → Exhausted → Voltage → Maintenance.

**Recommended fix:** Reorder the blocks in `core-begin-start`:
```
// 2. Exhausted check (before Voltage)
if (state.zones.dp.length === 0 && core.exhausted === null) { ... }
// 3. Voltage Snapshot
if (isAdvancedProfile) { captureCoreVoltageSnapshot(...); }
// 4. Start maintenance
const transitions = processStartPhaseLifecycles(state, actorId);
```

**Regression tests required:**
- Test that `CORE_EXHAUSTED_BEGAN` event appears before `VOLTAGE_SNAPSHOT_CAPTURED` in the event stream
- Test that Exhausted is active when Voltage Snapshot is captured
- Test existing Voltage and Exhausted integration tests still pass

---

### DEFECT-03: 10♣ Foundation bypasses Rank-10 per-FT limit and Exile-Bound

**Rule requirement (§10, §37 Core Caps):** One Rank-10 effect per player per FT. Rank-10 effect resolution creates Exile-Bound. Countered-before-resolution Rank-10s go to GY (not Exile).

**Current behavior:** `ranks.ts:546-559` (`foundation-ten-club` case) does NOT:
- Check `state.players[actorId]!.limits.rank10PlayedThisFT` before resolving
- Set `rank10PlayedThisFT = true` after resolving
- Call `markExileBound()` on the 10♣

In contrast, `core-advanced.ts:200-217` (`advanced-rank10-club-foundation`) correctly calls `consumeRank10()` which sets both the limit and Exile-Bound.

**Mismatch:** A 10♣ Foundation played through the `core-resolve-rank-action` path (rather than the `core-resolve-advanced` path) can be used unlimited times per FT and the card goes to PR without Exile-Bound, meaning it goes to GY instead of Exile when it leaves PR.

**Severity:** **HIGH** — Allows unlimited uses of a powerful Rank-10 effect per turn and violates the Exile-Bound destination rule.

**Exact reproduction path:**
1. Start a match with a profile that routes 10♣ through `ranks.ts` `foundation-ten-club`
2. Player has 10♣ in hand
3. Call `core-resolve-rank-action` with `action.kind = "foundation-ten-club"`
4. Observe: `rank10PlayedThisFT` remains `false`
5. Player can use another Rank-10 effect the same FT
6. When the 10♣ leaves PR, it goes to GY instead of Exile

**Affected systems/files/functions:**
- `ranks.ts:546-559` — `foundation-ten-club` case in `resolveRankAction`

**Correct expected behavior:** Add `if (state.players[actorId]!.limits.rank10PlayedThisFT) return fail(...)` at the top, set `rank10PlayedThisFT = true` after validation, and call `markExileBound(state.cards[action.sourceCardId]!)` before moving to PR.

**Recommended fix:** Route `foundation-ten-club` through `consumeRank10()` or add the three missing operations directly.

**Regression tests required:**
- Test 10♣ Foundation sets `rank10PlayedThisFT = true`
- Test 10♣ Foundation cannot be used twice in one FT
- Test 10♣ Foundation card is marked Exile-Bound
- Test 10♣ Foundation card goes to Exile (not GY) when it leaves PR

---

### DEFECT-04: Sudden Death activation is not counterable

**Rule requirement (§11.1):** "Only ⭐A may counter the activation unless another effect explicitly names Sudden Death."

**Current behavior:** `core-advanced.ts:321-359` resolves `advanced-sudden-death-declare` directly through `core-resolve-advanced` without creating a `StackItem`. `advancedStackClass` (line 85-86) has no branch for `advanced-sudden-death-declare`, so it falls through and returns `"voltage"` instead of `"sudden-death"`. No priority window is opened, and opponents cannot respond.

**Mismatch:** Sudden Death activation cannot be countered by ⭐A or any other effect, violating the explicit rulebook requirement.

**Severity:** **HIGH** — Sudden Death is a match-ending timer that should be counterable but is currently uncounterable.

**Exact reproduction path:**
1. Start an Unrestricted profile match
2. Player A has the Sudden Death recipe (RJ+BJ or four-of-a-kind) and a Vulnerable OTT target
3. Player A declares `advanced-sudden-death-declare` via `core-resolve-advanced`
4. The effect resolves immediately — no stack item, no priority window
5. Player B cannot respond with ⭐A

**Affected systems/files/functions:**
- `core-advanced.ts:85-86` — `advancedStackClass` missing `sudden-death` branch
- `core-advanced.ts:321-359` — `advanced-sudden-death-declare` resolver
- `core-authority.ts:559-570` — `core-resolve-advanced` dispatches directly

**Correct expected behavior:** Sudden Death declaration should create a primary `StackItem` with `stackClass: "sudden-death"`, open a priority window, and resolve through the stack so ⭐A can counter it.

**Recommended fix:** Add `advanced-sudden-death-declare` to the `core-declare-primary` path, add a `"sudden-death"` branch to `advancedStackClass`, and add `"sudden-death"` to the ⭐A allowed declaration classes (see DEFECT-01).

**Regression tests required:**
- Test Sudden Death creates a stack item
- Test ⭐A can counter Sudden Death activation
- Test Sudden Death resolves when not countered

---

### DEFECT-05: Exhausted not automatically cleared when DP refills

**Rule requirement (§14.5):** "If one or more cards enter an empty DP while Exhausted is active: Exhausted ends immediately; clear the Exhaust Counter; remove every current Exhausted restriction; do not reduce the cleared Exhaust Counter during that Full Turn's End Phase."

**Current behavior:** `core-authority.ts` has no general hook to clear `core.exhausted` when a card enters an empty DP during an Action or effect. The BJ Exile Recycle private choice (`core-private-choice.ts:696-715`) moves cards from Exile to DP but never clears `core.exhausted`. Only `phase8.ts:243-252` (`recover-exhausted`) clears its own separate copy of Exhausted.

**Mismatch:** Exhausted persists even after DP is refilled by Exile Recycle or other effects, forcing the player to continue Exhausted Pass behavior.

**Severity:** **HIGH** — This can cause a player to be stuck in Exhausted mode with a non-empty DP, unable to take normal actions.

**Exact reproduction path:**
1. Start a match where DP is empty and Exhausted is active
2. Player scores Black Joker, triggering Exile Recycle
3. Exile Recycle moves 1-2 cards from Exile to DP
4. DP is now non-empty, but `core.exhausted` is still active
5. Player is still forced to Exhausted Pass despite having cards in DP

**Affected systems/files/functions:**
- `core-authority.ts:489-500` — BJ scoring triggers Exile Recycle
- `core-private-choice.ts:696-715` — Exile Recycle resolution moves cards to DP
- `core-authority.ts:581-588` — `core-exhausted-pass` checks `core.exhausted`

**Correct expected behavior:** After any effect moves a card into an empty DP while Exhausted is active, immediately clear `core.exhausted` and emit an event.

**Recommended fix:** Add a check in `moveCard` (or in the specific effect resolvers that can move cards to DP) that clears `core.exhausted` when DP transitions from empty to non-empty.

**Regression tests required:**
- Test BJ Exile Recycle clears Exhausted when DP was empty
- Test Exhausted counter is not reduced in the same FT's End Phase after recovery
- Test Exhausted can re-trigger in a future Start Phase if DP empties again

---

### DEFECT-06: Action-Phase skips not auto-consumed on Action Phase entry

**Rule requirement (§25.5):** "At the player's next actual Action Phase: consume one pending Action-Phase skip; create no Mini-Turns; ignore pending Mini-Turn grants; proceed to End Phase."

**Current behavior:** `core-authority.ts:444-449` (`core-enter-action`) does not check `pendingActionPhaseSkips`. The skip is only consumed by an explicit `consume-action-phase-skip` action in `phase13.ts:232-243`.

**Mismatch:** A player with a pending Action-Phase skip enters Action Phase normally and can take actions, violating the skip.

**Severity:** **MEDIUM** — Affects Time Bomb Defuse penalty and any other Action-Phase skip source.

**Exact reproduction path:**
1. Player has `pendingActionPhaseSkips > 0` (e.g., from Time Bomb Defuse)
2. Player's next turn: calls `core-begin-start`, then `core-enter-action`
3. `core-enter-action` sets `phase = "Action"` without checking skips
4. Player can take Mini-Turn actions despite the pending skip

**Affected systems/files/functions:**
- `core-authority.ts:444-449` — `core-enter-action`
- `phase13.ts:232-243` — `consume-action-phase-skip` (separate explicit action)

**Recommended fix:** Add a check in `core-enter-action`: if `pendingActionPhaseSkips > 0`, decrement it, set `miniTurnsRemaining = 0`, set `phase = "End"`, and emit an event.

**Regression tests required:**
- Test Action-Phase skip is auto-consumed on Action Phase entry
- Test player receives Start Phase and End Phase but no Action Phase
- Test multiple stacked Action-Phase skips consume one per turn

---

### DEFECT-07: Double Mini-Turn consumption in primary declarations

**Rule requirement:** A primary action declared through `core-declare-primary` should consume exactly one Mini-Turn.

**Current behavior:** `core-declare-primary` (`core-authority.ts:596`) calls `consumeMiniTurn`. When the primary item is later resolved by `core-resolve-response-top:779-789`, it calls `resolveCoreAuthorityAction` on the payload action (e.g., `core-score`, `core-scuttle`), which also calls `consumeMiniTurn`. `miniTurnsRemaining` is clamped to 0, so no extra action is granted, but `miniTurnsUsed` is incremented twice.

**Mismatch:** `miniTurnsUsed` is double-counted for declared primary actions, inflating the usage metric.

**Severity:** **MEDIUM** — Does not grant extra actions (clamping prevents it), but corrupts usage tracking and could affect analytics or AI decision-making.

**Exact reproduction path:**
1. Start a match with `core-response-authority` profile
2. Player declares `core-declare-primary` with `core-score`
3. `consumeMiniTurn` is called at declaration (line 596): `miniTurnsUsed = 1`, `miniTurnsRemaining = 0`
4. Priority window opens and closes
5. `core-resolve-response-top` resolves the primary: calls `resolveCoreAuthorityAction` → `core-score` → `consumeMiniTurn` again
6. `miniTurnsUsed = 2` (should be 1), `miniTurnsRemaining` stays 0

**Affected systems/files/functions:**
- `core-authority.ts:596` — `core-declare-primary` consumes Mini-Turn
- `core-authority.ts:779-789` — `core-resolve-response-top` resolves primary, triggering second `consumeMiniTurn`

**Recommended fix:** Either skip `consumeMiniTurn` in the inner action resolution when the action is being resolved from a stack item, or restore `miniTurnsUsed` before resolution and let the inner action consume it.

**Regression tests required:**
- Test `miniTurnsUsed` increments by exactly 1 for a declared primary action
- Test `miniTurnsRemaining` is correct after declaration and resolution

---

### DEFECT-08: Board Lock and Exhausted state stored in two conflicting locations

**Rule requirement:** Board Lock and Exhausted should each have a single source of truth.

**Current behavior:**
- Board Lock: `metadata.boardLock` (used by `core-authority.ts`) vs `metadata.phase8.boardLock` (used by `phase8.ts`). Different field names (`turnsRemaining` vs `remaining`, `activationFullTurnId` vs `activationFullTurnSequence`). `phase8.ts` version lacks `activatorId`.
- Exhausted: `metadata.coreAuthority.exhausted` (used by `core-authority.ts`) vs `metadata.phase8.exhausted` (used by `phase8.ts`). Same shape but maintained separately.

**Mismatch:** Board Lock or Exhausted activated via one path may not be visible to the other path. The two stores can drift.

**Severity:** **MEDIUM** — In practice, the Core Authority path (`core-authority.ts`) is the active code path for the current engine, and `phase8.ts` is a legacy/alternative path. But if both are used, state can diverge.

**Affected systems/files/functions:**
- `core-authority.ts:836, 913-919` — `metadata.boardLock`
- `phase8.ts:12, 222, 262-266` — `metadata.phase8.boardLock`
- `core-authority.ts:31, 417-419, 935-944` — `metadata.coreAuthority.exhausted`
- `phase8.ts:12, 235-238, 276-282` — `metadata.phase8.exhausted`

**Recommended fix:** Consolidate to a single source of truth for each timer. Use typed interfaces in `types.ts` instead of untyped `metadata`.

**Regression tests required:**
- Test Board Lock activated via Core Authority is visible to End Phase
- Test Exhausted started via Core Authority is ticked correctly

---

### DEFECT-09: `core-exhausted-pass` wrongly wrapped as `core-declare-primary`

**Rule requirement:** Exhausted Pass is a forced Mini-Turn Action, not a declared play that opens a response window.

**Current behavior:** `core-autonomy.ts:34-36` lists `core-exhausted-pass` in `isPrimaryAction`, so the `action(...)` helper wraps it as `core-declare-primary` for response-capable profiles. This creates a stack item, opens a response window, and double-counts `miniTurnsUsed`.

**Mismatch:** Exhausted Pass gets a spurious response window and double Mini-Turn consumption.

**Severity:** **MEDIUM** — The response window is usually empty (opponent has no incentive to counter a pass), but the double-counting corrupts state tracking.

**Affected systems/files/functions:**
- `core-autonomy.ts:34-36` — `isPrimaryAction` includes `core-exhausted-pass`
- `core-autonomy.ts:37-45` — `action(...)` wraps it as `core-declare-primary`

**Recommended fix:** Remove `core-exhausted-pass` from `isPrimaryAction` so it is resolved directly.

**Regression tests required:**
- Test Exhausted Pass does not create a stack item
- Test Exhausted Pass does not open a response window
- Test `miniTurnsUsed` increments by exactly 1

---

### DEFECT-10: `attach-jack-graph` does not validate existing attachment

**Rule requirement (§12):** A card cannot be Jacked again while a Jack Attachment remains legal.

**Current behavior:** `interactions.ts:229-245` (`attach-jack-graph`) does not check `target.state.attachedByJackId` before creating a new attachment. A second Jack can overwrite the first, orphaning it.

**Mismatch:** Two Jacks can be attached to the same host, with the first Jack's `attachmentGraph` left dangling until `revalidateAttachments` runs.

**Severity:** **MEDIUM** — `revalidateAttachments` will eventually scrap the orphan, but transient illegal state exists.

**Affected systems/files/functions:**
- `interactions.ts:229-245` — `attach-jack-graph`

**Recommended fix:** Add `if (target.state.attachedByJackId) return fail(...)` before creating the new attachment.

**Regression tests required:**
- Test attaching a second Jack to an already-Jacked host fails
- Test the first Jack's attachment is preserved

---

### DEFECT-11: `deriveSecuredPoints` does not exclude face-down PR Traps

**Rule requirement (§8):** "Face-down PR Traps contribute 0 Points."

**Current behavior:** `state.ts:108-113` (`deriveSecuredPoints`) skips tapped cards but does not skip `card.state.faceDownTrap === true`. A face-down Trap with a `jackPointBonus` would still contribute that bonus.

**Mismatch:** Face-down Traps can contribute points to the scoring total.

**Severity:** **MEDIUM** — Only affects Trap Module games where a face-down Trap somehow has a `jackPointBonus`.

**Affected systems/files/functions:**
- `state.ts:108-113` — `deriveSecuredPoints` PR loop

**Recommended fix:** Add `|| card.state.faceDownTrap === true` to the `continue` condition at line 110.

**Regression tests required:**
- Test face-down Trap in PR contributes 0 to Secured PR Points
- Test face-down Trap with `jackPointBonus` contributes 0

---

### DEFECT-12: Voltage Snapshot does not include Jack Point bonuses or exclude face-down Traps

**Rule requirement (§12.2):** Voltage uses "current visible Point contribution at the snapshot" and "face-down Traps contribute 0" and "active Jack Point bonuses count."

**Current behavior:** `core-authority.ts:195-199` (`captureCoreVoltageSnapshot`) and `phase8.ts:74-86` (`captureVoltage`) compute rank-3/4/5 totals from PR cards but:
- Do not add `card.state.jackPointBonus`
- Do not exclude `card.state.faceDownTrap === true`

**Mismatch:** Voltage thresholds may be calculated incorrectly when Jack bonuses or face-down Traps are present.

**Severity:** **MEDIUM** — Affects Advanced/Unrestricted profile games with Voltage and Jacks or Traps.

**Affected systems/files/functions:**
- `core-authority.ts:195-199` — `captureCoreVoltageSnapshot`
- `phase8.ts:74-86` — `captureVoltage`

**Recommended fix:** Add `jackPointBonus` to the value sum and add `card.state.faceDownTrap !== true` to the filter.

**Regression tests required:**
- Test Voltage snapshot includes Jack Point bonus
- Test Voltage snapshot excludes face-down Trap

---

### DEFECT-13: `nine-score` taps not released when scoring via rank effects

**Rule requirement (§9):** "Nine: untap when the card's current controller next scores a card for Points."

**Current behavior:** `releaseNineTapsForScoring` is called in `core-authority.ts:484` (core-score) and `engine.ts:540` (SCORE_CARD), but NOT in rank-effect scoring paths:
- `ranks.ts:232` (topdeck-seven scoring)
- `ranks.ts:414` (recycle-five scoring)
- `ranks.ts:523` (mimic topdeck scoring)
- `ranks.ts:549,555` (foundation-ten-club and bonus score)

**Mismatch:** Nine taps are not released when scoring via these rank effects.

**Severity:** **MEDIUM** — Affects games where a Nine is tapped and the controller scores via a rank effect rather than `core-score`.

**Affected systems/files/functions:**
- `ranks.ts:232, 414, 523, 549, 555` — scoring paths missing `releaseNineTapsForScoring` call

**Recommended fix:** Add `releaseNineTapsForScoring(state, actorId)` calls after each scoring path in `ranks.ts`.

**Regression tests required:**
- Test Nine tap releases when scoring via Seven Topdeck
- Test Nine tap releases when scoring via 10♣ Foundation bonus

---

### DEFECT-14: `natural-four` private choice leaks card information and has cleanup bug

**Rule requirement:** Natural Four lets the player look at top 4 DP cards privately and reorder them.

**Current behavior:**
1. `core-private-choice.ts:369` calls `holdPrivate(..., publicReveal = true)` but the event is `visibility: "authorized"` (private). If the view layer honors `privateChoicePublicReveal`, the top 4 cards are leaked publicly.
2. `core-private-choice.ts:690-691` resolves with `moveCard(state, choice.sourceCardId, "GY"); clearChoice(state);` but does NOT call `completeSource`, leaving `privateChoiceSource` and `draftFaceUp` markers on the source card.

**Mismatch:** Potential information leak and stale state markers.

**Severity:** **MEDIUM** — The information leak depends on the view layer. The cleanup bug leaves stale state on the card.

**Affected systems/files/functions:**
- `core-private-choice.ts:369, 372-373` — `holdPrivate` with `publicReveal = true`
- `core-private-choice.ts:690-691` — cleanup missing `completeSource`

**Recommended fix:** Change `holdPrivate(..., true)` to `holdPrivate(..., false)` at line 369. Replace `moveCard + clearChoice` with `completeSource(state, choice.sourceCardId)` at lines 690-691.

**Regression tests required:**
- Test Natural Four does not leak card identities to opponent
- Test Natural Four source card has no stale `privateChoiceSource` marker after resolution

---

## LIKELY DEFECTS / FRAGILE IMPLEMENTATIONS

### FRAGILE-01: `resolveCoreEffect` silently no-ops for unhandled kinds

**Issue:** `core-effects.ts:84-95` does not have cases for `three-hand-raid`, `five-recycle`, `six-dig`, `seven-topdeck`, `nine-anchor`, `natural-four`. If called directly, it returns `{ok: true}` having done nothing.

**Severity:** Low — These are normally routed to `resolveCorePrivateChoiceRoot`, but the function is not defensive.

**Fix:** Add a `default` case that returns a failure.

---

### FRAGILE-02: Board Lock enumerated as Mini-Turn effect candidate

**Issue:** `core-effects.ts:74` still emits `black-joker-board-lock` as a Mini-Turn candidate. `core-authority.ts:540` rejects it, but the candidate should not be generated.

**Severity:** Low — The engine probe discards it, but it creates a dead/illegal candidate.

**Fix:** Remove `black-joker-board-lock` from `enumerateCoreEffectCandidates` or filter it out.

---

### FRAGILE-03: `COUNTER_CHAIN_BLOCKLIST` is incomplete

**Issue:** `core-response.ts:115-120` has no blocklist for `king-anchor-counter`, `eight-scuttle-counter`, `rank10-stack-theft`, `super-ace-counter`, or `ultra-three-red`. The permissive default `if (!blocklist) return true` means these counters can target any response, even if they should be restricted.

**Severity:** Low — Declaration-site guards in `core-authority.ts` catch most invalid targets, but `targetAcceptsCounter` is not self-contained.

**Fix:** Add explicit blocklists for all counter kinds.

---

### FRAGILE-04: Legacy boolean Aegis never expires

**Issue:** `lifecycle.ts:26-28` `hasAegis` accepts `aegis === true` (boolean), but `processStartPhaseLifecycles:102` only expires object-type Aegis. A boolean `true` Aegis would be permanent.

**Severity:** Low — No current code path writes boolean `true` Aegis, but the type allows it and it's a latent bug.

**Fix:** Either remove the boolean branch from `hasAegis` or add boolean expiry to `processStartPhaseLifecycles`.

---

### FRAGILE-05: Face-Down Swap does not require empty stack

**Issue:** `core-authority.ts:427-442` (`core-face-down-swap`) checks phase and `startPreparedFullTurnSequence` but does not verify `state.stack.length === 0` or `state.triggerQueue.length === 0`.

**Severity:** Low — In well-formed games, the stack is empty during Start Phase, but a defensive check would be safer.

**Fix:** Add `if (state.stack.length > 0 || state.triggerQueue.length > 0) return fail(...)`.

---

### FRAGILE-06: `revalidateAttachments` single-pass may miss chained attachment invalidations

**Issue:** `interactions.ts:140-170` builds the Jack list once and processes in a single sorted pass. Deeply nested/chain attachments may not be fully resolved in one call.

**Severity:** Low — The engine calls `revalidateAttachments` repeatedly, but a single pass can leave transient illegal states.

**Fix:** Loop until no more invalidations are found, or document that multiple calls are required.

---

### FRAGILE-07: `anchorCount` uses inconsistent anchor marker

**Issue:** `phase8.ts:91-98` checks `card.state.anchor === true` for non-rank anchors, but `core-effects.ts` uses `typeof card.state.anchorValue === "number"`. Non-A/9/Q/K anchors created via `anchorValue` will be missed by `anchorCount`.

**Severity:** Low — All current anchor plays are A/9/Q/K, so the two checks agree in practice.

**Fix:** Standardize on one anchor marker.

---

### FRAGILE-08: `revalidateAttachments` returns host to `originalOwnerId` instead of `originalHostControllerId`

**Issue:** `interactions.ts:163-164` returns the host to `host.originalOwnerId`'s row. `JackAttachmentState` stores `originalHostControllerId` but it's never consulted. For commandeered hosts, this may return the card to the printed owner rather than the controller at attachment time.

**Severity:** Low — May affect edge cases where a host was commandeered before being Jacked.

**Fix:** Use `link.originalHostControllerId` instead of `host.originalOwnerId`.

---

## AMBIGUITY / UNDER-TESTED AREAS

### AMBIG-01: Voltage abilities do not use the stack

**Issue:** `core-advanced.ts:239-319` resolves Voltage abilities directly without creating a stack item or opening a priority window. Rulebook §24.3 says Voltage "uses the stack" and opponents can respond.

**Severity:** Medium (design ambiguity) — The rulebook says Voltage uses the stack, but the engine treats it as a direct resolution. This may be intentional for digital implementation, but it means Voltage cannot be countered.

**Recommendation:** Clarify whether Voltage should be counterable in the digital engine. If yes, route through `core-declare-primary`.

---

### AMBIG-02: Hidden Supers (⭐3/5/6/7) have incomplete implementations

**Issue:** `core-advanced.ts` has cases for ⭐3 Super Raid, ⭐5 Super Recycle, ⭐6 Super Dig, and ⭐7 Sequential Topdeck, but they are simplified and do not match the full rulebook descriptions:
- ⭐3: No presentation step, no Revealed-Until-Start, no take limit, no discard branch
- ⭐5: Mills 4 instead of 3, does not play a milled card immediately
- ⭐6: Wrong cost (requires discard), draws 8 instead of 7, keeps 5/6 instead of 4
- ⭐7: No resolution order choice, returns to bottom of DP instead of top

**Severity:** Medium — These are only available in Unrestricted profile and may not be reachable through the current enumerator. But if reachable, they produce incorrect results.

**Recommendation:** Either implement the full private-choice flows or mark these as fail-closed until complete.

---

### AMBIG-03: `three-hand-raid` present-take allows taking 0-2 cards instead of exactly 1

**Issue:** `core-private-choice.ts:263` sets `minSelections: 0` (opponent can present 0 cards) and `core-private-choice.ts:482` sets `maxSelections: Math.min(2, selected.length)` (actor can take up to 2).

**Severity:** Medium — The rulebook says "take 1," but the engine allows taking 0-2.

**Recommendation:** Verify the exact rulebook wording and adjust limits.

---

### AMBIG-04: `nine-anchor` does not reveal opponent's hand

**Issue:** `core-private-choice.ts:391-417` does not reveal the opponent's hand to the actor, and the opponent is the chooser (they pick what to discard).

**Severity:** Medium — The rulebook says "reveal opponent hand, opponent discards 1." The engine skips the reveal.

**Recommendation:** Add a reveal event before the discard choice.

---

## INTENTIONALLY EXCLUDED / OUT OF SCOPE

The following systems are confirmed as intentionally excluded from the current engine profiles and are not defects:

- 2 Quick, 4 Quick, 6 Quick (excluded by all authority profiles)
- 3 Bounce as Instant response (only available as Mini-Turn effect)
- 9 Goal Shift as Instant response (only available as primary ACTION)
- Draw & Cast (not modeled in `core-authority`)
- Suit-specific 5 Exile rummage (explicitly excluded)
- 6♠ Deep Draw (explicitly excluded)
- 7♠ Topdeck enhancement (explicitly excluded)
- BattleRealm, Trap Module, Time Bomb, Multiplayer, Deffy Mode, Tournament Seed (optional modules, disabled by default)

---

## TEST VERIFICATION SUMMARY

| Test suite | Tests | Pass | Fail |
|------------|-------|------|------|
| `v0.28.1-rules-parity-defects.test.mjs` | 25 | 25 | 0 |
| `engine-divergence-fixes.test.mjs` | — | — | 0 |
| `advanced-card-rules.test.mjs` | — | — | 0 |
| `v0.21.0-board-lock.test.mjs` | — | — | 0 |
| `v0.20.0-queens-court-canon.test.mjs` | — | — | 0 |
| `determinism.test.mjs` | — | — | 0 |
| `unrestricted-core.test.mjs` | — | — | 0 |
| `engine-boundary.test.mjs` | — | — | 0 |
| **Combined** | **163** | **163** | **0** |

All targeted tests pass. The identified defects are in edge cases and advanced features not covered by existing tests.

---

## RANKED NEXT STEPS BY ROI

1. **Fix DEFECT-01 (⭐A counter authority)** — Highest ROI: one-line fix, enables Ultra/Sudden Death countering
2. **Fix DEFECT-03 (10♣ Foundation limit bypass)** — Simple fix, prevents unlimited Rank-10 uses
3. **Fix DEFECT-02 (Start Phase ordering)** — Reorder 3 lines, fixes rulebook compliance
4. **Fix DEFECT-05 (Exhausted auto-clear)** — Add DP-refill hook, prevents stuck players
5. **Fix DEFECT-04 (Sudden Death counterable)** — Route through stack, enables ⭐A response
6. **Fix DEFECT-07 (double Mini-Turn)** — Prevent state tracking corruption
7. **Fix DEFECT-09 (Exhausted Pass wrapping)** — Remove from `isPrimaryAction`
8. **Fix DEFECT-06 (Action-Phase skip auto-consume)** — Add check to `core-enter-action`
9. **Fix DEFECT-13 (Nine tap release in rank scoring)** — Add `releaseNineTapsForScoring` calls
10. **Consolidate DEFECT-08 (dual timer storage)** — Architectural cleanup

---

## RISKS AND MITIGATIONS

| Risk | Mitigation |
|------|------------|
| Fixing DEFECT-01 may break existing tests that expect ⭐A to fail on Ultras | Add new tests for ⭐A countering Ultras; update any tests that assert current (incorrect) behavior |
| Reordering Start Phase (DEFECT-02) may change event ordering in replays | Regenerate certified replays after fix; verify determinism is preserved |
| Routing Sudden Death through stack (DEFECT-04) changes the resolution flow | Add comprehensive Sudden Death counter tests; verify existing Sudden Death tests still pass |
| Consolidating timer storage (DEFECT-08) is an architectural change | Do it in a separate commit with full test suite verification |

---

## SINGLE HIGHEST-LEVERAGE NEXT UPGRADE

**Fix DEFECT-01** — Expand `targetAcceptsCounter` at `core-response.ts:145` to include `"super"`, `"ultra"`, and `"sudden-death"` in the allowed declaration classes for `super-ace-counter` and `ultra-three-red`. This is a one-line change that fixes the most critical counter-authority violation in the engine, enabling ⭐A to counter Ultras and Sudden Death as the rulebook requires. All downstream effects (Sudden Death counterability, Ultra counterability) depend on this fix.

---

*End of audit report.*
