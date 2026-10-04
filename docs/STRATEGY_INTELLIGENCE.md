# Strategy Intelligence / FIELD MANUAL

Implemented October 4, 2026, America/New_York. Open `/#/strategy` in the
built Intrilex app, or choose **Learn → Strategy**. Names and the route live in
`STRATEGY_NAMES`; the engine remains the sole game authority.

## What the workspace does

FIELD MANUAL turns actual recorded decisions into inspectable evidence. It
does not contain a prewritten strategy for Three, Five, Queen or any other
rank. A fresh database shows insufficient evidence. Generate a small paired
Arena evaluation, ingest saved evidence, or ingest completed local games.

The seven sections are Cards & timing, Context & matchups, Policy / Profile
comparison, Counterfactual Lab, Combinations & mistakes, Expert guide and
Evidence desk. All 15 shipped ranks come from the engine registry; emitted
actions add card, suit, family, mode, mechanic, timing and combination subjects.
Future numerical/alphabetic ranks with standard suits need no new rank story.

Noob view leads with a plain statement, opportunity counts and unknowns.
Unrelated Observatory experiment/global-cohort controls are hidden within this
route; Strategy's own context controls govern its evidence. Mobile navigation
remains scrollable without placing the entire desktop rail above the manual.
Expert view exposes exact timing/outcome counts. **SHOW NERD DATA** expands
the same aggregate and claims used by the plain sentence. SVG curves have
accessible labels and do not connect missing observations. Native controls,
focus styles and horizontal table containers support keyboard and mobile use.

Filters include maturity, policy, opponent, score position, seat, checkpoint,
Agent Profile, head version, purpose, deficit, lead, both hand counts, board
development and both goal distances. Two policies, checkpoints or head
versions can be compared within the same other filters. Head comparison
requires selecting one Profile. Behavior frequency is never policy superiority.

## Architecture and authority

| Owner | Responsibility |
| --- | --- |
| `strategy-contracts.mjs` | Canonical artifacts, authorized descriptors, decision capture, maturity and validation |
| `strategy-evidence.mjs` | Game-sized evidence envelopes, fidelity, portable bundles and replay references |
| `strategy-analysis.mjs` | Streaming aggregates, confidence rules, claims, deterministic language, motifs, regret leads and guides |
| `strategy-branch.mjs` | Fixed branch plans, exact reconstruction and controlled continuations through existing authority |
| `strategy-store.mjs` | Separate versioned IndexedDB, indexed queries, immutable insertion, operational import labels and archives |
| `strategy-workspace.js` | Existing imperative workspace shell, filters, evidence producers, worker ownership and presentation |
| `strategy-player.js` | Subordinate local-play observer and completed replay ingestion |

Node simulation uses `engine-adapter`; browser capture uses the existing
`autonomy-runtime` authority. They resolve commands, legal actions, authorized
views, execution and replay. Strategy never calculates legality or implements
card effects. Existing policy decomposition supplies available score estimates;
missing scores remain null. Capture is opt-in with `strategicTrace` for Lab
runs. Normal local play captures at human/AI submission without changing the
decision journal, vault, save identity or gameplay error semantics.

New observation/science modules are included in the implementation fingerprint.
Historical artifacts retain their original fingerprints. Adding capture changes
scientific identity even though a deterministic no-capture/capture comparison
preserves action-sequence and final-state hashes.

## Versioned decision contract

`DECISION_EVENT_V1` / schemaVersion 1 is sealed only after the game's outcome
is available. The draft is captured **before** the action executes. Its fields
contain:

- Run/game IDs, master and derived seeds, rules profile, fingerprint, era,
  purpose, policy/version, both checkpoint IDs and applicable Profile/head.
- Acting seat and decision ordinal; authorized current phase, scores, goals,
  hand counts, public board/pile counts, stack/response/lock/exhaustion signals.
- Every legal candidate, stable action ID, family/mode/timing, authorized source
  card identities, source/target role and whitelisted numerical feature estimates.
  Existing policy scores/decompositions are diagnostic estimates, not outcomes.
