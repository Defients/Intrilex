You are a senior product engineer, interaction designer, game-UX architect, and visual-systems specialist operating directly inside the existing **Intrilex** codebase.

Your mission is to **inspect, design, implement, verify, and polish Intrilex Match UI v2.5**.

This is not a mockup exercise and not a speculative redesign. Treat the current repository as the source of implementation truth, the requirements below as the intended product direction, and runtime/browser/DOM inspection (where the environment permits) as the primary means of validating layout, hierarchy, and interaction behavior. Deliver a finished, production-quality v2.5 implementation while preserving game correctness.

No image inputs exist. Never request them. Treat all visual direction in this specification as textual product requirements. Do not search for, request, or wait for screenshot references. They are not part of this task.

---

# 0. PRIMARY OBJECTIVE

Upgrade the current Match UI implementation found in the repository into **Intrilex Match UI v2.5**.

The current implementation is the architectural baseline. A previous-generation tactical cockpit (the "legacy" direction) is described textually in this specification as a source of capabilities and information density that should not have been lost; GLM is **not** expected to locate a legacy screenshot or legacy implementation unless such implementation actually exists in the repository.

The fundamental design judgment is already made:

> **The current repository architecture is the foundation. Do not regress into the legacy fragmented cockpit pattern.**

The target is:

> **A physical playmat interpreted through a high-end tactical HUD.**

Not:

* a developer dashboard,
* a generic SaaS interface,
* a Hearthstone clone,
* a recreation of the legacy layout,
* a giant permanent action menu,
* or visual spectacle without information hierarchy.

The v2.5 upgrade must preserve the current architecture's superior clarity while reintroducing the strongest tactical qualities that the legacy direction exposed:

* action discoverability,
* phase/window/priority awareness,
* high information utility,
* game-state immediacy,
* physical-card character,
* and stronger Intrilex identity.

The governing formula is:

> **v2.5 = current architecture + recovered tactical intelligence + stronger interaction affordances + controlled Intrilex identity.**

---

# 1. OPERATING MODE

Work autonomously.

Do not ask for clarification unless execution is genuinely impossible because information required for correctness does not exist anywhere in the repository or this specification.

Before changing code:

1. inspect the relevant application structure;
2. identify the Match UI entry points;
3. locate shared layout/components/state/selectors/hooks;
4. understand the actual game-action legality model;
5. determine existing responsive behavior;
6. inspect the card renderer and all board-zone components;
7. identify existing design tokens/themes;
8. inspect tests around match interaction;
9. determine which visual deficiencies are architectural versus merely styling-related.

Where interactive inspection is possible, also:

1. locate the Match UI code;
2. run or inspect the application if environment/tooling permits;
3. inspect DOM/component/layout structure;
4. inspect CSS/Tailwind/design tokens;
5. identify whitespace, sizing, overflow, hierarchy, and interaction behavior from implementation evidence;
6. use browser/runtime inspection where available;
7. fall back to repository structure and explicit requirements if interactive preview is unavailable.

Reason deeply **privately**. Do not expose chain-of-thought. Maintain a concise implementation decision log instead.

Do not blindly obey assumptions in this prompt when repository evidence proves them incorrect. Preserve the intended UX outcome while adapting implementation details to the real architecture.

---

# 2. AUTHORITY HIERARCHY

When evidence conflicts, use this priority:

1. **Game-engine correctness / legal action state**
2. **Current repository contracts and data models**
3. **Explicit v2.5 requirements in this prompt**
4. **Current Match UI architecture in the repository**
5. **Existing product design system/theme conventions**
6. **Historical/legacy code only if present and useful in the repository**
7. **Incidental current styling**
8. **Model aesthetic preference**

Never modify game mechanics merely to make the UI easier to implement.

Never fake legal actions.

Never infer legality from card rank/suit when the engine already exposes authoritative legal-action data.

Never duplicate rules logic in the presentation layer unless the existing architecture explicitly requires it.

---

# 3. NON-NEGOTIABLE PRODUCT PRINCIPLES

## 3.1 Preserve the current Match UI's information architecture

Preserve the current Match UI's broad vertical semantic architecture unless repository inspection reveals a clearly superior implementation path:

**Opponent identity/state**
↓
**Opponent Point Row + Enduring Row**
↓
**Shared tactical state**
↓
**Player Point Row + Enduring Row**
↓
**Player identity/state**
↓
**Hand / action command surface**

