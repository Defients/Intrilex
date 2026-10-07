ULTIMATE EVOLUTION LAB / PERSISTENT AGENT PROFILE ARCHITECTURE
FRONTIER IMPLEMENTATION SPECIFICATION — VERSION 1.31 FINAL

MISSION

Transform Intrilex's Evolution Lab into a durable system for creating, training, preserving, challenging, explaining, forking, and reusing named Agent Profiles.

A user should be able to create GRAVE MAW, define its intended identity, train descendants, evaluate them honestly, promote a qualified Challenger, return later, continue from its exact active checkpoint, and understand what changed and what evidence supports the change.

Evolution should become biography. Biography must retain its evidence.

Implement the bounded release below. Inspect the actual repository first. Preserve existing engine authority, legal decision-time information boundaries, deterministic simulation, replay/save meaning, and historical research. Do not implement speculative research systems merely because this document permits future extension.

The ten invariants below are mandatory together. Security and information boundaries are also mandatory; scientific objectives do not authorize violating them. Within those constraints prefer correctness, preservation, reproducibility, user comprehension, and measured performance over feature breadth or visual polish.


1. TEN ENFORCEABLE INVARIANTS

I1 — HISTORICAL EVIDENCE IS IMMUTABLE.
Persisted checkpoint bodies, revisions, scientific manifests, accepted result records, finalized decisions, and Journal evidence objects cannot be overwritten under their existing identities. Corrections append new records referencing the originals. Operational progress and derived caches are explicitly separate.

I2 — TRAINING SELECTS DESCENDANTS.
Generation selection and final Challenger nomination consume TRAINING evidence only. Proposal, tie-breaking, eligibility, stopping, and nomination rules are frozen before the series begins. Selection may retain the parent; a series need not discover an improvement.

I3 — HELD-OUT EVALUATION MEASURES.
HELD_OUT_EVALUATION cannot select mutations, select the best generation, select a Challenger, change a running series, or determine automatic promotion. Evaluation feedback must not enter these decision APIs. Human-guided later research is recorded as adaptive use.

I4 — PROFILE PROMOTION IS A SEPARATE DECISION.
A generation winner is not a Champion. Automatic promotion requires a finalized PROMOTION_CHALLENGE under a frozen policy against an exact incumbent and Profile head version.

I5 — STALE CHALLENGERS CANNOT OVERWRITE A NEWER HEAD.
Every head-changing command compares the complete expected head token in storage. A monotonic headVersion changes on every activation, rollback, or change to active strategic/promotion context. Checkpoint equality alone is insufficient, including after A → B → A rollback.

I6 — PROMOTION IS TRANSACTIONAL AND IDEMPOTENT.
The new head, PromotionRecord, Profile event, required structured Journal entry, and command receipt commit together or none commit. A retry of the same command cannot promote twice.

I7 — AUTHORED CHANGES ARE NOT LEARNED CHANGES.
Strategic edits create authored revisions and, when executable parameters change, authored checkpoints. Checkpoint derivation, selection outcomes, and activation reasons are separate provenance dimensions. Forking, migration, manual activation, and rollback never relabel how a genome was obtained.

I8 — ORDINARY GAMEPLAY DOES NOT TRAIN.
EXPERIENCE may append observational records. It cannot mutate a checkpoint, update intended identity, select descendants, enter fitness calculations, or move a Profile head.

I9 — OPERATIONS EXECUTE EXACT IMMUTABLE SNAPSHOTS.
Resolve a Profile or an explicit checkpoint once at operation start. Pin all execution-relevant inputs. Running and resumed operations cannot follow a moving Profile, opponent catalog, policy implementation, or mutable default.

I10 — SCIENTIFIC COMPARISONS RESPECT COMPATIBILITY.
Display deltas only for measurements whose relevant contracts are compatible. Evaluation Era boundaries remain visible. Re-evaluation creates new evidence; it does not make incompatible historical measurements interchangeable.

Enforce these at domain and persistence boundaries, not only through UI controls. Include direct negative and concurrency tests.


2. RELEASE SCOPE

SHIP NOW

- Agent Profiles, immutable authored revisions, one supported versioned generalist Capability Objective definition with immutable resolved objective instances, exact Champion references, and append-only Profile events.
- Bounded Training Series continuing from the Champion; the existing deterministic optimizer; generation selection; final Challenger nomination.
- A frozen, fixed-budget promotion policy, fresh promotion challenges, transactional activation, stale-head protection, and explicit re-challenge.
- Explicit authored activation, manual activation with truthful evidence status, historical rollback, and Profile forking.
- A small evidence-backed set of semantic controls, a deterministic versioned Trait Compiler, a Genome Definition for existing trainable parameters, and fixed intended identity during learning.
- Evidence-purpose enforcement, Evaluation Eras, pack-use/exposure records, structured Learning Journals, and a modest longitudinal dossier using supported metrics.
- Safe V1 linkage/migration, transactional browser persistence, protected retention, and versioned export/import.
- One shared immutable snapshot resolver and one real, safe non-Lab consumer, with observational Experience Records.
- Accessible Profile-centered workflows and the acceptance proof in section 22.

FOUNDATION NOW

Implement only extension seams required by shipped code:

- Explicit identifiers/versions and validators for policy families, genomes, optimizers, objectives, promotion policies, metrics, and serializers.
- An optimizer contract implemented by the current optimizer only.
- A snapshot contract usable by other consumers later.
- Experience source/context provenance sufficient for a future explicitly curated dataset.
- Compatibility functions that distinguish inspection, execution, training/resume, comparison, and promotion eligibility.

An enum placeholder, empty service, generic plugin host, or unused database store is not required merely for extensibility.

DEFERRED

Do not implement in this release:

- Additional optimizers, population evolution, co-evolution, novelty search, MAP-Elites, clustering, automatic archetype discovery, or advanced ratings.
- Automatic identity evolution, BOUNDED_IDENTITY/OPEN_EVOLUTION, additional objective implementations, a generic objective editor, specialist objective or policy families, arbitrary user-authored fitness formulas, or speculative genome expansion.
- Automatic Experience-to-curriculum conversion, online learning, neural/RL infrastructure, external compute, cloud synchronization, or Profile repositories.
- Broad integration across all policy consumers, tournament entry management, or replay counterfactual execution.
- Automated “discovery” classifications, global style similarity/drift scores without validated definitions, motif mining, LLM narration, or elaborate lineage visualization.

Preserve existing capabilities. These deferrals restrict new work; they do not authorize deleting working V1 features.


3. REPOSITORY RECONCILIATION AND PRESERVATION BOUNDARY

Before implementation:

1. Establish the actual checkout, applicable AGENTS.md, current tree, and unrelated dirty work. Do not reset or overwrite user work.
2. Inspect Evolution domain, training/evaluation, checkpoints, research identity, browser/Node execution, worker ownership, storage/retention, import/export, and existing tests.
3. Inventory policy consumers to identify the shared resolution boundary; deeply inspect only the consumer selected for this release and shared paths it uses.
4. Verify the actual optimizer, policy family, parameter set, database version, hashing contracts, supported runtimes, and legacy formats. Names in this prompt are conceptual unless verified.
5. Record existing test failures and evidence limits. Prior audit reports are context, not proof about this tree.
6. Check the known analytics risks: paired-seat sampling aliasing, ambiguous chart identity, missing opportunity denominators, and terminal winner versus terminal-score ambiguity. Preserve existing fixes; repair verified issues in affected paths.
7. Produce a concise architecture map and risk register: failure mode, invariant, owner/boundary, mitigation, proving test.

Repository behavior describes the starting point. It does not waive the new invariants. When changing semantics, create an explicit version boundary and preserve historical interpretation.

Prefer reuse where ownership matches. Do not duplicate evaluation engines, persistence systems, or policy logic. Do not migrate the UI framework as part of this work.

Stop an implementation path that requires rewriting historical evidence, changing old IDs, inventing equivalence, weakening legal-information boundaries, or discarding research. Design a compatible boundary and report any remaining blocker. Continue independent authorized work.


4. DOMAIN OWNERSHIP

These are distinct meanings, not a mandate for one class, table, or service per row.

Agent Profile
- Persistent identity, display metadata, ancestry links, and the current active head.
- Requires no legacy archetype classification. Its display identity, intended identity, strategic history, genome, observed behavior, and Champion lineage are not semantically defined by an archetype label.
- Does not contain mutable executable weights or an authoritative aggregate “intelligence” score.

Profile Revision
- Immutable authored strategic contract: intended traits, enforceable identity constraints, exact immutable Capability Objective instance/manifest reference, and versioned training/promotion defaults.
- Draft revisions do not change the active head.
- A running operation uses its pinned revision, not the newest revision.

Capability Objective
- An immutable resolved objective instance/manifest states what competence means: target domain/suite, outcome metric, aggregation weights, direction, and hard constraints. It records the supported definition ID/version, resolved configuration, and instance identity/content digest.
- Training fitness and promotion criteria are explicit applications of this objective, not competing definitions of “better.”
- Ship one supported generalist Capability Objective definition over a frozen reference suite, with documented constraints. Reuse equivalent V1 definitions where correct.
- Each Profile Revision and Training Series references the exact immutable resolved objective instance/manifest it uses. Persist that identity and definition version in scientific provenance; historical references must never resolve through a mutable global current-objective value.
- Identical resolved manifests may be shared. The domain must permit distinct immutable instances of the shipped definition and future supported objective types without redesigning Profile history; it must not encode a permanent singleton assumption. Additional implementations and objective editing remain deferred.

Training Series
- Bounded learning episode for one Profile, one starting checkpoint, one revision, one exact immutable objective instance/manifest, and one frozen search plan.
- May reference existing Experiments and runs rather than replacing them.
- Does not own the Profile head.

Experiment
- Existing scientific configuration/provenance container. Preserve its historical identity. Define its relationship to new Series explicitly.

Generation / Generation Selection
- One search step with a parent, proposed candidates, TRAINING evidence, and a persisted selection decision.
- Candidate is a role of a checkpoint in that step.
- Use seriesId plus generationIndex; do not use a naked “G88” as global identity.
- Retaining the parent is a selection outcome, not proof of newly learned state.

Challenger
- Immutable nomination of one exact checkpoint from a Series, with the TRAINING-only nomination rule and source references.
- Has zero or more distinct challenge attempts. Re-challenge does not rewrite an earlier attempt.

Champion
- Role of the checkpoint currently referenced by the Profile head.
- “Active” is not a scientific certification. Bootstrap, imported, manually activated, and evaluated Champions can have different evidence status.

Promotion
- Evidence-backed head transition after a challenge. A successful transition gets an immutable PromotionRecord.
- Rejected, invalid, or inconclusive attempts retain decisions/evidence without a successful PromotionRecord.

Evidence Purpose
- Immutable intended use assigned in the run manifest before execution, validated against the producing operation.

Evaluation Era
- Immutable measurement contract used to decide whether results can be scientifically compared.

Experience Record
- Observational encounter from normal use, pinned to exact execution provenance; never implicitly scientific selection data.

Learned Genome
- Concrete executable parameters in an immutable checkpoint, with derivation history.
- A genome is not automatically “learned”: baseline/authored values and optimizer-derived values must remain distinguishable.

Intended Identity
- Authored strategic targets and constraints in a revision; never substituted for observed behavior.

Observed Behavior
- Versioned measurements from actual encounters, with context, denominators, uncertainty, and availability.

Learning Journal
- Immutable structured explanation of an actual head transition and its evidence, with deterministic presentation.

Avoid ambiguous profileId fields where rules, account, and agent profiles coexist. Use agentProfileId, rulesProfileId, and profileRevisionId explicitly.

Criteria ownership is explicit: the Objective owns the competence measure and performance constraints; the Revision owns intended identity and its constraints; the Promotion Policy owns evidence sufficiency and the activation decision rule. Freeze their resolved criteria together. Conflicts fail validation; policy defaults cannot silently weaken the active objective or identity contract.

