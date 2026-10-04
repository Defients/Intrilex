# Information-set Strategy Studies V1.1

October 4, 2026, America/New_York. The sampling boundary and reasons for its
limits are recorded in [INFORMATION_SET_AUDIT.md](INFORMATION_SET_AUDIT.md).
V1.1 is a surgical hardening pass over V1: study-subject binding,
subject-aware action classification, symmetric reference/alternative
inference, controlled-evidence Quick Read priority and a calibrated
variance-sensitive inference method. All V1 safeguards are unchanged.
Plans sealed as V1 schema (no `schemaVersion` field) keep
`WORLD_PAIRED_HOEFFDING_BONFERRONI_95_V1` semantics forever; new studies
use `schemaVersion: 2` and `WORLD_PAIRED_EMPIRICAL_BERNSTEIN_BONFERRONI_95_V1`.

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

The supported study budget is 1–512 hidden worlds. The world budget
(`INFORMATION_WORLD_BUDGET_INVALID` above 512) and the sampler catalog ordinal
domain (0–511, `INFORMATION_SAMPLER_CATALOG_INVALID` beyond) are separate bounds;
V1.1 raised both from the original 256/255 so a requested 512-world plan is
accepted rather than silently becoming non-clean. Ordinals 0–255 produce
byte-identical worlds under either bound, so plans at ≤256 worlds are unchanged.

## Frozen experiment

`INFORMATION_SET_STUDY_PLAN_V1` freezes the information set, source event,
question, recorded reference and deterministic legal competitors, sampler and
catalog, world manifest, policy checkpoints/digest, continuation seeds, budgets,
metric, meaningful-effect threshold, multiplicity, heterogeneity thresholds,
stopping/fault policy, rules, fingerprint, era and provenance.

V1.1 additionally freezes three separately validated fields:

- `requestedSubject` — the canonical Strategy question subject the researcher
  or player actually selected (for example `rank:3`). The study setup receives
  it explicitly and rejects it unless it is present in the information set's
  legal opportunity set. A `rank:3` study launched from a recorded Draw
  decision cannot silently become a `family:draw` study. Validation recomputes
  the question from `requestedSubject` and requires
  `question.subject === requestedSubject`; mutating either after seal fails.
- `referenceActionId` — the recorded action, kept as the fixed reference for
  every precommitted contrast. Validation requires it to equal
  `actualActionId`.
- `schemaVersion: 2` — selects the V1.1 classifier and inference method.

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
reference is the recorded action; no fictional hold command exists.

V1.1 classifies every executed action against the **requested subject**, not
the recorded action's own source cards. For `card:`/`rank:`/`suit:` subjects
the classifier binds every matching copy in the visible hand to engine handles
and uses the real command's declared `sourceHandles` plus the authoritative
after-state:

- `USES_SUBJECT` — the command declared at least one tracked copy as a source.
- `PRESERVES_SUBJECT` — no copy was a declared source and every tracked copy
  remains in the actor's hand afterward.
- `CONSUMES_SUBJECT_OTHER_WAY` — a non-source copy ended in graveyard/exile.
- `SUBJECT_UNAVAILABLE_AFTER_ACTION` — a copy otherwise left the hand (swap,
  board, deck, opponent zones).
- `DOES_NOT_INVOLVE_SUBJECT` — for non-card subjects (`family:`, `mode:`,
  `mechanic:`, `combination:`, `timing:`) when the action's family/mode/timing
  does not match the subject; those subjects have no physical handles.

Multiple copies are explicit: one used copy classifies the action as
`USES_SUBJECT` even when another copy stays behind; `PRESERVES_SUBJECT`
requires every tracked copy to remain. Preserve/hold semantics are never
inferred from "the action did not mention the card" — they are read from the
before/after state. V1 rows keep their four original labels
(`PLAYED_OR_COMMITTED`, `PRESERVED_IN_HAND`, `CONSUMED_OTHER_WAY`,
`UNAVAILABLE_OTHER_WAY`) forever.

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

### V1.1 method decision: empirical Bernstein, symmetric interpretation

V1's `WORLD_PAIRED_HOEFFDING_BONFERRONI_95_V1` is valid for any bounded
distribution but pessimistic at every variance. At N = 256, m = 2 its
half-width is ~18.5 pp, so an observed effect must exceed ~23.5 pp before the
lower bound clears the 5 pp meaningful threshold. Moderate 5–15 pp effects are
uncertifiable at that cap.

Methods compared for V1.1 (all over independent world-level effects bounded in
[-1,1], two-sided, familywise Bonferroni delta = 0.05/m):

