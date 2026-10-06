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
// Formula hashes are sha256Text over the shared metric-registry formula text,
// so they equal the canonical hashes by construction.

import { sha256Text } from './engine/browser-entry.js?v=c4e7aaac019e';
import {
  MECHANIC_REGISTRY,
  mechanicDisplayName,
  mechanicCategory,
  isExcludedFromDiscovery,
  classifyTagDimension,
  analyticsEntityDefinition,
  synergyExcludedTags,
  areTagsInseparable,
} from './mechanic-registry-browser.js?v=c4e7aaac019e';

// Metric identity, estimators and the synergy/mechanics inference core are
// shared verbatim with canonical analytics (scripts/build.mjs copies them into
// dist/shared-analytics/), so formula hashes and estimands cannot diverge.
import { ANALYTICS_SCHEMA_VERSION, METRIC_DEFINITIONS } from './shared-analytics/metric-registry.mjs?v=c4e7aaac019e';
import { wilsonInterval, normalCdf, differenceInProportions } from './shared-analytics/estimators.mjs?v=c4e7aaac019e';
import { analyzeSynergiesCore, gradeMechanicRows, policyRecord, representativeMatches, stratumKey, unitDecisive, unitWon } from './shared-analytics/observatory-core.mjs?v=c4e7aaac019e';
import { deriveTagRelations, choiceSupportStatus, CHOICE_SUPPORT_MIN_DECLINES } from './shared-analytics/observatory-integrity.mjs?v=c4e7aaac019e';

export { ANALYTICS_SCHEMA_VERSION, wilsonInterval };
const _formulaHashCache = {};
function metricFormulaHash(metricId) {
  return (_formulaHashCache[metricId] ??= sha256Text(String(METRIC_DEFINITIONS[metricId]?.formula ?? '')));
}

