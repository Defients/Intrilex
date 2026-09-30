# Direct Manipulation over legal actions

Implemented in the existing Homecoming rules-assisted gameboard. The separate browser-tabletop project is unchanged. Existing uncommitted Composer and presentation work is retained.

## Player interaction

The header's **Gestures** menu persists **Quick Play Gestures** (default on) and **Confirm Obvious Drag Plays** (default off) in `intrilex:quick-play-settings`, using the existing localStorage preference pattern. Disabling gestures retains card selection, Legal Actions, the Action Composer and keyboard controls.

Grab a legal source card with a mouse, trackpad or pen. Movement below six CSS pixels remains a normal click. Crossing that threshold lifts a portal-rendered copy and fades the origin without collapsing its slot. Only destinations described by current legal actions activate. Approaching a destination uses a dimension-dependent 20–32 CSS pixel activation radius, with at most twelve pixels of positional attraction. Hover displays a presentation-only ghost. Invalid releases return in 140 ms; Escape and interruptions clear the interaction. Reduced-motion preferences remove return and settle motion.

Touch retains native page and hand scrolling. Touch dragging is deliberately disabled in this first implementation; click and keyboard play remain available.

## Authority pipeline

`Pointer Events → SpatialRef intent → resolveDragIntent(current projected game) → GameSession.confirm(actionId) → GameStore.select / submit → existing local or network authority`

`drag-intent.ts` describes existing enumerated actions using their structured family, source handles, target handles and public Swap Bar position. It never inspects card rank to grant legality, reconstructs a command, or predicts a rules result. The resolved actions are the original `SemanticAction` objects. A decision-boundary mismatch, a missing action or a non-ready game produces no match. Submission repeats the existing GameStore validation, and server authority retains seat, revision, frame and action-ID validation.

Supported semantic mappings currently include anchors to the owning Enduring Row, scoring to the owning Point Row, hand-to-Swap-Bar-slot actions, and single-source actions with explicit visible-card, player or pending-play targets. Composite source sets are intentionally left in the existing Composer; dragging one component never implicitly declares a combo.

The framework also exposes `useDraggableSource`, `DragTarget`, `SpatialRef` and a `GestureAdapter` extension point. An ability or pending-play source can supply presentation metadata for already enumerated legal actions without changing pointer handling, ambiguity handling or submission. Metadata cannot create a legal action: matching always filters the supplied authoritative collection.

## King to Enduring Row

An enumerated anchor action for the King makes that hand card draggable and registers the owning Enduring Row as eligible. Hover inserts a ghost in the first open display slot. Release resolves against the live store snapshot. One matching action commits through the same `confirm` function used by the Composer and legal-action buttons, unless a confirmation is required. The existing response window and Pending Plays remain authoritative. The card enters the row only when the normal rules resolution places it there. Hand, actions and Game Log refresh from the normal snapshot. Newly placed row cards have a restrained 140 ms settle animation.

Zero matches cancel. One match executes or opens a lightweight confirmation. Two or more matches hold the local preview and open a destination-anchored chooser containing only matching actions. Arrow keys navigate, Enter chooses, Escape cancels, and focus returns to the source when it remains mounted. The chooser revalidates on selection. The existing Composer's multi-part confirmation policy still applies.

## Lifecycle and performance

Movement uses refs and requestAnimationFrame; gameplay state never contains pointer coordinates. Registered semantic destinations supply transformed viewport rectangles, cached for the active gesture and refreshed on scrolling, observed layout changes and release. Viewport resizing cancels safely. Source removal, destination removal, decision changes, actor or priority changes, game completion, Composer/inspector interruption, Escape, pointercancel, lost capture, window blur, hidden-document transitions and unmount release capture and remove highlights/previews.

Submission uses both the existing in-flight guard and GameStore protections. Rejection uses the normal alert and authoritative snapshot. Gesture coordinates, hover, magnetism and animation are never added to network requests or game logs.

## Verification

- `pnpm run test:direct-manipulation`: matcher, geometry, confirmation policy, stale state, generic source adapters, canonical state/event parity, GameStore request shape and double-submit protection, and server seat/stale-frame validation.
- `pnpm run test:direct-manipulation:browser`: real React/CSS, real GameStore and seeded canonical match authority; King preview and committed placement, illegal drop, ambiguity, keyboard selection, preferences, clicks, interruptions, rejection, narrow layout and transformed geometry. Ambiguity alone uses an explicitly controlled UI fixture; it is not presented as a naturally occurring King rules mode.
- The unit file is registered in the default test command, client command and CI pipeline. The browser harness uses installed Chrome, intercepts its fixture page locally, and needs no published site.
- `pnpm run test:homecoming:browser` additionally exercises a drag through a real local WebSocket match server with two browser seats, verifies one ordinary submission without gesture payload fields, and checks that both authorized projections show the same placed public card.
- Current gate results and screenshots are stored under `reports/direct-manipulation/`. Standard Homecoming browser regressions retain their normal report locations.

## Useful future expansions

Touch hold-to-drag with scroll negotiation; explicit ability/Ultra and pending-play source controls; complete composite-gesture composition; semantic Graveyard/Exile destination metadata where the projected action contract defines that destination. These extensions should describe existing legal actions and reuse the current core.