Do not regress into a fragmented full-screen cockpit in which scoring, logs, piles, actions, player state, and resolution all compete with equal visual authority.

---

## 3.2 Recover tactical discoverability

The legacy direction exposed most legal action categories simultaneously.

The current UI hides too much behind labels such as:

> `2 actions offered`

v2.5 must make legal actions immediately discoverable **without restoring the legacy permanent right-side action wall**.

The primary solution is a **context-sensitive Action Dock**.

---

## 3.3 Let importance control visual dominance

The interface must change emphasis according to match state.

Examples:

* Empty resolution stack → quiet.
* Active stack → visually dominant.
* Normal action phase → hand and Action Dock dominate.
* Reaction window → reaction affordances dominate.
* Invalid action → exact failing object and missing requirement dominate.
* Full board → zones adapt without destroying card readability.

Static geometry may remain stable, but **attention hierarchy must react to state**.

---

## 3.4 Physicality over database presentation

Cards, deck, discard, exile, swap slots, scoring zones, and resolution items should feel like manipulable game objects.

Avoid presenting core physical concepts as mere numeric database counters wherever reasonable.

Do not overdo skeuomorphism.

Aim for:

> **tactile abstract card-game physicality inside a precision digital HUD.**

---

# 4. V2.5 REQUIRED IMPROVEMENTS

Implement all requirements below unless repository constraints make one objectively harmful. If adapting one, document why and preserve its underlying intent.

---

# 4A. VIEWPORT OWNERSHIP

The current layout is visually centered inside too much unused desktop space.

At 16:9 desktop resolutions, especially approximately 1920×1080 and 2048×1080:

* the match should visually own the viewport;
* horizontal whitespace should be dramatically reduced;
* excessive unused space above the main board should be removed;
* maintain sufficient breathing room without making the board look like an embedded website.

Target approximately:

* `92–96vw` usable match width on large desktop;
* sensible maximum width around the high-1800px range if appropriate to existing architecture;
* compact outer gutters;
* stable layout at 1920×1080;
* graceful scaling below that resolution.

Do not merely set `width: 100%` and declare success.

Inspect actual geometry through runtime/DOM/layout inspection where available, or through component/CSS analysis otherwise. Treat the numerical layout values above as targets, not as evidence of any pre-existing state.

---

# 4B. PERSISTENT MATCH-STATE STRIP

Introduce persistent mechanical orientation showing turn, phase, timing/window state, current actor, priority, and response state.

The player should be able to determine at a glance:

* turn number,
* major phase,
* timing/window state where applicable,
* current actor,
* priority holder,
* whether the player can act,
* whether a response is pending.

Combine machine-precise state with human-readable instruction.

Example conceptual hierarchy:

**TURN 1 · ACTION**
`PROACTIVE WINDOW` · `YOUR PRIORITY`
**Choose your action**

Do not hardcode these labels.

They must derive from authoritative match state.

Use concise semantic chips/badges. Avoid turning the header into a giant status wall.

The instructional line should have lower visual authority than the actual mechanical state for veteran users.

---

# 4C. CONTEXT-SENSITIVE ACTION DOCK

This is the most important v2.5 interaction addition.

Create a persistent but context-sensitive **Action Dock** associated with the player's command area.

## No card selected

Display globally relevant legal actions such as, when applicable:

* Draw
* Take Swap
* Pass
* other engine-authorized global actions

Only show actions that are actually legal or clearly mark contextually known-but-disabled actions where explaining them provides genuine utility.

Do not produce a graveyard of permanently disabled buttons.

## One card selected

The Action Dock should identify the selected card and enumerate its currently legal meaningful actions.

Conceptually:

**FIVE OF SPADES**
Recycle / Rummage
Score 5
Super available ×1
Details

Exact actions must come from the engine/state layer.

## Multiple-card selection

When a legal multi-card combination becomes possible, morph the Action Dock appropriately rather than displaying unrelated single-card actions.

Example:

**SUPER PLAY READY**
5♠ + 5♦
[Declare Super]

or relevant actual Intrilex behavior.

## Target selection

If an action requires a target:

1. lock the action context;
2. visually identify legal targets;
3. dim or suppress impossible targets;
4. explain what is being selected;
5. retain a clear cancel/back path.

Example:

**Choose a Point Row card to clear**
`3 legal targets`

## Reaction windows

If a pending resolution allows counters/responses:

* Action Dock should pivot into response mode;
* valid counters become obvious;
* irrelevant normal-turn actions recede.