// ── Pure-math statistics helpers (browser ports of @intrilex/statistics) ──


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
  const rows = mechanicNames.map((mechanic) => {
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
    const legalDeclinedCount = hasOpportunityData ? Math.max(0, legalOpportunityCount - selectionCount) : null;
    const usedMatchIds = new Set(used.map((row) => row.matchId));
    const matchPrevalence = summaries.length > 0 ? usedMatchIds.size / summaries.length : 0;
    const matchPrevalenceWilson95 = wilsonInterval(usedMatchIds.size, summaries.length);
    const participantPrevalence = units.length > 0 ? used.length / units.length : 0;
    const participantPrevalenceWilson95 = wilsonInterval(used.length, units.length);
    const selectionFrequency = units.length > 0 ? selectionCount / units.length : 0;
    const registryEntry = MECHANIC_REGISTRY[mechanic];
    const dimension = classifyTagDimension(mechanic);
    const entityDef = analyticsEntityDefinition(mechanic);
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
      legalDeclinedCount,
      choiceSupport: hasOpportunityData
        ? { status: choiceSupportStatus(legalDeclinedCount), declinedCount: legalDeclinedCount, minimum: CHOICE_SUPPORT_MIN_DECLINES }
        : { status: 'unmeasured', reasonCode: 'MISSING_OPPORTUNITY_TELEMETRY', declinedCount: null, minimum: CHOICE_SUPPORT_MIN_DECLINES },
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
        ? { status: 'available', sampleSize: usedDecisive.length + unusedDecisive.length, contributingStrata: adjustedAssociation.contributingStrata ?? null, skippedStrata: adjustedAssociation.skippedStrata ?? null }
        : { status: 'model-failed', reasonCode: 'STRATIFIED_ESTIMATOR_FAILED', detail: 'Stratified estimator could not produce a finite estimate.' },
      sampleSize,
      status:sampleSize?'measured':'not-observable', replayRefs:representativeMatches(units,row=>Number(row.mechanicCounts?.[mechanic]??0)>0),
      counterexampleRefs:representativeMatches(units,row=>Number(row.mechanicCounts?.[mechanic]??0)>0 && unitDecisive(row) && unitWon(row)===0,2),
      formulaHash:metricFormulaHash('immediate-point-impact'),
      outcomeFormulaHash:metricFormulaHash('raw-win-association'),
      adjustedFormulaHash:metricFormulaHash('adjusted-win-association'),
      pickRateFormulaHash:metricFormulaHash('pick-rate-when-legal'),
      limitations:[
        `Participant prevalence uses ${usageUnit}-level observations and is policy-, seat-, and profile-conditioned.`,
        hasOpportunityData ? 'Pick rate when legal uses opportunity telemetry from the legality boundary.' : 'Opportunity-level pick rate is N/A — legal opportunity telemetry not available for this campaign.',
        hasOpportunityData && legalDeclinedCount != null && legalDeclinedCount < CHOICE_SUPPORT_MIN_DECLINES
          ? `Pick rate is not preference evidence — only ${legalDeclinedCount} legal-but-unselected frame${legalDeclinedCount === 1 ? '' : 's'} observed.`
          : 'Pick rate reflects observed selection, not proven preference.',
        'Win association is an observational association, not causal proof.',
      ]
    };
  });
  // BH over the valid inferential family only (parity with canonical).
  gradeMechanicRows(rows, deriveTagRelations(summaries, units, mechanicNames, { isRegistered: (t) => Boolean(MECHANIC_REGISTRY[t]) }));
  return rows;
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
  let contributingStrata = 0, skippedStrata = 0;
  for (const group of strata.values()) {
    if (!group.used.length || !group.unused.length) { skippedStrata += 1; continue; }
    const usedWins = group.used.reduce((s, r) => s + unitWon(r), 0);
    const unusedWins = group.unused.reduce((s, r) => s + unitWon(r), 0);
    const p1 = usedWins / group.used.length, p0 = unusedWins / group.unused.length;
    const diff = p1 - p0;
    const v = (p1 * (1 - p1)) / group.used.length + (p0 * (1 - p0)) / group.unused.length;
    if (v <= 0) { skippedStrata += 1; continue; }
    const w = 1 / v;
    pooledDiff += diff * w; pooledWeight += w; contributingStrata += 1;
  }
  if (pooledWeight === 0) return { estimate: null, interval: [null, null], contributingStrata: 0, skippedStrata };
  const estimate = pooledDiff / pooledWeight;
  const se = Math.sqrt(1 / pooledWeight);
  const z95 = 1.959963984540054;
  return { estimate, interval: [estimate - z95 * se, estimate + z95 * se], contributingStrata, skippedStrata };
}

// ── Synergies ──
// Estimation, candidate sanitation, grading and ranking are the shared core
// (packages/analytics/src/observatory-core.mjs), identical to canonical.

