import { createHash } from 'node:crypto';

// Estimand-defining functions live in ./estimators.mjs (browser-safe, shared
// verbatim with the browser Observatory) and are re-exported here.
export {
  Z95, normalCdf, wilsonInterval, differenceInProportions, benjaminiHochberg, cohortBalanceRatio,
  logisticInteractionEstimate, stratifiedInteractionEstimate, empiricalBayesShrinkage, shrinkLogOddsRatio,
  EVIDENCE_SCALES, evidenceGrade, evidenceGradeDetailed, evidenceGradeLegacy, LEGACY_GRADE_MAP, winRateRecord,
} from './estimators.mjs';

// Paired AB/BA inference lives in ./paired-tests.mjs — a crypto-free pure
// module mirrored verbatim into the browser Observatory so Node and browser
// produce identical McNemar/bootstrap results for the same dataset.
export { mcnemarPairedTest, pairedBootstrapABBA, binomialSignTest, pairedSeedFrom } from './paired-tests.mjs';


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