## Interaction requirements

Selection should produce meaningful visual state:

* selected card elevation,
* semantic glow/border,
* selected-state persistence,
* legal targets,
* invalid targets,
* hover state,
* keyboard/focus state.

Do not depend solely on color.

---

# 4D. HAND AS COMMAND CENTER

The hand is the player's highest-frequency interaction surface.

Treat it accordingly.

Preserve the current card readability:

* rank,
* suit,
* card name,
* compact mechanical identity,
* visual art,
* relevant availability cues.

Replace awkward software-like copy such as:

> `2 actions offered`

with concise game-facing language such as:

> `2 actions`

or:

> `2 legal actions`

Use whichever best fits existing typography.

Do not overcrowd card faces with every available command.

The card answers:

> **What am I?**

The Action Dock answers:

> **What can I do with this right now?**

Use the unused right side of the hand region intelligently for the Action Dock on desktop where space permits.

---

# 4E. DYNAMIC RESOLUTION / MATCH FOCUS REGION

The current large central panel wastes too much dominant space when simply stating:

> The stack is clear.

Replace this behavior with a dynamic **Match Focus / Resolution region**.

## Empty resolution state

Keep it compact and calm.

Example:

**Your priority**
No pending effects.

or use the space for the active-turn focal state.

## Active resolution state

Increase visual dominance.

Clearly communicate:

* source card/action,
* acting player,
* target,
* stack depth,
* pending effect,
* current responder,
* legal response window.

Example conceptual presentation:

**RESOLUTION**

A♠ — Exile Counter
→ targeting Four of Spades
→ awaiting opponent response

Do not use these exact cards unless state requires them.

## Multiple stack items

The interface must communicate ordering.

Use a readable stack/queue representation without turning the screen into debug telemetry.

---

# 4F. EVENTS → SEMANTIC MATCH HISTORY

Preserve the current Events concept but make it useful.

The collapsed surface should show a short recent history rather than occupying a panel with only:

> Start

Prefer concise semantic lines:

**YOU** drew 1
**HYBRIX** scored 7♣ → 7/21
**YOU** declared 4♠
**HYBRIX** countered with A♠

Newest events should be most visually prominent.

Older events may fade subtly.

Provide access to a fuller forensic history via expansion, drawer, modal, or equivalent if existing architecture supports it.

Do not make raw engine/debug strings the default user experience.

Any developer-specific telemetry should be hidden behind an explicit debug/developer mode.

---

# 4G. SHARED PILES AS PHYSICAL OBJECTS

The Draw / Discard / Exile panel has become too abstract.

Preserve compactness while restoring card-game physicality.

## Draw pile

Visually communicate approximate thickness.

For example:

* high count → visibly substantial stack;
* medium count → medium stack;
* low count → thin stack;
* zero → explicit exhausted state.

The exact number remains visible.

This matters because draw-pile exhaustion can be strategically significant.

## Discard

Represent accumulation.

## Exile

Give Exile a distinct visual identity from Discard.

Do not simply present three identical boxes with three integers.

---

# 4H. SWAP BAR

Preserve the current Swap Bar architecture.

Improve:

* card size where space permits;
* tactile affordance;
* hidden-card treatment;
* visible-card distinction;
* legal-interaction states;
* slot occupancy;
* hover/focus;
* selected swap target.

When a swap card becomes actionable, use a subtle spatial response such as:

* slight elevation,
* brighter face,
* semantic slot outline.

Avoid gratuitous animation.

---

# 4I. POINT ROW / ENDURING ROW SCALABILITY

Current empty-state presentation is clean.

Do not optimize only for the empty state.

Design explicitly for:

* 0 cards,
* 1 card,
* 3 cards,
* 5 cards,
* 8+ cards if game state permits it.

Avoid shrinking cards into illegibility.

Preferred adaptive techniques may include:

* controlled overlap,
* horizontal scroll,
* clipped fan layout,
* focus-on-hover expansion,
* responsive density modes.

Point Row and Enduring Row should remain visually distinguishable.

The player must understand that secured scoring and persistent effects are different semantic zones.

---

# 4J. PLAYER / OPPONENT IDENTITY

Avoid exposing internal enum/debug identifiers such as:

> `hybrix-rusher-easy`

unless that is actually intended player-facing naming.

Prefer presentation like:

**Hybrix Rusher**
`AI · EASY`

or whatever matches canonical product naming.

Preserve useful information:

* hand count,
* secured points,
* score goal,
* active-turn state,
* opponent/player distinction.

Strengthen the current player-cyan / opponent-purple language if consistent with existing themes.

---

# 4K. CHAT

The floating chat window in the current layout must not obscure gameplay or player cards.

Preferred behavior:

### Collapsed

A small dock/tab, e.g.:

`CHAT · 2`

### Expanded

Either:

* reserve/reflow layout space,
* open a docked rail,
* or use a controlled overlay that does not cover high-priority action surfaces.

Do not cover:

* hand cards,
* Action Dock,
* active target choices,
* critical stack information.

Chat is secondary to game interaction.

---

# 4L. ERROR HANDLING

Replace vague failure language wherever enough information exists to provide actionable feedback.

Bad:

> Action was not accepted. Review the current choices and try again.

Better:

> **Cannot play 4♠ yet**
> Choose one of 3 legal Point Row targets.

Or:

> **Super unavailable**
> This declaration requires another eligible Five.

Exact copy must reflect actual rules.

Requirements:

* identify the failure near the relevant interaction;
* highlight missing/invalid target where possible;
* retain valid current selection after failure whenever safe;
* offer a clear correction path;
* global toast may summarize but must not be the sole explanation;
* error state must be accessible and not rely on red alone.

A failed action should teach the player how to recover.

---

# 4M. SEMANTIC VISUAL LANGUAGE

Use color as a consistent game-state vocabulary rather than decoration.

Calibrate existing tokens/themes before inventing new colors.

Desired semantic direction:

* **Cyan** → player agency / current self / actionable self-state
* **Purple** → opponent / reactive opponent context
* **Gold** → scoring / commitment / premium consequence
* **Amber** → pending resolution / unresolved attention
* **Red** → illegal / destructive warning / failure
* **Muted blue-gray** → inert public information

Do not force these values where the existing design system already establishes stronger canonical semantics.

Color must not be the only signal.

Pair with:

* iconography,
* typography,
* border treatment,
* elevation,
* labels,
* spatial state.

---

# 4N. INTRILEX IDENTITY

v2.5 should feel more unmistakably Intrilex without returning to visual noise.

The current interface risks becoming too much like a polished generic SaaS dashboard.

Recover identity using controlled application of:

* board texture,
* card physicality,
* geometric motifs,
* CosmoTech-compatible visual language,
* Corrupture-compatible accent potential,
* semantic glow,
* fine-line ornament,
* restrained motion,
* distinctive state transitions.

Avoid:

* random neon,
* excessive gradients,
* permanent bloom,
* unreadable microtext,
* giant decorative frames,
* animation without game meaning.

The board should become more visually dramatic **when the game becomes dramatic**.

---

# 4O. LEFT NAVIGATION / MATCH CHROME

The current compact left rail is cleaner than the legacy chrome but overly cryptic.

Improve:

* icon clarity,
* active-state distinction,
* hover/focus states,
* tooltips,
* brand presence,
* spacing,
* accessibility.

Consider a compact Intrilex wordmark or stronger crest treatment where appropriate.

Do not waste substantial horizontal space on permanent labels.

---

# 4P. NOVICE ↔ VETERAN INFORMATION DENSITY

Design the system so explanatory verbosity can eventually scale.

The architecture should allow a novice-oriented state such as:

> **Choose your action**
> Select a card or draw.

while veterans can operate mostly from:

> **ACTION · PROACTIVE · YOUR PRIORITY**

If an existing setting, Academy state, profile preference, or mode supports this naturally, integrate with it.

If not, do not invent an entire persistence system solely for v2.5. Instead structure components so verbosity can be altered later without architectural surgery.

---

# 5. RESPONSIVE BEHAVIOR

Primary design target:

**1920×1080 desktop**

Also validate:

* 2560×1440
* 2048×1080-ish ultrawide-adjacent desktop
* 1600×900
* 1440×900
* 1366×768 where feasible

Do not assume mobile support unless the repository already claims it.

At lower desktop widths:

1. preserve card usability;
2. preserve active action affordances;
3. collapse secondary information first;
4. then reduce spacing;
5. only then reduce card dimensions within safe readability bounds.

Never sacrifice action correctness to maintain an aesthetic grid.

---

# 6. MOTION SYSTEM

Motion must explain state changes.

Useful motion:

* card selection lift;
* legal target emphasis;
* stack item entering/leaving;
* score movement;
* Swap card becoming actionable;
* pile count changing;
* phase/window transition;
* Action Dock contextual morph;
* error correction cue.

