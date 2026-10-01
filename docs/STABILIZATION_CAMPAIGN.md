# Stabilization campaign — October 1, 2026

## Baseline and preservation contract

Working repository: `H:/myProjects/Intrilex-MASTER/Intrilex_dev-current`, remote
`https://github.com/Defients/Intrilex.git`. The sibling browser tabletop is outside scope.
Initial branch `main`, clean at `b4577d2db6b12325e5538e410582f1085504ab6b`,
tree `0a67dd70b431e57297f236d9b8d93c24e2f43b40`. Node 22.14.0, pnpm 10.11.0.

Preserve engine semantics, adapter/authority/protocol boundaries, authorized
projections, save/replay formats, deterministic fixtures, ranking authority,
and specialized Caster/Academy/terminal behavior. No deployment or history rewrite.

## Phase 0 remediation map

- Canonical engine: `upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/src`;
  TypeScript produces its tracked `dist` and ignored `runtime/autonomy-engine-dist`.
  The adapter consumes this runtime. Rebuild produced no tracked differences.
- Integrity FAIL: expected payload `e720a218577dc24e0c31d577ff1caefa8f5ca6cbad0908d2535450b4bab96d08`,
  actual `7b1b2abd5e4f6e49b9ffe999958b194b0aefeafe747810d1e7a1c371aae460c7`.
  All 25 changed records are the eight source files and seventeen compiler outputs
  intentionally changed by `89a60cdea47497f0154be1af2c2000550f0c9a81`.
  The Python bytecode committed in `41feafd` is excluded by the verifier.
- Upstream engine baseline: 195 tests, 192 pass, three failures (two Stack Theft,
  obsolete special-scoring exclusion assertion). Current divergence/rules regression
  suites: 55/55 pass. Resolve contract discrepancies before regenerating metadata.
- Committed self-audit PASS binds to `41feafd`, with `dirty: true`; it is historical
  development evidence, not release evidence for this checkout. Report consumption
  currently accepts missing provenance and does not enforce clean/tree/lock bindings.
- Capability generator retains obsolete WAIT WHAT non-integration claim despite
  Caster UI wiring and behavioral tests. Repair the generator, then regenerate.
- Build invokes version, capability, sample-data, replay, analytics and art generation
  before bundling to `apps/lab-web/dist`. Deploy sync preserves extras but only removes
  stale app/styles/config hashes and data: other chunks/maps can accumulate.
- CI is one fail-fast job around `scripts/ci.mjs`; an early integrity failure masks
  independent domains. Preserve the local master runner; split isolated CI jobs.
- Homecoming is the default React mount; classic remains an explicit compatibility
  path. Caster and terminal rendering have specialized rail/result contracts.
  Establish parity before deletion. Entry hotspots: app 2,513 lines, play 2,751,
  server 2,065. Extract lifecycle/infrastructure responsibilities, never game rules.
- Server auth defaults disabled independently of NODE_ENV; durable store and outbox
  exist, while the Supabase result persistor falls back to nontransactional writes
  when its RPC is unavailable. Production startup and persistence need fail-closed tests.
- Security-history issue remains documented. Verify via redacted scanner; provider
  revocation cannot be established from Git. Static SQL is not live database proof.

## Content ownership (tracked baseline)

8,501 tracked files. Largest trees by current Git blob bytes:

| Tree | Bytes | Ownership / treatment |
|---|---:|---|
| sample-data | 1,498,886,856 | Generated plus deterministic replay/evidence fixtures; retain pending dependency proof |
| neocities-deploy | 372,913,872 | Deployment mirror with intentional extras; converge generated ownership |
| runtime | 272,547,724 | Runtime/data inputs; inspect individually, do not bulk-delete |
| apps | 205,394,151 | Source plus player-facing media |
| card-art | 163,626,066 | Canonical media inputs |
| upstream | 109,115,115 | Canonical engine, compiler outputs, fixtures and historical engine generations |
| reports | 36,129,644 | Generated and historical evidence; provenance required for current claims |
| vendor | 22,867,405 | Vendored toolchain / integrity inputs |
| ranked-glyphs | 13,456,328 | Canonical media masters |

## Gates

