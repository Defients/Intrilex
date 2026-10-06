// Shared (canonical + browser) Observatory inference core. No platform
// dependencies: scripts/build.mjs copies this file to
// apps/lab-web/dist/shared-analytics/ and rewrites the estimator import.
import {
  benjaminiHochberg, cohortBalanceRatio, evidenceGradeDetailed, LEGACY_GRADE_MAP,
  shrinkLogOddsRatio, stratifiedInteractionEstimate, winRateRecord,
} from './estimators.mjs';
import { mechanicInferentialEligibility, pairDependency, synergyCellStatus } from './observatory-integrity.mjs';

/** @param {Record<string, any>} row */
export const unitDecisive = (row) => row._decisive === true;
/** @param {Record<string, any>} row */
export const unitWon = (row) => (unitDecisive(row) ? Number(row._won ?? 0) : 0);
/** @param {Record<string, any>} row */
export const stratumKey = (row) => row._stratum ?? `${row.profileId}|${(row.policyIds ?? []).join('>')}|${(row.seatOrder ?? []).join('>')}`;

/**
 * @param {Array<Record<string, any>>} rows @param {(row: Record<string, any>) => boolean} predicate @param {number} [limit]
 */
export function representativeMatches(rows, predicate, limit = 4) {
  const selected = [...new Map(rows.filter(predicate)
    .sort((a, b) => String(a.matchResultHash ?? a.matchId).localeCompare(String(b.matchResultHash ?? b.matchId)))
    .map((row) => [row.matchId, row])).values()];
  if (!selected.length) return [];
  const indexes = [...new Set([0, Math.floor((selected.length - 1) / 2), selected.length - 1, Math.floor((selected.length - 1) * 0.75)])].slice(0, limit);
  return indexes.map((index) => selected[index].matchId);
}

/** @param {Array<Record<string, any>>} group @param {string} a @param {string} b */
function fourCohortInteraction(group, a, b) {
  const cell = () => ({ wins: 0, losses: 0 });
  const c = { neither: cell(), aOnly: cell(), bOnly: cell(), both: cell() };
  for (const row of group) {
    if (!unitDecisive(row)) continue;
    const hasA = Number(row.mechanicCounts?.[a] ?? 0) > 0, hasB = Number(row.mechanicCounts?.[b] ?? 0) > 0;
    const target = hasA && hasB ? c.both : hasA ? c.aOnly : hasB ? c.bOnly : c.neither;
    if (unitWon(row) === 1) target.wins += 1; else target.losses += 1;
  }
  return c;
}

/** @param {number | null | undefined} x */
const sign = (x) => (!Number.isFinite(x) ? 'unavailable' : /** @type {number} */ (x) > 0 ? 'positive' : /** @type {number} */ (x) < 0 ? 'negative' : 'null');

/**
 * Stratified A×B interaction analysis. Estimand: OR = exp(pooled log-odds
 * interaction). modelDirection derives from log(OR); the unstratified
 * probability-scale contrast is kept separately as marginalInteractionPP with
 * its own marginalDirection, and relationshipClass is always model-based.
 * @param {Array<Record<string, any>>} units
 * @param {{ excludedTags: Set<string>, areTagsInseparable: (a: string, b: string) => boolean, relations: any, formulaHash: string }} deps
 * @param {{ minimumBoth?: number, minimumCohort?: number, minimumEffectiveN?: number, maxMechanics?: number, includeDiagnostics?: boolean }} [options]
 */