Avoid:

* constant pulsing,
* endless ambient movement,
* exaggerated bounce,
* overlong transitions,
* motion that delays input.

Suggested interaction timing range:

* micro-state: ~100–160ms
* card/layout emphasis: ~160–240ms
* major state transition: ~220–320ms

Adapt to existing motion tokens.

Honor `prefers-reduced-motion`.

---

# 7. ACCESSIBILITY

v2.5 is not complete unless keyboard/focus behavior remains functional.

Verify:

* visible focus state;
* logical tab order;
* buttons have meaningful accessible names;
* card selection works without relying exclusively on mouse hover;
* semantic colors maintain adequate contrast;
* hidden information is not exposed through accessible text;
* disabled states are understandable;
* tooltips do not contain essential information unavailable elsewhere;
* reduced-motion preference;
* error announcements where current architecture supports ARIA live regions.

Never leak hidden opponent cards through DOM labels, tooltips, accessibility metadata, debug strings, or alt text.

---

# 8. INFORMATION SECURITY / HIDDEN INFORMATION

Intrilex contains private and hidden card state.

Audit every changed surface for accidental information leakage.

Particularly inspect:

* hidden Swap cards;
* opponent hand;
* private-choice mechanics;
* hover tooltips;
* accessible labels;
* React props rendered accidentally;
* test IDs;
* debug data;
* event history;
* action eligibility descriptions.

The presentation layer must expose only information legally visible to the viewing player.

---

# 9. ARCHITECTURAL EXPECTATIONS

Prefer:

* composition over monolithic match-page JSX;
* reusable semantic components;
* game-state selectors rather than duplicated derivations;
* existing design-system tokens;
* existing Tailwind conventions if the repository uses Tailwind;
* local feature components where abstraction does not yet justify global primitives;
* deterministic state rendering;
* clean TypeScript contracts.

Potential component concepts include:

```text
MatchStateStrip
PlayerIdentityBar
BoardZone
PointRow
EnduringRow
SwapBar
SharedPiles
MatchFocus
ResolutionStack
EventFeed
PlayerHand
CardInteractionState
ActionDock
TargetSelectionPrompt
MatchChatDock
InlineActionError
```

These are conceptual, not mandatory filenames.

Do not refactor unrelated systems merely because they are imperfect.

---

# 10. ACTION-STATE MODEL

Before implementing the Action Dock, map the actual interaction state machine.

At minimum distinguish states equivalent to:

```text
IDLE
CARD_SELECTED
MULTI_CARD_SELECTION
ACTION_SELECTED
TARGET_REQUIRED
REACTION_WINDOW
RESOLUTION_PENDING
INPUT_LOCKED
ERROR_RECOVERY
```

Use the application's real domain terminology where available.

Avoid large collections of unrelated booleans that allow impossible combinations such as:

```text
isSelectingTarget = true
isResolving = true
canPlayNormally = true
```

If the existing architecture already has an authoritative state machine, use it.

---

# 11. TARGETING UX

Target-selection mode must be unmistakable.

When targeting begins:

* Action Dock explains what is needed;
* eligible board objects receive a clear target affordance;
* illegal objects visually recede;
* current source remains selected;
* cancellation remains available;
* no unrelated UI control competes aggressively for attention.

Do not make users guess which objects are clickable.

After target confirmation:

* immediately show the declaration entering resolution;
* clear selection only when appropriate;
* update stack/history consistently.

---

# 12. EXTREME-STATE STRESS TEST

Do not validate v2.5 using only an empty-board fixture.

Construct or use test/dev fixtures for a deliberately dense state approximating:

* opponent: 4+ Point Row cards;
* opponent: 3+ Enduring cards;
* player: 4+ Point Row cards;
* player: 3+ Enduring cards;
* all 3 Swap slots occupied;
* 2+ resolution items;
* 6–8 recent Events;
* 6–8 player cards;
* active target selection;
* reaction window;
* chat notification;
* nonzero Discard;
* nonzero Exile;
* draw pile near exhaustion.

Evaluate:

1. overlap;
2. clipping;
3. scroll traps;
4. illegible text;
5. inaccessible controls;
6. visual hierarchy collapse;
7. target ambiguity;
8. z-index conflicts;
9. responsive degradation.

Both empty and dense game states must render intentionally and remain usable. Validate through the available runtime, browser, layout tests, or equivalent implementation-level inspection.

---

