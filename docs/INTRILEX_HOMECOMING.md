# Intrilex Homecoming

The default active Play board now brings browserTabletop's action families, Composer, board selection, and battlefield hierarchy into Intrilex's existing player session. Local play, AI decisions, Direct Duel, and Academy mount `IntrilexGame` through the existing `mountGameTable` bridge. The engine and its command vault remain authoritative.

## Source and ownership

This implementation was developed against destination HEAD `5df83b0cf6778b6c025dcee4ebc325f0dc07aafa` and donor HEAD `782966336509dcc816888a3918ece2fd515a3725`, with existing destination working changes preserved. HEAD identifies the repository baseline, not a clean release tree. The donor checkout was inspected without modification.

The separate `Intrilex-rules` repository was not available in this workspace. Rules authority remains the destination's canonical runtime, its manifests, and [Official Rules v4.3.1](INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md). Donor behavior does not override those sources.

| Donor reference | Destination | Decision |
| --- | --- | --- |
| `apps/web/GameBoard.tsx`, `styles.css`, `e2e/responsive.spec.ts` | `apps/lab-web/src/client/gameplay/IntrilexGame.tsx`, `gameplay.css` | Adapt the battlefield, rails, compact piles, and landscape Point Rows to existing Intrilex cards and theme tokens. |
| `apps/web/ActionPanel.tsx`, `packages/intrilex/presentation.ts` | `gameplay/action-family.ts`, `ActionRail.tsx` | Adapt grouping, compatible options, exact sets, and board picking to original Intrilex action IDs. |
| `packages/intrilex/suggestions.ts` | `gameplay/suggestions.ts` | Reuse Intrilex's existing value-policy scorer with a bounded visible-card input. |
| `apps/web/GameLog.tsx` | `IntrilexGame.tsx` Game Log | Adapt actor colors, chronological order, bounded history, and user-controlled scrolling to canonical public events. |
| `packages/intrilex/actionIdentity.ts` | Existing Intrilex session and `GameStore` | Retain destination identity and submission; do not import donor identity or hashing. |
| Donor engine, reducer, generic tabletop movement, room transport, save format | None | Excluded from the migration. |

## Trust and submission

```text
existing local / network session
    -> authorized snapshot
    -> buildSemanticGame (validation, whitelist, freeze)
    -> GameStore
    -> IntrilexGame / Action Families / Composer
    -> { sessionId, stateRevision, decisionFrameHash, actionId }
    -> existing session validation and private command vault
    -> existing engine
```

The client constructs no engine commands. It chooses one original, currently offered action ID. Confirmation checks the current session, seat, revision, frame hash, and legal membership. The store retains its submission lock and accepted-boundary protection.

Families use structured family, canonical timing class, and appropriate source identity. Unknown mechanics remain separate original actions. Labels never determine membership or legality. Scalar options and multi-card options are filtered from compatible variants. Full multi-card resolution requires exact sets. Ordered roles are preserved for Black Three Ultra components and Seven assignments; indistinguishable descriptions require an explicit exact declaration rather than silently selecting the first ID.

Composer state belongs to React and is keyed to the current session, seat, revision, and frame. A changed boundary immediately invalidates it before effects run. It is never persisted in an authoritative save. Hand reordering is cosmetic and uses the existing local order or network reorder endpoint.

The canonical enumerator can repeat an identical action through more than one discovery path. The mount opts into coalescing **only identical structured descriptors with the same original ID**. Conflicting descriptors still fail closed. The default semantic-model API retains strict duplicate rejection. This presentation normalization changes neither the frame hash nor the command vault.

## Projection additions

- Preserve the validated canonical `timingClass` alongside its display label.
- Derive a public, zero-based `swapSlot` before network privacy scrubbing. Replace Swap targets in the semantic view with synthetic positional IDs; never expose a face-down card identity.
- Expose only the authorized chooser's whitelisted `pendingChoice.optionCards`. Do not read arbitrary choice context or the raw known-card registry. Public and read-only projections omit choices and actions.
- Carry the existing opponent connection status into the status strip.
- Map public event `payload.playerId` to controller attribution in local and server read projections. Events, commands, replay journals, and their ordering are unchanged.

Suggestions call the existing `rankPolicyActionsWithDecomposition('value', ...)` scorer. Input contains validated visible cards and current legal actions, with canonical rank point values. Suggestions filter returned IDs against the current legal set, remove duplicates, and limit the list to two. Advice selects a family or confirmation preview; it never submits automatically, runs lookahead, or consumes authoritative RNG.