0. Establish baseline/authority before edits.
1. Engine integrity, truthful provenance, truth generation, identity, secret scan and release tests.
2. Build/tests and deploy convergence with intentional extras preserved.
3. Independently visible CI domains; release depends on all required domains.
4. Homecoming primary; explicit classic retirement parity gate.
5. Behavior-backed orchestration extractions with clear ownership.
6. One state owner per subsystem and disposed route/session lifecycles.
7. Production misconfiguration regression tests; live database proof separately recorded.

## Implemented changes and phase disposition

### Phase 0 — COMPLETE: forensic baseline and change map

The authority and preservation boundary above was established before editing.
Engine integrity drift was traced to the existing rules-parity commit, rather
than treated as permission to replace rules or refresh hashes blindly. Historical
fixtures, media masters, older engine generations and sibling projects remain.

### Phase 1 — PARTIAL: release truth closure

- `scripts/release-provenance.mjs` is the shared commit/tree/lockfile/engine
  binding. Git failure, dirty or untracked source, missing hashes, quick audits,
  mismatched inputs, empty gates, incomplete counts and abnormal termination
  cannot establish release evidence. A clean historical report cannot certify
  a dirty current checkout at the same HEAD.
- `scripts/certification-gates.mjs`, `scripts/generate-self-audit.mjs`,
  `scripts/manifest.mjs` and `scripts/package-release.mjs` consume that boundary.
  The generator executes current vendor, engine, two-build and browser parity
  controls. Historical report existence or old PASS fields no longer satisfy
  those controls. Developer reports go to `reports/local/`; commit-bound full
  audits go to `reports/release/`. Packaging checks inputs before mutation and
  again before emitting certification.
- Release identity preserves the same-version release date on rebuild;
  `INTRILEX_RELEASE_DATE` is the explicit override. Every identity field is
  compared during verification. Build time no longer changes the release date.
- Capability truth now awaits the CI registry read, counts actual stages, marks
  unbound self-audit evidence STALE, and accurately describes WAIT WHAT wiring
  and the current credential-history evidence boundary. Generated config,
  feature matrix and limitations were reconciled from the generator.
- Upstream production rule source was unchanged. Two Stack Theft tests now stop
  at the actual priority/resolution boundary; the obsolete scoring-rider exclusion
  test follows the already implemented canon. Engine tests passed 195/195 before
  the manifest was regenerated. Current payload:
  `e427494349e418166265b9bef75e23db4bda3196714f3fded671a30a14a0ea19`.

Remaining gate: no clean committed campaign tree exists and no positive packaged,
extracted release was produced. Historical `release/RELEASE_MANIFEST.json` is
not current release evidence. Packaging still needs a clean-candidate rehearsal
that separates generated release outputs from tracked inputs; the new final
provenance check will reject generated-output mutations rather than certify them.
The legacy audit dimension score is a diagnostic convention, not production,
accessibility, live-database or human approval. External gates remain independent.

### Phase 2 — COMPLETE: bounded artifact hygiene

`scripts/deploy-ownership.mjs` and `scripts/sync-neocities.mjs` converge the
deployment mirror using `.build-owned.json`. Removed build-owned modules, hashed
chunks, styles, configuration and maps are pruned. Unknown extras are preserved.
Unsafe manifest paths and symlink traversal fail before deletion. `--check`
detects stale owned files without changing the mirror.

Measured after convergence: deployment files 1,662 → 818; 860 old tracked files
removed; removed old blob bytes 111,794,987; deployment bytes 372,913,872 →
267,405,450, a net reduction of 105,508,422 bytes. New build files account for
the difference between removed blob bytes and net reduction. Preserve 404,
font masters/styles, hosting headers and deterministic fixtures. No upload ran.

New browser screenshots/reports and CI summaries use ignored local evidence
folders. Existing historical browser proof was preserved. Python caches and
bytecode are ignored prospectively; older tracked historical material was not
bulk-deleted without dependency proof. Large sample-data/runtime/media trees
remain explicit debt, rather than silently discarded evidence.

### Phase 3 — PARTIAL: independently visible CI

`.github/workflows/ci.yml` uses seven isolated quality domains with
`fail-fast: false`; release requires all quality jobs. `scripts/ci-domains.mjs`
assigns each registry stage one reporting owner. `scripts/ci.mjs` retains the
ordered local master runner, adds domain/list modes, awaits failure report writes,
and writes separate ignored domain summaries. New test files are registered in
both the root test command and CI registry. Browser checks explicitly include
Homecoming, direct manipulation and stabilization/Caster coverage.

