import { hashCanonical } from '@intrilex/shared';
import {
  benjaminiHochberg,
  cohortBalanceRatio,
  deterministicClusterBootstrap,
  differenceInProportions,
  empiricalBayesShrinkage,
  evidenceGrade,
  evidenceGradeLegacy,
  formulaHash,
  logisticInteractionEstimate,
  mcnemarPairedTest,
  pairedBootstrapABBA,
  stratifiedInteractionEstimate,
  summarizeNumbers,
  wilsonInterval
} from '@intrilex/statistics';
import {
  MECHANIC_REGISTRY,
  mechanicRegistryHash,
  resolveMechanicId,
  mechanicDisplayName,
  mechanicCategory,
  isExcludedFromDiscovery,
  validateMechanicTags,
  quarantineUnknownTags,
  classifyTagDimension,
  analyticsEntityDefinition,
  synergyExcludedTags,
  areTagsInseparable
} from '@intrilex/decision-intelligence/mechanic-registry';
import { buildRankAnalytics, buildVariantAnalytics, expandTenSuitsInRankPower } from './rank-integration.mjs';

export const ANALYTICS_SCHEMA_VERSION = '4.2.0';

function increment(record, key, amount = 1) { record[key] = (record[key] ?? 0) + amount; }
const decisive = (row) => row.terminationReason !== 'CANONICAL_DRAW' && row.winner !== 'DRAW' && row.winner !== 'ABORTED';
const seat1Won = (row) => decisive(row) && row.winningSeat === 1 ? 1 : 0;
const sortedRecord = (record) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
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

export const METRIC_REGISTRY = Object.freeze({
  'win-rate': { version:'4.2.0', formula:'wins / decisive completed matches', uncertainty:'Wilson 95% interval' },
  'participant-prevalence': { version:'4.2.0', formula:'unique participant-match pairs that selected entity ≥1 / all eligible participant-match records', uncertainty:'Wilson 95% interval' },
  'match-prevalence': { version:'4.2.0', formula:'unique matches in which entity selected ≥1 / all eligible matches', uncertainty:'Wilson 95% interval' },
  'pick-rate-when-legal': { version:'4.2.0', formula:'selections / distinct legal decision windows', uncertainty:'Wilson 95% interval; N/A when zero legal opportunities' },
  'selection-frequency': { version:'4.2.0', formula:'total selections / eligible participant-match records', uncertainty:'descriptive rate' },
  'resolution-rate': { version:'4.2.0', formula:'resolved declarations / accepted declarations', uncertainty:'Wilson 95% interval' },
  'response-play-rate': { version:'4.2.0', formula:'response plays / lawful response opportunities', uncertainty:'Wilson 95% interval' },
  'counter-efficiency': { version:'4.2.0', formula:'opponent value prevented / own card and tempo cost', uncertainty:'match-clustered deterministic bootstrap' },
  'synergy-interaction': { version:'4.2.0', formula:'stratified logistic A×B interaction (odds-ratio scale) from four-cohort model', uncertainty:'Wald CI from inverse-variance pooled SE + BH FDR' },
  'immediate-point-impact': { version:'4.2.0', formula:'sum actor-perspective secured point delta / resolved selections with point data', uncertainty:'match-clustered deterministic bootstrap' },
  'raw-win-association': { version:'4.2.0', formula:'P(win|selected) - P(win|not selected)', uncertainty:'two-proportion z-test CI' },
  'adjusted-win-association': { version:'4.2.0', formula:'stratified win-rate differential controlling for policy, seat, profile', uncertainty:'Mantel-Haenszel-style stratified estimator CI' },
  'policy-fingerprint': { version:'4.2.0', formula:'policy event/action count / policy games', uncertainty:'descriptive; no optimality claim' }
});

export function metricRegistryWithHashes() {
  return Object.fromEntries(Object.entries(METRIC_REGISTRY).map(([id, metric]) => [id, { metricId:id, ...metric, formulaHash:formulaHash(metric.formula) }]));
}