## Product integration

The existing shell, routes, profile systems, ranked admission and ratings, analytics, achievement consumers, replay certification, and save format remain in place. The host still advances the existing AI and renders the existing rich terminal screen. Online forfeit uses the existing confirmation and authoritative `match.forfeit` method. Explicit active-match departures now finalize through the existing durable outbox and broadcast path, retaining terminal bindings for authenticated replay and rematch. Lobby departures retain their existing disconnect behavior.

Browser validation also found that `GET_REPLAY` lacked request correlation. It now uses the existing browser-safe protocol envelope builder, preserving the authenticated retrieval and SHA-256 checks. The terminal winner label uses the online opponent's escaped display name rather than labelling a human opponent as AI. The terminal shows the existing authorized rematch invitation with Accept/Decline controls. Successful authenticated admission to a different match opens that lobby without weakening the same-match status guard.

The bridge repairs container replacement during hash navigation, binds online updates to the current container, and discards asynchronous mounts for detached containers or replaced sessions. It also preserves the Academy controller across match setup, forwards its existing panel and coachmarks, displays its hints, and avoids accumulating dismissal listeners.

Manual save and autosave use the existing save envelope and Continue Duel handoff. On document refresh, the handoff restores through the existing session. A live newly created match takes precedence over an old handoff marker. Starting a new local match releases the previous lease and timers through the existing teardown.

Chat has a separate React context consumer. Identical validated game snapshots keep store identity stable, so chat refreshes do not require recalculating the battlefield or action families. The Game Log scrolls internally and follows new entries only while the user is near its bottom.

## Layout and access

Desktop Play uses a viewport-height layout with left summaries / Swap Bar / Pending Plays, four center battlefield rows, compact shared piles and hand, and a right decisions / log / chat rail. Dense regions scroll internally. Empty Pending Plays remains compact. Point Row tiles emphasize rank and suit; canonical card markers remain present.

Composer buttons, board cards, hand reorder, search, and confirmation are keyboard accessible. Escape closes the Composer or card reference, and Composer exit restores focus where the invoking element survives. The Full inspector opens the existing Advanced Card Rules modal with current authorized match context and its existing focus handling. CSS respects reduced motion.

The browser harness checks all six desktop sizes: 1024×576, 1280×720, 1366×768, 1440×900, 1920×1080, and 2560×1440. It also checks active Play at widths 390 and 768. Small layouts allow normal vertical scrolling.

## Verify locally

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run test:client
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run test:privacy
pnpm run test:determinism
pnpm run test:network
pnpm run self-audit:generate
```

For the actual browser journey, run `pnpm run dev` in one terminal, then `pnpm run test:homecoming:browser` in another. The harness uses installed Chrome through Playwright; it fails if Chrome is unavailable. `HOMECOMING_BASE_URL` can select another local frontend origin. It launches its own ephemeral, in-memory development match server for two-seat Direct Duel and closes it afterwards. It does not use production credentials or write to a production match service.

The full test script uses four file workers, matching the self-audit generator, to avoid excessive parallel server startup. All registered test files still execute.

Focused tests include real canonical frames from Advanced Core, Unrestricted Core, and First Contact. Every offered variant must resolve to its original action ID, local and network projections must agree, and sampled submissions execute through the canonical engine. See [Homecoming validation](../reports/homecoming/validation.md) for measured results and browser artifacts.

## Retained transition surfaces and limits

The normal active Play path defaults to Homecoming. `?board=classic` temporarily selects the prior React presentation for parity investigation. Caster's existing custom rail and visible-opponent-hand presentation still use `GameTable`; that is a specialized playback consumer of the same mount contract. Guided Exhibition retains its separate scripted teaching runtime. The rich terminal renderer is retained for results, ratings, achievements, and replay actions.

Legacy deletion remains gated on full teaching, playback, theme, keyboard, and exceptional-mechanic parity. Do not delete the shared Caster presentation or terminal styles simply because active Play now uses Homecoming.

The log shows the public recent-event window supplied by the existing sessions, not a full match transcript. The projection supplies pile counts and the visible Graveyard top, not a full Exile or Graveyard browser. No additional pile identities are inferred. Unsupported mode descriptions fall back to explicit enumerated variants. Live authenticated production ranking and deployment are outside the local browser proof; existing server regression coverage is recorded separately.