export function analyzeSynergiesCore(units, deps, { minimumBoth = 20, minimumCohort = 10, minimumEffectiveN = 50, maxMechanics = 24, includeDiagnostics = false } = {}) {
  const { excludedTags, areTagsInseparable, relations, formulaHash } = deps;
  /** @type {Record<string, number>} */
  const totals = {};
  for (const row of units) for (const [k, v] of Object.entries(row.mechanicCounts ?? {})) totals[k] = (totals[k] ?? 0) + Number(v ?? 0);
  const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a] || a.localeCompare(b)).filter((m) => !excludedTags.has(m));
  // Identical-usage aliases would duplicate hypotheses; only representatives compete for candidate slots.
  const candidateExclusions = ranked.filter((m) => relations?.aliasOf?.[m]).map((m) => ({ tag: m, reasonCode: 'IDENTICAL_USAGE', aliasOf: relations.aliasOf[m] }));
  const mechanics = ranked.filter((m) => !relations?.aliasOf?.[m]).slice(0, maxMechanics);
  const strataMap = new Map();
  for (const row of units.filter(unitDecisive)) {
    const key = stratumKey(row);
    if (!strataMap.has(key)) strataMap.set(key, []);
    strataMap.get(key).push(row);
  }
  const stratumKeys = [...strataMap.keys()], strata = [...strataMap.values()];
  /** @type {Array<Record<string, any>>} */
  const raw = [];
  /** @type {Array<Record<string, any>>} */
  const diagnostics = [];
  const reject = (/** @type {Record<string, any>} */ d) => { if (includeDiagnostics) diagnostics.push({ status: 'rejected', ...d, cellStatus: synergyCellStatus(d) }); };
  for (let i = 0; i < mechanics.length; i++) {
    for (let j = i + 1; j < mechanics.length; j++) {
      const a = mechanics[i], b = mechanics[j], id = `${a}::${b}`;
      if (areTagsInseparable(a, b)) { reject({ id, source: a, target: b, reason: 'inseparable-tags', reasonCode: 'PARENT_CHILD_OR_ALIAS', cohortN: null }); continue; }
      const dependency = relations ? pairDependency(relations, a, b) : null;
      if (dependency) { reject({ id, source: a, target: b, reason: dependency === 'SAME_EVENT_DEPENDENT' ? 'family-and-mode-of-the-same-action' : 'identical-usage', reasonCode: dependency, cohortN: null }); continue; }
      const stratumCohorts = strata.map((group) => fourCohortInteraction(group, a, b));
      const totalCohortN = { neither: 0, aOnly: 0, bOnly: 0, both: 0 };
      const wins = { neither: 0, aOnly: 0, bOnly: 0, both: 0 };
      for (const sc of stratumCohorts) for (const k of /** @type {const} */ (['neither', 'aOnly', 'bOnly', 'both'])) { totalCohortN[k] += sc[k].wins + sc[k].losses; wins[k] += sc[k].wins; }
      const totalN = totalCohortN.neither + totalCohortN.aOnly + totalCohortN.bOnly + totalCohortN.both;
      if (totalCohortN.both < minimumBoth) { reject({ id, source: a, target: b, reason: 'insufficient-both-cohort', reasonCode: 'INSUFFICIENT_BOTH', cohortN: totalCohortN, threshold: minimumBoth }); continue; }
      const deficient = /** @type {const} */ (['aOnly', 'bOnly']).filter((k) => totalCohortN[k] < minimumCohort);
      if (deficient.length) { reject({ id, source: a, target: b, reason: 'insufficient-single-cohort', reasonCode: 'INSUFFICIENT_SINGLE', deficientCohorts: deficient, cohortN: totalCohortN, threshold: minimumCohort }); continue; }
      if (totalCohortN.neither < minimumCohort) { reject({ id, source: a, target: b, reason: 'insufficient-neither-cohort', reasonCode: 'INSUFFICIENT_NEITHER', cohortN: totalCohortN, threshold: minimumCohort }); continue; }
      if (totalN < minimumEffectiveN) { reject({ id, source: a, target: b, reason: 'insufficient-effective-n', reasonCode: 'INSUFFICIENT_N', cohortN: totalCohortN, threshold: minimumEffectiveN }); continue; }
      const result = stratifiedInteractionEstimate(stratumCohorts, { stratumKeys });
      if (!result.estimatorSucceeded) {
        reject({ id, source: a, target: b, reason: 'model-failure', reasonCode: result.failureReason, cohortN: totalCohortN, excludedStrata: result.excludedStrata, strataAttempted: result.strataAttempted });
        continue;
      }
      const rate = (/** @type {'neither' | 'aOnly' | 'bOnly' | 'both'} */ k) => (totalCohortN[k] > 0 ? wins[k] / totalCohortN[k] : 0);
      const marginalInteractionPP = rate('both') - rate('aOnly') - rate('bOnly') + rate('neither');
      const shrink = shrinkLogOddsRatio(/** @type {number} */ (result.logEstimate), result.contributingN);
      const modelDirection = sign(result.logEstimate), marginalDirection = sign(marginalInteractionPP);
      raw.push({
        id, source: a, target: b, displayName: `${a} × ${b}`, direction: 'bidirectional',
        estimand: 'odds-ratio-interaction',
        modelOR: result.estimate, logOR: result.logEstimate, modelDirection,
        marginalInteractionPP, marginalDirection, directionAgreement: modelDirection === marginalDirection,
        relationshipClass: modelDirection === 'positive' ? 'synergy' : modelDirection === 'negative' ? 'anti-synergy' : 'neutral',
        relationshipClassBasis: 'model-log-odds',
        // Backward-compatible aliases (same values as the explicit fields above).
        effect: result.estimate, logEstimate: result.logEstimate, rawEffect: marginalInteractionPP, marginalInteraction: marginalInteractionPP,
        shrunkLogOR: shrink.shrunkLogOR, shrunkOR: shrink.shrunkOR, shrunkEffect: shrink.shrunkOR, shrinkageFactor: shrink.shrinkageFactor,
        rankStrength: Math.abs(/** @type {number} */ (shrink.shrunkLogOR)),
        confidenceInterval: result.interval, standardError: result.standardError, pValue: result.pValue,
        cohortN: totalCohortN, neitherN: totalCohortN.neither, aOnlyN: totalCohortN.aOnly, bOnlyN: totalCohortN.bOnly, bothN: totalCohortN.both,
        contributingCohortN: result.contributingCohortN,
        cohortBalance: cohortBalanceRatio(result.contributingCohortN),
        eligibleN: result.eligibleN, contributingN: result.contributingN, excludedN: result.excludedN, effectiveN: result.effectiveN,
        strataAttempted: result.strataAttempted, strataContributing: result.strataContributing, strataExcluded: result.strataExcluded,
        excludedStrata: result.excludedStrata, strataCount: result.strataCount,
        separation: result.separation, anyStratumSeparated: result.anyStratumSeparated, separatedStrata: result.separatedStrata,
        emptyCohortStrata: result.emptyCohortStrata, separationAffectedEstimate: result.separationAffectedEstimate,
        jointOpportunityCount: totalCohortN.both, baselineCount: totalCohortN.aOnly + totalCohortN.bOnly, sampleSize: totalN,
      });
    }
  }
  const minimum = Math.min(minimumBoth, minimumEffectiveN);
  const results = /** @type {Array<Record<string, any>> & { diagnostics?: Array<Record<string, any>>, candidateSet?: Record<string, any> }} */ (benjaminiHochberg(raw).map((item) => {
    const graded = evidenceGradeDetailed({
      scale: 'odds-ratio', sampleSize: item.effectiveN, effectiveN: item.effectiveN, interval: item.confidenceInterval,
      qValue: item.qValue, minimum, effectSize: item.modelOR, cohortBalance: item.cohortBalance,
    });
    if (item.separationAffectedEstimate) graded.reasons.push({ code: 'PARTIAL_SEPARATION', detail: `${item.separatedStrata} stratum/strata with outcome separation excluded from the pooled estimate` });
    const significant = item.qValue != null && item.qValue <= 0.1 && (item.confidenceInterval[0] > 1 || item.confidenceInterval[1] < 1);
    const status = significant ? (item.modelDirection === 'positive' ? 'positive' : 'negative') : 'inconclusive';
    const both = (/** @type {Record<string, any>} */ row) => (row.mechanicCounts?.[item.source] ?? 0) > 0 && (row.mechanicCounts?.[item.target] ?? 0) > 0;
    const row = {
      ...item, modelStatus: 'modeled', status,
      evidenceGrade: graded.grade, evidenceReasons: graded.reasons, evidenceScale: graded.scale,
      evidenceGradeLegacy: LEGACY_GRADE_MAP[graded.grade],
      replayRefs: representativeMatches(units, both),
      counterexampleRefs: representativeMatches(units, (r) => both(r) && unitDecisive(r) && unitWon(r) === 0, 2),
      formulaHash,
      limitations: [
        'Interaction is the A×B odds ratio of a stratified logistic model (direction from log OR) — association, not causation.',
        `Four cohorts: Neither=${item.neitherN}, A-only=${item.aOnlyN}, B-only=${item.bOnlyN}, Both=${item.bothN}; ${item.contributingN} of ${item.eligibleN} observations in ${item.strataContributing}/${item.strataAttempted} contributing strata.`,
        item.strataExcluded ? `${item.strataExcluded} stratum/strata excluded (${item.emptyCohortStrata} empty cohort, ${item.separatedStrata} outcome separation); excluded strata contribute nothing to the estimate or its N.` : null,
        item.directionAgreement ? null : `Unstratified probability contrast (${(item.marginalInteractionPP * 100).toFixed(1)} pp) points the other way from the modeled odds ratio.`,
        'Low-frequency pairs are suppressed by minimum cohort thresholds.',
      ].filter(Boolean),
    };
    return { ...row, cellStatus: synergyCellStatus(row) };
  }).sort((a, b) => b.rankStrength - a.rankStrength || a.id.localeCompare(b.id)));
  if (includeDiagnostics) results.diagnostics = diagnostics;
  results.candidateSet = { mechanics, maxMechanics, excludedTags: candidateExclusions, unevaluatedPairStatus: 'NOT_EVALUATED', pairCount: (mechanics.length * (mechanics.length - 1)) / 2 };
  return results;
}

