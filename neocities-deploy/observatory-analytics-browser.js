// Browser-safe Observatory Analytics Builders — v0.21.0
// Browser port of the observatory analytics builders from
// packages/analytics/src/analytics.mjs:
//   buildMechanicsAtlas, analyzeSynergies, mineCausalMotifs,
//   buildPolicyFingerprints, detectAnomalies
// plus the pure-math statistics helpers they depend on (browser-safe ports of
// @intrilex/statistics). This module is self-contained: it imports only the
// mechanic registry (./mechanic-registry-browser.js) and the browser engine
// hash shim (./engine/browser-entry.js), avoiding circular imports.
//
// Formula hashes are computed with sha256Text against the same canonical
// formula strings used by browser-analytics.js METRIC_REGISTRY so that
// observatory output stays hash-consistent across the browser bundle.

import { sha256Text } from './engine/browser-entry.js';
import {
  MECHANIC_REGISTRY,
  mechanicDisplayName,
  mechanicCategory,
  isExcludedFromDiscovery,
  classifyTagDimension,
  analyticsEntityDefinition,
  synergyExcludedTags,
  areTagsInseparable,
} from './mechanic-registry-browser.js';

// ── Pure-math statistics helpers (browser ports of @intrilex/statistics) ──

function wilsonInterval(successes, total, z = 1.959963984540054) {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total < 0 || successes > total) throw new TypeError('Invalid binomial counts');
  if (total === 0) return [0, 0];
  const p = successes / total, z2 = z * z, denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function quantile(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const pos = (clean.length - 1) * q;
  const low = Math.floor(pos), high = Math.ceil(pos);
  if (low === high) return clean[low];
  return clean[low] * (high - pos) + clean[high] * (pos - low);
}

function summarizeNumbers(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length === 0) return { count: 0, mean: null, median: null, min: null, max: null, p05: null, p25: null, p75: null, p95: null, standardDeviation: null };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance = clean.length > 1 ? clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1) : 0;
  return {
    count: clean.length, mean, median: quantile(clean, 0.5), min: clean[0], max: clean.at(-1),
    p05: quantile(clean, 0.05), p25: quantile(clean, 0.25), p75: quantile(clean, 0.75), p95: quantile(clean, 0.95),
    standardDeviation: Math.sqrt(variance)
  };
}

function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z));
  return 0.5 * (1 + erf);
}

function binomialCoefficient(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
  return result;
}

function chiSquarePValue(statistic, df) {
  if (df === 1) return 2 * (1 - normalCdf(Math.sqrt(statistic)));
  const x = statistic / 2, a = df / 2;
  let sum = 1, term = 1;
  for (let i = 1; i < 200; i += 1) { term *= x / (a + i - 1); sum += term; if (Math.abs(term) < 1e-12) break; }
  const lower = Math.pow(x, a) * Math.exp(-x) * sum / gammaFn(a);
  return Math.max(0, Math.min(1, 1 - lower));
}

function gammaFn(z) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i += 1) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function seedFrom(seed) {
  const h = sha256Text(String(seed));
  return parseInt(h.slice(0, 8), 16);
}

function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function mcnemarPairedTest(pairs) {
  let b = 0, c = 0, seat1Always = 0, seat2Always = 0;
  for (const p of pairs) {
    if (!p) continue;
    const aWonSeat1 = Boolean(p.aSeat1Win), bWonSeat1 = Boolean(p.bSeat1Win);
    const aWonSeat2 = Boolean(p.aSeat2Win), bWonSeat2 = Boolean(p.bSeat2Win);
    if (aWonSeat1 && aWonSeat2) b += 1;
    else if (bWonSeat1 && bWonSeat2) c += 1;
    else if (aWonSeat1 && bWonSeat1) seat1Always += 1;
    else if (bWonSeat2 && aWonSeat2) seat2Always += 1;
  }
  const discordant = b + c;
  if (discordant === 0) return { b: 0, c: 0, estimate: 0, standardError: null, statistic: 0, pValue: 1, method: 'no-discordant-pairs', sampleSize: pairs.length, discordantPairs: 0, effect: 'policy-advantage', seatEffectConcordant: { seat1AlwaysWins: seat1Always, seat2AlwaysWins: seat2Always } };
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

export function pairedBootstrapABBA(pairs, { iterations = 2000, seed = 'intrilex-abba-paired', alpha = 0.05 } = {}) {
  if (!pairs.length) return { estimate: null, interval: [null, null], iterations: 0, seed: String(seed), sampleSize: 0 };
  const random = rng(seedFrom(seed));
  const estimate = (sample) => {
    let aWins = 0, bWins = 0, total = 0;
    for (const p of sample) { if (!p) continue; if (p.aSeat1Win) aWins += 1; if (p.aSeat2Win) aWins += 1; if (p.bSeat1Win) bWins += 1; if (p.bSeat2Win) bWins += 1; total += 2; }
    return total > 0 ? (aWins - bWins) / total : null;
  };
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const sample = [];
    for (let j = 0; j < pairs.length; j += 1) sample.push(pairs[Math.floor(random() * pairs.length)]);
    const value = estimate(sample);
    if (Number.isFinite(value)) samples.push(value);
  }
  return { estimate: estimate(pairs), interval: [quantile(samples, alpha / 2), quantile(samples, 1 - alpha / 2)], iterations: samples.length, seed: String(seed), sampleSize: pairs.length };
}