Registry verification: 230 unique stages across integrity 4, static 6, engine 42,
client 110, network 18, security 17, browser 24, release 9. Local integrity domain
passed 4/4. Remote matrix execution is NOT_RUN. Read-only GitHub inspection
found the latest baseline run at the unchanged HEAD failed on September 30,
2026, at 10:57:33 America/New_York in the old single `ci` job (`Run CI pipeline`):
https://github.com/Defients/Intrilex/actions/runs/36733056130. A complete 230-stage run and
positive release packaging remain unverified; the release job must expose those
failures, not inherit a historical green report. Some older producers still write
tracked reports and need the same output ownership migration before release
rehearsal. Broad client fallback classification should be refined when those
legacy stages are next edited.

### Phase 4 — COMPLETE: Homecoming composition and retirement gate

`client/mount.tsx` selects classic only through the explicit legacy option.
`client/gameplay/IntrilexGame.tsx` accepts a trusted Caster rail and explicitly
authorized opponent hand. Rail or omniscient data no longer silently select the
old GameTable. The existing public replay Seat 1 strict-view contract is retained; opponent identities remain concealed; Caster snapshots offer no
gameplay actions. Commentary insertion remains owned by Caster. Replay labeling is explicit; a
visually clipped exit control was replaced with a properly sized control, and
the board fits below its persistent header within the desktop viewport.

| Surface | Current presentation / authority | Verification and retirement constraint |
|---|---|---|
| Local play | Homecoming + local controller/store | Real browser move/Composer/direct manipulation checks |
| Online play | Homecoming + NetworkSession + server authority | Two real browser seats, action IDs, chat, reconnect, forfeit and rematch |
| Academy | Homecoming + teaching layer | Browser objectives/hints/coachmarks; controller retained |
| Guided Exhibition | Homecoming + scripted teaching runtime | Browser journey; script authority retained |
| Caster public | Homecoming + strict player view + commentary/transport | Real browser; one visible hand; WAIT WHAT and annotation |
| Caster omniscient | Homecoming + explicit replay/judge data + commentary | Real browser; two hand regions; inspection and transport |
| Replay/forensic tools | Existing replay owners and specialized controls | Existing replay/forensic tests; full visual and human parity not established |
| Terminal/results | Specialized result lifecycle and renderer | Browser forfeit/replay/rematch; retain result semantics |
| Classic/GameTable | Explicit compatibility path | Retain until the full retirement checklist below passes |

Classic deletion requires: all exposed rules/action families and private choices;
card inspection and authorized hand views; local and online save/restore/reconnect;
Academy and Guided teaching; Caster public/omniscient transport and investigation;
terminal/result/replay flows; keyboard-only and narrow layouts; no projection,
protocol or deterministic-fixture changes. Automated scenario coverage is not
human parity proof. New presentation work targets Homecoming composition first.

### Phase 5 — PARTIAL: orchestration ownership

| Boundary | Owner | Entry point's remaining responsibility |
|---|---|---|
| Landing dialog | `apps/lab-web/src/landing-overlays.js` | Choose renderer and teardown |
| Autosave | `apps/lab-web/src/play/session-autosave.js` | Start/stop for the current session |
| Production admission | `apps/match-server/src/startup-config.mjs` | Validate before allocation |
| Liveness and expiry | `apps/match-server/src/server-maintenance.mjs` | Start after listen; stop on shutdown |
| Gameplay rules/commands | `packages/match-authority` and engine adapter | Dispatch authorized intent |
| Durable effects | Existing match store and TerminalOutbox | Wire dependencies; await shutdown |

App coordinator reduced from 2,512 to 2,355 lines; play coordinator from 2,750 to
2,713; server from 2,064 to 2,059 with startup safety added. Those are ownership changes, not a rewrite. Server maintenance was
extracted after correcting failed-startup cleanup. HTTP/WebSocket listener errors
now reject startup and close allocated persistence; moderation probe failure uses
the same cleanup. Timers/drain start only after the listener is live.

