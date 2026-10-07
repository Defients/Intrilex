import { hashCanonical } from '@intrilex/shared';
import {
  deterministicClusterBootstrap,
  differenceInProportions,
  formulaHash,
  summarizeNumbers,
  wilsonInterval
} from '@intrilex/statistics';
import { MECHANIC_REGISTRY, mechanicRegistryHash, mechanicDisplayName, mechanicCategory, isExcludedFromDiscovery, validateMechanicTags, quarantineUnknownTags, taxonomyCoverage, classifyTagDimension, analyticsEntityDefinition, synergyExcludedTags, areTagsInseparable } from '@intrilex/decision-intelligence/mechanic-registry';
import { buildRankAnalytics, buildVariantAnalytics, expandTenSuitsInRankPower } from './rank-integration.mjs';
import { buildChoiceAnalysis, decisionChoices } from './choice-analysis.mjs';
import { ANALYTICS_SCHEMA_VERSION, METRIC_DEFINITIONS, metricRegistryWithHashesUsing } from './metric-registry.mjs';
import { analyzeSynergiesCore, gradeMechanicRows, policyRecord, representativeMatches, stratumKey, unitDecisive, unitWon } from './observatory-core.mjs';
import { applyRankBalanceQualification, deriveTagRelations, choiceSupportStatus, CHOICE_SUPPORT_MIN_DECLINES } from './observatory-integrity.mjs';
import { buildComboAtlas } from './combo-analytics.mjs';

export { ANALYTICS_SCHEMA_VERSION };

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

// Metric identity is defined once in ./metric-registry.mjs (shared verbatim with the browser).
export const METRIC_REGISTRY = METRIC_DEFINITIONS;

