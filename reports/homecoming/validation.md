# Homecoming validation

September 30, 2026 — America/New_York. This record covers local implementation and verification. No production service, deployment, or release certification is asserted.

## Latest rail-layout correction

Remove the duplicate opponent-hand panel and decorative summary fans; each summary retains one compact, accessible hand count. Move Game Log into the lower-left rail beneath Pending Plays and Academy support. History fills the remaining desktop height; an expanded pending sequence and long event history scroll independently. Suggestions, moves and Composer occupy the full right rail. Narrow history is full-width and bounded, while actions retain their bottom sheet.

Local checks for this layout: build, client typecheck, focused lint, 18 canonical browser scenarios at six desktop and two narrow sizes, and seven focused UI scenarios. The new focused case renders twelve pending public plays and forty events in the actual React board/CSS at 1440×900 and 1024×576, verifies independently scrollable regions and viewport fit, and exercises keyboard collapse/reopen and log filters. Fixtures verify presentation only. Logs are retained under `.homecoming-baseline/rail-layout/`; the full root suite was not repeated for this presentation-only change. See [canonical browser report](browser-report.json), [focused report](action-rail-report.json), and [expanded short-height rail](left-rail-expanded-1024x576.png).

## Preceding move-label and interaction correction

The latest presentation changes fix fragmented suit labels and remove unnecessary confirmation. Complete actions and suggestions play on click; single scalar Composer choices play from the rail or battlefield. Multi-parameter declarations, editable multi-card sets and Forfeit keep their commit step. Controls remain visibly disabled until an in-flight submission finishes, including when the host supplies its next frame before acknowledgement completes.

Checks completed for that correction: build, root/client typecheck, lint (zero errors; 423 existing warnings), 73 client tests and the 18-scenario canonical browser journey. Six additional focused browser scenarios render the actual React board and CSS with controlled fixtures: exact attachment-label geometry at 1440/1024/390px, rapid duplicate clicks with a next-frame-before-acknowledgement race, single target selection in the rail and on the board, editable multi-part declarations, and a smaller legal card set extended to a larger one before commit. These fixtures test presentation behavior; canonical engine legality is covered separately by client tests and the real-session browser journey. See [focused browser report](action-rail-report.json) and [corrected attachment label](action-label-1440.png).

Logs for this correction are under `.homecoming-baseline/action-polish/`. The full root suite below passed before this move-label/interaction correction and was not repeated for this UI-only change; it is historical evidence, not a current full-suite certification. The browser harness now observes projected decision changes for suggestions because a phase transition can advance the frame without appending a log event. Academy panel assertions wait for the asynchronous render to settle.

## Repository and authority boundary

- Destination: `H:\myProjects\Intrilex-MASTER\Intrilex_dev-current`, baseline HEAD `5df83b0cf6778b6c025dcee4ebc325f0dc07aafa`.
- Donor: `H:\myProjects\Intrilex-MASTER\browser-tabletop`, HEAD `782966336509dcc816888a3918ece2fd515a3725`, inspected read-only.
- The destination already contained 1,773 working-tree changes. The migration preserves existing work; the baseline commit does not identify a clean release tree.
- The separate Intrilex-rules checkout was unavailable. The destination runtime, manifests and Official Rules v4.3.1 supplied authority.
- Current checkout HEAD: `41feafd07a2ef6fc7e76ae854af3d3bc8ddc2aa8`, the Homecoming commit recorded on September 30, 2026. Verification covers the saved working tree on top of that commit, including the visual fidelity correction, projected own-player HUD limits, and evidence updates. This implementation run did not create or modify commits, merge, or upload.

## Commands and measured results