export function aggregateReplayRecords(records) {
  const commandTypes = {}, eventTypes = {}, visibility = {}, fixtureGroups = {}, commandCounts = [], eventCounts = [];
  let accepted = 0, rejected = 0, hiddenChoices = 0;
  for (const record of records) {
    commandCounts.push(record.commands.length); eventCounts.push(record.events.length);
    const group = record.fixtureId.includes('@') ? 'TOURNAMENT-SEED-DUPLICATE' : `CT-${record.fixtureId.slice(3, 4)}xx`;
    increment(fixtureGroups, group);
    for (const [index, command] of record.commands.entries()) {
      increment(commandTypes, command.type); if (record.accepted[index]) accepted += 1; else rejected += 1;
      if (command.type === 'HIDDEN_CHOICE') hiddenChoices += 1;
    }
    for (const event of record.events) { increment(eventTypes, event.type); increment(visibility, event.visibility ?? 'public'); }
  }
  const aggregate = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION, corpusKind:'CERTIFIED_CONFORMANCE_REPLAY_CORPUS', replayCount:records.length,
    commandCount:accepted+rejected, acceptedCommandCount:accepted, rejectedCommandCount:rejected,
    eventCount:eventCounts.reduce((a,b)=>a+b,0), hiddenChoiceCommandCount:hiddenChoices,
    commandCountDistribution:summarizeNumbers(commandCounts), eventCountDistribution:summarizeNumbers(eventCounts),
    commandTypes:sortedRecord(commandTypes), eventTypes:sortedRecord(eventTypes), visibility:sortedRecord(visibility), fixtureGroups:sortedRecord(fixtureGroups),
    interpretationBoundary:'This corpus measures certified conformance scenarios, not autonomous matches and not game balance.'
  };
  return { ...aggregate, aggregateHash:hashCanonical(aggregate) };
}

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

