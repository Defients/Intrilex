import { createHash } from 'node:crypto';
import { normalCdf } from './estimators.mjs';

// Estimand-defining functions live in ./estimators.mjs (browser-safe, shared
// verbatim with the browser Observatory) and are re-exported here.
export {
  Z95, normalCdf, wilsonInterval, differenceInProportions, benjaminiHochberg, cohortBalanceRatio,
  logisticInteractionEstimate, stratifiedInteractionEstimate, empiricalBayesShrinkage, shrinkLogOddsRatio,
  EVIDENCE_SCALES, evidenceGrade, evidenceGradeDetailed, evidenceGradeLegacy, LEGACY_GRADE_MAP, winRateRecord,
} from './estimators.mjs';


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
 * Detect perfect separation in a 2×2×2 binary outcome table.
 * Returns true if any cell has zero observations in one outcome category.
 */
export function detectSeparation(/** @type {Array<{ wins: number, losses: number }>} */ cohorts) {
  for (const cohort of cohorts) {
    if (cohort.wins === 0 || cohort.losses === 0) return true;
  }
  return false;
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