function differenceInProportions(aSuccess, aTotal, bSuccess, bTotal) {
  if (!aTotal || !bTotal) return { estimate: null, standardError: null, pValue: null, interval: [null, null] };
  const pa = aSuccess / aTotal, pb = bSuccess / bTotal, estimate = pa - pb;
  const se = Math.sqrt((pa * (1 - pa)) / aTotal + (pb * (1 - pb)) / bTotal);
  const z = se ? estimate / se : 0;
  return { estimate, standardError: se, pValue: 2 * (1 - normalCdf(Math.abs(z))), interval: [estimate - 1.959963984540054 * se, estimate + 1.959963984540054 * se] };
}

function empiricalBayesShrinkage(estimate, sampleSize, { priorMean = 0, priorStrength = 25 } = {}) {
  if (!Number.isFinite(estimate) || sampleSize <= 0) return null;
  return (estimate * sampleSize + priorMean * priorStrength) / (sampleSize + priorStrength);
}

function evidenceGrade({ sampleSize, interval, qValue, minimum = 20, effectSize = null, cohortBalance = null, effectiveN = null, pairedCoverage = null } = {}) {
  const n = Number.isFinite(effectiveN) ? effectiveN : sampleSize;
  if (!Number.isFinite(n) || n < minimum) return 'INSUFFICIENT';
  if (!Array.isArray(interval) || !interval.every(Number.isFinite)) return 'INSUFFICIENT';
  const excludesZero = interval[0] > 0 || interval[1] < 0;
  const width = Math.abs(interval[1] - interval[0]);
  const q = qValue == null ? 1 : qValue;
  const hasEffect = Number.isFinite(effectSize) ? Math.abs(effectSize) >= 0.02 : excludesZero;
  const balanced = Number.isFinite(cohortBalance) ? cohortBalance >= 0.2 : true;
  const paired = Number.isFinite(pairedCoverage) ? pairedCoverage >= 0.5 : true;
  if (!excludesZero || !hasEffect) return 'INSUFFICIENT';
  if (n >= 500 && q <= 0.05 && width <= 0.15 && balanced && paired) return 'ROBUST';
  if (n >= 100 && q <= 0.10 && width <= 0.25 && balanced) return 'SUPPORTED';
  if (n >= minimum && q <= 0.20) return 'EXPLORATORY';
  return 'INSUFFICIENT';
}

function evidenceGradeLegacy({ sampleSize, interval, qValue, minimum = 20 } = {}) {
  const grade = evidenceGrade({ sampleSize, interval, qValue, minimum });
  return { INSUFFICIENT: 'insufficient', EXPLORATORY: 'weak', SUPPORTED: 'moderate', ROBUST: 'strong' }[grade] ?? 'insufficient';
}

function logisticInteractionEstimate(cohorts) {
  const { neither, aOnly, bOnly, both } = cohorts;
  const n00 = neither.wins + neither.losses, n10 = aOnly.wins + aOnly.losses;
  const n01 = bOnly.wins + bOnly.losses, n11 = both.wins + both.losses;
  const cohortN = { neither: n00, aOnly: n10, bOnly: n01, both: n11 };
  if (n00 === 0 || n10 === 0 || n01 === 0 || n11 === 0) return { estimate: null, logEstimate: null, standardError: null, pValue: null, interval: [null, null], separation: true, cohortN };
  const p00 = neither.wins / n00, p10 = aOnly.wins / n10, p01 = bOnly.wins / n01, p11 = both.wins / n11;
  if ([p00, p10, p01, p11].some((p) => p === 0 || p === 1)) {
    const corrected = { neither: { wins: neither.wins + 0.5, losses: neither.losses + 0.5 }, aOnly: { wins: aOnly.wins + 0.5, losses: aOnly.losses + 0.5 }, bOnly: { wins: bOnly.wins + 0.5, losses: bOnly.losses + 0.5 }, both: { wins: both.wins + 0.5, losses: both.losses + 0.5 } };
    const r = logisticInteractionEstimate(corrected); return { ...r, separation: true };
  }
  const lo00 = Math.log(p00 / (1 - p00)), lo10 = Math.log(p10 / (1 - p10));
  const lo01 = Math.log(p01 / (1 - p01)), lo11 = Math.log(p11 / (1 - p11));
  const logEstimate = lo11 - lo10 - lo01 + lo00;
  const variance = 1 / (n00 * p00 * (1 - p00)) + 1 / (n10 * p10 * (1 - p10)) + 1 / (n01 * p01 * (1 - p01)) + 1 / (n11 * p11 * (1 - p11));
  const standardError = Math.sqrt(variance);
  const z = standardError > 0 ? logEstimate / standardError : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const z95 = 1.959963984540054;
  return { estimate: Math.exp(logEstimate), logEstimate, standardError, pValue, interval: [Math.exp(logEstimate - z95 * standardError), Math.exp(logEstimate + z95 * standardError)], separation: false, cohortN };
}