export function analyzeSynergies(summaries, options = {}) {
  const units = analysisUnits(summaries, { primary: true });
  const tags = [...new Set(units.flatMap((row) => Object.keys(row.mechanicCounts ?? {})))].sort();
  const relations = deriveTagRelations(summaries, units, tags, { isRegistered: (t) => Boolean(MECHANIC_REGISTRY[t]) });
  return analyzeSynergiesCore(units, { excludedTags: synergyExcludedTags(), areTagsInseparable, relations, formulaHash: metricFormulaHash('synergy-interaction') }, options);
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
  // Record fields mirror campaignAggregate() conventions: wins/draws/aborts
  // count cross-policy games only; self-play is tracked but excluded from the
  // superiority record. Seated split enables seat-balance inspection.
  const blank=(id)=>({policyId:id,games:0,wins:0,miniTurnActions:0,responsePlays:0,responseDeclines:0,privateChoices:0,advanced:0,ultras:0,voltage:0,turns:0,
    selfPlayGames:0,crossPolicyWins:0,crossPolicyLosses:0,crossPolicyDraws:0,crossPolicyAborts:0,seat1Games:0,seat2Games:0,opponentSet:new Set(),scoreMarginTotal:0,exhaustedPassActions:0});
  for(const row of summaries){
    const policyIds=row.policyIds??[];
    const isSelfPlay=policyIds.length===2&&policyIds[0]===policyIds[1];
    const isDraw=row.terminationReason==='CANONICAL_DRAW'||row.winner==='DRAW';
    const isDecisive=decisive(row);
    const winnerPolicy=isDecisive?policyIds[(row.seatOrder??[]).indexOf(row.winner)]:null;
    const hasParticipants=Array.isArray(row.participants)&&row.participants.length===2;
    // games and selfPlayGames both count participations (one per seat), so
    // crossPolicyGames = games - selfPlayGames holds exactly — a self-play
    // match occupies both seats and removes both participations.
    if(hasParticipants){
      for(const p of row.participants){
        byPolicy[p.policyId]??=blank(p.policyId);
        const x=byPolicy[p.policyId];x.games+=1;x.turns+=row.completedFullTurns;
        if(p.seat===1)x.seat1Games+=1;else if(p.seat===2)x.seat2Games+=1;
        for(const other of policyIds)if(other!==p.policyId)x.opponentSet.add(other);
        x.scoreMarginTotal+=Number(row.scoreMargin??0);
        if(isSelfPlay)x.selfPlayGames+=1;
        if(p.result==='win'){x.wins+=1;if(!isSelfPlay)x.crossPolicyWins+=1;}
        else if(p.result==='loss'){if(!isSelfPlay)x.crossPolicyLosses+=1;}
        else if(isDraw){if(!isSelfPlay)x.crossPolicyDraws+=1;}
        else if(!isSelfPlay)x.crossPolicyAborts+=1;
        x.miniTurnActions+=p.miniTurnActionCount??0;x.responsePlays+=p.responsePlayCount??0;x.responseDeclines+=p.responseDeclineCount??0;x.privateChoices+=p.privateChoiceDecisionCount??0;x.advanced+=p.advancedDecisionCount??0;x.ultras+=p.ultraDecisionCount??0;x.voltage+=p.voltageDecisionCount??0;x.exhaustedPassActions+=p.exhaustedPassActionCount??0;
      }
    }else{
      for(const policyId of policyIds){
        byPolicy[policyId]??=blank(policyId);
        const x=byPolicy[policyId];x.games+=1;x.turns+=row.completedFullTurns;
        const seat=(row.seatOrder??[]).indexOf(policyId)+1;
        if(seat===1)x.seat1Games+=1;else if(seat===2)x.seat2Games+=1;
        for(const other of policyIds)if(other!==policyId)x.opponentSet.add(other);
        x.scoreMarginTotal+=Number(row.scoreMargin??0);
        if(isSelfPlay)x.selfPlayGames+=1;
        if(winnerPolicy===policyId){x.wins+=1;if(!isSelfPlay)x.crossPolicyWins+=1;}
        else if(isDecisive){if(!isSelfPlay)x.crossPolicyLosses+=1;}
        else if(isDraw){if(!isSelfPlay)x.crossPolicyDraws+=1;}
        else if(!isSelfPlay)x.crossPolicyAborts+=1;
        x.miniTurnActions+=row.miniTurnActionCount??0;x.responsePlays+=row.responsePlayedCount??0;x.responseDeclines+=row.responseDeclinedWithOptionsCount??0;x.privateChoices+=row.privateChoiceDecisionCount??0;x.advanced+=row.advancedDecisionCount??0;x.ultras+=row.ultraDecisionCount??0;x.voltage+=row.voltageDecisionCount??0;x.exhaustedPassActions+=row.exhaustedPassActionCount??0;
      }
    }
  }
  return Object.values(byPolicy).map(x=>{
    return {
    ...x,
    opponents:[...x.opponentSet].sort(),opponentSet:undefined,
    matchCount:x.games,
    record:policyRecord(x),
    seatSplit:{seat1:x.seat1Games,seat2:x.seat2Games},
    avgScoreMargin:x.games?x.scoreMarginTotal/x.games:null,
    exhaustedPassRate:x.miniTurnActions?x.exhaustedPassActions/x.miniTurnActions:null,
    responsePlayRate:(x.responsePlays+x.responseDeclines)?x.responsePlays/(x.responsePlays+x.responseDeclines):null,
    winRate:x.games?x.wins/x.games:0,winWilson95:x.games?wilsonInterval(x.wins,x.games):null,winRateBasis:'all-participations-including-self-play',
    fingerprint:{scoreAggression:x.games?x.miniTurnActions/x.games:0,responseUse:x.games?x.responsePlays/x.games:0,responseConservation:x.responsePlays+x.responseDeclines?x.responseDeclines/(x.responsePlays+x.responseDeclines):0,privateChoiceDensity:x.games?x.privateChoices/x.games:0,advancedFrequency:x.games?x.advanced/x.games:0,ultraFrequency:x.games?x.ultras/x.games:0,voltageFrequency:x.games?x.voltage/x.games:0,matchLength:x.games?x.turns/x.games:0}
    };
  }).sort((a,b)=>a.policyId.localeCompare(b.policyId));
}