/**
 * BH over the valid inferential family only, then grade every row; the
 * legacy grade is a pure mapping of the modern grade.
 * @param {Array<Record<string, any>>} rows @param {{ aliasOf?: Record<string, string> }} relations
 */
export function gradeMechanicRows(rows, relations) {
  for (const row of rows) {
    const aliasOf = relations?.aliasOf?.[row.mechanic] ?? null;
    row.aliasOf = aliasOf;
    row.inferential = mechanicInferentialEligibility(row, aliasOf);
  }
  const q = new Map(benjaminiHochberg(rows.filter((r) => r.inferential.eligible), { idKey: 'mechanic' }).map((r) => [r.mechanic, r.qValue]));
  for (const row of rows) {
    const qValue = q.get(row.mechanic) ?? null;
    const decisiveN = row.rawWinAssociationStatus?.status === 'available' ? row.rawWinAssociationStatus.sampleSize : 0;
    const graded = row.inferential.eligible
      ? evidenceGradeDetailed({ scale: 'difference', sampleSize: decisiveN, effectiveN: decisiveN, interval: row.rawWinAssociation95, qValue, minimum: 20, effectSize: row.rawWinAssociation })
      : { grade: /** @type {const} */ ('INSUFFICIENT'), reasons: [{ code: row.inferential.reasonCode, detail: row.inferential.detail }] };
    row.associationQValue = qValue;
    row.evidenceGrade = graded.grade;
    row.evidenceReasons = graded.reasons;
    row.evidenceGradeLegacy = LEGACY_GRADE_MAP[graded.grade];
  }
  return rows;
}

/**
 * Cross-policy superiority record: point estimate and Wilson CI share the
 * decisive-games denominator; all-games rate is a separate labeled metric.
 * @param {{ games: number, selfPlayGames: number, crossPolicyWins: number, crossPolicyLosses: number, crossPolicyDraws: number, crossPolicyAborts: number }} x
 */
export function policyRecord(x) {
  return { ...winRateRecord({ wins: x.crossPolicyWins, losses: x.crossPolicyLosses, draws: x.crossPolicyDraws, aborts: x.crossPolicyAborts }),
    games: x.games, selfPlayGames: x.selfPlayGames, crossPolicyGames: x.games - x.selfPlayGames };
}