function stratifiedInteractionEstimate(strata) {
  let pooledLog = 0, pooledVarianceInv = 0, separation = false;
  const totalCohortN = { neither: 0, aOnly: 0, bOnly: 0, both: 0 };
  let validStrata = 0;
  for (const stratum of strata) {
    const r = logisticInteractionEstimate(stratum);
    totalCohortN.neither += r.cohortN.neither; totalCohortN.aOnly += r.cohortN.aOnly;
    totalCohortN.bOnly += r.cohortN.bOnly; totalCohortN.both += r.cohortN.both;
    if (r.separation || !Number.isFinite(r.logEstimate) || !Number.isFinite(r.standardError) || r.standardError === 0) { separation = separation || r.separation; continue; }
    const w = 1 / (r.standardError * r.standardError);
    pooledLog += r.logEstimate * w; pooledVarianceInv += w; validStrata += 1;
  }
  if (pooledVarianceInv === 0 || validStrata === 0) return { estimate: null, logEstimate: null, standardError: null, pValue: null, interval: [null, null], separation: true, strataCount: strata.length, totalCohortN, effectiveN: 0 };
  const logEstimate = pooledLog / pooledVarianceInv;
  const standardError = Math.sqrt(1 / pooledVarianceInv);
  const z = standardError > 0 ? logEstimate / standardError : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const z95 = 1.959963984540054;
  const effectiveN = totalCohortN.neither + totalCohortN.aOnly + totalCohortN.bOnly + totalCohortN.both;
  return { estimate: Math.exp(logEstimate), logEstimate, standardError, pValue, interval: [Math.exp(logEstimate - z95 * standardError), Math.exp(logEstimate + z95 * standardError)], separation: false, strataCount: validStrata, totalCohortN, effectiveN };
}

function cohortBalanceRatio(cohortN) {
  const sizes = Object.values(cohortN).filter((n) => n > 0);
  if (sizes.length < 2) return 0;
  return Math.min(...sizes) / Math.max(...sizes);
}

function benjaminiHochberg(items, { pKey = 'pValue', idKey = 'id' } = {}) {
  const valid = items.filter((item) => Number.isFinite(item[pKey])).map((item) => ({ ...item })).sort((a, b) => a[pKey] - b[pKey] || String(a[idKey]).localeCompare(String(b[idKey])));
  const m = valid.length;
  let running = 1;
  for (let i = m - 1; i >= 0; i -= 1) {
    const raw = (valid[i][pKey] * m) / (i + 1);
    running = Math.min(running, raw);
    valid[i].qValue = Math.min(1, running);
  }
  const byId = new Map(valid.map((item) => [item[idKey], item.qValue]));
  return items.map((item) => ({ ...item, qValue: byId.get(item[idKey]) ?? null }));
}

// ── Formula-hash helpers (hash-consistent with browser-analytics.js METRIC_REGISTRY) ──

const METRIC_FORMULAS = {
  'immediate-point-impact': 'sum secured point delta in declaration state transition / declarations',
  'synergy-interaction': 'stratified joint outcome rate - mean stratified component-only outcome rate',
};
const _formulaHashCache = {};
function metricFormulaHash(metricId) {
  if (!_formulaHashCache[metricId]) _formulaHashCache[metricId] = sha256Text(String(METRIC_FORMULAS[metricId] ?? ''));
  return _formulaHashCache[metricId];
}

// ── Internal helpers ──

const increment = (record, key, amount = 1) => { record[key] = (record[key] ?? 0) + amount; };
const sortedRecord = (record) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
const decisive = (row) => row.terminationReason !== 'CANONICAL_DRAW' && row.winner !== 'DRAW' && row.winner !== 'ABORTED';
const seat1Won = (row) => decisive(row) && row.winningSeat === 1 ? 1 : 0;

function analysisUnits(summaries, { primary = false } = {}) {
  const units = [];
  for (const row of summaries) {
    if (Array.isArray(row.participants) && row.participants.length > 0) {
      for (const participant of row.participants) {
        units.push({
          matchId: row.matchId,
          matchResultHash: row.matchResultHash,
          profileId: row.profileId,
          policyId: participant.policyId,
          seat: participant.seat,
          result: participant.result,
          mechanicCounts: primary
            ? (participant.primaryMechanicCounts ?? participant.mechanicCounts ?? {})
            : (participant.mechanicCounts ?? {}),
          mechanicOpportunityCounts: primary
            ? (participant.primaryMechanicOpportunityCounts ?? participant.mechanicOpportunityCounts ?? {})
            : (participant.mechanicOpportunityCounts ?? {}),
          pairedRunId: row.pairedRunId ?? null,
          seatSwapped: row.seatSwapped ?? false,
          matchLength: row.completedFullTurns ?? null,
          _decisive: participant.result === 'win' || participant.result === 'loss',
          _won: participant.result === 'win' ? 1 : 0,
          _stratum: `${row.profileId}|${participant.policyId}|seat:${participant.seat}`
        });
      }
    } else {
      units.push({
        ...row,
        mechanicCounts: primary ? (row.primaryMechanicCounts ?? row.mechanicCounts ?? {}) : (row.mechanicCounts ?? {}),
        mechanicOpportunityCounts: primary ? (row.primaryMechanicOpportunityCounts ?? row.mechanicOpportunityCounts ?? {}) : (row.mechanicOpportunityCounts ?? {}),
        _decisive: decisive(row),
        _won: seat1Won(row),
        _stratum: `${row.profileId}|${(row.policyIds ?? []).join('>')}|${(row.seatOrder ?? []).join('>')}`
      });
    }
  }
  return units;
}
const unitDecisive = (row) => row._decisive === true;
const unitWon = (row) => unitDecisive(row) ? Number(row._won ?? 0) : 0;