export function buildMechanicsAtlas(summaries, detailedMatches = []) {
  const units = analysisUnits(summaries);
  const usageUnit = units.length > summaries.length ? 'participant' : 'match';
  const mechanicNames = [...new Set(units.flatMap((row) => Object.keys(row.mechanicCounts ?? {})))].sort();
  // Build facts-by-mechanic index with actor-perspective point deltas.
  // The actor is resolved from the decision fact linked to each resolution fact.
  const factsByMechanic = {};
  for (const match of detailedMatches) {
    const decisionFactMap = new Map((match.facts?.decisionFacts ?? []).map((df) => [df.factId, df]));
    for (const resolution of match.facts?.resolutionFacts ?? []) {
      for (const mechanic of resolution.mechanicTags ?? []) {
        factsByMechanic[mechanic] ??= [];
        const delta = (match.facts.stateDeltaFacts ?? []).find((item) => item.factId === resolution.stateDeltaId);
        // Resolve the actor from the linked decision fact for actor-perspective point impact
        const decisionFact = decisionFactMap.get(resolution.declarationFactId);
        const actorId = decisionFact?.actorId ?? null;
        const actorDelta = actorId && delta?.securedPointDeltaByPlayer
          ? Number(delta.securedPointDeltaByPlayer[actorId] ?? 0)
          : null;
        factsByMechanic[mechanic].push({ matchId: match.summary.matchId, resolution, delta, actorId, actorDelta });
      }
    }
  }
  const allTags = mechanicNames;
  const tagValidation = validateMechanicTags(allTags);
  const quarantined = quarantineUnknownTags(allTags);
  return mechanicNames.map((mechanic) => {
    const used = units.filter((row) => Number(row.mechanicCounts?.[mechanic] ?? 0) > 0);
    const notUsed = units.filter((row) => Number(row.mechanicCounts?.[mechanic] ?? 0) === 0);
    const usedDecisive = used.filter(unitDecisive), unusedDecisive = notUsed.filter(unitDecisive);
    const usedWins = usedDecisive.reduce((sum,row)=>sum+unitWon(row),0), unusedWins=unusedDecisive.reduce((sum,row)=>sum+unitWon(row),0);
    const association = differenceInProportions(usedWins,usedDecisive.length,unusedWins,unusedDecisive.length);
    // Adjusted win association: stratified by policy/seat/profile
    const adjustedAssociation = stratifiedWinAssociation(units, mechanic);
    // Actor-perspective point deltas (only from resolutions where actor is known)
    const facts = factsByMechanic[mechanic] ?? [];
    const actorPointDeltas = facts.map((f) => f.actorDelta).filter((v) => v != null && Number.isFinite(v));
    // Legacy point deltas (all players) for backward compatibility
    const legacyPointDeltas = facts.map(({delta})=>Object.values(delta?.securedPointDeltaByPlayer ?? {}).reduce((a,b)=>a+b,0));
    const selectionCount = used.reduce((sum,row)=>sum+Number(row.mechanicCounts?.[mechanic]??0),0);
    const sampleSize = used.length;
    // Legal opportunity count from per-participant opportunity telemetry
    const legalOpportunityCount = units.reduce((sum, row) => sum + Number(row.mechanicOpportunityCounts?.[mechanic] ?? 0), 0);
    const hasOpportunityData = legalOpportunityCount > 0;
    // Pick rate when legal: selections / legal opportunities (N/A if no opportunities)
    const pickRateWhenLegal = hasOpportunityData ? selectionCount / legalOpportunityCount : null;
    // Match prevalence: unique matches in which entity was selected at least once
    const usedMatchIds = new Set(used.map((row) => row.matchId));
    const matchPrevalence = summaries.length > 0 ? usedMatchIds.size / summaries.length : 0;
    const matchPrevalenceWilson95 = wilsonInterval(usedMatchIds.size, summaries.length);
    // Participant prevalence (formerly mislabeled as "usage rate")
    const participantPrevalence = units.length > 0 ? used.length / units.length : 0;
    const participantPrevalenceWilson95 = wilsonInterval(used.length, units.length);
    // Selection frequency: total selections / eligible participant-match records
    const selectionFrequency = units.length > 0 ? selectionCount / units.length : 0;
    // Resolution and success rates from facts
    const resolvedFacts = facts.filter((f) => f.resolution?.outcome === 'resolved');
    const resolutionRate = facts.length > 0 ? resolvedFacts.length / facts.length : null;
    const successfulFacts = facts.filter((f) => f.resolution?.outcome === 'resolved'); // resolved = successful in current model
    const successRate = resolvedFacts.length > 0 ? successfulFacts.length / resolvedFacts.length : null;
    const registryEntry = MECHANIC_REGISTRY[mechanic];
    const dimension = classifyTagDimension(mechanic);
    const entityDef = analyticsEntityDefinition(mechanic);
    // Evidence grade using new multi-criteria rubric
    const evidenceV2 = evidenceGrade({
      sampleSize, interval: association.interval, qValue: null, minimum: 20,
      effectSize: association.estimate, effectiveN: sampleSize,
    });
    return {
      metricId:`mechanic:${mechanic}`, mechanic, displayName:mechanicDisplayName(mechanic), category:mechanicCategory(mechanic),
      dimension, entityDescription: entityDef.description,
      registryVerified: Boolean(registryEntry), quarantined: !registryEntry && !isExcludedFromDiscovery(mechanic),
      selectionCount, legalOpportunityCount, hasOpportunityData,
      pickRateWhenLegal, // N/A (null) when no opportunity data
      // Structured metric status — distinguishes missing telemetry from zero opportunities from not-applicable
      pickRateStatus: hasOpportunityData
        ? (legalOpportunityCount > 0
          ? { status: 'available', value: pickRateWhenLegal, numerator: selectionCount, denominator: legalOpportunityCount }
          : { status: 'zero-opportunities', reasonCode: 'NO_LEGAL_OPPORTUNITIES', detail: 'Entity had zero legal opportunities in this campaign.' })
        : { status: 'missing-telemetry', reasonCode: 'MISSING_OPPORTUNITY_TELEMETRY', detail: 'Opportunity telemetry not recorded for this campaign.' },
      matchOpportunityCount:summaries.length,
      analysisUnitOpportunityCount:units.length, usageUnit,
      // Renamed metrics (participant prevalence, not "usage rate")
      participantPrevalence, participantPrevalenceWilson95,
      matchPrevalence, matchPrevalenceWilson95,
      selectionFrequency,
      // Backward-compatible aliases
      matchUsageRate: participantPrevalence, matchUsageWilson95: participantPrevalenceWilson95,
      // Actor-perspective point impact (replaces all-player sum)
      actorPointImpact: actorPointDeltas.length ? summarizeNumbers(actorPointDeltas) : null,
      pointImpactStatus: actorPointDeltas.length > 0
        ? { status: 'available', sampleSize: actorPointDeltas.length }
        : (facts.length > 0
          ? { status: 'available', value: 0, sampleSize: 0, reasonCode: 'NO_ACTOR_DELTA', detail: 'No actor-perspective point deltas recorded.' }
          : { status: 'not-applicable', reasonCode: 'NO_RESOLUTION_FACTS', detail: 'No resolution facts for this entity.' }),
      immediatePointImpact: actorPointDeltas.length ? summarizeNumbers(actorPointDeltas) : (legacyPointDeltas.length ? summarizeNumbers(legacyPointDeltas) : null),
      // Resolution and success rates
      resolutionRate, successRate,
      // Win association (raw and adjusted)
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
      status: sampleSize ? 'measured' : 'not-observable',
      replayRefs:representativeMatches(units,row=>Number(row.mechanicCounts?.[mechanic]??0)>0),
      counterexampleRefs:representativeMatches(units,row=>Number(row.mechanicCounts?.[mechanic]??0)>0 && unitDecisive(row) && unitWon(row)===0,2),
      formulaHash:metricRegistryWithHashes()['immediate-point-impact'].formulaHash,
      outcomeFormulaHash:metricRegistryWithHashes()['synergy-interaction'].formulaHash,
      limitations:[
        `Participant prevalence uses ${usageUnit}-level observations and is policy-, seat-, and profile-conditioned.`,
        hasOpportunityData ? 'Pick rate when legal uses opportunity telemetry from the legality boundary.' : 'Opportunity-level pick rate is N/A — legal opportunity telemetry not available for this campaign.',
        'Win association is an observational association, not causal proof.',
      ]
    };
  });
}

