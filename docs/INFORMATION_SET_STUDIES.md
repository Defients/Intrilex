# Information-set Strategy Studies V1

October 4, 2026, America/New_York. The sampling boundary and reasons for its
limits are recorded in [INFORMATION_SET_AUDIT.md](INFORMATION_SET_AUDIT.md).

## Supported context

The first prepared P1 Start decision in a canonical two-player Core setup.
The source must match the authority's complete opening structure after removing
only card identities and RNG. Any extra marker, modified zone, history,
restriction or private runtime field makes sampling unavailable. Core profiles
are enumerated exactly. Optional modules and first-contact profiles are excluded.

Midgame is unsupported: a current-state policy projection does not certify
everything the actor previously learned. Neither copying a hidden source state
nor assuming forgotten cards solves that problem.

## Artifacts and reconstruction

`INFORMATION_SET_V1` seals the common canonical fields of the existing Node and
browser authorized projections, normalized legal action descriptors and IDs,
actor/seat, rules, implementation fingerprint, era, and an opening structural
certificate. Own five card identities and the visible Swap Bar card are known;
opponent hand count, hidden Swap Bar handles and draw count are public. Full
engine state, replay seed, source state hash, hidden card identities and RNG are
absent. No player actions precede this context, so the knowledge history is empty.

`UNIFORM_OPENING_UNSEEN_ASSIGNMENT_FRESH_RNG_V1` obtains the complete 54-card
universe from a fresh authoritative constructor, subtracts the six known
identities, and uses a counter-based hash stream with rejection sampling and
Fisher–Yates to assign the remaining 48 identities to canonical slots: opponent
hand, both hidden Swap Bar cards and ordered draw pile. A separate hash stream
provides fresh nonzero engine RNG. Each world is constructed through the engine's
validated predetermined setup and automatic Start preparation. No source state
is an argument to sampling.

This is a declared conditional generative model. It is **not** the posterior of
the original xorshift deal seed. It does not model opponents' beliefs. Frozen
continuation policies remain constrained by their existing authorized views.

Every world must match the structural certificate, conserve the exact identity
multiset, reproduce the full canonical authorized projection and legal surface,
and accept every legal vault command on isolated clones. Constructors assert
engine validity. Requested ordinals are attempted once; duplicate or rejected
worlds remain explicit rejections. No replacement hides failure. One rejection
invalidates study inference.

`INFORMATION_WORLD_MANIFEST_V1` stores ordinals, assignment/state hashes, synthetic
engine seed, requested/accepted/rejected counts and reasons. States are regenerated
deterministically; no collection of full hidden worlds is persisted.

## Frozen experiment

`INFORMATION_SET_STUDY_PLAN_V1` freezes the information set, source event,
question, recorded reference and deterministic legal competitors, sampler and
catalog, world manifest, policy checkpoints/digest, continuation seeds, budgets,
metric, meaningful-effect threshold, multiplicity, heterogeneity thresholds,
stopping/fault policy, rules, fingerprint, era and provenance.

Prepared plans and nested manifests are deeply frozen. Execution snapshots and
freezes transported inputs again, since structured messages and IndexedDB reads
do not preserve JavaScript freezes. Caller mutations cannot change active cells,
checkpoints, seeds or thresholds.

The worker sends the plan to the workspace and waits for a successful immutable
IndexedDB transaction before executing any continuation. Unsupported sampling
produces an explicit `INFORMATION_SET_SAMPLING_UNAVAILABLE` error. Failures leave
the prior evidence intact. Plan insertion failure prevents execution.

All accepted worlds × all planned actions × the same continuation seed catalog
execute through existing engine authority and frozen policy runtime. The
reference is the recorded action; no fictional hold command exists. After the
real command, tracked source cards are classified as played/committed, preserved
in hand, consumed another way or unavailable another way. An action with no
tracked source card cannot become a preserve recommendation.

Any engine rejection, continuation exception, censored terminal budget, rejected
world or cancellation prevents comparisons and claims. Fault rows retain their
reason and null score. Cancellation preserves the committed plan. Resuming via
the domain executor uses the same plan and reexecutes/verifies retained rows;
it deliberately trades speed for safe reproduction, without trusting supplied
outcomes or skipping scientific cells. The UI can rerun the same fixed inputs;
there is no incremental campaign scheduler or checkpoint head resolution.

## Estimand, uncertainty and heterogeneity

Terminal game score is win 1, draw 0.5, loss 0. For each world, average the paired
alternative-minus-reference score difference over common continuation seeds.
Infer over these world means, bounded in [-1,1]. Independent N is accepted
hidden worlds. Seeds are nested repetitions, and total branch games are reported
separately.

`WORLD_PAIRED_HOEFFDING_BONFERRONI_95_V1` uses half-width
`sqrt(2 * log(2*m/0.05) / N)`, clipped to [-1,1], where m is the number of planned
alternatives. N < 2 has no interval. This bounded approach does not assume
normally distributed world effects or estimate a zero-width interval from
identical observed outcomes. It is conservative and can be very wide at small N.
Its coverage depends on the declared approximately independent pseudorandom
sampling model, not on arbitrary fixed-world generalization. See
[Hoeffding's original paper](https://www.cs.rpi.edu/academics/courses/spring06/random/hoefding.pdf),
Theorem 2. Bonferroni allocates 0.05/m to each planned two-sided comparison.

Report positive, negative and tied world fractions, sign reversal, population
standard deviation and the mean of the lowest ceil(N/4) effects. Categories are
fixed before outcomes: VOLATILE when both signs occupy at least 20%; ROBUST when
N >= 2, at least 75% favor the alternative, at most 10% favor the reference and
the worst-quartile mean is nonnegative; otherwise UNRESOLVED. ROBUST describes
the observed world distribution, not a confidence level. Negative effects remain
reported; this first producer conservatively issues advice only for alternatives
with a positive lower bound above the precommitted meaningful threshold.

## Claims, UI and trust

Results are separate `INFORMATION_SET_STUDY_V1` artifacts with
`informationScope = ACTOR_AUTHORIZED`. Suggestive additionally requires clean,
complete execution, no rejected worlds, current exact fingerprint/era, local
reproduction, at least two hidden worlds, ROBUST heterogeneity and the familywise
lower bound exceeding the default 0.05 game-score effect threshold. This is
stricter than merely observing a positive mean. All other current clean results
remain Experimental / Unknown. Imported or incompatible results are Insufficient.
No Strong/Established producer was added.

The Counterfactual Lab adds opening study controls. Card/action pages render
controlled claims separately from observational habits, showing exact authorized
hand/Swap Bar context, effect, familywise interval, confidence, heterogeneity,
worlds, repetitions, faults and caveat. Show Nerd Data exposes the sealed study,
manifest and claims. Exact-state `STRATEGY_BRANCH_V1` remains research-only.

Strategy IndexedDB v2 adds informationSets, informationPlans and
informationStudies, preserving all v1 stores. Immutable transactions reject
conflicts. Portable bundles remain V1 when no new artifacts exist, and use V2
when necessary. Imports preserve original bytes in unverified archives; they
never populate trusted local study stores or the guide. A checksum is not proof
of execution. Local reproduction creates a separately verified result.

No Knowledge Farm, campaign orchestration, automatic prioritization, broad mining,
held-out packs, Guide redesign or unrelated Evolution/Profile change is included.