// ── Anomaly Detection ──

export function detectAnomalies(summaries,detailedMatches=[]){
  const turns=summarizeNumbers(summaries.map(row=>row.completedFullTurns));
  const threshold=turns.p95??Infinity;
  const anomalies=[];
  for(const row of summaries){
    if(row.completedFullTurns>=threshold)anomalies.push({type:'LONG_MATCH',severity:'warning',matchId:row.matchId,value:row.completedFullTurns,threshold,baseline:threshold,unit:'full turns',detail:`${row.completedFullTurns} completed turns ≥ p95 baseline (${threshold} turns); tail detector flags ~5% of matches by construction`});
    if(row.terminationReason==='UNSUPPORTED_CONFIGURATION'||row.terminationReason==='ENGINE_REJECTION')anomalies.push({type:row.terminationReason,severity:'critical',matchId:row.matchId,value:row.errorCode,baseline:'accepted run',unit:'termination',detail:`match terminated with ${row.terminationReason}${row.errorCode?` (${row.errorCode})`:''}`});
    if((row.automaticPriorityAdvanceCount??0)>Math.max(30,(row.responseOpportunityCount??0)*8))anomalies.push({type:'ORCHESTRATION_DENSITY',severity:'info',matchId:row.matchId,value:row.automaticPriorityAdvanceCount,threshold:Math.max(30,(row.responseOpportunityCount??0)*8),unit:'automatic priority advances per match',detail:`${row.automaticPriorityAdvanceCount} automatic priority advances > max(30, 8×${row.responseOpportunityCount??0} response opportunities)`});
    if((row.responsePlayedCount??0)>20)anomalies.push({type:'RESPONSE_CHAIN_INTENSITY',severity:'info',matchId:row.matchId,value:row.responsePlayedCount,threshold:20,unit:'response plays per match',detail:`${row.responsePlayedCount} response plays > 20 per match`});
  }
  for(const match of detailedMatches){
    const unclassified=(match.facts?.resolutionFacts??[]).filter(f=>f.mechanicTags?.includes('unclassified')).length;
    if(unclassified)anomalies.push({type:'UNCLASSIFIED_FACT',severity:'warning',matchId:match.summary.matchId,value:unclassified,unit:'unclassified resolution facts',detail:`${unclassified} resolution fact${unclassified===1?'':'s'} carry the 'unclassified' mechanic tag`});
  }
  return anomalies.sort((a,b)=>String(a.matchId).localeCompare(String(b.matchId))||a.type.localeCompare(b.type));
}