/**
 * Stratified win-rate differential controlling for policy, seat, and profile.
 * Uses a Mantel-Haenszel-style inverse-variance pooling across strata.
 */
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
    // Inverse variance weight
    const v = (p1 * (1 - p1)) / group.used.length + (p0 * (1 - p0)) / group.unused.length;
    if (v > 0) {
      const w = 1 / v;
      pooledDiff += diff * w;
      pooledWeight += w;
    }
  }
  if (pooledWeight === 0) return { estimate: null, interval: [null, null] };
  const estimate = pooledDiff / pooledWeight;
  const se = Math.sqrt(1 / pooledWeight);
  const z95 = 1.959963984540054;
  return { estimate, interval: [estimate - z95 * se, estimate + z95 * se] };
}

function stratumKey(row) { return row._stratum ?? `${row.profileId}|${(row.policyIds ?? []).join('>')}|${(row.seatOrder ?? []).join('>')}`; }
/**
 * Four-cohort interaction estimator for a single stratum.
 * Classifies participant-match records into Neither, A-only, B-only, Both cohorts
 * and computes the logistic A×B interaction on the odds-ratio scale.
 */
function fourCohortInteraction(group, a, b) {
  const neither = { wins: 0, losses: 0 };
  const aOnly = { wins: 0, losses: 0 };
  const bOnly = { wins: 0, losses: 0 };
  const both = { wins: 0, losses: 0 };
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

export function analyzeSynergies(summaries, {
  minimumBoth = 20,
  minimumCohort = 10,
  minimumEffectiveN = 50,
  maxMechanics = 24,
  includeDiagnostics = false,
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
  // Build strata for stratified interaction estimation
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
      // Skip inseparable pairs (parent/child, aliases)
      if (areTagsInseparable(a, b)) {
        if (includeDiagnostics) diagnostics.push({ id: `${a}::${b}`, source: a, target: b, status: 'rejected', reason: 'inseparable-tags', reasonCode: 'PARENT_CHILD_OR_ALIAS', cohortN: null });
        continue;
      }
      // Compute four-cohort interaction per stratum
      const stratumCohorts = strata.map((group) => fourCohortInteraction(group, a, b));
      // Aggregate cohort sizes across all strata
      const totalCohortN = { neither: 0, aOnly: 0, bOnly: 0, both: 0 };
      for (const sc of stratumCohorts) {
        totalCohortN.neither += sc.neither.wins + sc.neither.losses;
        totalCohortN.aOnly += sc.aOnly.wins + sc.aOnly.losses;
        totalCohortN.bOnly += sc.bOnly.wins + sc.bOnly.losses;
        totalCohortN.both += sc.both.wins + sc.both.losses;
      }
      const totalN = totalCohortN.neither + totalCohortN.aOnly + totalCohortN.bOnly + totalCohortN.both;
      // Rare-pair suppression: check minimum cohort sizes
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
      // Stratified interaction estimate using inverse-variance pooling
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
        id: `${a}::${b}`, source: a, target: b,
        displayName: `${a} × ${b}`,
        relationshipClass: marginalInteraction >= 0 ? 'synergy' : 'anti-synergy',
        direction: 'bidirectional',
        effect: result.estimate,
        logEstimate: result.logEstimate,
        rawEffect: marginalInteraction,
        marginalInteraction,
        shrunkEffect: empiricalBayesShrinkage(result.estimate, result.effectiveN),
        confidenceInterval: result.interval,
        standardError: result.standardError,
        pValue: result.pValue,
        cohortN: totalCohortN,
        neitherN: totalCohortN.neither, aOnlyN: totalCohortN.aOnly,
        bOnlyN: totalCohortN.bOnly, bothN: totalCohortN.both,
        cohortBalance: balance,
        effectiveN: result.effectiveN,
        separation: result.separation,
        strataCount: result.strataCount,
        jointOpportunityCount: totalCohortN.both,
        baselineCount: totalCohortN.aOnly + totalCohortN.bOnly,
        sampleSize: totalN,
      });
    }
  }
  const results = benjaminiHochberg(raw).map((item) => {
    const evidenceV2 = evidenceGrade({
      sampleSize: item.effectiveN,
      interval: item.confidenceInterval,
      qValue: item.qValue,
      minimum: Math.min(minimumBoth, minimumEffectiveN),
      effectSize: item.marginalInteraction,
      cohortBalance: item.cohortBalance,
      effectiveN: item.effectiveN,
    });
    return {
      ...item,
      status: item.qValue <= 0.1 && (item.confidenceInterval[0] > 1 || item.confidenceInterval[1] < 1)
        ? (item.marginalInteraction > 0 ? 'positive' : 'negative')
        : 'inconclusive',
      evidenceGrade: evidenceV2,
      evidenceGradeLegacy: evidenceGradeLegacy({ sampleSize: item.effectiveN, interval: item.confidenceInterval, qValue: item.qValue, minimum: Math.min(minimumBoth, minimumEffectiveN) }),
      replayRefs: representativeMatches(units, (row) => (row.mechanicCounts?.[item.source] ?? 0) > 0 && (row.mechanicCounts?.[item.target] ?? 0) > 0),
      counterexampleRefs: representativeMatches(units, (row) => (row.mechanicCounts?.[item.source] ?? 0) > 0 && (row.mechanicCounts?.[item.target] ?? 0) > 0 && unitDecisive(row) && unitWon(row) === 0, 2),
      formulaHash: metricRegistryWithHashes()['synergy-interaction'].formulaHash,
      limitations: [
        'Interaction effect is the A×B odds-ratio from a stratified logistic model — association, not causation.',
        `Four cohorts: Neither=${item.neitherN}, A-only=${item.aOnlyN}, B-only=${item.bOnlyN}, Both=${item.bothN}.`,
        item.separation ? 'Perfect separation detected in some strata; continuity correction applied.' : null,
        'Low-frequency pairs are suppressed by minimum cohort thresholds.',
      ].filter(Boolean),
    };
  }).sort((a, b) => Math.abs(b.shrunkEffect) - Math.abs(a.shrunkEffect) || a.id.localeCompare(b.id));
  // Attach diagnostics array to results for callers that request it
  if (includeDiagnostics) results.diagnostics = diagnostics;
  return results;
}

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