function representativeMatches(rows, predicate, limit = 4) {
  const selected = [...new Map(
    rows.filter(predicate)
      .sort((a,b) => String(a.matchResultHash ?? a.matchId).localeCompare(String(b.matchResultHash ?? b.matchId)))
      .map((row) => [row.matchId, row])
  ).values()];
  if (!selected.length) return [];
  const indexes = [...new Set([0, Math.floor((selected.length-1)/2), selected.length-1, Math.floor((selected.length-1)*0.75)])].slice(0,limit);
  return indexes.map((index)=>selected[index].matchId);
}

// ── Mechanics Atlas ──

export function buildMechanicsAtlas(summaries, detailedMatches = []) {
  const units = analysisUnits(summaries);
  const usageUnit = units.length > summaries.length ? 'participant' : 'match';
  const mechanicNames = [...new Set(units.flatMap((row) => Object.keys(row.mechanicCounts ?? {})))].sort();
  const factsByMechanic = {};
  for (const match of detailedMatches) {
    const decisionFactMap = new Map((match.facts?.decisionFacts ?? []).map((df) => [df.factId, df]));
    for (const resolution of match.facts?.resolutionFacts ?? []) {
      for (const mechanic of resolution.mechanicTags ?? []) {
        factsByMechanic[mechanic] ??= [];
        const delta = (match.facts.stateDeltaFacts ?? []).find((item) => item.factId === resolution.stateDeltaId);
        const decisionFact = decisionFactMap.get(resolution.declarationFactId);
        const actorId = decisionFact?.actorId ?? null;
        const actorDelta = actorId && delta?.securedPointDeltaByPlayer ? Number(delta.securedPointDeltaByPlayer[actorId] ?? 0) : null;
        factsByMechanic[mechanic].push({ matchId: match.summary.matchId, resolution, delta, actorId, actorDelta });
      }
    }
  }
  return mechanicNames.map((mechanic) => {
    const used = units.filter((row) => Number(row.mechanicCounts?.[mechanic] ?? 0) > 0);
    const notUsed = units.filter((row) => Number(row.mechanicCounts?.[mechanic] ?? 0) === 0);
    const usedDecisive = used.filter(unitDecisive), unusedDecisive = notUsed.filter(unitDecisive);
    const usedWins = usedDecisive.reduce((sum,row)=>sum+unitWon(row),0), unusedWins=unusedDecisive.reduce((sum,row)=>sum+unitWon(row),0);
    const association = differenceInProportions(usedWins,usedDecisive.length,unusedWins,unusedDecisive.length);
    const adjustedAssociation = stratifiedWinAssociation(units, mechanic);
    const facts = factsByMechanic[mechanic] ?? [];
    const actorPointDeltas = facts.map((f) => f.actorDelta).filter((v) => v != null && Number.isFinite(v));
    const legacyPointDeltas = facts.map(({delta})=>Object.values(delta?.securedPointDeltaByPlayer ?? {}).reduce((a,b)=>a+b,0));
    const selectionCount = used.reduce((sum,row)=>sum+Number(row.mechanicCounts?.[mechanic]??0),0);
    const sampleSize = used.length;
    const legalOpportunityCount = units.reduce((sum, row) => sum + Number(row.mechanicOpportunityCounts?.[mechanic] ?? 0), 0);
    const hasOpportunityData = legalOpportunityCount > 0;
    const pickRateWhenLegal = hasOpportunityData ? selectionCount / legalOpportunityCount : null;
    const usedMatchIds = new Set(used.map((row) => row.matchId));
    const matchPrevalence = summaries.length > 0 ? usedMatchIds.size / summaries.length : 0;
    const matchPrevalenceWilson95 = wilsonInterval(usedMatchIds.size, summaries.length);
    const participantPrevalence = units.length > 0 ? used.length / units.length : 0;
    const participantPrevalenceWilson95 = wilsonInterval(used.length, units.length);
    const selectionFrequency = units.length > 0 ? selectionCount / units.length : 0;
    const registryEntry = MECHANIC_REGISTRY[mechanic];
    const dimension = classifyTagDimension(mechanic);
    const entityDef = analyticsEntityDefinition(mechanic);
    const evidenceV2 = evidenceGrade({ sampleSize, interval: association.interval, qValue: null, minimum: 20, effectSize: association.estimate, effectiveN: sampleSize });
    return {
      metricId:`mechanic:${mechanic}`, mechanic, displayName:mechanicDisplayName(mechanic), category:mechanicCategory(mechanic),
      dimension, entityDescription: entityDef.description,
      registryVerified: Boolean(registryEntry), quarantined: !registryEntry && !isExcludedFromDiscovery(mechanic),
      selectionCount, legalOpportunityCount, hasOpportunityData, pickRateWhenLegal,
      pickRateStatus: hasOpportunityData
        ? (legalOpportunityCount > 0
          ? { status: 'available', value: pickRateWhenLegal, numerator: selectionCount, denominator: legalOpportunityCount }
          : { status: 'zero-opportunities', reasonCode: 'NO_LEGAL_OPPORTUNITIES', detail: 'Entity had zero legal opportunities in this campaign.' })
        : { status: 'missing-telemetry', reasonCode: 'MISSING_OPPORTUNITY_TELEMETRY', detail: 'Opportunity telemetry not recorded for this campaign.' },
      matchOpportunityCount:summaries.length,
      analysisUnitOpportunityCount:units.length, usageUnit,
      participantPrevalence, participantPrevalenceWilson95,
      matchPrevalence, matchPrevalenceWilson95, selectionFrequency,
      matchUsageRate: participantPrevalence, matchUsageWilson95: participantPrevalenceWilson95,
      actorPointImpact: actorPointDeltas.length ? summarizeNumbers(actorPointDeltas) : null,
      pointImpactStatus: actorPointDeltas.length > 0
        ? { status: 'available', sampleSize: actorPointDeltas.length }
        : (facts.length > 0
          ? { status: 'available', value: 0, sampleSize: 0, reasonCode: 'NO_ACTOR_DELTA', detail: 'No actor-perspective point deltas recorded.' }
          : { status: 'not-applicable', reasonCode: 'NO_RESOLUTION_FACTS', detail: 'No resolution facts for this entity.' }),
      immediatePointImpact: actorPointDeltas.length ? summarizeNumbers(actorPointDeltas) : (legacyPointDeltas.length ? summarizeNumbers(legacyPointDeltas) : null),
      rawWinAssociation: association.estimate, rawWinAssociation95: association.interval,
      rawWinAssociationStatus: usedDecisive.length >= 10 && unusedDecisive.length >= 10
        ? { status: 'available', sampleSize: usedDecisive.length + unusedDecisive.length }
        : { status: 'insufficient-sample', reasonCode: 'INSUFFICIENT_DECISIVE', detail: `Need ≥10 decisive in each cohort; got used=${usedDecisive.length}, unused=${unusedDecisive.length}.` },
      outcomeAssociation: association.estimate, outcomeAssociation95: association.interval, pValue: association.pValue,
      adjustedWinAssociation: adjustedAssociation.estimate, adjustedWinAssociation95: adjustedAssociation.interval,
      adjustedWinAssociationStatus: adjustedAssociation.estimate != null
        ? { status: 'available', sampleSize: usedDecisive.length + unusedDecisive.length }
        : { status: 'model-failed', reasonCode: 'STRATIFIED_ESTIMATOR_FAILED', detail: 'Stratified estimator could not produce a finite estimate.' },
      sampleSize, evidenceGrade: evidenceV2,
      evidenceGradeLegacy: evidenceGradeLegacy({sampleSize, interval: association.interval, qValue: null, minimum: 20}),
      status:sampleSize?'measured':'not-observable', replayRefs:representativeMatches(units,row=>Number(row.mechanicCounts?.[mechanic]??0)>0),
      counterexampleRefs:representativeMatches(units,row=>Number(row.mechanicCounts?.[mechanic]??0)>0 && unitDecisive(row) && unitWon(row)===0,2),
      formulaHash:metricFormulaHash('immediate-point-impact'),
      outcomeFormulaHash:metricFormulaHash('synergy-interaction'),
      limitations:[
        `Participant prevalence uses ${usageUnit}-level observations and is policy-, seat-, and profile-conditioned.`,
        hasOpportunityData ? 'Pick rate when legal uses opportunity telemetry from the legality boundary.' : 'Opportunity-level pick rate is N/A — legal opportunity telemetry not available for this campaign.',
        'Win association is an observational association, not causal proof.',
      ]
    };
  });
}