# 13. FAILURE MODES TO PREVENT

## Failure 1 — "Just make the current layout wider"

A mediocre implementation may widen containers and change spacing while leaving the actual UX weaknesses untouched.

Prevent this by requiring substantive improvements to:

* phase awareness;
* action discovery;
* dynamic resolution;
* event history;
* targeting;
* piles;
* chat;
* errors.

---

## Failure 2 — Recreating the legacy fragmented cockpit

The legacy layout contains useful ideas but poor macro hierarchy.

Never restore:

* giant permanent action sidebar,
* debug-like Game Log dominance,
* fragmented scoreboard boxes,
* dense full-screen grid simply for information density.

Recover **capabilities**, not geometry.

---

## Failure 3 — Beautifying without improving play

Do not spend the majority of effort on gradients, shadows, or animation.

Every major visual change should answer at least one of:

* What can I do?
* Whose turn is it?
* What is happening?
* What just happened?
* What can I target?
* Why did this fail?
* What is tactically important?

---

## Failure 4 — Duplicating game rules in UI

Do not hand-author card legality logic because it seems easier.

Use authoritative engine-provided actions/selectors.

UI logic may transform authoritative legality into presentation; it must not become a second rules engine.

---

## Failure 5 — Designing only for the empty state

Do not optimize a zero-card opening state while allowing real matches to collapse.

Dense late-game state is a release blocker.

---

# 14. IMPLEMENTATION PHASES

Execute sequentially.

## Phase 1 — Reconnaissance

Inspect the codebase.

Produce internally:

```markdown
### Match UI Architecture
- Entry:
- Layout:
- Match state:
- Legal actions:
- Card renderer:
- Theme system:
- Chat:
- Event history:
- Tests:

### Risks
1.
2.
3.

### Reuse Candidates
- ...
```

Do not stop after reconnaissance.

---

## Phase 2 — v2.5 Design Mapping

Map each requirement to implementation units.

Use:

|| Requirement | Existing Component | Change | New Component? | Risk ||
|| ----------- | ------------------ | ------ | -------------- | ---- ||

Resolve architecture before styling.

---

## Phase 3 — Interaction Model

Implement/fix:

* selection,
* contextual actions,
* target mode,
* reaction mode,
* error recovery.

Do this before ornamental polish.

---

## Phase 4 — Layout

Implement:

* viewport ownership;
* top match-state strip;
* shared-state geometry;
* hand/Action Dock composition;
* chat behavior;
* adaptive board zones.

---

## Phase 5 — Information Surfaces

Upgrade:

* Resolution/Match Focus;
* Events;
* Shared Piles;
* Swap Bar;
* player identities;
* error messaging.

---

## Phase 6 — Visual System

Refine:

* typography hierarchy;
* borders;
* semantic color;
* shadows/glow;
* card elevation;
* board textures;
* theme consistency;
* motion.

---

## Phase 7 — Stress Hardening

Run dense board fixtures and responsive checks.

Fix all clipping/overflow/z-index issues.

---

## Phase 8 — Verification

Run:

* typecheck;
* lint;
* relevant tests;
* build;
* UI/unit/integration tests;
* game-action regression checks.

Add tests where v2.5 introduces meaningful new behavior.

---

# 15. TEST EXPECTATIONS

Test behavior, not cosmetic implementation trivia.

High-value tests include:

### Action Dock

```text
Given no selected card
When global actions are legal
Then only authoritative available global actions appear
```

```text
Given a selected card with two legal declarations
Then the Action Dock exposes exactly those relevant declarations
```

```text
Given an action requiring a target
Then legal targets are marked
And illegal targets cannot be chosen
And cancel exits target mode safely
```

### Stack

```text
Given no pending stack items
Then Match Focus remains visually quiet
```

```text
Given a pending resolution
Then the resolution state becomes primary
And the current responder is explicit
```

### Hidden data

```text
Given a hidden Swap card
Then identity is not exposed through visible text, tooltip, accessible name, or event history
```

### Chat

```text
When chat expands at desktop resolution
Then it does not obscure the player's actionable cards or Action Dock
```

### Dense board

```text
Given maximum practical Point/Enduring density
Then board zones remain navigable and card identities remain readable
```

---

# 16. VISUAL QUALITY BAR

A successful v2.5 should make the following immediately obvious to a player within approximately two seconds:

1. **Whose turn is it?**
2. **Do I currently have priority?**
3. **What can I do?**
4. **What objects are actionable?**
5. **What is resolving, if anything?**
6. **What is my score and the opponent's score?**
7. **Where are my cards?**
8. **What recently happened?**

A veteran should be able to read these primarily through structure and semantic cues without relying on explanatory prose.

A new player should not be confronted by the intimidating action-wall density of the legacy cockpit.

---

# 17. DESIGN MICRO-RULES

Prefer:

* fewer stronger borders;
* clear section hierarchy;
* intentional empty space;
* compact uppercase micro-labels;
* normal-case primary text;
* card-scale typography large enough to scan;
* semantic iconography;
* consistent radii;
* restrained shadows;
* subtle depth.

Avoid:

* microtext below practical readability;
* every panel having identical visual weight;
* identical empty states repeated everywhere;
* excessive cyan borders;
* oversized status boxes;
* permanent glow around every interactive object;
* tooltips as the primary interaction model;
* unlabeled mystery icons.

---

# 18. EMPTY-STATE QUALITY

Repeated:

> No cards in this row

is functional but visually repetitive.

Improve empty states subtly.

They should:

* communicate what the zone is;
* remain low emphasis;
* avoid making empty board space feel broken;
* not compete with active cards.

Possible approaches:

* faint zone glyph;
* tiny concise text;
* subtle patterned drop area.

Do not add tutorial prose to every empty zone.

---

# 19. VISUAL DEPTH HIERARCHY

Use approximately four perceptual layers:

### Layer 0 — Environment

Page / board background.

### Layer 1 — Structural zones

Point Row, Enduring Row, hand tray.

### Layer 2 — Interactive objects

Cards, Swap slots, pile objects, Action Dock.

### Layer 3 — Urgent state

Resolution, targeting, reaction, error.

The user should not need outlines around everything to distinguish these layers.

---

# 20. CARD INTERACTION

Cards should have coherent states:

```text
resting
hovered
focused
selected
actionable
targetable
invalid-target
pending
committed
disabled
hidden
```

Do not create unrelated CSS treatments independently.

Build a coherent state vocabulary.

Selected cards should feel physically lifted from the hand.

Committed/resolving cards should visually feel as though they have moved from possession into game state.

---

# 21. COPY QUALITY

Use player-facing language.

Prefer:

* `Your priority`
* `Choose a target`
* `2 legal actions`
* `Awaiting opponent`
* `Stack clear`
* `Draw pile exhausted`

Avoid:

* `Action offered`
* `State invalid`
* `Operation rejected`
* `Unknown phase`
* internal enum names
* implementation terminology

Debug information may exist behind development-only instrumentation.

---

# 22. PERFORMANCE

Do not introduce avoidable full-board rerenders for trivial transient state.

Pay attention to:

* card lists;
* hover state;
* event feed;
* stack animation;
* ResizeObserver loops;
* expensive blur/glow;
* excessive backdrop filters;
* layout thrashing.

Do not prematurely optimize tiny components, but preserve smooth interaction on ordinary hardware.

---

# 23. THEME COMPATIBILITY

Do not hardwire v2.5 to a single visual skin if the project already supports multiple themes.

Ensure architecture remains compatible with concepts such as:

* Dark,
* Light,
* CosmoTech,
* Corrupture,

where such themes exist in the repository.

Semantic game state should be expressed through theme tokens whenever practical.

Do not invent an entirely separate styling system.

---

# 24. ALLOWED REFACTORING

Refactor when it materially improves v2.5 reliability or removes duplicated UI state.

Good reasons:

* monolithic match component blocks contextual action architecture;
* legal-action rendering is duplicated;
* interaction state is represented by conflicting booleans;
* Match Chat overlay is architecturally coupled incorrectly;
* responsive geometry cannot be corrected without component separation.

Bad reasons:

* unrelated code looks ugly;
* naming preferences;
* replacing libraries for fashion;
* broad design-system rewrite not required by v2.5.

Keep blast radius controlled.

---

# 25. INTERNAL SELF-CRITIQUE LOOP

Before finalizing, privately score the implementation from **0–10** on:

|| Vector                       | Minimum ||
|| ---------------------------- | ------: ||
|| Game correctness preserved   |      10 ||
|| Action discoverability       |       9 ||
|| Turn/window/priority clarity |       9 ||
|| Targeting clarity            |       9 ||
|| Visual hierarchy             |       9 ||
|| Dense-board resilience       |     8.5 ||
|| Desktop space utilization    |       9 ||
|| Card readability             |       9 ||
|| Intrilex identity            |     8.5 ||
|| Accessibility                |     8.5 ||
|| Responsive stability         |     8.5 ||
|| Code maintainability         |     8.5 ||
|| Hidden-information safety    |      10 ||

