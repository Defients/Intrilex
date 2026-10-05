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
discloses correlated overlapping windows. Windows never overlap inside one
actor-game, and a motif contributes at most two windows per actor-game — one
game replaying the same sequence cannot masquerade as independent strategic
evidence. Workspace discovery loads at most
twelve complete game envelopes selected from its forty-decision page. It is
a bounded exploration sample, not an exhaustive campaign census.

Candidate regret leads require a complete controlled study with an alternative's
lower bound above zero. They remain research-only and do not call a recurring
habit a mistake from one state or one weak policy.

## Strategy synthesis and Guide V3

A deterministic `STRATEGY_SYNTHESIS_V1` layer sits between per-subject
aggregates/claims and human-facing guide prose. A Strategy Claim says "this
measured relationship exists"; a `STRATEGIC_FINDING_V1` says "several measured
signals together form an interesting strategic pattern." Findings combine
timing behavior, usage rate, outcome association, semantic-use decomposition,
policy and within-policy opponent splits, and sample adequacy. They carry one
of three trust classes: `OBSERVED_PATTERN` (deterministic summary of
descriptive or associational evidence), `WORKING_HYPOTHESIS` (a plausible
question raised by two or more signals together), or `CONTROLLED_ADVICE`
(restated only from an existing admissible controlled claim — the layer can
never manufacture one). Findings never invent data, never upgrade confidence,
and never turn observation into advice.

The synthesis gates are documented constants (`SYNTHESIS_THRESHOLDS`):
timing buckets below 5 opportunities are ineligible and buckets below 10 are
flagged thin; a timing shape needs a 0.25 spread across eligible buckets and
a 0.20 first→last direction; flat or noisy phases produce no finding;
policy/matchup splits need 10+ opportunities per compared group and a 0.20
rate difference; associations need at least 6 selected AND skipped
observations; subjects under 15 opportunities are flagged thin rather than
headlined; combinations need 12+ opportunities; motifs need 3+ occurrences
across 2+ distinct games. Matchup sensitivity additionally requires
within-policy opponent variation — in mirror self-play where each policy
sees one opponent, aggregate opponent splits are confounded with policy
identity and no matchup finding is emitted. Alias subjects carrying an
identical opportunity set collapse to one canonical representative, and
`mechanic:`/`mode:` sub-descriptors never generate primary findings because
their family or rank lens covers the same signal.

The Expert Strategy Guide (guideVersion 3) renders the synthesis: evidence
status, top findings, strategic phase-of-game patterns, salience-ranked
"cards worth talking about", compressed low-information subjects, real
policy and matchup differences (or an honest "none adequately sampled"),
controlled advice, best next research questions, and grouped unknowns that
use subject-appropriate wording — use-versus-preserve for cards, action-
family contrasts for families, commit-versus-simpler-lines for combinations.
Every substantive entry remains backed by sealed claims whose IDs and
provenance live in the exported manifest, not in human prose. Markdown and a
sealed JSON manifest export the same claims, findings, and synthesis object.
Categories lacking player-actionable evidence remain explicitly unknown.
Imported research archives are inspectable but do
not enter local guides until reproduced. "Next useful study" lines are
subject-aware: rank/card/suit subjects get use-vs-preserve contrasts, draw
family gets draw-vs-alternative, score family gets score-vs-strongest
alternative, combinations get commit-vs-simpler-lines, and mode/mechanic
subjects get sibling-mode contrasts. Unsupported subject types say so.

## Optional local AI interpretation

A local Ollama daemon can re-explain deterministic evidence in plain language
("Deffy English"). It is off by default and strictly opt-in. The interpreter
sends a sanitized `STRATEGY_EXPLANATION_PACKET_V2` — public evidence, typed
grounding facts and surface metadata only — to `http://localhost:11434` and
validates the structured reply: the evidence label and confidence language
must echo the packet, every number+unit phrase must match a grounding fact of
the same unit (a game count cannot ground a percentage), and any declared
`usedFactIds` must exist. Failures are rejected and labeled; AI output is
never evidence, never a claim, never a confidence change.

Surfaces: card field manual, context & matchups, policy/profile comparison,
controlled information-set study, evidence desk, and an optional Expert Guide
polish. The GUIDE packet carries the synthesized strategic findings, top
findings, grouped unknowns, research questions and controlled advice from
`manifest.synthesis` — not a raw markdown dump — plus a bounded, explicitly
labeled excerpt for context. Guide output validates against a dedicated
`STRATEGY_GUIDE_SCHEMA` narrative shape (bounded key-lesson array, phase of
game, things not to overread, best next experiments) with the same fail-closed
rules: echoed labels and confidence, unit-checked numbers, real fact IDs only.
A card's printed point value is a public rules fact carried as a typed
`CARD_POINT_VALUE` grounding unit: unsigned "N points" may refer to it, a
signed "+N points" cannot, and "7 points" can never stand in for "+7 pp".
AI guide output is visually distinct in the workspace and exports separately —
`intrilex-field-manual.md` and the sealed manifest are the scientific
artifacts; `intrilex-field-manual-ai-interpretation.md` is clearly marked
interpretation, not scientific output.

Setup: install Ollama, start the daemon (`ollama serve`), pull a model
(`ollama pull llama3.1`). If the app is served from a non-localhost origin
(for example the deployed Neocities host), set `OLLAMA_ORIGINS` to allow that
origin — browser CORS will otherwise block the loopback request. The settings
panel's "Check connection & models" discovers installed models via
`/api/tags`; a previously selected model that is no longer installed is
flagged, never silently substituted. All endpoints are validated local-only;
there is no cloud fallback.

## Storage, portability and privacy