function stratifiedWinAssociation(units, mechanic) {
  const strata = new Map();
  for (const row of units.filter(unitDecisive)) {
    const key = stratumKey(row);
    if (!strata.has(key)) strata.set(key, { used: [], unused: [] });
    const group = strata.get(key);
    if (Number(row.mechanicCounts?.[mechanic] ?? 0) > 0) group.used.push(row);
    else group.unused.push(row);
  }
  let pooledDiff = 0, pooledWeight = 0;
  for (const group of strata.values()) {
    if (!group.used.length || !group.unused.length) continue;
    const usedWins = group.used.reduce((s, r) => s + unitWon(r), 0);
    const unusedWins = group.unused.reduce((s, r) => s + unitWon(r), 0);
    const p1 = usedWins / group.used.length, p0 = unusedWins / group.unused.length;
    const diff = p1 - p0;
    const v = (p1 * (1 - p1)) / group.used.length + (p0 * (1 - p0)) / group.unused.length;
    if (v > 0) { const w = 1 / v; pooledDiff += diff * w; pooledWeight += w; }
  }
  if (pooledWeight === 0) return { estimate: null, interval: [null, null] };
  const estimate = pooledDiff / pooledWeight;
  const se = Math.sqrt(1 / pooledWeight);
  const z95 = 1.959963984540054;
  return { estimate, interval: [estimate - z95 * se, estimate + z95 * se] };
}

