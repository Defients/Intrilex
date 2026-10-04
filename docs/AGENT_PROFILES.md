# Agent Profiles — architecture, contracts and frozen defaults

Specification: *Ultimate Evolution Lab / Persistent Agent Profile Architecture v1.31 FINAL*.
Gate 0 record written 2026-10-04 before any Profile challenge was executed.

Completed continuation checks and evidence boundaries are recorded in
[AGENT_PROFILES_VALIDATION.md](AGENT_PROFILES_VALIDATION.md).

## Gate 0 reconciliation

- **Checkout.** `Intrilex_dev-current`, branch `main`, HEAD `f7c5450`, clean tree. Sibling checkouts
  (`Intrilex_new-match-20261001` has ~800 unrelated dirty files; `release-candidate`; `browser-tabletop`)
  were not touched.
- **Baseline.** `pnpm run test:evolution`: 166/166 pass. Node throughput on this host: 1.6 games/s with
  1 worker, 3.8 games/s with 4 workers (weighted-heuristic vs control, 16 games).
- **V1 owners (preserved, unmodified).** `evolution-domain.mjs` (config, paired seeds, CP/CP2
  checkpoints, records, artifact validation), `evolution-session.mjs` (claims/epochs),
  `evolution-research.mjs` (packs, suites, experiments, evaluation validation), `evolution-evaluation.mjs`,
  `evolution-training.mjs` (`ONE_PLUS_LAMBDA_V1`: `mutatePolicyState`, `selectCandidate`),
  `weighted-heuristic.mjs` (six bounded residuals over `control`), Node `runLabSeries` / browser
  `executeBrowserSeries`, IndexedDB `intrilex-evolution-lab` v2.
- **Fingerprint boundary.** `scripts/evolution-identity.mjs` hashes engine, policy and runtime files.
  Editing any of them makes every existing local artifact historical. Profile code therefore lives in
  new modules outside that list; no fingerprint-covered file is modified. Profile-layer semantics are
  pinned by explicit contract versions plus a source-lock test (`test/agent-profile-contracts.test.mjs`)
  that fails when a versioned implementation changes without a version bump.
- **Policy consumer inventory.** Lab arena/research (Node and browser workers), tournament workspace
  (`run-autonomy-match`, static policies only), Caster (replays only), normal local AI play
  (`play-controller.js` → `autonomy-runtime.choosePolicy`). **Selected consumer: normal local AI play.**
- **Verified pre-existing consumer defect.** `PlaySession.stepAI` hands policies presentation actions with
  `sourceCardIds/targetCardIds` instead of `sourceHandles/targetHandles`, so scoring policies in normal
  play cannot value known target cards the way the Lab does. Changing it for existing policies would make
  existing saves fail restore (`RESTORE_AI_DIVERGENCE`). Profile agents instead receive the Lab-parity
  authorized action view (`actionView` + vaulted command); existing policies are unchanged and the defect
  is recorded as a residual limitation.
- **Analytics risks.** Paired-seat aliasing, chart identity, opportunity denominators and winner/score
  ambiguity are covered by existing passing tests. Profile measurements pair games by seed and seat flag
  (never by adjacency alone), code outcomes from the winner (never from score), and keep raw denominators.

## Architecture map

| Concern | Owner |
| --- | --- |
| Strict canonical form, digests, version registry, genome definition, traits/compiler, objective, promotion policy, era, compatibility | `packages/simulation-runtime/src/profile-contracts.mjs` |
| Transactional authority: artifacts (insert-or-verify), checkpoints, heads, events, receipts, operations (fenced), traces; transitions; snapshots; experience; export/import; retention | `packages/simulation-runtime/src/profile-store.mjs` (memory + IndexedDB backends share one generator transaction body) |
| Series manifests, proposal/selection (delegating to V1 operators), nomination, purpose-bound measurements, held-out, challenge, paired estimator, decision rule, journals, dossier | `packages/simulation-runtime/src/profile-science.mjs` |
| Execution | existing `runLabSeries` (Node) / `executeBrowserSeries` (browser) — unchanged |
| Lab UI | `apps/lab-web/src/evolution/profile-workspace.js` (new cockpit surface "Profiles") |
| Consumer | `apps/lab-web/src/play/play-controller.js` (pinned `setup.agentSnapshot`) |