// ── AB/BA matched-pair analysis (browser port, parity with @intrilex/analytics) ──
// Moved here from browser-analytics.js so the orchestrator module stays under
// its size budget; behavior unchanged.
export function buildPairedABBAAnalysis(summaries) {
  const hasPairedRunIds = summaries.some((r) => r.pairedRunId);
  const pairBlocks = new Map();
  let incompletePairs = 0;
  for (const row of summaries) {
    const blockKey = (hasPairedRunIds && row.pairedRunId) ? row.pairedRunId : [...(row.policyIds ?? [])].sort().join('__');
    if (!pairBlocks.has(blockKey)) pairBlocks.set(blockKey, []);
    pairBlocks.get(blockKey).push(row);
  }
  const pairResults = [];
  for (const [blockKey, rows] of pairBlocks) {
    rows.sort((a, b) => (a.matchOrdinal ?? 0) - (b.matchOrdinal ?? 0));
    const policyA = rows[0]?.policyIds?.[0] ?? 'A', policyB = rows[0]?.policyIds?.[1] ?? 'B';
    const pairs = [];
    for (let i = 0; i + 1 < rows.length; i += 2) {
      const seat1Row = rows[i], seat2Row = rows[i + 1];
      if (!seat1Row || !seat2Row) { incompletePairs += 1; continue; }
      const seatSwapped = seat2Row.seatSwapped === true || (JSON.stringify(seat2Row.seatOrder) !== JSON.stringify(seat1Row.seatOrder));
      const s1wp = seat1Row.winner !== 'DRAW' && seat1Row.winner !== 'ABORTED' ? seat1Row.policyIds[seat1Row.seatOrder.indexOf(seat1Row.winner)] : null;
      const s2wp = seat2Row.winner !== 'DRAW' && seat2Row.winner !== 'ABORTED' ? seat2Row.policyIds[seat2Row.seatOrder.indexOf(seat2Row.winner)] : null;
      pairs.push({ aSeat1Win: s1wp === policyA, bSeat1Win: s1wp === policyB, aSeat2Win: s2wp === policyA, bSeat2Win: s2wp === policyB, seatSwapped, pairedRunId: seat1Row.pairedRunId ?? null });
    }
    if (rows.length % 2 === 1) incompletePairs += 1;
    if (pairs.length === 0) continue;
    const allSwapped = pairs.every((p) => p.seatSwapped);
    const mcnemar = mcnemarPairedTest(pairs);
    const bootstrap = pairedBootstrapABBA(pairs, { iterations: 2000, seed: `abba:${blockKey}` });
    pairResults.push({ policyPair: blockKey, policyA, policyB, pairedBlocks: pairs.length, seatSwapVerified: allSwapped, mcnemar, bootstrap, design: allSwapped ? 'matched AB/BA seat-swap (verified)' : 'AB/BA seat-swap (unverified — legacy or incomplete)', interpretation: mcnemar.pValue < 0.05 ? 'statistically significant seat-policy differential (p < 0.05)' : 'no statistically significant seat-policy differential detected' });
  }
  const totalPairs = pairResults.reduce((s, r) => s + r.pairedBlocks, 0);
  // Distinguish "no pairs" causes: a schedule that never repeated a
  // pairedRunId yields hasPairedRunIds=true with zero complete pairs — a data
  // limitation of the campaign, not a pairing failure.
  const scheduleNote = totalPairs === 0 && hasPairedRunIds
    ? 'pairedRunIds are present but none grouped ≥2 matches — the campaign schedule did not repeat pair blocks, so AB/BA pairing is not possible on this dataset'
    : null;
  return { schemaVersion: ANALYTICS_SCHEMA_VERSION, design: 'matched AB/BA seat-swap', pairCount: pairResults.length, totalPairedBlocks: totalPairs, incompletePairs, hasPairedRunIds, scheduleNote, pairResults: pairResults.sort((a, b) => a.policyPair.localeCompare(b.policyPair)), interpretationBoundary: hasPairedRunIds ? 'AB/BA pairs are linked by pairedRunId.' : 'AB/BA pairs are matched by policy-pair block (legacy).' };
}
