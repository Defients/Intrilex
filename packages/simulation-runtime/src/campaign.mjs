import { Worker } from 'node:worker_threads';
import { hashCanonical } from '@intrilex/shared';
import { LAB_VERSION, RULES_VERSION, ENGINE_VERSION } from '@intrilex/shared/version';
import { summarizeNumbers, wilsonInterval } from '@intrilex/statistics';
import { deriveMatchSeed, runPolicyMatch } from './runtime.mjs';

const COMPLETE_REASONS = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
const increment = (record, key, amount = 1) => { record[key] = (record[key] ?? 0) + amount; };

function workerRun(matches) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module', execArgv: [], workerData: { matches } });
    let payload, settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate().catch(() => {});
      reject(new Error('CAMPAIGN_WORKER_TIMEOUT'));
    }, 120_000);
    worker.once('message', (value) => { payload = value; });
    worker.once('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    worker.once('exit', (code) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (code !== 0) reject(new Error(`Worker exited ${code}`));
      else if (!payload) reject(new Error('CAMPAIGN_WORKER_NO_RESULT'));
      else resolve(payload);
    });
  });
}

export async function runCampaign(config) {
  const semantic = {
    schemaVersion: '4.1.0', profileId: config.profileId ?? 'core-advanced-authority', matchCount: config.matchCount,
    seatOrder: config.seatOrder ?? ['P1', 'P2'], policyPairs: config.policyPairs,
    decisionLimit: config.decisionLimit ?? 1800, engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION,
    labVersion: LAB_VERSION, policySurfaceVersion: '4.0.0', telemetrySchemaVersion: '4.1.0', analyticsSchemaVersion: '4.1.0'
  };
  const experimentHash = hashCanonical(semantic);
  const ordinalStart = config.ordinalStart ?? 0, ordinalEnd = config.ordinalEnd ?? config.matchCount;
  if (!Number.isInteger(ordinalStart) || !Number.isInteger(ordinalEnd) || ordinalStart < 0 || ordinalEnd > config.matchCount || ordinalEnd <= ordinalStart) throw new RangeError('Invalid campaign ordinal range');
  const specs = Array.from({ length: ordinalEnd - ordinalStart }, (_, index) => {
    const ordinal = ordinalStart + index;
    const pair = config.policyPairs[ordinal % config.policyPairs.length];
    const swap = Math.floor(ordinal / config.policyPairs.length) % 2 === 1;
    const seatOrder = swap ? ['P2', 'P1'] : ['P1', 'P2'];
    // pairedRunId links AB and BA runs: ordinals k and k+P (where P = policyPairs.length)
    // form a matched AB/BA pair sharing the same pairedRunId.
    const pairBlockIndex = Math.floor(ordinal / config.policyPairs.length);
    const pairedRunId = `PR-${experimentHash.slice(0, 16)}-${pair[0]}-${pair[1]}-block-${Math.floor(pairBlockIndex / 2)}`;
    return { ordinal, profileId: semantic.profileId, seed: deriveMatchSeed(experimentHash, ordinal), seatOrder, policyIds: pair, decisionLimit: semantic.decisionLimit, includeReplay: false, workerCount: config.workerCount ?? 1, runInstanceId: config.runInstanceId ?? experimentHash, pairedRunId, seatSwapped: swap };
  });
  const workerCount = Math.max(1, Math.min(config.workerCount ?? 1, specs.length));
  let records;
  if (workerCount === 1) records = specs.map((spec) => {
    try { return { ordinal: spec.ordinal, result: runPolicyMatch(spec).summary }; }
    catch (error) { return { ordinal: spec.ordinal, error: error.code ?? error.message ?? 'MATCH_ERROR' }; }
  });
  else {
    const groups = Array.from({ length: workerCount }, () => []);
    for (const spec of specs) groups[spec.ordinal % workerCount].push(spec);
    records = (await Promise.all(groups.filter((group) => group.length).map(workerRun))).flat();
  }
  const errored = records.filter((r) => r.error);
  if (errored.length) console.warn(`  ⚠ ${errored.length} match(es) errored: ${errored.map((r) => `${r.ordinal}:${r.error}`).join(', ')}`);
  records.sort((a, b) => a.ordinal - b.ordinal);
  const failures = records.filter((r) => r.error);
  const successes = records.filter((r) => r.result);
  const summaries = successes.map((record) => record.result);
  if (new Set(summaries.map((summary) => summary.matchOrdinal)).size !== summaries.length) throw new Error('DUPLICATE_MATCH_ORDINAL');
  const canonicalResultHash = hashCanonical(summaries.map(({ matchResultHash }) => matchResultHash));
  // Unified records array: preserves ALL records (successes AND errors) with
  // semantic outcome fields. Errored matches are NOT silently dropped.
  const campaignRecords = records.map((r) => {
    if (r.error) {
      return { ordinal: r.ordinal, result: 'error', error: r.error, summary: null };
    }
    const s = r.result;
    const semanticResult = s.winner === 'ABORTED' ? 'aborted'
      : COMPLETE_REASONS.has(s.terminationReason) ? 'completed'
      : 'unsupported';
    return { ordinal: r.ordinal, result: semanticResult, summary: s, error: null };
  });
  const completedCount = campaignRecords.filter((r) => r.result === 'completed').length;
  const abortedCount = campaignRecords.filter((r) => r.result === 'aborted').length;
  const unsupportedCount = campaignRecords.filter((r) => r.result === 'unsupported').length;
  const errorCount = failures.length;
  const totalAccounted = completedCount + abortedCount + unsupportedCount + errorCount;
  const accountingInvariant = totalAccounted === records.length;
  const campaignStatus = errorCount > 0 ? 'FAIL' : (abortedCount > 0 || unsupportedCount > 0) ? 'PARTIAL' : 'PASS';
  return {
    schemaVersion: '4.1.0', semantic, experimentHash, workerCount,
    semanticMatchCount: config.matchCount, ordinalRange: [ordinalStart, ordinalEnd],
    matchCount: successes.length, requestedMatchCount: config.matchCount,
    completedCount, abortedCount, unsupportedCount, errorCount,
    failedCount: failures.length,
    accountingInvariant,
    failures: failures.map((r) => ({ ordinal: r.ordinal, error: r.error })),
    records: campaignRecords,
    summaries, canonicalResultHash,
    campaignStatus
  };
}