Remaining mixed concerns: app routing/workspace/data registry, play mode and
terminal orchestration, server module-global registry/bootstrap/shutdown. They
are explicitly retained debt. No singleton-to-multi-instance rewrite or protocol
redistribution was attempted without a larger behavioral migration contract.

### Phase 6 — COMPLETE: state ownership contract and dangerous overlaps

| Subsystem | State owner | Persistence / presentation boundary |
|---|---|---|
| Landing and workspaces | Existing application `state.js` plus route owners | Dialog owner removes handlers and invokes teardown |
| Local game semantics | Existing play controller / authoritative session | Semantic snapshots feed the typed GameStore |
| Interactive game UI | `client/game-store.ts` and component-local state | Selection, Composer and drag state; never engine authority |
| Online game | NetworkSession and server match authority | Reconnect record is an adapter, not canonical game state |
| Autosave/Continue | Current session + autosave generation | IndexedDB envelope and sessionStorage target |
| Caster | CasterSession/workspace and replay projection | Homecoming read model plus trusted transport rail |
| Auth/account | Existing account store and auth controller | Storage holds account/session persistence; server verifies identity |

Reconnect serialization/removal has one NetworkSession-owned implementation,
including queue handoff. Existing safe-host, TTL and legacy read validation remain.
Autosave completion must still own the current session and generation before
publishing Continue. Stop/replacement invalidates in-flight completion. Dialog
close/replacement removes its document key handler; late async renderer failure
does not update a closed dialog. Real browser tests replace/dismiss twenty pairs
of dialogs and confirm no retained handler/dialog. Existing mount/dispose and
route-generation guards remain; no new state framework was added.

New complex interactive work should use typed React read models and explicit
store ownership. Stable legacy DOM workspaces remain until a meaningful change
justifies migration. Storage writes go through the subsystem owner. Legacy
module globals and storage consumers outside the touched seams remain documented
debt; this is not a claim that every workspace has been converted.

### Phase 7 — PARTIAL: fail-closed production and staging boundary

Production rejects missing/disabled auth, malformed/empty/wildcard/non-HTTPS
origins, volatile match persistence, volatile outbox and fake-persistor bypass.
Missing-Origin rejection and persisted WebSocket safe-host controls are retained.
Supabase production writes require `persist_match_result`; both missing-RPC
return and thrown-error paths fail without compatibility writes. Development
compatibility is explicit. Missing-RPC detection recognizes PGRST202/42883 codes.

Local tests cover production misconfiguration, listener failure cleanup,
maintenance timer disposal, real match-store file reopen and durable outbox
recovery/idempotency/shutdown. The competitive-journey test now uses temporary
file-backed match/outbox stores, compares terminal winner (including a draw)
against authority, verifies result delivery/replay hash, and restarts against
the same files. An injected interrupted acknowledgement retries the same
result without duplication. Its remote persistor is a development fake;
this is not a hosted ranked-write proof.
No live database or provider operation was performed. See
`docs/STAGING_SECURITY_VERIFICATION.md` for migration inventory, catalog/grants,
RLS, two-account reads, service-only RPC writes, atomic rollback, duplicate result,
restart and authorized replay/projection checks. All live and provider gates are
NOT_RUN. The local non-shallow reachable-ref scan is not proof about remote refs,
forks, other clones or provider-side revocation.

## Executed verification

