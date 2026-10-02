# Intrilex — Replay Caster continuity and evidence

Date: October 2, 2026 (America/New_York).

Status: implemented and verified in the local working checkout; release blockers are recorded below.

## Project understanding and chosen direction

The canonical checkout is `Intrilex_dev-current` inside the `Intrilex-MASTER`
workspace. The other release/new-match snapshots and the standalone
`browser-tabletop` are separate trees. This pass preserved the substantial
pre-existing Foundation rules, engine, deployment and sample-data changes.
Its initial source diff and status are saved in ignored
`reports/local/evolution-20261002/`.

Intrilex already has a deterministic rules engine, local/AI play, authoritative
online duels, ranked accounts/seasons, replay certification, Academy, tournaments,
decision traces, analytics and counterfactual workspaces. Homecoming already
provides structured action families, exact composition, legal-action submission,
board picking and optional drag gestures. Replay Caster already has completed
match playback, deterministic/optional Ollama commentary, public/omniscient views,
WAIT WHAT captures, annotations and investigation exports.

The strongest demonstrated gap in this inspection was continuity of replay
evidence: asynchronous commentary could outlive its beat or route, exports
included future information, and an apparent runner-up branch offered no usable
replay anchor. This pass closes those defects in the existing playback journey.

## Major changes

### Commentary remains attached to the current replay context

- Every commentary request receives a session revision. A newer request,
  replacement match, mode/cache change or explicit cancellation invalidates it.
- Provider tokens are forwarded only while their request and beat remain current.
- Late results cannot populate history, cache or generation/failure telemetry.
- Provider exceptions become contained commentary failures; playback continues.
- Browser handling additionally checks the active container, route lifecycle,
  current session, request and beat before applying output or errors.
- Each new beat clears the old headline, body and tone before rendering loading.
- Route cleanup invalidates pending renders. A connected shared page container
  cannot authorize an old Caster render after another route has taken ownership.
- Ordinary shell refreshes on the same Caster route preserve valid in-flight
  commentary rather than creating a new ownership lifecycle.

### Public investigation context is actually redacted

- Public future context preserves beat IDs and sequence numbers as navigation
  anchors. Future scores, beat kinds, actions, decisions and outcome metadata
  are absent. A future match-ending beat no longer identifies itself prematurely.
- The UI labels these entries `Future beat (hidden)`.
- Replay seeds are omitted from viewer beat summaries and past-context captures.
  The seed remains in the authoritative completed match/replay.
- Viewer modes accept only Public or Omniscient; unknown inputs use Public.
- Viewer changes clear existing commentary and WAIT WHAT captures so private
  context cannot be reused in subsequent Public prompts or investigations.
- Commentary history records its viewer mode alongside existing provenance.

### Investigation and navigation have a coherent lifecycle

- WAIT WHAT pauses the director and stops its playback timer before capturing.
- Opening an investigation cannot resurrect a panel after route exit, session
  replacement or capture replacement.
- Annotation/export handlers recheck the investigation and route after loading
  their helper functions.
- A cancelled worker settles its generation promise, releases worker ownership
  and clears loading during route cleanup. Returning opens the retained replay
  or usable setup screen rather than an indefinitely pending loading screen.
- Completed replay position, history and cache survive ordinary route departure.
- Restarting playback from the final beat immediately requests commentary for
  the restarted first beat. Pausing stops the timer immediately.

## Minor changes and product corrections

- Removed the fabricated `runner-up` action ID and unused shared branch-context
  writes. The Branch Lab never consumed them and could open an unrelated replay.
- The alternatives panel retains the recorded legal-action count and explains
  that this capture lacks a verified alternative action for branching. Existing
  investigation exports preserve the exact beat and checkpoint.
- Session envelopes read the selected commentary mode, including Developer
  Observatory, rather than always defaulting to Broadcast.
- Corrected the Homecoming guide: Caster now uses Homecoming with its specialized
  rail and authorized Omniscient hand presentation.
- Added this complete patch record and a corresponding changelog entry.
- Corrected the clean-room CLI comment: `--quick` skips dependency installation
  but still rebuilds the output directory. Builds and tests that read that
  directory must run in sequence.

## Verification

Evidence files live in ignored `reports/local/evolution-20261002/` unless noted.

