import { createHash } from 'node:crypto';

/**
 * Wilson score interval for a binomial proportion.
 * More accurate than the normal approximation, especially for small samples
 * or proportions near 0 or 1.
 * @param {number} successes - Number of successes
 * @param {number} total - Total trials
 * @param {number} [z=1.96] - Z-score for confidence level (default: 95%)
 * @returns {[number, number]} [lower, upper] bounds in [0, 1]
 * @throws {TypeError} If counts are invalid
 */
export function wilsonInterval(successes, total, z = 1.959963984540054) {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total < 0 || successes > total) throw new TypeError('Invalid binomial counts');
  if (total === 0) return [0, 0];
  const p = successes / total, z2 = z * z, denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/**
 * Compute the q-th quantile of a numeric array using linear interpolation.
 * Non-finite values are filtered before computation.
 * @param {number[]} values - Input values
 * @param {number} q - Quantile in [0, 1]
 * @returns {number | null} The quantile value, or null if no finite values
 */
export function quantile(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const pos = (clean.length - 1) * q;
  const low = Math.floor(pos), high = Math.ceil(pos);
  if (low === high) return clean[low];
  return clean[low] * (high - pos) + clean[high] * (pos - low);
}

/**
 * Compute summary statistics for a numeric array.
 * @param {number[]} values - Input values
 * @returns {{ count: number, mean: number | null, median: number | null, min: number | null, max: number | null, p05: number | null, p25: number | null, p75: number | null, p95: number | null, standardDeviation: number | null }}
 */
export function summarizeNumbers(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length === 0) return { count: 0, mean: null, median: null, min: null, max: null, p05: null, p25: null, p75: null, p95: null, standardDeviation: null };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance = clean.length > 1 ? clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1) : 0;
  return {
    count: clean.length, mean, median: quantile(clean, 0.5), min: clean[0], max: /** @type {number} */ (clean.at(-1)),
    p05: quantile(clean, 0.05), p25: quantile(clean, 0.25), p75: quantile(clean, 0.75), p95: quantile(clean, 0.95),
    standardDeviation: Math.sqrt(variance)
  };
}

function seedFrom(/** @type {string | number} */ value) {
  const h = createHash('sha256').update(String(value)).digest();
  return h.readUInt32BE(0) || 1;
}
function rng(/** @type {number} */ seed) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
}

/**
 * Deterministic cluster bootstrap for clustered data.
 * Resamples clusters (not individual rows) with replacement, then applies the estimator.
 * Uses a seeded xorshift PRNG for reproducibility.
 * @template T
 * @param {T[]} rows - Input rows
 * @param {(sample: T[]) => number} estimator - Function computing a statistic from a resampled array
 * @param {{ iterations?: number, seed?: string | number, alpha?: number, clusterKey?: (row: T) => string }} [options]
 * @returns {{ estimate: number | null, interval: [number | null, number | null], iterations: number, seed: string }}
 */
export function deterministicClusterBootstrap(rows, estimator, { iterations = 1000, seed = 'intrilex-bootstrap', alpha = 0.05, clusterKey = (row) => /** @type {{ matchId?: string }} */ (/** @type {unknown} */ (row)).matchId ?? '' } = {}) {
  if (!rows.length) return { estimate: null, interval: [null, null], iterations: 0, seed: String(seed) };
  const clusters = new Map();
  for (const row of rows) {
    const key = clusterKey(row);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(row);
  }
  const keys = [...clusters.keys()].sort();
  const random = rng(seedFrom(seed));
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const sample = [];
    for (let j = 0; j < keys.length; j += 1) {
      const key = keys[Math.floor(random() * keys.length)];
      sample.push(...clusters.get(key));
    }
    const value = estimator(sample);
    if (Number.isFinite(value)) samples.push(value);
  }
  return { estimate: estimator(rows), interval: [quantile(samples, alpha / 2), quantile(samples, 1 - alpha / 2)], iterations: samples.length, seed: String(seed) };
}

/**
 * Benjamini-Hochberg FDR correction.
 * Adjusts p-values to control the false discovery rate at level alpha.
 * @template {Record<string, unknown>} T
 * @param {T[]} items - Items with p-values
 * @param {{ pKey?: string, idKey?: string }} [options] - Keys for p-value and identifier
 * @returns {(T & { qValue: number | null })[]} Items with added `qValue` field
 */