// Legacy SYNERGY_EXCLUDED_MECHANICS retained for backward compatibility.
// New code uses synergyExcludedTags() from the mechanic registry.
const SYNERGY_EXCLUDED_MECHANICS=new Set([
  'draw','discard','recycle','rummage','exhausted','goal','trigger',
  'ACTION','SETUP','INSTANT','QUICK','INTERRUPT',
  'phase','enter-action','points','ordinary','top','decline','response-decline','private-choice','forced-mini-turn',
  'instant','quick','interrupt','score','exhausted-pass','♣','♦','♥','♠'
]);
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

export function compareCohorts(left,right){
  const metrics=['completedFullTurns','miniTurnActionCount','responsePlayedCount','responseDeclinedWithOptionsCount','automaticPriorityAdvanceCount','privateChoiceDecisionCount','advancedDecisionCount','ultraDecisionCount','scoreMargin'];
  return metrics.map(metric=>{
    const a=summarizeNumbers(left.map(row=>Number(row[metric]??0))),b=summarizeNumbers(right.map(row=>Number(row[metric]??0)));
    const bootstrap=deterministicClusterBootstrap([...left.map(row=>({...row,_cohort:'left'})),...right.map(row=>({...row,_cohort:'right'}))],rows=>{
      const l=rows.filter(r=>r._cohort==='left'),r=rows.filter(x=>x._cohort==='right');
      if(!l.length||!r.length)return NaN;return l.reduce((s,x)=>s+Number(x[metric]??0),0)/l.length-r.reduce((s,x)=>s+Number(x[metric]??0),0)/r.length;
    },{iterations:400,seed:`compare:${metric}`});
    return {metric,left:a,right:b,difference:(a.mean??0)-(b.mean??0),confidenceInterval:bootstrap.interval,sampleSize:left.length+right.length,formulaHash:formulaHash(`mean(left.${metric}) - mean(right.${metric})`)};
  });
}

