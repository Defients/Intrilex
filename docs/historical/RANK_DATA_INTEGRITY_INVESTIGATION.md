# Intrilex Rank Data Integrity Investigation

**Scope:** `/ranks` observatory screenshot and the uploaded `intrilex-agent-analysis` source bundle
**Verdict:** **The displayed ranking is not trustworthy as a balance verdict.** The screenshot combines a real UI schema defect, missing causal telemetry, inflated/degenerate power axes, mislabeled observational data, and unexplained aggregation semantics. The underlying 2,500-match artifact must be regenerated after applying the code fixes; changing the renderer alone cannot repair already-generated data.

## 1. What is visibly wrong

For selected rank **J**, the screenshot reports:

- Rank Power ladder score: **66.6**
- Selection axis: **100.0**, based on **206 / 359 = 57.4%**
- Victory axis: **29.4**, based on **51 wins / 50 defeats = 50.5%**
- Score axis: **50.0**, while raw contribution is shown as **0.0 points per selection**
- Board axis: **100.0**, while raw contribution is shown as **0.00 board presence per selection**
- Response axis: **92.8**, based on **71.8%**
- Decision Value: **NaN**
- RPI and Decision Power: both approximately **0.6664**
- Message: **“No counterfactual data”**, while a populated 15×15 “counterfactual” matrix is displayed below

The ranking can be reconstructed almost exactly from the visible axes:

```text
(0.20×1.000 + 0.25×0.294 + 0.20×0.500 + 0.10×1.000 + 0.10×0.928) / 0.85
= 0.66624
```

The missing sixth axis was excluded and the remaining weights were renormalized. Therefore, J reached first place largely because:

1. it had the cohort's highest selection rate;
2. its all-zero score axis was silently treated as a neutral 0.5;
3. its all-zero board axis became the cohort maximum, 1.0;
4. its response metric was inflated by double-counting counters;
5. its mediocre 50.5% observed win rate only contributed a 0.294 normalized axis.

That is a **normalization and observability artifact**, not strong evidence that J is the best rank.

## 2. Confirmed root causes

### A. Server/browser schema drift produced `NaN`

The server emits:

- `axes.observedRankValue`
- `raw.observedRankValue`
- `profile.orv`

The `/ranks` renderer was still reading:

- `axes.decisionValue`
- `raw.decisionValue`
- `profile.cdv`

Result: the UI displayed `NaN` and falsely claimed the data was absent even when the observational matrix existed.

**Fixed in:** `apps/lab-web/src/workspaces/ranks.js`

### B. Observed Rank Value sample accounting used the wrong field

Observational pair rows use `observationalSampleCount`, while `aggregateRankDecisionValues()` expected `rolloutCount`. This caused invalid totals and missing sample size/confidence in aggregate ORV profiles.

A second issue multiplied the same selected-rank observations by every alternative comparison. Fourteen comparisons did not represent fourteen independent samples.

**Fix:**

- accept observational sample fields;
- use the selected-rank sample size as the effective observational sample;
- retain additive accounting only for actual paired rollout anchors.

**Fixed in:** `packages/simulation-runtime/src/rank-counterfactual.mjs`

### C. Deferred resolutions were not attributed to the declaration that caused them

Score and board changes often happen when a declared stack item resolves in the next decision frame. The runtime tried to recover the originating rank decision by `checkpointId`, but rank decision entries did not contain that field.

Result: many rank selections had no causal point/board delta. Their counters remained zero, making “no telemetry” indistinguishable from a measured zero contribution.

**Fix:**

- write `checkpointId` into every rank decision;
- capture automatic next-frame resolution deltas;
- attach those deltas to the originating declaration;
- merge immediate and deferred deltas instead of overwriting either one.

**Fixed in:** `packages/simulation-runtime/src/runtime.mjs`

### D. Missing causal telemetry was treated as a valid zero

Score and board counters initialized to zero, but no counter recorded whether a causal state delta had actually been observed. A rank with no causal telemetry could therefore appear equivalent to a rank with many observed zero-delta actions.

**Fix:** add `rankStateDeltaObservationCount` and calculate causal coverage.

- coverage ≥95%: axis may be observed;
- partial coverage: `insufficient`;
- no coverage: `not-observable`;
- a legitimate, measured all-zero cohort is marked `degenerate`, not silently presented as meaningful separation.

Degenerate axes remain neutral for numerical stability but cannot support a HIGH-confidence balance flag.

**Fixed in:**

- `packages/telemetry/src/rank-telemetry.mjs`
- `packages/simulation-runtime/src/rank-power.mjs`
- `packages/analytics/src/rank-integration.mjs`

### E. Response Power double-counted counter plays

The old formula used:

```text
counterDeclarationCount + responsePlayedCount
```

But `responsePlayedCount` already includes counters. Counter actions were counted twice.

The browser implementation was worse: it incremented counter declarations for broad base/suit plays and then again for real counters.

**Fix:** Response Power now uses `responsePlayedCount` only. Browser and server response classification are aligned to counter/disrupt/interrupt/instant/quick actions and response timing classes.

**Fixed in:**

- `packages/simulation-runtime/src/rank-power.mjs`
- `packages/telemetry/src/rank-telemetry.mjs`
- `apps/lab-web/src/browser-analytics.js`

### F. Decision Power mixed incomparable scales

The prior Decision Power formula mixed normalized RPI with raw ORV plus a hard-coded `0.5` offset. Raw ORV can be negative or positive and is not guaranteed to occupy `[0,1]`.

**Fix:** ORV is normalized across the current cohort before blending. Decision Power stays unavailable when RPI is unavailable.

**Fixed in:** `packages/simulation-runtime/src/rank-power.mjs`