export function campaignAggregate(campaign) {
  const completed = campaign.summaries.filter((match) => COMPLETE_REASONS.has(match.terminationReason));
  const decisive = completed.filter((match) => match.terminationReason !== 'CANONICAL_DRAW');
  const seatWins = { '1': 0, '2': 0 }, terminations = {}, actionCounts = {}, decisionFamilyCounts = {}, actionModeCounts = {}, decisionModeCounts = {}, responseActionCounts = {}, eventTypeCounts = {}, mechanicCounts = {}, primaryMechanicCounts = {}, mechanicOpportunityCounts = {}, primaryMechanicOpportunityCounts = {};
  const policy = {}, matchups = {};
  const distributionFields = {
    completedFullTurns: [], policyDecisions: [], policyActions: [], miniTurnActions: [], exhaustedPassActions: [],
    responseOpportunities: [], responsePlayed: [], responseDeclinedWithOptions: [], automaticPriorityAdvances: [], responseWindowsClosed: [],
    privateChoices: [], triggerActivity: [], advancedDecisions: [], voltageDecisions: [], ultraDecisions: [], scoreMargin: []
  };
  const semanticTotals = {
    miniTurnActionCount:0, exhaustedPassActionCount:0, responseOpportunityCount:0, responsePlayedCount:0,
    responseDeclinedWithOptionsCount:0, automaticPriorityAdvanceCount:0, responseWindowClosedCount:0,
    counterDeclarationCount:0, quickDeclarationCount:0, instantDeclarationCount:0, interruptDeclarationCount:0,
    policyDecisionCount:0, policyActionCount:0, actionCount:0, passActionCount:0, miniTurnCount:0,
    meaningfulResponseDecisionCount:0, automaticOrchestrationCommandCount:0
  };
  const ruleCompliance = { checkedMatchCount: campaign.summaries.length, passedMatchCount: 0, failedMatchCount: 0, violationCount: 0 };

  for (const match of campaign.summaries) {
    increment(terminations, match.terminationReason);
    distributionFields.completedFullTurns.push(match.completedFullTurns);
    distributionFields.policyDecisions.push(match.policyDecisionCount ?? 0);
    distributionFields.policyActions.push(match.policyActionCount ?? 0);
    distributionFields.miniTurnActions.push(match.miniTurnActionCount ?? 0);
    distributionFields.exhaustedPassActions.push(match.exhaustedPassActionCount ?? 0);
    distributionFields.responseOpportunities.push(match.responseOpportunityCount ?? 0);
    distributionFields.responsePlayed.push(match.responsePlayedCount ?? 0);
    distributionFields.responseDeclinedWithOptions.push(match.responseDeclinedWithOptionsCount ?? 0);
    distributionFields.automaticPriorityAdvances.push(match.automaticPriorityAdvanceCount ?? 0);
    distributionFields.responseWindowsClosed.push(match.responseWindowClosedCount ?? 0);
    distributionFields.privateChoices.push(match.privateChoiceDecisionCount ?? 0);
    distributionFields.triggerActivity.push(match.triggerCount ?? 0);
    distributionFields.advancedDecisions.push(match.advancedDecisionCount ?? 0);
    distributionFields.voltageDecisions.push(match.voltageDecisionCount ?? 0);
    distributionFields.ultraDecisions.push(match.ultraDecisionCount ?? 0);
    distributionFields.scoreMargin.push(match.scoreMargin);
    for (const key of Object.keys(semanticTotals)) semanticTotals[key] += Number(match[key] ?? 0);
    for (const [key, value] of Object.entries(match.actionCounts ?? {})) increment(actionCounts, key, value);
    for (const [key, value] of Object.entries(match.decisionFamilyCounts ?? {})) increment(decisionFamilyCounts, key, value);
    for (const [key, value] of Object.entries(match.actionModeCounts ?? {})) increment(actionModeCounts, key, value);
    for (const [key, value] of Object.entries(match.decisionModeCounts ?? {})) increment(decisionModeCounts, key, value);
    for (const [key, value] of Object.entries(match.responseActionCounts ?? {})) increment(responseActionCounts, key, value);
    for (const [key, value] of Object.entries(match.eventTypeCounts ?? {})) increment(eventTypeCounts, key, value);
    for (const [key, value] of Object.entries(match.mechanicCounts ?? {})) increment(mechanicCounts, key, value);
    for (const [key, value] of Object.entries(match.primaryMechanicCounts ?? {})) increment(primaryMechanicCounts, key, value);
    for (const [key, value] of Object.entries(match.mechanicOpportunityCounts ?? {})) increment(mechanicOpportunityCounts, key, value);
    for (const [key, value] of Object.entries(match.primaryMechanicOpportunityCounts ?? {})) increment(primaryMechanicOpportunityCounts, key, value);
    if (match.ruleCompliance?.status === 'PASS') ruleCompliance.passedMatchCount += 1;
    else {
      ruleCompliance.failedMatchCount += 1;
      ruleCompliance.violationCount += Number(match.ruleCompliance?.violationCount ?? 1);
    }
    for (const id of match.policyIds) policy[id] ??= { games: 0, wins: 0, draws: 0, aborts: 0, miniTurnActions:0, responsesPlayed:0, responsesDeclined:0 };
    policy[match.policyIds[0]].games += 1; policy[match.policyIds[1]].games += 1;
    const hasParticipants = Array.isArray(match.participants) && match.participants.length === 2;
    if (hasParticipants) {
      for (const p of match.participants) {
        policy[p.policyId].miniTurnActions += p.miniTurnActionCount ?? 0;
        policy[p.policyId].responsesPlayed += p.responsePlayCount ?? 0;
        policy[p.policyId].responsesDeclined += p.responseDeclineCount ?? 0;
      }
    } else {
      const miniTurnActions = match.miniTurnActionCount ?? 0;
      const responsesPlayed = match.responsePlayedCount ?? 0;
      const responsesDeclined = match.responseDeclinedWithOptionsCount ?? 0;
      policy[match.policyIds[0]].miniTurnActions += miniTurnActions;
      policy[match.policyIds[1]].miniTurnActions += miniTurnActions;
      policy[match.policyIds[0]].responsesPlayed += responsesPlayed;
      policy[match.policyIds[1]].responsesPlayed += responsesPlayed;
      policy[match.policyIds[0]].responsesDeclined += responsesDeclined;
      policy[match.policyIds[1]].responsesDeclined += responsesDeclined;
    }
    const matchupKey = `${match.policyIds[0]}__vs__${match.policyIds[1]}`;
    matchups[matchupKey] ??= { games: 0, seat1Wins: 0, seat2Wins: 0, draws: 0, aborts: 0, totalFullTurns:0, totalResponses:0, totalChoices:0 };
    const matchup = matchups[matchupKey]; matchup.games += 1; matchup.totalFullTurns += match.completedFullTurns; matchup.totalResponses += match.meaningfulResponseDecisionCount ?? 0; matchup.totalChoices += match.privateChoiceDecisionCount ?? 0;
    if (!COMPLETE_REASONS.has(match.terminationReason)) {
      matchup.aborts += 1; policy[match.policyIds[0]].aborts += 1; policy[match.policyIds[1]].aborts += 1;
    } else if (match.terminationReason === 'CANONICAL_DRAW') {
      matchup.draws += 1; policy[match.policyIds[0]].draws += 1; policy[match.policyIds[1]].draws += 1;
    } else {
      increment(seatWins, String(match.winningSeat)); matchup[match.winningSeat === 1 ? 'seat1Wins' : 'seat2Wins'] += 1;
      const winnerIndex = match.seatOrder.indexOf(match.winner); policy[match.policyIds[winnerIndex]].wins += 1;
    }
  }
  for (const item of Object.values(policy)) {
    item.winRate = item.games ? item.wins / item.games : 0;
    item.wilson95 = wilsonInterval(item.wins, Math.max(1, item.games - item.draws - item.aborts));
  }
  for (const item of Object.values(matchups)) {
    item.meanFullTurns = item.games ? item.totalFullTurns / item.games : 0;
    item.meanResponses = item.games ? item.totalResponses / item.games : 0;
    item.meanPrivateChoices = item.games ? item.totalChoices / item.games : 0;
    item.seat1Wilson95 = wilsonInterval(item.seat1Wins, Math.max(1, item.seat1Wins + item.seat2Wins));
  }
  const core = {
    schemaVersion: '4.1.0', telemetrySchemaVersion: '4.1.0', analyticsSchemaVersion: '4.1.0',
    experimentHash: campaign.experimentHash, profileId: campaign.semantic.profileId, engineVersion: campaign.semantic.engineVersion,
    rulesVersion: campaign.semantic.rulesVersion, labVersion: campaign.semantic.labVersion,
    matchCount: campaign.summaries.length, completedMatchCount: completed.length, abortCount: campaign.summaries.length - completed.length,
    drawCount: terminations.CANONICAL_DRAW ?? 0, terminationCounts: Object.fromEntries(Object.entries(terminations).sort()),
    seatWins, seat1WinRate: decisive.length ? seatWins['1'] / decisive.length : 0,
    seat1Wilson95: wilsonInterval(seatWins['1'], decisive.length), semanticTotals,
    distributions: Object.fromEntries(Object.entries(distributionFields).map(([key, values]) => [key, summarizeNumbers(values)])),
    actionCounts: Object.fromEntries(Object.entries(actionCounts).sort()),
    decisionFamilyCounts: Object.fromEntries(Object.entries(decisionFamilyCounts).sort()),
    actionModeCounts: Object.fromEntries(Object.entries(actionModeCounts).sort()),
    decisionModeCounts: Object.fromEntries(Object.entries(decisionModeCounts).sort()),
    responseActionCounts: Object.fromEntries(Object.entries(responseActionCounts).sort()),
    eventTypeCounts: Object.fromEntries(Object.entries(eventTypeCounts).sort()),
    mechanicCounts: Object.fromEntries(Object.entries(mechanicCounts).sort()),
    primaryMechanicCounts: Object.fromEntries(Object.entries(primaryMechanicCounts).sort()),
    mechanicOpportunityCounts: Object.fromEntries(Object.entries(mechanicOpportunityCounts).sort()),
    primaryMechanicOpportunityCounts: Object.fromEntries(Object.entries(primaryMechanicOpportunityCounts).sort()),
    ruleCompliance: { ...ruleCompliance, status: ruleCompliance.failedMatchCount === 0 ? 'PASS' : 'FAIL' },
    policies: Object.fromEntries(Object.entries(policy).sort()), matchups: Object.fromEntries(Object.entries(matchups).sort()),
    canonicalResultHash: campaign.canonicalResultHash,
    interpretationBoundary: 'Policy-conditioned Advanced Core observation. Associations are not causal proof; unsupported branches remain fail-closed.'
  };
  return { ...core, aggregateHash: hashCanonical(core) };
}

