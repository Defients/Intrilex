// paired-tests.mjs — paired-inference statistics for AB/BA experimental designs.
// Pure math only (no I/O, no node:crypto) so this module can be mirrored
// verbatim into apps/lab-web/dist/shared-analytics and produce IDENTICAL
// results in the Node canonical pipeline and the browser Observatory.
//
// Canonical semantics: every entry in `pairs` describes ONE paired AB/BA
// block — {aSeat1Win, bSeat1Win, aSeat2Win, bSeat2Win} where "A"/"B" are the
// two competing policies and aSeat1Win means "A won the leg in which it
// occupied seat 1". Inference aggregates across all verified blocks of a
// matchup; the statistical unit is the paired block, never a single leg.

import { normalCdf } from './estimators.mjs';

/**
 * @param {number[]} values - Input values
 * @param {number} q - Quantile in [0, 1]
 * @returns {number | null}
 */
function quantile(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const pos = (clean.length - 1) * q;
  const low = Math.floor(pos), high = Math.ceil(pos);
  if (low === high) return clean[low];
  return clean[low] * (high - pos) + clean[high] * (pos - low);
}

/**
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function binomialCoefficient(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
  return result;
}

/**
 * @param {number} statistic
 * @param {number} df
 * @returns {number}
 */
function chiSquarePValue(statistic, df) {
  if (df === 1) return 2 * (1 - normalCdf(Math.sqrt(statistic)));
  const x = statistic / 2;
  const a = df / 2;
  let sum = 1, term = 1;
  for (let i = 1; i < 200; i += 1) {
    term *= x / (a + i - 1);
    sum += term;
    if (Math.abs(term) < 1e-12) break;
  }
  const lower = Math.pow(x, a) * Math.exp(-x) * sum / gamma(a);
  return Math.max(0, Math.min(1, 1 - lower));
}

/**
 * @param {number} z
 * @returns {number}
 */
function gamma(z) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i += 1) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/**
 * Deterministic 32-bit FNV-1a seed from a string or number. Used in place of
 * SHA-256 here so Node and the browser resample identically for the same
 * dataset key (previously the two environments diverged).
 * @param {string | number} value
 * @returns {number}
 */