| Command/control | Result / scope |
|---|---|
| `pnpm test` | PASS on frozen final source: 5,183 tests, 5,169 pass, 0 fail, 14 skip, 0 cancelled |
| `pnpm run engine-patch:test` | 195/195 passed; production rules source unchanged |
| `pnpm run build` | PASS; latest rebuild also executed by full clean-room verifier |
| `pnpm run lint` | PASS, 0 errors, 422 warnings against baseline 424; existing warnings remain |
| `pnpm run typecheck` | PASS, including strict client TypeScript |
| `pnpm run test:build-determinism` with report writes disabled | PASS; two builds agree for dist and sample-data |
| `node scripts/browser-parity.mjs` with skip-build/report writes disabled | PASS, 221 replays, main thread and worker |
| `pnpm run test:homecoming:browser` | PASS, 19 scenarios, no page errors |
| `pnpm run test:direct-manipulation:browser` | PASS, 10 scenarios, no page errors |
| `node scripts/stabilization-browser.mjs` | PASS, 3 scenarios, no page errors |
| `pnpm run verify:clean-room` | PASS: frozen install, build, typecheck, secret scan, identities and focused tests |
| `node scripts/ci.mjs --domain integrity --no-fail-fast` | PASS, 4/4 local stages |
| `node scripts/ci.mjs --list` | 230 distinct stages with one domain each |
| `node scripts/check-package-graph.mjs` | PASS, 20 workspace packages, zero cycles |
| Focused release/lifecycle/security tests | 117/117 passed; subsequent release validation 48/48 and server extraction 53/53 passed |
| `node scripts/secret-containment-scan.mjs` | PASS, 8,477 files, 0 violations/env/history findings |
| `node scripts/truth-drift-check.mjs --no-staleness` | PASS; historical report staleness is separately rejected by provenance |
| `node scripts/sync-neocities.mjs --check` | PASS, no stale owned build artifacts |
| Release audit / certification / packaging on dirty checkout | Expected refusal before release certification; not a positive release PASS |
| Revised remote CI, hosted Supabase role matrix, provider revocation, human acceptance, deployed site | NOT_RUN; visible baseline CI is FAIL |

The initial full run had three failures: a new lint formatting error, a stale
historical audit file-count assumption, and a source-shape assertion tied to the
removed deployment cleanup local variable. Corrections retain behavioral deploy
and provenance tests. The first quick clean-room attempt failed because the
secret scan exceeded its 60-second limit under concurrent validation load. A
180-second allowance was added; the full rerun completed its scan in 77 seconds
and passed. A later rerun was invalidated by an overlapping runtime rebuild; two files
observed a temporarily missing compiled module. Builds and the final suite are
now sequenced. A CI report assertion tied to the historical filename was updated
to the actual isolated output path. A random competitive journey exposed a valid
draw, prompting authoritative winner comparison and stronger file-backed restart
proof. No failure or skip was reclassified as a release PASS.

Local evidence and superseded failure logs are under ignored `reports/local/`;
`reports/local/stabilization/verification.json` records the final scope and results. Historical committed report
counts are historical. A source checkout with installed dependencies passing the
clean-room verifier is not yet an extracted release archive proof.

## Remaining risks, ranked by severity

1. **Release blocker:** no clean committed candidate and no current positive
   archive/extraction certification. Generated output ownership for remaining
   release/report producers must be rehearsed before promotion.
2. **Production blocker:** hosted Supabase permissions, rollback, ranked
   idempotency and two-account privacy have no live staging evidence.
3. **Production blocker:** provider credential rotation/revocation and exposure
   outside locally reachable refs are unverified.
4. **Validation gap:** new remote matrix has not run; human keyboard, screen
   reader and gameplay/parity acceptance remain NOT_RUN.
5. **Maintenance debt:** coordinator globals, historical engine generations,
   large fixtures and explicitly retained classic/specialized renderers.

## Deferred roadmap

- **Phase 8 — Performance & Delivery:** measure bundle/data/media cost; migrate
  remaining generated report outputs; archive only dependency-proven historical
  material; retain deterministic fixture checks and owned deployment convergence.
- **Phase 9 — Human Validation:** keyboard/screen reader and actual player
  journeys; supported browser/device matrix; Caster investigation and classic
  parity acceptance. Record sessions instead of borrowing automated evidence.
- **Phase 10 — Product Simplification:** retire classic only against the checklist;
  reduce touched coordinator seams and remaining duplicated storage consumers.
  Keep specialized result/replay functions until replacements are verified.
- **Phase 11 — Release Candidate:** review/commit the final source, run every
  isolated CI domain, full commit-bound audit, positive package/extracted proof,
  staging security matrix and operator revocation evidence. Verify source remains
  clean after every control before issuing a release certificate.
- **Phase 12 — Scale When Needed:** consider multi-instance infrastructure only
  after measured demand and a server ownership migration contract. No speculative
  Redis, microservices, new protocol or database replacement.

## Shipping verdict

The checkout is materially safer and easier to continue developing: existing
canonical engine contracts pass; stale/dirty evidence is rejected; production
misconfiguration and missing atomic RPC fail closed; Caster uses the primary
board; timers/dialog/autosave have tested owners; stale deployment payload was
removed without deleting source fixtures. This is a locally validated engineering
change set. It is **not production-certified** and no deployment occurred.