Separate IndexedDB `intrilex-strategy-intelligence`, version 3, stores
evidence (sealed chunk envelopes), sources, indexed events, one replay per
transcript hash, studies, claims, imported archives, information-set
artifacts and per-run provenance rows (producer channel, matrix lineage,
origin). Existing Evolution/Profile databases are not migrated.

All Lab runs persist analysis evidence incrementally: each game is sealed
and committed to `StrategyStore` as soon as `EvolutionSession` accepts its
finalized record, through one bounded serialized writer — deep tracing
decides fidelity (full decision context vs behavioral aggregates), not
whether a finalized game registers. Arena runs, Batch Matrix cells and
validated imported artifacts share this single normalization path; imported
copies keep `IMPORTED_UNVERIFIED` provenance and never masquerade as locally
produced evidence. Interruption, stop, worker failure or monolithic-archive
failure cannot lose already committed games, and the run UI reports
registered/offered counts rather than assuming retention. The same
conversion path serves the Evidence desk producer and saved-run ingestion;
identical games produce identical sealed artifacts, so re-ingestion is an
exact deduplication, never a double count. Reopening or re-saving a run, and
the "Ingest saved evidence" action, reconcile the index idempotently.

Transactions resolve after commit; insert-or-verify rejects immutable conflicts.
Concurrent opens share ownership; close/blocked/failure paths release callers
and reject late operations without replacing a newer connection.

Subject multi-entry indexes and cohort, clean cohort, maturity, policy and
matchup indexes support cursor aggregation. Rates stream without collecting
a campaign-sized event array. Decision lists stop at forty matching rows.
Follow-up indexing uses a reverse per-actor pass. Source listing caps at 10,000;
study/archive listing caps at 1,000. These limits require partitioning larger
campaigns rather than claiming an untested million-game UI.

Budgets are 8 MiB per sealed evidence chunk (an oversized game envelope splits
into multiple sealed chunks — no per-game size cap), 40 MiB per portable
bundle, and a separate 128 MiB monolithic Lab archive limit. UI producers
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

V1.1 (October 4, 2026) hardens that bridge: the study question binds to an explicit frozen `requestedSubject` proven legal in the information set rather than the recorded action's subject; actions are classified against the requested subject from real before/after state; inference is symmetric — the recorded reference can earn advice over every tested alternative, or an alternative over the reference; new V2 plans use variance-sensitive empirical Bernstein with a documented zero-variance floor (V1 plans keep Hoeffding forever); the world cap is 512 after real benchmarks; and Quick Read deterministically prioritizes admissible controlled evidence over observational usage.

V1.2 (October 4, 2026) is a usability/scale/semantics patch that repairs one real statistical defect: the V2 empirical-Bernstein additive term missed the support-range factor for effects bounded in [-1,+1], so V3 plans apply `3·R·ln(3m/0.05)/N` with R = 2 — strictly wider, never stronger. V3 plans also freeze auditable subject-aware action selection (a guaranteed use-vs-preserve contrast; no contrast fails closed) instead of a generic `slice(0,3)` prefix. Storage gained purpose-named budgets — external imports stay at 40 MiB, locally generated run artifacts get a separate 128 MiB archive limit, and oversized game envelopes split into independently sealed evidence chunks so an archive-size failure cannot lose completed Strategy evidence. Long-running studies lost the fixed 600-second total cutoff in favor of a progress-aware stall watchdog. `rank:`/`card:`/`suit:` subjects decompose into canonical semantic use categories (score, swap, response, combinations, …) computed from real action family/timing descriptors — additive accounting, never invented mechanics. Quick Read orders controlled claims by context-match, currency, confidence and deterministic ID — never by |effect|. The Expert Guide is now human-first markdown plus a separate sealed claim/provenance manifest. An optional local Ollama interpreter (`@intrilex/analytics-ai/strategy-interpreter`) can explain the evidence packet in plain language under strict schema + grounding validation; it is off by default, local-only, and its output is labeled non-scientific interpretation — never evidence.

V1.2.1 (correction & integration pass) fixes the defects the V1.2 rollout left open. Regular Arena now streams each finalized accepted game's sealed Strategy evidence into StrategyStore while the series runs — per-game evidence retention no longer depends on the monolithic run archive, and a crash, stop or archive failure keeps every committed game. The same canonical `FINALIZED GAME → strategyGameEvidence → addEvidence` path is shared by Arena streaming, the evidence producer and saved-run ingestion, so later sync deduplicates on immutable artifact/event identity and never double-counts. A bounded write queue applies backpressure without blocking execution; every persistence result is reported with real counts — the UI never claims evidence was "retained separately" unless it was. The explanation packet moves to `STRATEGY_EXPLANATION_PACKET_V2`: controlled uncertainty now reads the actual `claim.uncertainty.interval` (V1 checked a nonexistent `intervalPoints` field on raw claims, so valid bounds never reached the packet); numbers are published as typed `groundingFacts` (counts, percentages, percentage points, hidden worlds, …) and validation matches number+unit phrases against facts of the same unit — "29 games" can no longer ground "29%" — plus optional `usedFactIds` citation checking. The Ollama panel separates reachable status from errors, discovers installed models via `/api/tags` with a selector, persists the selection and flags a selected model that is no longer installed. Interpretation is available per surface: card, context/matchups, policy comparison, controlled study, evidence desk and an optional guide polish that treats the deterministic Expert Guide as input — the deterministic guide remains the authoritative artifact. Rank-semantic panels now state explicitly that opportunity categories overlap and must not be summed. Guide "next useful study" lines are subject-aware (`nextStudySuggestionFor`): draw vs non-draw alternatives, score vs strongest non-scoring line, combination vs simpler lines, mode vs sibling modes — no universal play-vs-preserve boilerplate, and no template is claimed where none is meaningful.