CUSTOM PROFILE IDENTITY

An Agent Profile does not require a legacy archetype classification. Control, Tempo, Value, Score Rush, tactical variants, and future named archetypes may serve as optional initialization templates, benchmark opponents, authored starting priors, convenience presets, or historical/static policy references. They are not mandatory Profile identity classes.

A custom Profile such as GRAVE MAW or VELVET GUILLOTINE can be created, trained, promoted, forked, compared, and used through supported Intrilex consumers without a permanent archetype label. Any internal base/static policy family is execution provenance or an implementation detail, not permanent product identity. Profiles must be able to become strategically distinct from their initialization template without changing this identity contract. Enforce this through existing domain contracts; no separate archetype abstraction is required.


5. ONE ACTIVE HEAD, EXPLICIT ACTIVATION

Store a coherent active head containing at least:

- agentProfileId;
- headVersion, monotonically increasing;
- activeRevisionId;
- championCheckpointId;
- requiredEvaluationEraId;
- exact effective promotion-policy reference;
- last head-transition reference.

The exact immutable objective instance/manifest reference comes from the active revision; do not keep an independently writable duplicate or resolve it through an unversioned global singleton. Materialized convenience fields must be validated or derived.

Creation atomically installs an initial revision/checkpoint pair and INITIALIZED event. Label the initial Champion BASELINE or AUTHORED and UNEVALUATED unless applicable evidence exists. Initialization is not successful promotion.

Custom creation accepts supported semantic traits and compiles a concrete genome without requiring selection of a legacy archetype. Template-based creation is optional and snapshots resolved starting parameters and template provenance. Later template changes cannot mutate existing revisions, genomes, checkpoints, or Profile identity; applying new template values requires an explicit authored edit.

Display-name/tag changes need not create scientific revisions. Changes to traits, objective, identity constraints, or strategic defaults do.

Authored editing:

1. Preserve the current head.
2. Create a draft revision; compile/validate any changed executable parameters into an AUTHORED checkpoint.
3. Show the full resulting genome delta and which learned values would be replaced.
4. Require an explicit Activate Authored Revision command to install the new pair.
5. Use the same transactional, expected-head, and idempotency rules as other activations.
6. Record an authored intervention, without inventing a performance improvement.

For configuration-only edits, a new revision may reference the unchanged checkpoint. Record the absence of an executable change. The checkpoint's creation revision and the revision authorizing the current operation are distinct references.

After authored activation, normal Continue Training begins from that now-active checkpoint. This resolves the authored-root versus Champion-continuation boundary without a second hidden training head.

Updating the required Evaluation Era or effective promotion policy is an explicit context change that increments headVersion. Validate alignment with the active objective and revision; a changed target suite or strategic objective requires a new revision rather than a silent context substitution. Saving an inactive draft does not invalidate active work.

Forking creates a new Profile and independent head history referencing the exact source checkpoint/revision. Do not rewrite the source checkpoint's ancestry to make it belong to the fork.

Rollback explicitly activates a historical checkpoint/revision pair, retains the current required measurement era unless separately changed, increments headVersion, and appends history. It never restores an old headVersion or revives an old challenge authorization.


6. CHECKPOINTS, TRAITS, AND PROVENANCE

A checkpoint contains or immutably references its concrete genome, policy implementation identity, Genome Definition, execution requirements, parent/derivation, and original provenance.

Concrete genome is execution authority after compilation. Runtime never reads current sliders or silently recompiles historical values.

Preserve existing checkpoint IDs and hashing algorithms. New schema versions may introduce a separate executable-content digest to identify equivalent genomes without changing old identities.

For new immutable formats, define canonical serialization, included fields, numeric representation, and handling of missing values. Reject non-finite numbers and unsupported fields rather than silently normalizing scientific meaning. Keep display metadata and run timing out of executable identity.

Separate provenance:

- Derivation: baseline, authored edit, optimizer mutation, or an explicitly versioned semantic conversion.
- Selection: selected child, retained parent, disqualified, or not selected.
- Relationship/activation: initialized, forked, linked from V1, promoted, manually activated, or rollback.

A fork may share an unchanged checkpoint. Migration may wrap an unchanged checkpoint. Neither requires a new genome or a false derivation label. Preserve V1 retained-parent checkpoint conventions, but do not require new identical checkpoints merely to increment a generation.

Genome Definition:
- Named parameters, type, units, bounds, defaults, runtime meaning, and mutation/user-edit eligibility.
- Explicit validation and compatibility version.
- Start with proven V1 parameters. New policy features require a verified expressibility gap, legal information source, bounded behavior, and focused tests.

Trait Compiler:
- Deterministic, versioned function of explicit traits and an explicit base genome.
- Declare which parameters it writes; copy unrelated parameters unchanged.
- Initial creation uses a declared baseline genome and supports custom semantic traits without an archetype label. A baseline's implementation family does not define the resulting Profile's intended identity or learned genome. Tuning uses a declared source checkpoint.
- Coupled mappings must expose all affected parameters in the preview.
- Compiler updates cannot change stored genomes.

Ship only controls that demonstrably change legal action ranking in valid fixtures and have understandable policy meaning. Reject placebo controls and duplicate aliases.

Fixed intended identity is the only shipped identity mode:
- Training never changes authored trait targets.
- The revision specifies actual allowed mutation bounds/fixed coordinates.
- Behavioral identity constraints, when enabled, name versioned metrics, contexts, minimum opportunities, and bounds.
- Generation eligibility checks use TRAINING measurements; promotion checks use PROMOTION_CHALLENGE measurements.
- Missing required measurements make the decision ineligible or inconclusive, never an automatic pass.
- Fixed targets or weights do not guarantee identical behavior in every state. Describe observed drift separately and only within measured contexts.
- Do not claim a low-aggression preference guarantees both unrestricted maximum strength and low aggression. Identity constraints can impose a real tradeoff.
- If constraints leave no trainable dimensions, report that explicitly; do not relax them silently.


7. TRAINING SERIES AND DETERMINISTIC SELECTION