export function benjaminiHochberg(items, { pKey = 'pValue', idKey = 'id' } = {}) {
  const valid = items.filter((item) => Number.isFinite(/** @type {Record<string, unknown>} */ (item)[pKey])).map((item) => ({ ...item })).sort((a, b) => /** @type {number} */ (a[pKey]) - /** @type {number} */ (b[pKey]) || String(a[idKey]).localeCompare(String(b[idKey])));
  const m = valid.length;
  let running = 1;
  for (let i = m - 1; i >= 0; i -= 1) {
    const raw = (/** @type {number} */ (valid[i][pKey]) * m) / (i + 1);
    running = Math.min(running, raw);
    /** @type {Record<string, unknown>} */ (valid[i]).qValue = Math.min(1, running);
  }
  const byId = new Map(valid.map((item) => [item[idKey], /** @type {number} */ (item.qValue)]));
  return items.map((item) => ({ ...item, qValue: byId.get(item[idKey]) ?? null }));
}

/**
 * Cumulative distribution function of the standard normal distribution.
 * Uses the Abramowitz & Stegun approximation for erf.
 * @param {number} x - Value to evaluate
 * @returns {number} CDF value in [0, 1]
 */
export function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z));
  return 0.5 * (1 + erf);
}

/**
 * Two-proportion z-test for the difference in proportions.
 * @param {number} aSuccess - Successes in group A
 * @param {number} aTotal - Total in group A
 * @param {number} bSuccess - Successes in group B
 * @param {number} bTotal - Total in group B
 * @returns {{ estimate: number | null, standardError: number | null, pValue: number | null, interval: [number | null, number | null] }}
 */
export function differenceInProportions(aSuccess, aTotal, bSuccess, bTotal) {
  if (!aTotal || !bTotal) return { estimate: null, standardError: null, pValue: null, interval: [null, null] };
  const pa = aSuccess / aTotal, pb = bSuccess / bTotal, estimate = pa - pb;
  const se = Math.sqrt((pa * (1 - pa)) / aTotal + (pb * (1 - pb)) / bTotal);
  const z = se ? estimate / se : 0;
  return { estimate, standardError: se, pValue: 2 * (1 - normalCdf(Math.abs(z))), interval: [estimate - 1.959963984540054 * se, estimate + 1.959963984540054 * se] };
}

/**
 * Empirical Bayes shrinkage estimator.
 * Shrinks an estimate toward a prior mean, weighted by sample size.
 * @param {number} estimate - Observed estimate
 * @param {number} sampleSize - Number of observations
 * @param {{ priorMean?: number, priorStrength?: number }} [options]
 * @returns {number | null} Shrunk estimate, or null if invalid
 */
export function empiricalBayesShrinkage(estimate, sampleSize, { priorMean = 0, priorStrength = 25 } = {}) {
  if (!Number.isFinite(estimate) || sampleSize <= 0) return null;
  return (estimate * sampleSize + priorMean * priorStrength) / (sampleSize + priorStrength);
}

/**
 * Classify evidence strength using a multi-criteria rubric.
 *
 * Replaces the old p-value-dominated grading with a transparent classification
 * that accounts for sample size, effect size, confidence interval width,
 * cohort balance, multiplicity correction, and minimum cell sizes.
 *
 * Grades: INSUFFICIENT < EXPLORATORY < SUPPORTED < ROBUST
 *
 * @param {{ sampleSize?: number, interval?: [number, number], qValue?: number, minimum?: number, effectSize?: number | null, cohortBalance?: number | null, effectiveN?: number | null, pairedCoverage?: number | null }} [params]
 * @returns {'INSUFFICIENT' | 'EXPLORATORY' | 'SUPPORTED' | 'ROBUST'}
 */