### G. The matrix was mislabeled as counterfactual

The displayed matrix is computed from aggregate observed outcomes. It does **not** restore a decision checkpoint and replay an alternative rank under paired seeds. It is confounded by policy behavior, seat, opportunity, selection bias, and rank co-occurrence.

It is now named **Observed Rank Value (ORV)** and explicitly labeled as a descriptive cohort association, not causal superiority.

**Fixed in:**

- `packages/analytics/src/rank-integration.mjs`
- `apps/lab-web/src/workspaces/ranks.js`
- `apps/lab-web/src/browser-analytics.js`

### H. Filters and totals implied capabilities the artifact did not have

The Origin filter appeared operational, but no per-origin metric table exists. The Profile filter existed visually but did not actually select `variantAnalytics.perProfile`.

The screenshot also showed **206 aggregate rank selections** versus **172 Anatomy selections** for J. The two counters use different grains:

- Rank Power: rank **participations**, including secondary ranks in fractional multi-rank plays;
- Rank Anatomy: the **primary classified variant entity**.

That difference can be legitimate, but the UI did not explain it.

**Fix:**

- Profile filtering now uses the per-profile artifact;
- Origin is disabled and honestly marked unavailable;
- Rank Power says “Rank Participations”;
- Anatomy explains why primary-variant totals can differ from aggregate participation totals.

**Fixed in:**

- `apps/lab-web/src/workspaces/ranks/rank-anatomy-workspace.js`
- `apps/lab-web/src/workspaces/ranks.js`
- `apps/lab-web/src/state.js`

### I. Fractional multi-rank telemetry was internally inconsistent

Selections credited secondary ranks in fractional plays, but opportunity and match-outcome attribution used only the primary rank. This could inflate selection rates and disconnect selections from victories/defeats.

**Fix:** aggregate rank telemetry consistently uses rank participation semantics for:

- opportunities;
- selections;
- match outcomes;
- causal state deltas.

Variant Anatomy remains primary-entity classification.

**Fixed in:**

- `packages/simulation-runtime/src/runtime.mjs`
- `packages/analytics/src/rank-integration.mjs`
- `packages/telemetry/src/rank-telemetry.mjs`

## 3. Behavioral changes after regeneration

The corrected observatory will:

- never display `NaN` for ORV;
- distinguish missing, partial, degenerate, and observed axes;
- show causal delta coverage;
- suppress balance flags when mandatory causal axes are not genuinely observed;
- avoid double-counting response plays;
- keep Decision Power within a coherent normalized scale;
- label the matrix as observational ORV;
- expose real profile filtering;
- disable unsupported origin segmentation;
- use coherent rank-participation denominators.

The final rank order is expected to change. No specific corrected order can be honestly predicted without regenerating the campaign.

## 4. Required regeneration sequence

Run this in the **complete repository**, not the uploaded analysis bundle:

```bash
pnpm install
pnpm run build
pnpm test

node scripts/generate-autonomy-campaign.mjs \
  --matches 2500 \
  --worker-counts 1,2,4 \
  --segment-size 25 \
  --resume-segments

node scripts/generate-observatory-analytics.mjs
pnpm run build
```

For a clean certification run, remove or archive old campaign segments and generated observatory artifacts first. Reusing segments generated by the defective telemetry code would preserve poisoned rank summaries.

At minimum, regenerate:

- `sample-data/autonomy/match-summaries.ndjson`
- `sample-data/autonomy/aggregate.json`
- `sample-data/observatory/analytics.json`
- `sample-data/observatory/rank-analytics.json`
- `sample-data/observatory/variant-analytics.json`
- browser build artifacts under `apps/lab-web/dist`

## 5. Validation performed in this bundle

### Passed

- Syntax check for all 13 modified source/test files.
- `test/rank-power.test.mjs`
- `test/rank-telemetry.test.mjs`
- **48/48 executable targeted tests passed.**

Added regression coverage for:

- response counters not being double-counted;
- missing causal deltas producing unavailable axes;
- degenerate axes not authorizing balance flags;
- observational sample-size accounting;
- causal observation counts;
- fractional multi-rank selection/outcome/delta coherence;
- participant extraction from `policyIdsBySeat` objects.

### Blocked by the uploaded bundle

The bundle omits required runtime/build assets, including:

- `runtime/vendor-dist/src/phase16.js` and related vendor runtime files;
- autonomy engine distribution files;
- `sample-data` campaign artifacts;
- `apps/lab-web/dist/browser-analytics.js`;
- the complete dependency/build environment.

Because of those omissions, the full integration, browser parity, campaign, and end-to-end suites cannot execute here. The failure occurs during module resolution before those tests run; it is not a test assertion failure in the patch.

## 6. Remaining methodological boundary

Even after these fixes, ORV remains observational. It can help identify suspicious associations and decide where to investigate, but it should not be treated as the definitive intrinsic strength of a rank.

A true rank decision-value system requires paired counterfactual rollouts:

1. save the exact decision checkpoint;
2. replay the selected action and each legal rank-distinct alternative;
3. hold policies, hidden information, and random streams constant;
4. aggregate paired outcome deltas;
5. report anchor coverage and uncertainty separately from observational rank usage.

Until that pipeline exists and has meaningful anchor coverage, the ladder should be titled **Observed Rank Performance Index**, not “best-to-worst rank strength.”

## 7. Secondary release-truth issues noticed

These are not the cause of the screenshot defect, but they should be cleaned before release certification:

- root package version is `0.20.0`, while its description still says `v0.19.0`;
- repository documentation and some tests reference different release versions;
- rules/version references appear inconsistent across the bundle.

Treat these as release-hygiene drift, separate from rank analytics integrity.
