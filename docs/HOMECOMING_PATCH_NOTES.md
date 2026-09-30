# Intrilex Homecoming patch notes

September 30, 2026 — local implementation and verification; no deployment.

## Intrilex Brain removal

- Remove the “Explore the Intrilex Brain” homepage section and all 2D/3D Brain runtime modules, styles, mode persistence, lifecycle cleanup and navigation behavior.
- Remove the Three.js dependency, Brain-specific tests and CI stage, certification requirement, generated limitation, roadmap references and deployment chunks.
- Update the landing-page browser smoke check to prove the retired Brain UI is absent.

## Possible Moves stylization

- Give move families distinct accent colors, tinted icon tiles, matching variant-count badges and layered row backgrounds. Use gold for Super/Anchors, teal for scoring, pink for Swap Bar, coral for Scuttle/counters, cyan for Draw, blue for private choices and violet for remaining advanced/wild families.
- Set move names in bold and effect descriptions in italics. Emphasize authorized source/target references with compact suit chips and brighter red/black suit colors on dark surfaces; retain the original move wording and atomic rank/suit wrapping.
- Add compact timing badges, softer supporting text and right-side disclosure marks. Give hover and keyboard focus a family-colored glow; honor reduced motion and keep row positions stable.
- Carry the same family accent into the Composer heading, active parameter, selected options and resolved preview. Retain the original action IDs and submission behavior.
- Capture the real component palette, hover, Composer and phone layout with controlled UI fixtures. Local verification: 48 focused tests, 7 action-rail browser scenarios, 19 rebuilt-app browser scenarios and 10 drag browser scenarios passed; build and both TypeScript checks passed; lint reported 0 errors and 423 existing warnings.

## Left history and focused action rail

- Remove the redundant top-right Opponent Hand panel and decorative player-summary fans. Keep one accessible hand-count indicator beside each player's name, score and goal.
- Start Legal Actions at the top of the right rail and dedicate that column to suggestions, possible moves and Composer.
- Move Game Log below Pending Plays and Academy support in the left column. Give history the remaining desktop height with an internal scroll area, preserving filters, stylized text, keyboard collapse and automatic following near the bottom.
- Let expanded Pending Plays shrink and scroll while retaining visible history. On narrow screens, give history a bounded full-width block and retain the existing action sheet.
- Extend browser checks to assert panel ownership, full-height space use and compact hand indicators at six desktop sizes; exercise an expanded stack and long history at 1440×900 and 1024×576 with controlled UI fixtures.

## Move labels and unnecessary confirmations

- Render move text as one wrapping block instead of separate text/suit flex items. Keep rank and suit together, including ten-value cards, while preserving red/black coloring.
- Play complete move rows and suggestions on click through the existing guarded submission path.
- Play a single scalar Composer choice immediately, whether selected in the rail or on the highlighted battlefield.
- Keep action controls visibly disabled until submission finishes, even when the host publishes its next decision before the request resolves. Retain the existing duplicate and stale-frame guards.
- Keep Confirm for editable multi-parameter moves and multi-card sets, and retain the existing Forfeit confirmation. Partial selections remain editable; no set is committed merely because a smaller legal subset exists.
- Update the canonical browser journey for direct suggested moves and add focused browser coverage of label geometry, duplicate clicks, rail/board single choices, multi-part composition and nested card sets.

## Visual fidelity correction

The first Homecoming implementation preserved Astra's illustrated cards and substituted a different visual system, which missed the requested near-same browserTabletop interface. This correction ports the donor's actual presentation and updates the review evidence.

- Use pale playing-card faces, red/black suit coloring, corner indices, large suit centers, landscape Point Row tiles, and the donor's blue card backs. The new `TabletopCard` reads only validated identities; classic/Caster retain their established cards.
- Restore violet opponent and cyan player seat panels with badges, secured/goal values and compact hand counts. Place the Swap Bar between the opponent and player panels.
- Render four visible slot tracks per battlefield row, expanding for additional public cards. Use the donor's rounded borders, panel gradients, dotted surface, and glowing Line of Scrimmage.
- Restore stacked landscape Draw/Graveyard/Exile trays and a smaller hand strip with scroll arrows; retain cosmetic reorder controls.
- Put Suggested Moves, Possible Moves, search/filter controls and Composer inside one Legal Actions panel, with tabbed Game Log in the left rail. Add donor-style visual card options to the Composer.
- Click a card to focus legal moves; double-click or use the Inspect control to open the existing reference and Full inspector.
- Read your Mini-Turn count and Swap use from the existing authorized projection. Keep opponent-only limits and unavailable pile contents out of the UI.
- Use the donor's narrow-screen action sheet with explicit Show/Hide controls. Keep desktop density tied to viewport height and internal rail scrolling.
- Capture a live donor Full-profile room using its existing build and an isolated temporary database, then compare it with rebuilt Intrilex screenshots. Add a browser regression scenario for playing-card faces, slot tracks, panel hierarchy, and card selection behavior.

## Gameplay presentation