export function evidenceGrade({ sampleSize = 0, interval = [0, 0], qValue, minimum = 20, effectSize = null, cohortBalance = null, effectiveN = null, pairedCoverage = null } = {}) {
  const n = effectiveN != null && Number.isFinite(effectiveN) ? effectiveN : sampleSize;
  if (!Number.isFinite(n) || n < minimum) return 'INSUFFICIENT';
  if (!Array.isArray(interval) || !interval.every(Number.isFinite)) return 'INSUFFICIENT';
  const excludesZero = interval[0] > 0 || interval[1] < 0;
  const width = Math.abs(interval[1] - interval[0]);
  const q = qValue == null ? 1 : qValue;
  // Effect size threshold: at least 2pp for binary outcomes
  const hasEffect = effectSize != null && Number.isFinite(effectSize) ? Math.abs(effectSize) >= 0.02 : excludesZero;
  // Cohort balance: ratio of smallest to largest cohort (1 = perfectly balanced)
  const balanced = cohortBalance != null && Number.isFinite(cohortBalance) ? cohortBalance >= 0.2 : true;
  // Paired-run coverage: fraction of data from complete AB/BA pairs
  const paired = pairedCoverage != null && Number.isFinite(pairedCoverage) ? pairedCoverage >= 0.5 : true;
  if (!excludesZero || !hasEffect) return 'INSUFFICIENT';
  if (n >= 500 && q <= 0.05 && width <= 0.15 && balanced && paired) return 'ROBUST';
  if (n >= 100 && q <= 0.10 && width <= 0.25 && balanced) return 'SUPPORTED';
  if (n >= minimum && q <= 0.20) return 'EXPLORATORY';
  return 'INSUFFICIENT';
}

/**
 * Backward-compatible alias for evidenceGrade returning lowercase values.
 * Maps INSUFFICIENT→insufficient, EXPLORATORY→weak, SUPPORTED→moderate, ROBUST→strong.
 * @deprecated Use evidenceGrade directly.
 */
export function evidenceGradeLegacy({ sampleSize = 0, interval = [0, 0], qValue, minimum = 20 } = /** @type {{ sampleSize?: number, interval?: [number, number], qValue?: number, minimum?: number }} */ ({})) {
  const grade = evidenceGrade({ sampleSize, interval, qValue, minimum });
  return { INSUFFICIENT: 'insufficient', EXPLORATORY: 'weak', SUPPORTED: 'moderate', ROBUST: 'strong' }[grade] ?? 'insufficient';
}

/**
 * Detect perfect separation in a 2×2×2 binary outcome table.
 * Returns true if any cell has zero observations in one outcome category.
 */
export function detectSeparation(/** @type {Array<{ wins: number, losses: number }>} */ cohorts) {
  for (const cohort of cohorts) {
    if (cohort.wins === 0 || cohort.losses === 0) return true;
  }
  return false;
}

/**
 * Logistic interaction estimator for binary outcome Y ~ A + B + A×B.
 *
 * Computes the interaction effect on the odds-ratio scale from four
 * mutually exclusive cohorts (Neither, A-only, B-only, Both).
 *
 * The interaction on the log-odds scale is:
 *   β₃ = log(OR_A|B=1) - log(OR_A|B=0)
 *      = log(p11/(1-p11)) - log(p10/(1-p10)) - log(p01/(1-p01)) + log(p00/(1-p00))
 *
 * where p_ij = P(Y=1 | A=i, B=j).
 *
 * The returned estimate is the odds-ratio interaction (exp(β₃)),
 * with a Wald confidence interval and p-value from the same model.
 *
 * @param {{ neither: {wins:number,losses:number}, aOnly: {wins:number,losses:number}, bOnly: {wins:number,losses:number}, both: {wins:number,losses:number} }} cohorts
 * @returns {{ estimate: number|null, logEstimate: number|null, standardError: number|null, pValue: number|null, interval: [number|null,number|null], separation: boolean, cohortN: {neither:number,aOnly:number,bOnly:number,both:number} }}
 */