// ── Synergies ──

function stratumKey(row) { return row._stratum ?? `${row.profileId}|${(row.policyIds ?? []).join('>')}|${(row.seatOrder ?? []).join('>')}`; }

function fourCohortInteraction(group, a, b) {
  const neither = { wins: 0, losses: 0 }, aOnly = { wins: 0, losses: 0 };
  const bOnly = { wins: 0, losses: 0 }, both = { wins: 0, losses: 0 };
  for (const row of group) {
    if (!unitDecisive(row)) continue;
    const hasA = Number(row.mechanicCounts?.[a] ?? 0) > 0;
    const hasB = Number(row.mechanicCounts?.[b] ?? 0) > 0;
    const won = unitWon(row) === 1;
    if (hasA && hasB) { if (won) both.wins += 1; else both.losses += 1; }
    else if (hasA) { if (won) aOnly.wins += 1; else aOnly.losses += 1; }
    else if (hasB) { if (won) bOnly.wins += 1; else bOnly.losses += 1; }
    else { if (won) neither.wins += 1; else neither.losses += 1; }
  }
  return { neither, aOnly, bOnly, both };
}

const SYNERGY_EXCLUDED_MECHANICS = new Set([
  'draw','discard','recycle','rummage','exhausted','goal','trigger',
  'ACTION','SETUP','INSTANT','QUICK','INTERRUPT',
  'phase','enter-action','points','ordinary','top','decline','response-decline','private-choice','forced-mini-turn',
  'instant','quick','interrupt','score','exhausted-pass','♣','♦','♥','♠'
]);