- Selected action, digest of the legal set, command index and predecision,
  initial, transcript and final hashes. A replay is retained once per game,
  rather than embedding engine state in every event.
- Immediate score/hand/board deltas; a three-decision score-margin follow-up
  with an explicit censor flag; terminal winner, scores, length and clean status.

Identical mirrored trajectories may share a retained Evolution replay ID.
Ingestion resolves that ID as well as the original ordinal and verifies the
recorded initial/transcript hashes. Decisions without a retained transcript or
the exact frozen policy pair are visibly unavailable for branching.

Unknown current signals remain null. Context excludes opponent card identities,
hidden traps, unrevealed draw order, engine RNG and terminal/future features.
Visible authorized hand cards belong to the acting player. Targets disclose
roles instead of private identities. Canonical validators reject unknown fields,
nonfinite/unsupported JSON values, hidden candidate fields, illegal selection,
duplicate candidates, wrong actor/seat and recomputed maturity mismatches.

Outcome fields are a separate analytic suffix. Maturity and branch selection
do not consume them. Immediate deltas measure the submitted declaration's
resulting position; deferred stack effects may occur later. The three-decision
horizon is a follow-up association, not attribution of all later effects.

The published JSON schemas are `schemas/decision-event-v1.schema.json` and
`schemas/strategy-claim-v1.schema.json`. Runtime canonical validation and
authority replay validation enforce additional scientific invariants.

## GAME_MATURITY_V1

Maturity uses only the acting player's current authorized position. Each
component is clamped to [0,1]. Missing components are omitted and the remaining
weights are renormalized.

| Component | Formula | Weight |
| --- | --- | --- |
| Score | Maximum available secured-points / current goal across both players | 0.50 |
| Board | Public board card count / 12 | 0.10 |
| Hands | 1 − (own hand size + opponent hand count) / 14 | 0.15 |
| Depletion | 1 − deck / (deck + graveyard + exile) | 0.20 |
| Turn | (current full turn − 1) / 24 | 0.05 |

Public score progress at least 0.90 or public exhaustion raises the result to
at least 0.85; progress at least 0.75 raises it to at least 0.65. The score is
rounded to six decimals. Buckets are OPENING [0,.2), EARLY [.2,.4), MIDGAME
[.4,.6), LATE [.6,.8), ENDGAME [.8,1]. Turn eight can therefore be endgame when
a player is near the goal. Future game length and winner are never used.

These are declared engineering heuristics, not learned strategic thresholds.
Changing them requires a new maturity contract and compatible scientific era.

## Evidence and claims

An opportunity is **one decision frame** with at least one legal candidate for
the subject. Multiple targets/modes do not multiply that frame. Selected and
skipped sum to opportunities. Rates use opportunities as their denominator;
the opportunity incidence denominator is all clean decisions in the same
filters. A skipped opportunity is not proof of deliberate holding.

Indexed follow-up rows record the next same-player subject use in that game.
Later-use counts are associations: a target may disappear, hand composition
may change, and several correlated skips may precede one selection. Terminal
association uses win=1, draw=0.5, loss=0 and is decision-weighted. It is not
points earned or an independent-trials win-rate estimate. No observational
causal interval is manufactured.

`STRATEGY_CLAIM_V1` contains subject, exact scope/context filters, evidence type,
magnitude/uncertainty, opportunity/selection/sample counts, state/seed/paired
counts, policies/checkpoints/matchups, provenance, caveats, timestamps and
stale/invalidation/origin flags. Generated language is deterministic and uses
those fields. Distinct state hashes are reported separately from independent
states: correlated positions from one trajectory do not become independent
samples. Mirrored games share seed blocks.

| Confidence | Required meaning |
| --- | --- |
| INSUFFICIENT | Missing, stale, incompatible or imported-unverified evidence |
| EXPERIMENTAL | Descriptive/associational pattern or exact-state research study; no strength recommendation |
| SUGGESTIVE | Future player-actionable controlled evidence with a fixed budget, meaningful effect, interval excluding zero and at least two independent states |
| STRONG | Predetermined replication in at least two packs, policies and matchups, with consistent effects and no reversal |
| ESTABLISHED | Independent held-out replication of Strong evidence |