export function logisticInteractionEstimate(cohorts) {
  const { neither, aOnly, bOnly, both } = cohorts;
  const n00 = neither.wins + neither.losses;
  const n10 = aOnly.wins + aOnly.losses;
  const n01 = bOnly.wins + bOnly.losses;
  const n11 = both.wins + both.losses;
  const cohortN = { neither: n00, aOnly: n10, bOnly: n01, both: n11 };
  // Check for separation or empty cells
  if (n00 === 0 || n10 === 0 || n01 === 0 || n11 === 0) {
    return { estimate: null, logEstimate: null, standardError: null, pValue: null, interval: [null, null], separation: true, cohortN };
  }
  const p00 = neither.wins / n00, p10 = aOnly.wins / n10, p01 = bOnly.wins / n01, p11 = both.wins / n11;
  // Check for perfect separation (p=0 or p=1 in any cell)
  if ([p00, p10, p01, p11].some((p) => p === 0 || p === 1)) {
    // Apply 0.5 continuity correction for Haldane-Anscombe
    const corrected = {
      neither: { wins: neither.wins + 0.5, losses: neither.losses + 0.5 },
      aOnly: { wins: aOnly.wins + 0.5, losses: aOnly.losses + 0.5 },
      bOnly: { wins: bOnly.wins + 0.5, losses: bOnly.losses + 0.5 },
      both: { wins: both.wins + 0.5, losses: both.losses + 0.5 },
    };
    const r = logisticInteractionEstimate(corrected);
    return { ...r, separation: true };
  }
  // Log-odds for each cell
  const lo00 = Math.log(p00 / (1 - p00)), lo10 = Math.log(p10 / (1 - p10));
  const lo01 = Math.log(p01 / (1 - p01)), lo11 = Math.log(p11 / (1 - p11));
  // Interaction on log-odds scale: β₃ = lo11 - lo10 - lo01 + lo00
  const logEstimate = lo11 - lo10 - lo01 + lo00;
  // Variance via delta method: Var(β₃) = Σ 1/(n_ij * p_ij * (1-p_ij))
  const variance = 1 / (n00 * p00 * (1 - p00)) + 1 / (n10 * p10 * (1 - p10))
    + 1 / (n01 * p01 * (1 - p01)) + 1 / (n11 * p11 * (1 - p11));
  const standardError = Math.sqrt(variance);
  const z = standardError > 0 ? logEstimate / standardError : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  // Confidence interval on log-odds scale, then exponentiate to odds-ratio scale
  const z95 = 1.959963984540054;
  const logLo = logEstimate - z95 * standardError, logHi = logEstimate + z95 * standardError;
  return {
    estimate: Math.exp(logEstimate),
    logEstimate,
    standardError,
    pValue,
    interval: [Math.exp(logLo), Math.exp(logHi)],
    separation: false,
    cohortN,
  };
}

/**
 * Stratified Mantel-Haenszel-style interaction estimator.
 *
 * Pools the log-odds interaction across strata using inverse-variance weighting.
 * Each stratum contributes a log-odds interaction estimate weighted by its
 * inverse variance. The pooled estimate, SE, CI, and p-value all come from
 * the same model.
 *
 * @param {Array<{ neither: {wins:number,losses:number}, aOnly: {wins:number,losses:number}, bOnly: {wins:number,losses:number}, both: {wins:number,losses:number} }>} strata
 * @returns {{ estimate: number|null, logEstimate: number|null, standardError: number|null, pValue: number|null, interval: [number|null,number|null], separation: boolean, strataCount: number, totalCohortN: object, effectiveN: number }}
 */
export function stratifiedInteractionEstimate(strata) {
  let pooledLog = 0, pooledVarianceInv = 0, separation = false;
  const totalCohortN = { neither: 0, aOnly: 0, bOnly: 0, both: 0 };
  let validStrata = 0;
  for (const stratum of strata) {
    const r = logisticInteractionEstimate(stratum);
    totalCohortN.neither += r.cohortN.neither;
    totalCohortN.aOnly += r.cohortN.aOnly;
    totalCohortN.bOnly += r.cohortN.bOnly;
    totalCohortN.both += r.cohortN.both;
    if (r.separation || r.logEstimate == null || r.standardError == null || !Number.isFinite(r.logEstimate) || !Number.isFinite(r.standardError) || r.standardError === 0) {
      separation = separation || r.separation;
      continue;
    }
    const w = 1 / (r.standardError * r.standardError);
    pooledLog += r.logEstimate * w;
    pooledVarianceInv += w;
    validStrata += 1;
  }
  if (pooledVarianceInv === 0 || validStrata === 0) {
    return { estimate: null, logEstimate: null, standardError: null, pValue: null, interval: [null, null], separation: true, strataCount: strata.length, totalCohortN, effectiveN: 0 };
  }
  const logEstimate = pooledLog / pooledVarianceInv;
  const standardError = Math.sqrt(1 / pooledVarianceInv);
  const z = standardError > 0 ? logEstimate / standardError : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const z95 = 1.959963984540054;
  const logLo = logEstimate - z95 * standardError, logHi = logEstimate + z95 * standardError;
  const effectiveN = totalCohortN.neither + totalCohortN.aOnly + totalCohortN.bOnly + totalCohortN.both;
  return {
    estimate: Math.exp(logEstimate),
    logEstimate,
    standardError,
    pValue,
    interval: [Math.exp(logLo), Math.exp(logHi)],
    separation: false,
    strataCount: validStrata,
    totalCohortN,
    effectiveN,
  };
}