Before starting a Series, persist an immutable manifest containing:

- Profile head token, source checkpoint, active revision, exact objective instance/manifest identity and definition version, and ancestry;
- exact policy/genome/optimizer versions and validated configuration;
- TRAINING pack, frozen opponent checkpoints, rules/runtime identity, and limits;
- evolution RNG specification/seed and deterministic candidate indexing;
- generation/candidate budgets, selection rule, tie-breaks, and Challenger nomination rule;
- supported identity constraints;
- references to any planned measurement manifests.

The training subsystem receives TRAINING evidence only. Merely filtering a generic results array by a user-editable label is insufficient: validate evidence against the registered manifest, subjects, pack, purpose, completeness, and hashes.

Preserve the current deterministic optimizer. Its proposal/selection/state contract must be explicit, but implement no second optimizer.

Selection includes the parent under the same training contract. Keep deterministic parent-first tie-breaking where compatible with V1. Persist the selection before any subsequent held-out measurement.

For this release, nominate the final committed training-selected checkpoint at the frozen generation budget. Do not scan held-out curves for the “best generation.” A no-change series can complete without a novel Challenger.

Pausing/cancellation retains accepted evidence and committed selections. A cancelled partial Series does not automatically nominate its best-looking intermediate result. Resume only under the same manifest, optimizer state, candidate ordering, and RNG semantics. A changed scientific configuration creates a new Series.

Normal stop/resume must not become evaluate → inspect → change budget → claim the resulting candidate was independently selected. Record such later work as a new adaptive episode.

Different Series may run from the same head. For one Series, serialize durable progress with an owner/fencing token or an equivalent compare-and-swap contract so duplicate runners cannot commit divergent generations.

Worker count and callback arrival order must not affect proposals, selections, accepted scientific results, or aggregate ordering. Pin both agents and all opponents. Record fault/retry attempts; never erase an unfavorable accepted result by rerunning it.


8. EVIDENCE PURPOSE AND EXPOSURE

Assign purpose before execution:

TRAINING
- Fitness, mutation selection, allowed training identity checks, final nomination.
- Cannot independently establish generalization or authorize Profile promotion.

HELD_OUT_EVALUATION
- Measurement, regression reporting, dossier, and historical comparison.
- Cannot feed selection, adaptive stopping, final nomination, or automatic promotion.

PROMOTION_CHALLENGE
- The only evidence purpose accepted by the automatic promotion gate.
- Measures an exact frozen Challenger/incumbent comparison.
- It is selection evidence at Profile level; do not present its winning score as an unbiased estimate of the selected Champion's general strength.

EXPERIENCE
- Normal-use observations only.

DIAGNOSTIC
- Debugging and targeted investigation only.

The producing manifest owns purpose. Results cannot acquire eligibility merely by editing an enum, copying them into another collection, or assigning a new pack ID.

Use one reusable evaluation runner with purpose-specific admission contracts; separate purposes do not require separate engines.

For new automatic promotions under this specification, require fresh challenge evidence. Small experiments may simply end without promotion. Do not reuse HELD_OUT_EVALUATION as a promotion shortcut.

Record pack contents/digests, sampling method, seeds/scenario identifiers, and actual use. Reject overlap between new independent held-out/challenge manifests and relevant known training/exposed samples; different pack names do not establish disjointness. Intentionally reused benchmarks are descriptive and ineligible as fresh challenge evidence. Maintain known training/exposure ancestry across local Series and forks, and record unknown external ancestry rather than claiming global independence.

A new seed pack alone does not make an adaptively tuned benchmark independent. Record result release, human review where observable, decision use, and declared later tuning. Do not claim to know whether a person inspected an externally exported file.

A pack's immutable contents/purpose remain unchanged; retirement and exposure are append-only lifecycle/use records. Reused or externally supplied packs can still support descriptive benchmarks, with reuse or unknown-exposure labels. “SYSTEM_ONLY” is not evidence of independence when the system made a selection from the result.

For this release, no Experience/Diagnostic-to-training conversion UI or ingestion pipeline. Future conversion must create a new versioned dataset with source references and explicit selection logic. Original records retain their original purpose.


9. FROZEN PROMOTION CONTRACT

Before challenge execution, freeze:

- challenger checkpoint and nomination;
- exact incumbent checkpoint;
- expected complete Profile head token;
- revision, exact objective instance/manifest identity and definition version, Promotion Policy version, and Evaluation Era;
- frozen suite/opponents, challenge pack, and sampling provenance;
- planned complete paired seed blocks and all required sample counts;
- outcome coding, aggregation weights, practical improvement threshold;
- regression floors, reliability requirements, and applicable identity constraints;
- uncertainty method/version, independent sampling unit, confidence level, and treatment of multiple gate criteria;
- failure, missing-data, retry, stopping, and tie/inconclusive rules.

Ship one fixed-budget generalist policy. Before enabling it, choose and document concrete defaults from inspected metric semantics and a declared compute budget. Do not leave executable defaults as “reasonable,” unspecified, or outcome-dependent. Resolve these values during Gate 0/1, before observing implementation challenge results.

The simplest shipped comparison evaluates incumbent and Challenger against the same frozen reference opponents and paired seeds. Aggregate according to the Capability Objective. Additional direct head-to-head contests are optional diagnostics unless explicitly part of the frozen objective.

Treat an AB/BA seed pair as one paired unit, not two independent observations. If the same seed is reused across opponents, preserve the larger dependency block in the uncertainty calculation. Report pair counts and game counts separately.

Use an appropriate existing paired estimator if validated; otherwise implement one documented method. Validate its assumptions, small-sample behavior, all-equal outcomes, and interval handling. A sample-size badge is not a confidence interval.

Automatic approval requires:
- complete valid evidence matching the manifest;
- a passing improvement criterion with the policy's required uncertainty support;
- every applicable regression/reliability/identity constraint satisfied;
- no unavailable required metric;
- freshness at commit.

