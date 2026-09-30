# Intrilex Homecoming patch notes

September 30, 2026 — local implementation and verification; no deployment.

## Gameplay presentation

- Default active local Play, Direct Duel, and Academy to the new `IntrilexGame` presentation through the existing `mountGameTable` entry point.
- Add the three-column battlefield: player summaries, Swap Bar and Pending Plays on the left; four battlefield rows, shared piles and hand in the center; decisions, log and chat on the right.
- Add landscape Point Row tiles with prominent rank and suit, preserving canonical markers and the existing card art.
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
- Invalidate Composer on session, seat, revision or frame changes. Preserve the store's submission lock and accepted-boundary checks.
- Support keyboard activation and Escape cancellation. Restore family focus by stable family ID when React replaces its button.

## Safe projection and guidance

- Carry a validated canonical timing class alongside its human-readable label.
- Resolve Swap Bar targets to public slot positions before network privacy scrubbing. Use synthetic positional references in the semantic model.
- Expose only whitelisted private-choice option cards to their authorized chooser.
- Allow the mount to coalesce repeated identical original action descriptors. Conflicting same-ID descriptors still fail closed; the semantic API remains strict by default.
- Reuse the existing value-policy scorer for at most two current legal suggestions. Filter forged IDs and duplicates; never auto-submit or consume authoritative RNG.
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