/**
 * Compute cohort balance ratio (smallest/largest) from four cohort sizes.
 * Returns a value in [0, 1] where 1 means perfectly balanced.
 */
export function cohortBalanceRatio(/** @type {Record<string, number>} */ cohortN) {
  const sizes = Object.values(cohortN).filter((n) => n > 0);
  if (sizes.length < 2) return 0;
  return Math.min(...sizes) / Math.max(...sizes);
}

export function formulaHash(/** @type {string} */ formula) {
  return createHash('sha256').update(String(formula)).digest('hex');
}

/**
 * McNemar test for paired binary outcomes (AB/BA seat-swap design).
 *
 * For POLICY advantage (the primary question — is policy A better than B?):
 *   - b: A wins regardless of seat (A wins seat1 in AB match AND A wins seat2 in BA match)
 *   - c: B wins regardless of seat (B wins seat2 in AB match AND B wins seat1 in BA match)
 *
 * Concordant pairs (seat-1-always-wins, seat-2-always-wins, draws) are excluded
 * from the discordance table, as is standard for McNemar's test.
 *
 * The exact binomial test is used when discordant pairs < 25 (standard rule).
 * Otherwise the chi-square approximation with continuity correction is used.
 *
 * @param {Array<{ aSeat1Win?: boolean, bSeat1Win?: boolean, aSeat2Win?: boolean, bSeat2Win?: boolean } | null>} pairs - array of {aSeat1Win, bSeat1Win, aSeat2Win, bSeat2Win}
 * @returns {{ b: number, c: number, estimate: number, standardError: number | null, statistic: number, pValue: number, method: string, sampleSize: number, discordantPairs: number, effect: string, seatEffectConcordant: { seat1AlwaysWins: number, seat2AlwaysWins: number } }}
 */
export function mcnemarPairedTest(pairs) {
  let b = 0, c = 0; // b: A wins both seats; c: B wins both seats
  let seat1Always = 0, seat2Always = 0; // seat-effect concordant pairs
  for (const p of pairs) {
    if (!p) continue;
    const aWonSeat1 = Boolean(p.aSeat1Win);
    const bWonSeat1 = Boolean(p.bSeat1Win);
    const aWonSeat2 = Boolean(p.aSeat2Win);
    const bWonSeat2 = Boolean(p.bSeat2Win);
    // Policy advantage discordant: A wins both or B wins both
    if (aWonSeat1 && aWonSeat2) b += 1;           // A wins regardless of seat
    else if (bWonSeat1 && bWonSeat2) c += 1;       // B wins regardless of seat
    else if (aWonSeat1 && bWonSeat1) seat1Always += 1; // seat 1 wins both (seat effect)
    else if (bWonSeat2 && aWonSeat2) seat2Always += 1; // seat 2 wins both (seat effect)
  }
  const discordant = b + c;
  if (discordant === 0) {
    return { b: 0, c: 0, estimate: 0, standardError: null, statistic: 0, pValue: 1, method: 'no-discordant-pairs', sampleSize: pairs.length, discordantPairs: 0, effect: 'policy-advantage', seatEffectConcordant: { seat1AlwaysWins: seat1Always, seat2AlwaysWins: seat2Always } };
  }
  const estimate = (b - c) / discordant;
  const standardError = 1 / Math.sqrt(discordant);
  if (discordant < 25) {
    // Exact binomial test: under H0, b ~ Binomial(discordant, 0.5)
    const k = Math.min(b, c);
    let tail = 0;
    for (let i = 0; i <= k; i += 1) {
      tail += binomialCoefficient(discordant, i) * Math.pow(0.5, discordant);
    }
    const pValue = Math.min(1, 2 * tail);
    return { b, c, estimate, standardError, statistic: Math.abs(b - c), pValue, method: 'exact-binomial', sampleSize: pairs.length, discordantPairs: discordant, effect: 'policy-advantage', seatEffectConcordant: { seat1AlwaysWins: seat1Always, seat2AlwaysWins: seat2Always } };
  }
  // Chi-square with continuity correction
  const statistic = (Math.abs(b - c) - 1) ** 2 / discordant;
  const pValue = chiSquarePValue(statistic, 1);
  return { b, c, estimate, standardError, statistic, pValue, method: 'mcnemar-continuity-corrected', sampleSize: pairs.length, discordantPairs: discordant, effect: 'policy-advantage', seatEffectConcordant: { seat1AlwaysWins: seat1Always, seat2AlwaysWins: seat2Always } };
}