- Default active local Play, Direct Duel, and Academy to the new `IntrilexGame` presentation through the existing `mountGameTable` entry point.
- Add the three-column battlefield: player summaries, Swap Bar, Pending Plays and history on the left; four battlefield rows, shared piles and hand in the center; suggestions, decisions and Composer on the right, with floating match chat.
- Add landscape Point Row tiles with prominent rank and suit, preserving canonical markers.
- Keep opponent hands concealed. Display only the provided pile counts and visible Graveyard top.
- Make empty Pending Plays compact. Keep populated regions internally scrollable and preserve desktop viewport fit.
- Add narrow layouts that retain all controls and allow vertical scrolling.

## Action Families and Composer

- Group current enumerated actions using structured family, timing and source descriptors.
- Keep unknown mechanics as separate explicit original actions.
- Show only parameters that vary; show constant sources and targets in the confirmation preview.
- Restrict source, target, mode and Swap slot options to compatible original variants.
- Require complete exact multi-card sets. Preserve ordered Ultra component and Seven assignment roles.
- Require an explicit variant selection when descriptors cannot distinguish legal IDs.
- Highlight board cards that are current Composer options, and allow board-assisted picks through the same selection functions.
- Render partial picks as selected without treating a subset as a completed declaration.
- Submit only the current original action ID through the existing four-field intent contract.
- Let the Draw Pile shortcut select directly only when exactly one draw action is offered. Multiple variants use Composer or the explicit Legal Actions list.
- Invalidate Composer on session, seat, revision or frame changes. Preserve the store's submission lock and accepted-boundary checks.
- Support keyboard activation and Escape cancellation. Restore family focus by stable family ID when React replaces its button.

## Safe projection and guidance

- Carry a validated canonical timing class alongside its human-readable label.
- Resolve Swap Bar targets to public slot positions before network privacy scrubbing. Use synthetic positional references in the semantic model.
- Expose only whitelisted private-choice option cards to their authorized chooser.
- Allow the mount to coalesce repeated identical original action descriptors. Conflicting same-ID descriptors still fail closed; the semantic API remains strict by default.
- Reuse the existing value-policy scorer for at most two current legal suggestions. Filter forged IDs and duplicates; submit only on the player's click and never consume authoritative RNG.
- Attribute public events using the existing controller or player fields. Keep chronological, actor-colored logs with internal scrolling and conditional follow behavior.

## Host and mature product integration

- Rebind board subscriptions when hash navigation replaces the route container.
- Dispose detached mounts and discard stale asynchronous mount work.
- Preserve the Academy controller across local match setup and forward its existing objectives, coachmarks and hint actions.
- Display Academy hint text and adapt objective text and buttons to the narrow rail.
- Correct the Full inspector bridge to resolve the currently authorized card before opening the existing Advanced Card Rules dialog.
- Route manual save and autosave through the existing canonical envelope and Continue Duel handoff. A live new match takes precedence over an older restore marker.
- Release the preceding local session's lease and timers when starting another match.
- Separate chat's React consumer from the memoized gameplay component. Identical safe snapshots retain store identity.
- Repair refresh reconnect when the URL already names the online match route.

## Terminal and network repairs found in browser validation

- Explicit active-match departure now calls the existing authoritative forfeit method and finalizes through the existing persistence/outbox/broadcast path.
- Authenticate the departing seat before changing the match. Repeated terminal departure acknowledgments do not repeat finalization.
- Retain terminal connection bindings for certified replay retrieval and rematch. Preserve lobby departure behavior.
- Give browser replay requests the existing protocol envelope's correlation ID, allowing the pending request to resolve.
- Preserve authenticated replay retrieval and existing SHA-256 verification.
- Display the escaped human opponent's name on an online loss, preserving the local AI winner label.
- Render the existing authorized rematch invitation with Accept/Decline controls. Successful admission to a different match opens its lobby while same-match status regressions remain blocked.
- Permit an existing terminal connection to join the rematch through normal invite admission, preserving active-match and spectator binding defenses. Recheck the binding after asynchronous authorization before admitting the seat.
- Dispatch network lobby and active updates through the status-aware host, including when the match route's hash already matches.
- Keep the existing rich results, rank, achievement and replay screen.

## Build and validation tooling

- Bundle tactical CSS imports through esbuild so the new stylesheet is inlined and fingerprinted.
- Correct the React DOM `flushSync` import and existing client callback/type issues exposed by the client type gate.
- Register the Homecoming regression file in both the root test scripts and CI test list.
- Use four file workers for the full test script, matching canonical self-audit generation and avoiding excessive concurrent development server startup.
- Add Playwright and a real Chrome browser harness for viewport fit, board picking, keyboard focus, inspector, save/restore, local AI, Academy, Guided Exhibition and two-seat online play.
- Refresh the generated self-audit through its real generator and align the local static engine mirror with the canonical runtime. No upload was performed.

## Preservation and transition

The donor checkout remains read-only. No donor engine, room transport, reducers, action hashing or save format is imported. Intrilex's rules engine, private command vault, authorized sessions, AI orchestration, replay certification, account/rating/ranking systems, analytics, achievements and routes remain the existing systems.

The working tree already contained substantial user changes. These notes describe this migration's additions and repairs, not the entire repository diff.

Classic is retained temporarily under `?board=classic`. Caster's specialized rail/opponent-hand consumer and Guided Exhibition retain their established presentations. Deletion is gated on their remaining presentation parity, including themes and exceptional mechanics.

See [architecture and integration](INTRILEX_HOMECOMING.md) and [measured validation](../reports/homecoming/validation.md).