export function metricRegistryWithHashes() {
  return metricRegistryWithHashesUsing(formulaHash);
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
  const _tagValidation = validateMechanicTags(allTags);
  const _quarantined = quarantineUnknownTags(allTags);
  const rows = mechanicNames.map((mechanic) => {
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
    // Choice support: legal-but-unselected frames are the only evidence that
    // a declining selection was possible-and-observed. Without them a pick
    // rate is descriptive regularity, not identified preference.
    const legalDeclinedCount = hasOpportunityData ? Math.max(0, legalOpportunityCount - selectionCount) : null;
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
      legalDeclinedCount, // legal-but-unselected decision frames (counterfactual choice support)
      choiceSupport: hasOpportunityData
        ? { status: choiceSupportStatus(legalDeclinedCount), declinedCount: legalDeclinedCount, minimum: CHOICE_SUPPORT_MIN_DECLINES }
        : { status: 'unmeasured', reasonCode: 'MISSING_OPPORTUNITY_TELEMETRY', declinedCount: null, minimum: CHOICE_SUPPORT_MIN_DECLINES },
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
        ? { status: 'available', sampleSize: usedDecisive.length + unusedDecisive.length, contributingStrata: adjustedAssociation.contributingStrata ?? null, skippedStrata: adjustedAssociation.skippedStrata ?? null }
        : { status: 'model-failed', reasonCode: 'STRATIFIED_ESTIMATOR_FAILED', detail: 'Stratified estimator could not produce a finite estimate.' },
      sampleSize,
      status: sampleSize ? 'measured' : 'not-observable',
      replayRefs:representativeMatches(units,row=>Number(row.mechanicCounts?.[mechanic]??0)>0),
      counterexampleRefs:representativeMatches(units,row=>Number(row.mechanicCounts?.[mechanic]??0)>0 && unitDecisive(row) && unitWon(row)===0,2),
      formulaHash:metricRegistryWithHashes()['immediate-point-impact'].formulaHash,
      outcomeFormulaHash:metricRegistryWithHashes()['raw-win-association'].formulaHash,
      adjustedFormulaHash:metricRegistryWithHashes()['adjusted-win-association'].formulaHash,
      pickRateFormulaHash:metricRegistryWithHashes()['pick-rate-when-legal'].formulaHash,
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
  // Multiplicity correction over the valid inferential family only
  // (canonical/rank-effect rows with available decisive cohorts, aliases
  // collapsed); descriptive rows carry an explicit non-inferential reason.
  gradeMechanicRows(rows, deriveTagRelations(summaries, units, mechanicNames, { isRegistered: (t) => Boolean(MECHANIC_REGISTRY[t]) }));
  return rows;
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
  // Stratum support accounting: strata with an empty cohort carry no
  // within-stratum comparison and are excluded — the estimator never
  // extrapolates across them.
  let contributingStrata = 0, skippedStrata = 0;
  for (const group of strata.values()) {
    if (!group.used.length || !group.unused.length) { skippedStrata += 1; continue; }
    const usedWins = group.used.reduce((s, r) => s + unitWon(r), 0);
    const unusedWins = group.unused.reduce((s, r) => s + unitWon(r), 0);
    const p1 = usedWins / group.used.length, p0 = unusedWins / group.unused.length;
    const diff = p1 - p0;
    // Inverse variance weight
    const v = (p1 * (1 - p1)) / group.used.length + (p0 * (1 - p0)) / group.unused.length;
    if (v <= 0) { skippedStrata += 1; continue; }
    const w = 1 / v;
    pooledDiff += diff * w;
    pooledWeight += w;
    contributingStrata += 1;
  }
  if (pooledWeight === 0) return { estimate: null, interval: [null, null], contributingStrata: 0, skippedStrata };
  const estimate = pooledDiff / pooledWeight;
  const se = Math.sqrt(1 / pooledWeight);
  const z95 = 1.959963984540054;
  return { estimate, interval: [estimate - z95 * se, estimate + z95 * se], contributingStrata, skippedStrata };
}

export function analyzeSynergies(summaries, options = {}) {
  const units = analysisUnits(summaries, { primary: true });
  const tags = [...new Set(units.flatMap((row) => Object.keys(row.mechanicCounts ?? {})))].sort();
  const relations = deriveTagRelations(summaries, units, tags, { isRegistered: (t) => Boolean(MECHANIC_REGISTRY[t]) });
  return analyzeSynergiesCore(units, {
    excludedTags: synergyExcludedTags(), areTagsInseparable, relations,
    formulaHash: metricRegistryWithHashes()['synergy-interaction'].formulaHash,
  }, options);
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
const _SYNERGY_EXCLUDED_MECHANICS=new Set([
  'draw','discard','recycle','rummage','exhausted','goal','trigger',
  'ACTION','SETUP','INSTANT','QUICK','INTERRUPT',
  'phase','enter-action','points','ordinary','top','decline','response-decline','private-choice','forced-mini-turn',
  'instant','quick','interrupt','score','exhausted-pass','♣','♦','♥','♠'
]);
export function buildPolicyFingerprints(summaries){
  const byPolicy={};
  const blank=(id)=>({policyId:id,games:0,wins:0,miniTurnActions:0,responsePlays:0,responseDeclines:0,privateChoices:0,advanced:0,ultras:0,voltage:0,turns:0,
    // Record fields mirror campaignAggregate() conventions: wins/draws/aborts
    // count cross-policy games only; self-play is tracked but excluded from the
    // superiority record. Seated split enables seat-balance inspection.
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
    // Cross-policy superiority record (self-play excluded, matching campaignAggregate)
    record:policyRecord(x),
    seatSplit:{seat1:x.seat1Games,seat2:x.seat2Games},
    avgScoreMargin:x.games?x.scoreMarginTotal/x.games:null,
    exhaustedPassRate:x.miniTurnActions?x.exhaustedPassActions/x.miniTurnActions:null,
    responsePlayRate:(x.responsePlays+x.responseDeclines)?x.responsePlays/(x.responsePlays+x.responseDeclines):null,
    // Fingerprint rate over ALL participations (self-play and non-decisive
    // included); the superiority estimand is record.winRate.
    winRate:x.games?x.wins/x.games:0,winWilson95:x.games?wilsonInterval(x.wins,x.games):null,winRateBasis:'all-participations-including-self-play',
    fingerprint:{scoreAggression:x.games?x.miniTurnActions/x.games:0,responseUse:x.games?x.responsePlays/x.games:0,responseConservation:x.responsePlays+x.responseDeclines?x.responseDeclines/(x.responsePlays+x.responseDeclines):0,privateChoiceDensity:x.games?x.privateChoices/x.games:0,advancedFrequency:x.games?x.advanced/x.games:0,ultraFrequency:x.games?x.ultras/x.games:0,voltageFrequency:x.games?x.voltage/x.games:0,matchLength:x.games?x.turns/x.games:0}
    };
  }).sort((a,b)=>a.policyId.localeCompare(b.policyId));
}

export function detectAnomalies(summaries,detailedMatches=[]){
  const turns=summarizeNumbers(summaries.map(row=>row.completedFullTurns));
  const threshold=turns.p95??Infinity;
  const anomalies=[];
  for(const row of summaries){
    // category distinguishes true integrity failures from tail-of-distribution
    // diagnostic signals — a p95 marker flags ~5% of any dataset by
    // construction and must not read as engine corruption.
    if(row.completedFullTurns>=threshold)anomalies.push({type:'LONG_MATCH',severity:'warning',category:'diagnostic-signal',matchId:row.matchId,value:row.completedFullTurns,threshold,baseline:threshold,unit:'full turns',detail:`${row.completedFullTurns} completed turns ≥ p95 baseline (${threshold} turns); tail detector flags ~5% of matches by construction`});
    if(row.terminationReason==='UNSUPPORTED_CONFIGURATION'||row.terminationReason==='ENGINE_REJECTION')anomalies.push({type:row.terminationReason,severity:'critical',category:'integrity-failure',matchId:row.matchId,value:row.errorCode,baseline:'accepted run',unit:'termination',detail:`match terminated with ${row.terminationReason}${row.errorCode?` (${row.errorCode})`:''}`});
    if((row.automaticPriorityAdvanceCount??0)>Math.max(30,(row.responseOpportunityCount??0)*8))anomalies.push({type:'ORCHESTRATION_DENSITY',severity:'info',category:'diagnostic-signal',matchId:row.matchId,value:row.automaticPriorityAdvanceCount,threshold:Math.max(30,(row.responseOpportunityCount??0)*8),unit:'automatic priority advances per match',detail:`${row.automaticPriorityAdvanceCount} automatic priority advances > max(30, 8×${row.responseOpportunityCount??0} response opportunities)`});
    if((row.responsePlayedCount??0)>20)anomalies.push({type:'RESPONSE_CHAIN_INTENSITY',severity:'info',category:'diagnostic-signal',matchId:row.matchId,value:row.responsePlayedCount,threshold:20,unit:'response plays per match',detail:`${row.responsePlayedCount} response plays > 20 per match`});
  }
  for(const match of detailedMatches){
    const unclassified=(match.facts?.resolutionFacts??[]).filter(f=>f.mechanicTags?.includes('unclassified')).length;
    if(unclassified)anomalies.push({type:'UNCLASSIFIED_FACT',severity:'warning',category:'integrity-warning',matchId:match.summary.matchId,value:unclassified,unit:'unclassified resolution facts',detail:`${unclassified} resolution fact${unclassified===1?'':'s'} carry the 'unclassified' mechanic tag`});
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

// Paired AB/BA analysis lives in ./paired-abba.mjs — shared verbatim with the
// browser Observatory (dist/shared-analytics). It verifies actual policy↔seat
// assignment per block (fail-closed), aggregates McNemar per matchup, and
// reports seat effects separately. Re-exported here for API stability.
export { buildPairedABBAAnalysis, PAIRED_ABBA_SCHEMA_VERSION, PAIR_BLOCK_REASON, PAIR_DESIGN_STATUS, seatPolicyOf, seatAssignmentOf, declaredLegOf, matchupKeyOf, winningPolicyOf, verifyPairBlock } from './paired-abba.mjs';
import { buildPairedABBAAnalysis } from './paired-abba.mjs';
import { buildExperimentIntegrity, analyzeEarlyVictories, analyzeDecisiveness } from './experiment-integrity.mjs';

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
  // Integrity gate: descriptive RPI stays visible, but ranks whose own or
  // child-variant opportunity accounting is invalid cannot balance-qualify.
  rankAnalytics = { ...rankAnalytics, rankPower: applyRankBalanceQualification(rankAnalytics.rankPower, variantAnalytics) };
  // Build paired AB/BA seat-swap analysis (verifies policy↔seat assignment
  // per block; aggregates paired inference per matchup — not per block)
  const pairedABBA=buildPairedABBAAnalysis(summaries);
  const comboAtlas=buildComboAtlas(summaries);
  // Conditional choice-set analysis: what was simultaneously legal when each
  // option was selected, and how deterministic each policy is inside a
  // recurring offered set. Diagnostic only — deterministic Profile choices
  // are decision behavior, not balance evidence.
  let choiceAnalysis=null;
  let choiceAnalysisError=null;
  try { choiceAnalysis=buildChoiceAnalysis(decisionChoices(summaries)); }
  catch(error){ choiceAnalysisError=error.message; console.error('buildObservatoryAnalytics: choice analysis failed:',error); }
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
    // Rows returned by analyzeSynergies all have modelStatus='modeled' —
    // pairs that fail cohort gates or whose estimator fails are rejected into
    // synergyDiagnostics before modeling. "Successfully modeled" therefore
    // means the interaction model produced finite output, NOT that the result
    // is statistically significant; evidenceQualifiedSynergyPairs counts pairs
    // whose evidence grade rose above INSUFFICIENT.
    successfullyModeledSynergyPairs: synergies.filter(s => s.modelStatus === 'modeled').length,
    rejectedSynergyPairs: synergyDiagnostics.length,
    synergyCandidatePairs: synergies.candidateSet?.pairCount ?? null,
    synergyCellStatusCounts: [...synergies, ...synergyDiagnostics].reduce((acc, row) => { acc[row.cellStatus] = (acc[row.cellStatus] ?? 0) + 1; return acc; }, {}),
    evidenceQualifiedSynergyPairs: synergies.filter(s => s.evidenceGrade !== 'INSUFFICIENT').length,
    unmappedDiagnostics,
    incompleteABBA,
  };
  // Taxonomy reconciliation: every tracked entity lands in exactly one
  // dimension bucket, so the identity tracked = Σ dimensionCounts always holds.
  // UI surfaces display canonical + aggregate rows; diagnostic/rank-effect/
  // action-* entities are tracked and measured but not presented as mechanics.
  const reconciliation = {
    trackedEntities: mechanics.length,
    byDimension: dimensionCounts,
    registered: mechanics.filter(m => m.registryVerified).length,
    unregisteredTags: quarantineLedger.length,
    taxonomyCoverage: taxonomyCoverage(allMechanicTags),
    invariantHolds: mechanics.length === Object.values(dimensionCounts).reduce((a, b) => a + b, 0),
  };
  const core={
    schemaVersion:ANALYTICS_SCHEMA_VERSION,metricRegistry:metricRegistryWithHashes(),summaryCount:summaries.length,
    // Provenance echo: make the artifact self-describing so any surface can
    // answer "where did this number come from?" without joining aggregate.json
    evidenceEpoch:aggregate?.evidenceEpoch??null,postRulesParityRepair:aggregate?.postRulesParityRepair??null,
    engineVersion:aggregate?.engineVersion??null,rulesVersion:aggregate?.rulesVersion??null,
    profileId:aggregate?.profileId??null,authorityHash:aggregate?.authorityHash??null,
    releaseIdentityHash:aggregate?.releaseIdentityHash??null,
    aggregateHash:aggregate?.aggregateHash??null,mechanics,synergies,synergyDiagnostics,synergyCandidateSet:synergies.candidateSet??null,motifs,policies,anomalies,
    rankPower:rankAnalytics.rankPower,
    swapMatrix:rankAnalytics.swapMatrix,
    rankCounters:rankAnalytics.rankCounters,
    tenSuitExpansion:rankAnalytics.tenSuitExpansion ?? null,
    variantAnalytics,
    variantAnalyticsError,
    pairedABBA,
    choiceAnalysis,
    choiceAnalysisError,
    combo:comboAtlas,
    // Experiment self-audit: derived only from exported evidence — never
    // claims PASS unless the data proves it (post-seat-swap-repair).
    experimentIntegrity:buildExperimentIntegrity(summaries,{aggregate,pairedABBA,combo:comboAtlas}),
    // Descriptive diagnostics: early-victory buckets + decisiveness/margin
    // profile turn corpus oddities into analyzable signals.
    earlyVictories:analyzeEarlyVictories(summaries),
    decisiveness:analyzeDecisiveness(summaries),
    mechanicRegistryHash:mechanicRegistryHash(),
    quarantineLedger,
    taxonomyDimensions: dimensionCounts,
    hasOpportunityTelemetry,
    legacySchema: !hasOpportunityTelemetry,
    campaignHealth,
    reconciliation,
    completeness:{unclassifiedCount,tolerance:0,status:unclassifiedCount===0?'PASS':'FAIL'},
    interpretationBoundary:'Mechanics and synergy outputs are policy-, seat-, profile-, and telemetry-conditioned. They are evidence-backed associations, not automatic canon or balance changes. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.'
  };
  return {...core,observatoryHash:hashCanonical(core)};
}