Profile checkpoints are V1 schema-2 (`CP2-`) checkpoints, so the unchanged V1 runners execute them. Their
derivation is carried in the hash-bound `mutation` field. Profile authority lives in a **separate**
IndexedDB database `intrilex-agent-profiles` (v1); the V1 database is never upgraded or written by
Profile code. V1 linkage copies the selected V1 checkpoint verbatim (original ID/hash) into the Profile
database inside one transaction.

## Frozen defaults (decided before any challenge was observed)

**Capability Objective `GENERALIST_PAIRED_SCORE` v1.** Reference suite: Core Baseline Suite v1
(`random-legal`, `score-rush`, `control`, `tempo`, `value`) on the instance's rules profile. Outcome:
paired score per seed (win 1, draw ½, loss 0; mean of AB and BA). Aggregation: equal weights (0.2).
Direction: maximize. Constraints: zero non-clean planned games; no opponent may regress by more than
0.10 paired score against the incumbent. Distinct rules profiles resolve distinct immutable instances.

**Promotion policy `FIXED_BUDGET_PAIRED_GENERALIST` v1.**

- **Budget.** Fixed at 48 composite blocks. Each block contains one fresh seed per reference opponent,
  and each seed is played AB and BA by both incumbent and Challenger. That is 960 games, about 4–5 minutes
  at 4 workers on this host.
- **Sampling unit.** A composite block. Its statistic is `d_b = Σ w_o (pairScore_C(o,b) − pairScore_I(o,b))`.
  Seeds are disjoint per opponent, so blocks are independent and identically distributed.
- **Estimator.** `PAIRED_BLOCK_STUDENT_T_V1`: one-sided 95% Student-t bounds on the mean of `d_b`, with
  df = 47. If the standard deviation is zero, the bound equals the mean.
- **Thresholds.** The practical improvement threshold is 0.02. The regression floor is 0.10; the policy
  cannot set it above the objective's floor.
- **Tail guard (`TAIL_BALANCE_V1`).** Count the opponent-seed units where the Challenger's paired score is
  at least 0.75 below the incumbent's. They must not outnumber the units where it is at least 0.75 above.
- **Disjointness.** Challenge seeds must be disjoint from every known training, held-out and challenge
  exposure in the Profile's ancestry.
- **Retries and stopping.** There are no infra retries inside an attempt; resume re-executes deterministic
  runs, which must reproduce identical records. There is no optional stopping and no subset selection.

*Why these defaults (validated before any real challenge was run).* The first draft shared 24 seeds
across opponents, giving 480 games. A Monte-Carlo check of that draft (`test/agent-profile-science.test.mjs`)
showed the one-sided t bound had poor coverage under mean-zero left-skewed nulls:

| Null distribution | False approval (first draft) |
| --- | --- |
| Symmetric | 4.8% |
| Moderate left skew | 10.4% |
| Rare catastrophic loss | 29% |

Rare catastrophic losses are the failure mode an exploitable Challenger produces. Distribution-free
bounds (Hoeffding, empirical Bernstein, betting) had essentially no power at this range and sample size.
The frozen design therefore makes each block independent across opponents, doubles the blocks, and adds
the non-inferential tail guard. Its measured behavior:

| Condition | Result |
| --- | --- |
| Symmetric null | ≈5% false approval |
| Left-skew null | ≤0.1% false approval |
| Heavy-left null | ≤0.1% false approval |
| Rare catastrophe (2%) null | ≈0.8% false approval |
| True +0.08 improvement | ≈97% power |