/**
 * Build paired AB/BA seat-swap analysis from campaign summaries.
 *
 * The campaign already runs an AB/BA design: for each policy pair (A, B),
 * ordinals alternate seat assignment (A@seat1/B@seat2, then B@seat1/A@seat2).
 * This function groups matched pairs and runs:
 *   - McNemar exact/chi-square test on discordant pairs
 *   - Paired bootstrap on the seat-policy win-rate differential
 *
 * @param {Array} summaries - campaign match summaries with policyIds, seatOrder, winner
 * @returns {object} paired experiment analysis
 */
export function buildPairedABBAAnalysis(summaries) {
  // Group summaries by pairedRunId if available, otherwise by policy-pair block.
  // The campaign assigns pairedRunId to link AB and BA runs. If pairedRunId is
  // not present (legacy data), we fall back to pairing by ordinal block.
  const hasPairedRunIds = summaries.some((r) => r.pairedRunId);
  const pairBlocks = new Map();
  let incompletePairs = 0;
  for (const row of summaries) {
    let pairKey, blockKey;
    if (hasPairedRunIds && row.pairedRunId) {
      pairKey = row.pairedRunId;
      blockKey = row.pairedRunId;
    } else {
      pairKey = [...(row.policyIds ?? [])].sort().join('__');
      blockKey = pairKey;
    }
    if (!pairBlocks.has(blockKey)) pairBlocks.set(blockKey, []);
    pairBlocks.get(blockKey).push(row);
  }

  const pairResults = [];
  for (const [blockKey, rows] of pairBlocks) {
    rows.sort((a, b) => (a.matchOrdinal ?? 0) - (b.matchOrdinal ?? 0));
    const policyA = rows[0]?.policyIds?.[0] ?? 'A';
    const policyB = rows[0]?.policyIds?.[1] ?? 'B';
    // Pair consecutive ordinals: (0,1), (2,3), ... within this block
    // First of pair = A@seat1/B@seat2, second = B@seat1/A@seat2
    const pairs = [];
    for (let i = 0; i + 1 < rows.length; i += 2) {
      const seat1Row = rows[i];
      const seat2Row = rows[i + 1];
      if (!seat1Row || !seat2Row) { incompletePairs += 1; continue; }
      // Verify seat swap: second row should have reversed seat order
      const seatSwapped = seat2Row.seatSwapped === true ||
        (JSON.stringify(seat2Row.seatOrder) !== JSON.stringify(seat1Row.seatOrder));
      const seat1WinnerPolicy = seat1Row.winner !== 'DRAW' && seat1Row.winner !== 'ABORTED'
        ? seat1Row.policyIds[seat1Row.seatOrder.indexOf(seat1Row.winner)] : null;
      const seat2WinnerPolicy = seat2Row.winner !== 'DRAW' && seat2Row.winner !== 'ABORTED'
        ? seat2Row.policyIds[seat2Row.seatOrder.indexOf(seat2Row.winner)] : null;
      pairs.push({
        aSeat1Win: seat1WinnerPolicy === policyA,
        bSeat1Win: seat1WinnerPolicy === policyB,
        aSeat2Win: seat2WinnerPolicy === policyA,
        bSeat2Win: seat2WinnerPolicy === policyB,
        seatSwapped,
        pairedRunId: seat1Row.pairedRunId ?? null,
        dealSeedNote: 'AB and BA ordinals use distinct derived seeds; pairing is by policy-pair block, not identical deal'
      });
    }
    // Check for odd remainder (incomplete pair)
    if (rows.length % 2 === 1) incompletePairs += 1;
    if (pairs.length === 0) continue;
    // Check if all pairs have verified seat swapping
    const allSwapped = pairs.every((p) => p.seatSwapped);
    const mcnemar = mcnemarPairedTest(pairs);
    const bootstrap = pairedBootstrapABBA(pairs, { iterations: 2000, seed: `abba:${blockKey}` });
    pairResults.push({
      policyPair: blockKey,
      policyA,
      policyB,
      pairedBlocks: pairs.length,
      seatSwapVerified: allSwapped,
      mcnemar,
      bootstrap,
      design: allSwapped ? 'matched AB/BA seat-swap (verified)' : 'AB/BA seat-swap (unverified — legacy or incomplete)',
      interpretation: mcnemar.pValue < 0.05
        ? 'statistically significant seat-policy differential (p < 0.05)'
        : 'no statistically significant seat-policy differential detected'
    });
  }

  const totalPairs = pairResults.reduce((s, r) => s + r.pairedBlocks, 0);
  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    design: 'matched AB/BA seat-swap',
    pairCount: pairResults.length,
    totalPairedBlocks: totalPairs,
    incompletePairs,
    hasPairedRunIds,
    pairResults: pairResults.sort((a, b) => a.policyPair.localeCompare(b.policyPair)),
    interpretationBoundary: hasPairedRunIds
      ? 'AB/BA pairs are linked by pairedRunId. Discordant-pair McNemar and paired bootstrap control for seat assignment. AB and BA ordinals use distinct derived seeds; pairing is by policy-pair block, not by identical deal seed.'
      : 'AB/BA pairs are matched by policy-pair block (legacy — no pairedRunId). Discordant-pair McNemar and paired bootstrap control for seat assignment, not for deal variance. Deal-seed-matched AB/BA requires a future campaign mode that derives BA seeds from the AB seed.'
  };
}