Observational and exact-state studies produce only the first two levels. The opening Information-Set Study producer can earn Suggestive under the stricter documented world-level gates.
Higher levels have validation requirements, not a button to upgrade evidence.
All current recommendation fields remain UNKNOWN. Historical and imported
claims cannot become stronger merely through a matching checksum.

Examples of admissible wording are “This policy selected Three in n of N
midgame legal opportunities” and “In this recorded hidden-state study, the
alternative had this paired outcome difference and interval.” Here n/N are
template placeholders, not published measurements. Unsupported wording includes
“Three is strongest in midgame,” “Queen should always be held,” “this policy is
better because it plays Three more often,” and any play/hold recommendation
based on the opponent's unrevealed cards or draw order.

Scope is exact fingerprint × rules profile × era. Arena evaluations have the
Lab implementation era and retain frozen Profile-head/checkpoint provenance.
Purpose-bound Profile measurement summaries retain their own manifest/objective
era, rather than being pooled into the Arena cohort. Training, evaluation,
self-play and normal-play purposes remain filterable provenance.

## Counterfactual Decision Lab

Choose a recorded legal opportunity and commit a plan before executing any
outcome. The plan contains the actual action, a deterministic diverse legal
branch set (default maximum six, allowed two to eight), a fixed unique seed
catalogue (default sixteen, allowed two to 128), frozen continuation checkpoints,
decision budget (default 300, allowed one to 1800), state/era identity and an
all-branches/all-seeds stopping rule. Seed streams are derived from event ID
and catalogue ordinal; outcomes cannot select seeds or stop a favorable run.

Reconstruction starts from the recorded seed and validates the initial hash,
full command transcript, final hash, exact predecision state, actor, legal-set
digest, chosen command, authorized context and normalized descriptors. A
historical fingerprint cannot execute against the current engine. Missing
replay or frozen checkpoints is a visible error.

Each alternative executes through current authority from the same state.
Every continuation uses the same ordered frozen policies and a common policy
RNG seed. Engine RNG and hidden draw order remain the recorded realization.
The recorded seat remains fixed; asymmetric positions are not artificially
swapped. Continuation policy state is checked for mutation.

Complete clean studies compare paired win/draw/loss scores with Hoeffding
bounds for differences in [-1,1], Bonferroni-adjusted over planned alternatives
at familywise 95%. Bounds assume independent continuation-policy seed draws;
the fixed catalogue does not establish generalization. Deterministic policies
may produce identical outcomes for every seed. Seed count is never treated
as independent hidden-state count.

**RESEARCH_ONLY / NOT PLAYER-ACTIONABLE:** exact-state results are conditional
on hidden information unavailable to an ordinary player. One state is not
replication. Current studies cannot answer “play this now” as ordinary advice.
Cancelled/non-clean studies retain diagnostics and produce no comparisons or
successful claims. Worker cancellation yields between continuations. Route
departure terminates owned work and suppresses late rendering. Timeout is ten
minutes, with no incomplete study admitted as complete.

## Discoveries and guide

The motif miner examines two/three successive substantive same-actor actions
within three current turns. It preserves game/era boundaries, checks the
selected filters on each window, caps distinct motifs at 100 per game and
discloses correlated overlapping windows. Workspace discovery loads at most
twelve complete game envelopes selected from its forty-decision page. It is
a bounded exploration sample, not an exhaustive campaign census.

Candidate regret leads require a complete controlled study with an alternative's
lower bound above zero. They remain research-only and do not call a recurring
habit a mistake from one state or one weak policy.

The Expert Strategy Guide is generated from available rank/family/combination
claims in the selected context plus local controlled studies. Every substantive
entry includes its claim ID and evidence IDs. Markdown and a sealed JSON
manifest export the same claims. Categories lacking player-actionable evidence
remain explicitly unknown. Imported research archives are inspectable but do
not enter local guides until reproduced.

## Storage, portability and privacy