**Residual:** with a finite sample, a loss mode much rarer than one in 240 opponent-seed units cannot be
excluded by any procedure.

Decision precedence is INVALID > REJECT > INCONCLUSIVE > APPROVE:
- **INVALID:** missing or mismatched evidence, an infrastructure fault, or an unreliable incumbent.
- **REJECT:** a non-clean Challenger game, a violated identity constraint, a breached regression floor,
  a failed tail guard, or an upper bound below 0.02.
- **INCONCLUSIVE:** an unavailable identity metric, or insufficient evidence.
- **APPROVE:** lower bound above 0, mean at least 0.02, and every constraint passes.

Automatic eligibility allows one attempt per (Challenger, incumbent, objective instance, era). Rollback
or policy edits cannot reset that count. The guard rails are point estimates; only the improvement
criterion is inferential. No family-wise or lifetime error control is claimed.

**Series defaults.** 2 generations, 2 mutations per generation, step 250, 4 training seed pairs, and the
`ONE_PLUS_LAMBDA_V1` operators. Fixed or bounded coordinates are enforced by deterministic rejection
sampling of the V1 seed and then clamping (`FIXED_REJECTION_THEN_CLAMP_V1`). With no constraints, this is
identical to V1. Nomination takes the final committed selection at the frozen budget; a retained parent
nominates nothing. **Held-out:** 8 fresh disjoint pairs per measurement.

**Semantic controls (`TRAIT_COMPILER_LINEAR_V1`).** Each trait maps to exactly one residual, with weight
= 20 × trait. Every control changes the top-ranked legal action in at least one real authority fixture
(`packages/policies/test/action-fixtures.mjs`):

| Trait | Parameter | Range | Demonstrated in fixtures (+ / −) |
| --- | --- | --- | --- |
| Scoring drive | points | −100…100 | 12 / 16 |
| Resource appetite | resource | −100…100 | 8 / 5 |
| Initiative | tempo | −100…100 | 3 / 3 |
| Guard | defense | 0…100 | 4 / 0 (negative values were placebo, so they are excluded) |
| Combination play | synergy | −100…100 | 3 / 1 |
| Risk appetite | risk | −100…100 | 7 / 8 |

## Risk register

| Failure mode | Invariant | Boundary | Mitigation | Proving test |
| --- | --- | --- | --- | --- |
| Same ID rewritten with different content | I1 | store `putImmutable` | insert-or-verify on full canonical body, nested included | contracts/store: nested mutation rejected |
| Held-out or challenge data steers selection | I2/I3 | `selectGeneration` signature + manifest-bound purpose | selection accepts only TRAINING measurements bound to the series plan | science: adversarial held-out leaves selection identical; forged label rejected |
| Generation winner treated as Champion | I4 | `promote` command | requires finalized APPROVE decision + eligibility | store: no promotion without decision |
| Stale Challenger overwrites newer head | I5 | full head-token compare in tx | headVersion monotonic, compared with checkpoint/revision/era/policy | A→B→A, two-series, two-connection tests |
| Partial or double promotion | I6 | single multi-store transaction + receipt | receipt lookup first; fault injection at every write | store: abort at each write index |
| Authored edit labeled learned | I7 | checkpoint `mutation.kind` | separate derivation/selection/activation dimensions | store: authored provenance test |
| Play trains or moves head | I8 | experience writes only `EXPERIENCE_RECORD` | no head/checkpoint access in that path | consumer test |
| Running op follows moving head | I9 | snapshot resolved once, pinned in setup/manifest | digest-verified snapshot; no fallback | consumer pinned test |
| Cross-era deltas | I10 | `canCompareMeasurements` | era + pack equality required for paired deltas | dossier test |
| Old tab writes after upgrade | storage | `versionchange` → store superseded | writes fail `PROFILE_STORAGE_SUPERSEDED` | browser script |
| Fingerprint drift strands Profiles | compat | `canExecuteCheckpoint` | readable, labeled unsupported; never substituted | contracts test |