export function buildObservatoryAnalytics({summaries,detailedMatches=[],aggregate=null}){
  const mechanics=buildMechanicsAtlas(summaries,detailedMatches);
  const synergies=analyzeSynergies(summaries,{includeDiagnostics:true});
  const synergyDiagnostics=synergies.diagnostics??[];
  const motifs=mineCausalMotifs(detailedMatches);
  const policies=buildPolicyFingerprints(summaries);
  const anomalies=detectAnomalies(summaries,detailedMatches);
  const unclassifiedCount=mechanics.filter(item=>item.mechanic==='unclassified').reduce((s,item)=>s+item.selectionCount,0);
  const allMechanicTags=[...new Set(mechanics.map(m=>m.mechanic))].sort();
  const quarantineLedger=quarantineUnknownTags(allMechanicTags);
  // Taxonomy dimension breakdown
  const dimensionCounts = {};
  for (const m of mechanics) {
    const dim = m.dimension ?? 'diagnostic';
    dimensionCounts[dim] = (dimensionCounts[dim] ?? 0) + 1;
  }
  // Check for legacy schema data (missing opportunity telemetry)
  const hasOpportunityTelemetry = summaries.some((s) =>
    s.mechanicOpportunityCounts && Object.keys(s.mechanicOpportunityCounts).length > 0
  );
  // Build rank analytics from summaries with rankDecisions
  let rankAnalytics=buildRankAnalytics({summaries,aggregate});
  // Build variant analytics (Rank Anatomy: Spades/Super/effect-level decomposition)
  let variantAnalytics=null;
  let variantAnalyticsError=null;
  try { variantAnalytics=buildVariantAnalytics({summaries,aggregate}); }
  catch(error){ variantAnalyticsError=error.message; console.error('buildObservatoryAnalytics: variant analytics failed:',error); }
  // Expand the single "10" rank-power entry into four per-suit entries
  // (10♣/10♦/10♥/10♠) using variant-level metrics.
  try { rankAnalytics = expandTenSuitsInRankPower(rankAnalytics, variantAnalytics); }
  catch(error){ console.error('buildObservatoryAnalytics: ten-suit expansion failed:',error); }
  // Build paired AB/BA seat-swap analysis
  const pairedABBA=buildPairedABBAAnalysis(summaries);
  // Campaign health summary — counts of entities with each metric available
  const canonicalCount = mechanics.filter(m => m.dimension === 'canonical-mechanic').length;
  const withOpportunityData = mechanics.filter(m => m.hasOpportunityData).length;
  const withValidPickRate = mechanics.filter(m => m.pickRateStatus?.status === 'available').length;
  const withRawAssociation = mechanics.filter(m => m.rawWinAssociationStatus?.status === 'available').length;
  const withAdjustedAssociation = mechanics.filter(m => m.adjustedWinAssociationStatus?.status === 'available').length;
  const withPointImpact = mechanics.filter(m => m.pointImpactStatus?.status === 'available' && m.actorPointImpact != null).length;
  const unmappedDiagnostics = mechanics.filter(m => m.dimension === 'diagnostic' && !m.registryVerified).length;
  const incompleteABBA = pairedABBA?.incompletePairs ?? 0;
  const eligibleSynergyPairs = synergies.length;
  // Near-threshold pairs: rejected for INSUFFICIENT_BOTH but with both ≥ 10
  // (half the default threshold). These are the closest candidates that would
  // become eligible with a larger campaign. The UI surfaces them in a separate
  // "Near-threshold" section so the Synergy Observatory is informative even
  // when no pairs meet the full threshold.
  const nearThresholdPairs = synergyDiagnostics.filter(
    d => d.reasonCode === 'INSUFFICIENT_BOTH' && (d.cohortN?.both ?? 0) >= 10
  ).length;
  const campaignHealth = {
    trackedEntities: mechanics.length,
    canonicalMechanics: canonicalCount,
    entitiesWithOpportunityData: withOpportunityData,
    entitiesWithValidPickRate: withValidPickRate,
    entitiesWithRawAssociation: withRawAssociation,
    entitiesWithAdjustedAssociation: withAdjustedAssociation,
    entitiesWithPointImpact: withPointImpact,
    eligibleSynergyPairs,
    nearThresholdPairs,
    successfullyModeledSynergyPairs: synergies.filter(s => s.evidenceGrade !== 'INSUFFICIENT').length,
    unmappedDiagnostics,
    incompleteABBA,
  };
  const core={
    schemaVersion:ANALYTICS_SCHEMA_VERSION,metricRegistry:metricRegistryWithHashes(),summaryCount:summaries.length,
    aggregateHash:aggregate?.aggregateHash??null,mechanics,synergies,synergyDiagnostics,motifs,policies,anomalies,
    rankPower:rankAnalytics.rankPower,
    swapMatrix:rankAnalytics.swapMatrix,
    rankCounters:rankAnalytics.rankCounters,
    tenSuitExpansion:rankAnalytics.tenSuitExpansion ?? null,
    variantAnalytics,
    variantAnalyticsError,
    pairedABBA,
    mechanicRegistryHash:mechanicRegistryHash(),
    quarantineLedger,
    taxonomyDimensions: dimensionCounts,
    hasOpportunityTelemetry,
    legacySchema: !hasOpportunityTelemetry,
    campaignHealth,
    completeness:{unclassifiedCount,tolerance:0,status:unclassifiedCount===0?'PASS':'FAIL'},
    interpretationBoundary:'Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.'
  };
  return {...core,observatoryHash:hashCanonical(core)};
}

