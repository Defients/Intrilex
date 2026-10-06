// Pure, dependency-free estimator contracts shared by canonical analytics
// (packages/analytics) and the browser Observatory (copied verbatim into
// apps/lab-web/dist/shared-analytics/ by scripts/build.mjs). Anything that
// defines an estimand, interval, shrinkage, or evidence rule lives here once.

export const Z95 = 1.959963984540054;

/** @param {number} x */
export function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z));
  return 0.5 * (1 + erf);
}

/**
 * Wilson score interval for a binomial proportion.
 * @param {number} successes
 * @param {number} total
 * @param {number} [z]
 * @returns {[number, number]}
 */
export function wilsonInterval(successes, total, z = Z95) {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total < 0 || successes > total) throw new TypeError('Invalid binomial counts');
  if (total === 0) return [0, 0];
  const p = successes / total, z2 = z * z, denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/**
 * Two-proportion difference with Wald CI and z-test p-value.
 * @param {number} aSuccess @param {number} aTotal @param {number} bSuccess @param {number} bTotal
 * @returns {{ estimate: number | null, standardError: number | null, pValue: number | null, interval: [number | null, number | null] }}
 */
export function differenceInProportions(aSuccess, aTotal, bSuccess, bTotal) {
  if (!aTotal || !bTotal) return { estimate: null, standardError: null, pValue: null, interval: [null, null] };
  const pa = aSuccess / aTotal, pb = bSuccess / bTotal, estimate = pa - pb;
  const se = Math.sqrt((pa * (1 - pa)) / aTotal + (pb * (1 - pb)) / bTotal);
  const z = se ? estimate / se : 0;
  return { estimate, standardError: se, pValue: 2 * (1 - normalCdf(Math.abs(z))), interval: [estimate - Z95 * se, estimate + Z95 * se] };
}

/**
 * Benjamini-Hochberg FDR. Only items with a finite p-value enter the family;
 * callers are responsible for passing only valid inferential hypotheses.
 * @template {Record<string, any>} T
 * @param {T[]} items
 * @param {{ pKey?: string, idKey?: string }} [options]
 * @returns {(T & { qValue: number | null })[]}
 */
export function benjaminiHochberg(items, { pKey = 'pValue', idKey = 'id' } = {}) {
  /** @type {Record<string, any>[]} */
  const valid = items.filter((item) => Number.isFinite(item[pKey])).map((item) => ({ ...item })).sort((a, b) => a[pKey] - b[pKey] || String(a[idKey]).localeCompare(String(b[idKey])));
  const m = valid.length;
  let running = 1;
  for (let i = m - 1; i >= 0; i -= 1) {
    running = Math.min(running, (valid[i][pKey] * m) / (i + 1));
    valid[i].qValue = Math.min(1, running);
  }
  const byId = new Map(valid.map((item) => [item[idKey], /** @type {number} */ (item.qValue)]));
  return items.map((item) => ({ ...item, qValue: byId.get(item[idKey]) ?? null }));
}

/** @param {Record<string, number>} cohortN */
export function cohortBalanceRatio(cohortN) {
  const sizes = Object.values(cohortN).filter((n) => n > 0);
  if (sizes.length < 2) return 0;
  return Math.min(...sizes) / Math.max(...sizes);
}

/** @typedef {{ wins: number, losses: number }} Cell */
/** @typedef {{ neither: Cell, aOnly: Cell, bOnly: Cell, both: Cell }} FourCohorts */

/**
 * Logistic A×B interaction for one stratum: β₃ = lo11 − lo10 − lo01 + lo00,
 * reported as OR = exp(β₃) with a Wald CI built on the log scale.
 * `failure` is null on success, otherwise 'EMPTY_COHORT' (a structural zero —
 * no counterfactual variation) or 'OUTCOME_SEPARATION' (a cohort with all wins
 * or all losses). On separation a Haldane-corrected estimate is attached, but
 * the stratified pooler below never uses it.
 * @typedef {{ estimate: number | null, logEstimate: number | null, standardError: number | null, pValue: number | null, interval: [number | null, number | null], separation: boolean, failure: string | null, cohortN: { neither: number, aOnly: number, bOnly: number, both: number } }} InteractionResult
 * @param {FourCohorts} cohorts
 * @returns {InteractionResult}
 */