| Candidate | Validity | Behavior at V = 0 | Small-N behavior | Decision |
| --- | --- | --- | --- | --- |
| Hoeffding + Bonferroni (V1) | Any bounded distribution | Keeps a nonzero floor automatically | Very wide | Kept for V1 plans |
| Paired Student-t | Asymptotic; invalid for degenerate/heavy-tailed small-N effects | Interval collapses to zero width — fake certainty | Anti-conservative at small n | Rejected |
| **Empirical Bernstein (AMS) + Bonferroni** | **Any bounded distribution, finite n** | **Residual floor 3·ln(3m/0.05)/N; never collapses** | **Tightens with observed variance; no wider than Hoeffding at matched intent** | **Adopted for V2 plans** |

The adopted `WORLD_PAIRED_EMPIRICAL_BERNSTEIN_BONFERRONI_95_V1` uses the
Audibert–Munos–Szepesvári bound:

    half = sqrt(2 * V * ln(3m/0.05) / N) + 3 * ln(3m/0.05) / N

where V is the biased empirical variance of world effects the inequality
requires. The additive term is a documented floor: 128 identical +10 pp effects
still produce interval [-1.2, +21.2] pp — deterministic continuation artifacts
cannot masquerade as infinite certainty. The ln(3/δ) constant and the additive
penalty make the bound strictly conservative versus a naive plug-in Bernstein;
at maximal variance it is slightly *wider* than V1 Hoeffding, and it tightens
only when observed world dispersion is genuinely low. Independent N remains
hidden worlds; continuation seeds stay nested repetitions.

Symmetric interpretation: every comparison still computes the precommitted
`alternative − reference` contrast — the sign convention is never flipped after
seeing outcomes. The sealed study now records `assessment`, derived
deterministically from the comparisons:

- `ALTERNATIVE_DOMINATES` — at least one alternative qualifies and none
  reference-dominates → per-alternative advice allowed.
- `REFERENCE_DOMINATES_ALL` — **every** tested alternative has its upper bound
  below −(meaningful effect) with reference-favored heterogeneity → one
  reference claim is issued, bounded by the worst tested-alternative interval.
- `MIXED_DIRECTIONS` / `PARTIAL_REFERENCE_ADVANTAGE` — no recommendation; the
  reference is never called "best" unless it dominates every precommitted
  comparison.
- `UNRESOLVED` / `NOT_EVALUATED` — no advice.

A dominating reference earns `PLAY` only when its disposition uniformly uses a
card/rank/suit requested subject, `PRESERVE` when it uniformly preserves one,
otherwise `REFERENCE_PREFERRED`. Recommendation semantics name the tested set:
"the recorded play outperformed the tested alternatives", never global
optimality. All claims carry `requestedSubject`, `referenceActionId`,
`alternativeActionId`, `direction`, `referenceDispositions`, `dispositions`
and `testedAlternatives` inside `statementData` under the existing
`STRATEGY_CLAIM_V1` contract (opaque statement data; no claim reseal needed).

### V1.2 erratum: the support-range factor was missing (corrected in V3)

The V1.1 formula quoted above applied the AMS bound as if effects were bounded
in [0,1]. Our paired world effects are bounded in [-1,+1] — an interval of
width R = 2 — so the additive term was under-scaled by exactly R. Sealed V2
plans keep the historical V2 semantics forever (digest-bound recomputation);
new schemaVersion 3 plans use `WORLD_PAIRED_EMPIRICAL_BERNSTEIN_BONFERRONI_95_V2`:

    half = sqrt(2 * V * ln(3m/0.05) / N) + 3 * R * ln(3m/0.05) / N   (R = 2)

Only the additive floor doubles; the variance term does not take the range
factor (rescaling X in [a,a+R] to [0,1] divides V by R² and rescales the whole
bound by R, which cancels). Consequence: V2 intervals were anti-conservative —
every interval produced under V2 was narrower than the inequality allows. No
V2-produced claim is silently upgraded; the corrected bound only ever widens
intervals, so previously issued Suggestive results would be re-derived, not
trusted, on revalidation under V3 plans.

`informationResolution`, `approximateWorldsForEffect` and the planning table
use the corrected bound and report `method: INFORMATION_INFERENCE_V3` /
`APPROXIMATE_RESOLUTION` explicitly.

Corrected approximate minimum resolvable effect (pp above the 5 pp meaningful
floor), m = 2 alternatives, by world count and assumed world-effect variance:

| Hidden worlds | V = 0 | V = 0.0625 | V = 0.25 | V = 1 | V1 Hoeffding (any V) |
| --- | --- | --- | --- | --- | --- |
| 32  | 94.8 | 108.4 | 122.1 | 149.5 | 57.3 |
| 64  | 49.9 | 59.6 | 69.2 | 88.6 | 42.0 |
| 128 | 27.4 | 34.3 | 41.1 | 54.8 | 31.2 |
| 256 | 16.2 | 21.1 | 25.9 | 35.6 | 23.5 |
| 512 | 10.6 | 14.0 | 17.4 | 24.3 | 18.1 |

Reading: under the corrected bound the zero-dispersion floor at 512 worlds is
~10.6 pp resolvable, not ~7.8. The variance term still tightens with observed
dispersion, and V3 still never invents certainty: identical effects keep a
nonzero floor, and volatile world effects still resolve to UNRESOLVED.

### V1.2: subject-aware action selection

V1.1 plans chose alternatives by `branch.actionIds.slice(0,3)` — a generic
family-diversified prefix that could omit every action involving the requested
subject. V3 plans freeze an auditable `actionSelection` block: every legal
action is classified against the requested subject on a validated sampled
world (USES / PRESERVES / CONSUMES_OTHER_WAY / UNAVAILABLE_AFTER /
DOES_NOT_INVOLVE / REJECTED), the recorded action stays the labeled reference,
and alternatives are chosen to guarantee a real use-vs-preserve contrast plus
family-diverse comparators. A subject with no usable contrast fails closed
with `NO_SUBJECT_ACTION_CONTRAST_AVAILABLE` instead of running irrelevant
executions under a misleading label. The selection metadata is digest-bound
and re-derived on revalidation; forged dispositions or rationale are rejected.

### Pre-study resolution diagnostics

`informationResolution({worlds, alternatives, minimumMeaningfulEffect,
variance})` reports the labeled approximation `minimumResolvableEffect =
mme + half` under a declared dispersion assumption — not a power guarantee.
`approximateWorldsForEffect({effect, ...})` inverts the same expression by
binary search and returns `null` when the target is unreachable inside
`maxWorlds`. These are planning aids only; they cannot adapt a running study.

## Claims, UI and trust

Results are separate `INFORMATION_SET_STUDY_V1` artifacts with
`informationScope = ACTOR_AUTHORIZED`. Suggestive additionally requires clean,
complete execution, no rejected worlds, current exact fingerprint/era, local
reproduction, at least two hidden worlds, ROBUST heterogeneity and the familywise
lower bound exceeding the default 0.05 game-score effect threshold. This is
stricter than merely observing a positive mean. All other current clean results
remain Experimental / Unknown. Imported or incompatible results are Insufficient.
No Strong/Established producer was added.

The Counterfactual Lab adds opening study controls. The study question binds
to the currently selected page subject: only certified opening decisions whose
legal opportunity set contains that subject are offered, and the request is
frozen into the plan. A live preview shows `worlds × actions × continuations`
planned executions, the inference method, the 5 pp meaningful floor and the
approximate resolution under a declared dispersion assumption, warning when a
configuration is mainly useful for very large effects.

V1.1 makes the evidence hierarchy explicit in Quick Read. Priority order:

1. A valid current actionable Information-set claim (clean, complete,
   Suggestive, non-UNKNOWN) → RECOMMENDATION with confidence, effect,
   robustness, exact context and caveats.
2. Other admissible current controlled evidence (Experimental or unresolved)
   → "no supported recommendation yet" with the controlled statement.
3. Observational/descriptive evidence → usage habits only.
4. Unknown / no evidence.

Observational prose can never overwrite controlled evidence. Experimental,
imported/unverified, incompatible or historical claims, exact-state
`RESEARCH_ONLY` branch results, volatile controlled evidence and
non-clean/faulted studies can never drive the player-facing answer. Show Nerd
Data displays the exact claims used by the rendered recommendation.
Card/action pages render controlled claims separately from observational
habits ("What bots tended to do · observational only"), showing exact
authorized hand/Swap Bar context, effect, familywise interval, confidence,
heterogeneity, worlds, repetitions, faults and caveat. Show Nerd Data exposes
the sealed study, manifest and claims. Exact-state `STRATEGY_BRANCH_V1`
remains research-only.

Strategy IndexedDB v2 adds informationSets, informationPlans and
informationStudies, preserving all v1 stores. Immutable transactions reject
conflicts. Portable bundles remain V1 when no new artifacts exist, and use V2
when necessary. Imports preserve original bytes in unverified archives; they
never populate trusted local study stores or the guide. A checksum is not proof
of execution. Local reproduction creates a separately verified result.

No Knowledge Farm, campaign orchestration, automatic prioritization, broad mining,
held-out packs, Guide redesign or unrelated Evolution/Profile change is included.