Any score below its threshold requires another improvement pass before completion.

Additionally ask privately:

1. Did I accidentally recreate the legacy fragmented cockpit?
2. Did I merely beautify the current layout?
3. Is any important legal action harder to discover than before?
4. Does the UI explain why an action failed?
5. Does an active resolution immediately command attention?
6. Can a dense board actually survive?
7. Does anything important depend only on hover?
8. Does chat obscure gameplay?
9. Does hidden information leak anywhere?
10. Does this feel specifically like Intrilex?

Patch failures before reporting completion.

---

# 26. RELEASE-GATE CHECKLIST

v2.5 is complete only when all applicable statements are true:

```text
[ ] Current architecture remains recognizable.
[ ] Match occupies desktop viewport substantially better.
[ ] Turn / phase / window / priority are persistently legible.
[ ] Context-sensitive Action Dock exists.
[ ] Global actions remain discoverable.
[ ] Card-specific legal actions are explicit after selection.
[ ] Multi-card declarations are supported cleanly.
[ ] Target-selection mode is obvious.
[ ] Reaction windows visually reprioritize the UI.
[ ] Empty stack no longer monopolizes the center.
[ ] Active stack becomes appropriately dominant.
[ ] Recent Events provide useful semantic history.
[ ] Full history remains accessible where appropriate.
[ ] Shared piles regain card-game physicality.
[ ] Draw pile visually communicates depletion.
[ ] Swap Bar has stronger tactile affordances.
[ ] PR/ER survive dense game states.
[ ] Chat never blocks critical controls.
[ ] Errors explain how to recover.
[ ] Internal/debug identifiers are removed from normal UI.
[ ] Semantic color system is coherent.
[ ] Intrilex identity is stronger without clutter.
[ ] Keyboard/focus states work.
[ ] Reduced motion is respected.
[ ] Hidden information remains hidden.
[ ] Relevant tests pass.
[ ] Typecheck passes.
[ ] Build passes.
[ ] Dense-board stress state has been validated through runtime/layout inspection.
[ ] 1920×1080 behavior has been validated through the available runtime, browser, layout tests, or equivalent implementation-level inspection.
```

---

# 27. FINAL DELIVERABLE FORMAT

After implementation, return a concise engineering report:

```markdown
# Intrilex Match UI v2.5

## Implemented
- ...

## Major UX Changes
- ...

## Architecture
- ...

## Interaction Model
- ...

## Verification
- Typecheck:
- Tests:
- Build:
- Stress state:
- Responsive resolutions checked:

## Files Changed
|| File | Purpose ||
||---|---||

## Intentional Deviations
- Requirement:
  - Deviation:
  - Reason:
  - Preserved intent:

## Known Limitations
- ...

## v2.5 Self-Audit
|| Vector | Score ||
||---|---:||
|| Game correctness | /10 ||
|| Action discoverability | /10 ||
|| State clarity | /10 ||
|| Targeting | /10 ||
|| Visual hierarchy | /10 ||
|| Dense-board resilience | /10 ||
|| Space utilization | /10 ||
|| Card readability | /10 ||
|| Intrilex identity | /10 ||
|| Accessibility | /10 ||
|| Maintainability | /10 ||
|| Hidden-information safety | /10 ||
```

Do not fill the final report with generic praise.

Report concrete implementation facts.

---

# 28. FINAL DIRECTIVE

Treat this as a **product-quality interaction redesign**, not a CSS facelift.

Protect everything the current architecture fixed.

Recover everything strategically valuable that the legacy direction exposed.

Do not bring back the legacy clutter.

Build v2.5 around a simple principle:

> **The board shows what exists.
> The state strip shows where the match is.
> The hand shows what you possess.
> The Action Dock shows what you can do.
> The Match Focus shows what matters now.
> Events show what just happened.**

When Intrilex is calm, the interface should be calm.

When a tactical decision appears, the relevant objects should become unmistakable.

When the stack erupts, the UI should visibly reorganize attention around it.

When something fails, the interface should teach the recovery path.

When the board becomes dense, the design must become more intelligent rather than simply smaller.

**Inspect first. Implement completely. Test adversarially. Polish deliberately. Ship Intrilex Match UI v2.5.**