export function analyzeSynergies(summaries, {
  minimumBoth = 20, minimumCohort = 10, minimumEffectiveN = 50, maxMechanics = 24, includeDiagnostics = false,
} = {}) {
  const units = analysisUnits(summaries, { primary: true });
  const excludedTags = synergyExcludedTags();
  const mechanics = [...new Set(units.flatMap((row) => Object.keys(row.mechanicCounts ?? {})))]
    .sort((a, b) => {
      const ca = units.reduce((s, r) => s + Number(r.mechanicCounts?.[a] ?? 0), 0);
      const cb = units.reduce((s, r) => s + Number(r.mechanicCounts?.[b] ?? 0), 0);
      return cb - ca || a.localeCompare(b);
    })
    .filter((m) => !excludedTags.has(m))
    .slice(0, maxMechanics);
  const strataMap = new Map();
  for (const row of units.filter(unitDecisive)) {
    const key = stratumKey(row);
    if (!strataMap.has(key)) strataMap.set(key, []);
    strataMap.get(key).push(row);
  }
  const strata = [...strataMap.values()];
  const raw = [];
  const diagnostics = [];
  for (let i = 0; i < mechanics.length; i++) {
    for (let j = i + 1; j < mechanics.length; j++) {
      const a = mechanics[i], b = mechanics[j];
      if (areTagsInseparable(a, b)) {
        if (includeDiagnostics) diagnostics.push({ id: `${a}::${b}`, source: a, target: b, status: 'rejected', reason: 'inseparable-tags', reasonCode: 'PARENT_CHILD_OR_ALIAS', cohortN: null });
        continue;
      }
      const stratumCohorts = strata.map((group) => fourCohortInteraction(group, a, b));
      const totalCohortN = { neither: 0, aOnly: 0, bOnly: 0, both: 0 };
      for (const sc of stratumCohorts) {
        totalCohortN.neither += sc.neither.wins + sc.neither.losses;
        totalCohortN.aOnly += sc.aOnly.wins + sc.aOnly.losses;
        totalCohortN.bOnly += sc.bOnly.wins + sc.bOnly.losses;
        totalCohortN.both += sc.both.wins + sc.both.losses;
      }
      const totalN = totalCohortN.neither + totalCohortN.aOnly + totalCohortN.bOnly + totalCohortN.both;
      if (totalCohortN.both < minimumBoth) {
        if (includeDiagnostics) diagnostics.push({ id: `${a}::${b}`, source: a, target: b, status: 'rejected', reason: 'insufficient-both-cohort', reasonCode: 'INSUFFICIENT_BOTH', cohortN: totalCohortN, threshold: minimumBoth });
        continue;
      }
      if (totalCohortN.aOnly < minimumCohort || totalCohortN.bOnly < minimumCohort) {
        if (includeDiagnostics) diagnostics.push({ id: `${a}::${b}`, source: a, target: b, status: 'rejected', reason: 'insufficient-single-cohort', reasonCode: 'INSUFFICIENT_SINGLE', cohortN: totalCohortN, threshold: minimumCohort });
        continue;
      }
      if (totalN < minimumEffectiveN) {
        if (includeDiagnostics) diagnostics.push({ id: `${a}::${b}`, source: a, target: b, status: 'rejected', reason: 'insufficient-effective-n', reasonCode: 'INSUFFICIENT_N', cohortN: totalCohortN, threshold: minimumEffectiveN });
        continue;
      }
      const result = stratifiedInteractionEstimate(stratumCohorts);
      if (!Number.isFinite(result.logEstimate)) {
        if (includeDiagnostics) diagnostics.push({ id: `${a}::${b}`, source: a, target: b, status: 'rejected', reason: 'model-failure', reasonCode: 'SINGULAR_MODEL', cohortN: totalCohortN });
        continue;
      }
      const balance = cohortBalanceRatio(totalCohortN);
      const p00 = totalCohortN.neither > 0 ? (stratumCohorts.reduce((s, sc) => s + sc.neither.wins, 0)) / totalCohortN.neither : 0;
      const p10 = totalCohortN.aOnly > 0 ? (stratumCohorts.reduce((s, sc) => s + sc.aOnly.wins, 0)) / totalCohortN.aOnly : 0;
      const p01 = totalCohortN.bOnly > 0 ? (stratumCohorts.reduce((s, sc) => s + sc.bOnly.wins, 0)) / totalCohortN.bOnly : 0;
      const p11 = totalCohortN.both > 0 ? (stratumCohorts.reduce((s, sc) => s + sc.both.wins, 0)) / totalCohortN.both : 0;
      const marginalInteraction = p11 - p10 - p01 + p00;
      raw.push({
        id: `${a}::${b}`, source: a, target: b, displayName: `${a} × ${b}`,
        relationshipClass: marginalInteraction >= 0 ? 'synergy' : 'anti-synergy',
        direction: 'bidirectional',
        effect: result.estimate, logEstimate: result.logEstimate,
        rawEffect: marginalInteraction, marginalInteraction,
        shrunkEffect: empiricalBayesShrinkage(result.estimate, result.effectiveN),
        confidenceInterval: result.interval, standardError: result.standardError,
        pValue: result.pValue, cohortN: totalCohortN,
        neitherN: totalCohortN.neither, aOnlyN: totalCohortN.aOnly,
        bOnlyN: totalCohortN.bOnly, bothN: totalCohortN.both,
        cohortBalance: balance, effectiveN: result.effectiveN,
        separation: result.separation, strataCount: result.strataCount,
        jointOpportunityCount: totalCohortN.both,
        baselineCount: totalCohortN.aOnly + totalCohortN.bOnly, sampleSize: totalN,
      });
    }
  }
  const results = benjaminiHochberg(raw).map((item) => {
    const evidenceV2 = evidenceGrade({
      sampleSize: item.effectiveN, interval: item.confidenceInterval, qValue: item.qValue,
      minimum: Math.min(minimumBoth, minimumEffectiveN), effectSize: item.marginalInteraction,
      cohortBalance: item.cohortBalance, effectiveN: item.effectiveN,
    });
    return {
      ...item,
      status: item.qValue <= 0.1 && (item.confidenceInterval[0] > 1 || item.confidenceInterval[1] < 1)
        ? (item.marginalInteraction > 0 ? 'positive' : 'negative') : 'inconclusive',
      evidenceGrade: evidenceV2,
      evidenceGradeLegacy: evidenceGradeLegacy({ sampleSize: item.effectiveN, interval: item.confidenceInterval, qValue: item.qValue, minimum: Math.min(minimumBoth, minimumEffectiveN) }),
      replayRefs: representativeMatches(units, (row) => (row.mechanicCounts?.[item.source] ?? 0) > 0 && (row.mechanicCounts?.[item.target] ?? 0) > 0),
      counterexampleRefs: representativeMatches(units, (row) => (row.mechanicCounts?.[item.source] ?? 0) > 0 && (row.mechanicCounts?.[item.target] ?? 0) > 0 && unitDecisive(row) && unitWon(row) === 0, 2),
      formulaHash: metricFormulaHash('synergy-interaction'),
      limitations: [
        'Interaction effect is the A×B odds-ratio from a stratified logistic model — association, not causation.',
        `Four cohorts: Neither=${item.neitherN}, A-only=${item.aOnlyN}, B-only=${item.bOnlyN}, Both=${item.bothN}.`,
        item.separation ? 'Perfect separation detected in some strata; continuity correction applied.' : null,
        'Low-frequency pairs are suppressed by minimum cohort thresholds.',
      ].filter(Boolean),
    };
  }).sort((a, b) => Math.abs(b.shrunkEffect) - Math.abs(a.shrunkEffect) || a.id.localeCompare(b.id));
  if (includeDiagnostics) results.diagnostics = diagnostics;
  return results;
}

// ── Causal Motifs ──