export function logisticInteractionEstimate(cohorts) {
  const { neither, aOnly, bOnly, both } = cohorts;
  const n00 = neither.wins + neither.losses, n10 = aOnly.wins + aOnly.losses;
  const n01 = bOnly.wins + bOnly.losses, n11 = both.wins + both.losses;
  const cohortN = { neither: n00, aOnly: n10, bOnly: n01, both: n11 };
  /** @type {InteractionResult} */
  const empty = { estimate: null, logEstimate: null, standardError: null, pValue: null, interval: [null, null], separation: false, failure: 'EMPTY_COHORT', cohortN };
  if (n00 === 0 || n10 === 0 || n01 === 0 || n11 === 0) return empty;
  const p = [neither.wins / n00, aOnly.wins / n10, bOnly.wins / n01, both.wins / n11];
  if (p.some((x) => x === 0 || x === 1)) {
    const c = (/** @type {Cell} */ x) => ({ wins: x.wins + 0.5, losses: x.losses + 0.5 });
    const r = logisticInteractionEstimate({ neither: c(neither), aOnly: c(aOnly), bOnly: c(bOnly), both: c(both) });
    return { ...r, cohortN, separation: true, failure: 'OUTCOME_SEPARATION' };
  }
  const [p00, p10, p01, p11] = p;
  const lo = (/** @type {number} */ x) => Math.log(x / (1 - x));
  const logEstimate = lo(p11) - lo(p10) - lo(p01) + lo(p00);
  const standardError = Math.sqrt(1 / (n00 * p00 * (1 - p00)) + 1 / (n10 * p10 * (1 - p10)) + 1 / (n01 * p01 * (1 - p01)) + 1 / (n11 * p11 * (1 - p11)));
  const z = standardError > 0 ? logEstimate / standardError : 0;
  return {
    estimate: Math.exp(logEstimate), logEstimate, standardError,
    pValue: 2 * (1 - normalCdf(Math.abs(z))),
    interval: [Math.exp(logEstimate - Z95 * standardError), Math.exp(logEstimate + Z95 * standardError)],
    separation: false, failure: null, cohortN,
  };
}

/**
 * Inverse-variance pooled log-odds interaction across strata.
 *
 * Support accounting contract (each number means one thing):
 *   eligibleN     — decisive observations in all four cohorts of all strata
 *   contributingN — observations in strata that actually entered the pooled
 *                   estimate (this is `effectiveN`)
 *   excludedN     — eligibleN − contributingN
 * Strata are excluded for EMPTY_COHORT, OUTCOME_SEPARATION, or
 * DEGENERATE_VARIANCE and every exclusion is disclosed; partial separation is
 * never erased by a successful pool.
 * @param {FourCohorts[]} strata
 * @param {{ stratumKeys?: string[] }} [options]
 */