Separate IndexedDB `intrilex-strategy-intelligence`, version 1, stores evidence,
sources, indexed events, one replay per transcript hash, studies, claims and
import archives. Existing Evolution/Profile databases are not migrated.
Transactions resolve after commit; insert-or-verify rejects immutable conflicts.
Concurrent opens share ownership; close/blocked/failure paths release callers
and reject late operations without replacing a newer connection.

Subject multi-entry indexes and cohort, clean cohort, maturity, policy and
matchup indexes support cursor aggregation. Rates stream without collecting
a campaign-sized event array. Decision lists stop at forty matching rows.
Follow-up indexing uses a reverse per-actor pass. Source listing caps at 10,000;
study/archive listing caps at 1,000. These limits require partitioning larger
campaigns rather than claiming an untested million-game UI.

Budgets are 8 MiB per game envelope and 40 MiB per portable bundle. UI producers
cap at 128 paired games and default to eight. Deep evidence is optional at the
Lab producer; Strategy-generated runs enable it explicitly. The store's
`retainEvents:false` omits event indexes but retains the portable envelope:
it is not a disk-pruning API. There is no destructive retention manager in this
release. Existing Profile evidence retention/protected-closure semantics remain
unchanged.

Full, partial-observational and summary-only fidelity are kept separate. Older
Lab aggregates remain aggregates; missing opportunities are not reconstructed.
Legacy/network player replays lacking attested runtime identity have a separate
UNAVAILABLE / UNATTESTED_REPLAY_SUMMARY cohort and do not create decision claims.

Bundles carry sealed original evidence, retained replay references, studies,
claims, original imported research and operational source-origin labels. Imports
verify structure/digests and preserve immutable artifact IDs. Imported event
rows receive IMPORTED_UNVERIFIED operational origin. Existing locally captured
rows retain their local provenance when an identical copy is imported. External
studies/claims go to the unverified inspection archive. Imports are append-only,
per-game transactions; a later storage/quota failure can leave earlier accepted
games, with a visible error. A checksum verifies copying, not trust.

Nothing is uploaded. Decision contexts contain acting-player authorized data;
retained private local command transcripts can include both players' engine
state. Portable research bundles are therefore private research exports. Normal
public replay export format and network projections remain unchanged and do
not include this telemetry or private Strategy bundles.

## Validation and operating limits

Run `pnpm run test:strategy`, `pnpm run test:strategy:browser`, `pnpm test`,
`pnpm run typecheck` and `pnpm run build`. The new Node suite is registered in
the root test script and Node CI runner. Browser acceptance uses native Chrome
against built assets, real workers, real persistence and real continuation
execution. See `STRATEGY_VALIDATION.md` for observed results and measurements.
`pnpm run benchmark:strategy` measures a real eight-game paired workload,
capture overhead, envelope/replay sizes and pure streaming aggregation.

Current limits: no justified player-information hidden-state sampler; no
multi-state replication orchestrator; no automatic Strong/Established advice;
no cloud Strategy persistence; no exhaustive unbounded motif census; no online
decision-time capture; no million-event browser benchmark. Old evidence cannot
be upgraded without a separate new, current, validated reproduction.

The highest-value scientific extension is a precommitted information-set study:
sample hidden states consistent with the acting player's authorized observation,
pair alternatives across independent state/seed blocks, freeze continuation
policies, retain full admissibility provenance, then replicate across held-out
packs and matchups. That would create the evidence needed for actual timing and
hold/play recommendations without teaching through hidden information.


## Opening Information-Set Studies

See [INFORMATION_SET_STUDIES.md](INFORMATION_SET_STUDIES.md) for the implemented, bounded player-information bridge and [INFORMATION_SET_AUDIT.md](INFORMATION_SET_AUDIT.md) for its pre-implementation audit. It reconstructs canonical opening worlds without source hidden truth, commits a frozen plan before outcomes, and infers over matched hidden-world effects. General midgame sampling remains unavailable. Exact-state branches remain permanently research-only. Strategy IndexedDB is now v2; portable bundles add V2 only when information artifacts require it.