Do not drop faulty, cancelled, unresolved, or missing games from denominators and then call the planned challenge complete. Canonical draws are valid outcomes; infrastructure faults are not draws. The shipped reliability gate requires no failed/unresolved planned games. Infra retries must follow the frozen rule and retain prior attempts.

Use APPROVE, REJECT, INCONCLUSIVE, or INVALID for the scientific decision; stale head authorization is a separate condition. Insufficient evidence is INCONCLUSIVE, not “probably passes.”

Fix the sample budget in advance. No extending a challenge until it wins, optional stopping on favorable results, or choosing a subset of completed games.

Default to one automatic decision attempt per checkpoint pair, revision/objective, policy, and era. Transport retries/resume continue the same attempt. A fresh attempt against a genuinely changed incumbent is a new challenge; historical attempts remain visible. Prevent head rollback or cosmetic policy changes from laundering repeat attempts into first attempts.

Record repeated testing and selection history. A per-challenge uncertainty statement is not lifetime family-wise error control or proof of broad superiority. Formal continual-testing guarantees are deferred; label claims accordingly.

Held-out results may be reported after nomination, or after promotion for a cleaner post-selection audit. Showing a measurement must not alter the frozen automatic decision. Explicit human intervention is separately recorded and never described as independent automatic qualification.


10. TRANSACTIONAL PROMOTION AND MANUAL ACTIVATION

Perform simulation and expensive explanation preparation outside the storage transaction. Persist immutable results and a finalized challenge decision first.

Within one authoritative read/write transaction:

1. Look up commandId. Return its existing receipt for an identical retry; reject reuse with a different payload.
2. Re-read Profile head and compare headVersion, checkpoint, revision, and effective promotion context with the expected token.
3. Validate the exact immutable challenge decision, manifest/evidence references, eligibility, and permitted current context.
4. Append PromotionRecord, Profile event, minimal complete structured Journal entry, and command receipt.
5. Update the Champion reference and increment headVersion.
6. Commit, then publish success/update the UI.

A stale command produces no successful transition. The original evidence remains historical. In A → B → A, the returning checkpoint does not restore the old authorization.

Use real storage transactions across the affected stores. A JavaScript mutex, preflight check, or notification channel is not cross-tab atomicity. Await transaction completion, not an individual request's success. Do not perform unrelated awaited work inside an IndexedDB transaction.

If journal preparation fails, do not move the head. Optional rendering/cache failures after a committed transition must not make the UI retry a new promotion blindly; recover through the command receipt.

Explicit re-challenge creates a new attempt against the current head and new purpose-appropriate evidence, retaining the original candidate and failed/stale attempts. It never rebases a genome or edits its lineage.

Manual activation may waive performance thresholds or evidence adequacy, with an explicit reason and preserved automated recommendation. It cannot waive integrity, executable compatibility, freshness, missing checkpoint, transaction, or idempotency checks. A stale candidate must be explicitly targeted against the current head in a new command.

Initialization, authored activation, manual activation, rollback, and context changes use the same atomic head-transition discipline with their own event types. They are not fabricated automatic promotions.


11. EVALUATION ERAS AND COMPATIBILITY

An Evaluation Era records the measurement contract:

- engine/rules and relevant execution semantics;
- exact reference opponents;
- scenario distribution and seed-generation protocol;
- seating, termination/decision limits, outcome definitions;
- metrics, aggregation weights, and relevant statistical definitions.

An era excludes candidate identity, Profile display metadata, and unrelated UI versions. Different fresh seed samples from the same declared protocol do not automatically require different eras. A changed opponent, metric meaning, rules behavior, or sampling population does.

Record exact pack IDs in each result. Same era alone is not sufficient for every comparison: paired deltas require matched blocks; different samples require an appropriate unpaired comparison and uncertainty. The minimal release may decline unsupported comparisons.

Implement explicit checks with structured reasons:
- canInspectArtifact;
- canExecuteCheckpoint;
- canTrainOrResume;
- canCompareMeasurements;
- canPromoteInContext.

Historical readability does not imply executability. Executability does not imply current evaluation. Current evaluation does not imply sufficient evidence for promotion.

A compiler or optimizer version may matter to derivation/reproduction without being required to execute an already materialized genome. A UI release does not automatically create a scientific era. Unknown implementation equivalence is not presumed.

If an old execution contract cannot be provided, keep the artifact readable and label execution unsupported. Do not substitute the latest policy implementation under the old checkpoint identity. A semantic conversion produces a new derived artifact with explicit provenance.

Bridging means new evaluations of exact historical checkpoints under a common supported era. Compare those new measurements with one another. One shared anchor is not permission to splice every old result into a continuous improvement curve.

A Profile may be playable, currently training, imported, and scientifically stale simultaneously. Represent execution capability, operation status, evidence freshness, uncertainty, and provenance as separate axes rather than one mutually exclusive status enum.


12. OBSERVATION, DOSSIER, AND LEARNING JOURNAL

Use recorded evidence; do not manufacture historical telemetry.

Each metric has an ID/version, definition, unit, availability conditions, numerator/denominator where applicable, and collection context. Zero opportunities produce unavailable/undefined rates, not zero behavior. Changed definitions require a comparison boundary.

Ship the useful subset supported by existing telemetry:
- paired performance and matchup vector;
- uncertainty and sample counts;
- seat effects and reliability/termination categories;
- supported action/opportunity behavior;
- intended constraints beside observed measurements;
- separated TRAINING, HELD_OUT_EVALUATION, and PROMOTION_CHALLENGE evidence.

Break charts at incompatible eras/metric definitions. Keep raw denominators and textual/table alternatives. Exploratory subgroup findings are labeled exploratory; do not choose retrospective “biggest gains” and call them confirmed discoveries.

Every head transition gets a structured explanation appropriate to its origin. A successful promotion Journal includes:
1. Internal parameter change.
2. Observed behavior change.
3. Performance change.
4. Regressions/tradeoffs.
5. Decision and activation reason.
6. Bounded interpretation.
7. Evidence quality, purpose, exposure, and comparability.
8. Exact evidence references.