/**
 * Paired bootstrap for AB/BA seat-swap design.
 * Resamples paired AB/BA blocks and computes the seat-policy win-rate differential.
 * @param {Array<{ aSeat1Win?: boolean, bSeat1Win?: boolean, aSeat2Win?: boolean, bSeat2Win?: boolean } | null>} pairs - array of {aSeat1Win, bSeat1Win, aSeat2Win, bSeat2Win}
 * @param {{ iterations?: number, seed?: string | number, alpha?: number }} [options] - { iterations, seed, alpha }
 * @returns {{ estimate: number | null, interval: [number | null, number | null], iterations: number, seed: string, sampleSize: number }}
 */
export function pairedBootstrapABBA(pairs, { iterations = 2000, seed = 'intrilex-abba-paired', alpha = 0.05 } = {}) {
  if (!pairs.length) return { estimate: null, interval: [null, null], iterations: 0, seed: String(seed), sampleSize: 0 };
  const random = rng(seedFrom(seed));
  const estimate = (/** @type {Array<{ aSeat1Win?: boolean, bSeat1Win?: boolean, aSeat2Win?: boolean, bSeat2Win?: boolean } | null>} */ sample) => {
    let aWins = 0, bWins = 0, total = 0;
    for (const p of sample) {
      if (!p) continue;
      if (p.aSeat1Win) aWins += 1;
      if (p.aSeat2Win) aWins += 1;
      if (p.bSeat1Win) bWins += 1;
      if (p.bSeat2Win) bWins += 1;
      total += 2;
    }
    return total > 0 ? (aWins - bWins) / total : null;
  };
  const samples = /** @type {number[]} */ ([]);
  for (let i = 0; i < iterations; i += 1) {
    const sample = [];
    for (let j = 0; j < pairs.length; j += 1) {
      sample.push(pairs[Math.floor(random() * pairs.length)]);
    }
    const value = estimate(sample);
    if (value != null && Number.isFinite(value)) samples.push(value);
  }
  return {
    estimate: estimate(pairs),
    interval: [quantile(samples, alpha / 2), quantile(samples, 1 - alpha / 2)],
    iterations: samples.length,
    seed: String(seed),
    sampleSize: pairs.length
  };
}

// ── Internal helpers for McNemar / chi-square ──
function binomialCoefficient(/** @type {number} */ n, /** @type {number} */ k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
  return result;
}

function chiSquarePValue(/** @type {number} */ statistic, /** @type {number} */ df) {
  // Lower incomplete gamma function via series expansion (for df=1, small statistic)
  if (df === 1) {
    return 2 * (1 - normalCdf(Math.sqrt(statistic)));
  }
  // Generalized: use the regularized upper incomplete gamma
  const x = statistic / 2;
  const a = df / 2;
  // Series expansion for upper incomplete gamma
  let sum = 1, term = 1;
  for (let i = 1; i < 200; i += 1) {
    term *= x / (a + i - 1);
    sum += term;
    if (Math.abs(term) < 1e-12) break;
  }
  const lower = Math.pow(x, a) * Math.exp(-x) * sum / gamma(a);
  return Math.max(0, Math.min(1, 1 - lower));
}

/** @returns {number} */
function gamma(/** @type {number} */ z) {
  // Lanczos approximation
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i += 1) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