| Check | Result |
| --- | --- |
| Initial full test baseline | 5,206 tests; 5,192 pass, zero fail, 14 skip; `baseline-tests.log` |
| Final stable full suite | 5,218 tests across 95 suites; 5,204 pass, zero fail/cancelled/todo, 14 skip; `final-tests-stable.log` |
| Workspace/journey regression tests | 129 pass, zero fail/skip; `workspace-final.log` |
| Root and client TypeScript | Passed; `typecheck.log` |
| Repository lint | Zero errors, 422 existing warnings; `lint-final.log`; final changed-file lint also passed |
| Production build | Passed after the final route-refresh refinement; `build-final.log` |
| Chrome integration | Four scenarios passed on the final build, zero page errors; `browser-final.log` and `reports/local/stabilization-browser.json` |
| Clean-room verification (`--quick`) | All eight checks passed, including a full build, current-tree secret scan and 106 focused tests; `clean-room.log` |
| Release identity verification | Passed, no drift; `release-identity.log` |
| Engine authority manifest verification | Passed, no drift; `engine-manifest.log` |
| Canonical engine payload integrity | Failed: declared payload differs from current engine files; `engine-integrity.log` |
| Deployment mirror parity | Failed: existing mirror does not match the rebuilt application; `deploy-parity.log` |
| Whitespace | `git diff --check` passed |

An intermediate full-suite attempt overlapped the clean-room rebuild and read
the rulebook while the generated directory was being replaced. That run was
interrupted and rejected as final evidence. The final full-suite run follows
the completed final build and Chrome verification, with no concurrent rebuild.
The completed stable run reconciles all 5,218 tests: 5,204 passed plus 14 skipped.
The skipped cases belong to the existing absent legacy corpus and retired PWA
checks. The run took approximately 17 minutes 41 seconds on this machine.

Twelve new executable regressions cover out-of-order requests, match replacement,
late stream/error suppression, explicit cancellation, viewer changes, provider
exceptions, envelope/seed provenance, browser-controller ordering, route exit,
worker cancellation, deferred investigation creation and truthful public HTML.
Existing future-context assertions now check absence of actual payload fields.

Chrome uses the rebuilt application and real Homecoming board. Both Public and
Omniscient scenarios exercise transport, pause-on-capture, annotations, downloaded
JSON contents, route departure and exact paused-position return. Public exports
are checked for redaction. Two existing landing/focus scenarios also pass.
Screenshots are `reports/local/caster-public.png` and `caster-omniscient.png`.

## Files authored in this pass

| File | Purpose |
| --- | --- |
| `apps/lab-web/src/workspaces/caster-workspace.js` | Browser request/route ownership, paused investigations, worker cleanup and truthful branching UI |
| `packages/replay-caster/src/caster-session.mjs` | Session request invalidation, viewer isolation and provider error containment |
| `packages/replay-caster/src/wait-what.mjs` | Remove future payloads from Public captures |
| `packages/replay-caster/src/beat-builder.mjs` | Remove replay seeds from viewer beat summaries |
| `packages/replay-caster/src/schemas.mjs` | Correct session commentary-mode provenance |
| `scripts/stabilization-browser.mjs` | Real Chrome pause/export/route-return checks |
| `scripts/verify-clean-room.mjs` | Correct the documented `--quick` behavior |
| `test/replay-caster.test.mjs` | Session concurrency/privacy/provenance regressions |
| `test/caster-fullscreen.test.mjs` | Execute browser-controller races with deferred boundaries |
| `test/v1.0.0-behavioral-play-journey.test.mjs` | Update obsolete shortcut/import expectations |
| `docs/INTRILEX_HOMECOMING.md` | Correct the current Caster presentation and link this record |
| `docs/PATCH_NOTES_2026-10-02.md` | Complete project findings, patch notes and verification record |
| `CHANGELOG.md` | Add the October 2 Unreleased entry, preserving the earlier entries |

## Remaining work identified by inspection

- Caster-to-Branch replay handoff needs a real replay identity, pre-decision
  checkpoint and authorized, executable alternative action. An action count
  alone cannot provide that capability. It is not implemented in this pass.
- Existing Foundation rules/engine changes need their own conformance and
  payload-provenance reconciliation before release certification. The actual
  integrity failure remains visible; this pass did not regenerate a manifest
  merely to accept those pre-existing changes.
- The static deployment mirror needs a finalized engine candidate and a fresh
  build/ownership-parity check. This pass builds locally but does not publish.
- Human acceptance, remote CI and live production behavior remain outside this
  local verification. Some roadmap and generated limitation prose predates the
  current implementation and should be reconciled with executable evidence.

Product version remains 1.0.0 with an Unreleased changelog entry. The patch is
saved and reviewable in the working checkout; no commit or deployment was made.