export function mineCausalMotifs(detailedMatches,{limit=60}={}){
  const motifs={};
  for(const match of detailedMatches){
    const resolutions=match.facts?.resolutionFacts??[];
    for(let i=0;i<resolutions.length-1;i++){
      const left=resolutions[i].mechanicTags?.[0]??'unclassified',right=resolutions[i+1].mechanicTags?.[0]??'unclassified';
      const key=`${left} → ${right}`; motifs[key]??={motif:key,count:0,matchIds:new Set(),outcomes:{}}; motifs[key].count+=1;motifs[key].matchIds.add(match.summary.matchId);increment(motifs[key].outcomes,match.summary.terminationReason);
    }
  }
  return Object.values(motifs).map(item=>({...item,matchIds:[...item.matchIds].sort(),outcomes:sortedRecord(item.outcomes)})).sort((a,b)=>b.count-a.count||a.motif.localeCompare(b.motif)).slice(0,limit);
}

// ── Policy Fingerprints ──

export function buildPolicyFingerprints(summaries){
  const byPolicy={};
  for(const row of summaries){
    const hasParticipants=Array.isArray(row.participants)&&row.participants.length===2;
    if(hasParticipants){
      for(const p of row.participants){
        byPolicy[p.policyId]??={policyId:p.policyId,games:0,wins:0,miniTurnActions:0,responsePlays:0,responseDeclines:0,privateChoices:0,advanced:0,ultras:0,voltage:0,turns:0};
        const x=byPolicy[p.policyId];x.games+=1;x.turns+=row.completedFullTurns;
        if(p.result==='win')x.wins+=1;
        x.miniTurnActions+=p.miniTurnActionCount??0;x.responsePlays+=p.responsePlayCount??0;x.responseDeclines+=p.responseDeclineCount??0;x.privateChoices+=p.privateChoiceDecisionCount??0;x.advanced+=p.advancedDecisionCount??0;x.ultras+=p.ultraDecisionCount??0;x.voltage+=p.voltageDecisionCount??0;
      }
    }else{
      for(const policyId of row.policyIds){
        byPolicy[policyId]??={policyId,games:0,wins:0,miniTurnActions:0,responsePlays:0,responseDeclines:0,privateChoices:0,advanced:0,ultras:0,voltage:0,turns:0};
        const x=byPolicy[policyId];x.games+=1;x.turns+=row.completedFullTurns;
        if(row.winner!=='DRAW'&&row.winner!=='ABORTED'&&row.policyIds[row.seatOrder.indexOf(row.winner)]===policyId)x.wins+=1;
        x.miniTurnActions+=row.miniTurnActionCount??0;x.responsePlays+=row.responsePlayedCount??0;x.responseDeclines+=row.responseDeclinedWithOptionsCount??0;x.privateChoices+=row.privateChoiceDecisionCount??0;x.advanced+=row.advancedDecisionCount??0;x.ultras+=row.ultraDecisionCount??0;x.voltage+=row.voltageDecisionCount??0;
      }
    }
  }
  return Object.values(byPolicy).map(x=>({
    ...x,winRate:x.games?x.wins/x.games:0,winWilson95:wilsonInterval(x.wins,Math.max(1,x.games)),
    fingerprint:{scoreAggression:x.games?x.miniTurnActions/x.games:0,responseUse:x.games?x.responsePlays/x.games:0,responseConservation:x.responsePlays+x.responseDeclines?x.responseDeclines/(x.responsePlays+x.responseDeclines):0,privateChoiceDensity:x.games?x.privateChoices/x.games:0,advancedFrequency:x.games?x.advanced/x.games:0,ultraFrequency:x.games?x.ultras/x.games:0,voltageFrequency:x.games?x.voltage/x.games:0,matchLength:x.games?x.turns/x.games:0}
  })).sort((a,b)=>a.policyId.localeCompare(b.policyId));
}

// ── Anomaly Detection ──

export function detectAnomalies(summaries,detailedMatches=[]){
  const turns=summarizeNumbers(summaries.map(row=>row.completedFullTurns));
  const threshold=turns.p95??Infinity;
  const anomalies=[];
  for(const row of summaries){
    if(row.completedFullTurns>=threshold)anomalies.push({type:'LONG_MATCH',severity:'warning',matchId:row.matchId,value:row.completedFullTurns,threshold});
    if(row.terminationReason==='UNSUPPORTED_CONFIGURATION'||row.terminationReason==='ENGINE_REJECTION')anomalies.push({type:row.terminationReason,severity:'critical',matchId:row.matchId,value:row.errorCode});
    if((row.automaticPriorityAdvanceCount??0)>Math.max(30,(row.responseOpportunityCount??0)*8))anomalies.push({type:'ORCHESTRATION_DENSITY',severity:'info',matchId:row.matchId,value:row.automaticPriorityAdvanceCount});
    if((row.responsePlayedCount??0)>20)anomalies.push({type:'RESPONSE_CHAIN_INTENSITY',severity:'info',matchId:row.matchId,value:row.responsePlayedCount});
  }
  for(const match of detailedMatches){
    const unclassified=(match.facts?.resolutionFacts??[]).filter(f=>f.mechanicTags?.includes('unclassified')).length;
    if(unclassified)anomalies.push({type:'UNCLASSIFIED_FACT',severity:'warning',matchId:match.summary.matchId,value:unclassified});
  }
  return anomalies.sort((a,b)=>String(a.matchId).localeCompare(String(b.matchId))||a.type.localeCompare(b.type));
}