export function pairedSeedFrom(value) {
  const text = String(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function pairedRng(seed) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
}

/**
 * McNemar test for paired binary outcomes (AB/BA seat-swap design).
 *
 * For POLICY advantage (the primary question — is policy A better than B?):
 *   - b: A wins regardless of seat (A wins seat1 in AB leg AND seat2 in BA leg)
 *   - c: B wins regardless of seat
 *
 * Concordant blocks (seat-1-always-wins, seat-2-always-wins, draws) are
 * excluded from the discordance table but reported separately as seat-effect
 * evidence, as is standard for McNemar's test.
 *
 * The exact binomial test is used when discordant pairs < 25; otherwise the
 * chi-square approximation with continuity correction.
 *
 * @param {Array<{ aSeat1Win?: boolean, bSeat1Win?: boolean, aSeat2Win?: boolean, bSeat2Win?: boolean } | null>} pairs
 * @returns {{ b: number, c: number, estimate: number, standardError: number | null, statistic: number, pValue: number, method: string, sampleSize: number, discordantPairs: number, effect: string, seatEffectConcordant: { seat1AlwaysWins: number, seat2AlwaysWins: number } }}
 */
export function mcnemarPairedTest(pairs) {
  let b = 0, c = 0;
  let seat1Always = 0, seat2Always = 0;
  for (const p of pairs) {
    if (!p) continue;
    const aWonSeat1 = Boolean(p.aSeat1Win);
    const bWonSeat1 = Boolean(p.bSeat1Win);
    const aWonSeat2 = Boolean(p.aSeat2Win);
    const bWonSeat2 = Boolean(p.bSeat2Win);
    if (aWonSeat1 && aWonSeat2) b += 1;
    else if (bWonSeat1 && bWonSeat2) c += 1;
    else if (aWonSeat1 && bWonSeat1) seat1Always += 1;
    else if (bWonSeat2 && aWonSeat2) seat2Always += 1;
  }
  const discordant = b + c;
  if (discordant === 0) {
    return { b: 0, c: 0, estimate: 0, standardError: null, statistic: 0, pValue: 1, method: 'no-discordant-pairs', sampleSize: pairs.length, discordantPairs: 0, effect: 'policy-advantage', seatEffectConcordant: { seat1AlwaysWins: seat1Always, seat2AlwaysWins: seat2Always } };
  }
  const estimate = (b - c) / discordant;
  const standardError = 1 / Math.sqrt(discordant);
  if (discordant < 25) {
    const k = Math.min(b, c);
    let tail = 0;
    for (let i = 0; i <= k; i += 1) tail += binomialCoefficient(discordant, i) * Math.pow(0.5, discordant);
    const pValue = Math.min(1, 2 * tail);
    return { b, c, estimate, standardError, statistic: Math.abs(b - c), pValue, method: 'exact-binomial', sampleSize: pairs.length, discordantPairs: discordant, effect: 'policy-advantage', seatEffectConcordant: { seat1AlwaysWins: seat1Always, seat2AlwaysWins: seat2Always } };
  }
  const statistic = (Math.abs(b - c) - 1) ** 2 / discordant;
  const pValue = chiSquarePValue(statistic, 1);
  return { b, c, estimate, standardError, statistic, pValue, method: 'mcnemar-continuity-corrected', sampleSize: pairs.length, discordantPairs: discordant, effect: 'policy-advantage', seatEffectConcordant: { seat1AlwaysWins: seat1Always, seat2AlwaysWins: seat2Always } };
}

/**
 * Paired bootstrap for the AB/BA design. Resamples paired blocks with
 * replacement and re-computes the seat-controlled policy win-rate
 * differential (A leg-wins − B leg-wins) / total legs.
 *
 * @param {Array<{ aSeat1Win?: boolean, bSeat1Win?: boolean, aSeat2Win?: boolean, bSeat2Win?: boolean } | null>} pairs
 * @param {{ iterations?: number, seed?: string | number, alpha?: number }} [options]
 * @returns {{ estimate: number | null, interval: [number | null, number | null], iterations: number, seed: string, sampleSize: number }}
 */
export function pairedBootstrapABBA(pairs, { iterations = 2000, seed = 'intrilex-abba-paired', alpha = 0.05 } = {}) {
  if (!pairs.length) return { estimate: null, interval: [null, null], iterations: 0, seed: String(seed), sampleSize: 0 };
  const seedValue = typeof seed === 'number' ? seed : pairedSeedFrom(seed);
  const random = pairedRng(seedValue);
  /** @param {Array<{ aSeat1Win?: boolean, bSeat1Win?: boolean, aSeat2Win?: boolean, bSeat2Win?: boolean } | null>} sample */
  const estimate = (sample) => {
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
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const sample = [];
    for (let j = 0; j < pairs.length; j += 1) sample.push(pairs[Math.floor(random() * pairs.length)]);
    const value = estimate(sample);
    if (value != null && Number.isFinite(value)) samples.push(value);
  }
  return {
    estimate: estimate(pairs),
    interval: [quantile(samples, alpha / 2), quantile(samples, 1 - alpha / 2)],
    iterations: samples.length,
    seed: String(seed),
    sampleSize: pairs.length,
  };
}

/**
 * Two-sided exact sign test (binomial, p=0.5 null) over `successes` of
 * `total` decisive trials. Used for seat-effect inference: seat-1 wins vs
 * seat-2 wins across decisive legs of verified paired blocks.
 *
 * @param {number} successes
 * @param {number} total
 * @returns {{ successes: number, total: number, pValue: number | null, method: string, significantAt: number | null }}
 */
export function binomialSignTest(successes, total) {
  if (!Number.isFinite(total) || total <= 0) {
    return { successes: Number.isFinite(successes) ? successes : 0, total: Number.isFinite(total) ? total : 0, pValue: null, method: 'no-decisive-trials', significantAt: null };
  }
  const k = Math.min(successes, total - successes);
  let tail = 0;
  for (let i = 0; i <= k; i += 1) tail += binomialCoefficient(total, i) * Math.pow(0.5, total);
  const pValue = Math.min(1, 2 * tail);
  return { successes, total, pValue, method: 'exact-binomial', significantAt: pValue < 0.05 ? 0.05 : null };
}