export function stratifiedInteractionEstimate(strata, { stratumKeys = [] } = {}) {
  let pooledLog = 0, pooledVarianceInv = 0;
  const totalCohortN = { neither: 0, aOnly: 0, bOnly: 0, both: 0 };
  const contributingCohortN = { neither: 0, aOnly: 0, bOnly: 0, both: 0 };
  /** @type {Array<{ stratum: string, reason: string, n: number }>} */
  const excludedStrata = [];
  let contributingStrata = 0;
  const add = (/** @type {typeof totalCohortN} */ target, /** @type {typeof totalCohortN} */ n) => { target.neither += n.neither; target.aOnly += n.aOnly; target.bOnly += n.bOnly; target.both += n.both; };
  const sum = (/** @type {typeof totalCohortN} */ n) => n.neither + n.aOnly + n.bOnly + n.both;
  strata.forEach((stratum, index) => {
    const r = logisticInteractionEstimate(stratum);
    add(totalCohortN, r.cohortN);
    const n = sum(r.cohortN);
    if (n === 0) return;
    const reason = r.failure ?? (r.logEstimate == null || r.standardError == null || !Number.isFinite(r.logEstimate) || !Number.isFinite(r.standardError) || r.standardError === 0 ? 'DEGENERATE_VARIANCE' : null);
    if (reason) { excludedStrata.push({ stratum: stratumKeys[index] ?? String(index), reason, n }); return; }
    const w = 1 / (/** @type {number} */ (r.standardError) ** 2);
    pooledLog += /** @type {number} */ (r.logEstimate) * w;
    pooledVarianceInv += w;
    contributingStrata += 1;
    add(contributingCohortN, r.cohortN);
  });
  const eligibleN = sum(totalCohortN), contributingN = sum(contributingCohortN);
  const separatedStrata = excludedStrata.filter((s) => s.reason === 'OUTCOME_SEPARATION').length;
  const support = {
    strataAttempted: strata.filter((s) => sum(logisticInteractionEstimate(s).cohortN) > 0).length,
    strataContributing: contributingStrata,
    strataExcluded: excludedStrata.length,
    excludedStrata,
    eligibleN, contributingN, excludedN: eligibleN - contributingN,
    effectiveN: contributingN,
    totalCohortN, contributingCohortN,
    anyStratumSeparated: separatedStrata > 0,
    separatedStrata,
    emptyCohortStrata: excludedStrata.filter((s) => s.reason === 'EMPTY_COHORT').length,
    separation: separatedStrata > 0,
    separationAffectedEstimate: separatedStrata > 0 && contributingStrata > 0,
    strataCount: contributingStrata,
  };
  if (pooledVarianceInv === 0 || contributingStrata === 0) {
    const reasons = new Set(excludedStrata.map((s) => s.reason));
    const failureReason = reasons.size === 1 && reasons.has('EMPTY_COHORT') ? 'NO_WITHIN_STRATUM_VARIATION'
      : reasons.has('OUTCOME_SEPARATION') ? 'SEPARATION' : 'SINGULAR_MODEL';
    return { estimate: null, logEstimate: null, standardError: null, pValue: null, interval: /** @type {[null, null]} */ ([null, null]), estimatorSucceeded: false, allStrataInvalid: true, failureReason, ...support };
  }
  const logEstimate = pooledLog / pooledVarianceInv;
  const standardError = Math.sqrt(1 / pooledVarianceInv);
  const z = standardError > 0 ? logEstimate / standardError : 0;
  return {
    estimate: Math.exp(logEstimate), logEstimate, standardError,
    pValue: 2 * (1 - normalCdf(Math.abs(z))),
    interval: /** @type {[number, number]} */ ([Math.exp(logEstimate - Z95 * standardError), Math.exp(logEstimate + Z95 * standardError)]),
    estimatorSucceeded: true, allStrataInvalid: false, failureReason: null, ...support,
  };
}

/**
 * Pseudo-count shrinkage for ZERO-CENTERED (difference-scale) estimates only.
 * Do not pass odds ratios — use shrinkLogOddsRatio.
 * @param {number} estimate @param {number} sampleSize
 * @param {{ priorMean?: number, priorStrength?: number }} [options]
 */
export function empiricalBayesShrinkage(estimate, sampleSize, { priorMean = 0, priorStrength = 25 } = {}) {
  if (!Number.isFinite(estimate) || sampleSize <= 0) return null;
  return (estimate * sampleSize + priorMean * priorStrength) / (sampleSize + priorStrength);
}

/**
 * Same pseudo-count methodology, applied on the log-odds scale whose null is 0
 * (OR = 1): shrunkLogOR = logOR × n / (n + priorStrength). Always moves an OR
 * toward 1, symmetrically for OR > 1 and OR < 1. Ranking strength is
 * |shrunkLogOR| (null-centered, symmetric).
 * @param {number} logOR @param {number} n
 * @param {{ priorStrength?: number }} [options]
 */
export function shrinkLogOddsRatio(logOR, n, { priorStrength = 25 } = {}) {
  if (!Number.isFinite(logOR) || !(n > 0)) return { shrunkLogOR: null, shrunkOR: null, shrinkageFactor: null };
  const shrinkageFactor = n / (n + priorStrength);
  const shrunkLogOR = logOR * shrinkageFactor;
  return { shrunkLogOR, shrunkOR: Math.exp(shrunkLogOR), shrinkageFactor };
}