Authored edits, manual activation, bootstrap, and rollback receive truthful explanations, including “not measured” where applicable.

Generate the structured object deterministically from frozen inputs and a versioned explanation generator. Store the original evidence object. Later corrections append a superseding entry; later presentation changes do not rewrite the original scientific claim.

“Parameter changed,” “behavior changed,” and “parameter caused behavior” are different claims. Do not infer causation from correlation, or equate an optimizer mutation with established learning.

Avoid mandatory LEARNING/ADAPTATION/DISCOVERY classifiers. Explain what was observed and what remains inconclusive. Strength, uncertainty, and freshness remain separate.


13. IMMUTABLE EXECUTION SNAPSHOTS AND EXPERIENCE

Provide a shared resolution boundary for:
- resolveProfileHead: current Profile head → exact checkpoint and context;
- resolveCheckpoint: explicit historical/candidate checkpoint → exact executable snapshot.

Both return a validated immutable snapshot with exact executable content, policy/runtime requirements, rules, relevant provenance, and content identity. Evaluation and training must use explicit candidate checkpoints; do not force them through the current Champion resolver.

Operations pin participants, opponents, execution identities, rules, and seed plans as applicable. Persist sufficient manifest data to resume safely. On reload/code upgrade, resume only if the exact contract is supported; otherwise preserve progress and report incompatibility.

Integrate one existing non-Lab consumer end to end, preferably normal local AI play or a safe Arena path. Record Profile/revision/head metadata when Profile-selected and exact checkpoint metadata for every execution. Verify hidden information boundaries and expected performance.

Promotion during a match cannot change its policy. No silent fallback to baseline when resolution fails.

Experience Records use stable encounter/deduplication identity and retain source, actual participants/checkpoints, rules/execution contract, outcome, and available observations. Store only information authorized for that consumer. Recording must be bounded and cannot silently train or promote.

Experience write failure does not rewrite a completed match outcome; report the missing record honestly. A duplicate delivery cannot create duplicate encounters.

Other app surfaces retain their existing behavior. The shared contract is the foundation for later integration, not permission to rewrite all consumers now.


14. STORAGE, IMMUTABILITY, AND OPERATIONAL STATE

Use the existing persistence approach where suitable. Browser Profile authority must support atomic multi-store transitions.

Ship one authoritative browser Profile store. Existing Node execution may produce pinned research artifacts, but artifact ingestion is not authority to overwrite a browser head. Preserve Node workflows without inventing browser/Node distributed transactions or automatic history synchronization.

Separate:
- immutable scientific artifacts and accepted results;
- mutable, fenced operational progress;
- transactional active heads and command receipts;
- rebuildable projections/caches and display metadata.

Immutable writes use insert-or-verify semantics: an identical repeat is idempotent; the same ID with different immutable content is corruption and must be rejected. Enforce this for nested artifacts too, not only checkpoint ID arrays.

Accepted game evidence is append-only even while a run is active. A finalized result/decision is immutable. Retry attempts get distinct attempt provenance. Aggregate corrections preserve the old aggregate and identify the corrected inputs.

Profile events are append-only records with transaction-assigned ordering. Use logical sequence/head versions for ordering; wall-clock timestamps are descriptive.

Checkpoint, revision, evidence, and promotion references must resolve or have an explicit unavailable/historical state. An active executable head cannot reference a missing/corrupt checkpoint.

Do not require event sourcing for every application feature. A transactional head plus append-only transition records and immutable artifacts is sufficient.

Enforce cancellation/worker ownership before accepting results. A late message from an obsolete runner cannot append evidence or change completed operations. Notifications invalidate stale views; storage remains authoritative.

Document browser-local durability limits, quota behavior, and export recovery. Application immutability is not authenticated external authorship, physical write-once storage, or protection against browser storage deletion.


15. V1 MIGRATION AND RECOVERY

Preserve original V1 checkpoint, generation, experiment, run, evaluation IDs, payloads, hashes, and scientific identities.

Prefer additive Profile wrappers and explicit mappings. Link an explicitly selected V1 checkpoint as an initial active checkpoint with MIGRATED_FROM_V1 provenance and truthful evidence status. Do not infer a trustworthy Champion by picking the highest historical held-out score.

Read legacy EVALUATION purposes under their original schema and documented semantics. Do not rewrite them into new PROMOTION_CHALLENGE evidence.

Migration must be versioned, idempotent, resumable where needed, and tested on representative real legacy fixtures. Keep migration progress outside historical scientific payloads.

Choose and document one concrete failure strategy:
- additive atomic schema upgrade where feasible;
- copy-forward/staged conversion for transformations requiring more work;
- retained legacy inspection/export through current readers.

Account for blocked upgrades, open old tabs, versionchange, aborted upgrades, quota exhaustion, and partial copy/import. Old clients must not continue incompatible writes after upgrade.

Do not delete old stores or source artifacts as part of this release's migration. Do not promise that a successful database upgrade can be undone by opening a lower version. Recovery must work with the actual storage API.

Legacy unknown provenance/telemetry remains unknown. A migrated Profile was created at migration time; the older lineage history retains its original dates.


16. RETENTION AND EXPORT/IMPORT

Retention protects the transitive evidence required to explain and recompute committed scientific decisions:

CORE
- revisions, objectives, contracts, Profile events, all head history;
- checkpoints referenced by active/historical heads, forks, selections, or decisions;
- Series manifests, generation decisions, candidate mutation/rejection summaries;
- challenge manifests, decisions, promotions, Journals, command receipts needed for idempotency;
- compact result/block data and denominators needed to reproduce selection/promotion metrics;
- pack contents/provenance and relevant exposure records.

RESEARCH
- supplementary analyses and measurements not required by protected decisions.

DEEP TRACE
- selected replays, diagnostic games, and decision traces.

Protect reference closure, not merely “promoted checkpoints.” A retention label cannot authorize deleting evidence cited by a promotion.

Optional trace pruning appends a retention manifest/tombstone. The original result remains immutable; the UI distinguishes summary retained from full trace available. Missing traces limit replay, not the recorded existence of a result.