Commands run from the destination directory. Raw visual-correction logs are retained locally under `.homecoming-baseline/visual-correction/`. The [machine-readable validation record](validation.json) distinguishes current focused checks from earlier broad results and includes source/lockfile SHA-256 fingerprints. The prior [self-audit.json](../self-audit.json) predates this visual correction and is not a fresh certification of it.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` (earlier migration) | PASS; initial install repaired stale copied workspace dependency links. The final lockfile also installs successfully with Playwright included. |
| `pnpm run build` | PASS; canonical generation, browser bundling, tactical CSS imports and build checks completed. |
| `pnpm run typecheck` | PASS; root and client TypeScript gates. |
| `pnpm run lint` | PASS; zero errors, 423 existing warnings. |
| `pnpm run test:client` | PASS; 73 passed, zero failed or skipped, including 29 Homecoming tests. |
| `pnpm run test:privacy` (earlier standalone run) | PASS; 3 passed, zero failed or skipped. |
| `pnpm run test:determinism` (earlier standalone run) | PASS; 4 passed, zero failed or skipped. |
| `pnpm run test:network` (earlier standalone run) | PASS; 307 passed across 12 suites, zero failed or skipped. |
| `pnpm run test:homecoming:browser` | PASS; 18 scenarios, zero browser JavaScript errors, including the explicit tabletop presentation regression. |
| `node --test test/play-module.test.mjs` (earlier standalone run) | PASS; 51 tests. |
| `node --test test/v0.21.0-a11y-automated.test.mjs` (earlier standalone run) | PASS; 27 tests against the saved build. |
| `pnpm run self-audit:generate` (earlier standalone run) | PASS; 5,228 tests: 5,214 passed, zero failed, 14 skipped; canonical score 97 against threshold 92; all critical gates true. |
| `node --test test/self-audit-truth.test.mjs` (earlier standalone run) | PASS; 16 tests, zero failures or skips. |
| `pnpm test` (before the move-label/interaction correction) | PASS; 5,245 tests across 93 suites: 5,231 passed, zero failed, 14 skipped; zero cancelled or todo; 368,837.1975 ms. |

The preceding root-suite run includes the network terminal/rematch regressions, privacy and determinism checks, and the own-player HUD projection regression. Test accounting reconciles: 5,245 = 5,231 passed + 14 skipped. The earlier standalone checks and canonical audit are preserved above as historical evidence; they were not separately repeated during this correction.

## Presentation and authority proof

The focused tests traverse 382 real canonical decision frames and 2,511 original action variants from Advanced Core, Unrestricted Core and First Contact, with seeds 12345 and 67890. Every offered variant resolves back to its original action ID; local and network action projections agree; sampled submissions execute through the existing authority.

Additional cases cover impossible Cartesian combinations, exact multi-card sets, incomplete-set rejection, ordered component/assignment roles, explicit ambiguous declarations, timing separation, unknown mechanics, private-choice restrictions, hidden Swap slots, stale four-field intent rejection, immutable semantic snapshots, chat snapshot identity, suggestion ID filtering, duplicate descriptor conflicts, terminal forfeit authentication/idempotency, replay request correlation and rematch admission boundaries.

The pure presentation bundle test verifies that it imports neither a donor engine nor the authority runtime. The browser inspects outgoing `SUBMIT_ACTION` payload keys: original action ID, revision and frame identity are present; raw command bodies and source-handle arrays are absent.

## Actual browser journeys

Chrome `154.0.8037.58`, headless through Playwright. See [the complete browser report](browser-report.json).

- Mount canonical local Play with Homecoming as the default.
- Verify desktop viewport fit and visible critical regions.
- Verify plain playing cards, four-slot tracks, opponent/Swap/player/Pending panel order, and the separate history/action rails.
- Click a card to focus legal moves; double-click or use Inspect for its reference.
- Activate Composer with the keyboard, cancel with Escape and restore family focus.
- Select Swap through Composer and board picks, then confirm through the authority.
- Click a complete Suggested Move and advance the canonical decision without an extra confirmation.
- Open the actual Advanced Card Rules inspector and reorder the hand cosmetically.
- Save and refresh through the canonical restore handoff, clearing transient Composer state.
- Advance local AI play to a canonical terminal result; retain achievements and replay controls.
- Verify narrow layouts without horizontal document overflow.
- Use Academy objectives, hints and panel controls, and start Guided Exhibition.
- Create and join a two-seat Direct Duel against the existing match server.
- Submit an online Composer action and verify the wire payload contract.
- Send/receive chat beside the board.
- Refresh, reconnect to the same online match and rotate its participant token.
- Forfeit through the canonical terminal/outbox path; download certified replays from both seats.
- Request and accept a rematch, ready both seats and return both to Homecoming.

The harness starts an ephemeral in-memory server on loopback with development authentication disabled, routes only the test browser configuration to it, and closes it afterward. It uses no production credentials. Live authenticated production ranking is NOT RUN; it requires the production account/service environment and lies outside this local test boundary.

## Visual verification

Automated geometry checks verify document fit and positive, in-viewport critical regions at all six desktop sizes:

| Size | Artifact |
| --- | --- |
| 1024×576 | [Screenshot](desktop-1024x576.png) |
| 1280×720 | [Screenshot](desktop-1280x720.png) |
| 1366×768 | [Screenshot](desktop-1366x768.png) |
| 1440×900 | [Screenshot](desktop-1440x900.png) |
| 1920×1080 | [Screenshot](desktop-1920x1080.png) |
| 2560×1440 | [Screenshot](desktop-2560x1440.png) |
| 390×844 | [Full-page narrow screenshot](narrow-390.png) |
| 768×844 | [Full-page narrow screenshot](narrow-768.png) |

The first implementation missed the requested visual target. The correction ports the donor playing-card markup and scoped visual recipes, player panels, slot tracks, pile trays, hand tray, composed right rail and narrow action sheet. Live donor Full-profile captures and explicit adaptations are in [visual comparison](visual-comparison.md). Direct inspection covered the smallest desktop, occupied Point Row, Composer, narrow board, Academy and online states. At short heights the rail scrolls internally; no pixel equality or complete pile-browsing claim is made.

Additional artifacts: [live donor Full profile](donor-full-1440x900.png), [Composer](composer-1440x900.png), [occupied battlefield](midgame-1440x900.png), [Academy](academy-1440x900.png), [online Play](online-1440x900.png), [local results](local-terminal-1440x900.png), [online results](online-terminal-1440x900.png).

## Honest remaining boundaries

Classic is retained temporarily under `?board=classic`. Caster's custom rail/visible-hand consumer and Guided Exhibition retain their established presentations. Full exceptional-mechanic, theme and specialized playback/teaching parity remains the deletion gate.

The log displays the canonical recent public-event window, not a full transcript. Piles expose only canonical counts and the provided visible top card. A full pile browser would need an additional authorized projection.

The root suite's 14 existing skips comprise one unavailable historical vendor-engine corpus and 13 service-worker tests skipped because the existing PWA kill switch is active. No offline-service-worker claim is made.

Earlier unsuccessful runs remain in ignored local logs. The new visual regression initially over-specified capitalization of the AI name; its corrected assertion verifies player ownership and panel order. Final browser verification covers the rebuilt, saved presentation. The donor preview server closed after capture; only the intended Intrilex preview remains running.

See [architecture and integration](../../docs/INTRILEX_HOMECOMING.md) and [complete patch notes](../../docs/HOMECOMING_PATCH_NOTES.md).