/**
 * Metric-scale evidence criteria. Difference-scale thresholds are the
 * historical rubric. Odds-ratio metrics are graded on log(OR); the same
 * thresholds are translated through the logistic slope at p = 0.5
 * (dp/dlogit = 1/4), where a log-odds interval is widest in probability terms,
 * so an OR is never held to a looser standard than the equivalent probability
 * difference. No new free thresholds are introduced.
 */
const LOGIT_SLOPE_AT_HALF = 0.25;
export const EVIDENCE_SCALES = Object.freeze({
  difference: Object.freeze({ scale: 'difference', null: 0, minEffect: 0.02, robustWidth: 0.15, supportedWidth: 0.25, widthBasis: 'upper − lower' }),
  'odds-ratio': Object.freeze({ scale: 'odds-ratio', null: 1, minEffect: 0.02 / LOGIT_SLOPE_AT_HALF, robustWidth: 0.15 / LOGIT_SLOPE_AT_HALF, supportedWidth: 0.25 / LOGIT_SLOPE_AT_HALF, widthBasis: 'log(upper) − log(lower)' }),
});

/**
 * Structured multi-criteria evidence grade with machine-readable reasons.
 * `scale: 'odds-ratio'` takes the interval and effectSize in OR units and
 * grades null exclusion, effect size and precision on log(OR).
 * `nullValue` only applies to the difference scale.
 * @param {{ sampleSize?: number, interval?: Array<number | null>, qValue?: number | null, minimum?: number, effectSize?: number | null, cohortBalance?: number | null, effectiveN?: number | null, pairedCoverage?: number | null, nullValue?: number, scale?: 'difference' | 'odds-ratio' }} [params]
 * @returns {{ grade: 'INSUFFICIENT' | 'EXPLORATORY' | 'SUPPORTED' | 'ROBUST', reasons: Array<{ code: string, detail: string }>, scale: string }}
 */
export function evidenceGradeDetailed({ sampleSize = 0, interval = [0, 0], qValue, minimum = 20, effectSize = null, cohortBalance = null, effectiveN = null, pairedCoverage = null, nullValue = 0, scale = 'difference' } = {}) {
  const rules = EVIDENCE_SCALES[scale];
  if (!rules) throw new TypeError(`Unknown evidence scale: ${scale}`);
  /** @type {Array<{ code: string, detail: string }>} */
  const reasons = [];
  /** @param {'INSUFFICIENT' | 'EXPLORATORY' | 'SUPPORTED' | 'ROBUST'} grade */
  const out = (grade) => ({ grade, reasons, scale });
  const n = effectiveN != null && Number.isFinite(effectiveN) ? effectiveN : sampleSize;
  if (!Number.isFinite(n) || n < minimum) {
    reasons.push({ code: 'INSUFFICIENT_SAMPLE', detail: `${Number.isFinite(n) ? n : 'no'} usable observations < ${minimum} required` });
    return out('INSUFFICIENT');
  }
  if (!Array.isArray(interval) || interval.length < 2 || !interval.every(Number.isFinite)) {
    reasons.push({ code: 'MISSING_INTERVAL', detail: 'estimator produced no finite confidence interval' });
    return out('INSUFFICIENT');
  }
  const ratio = scale === 'odds-ratio';
  if (ratio && !(/** @type {number} */ (interval[0]) > 0)) {
    reasons.push({ code: 'INVALID_INTERVAL', detail: 'odds-ratio interval must be strictly positive' });
    return out('INSUFFICIENT');
  }
  const t = (/** @type {number} */ v) => (ratio ? Math.log(v) : v);
  const lo = t(/** @type {number} */ (interval[0])), hi = t(/** @type {number} */ (interval[1]));
  const nul = ratio ? 0 : nullValue;
  const excludesNull = lo > nul || hi < nul;
  const width = Math.abs(hi - lo);
  const q = qValue == null ? 1 : qValue;
  const effect = effectSize != null && Number.isFinite(effectSize) && (!ratio || effectSize > 0) ? Math.abs(t(effectSize) - nul) : null;
  const hasEffect = effect != null ? effect >= rules.minEffect : excludesNull;
  const balanced = cohortBalance != null && Number.isFinite(cohortBalance) ? cohortBalance >= 0.2 : true;
  const paired = pairedCoverage != null && Number.isFinite(pairedCoverage) ? pairedCoverage >= 0.5 : true;
  const unit = ratio ? 'log-OR ' : '';
  if (!excludesNull) {
    reasons.push({ code: 'CI_CROSSES_NULL', detail: `confidence interval contains the null value (${rules.null}${ratio ? ', odds-ratio scale' : ''})` });
    return out('INSUFFICIENT');
  }
  if (!hasEffect) {
    reasons.push({ code: 'EFFECT_BELOW_MINIMUM', detail: `|${unit}effect| ${Number(effect).toFixed(4)} < ${rules.minEffect.toFixed(4)} minimum` });
    return out('INSUFFICIENT');
  }
  if (n >= 500 && q <= 0.05 && width <= rules.robustWidth && balanced && paired) return out('ROBUST');
  if (n >= 100 && q <= 0.10 && width <= rules.supportedWidth && balanced) return out('SUPPORTED');
  if (n >= minimum && q <= 0.20) return out('EXPLORATORY');
  if (qValue == null) reasons.push({ code: 'MISSING_QVALUE', detail: 'no multiplicity-adjusted q-value; significance tiers unreachable' });
  else if (q > 0.20) reasons.push({ code: 'QVALUE_ABOVE_TIER', detail: `q=${q.toFixed(4)} > 0.20 (EXPLORATORY threshold)` });
  if (n < 100) reasons.push({ code: 'SAMPLE_BELOW_TIER', detail: `n=${n} < 100 (SUPPORTED tier)` });
  if (width > rules.supportedWidth) reasons.push({ code: 'INTERVAL_TOO_WIDE', detail: `${unit}CI width ${width.toFixed(3)} > ${rules.supportedWidth.toFixed(3)} (SUPPORTED tier)` });
  if (!balanced) reasons.push({ code: 'IMBALANCED_COHORTS', detail: `cohort balance ${Number(cohortBalance).toFixed(3)} < 0.2` });
  if (!paired) reasons.push({ code: 'LOW_PAIRED_COVERAGE', detail: `paired coverage ${Number(pairedCoverage).toFixed(3)} < 0.5` });
  if (reasons.length === 0) reasons.push({ code: 'UNSPECIFIED', detail: 'criteria combination did not reach EXPLORATORY' });
  return out('INSUFFICIENT');
}