Use explicit per-run/storage budgets. At quota exhaustion, stop new work safely and offer export/authorized pruning; never silently evict protected evidence.

Export from a consistent storage snapshot. Include a manifest of artifact IDs/hashes, schemas, required dependencies, retained/omitted traces, active head, and scientific/provenance history.

Import:
- Validate size, schema, hashes, references, ancestry, and supported value bounds before activation.
- Stage large imports and expose them only after complete validation/finalization.
- Reject same-ID/different-content artifacts.
- Identical imports are idempotent.
- Do not let an older/divergent imported Profile overwrite an existing local head. Reject the conflict or offer an explicit import-as-fork with a new Profile identity; preserve source artifact IDs and origins.
- Unknown future formats are inspectable only where supported, never coerced into compatibility.
- Imported claims remain externally unverified. Hash validity proves internal consistency, not authorship or scientific validity.
- An imported decision cannot authorize a local automatic promotion. Require a fresh locally executed challenge admitted under the current contract; never import a command receipt as authority to execute a local head change.
- New local verification adds local evidence without erasing import provenance.
- Deduplicating against known local artifacts must not downgrade or overwrite their verified local records.

Do not build automatic cross-device history merging.


17. UI AND PRODUCT COMPREHENSION

Adapt existing routes/components. Ship coherent Profile workflows; six new tabs are not an acceptance requirement.

Provide custom creation without required archetype selection. Present legacy strategies as optional templates/presets or benchmarks; a Profile's own name and identity remain primary throughout creation, tuning, comparison, training, promotion, and supported app use.

Provide:
- Roster and overview: active checkpoint, authored identity, objective, execution capability, evidence freshness, sample/uncertainty context.
- Learn: frozen Series source, progress, candidates, selection, Challenger, challenge decision, and activation controls.
- Analyze/history: compatible comparisons, evidence purposes, Journal, authored interventions, forks, migration, and rollback.
- Tune/research details: revision drafts, meaningful controls, concrete genome preview, exact contracts, hashes, and evidence references.

Expose advanced scientific metadata progressively. Do not show invented style labels, fake IQ, or a single badge that combines strength, confidence, and freshness.

Handle loading, empty, failure, cancellation, unsupported execution, missing evidence, imported provenance, stale head, draft revision, and inconclusive challenge states.

Support keyboard use, form labels, visible focus, accessible tables/chart descriptions, non-color status indicators, reduced motion, and mobile layouts without page overflow.


18. VERSION AUTHORITY AND PERFORMANCE

Maintain a compact compatibility registry or equivalent documented authority for shipped schemas and contracts. Separate storage/export schema versions from policy, genome, compiler, optimizer, objective, promotion, metric, and measurement-era versions.

A version string must resolve to exact validated semantics or be unsupported. Never map an unknown version to “latest.”

Keep deterministic scientific outputs separate from operational timestamps, worker counts, elapsed time, and UI state. Preserve browser/Node and worker-count reproducibility for supported execution contracts. Do not promise reproduction when the required implementation is unavailable.

Use inexpensive hot-loop counters and post-run aggregation. Deep tracing remains optional. Benchmark representative affected paths against the same workload/settings and report material throughput/storage changes.


19. IMPLEMENTATION GATES

GATE 0 — RECONCILIATION
- Architecture map, current baseline, risks, preserved identities, consumer choice, and concrete release scope.
- Resolve the shipped objective definition and immutable instance/manifest contract, identity-control mapping, promotion measurement/defaults, and migration design before building dependent UI.

GATE 1 — CONTRACTS AND DURABLE HEAD
- Immutable artifact writes, Profile/revision/checkpoint contracts, snapshot resolver, compatibility functions, additive storage/migration.
- Initialization, authored activation, fork, rollback, expected-head checks, and idempotency.
- Tests for transaction abort, conflicting tabs, A → B → A, and import collision.

GATE 2 — SCIENTIFIC LOOP
- Series continuation, fenced stop/resume, TRAINING-only selection and nomination.
- Frozen challenge execution, paired analysis, stale re-challenge, atomic promotion.
- Evidence-purpose and failure-path tests before promotion UI is declared complete.

GATE 3 — EVIDENCE PRODUCT
- Journal, dossier, era boundaries, retention protection, complete export/import.
- Profile workflows and accessible scientific states.

GATE 4 — CONSUMER AND ACCEPTANCE
- One real non-Lab consumer, pinned snapshots and Experience Records.
- End-to-end lifecycle and final validation.

Define the snapshot and compatibility boundary early; prove external integration last. Export/retention and trait constraints belong in the data design before producing new evidence, even if their UI ships later.

Do not progress past a gate whose required invariant tests fail. A pre-existing unrelated failure must be documented, not mislabeled as a new failure or as PASS. A required gate blocked by the environment remains BLOCKED; do not quietly reduce SHIP NOW scope.


20. REQUIRED ADVERSARIAL TESTS

Map every invariant to its enforcement function/storage boundary and proving test. Include:

- Custom Profile creation without a legacy archetype classification, followed by training and the promotion path without reliance on an archetype identity field.
- Optional legacy-template initialization does not impose permanent archetype identity; subsequent template changes leave existing Profiles, revisions, and genomes unchanged.
- The shipped generalist objective uses immutable instance identity and definition version; distinct resolved manifests can coexist, and historical Series remain pinned to their starting objective when a later revision/default resolves another instance.