/** @param {Parameters<typeof evidenceGradeDetailed>[0]} [params] */
export function evidenceGrade(params = {}) {
  return evidenceGradeDetailed(params).grade;
}

export const LEGACY_GRADE_MAP = Object.freeze({ INSUFFICIENT: 'insufficient', EXPLORATORY: 'weak', SUPPORTED: 'moderate', ROBUST: 'strong' });

/**
 * Lowercase alias of the modern grade, computed from the SAME inputs (scale,
 * effect, balance, q-value) so the two fields can never contradict.
 * @deprecated Use evidenceGradeDetailed.
 * @param {Parameters<typeof evidenceGradeDetailed>[0]} [params]
 */
export function evidenceGradeLegacy(params = {}) {
  return LEGACY_GRADE_MAP[evidenceGrade(params)] ?? 'insufficient';
}

/**
 * Win-rate denominator contract. `winRate`/`wilson95` describe ONE estimand —
 * wins / decisive games (registry 'win-rate') — so point and interval always
 * share a denominator. Wins over all eligible games is a separate, separately
 * labeled metric. No decisive games → null, never an invented interval.
 * @param {{ wins?: number, losses?: number, draws?: number, aborts?: number }} counts
 */
export function winRateRecord({ wins = 0, losses = 0, draws = 0, aborts = 0 }) {
  const decisive = wins + losses, games = decisive + draws + aborts;
  return {
    wins, losses, draws, aborts, decisive, games,
    winRate: decisive > 0 ? wins / decisive : null,
    wilson95: decisive > 0 ? wilsonInterval(wins, decisive) : null,
    winRateDenominator: 'decisive',
    allGamesWinRate: games > 0 ? wins / games : null,
    allGamesWilson95: games > 0 ? wilsonInterval(wins, games) : null,
    allGamesDenominator: 'all-eligible-games',
  };
}