- Mutation of persisted immutable payloads rejected, including altered nested results with unchanged IDs.
- TRAINING selection/nomination unchanged when held-out/challenge results are absent or adversarially changed.
- Forged purpose labels, overlapping packs, wrong subjects, incomplete AB/BA blocks, duplicate/missing ordinals, and unsupported metrics rejected.
- Parent retention and no-improvement completion without fake learning or automatic promotion.
- Exact continuation after reload and resume; different worker counts/browser/Node agree on canonical scientific output.
- Two Series from one head; one promotion; the second authorization becomes stale.
- Simultaneous promotions from independent browser connections: at most one wins.
- Rollback A → B → A, revision-only changes, and era/policy changes invalidate old authorizations.
- Duplicate commands before/after acknowledgement loss produce one transition; reused commandId/different payload is rejected.
- Transaction failure at each write boundary leaves no partial head/record/Journal transition.
- Late worker results, double resume, and cancellation cannot corrupt accepted history.
- Authored trait edit previews affected learned values, creates authored provenance, and leaves parent/history unchanged.
- Compiler upgrades do not recompile old checkpoints; constraints and unsupported controls behave honestly.
- Unavailable/zero-denominator metrics are never invented as zero.
- Cross-era deltas blocked; valid common-era re-evaluation creates new records.
- Manual activation cannot bypass compatibility, integrity, or expected-head checks.
- Running external operation remains pinned after promotion/rollback; ordinary play cannot train or promote.
- Retention protects evidence closure; pruned traces are explicit.
- Legacy migration hashes/IDs unchanged; blocked/interrupted/quota-failed migrations recover.
- Import hash/reference/collision failures do not partially publish data; divergent head import cannot overwrite local history.
- Accessible primary workflows and truthful stale/inconclusive/error presentation.

Use real IndexedDB/browser tests for multi-connection transaction behavior in addition to unit tests. Use fixed scientific fixtures for expected decisions and real simulation for lifecycle evidence; identify each honestly.

Run relevant registered tests, build, lint, typecheck, determinism/cross-runtime checks, browser checks, and diff checks. Register new tests in the repository's actual test/CI mechanism. Do not install unrelated infrastructure or regenerate scientific fixtures merely to obtain green results.


21. FINAL IMPLEMENTATION REPORT

Deliver:
- Actual V1 architecture and preservation/migration decisions.
- Shipped versus foundation versus deferred scope, including blockers.
- Invariant table: invariant → enforcement location → data contract → proving test/result.
- Concrete objective/promotion defaults and statistical assumptions.
- Lifecycle evidence and migration/import/retention failure evidence.
- Performance/storage comparison where affected.
- Validation statuses: PASS, FAIL, NOT_RUN, BLOCKED, or STALE, with reasons.
- Residual scientific, compatibility, storage, and product limitations.

Keep the report evidence-backed and proportionate. A 49-section checklist is not required.

Always distinguish:
- Software validation: “Continuation and atomic activation work.”
- Empirical observation: “Checkpoint C scored X on this stated measurement contract.”
- Promotion decision: “C satisfied policy P against incumbent B.”
- General strategic claim: “This Profile is broadly stronger.”

The fourth requires substantially more evidence than the first three.


22. REQUIRED END-TO-END ACCEPTANCE SCENARIO

Use a real custom Profile named GRAVE MAW or VELVET GUILLOTINE, created without selecting a legacy archetype.

1. Create it without an archetype classification. Verify stable identity, revision, immutable Capability Objective instance/manifest identity and definition version, supported semantic traits, compiler provenance, concrete genome, initialized Champion, and truthful unevaluated status.
2. Start Series 1. Verify exact source head/checkpoint/revision, exact objective instance/manifest reference, and frozen search manifest.
3. Produce real candidates. Show non-selection/rejection, a committed training selection, and final nomination or a truthful no-change result.
4. Run held-out measurement without altering selection or nomination. Run a distinct frozen promotion challenge when there is a Challenger.
5. If qualified, commit one atomic promotion with PromotionRecord, Profile event, Journal, and receipt, without requiring an archetype identity field. Otherwise retain the incumbent and record the real reason. Do not rig game results.
6. Reload. Verify the resulting active head and scientific history persist.
7. Start Series 2. Prove it begins from the current resulting Champion, not a hardcoded baseline. Verify historical Series retain their exact starting objective instances even when a later revision/default resolves another instance of the shipped definition. If the real run never promoted, use a clearly labeled deterministic fixture to separately prove continuation from a non-baseline promoted checkpoint.
8. Start Series A and B from one head. Demonstrate A's promotion and B's stale authorization. Use a labeled fixture for the winning transition if real results do not qualify. Re-challenge or reject B explicitly.
9. Verify A → B → A rollback still invalidates old challenge authorization. Verify competing tab commits and duplicate promotion retries cannot produce two transitions.
10. Fork. Change one supported semantic trait, inspect the delta, explicitly activate the authored revision/checkpoint, and verify the original Profile and historical genome are unchanged. Continue the fork from its authored active checkpoint. Separately verify optional legacy-template creation leaves no permanent archetype identity requirement and that updating the template does not mutate the created Profile.
11. Use a Profile Champion in the shipped non-Lab consumer. Persist its exact snapshot metadata. Change the Profile head after the operation starts and prove its running policy remains pinned.
12. Record an Experience encounter. Verify no training, revision, genome, or head change follows from ordinary play.
13. Activate a historical Champion through rollback and verify append-only history with a fresh headVersion.
14. Export. Import into an isolated empty store; verify artifact hashes, identity, head, revisions, exact objective instance/manifest references and definition versions, Series, promotions, Journal, and imported-unverified provenance. Repeat import for idempotency; separately reject a conflicting local head overwrite.
15. Demonstrate one migration-failure recovery and one promotion-transaction abort with no evidence loss or half-transition.
16. Show incompatible-era measurements without a false delta; where supported, append a common-era re-evaluation and compare only the compatible measurements.

This acceptance proof validates architecture. It does not prove strategic superiority.

Do not substitute fixture success for reported empirical performance. Do not label unexecuted browser/concurrency steps PASS. If a required consumer or acceptance step remains blocked, report the release incomplete.


FINAL RESEARCH PRINCIPLE

Do not build Evolution Lab merely to answer “Which parameter values win?”

Build the bounded foundation that can honestly answer:

- What did the user intend?
- Which exact mind is active?
- What was authored, what was selected, and what was measured?
- What changed, under which conditions, with what tradeoffs?
- Why was this head activated?
- How much evidence supports the claim?
- Is that evidence still applicable?
- How did the Profile get here?

Persistent identity. Immutable minds. Explicit decisions. Evidence that survives the next release.
