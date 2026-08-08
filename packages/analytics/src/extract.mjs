import { hashCanonical } from '@intrilex/shared';
import { ANALYTICS_SCHEMA_VERSION,  metricRegistryWithHashes } from './analytics.mjs';

export const EXTRACT_VERSION = '1.0.0';

function pct(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : null;
}

function fmtCI(ci) {
  if (!Array.isArray(ci) || ci.length < 2) return null;
  return `[${Number(ci[0]).toFixed(3)}, ${Number(ci[1]).toFixed(3)}]`;
}

function gradeLabel(grade) {
  const map = { A: 'strong', B: 'moderate', C: 'weak', D: 'very weak' };
  return map[grade] ?? 'insufficient';
}

function describePolicy(policy) {
  const fp = policy.fingerprint ?? {};
  const traits = [];
  if (fp.scoreAggression > 0.6) traits.push('high action frequency');
  else if (fp.scoreAggression < 0.25) traits.push('low action frequency');
  if (fp.responseUse > 0.5) traits.push('response-heavy');
  else if (fp.responseUse < 0.15) traits.push('response-averse');
  if (fp.responseConservation > 0.5) traits.push('conservative with responses');
  if (fp.advancedFrequency > 0.3) traits.push('advanced-heavy');
  if (fp.ultraFrequency > 0.15) traits.push('ultra-heavy');
  if (fp.voltageFrequency > 0.15) traits.push('voltage-heavy');
  if (fp.matchLength > 15) traits.push('long matches');
  else if (fp.matchLength < 8) traits.push('short matches');
  return traits;
}

function describeMechanic(mech) {
  const parts = [];
  const unit = mech.usageUnit === 'participant' ? 'participant observations' : 'matches';
  const opportunities = mech.analysisUnitOpportunityCount ?? mech.matchOpportunityCount;
  parts.push(`Used in ${pct(mech.matchUsageRate)} of ${unit} (${mech.sampleSize}/${opportunities}).`);
  if (mech.outcomeAssociation !== null && Number.isFinite(mech.outcomeAssociation)) {
    const dir = mech.outcomeAssociation > 0 ? 'positive' : 'negative';
    parts.push(`Outcome association: ${dir} (${mech.outcomeAssociation.toFixed(3)}, CI ${fmtCI(mech.outcomeAssociation95)}).`);
  }
  if (mech.immediatePointImpact) {
    const impact = mech.immediatePointImpact;
    parts.push(`Immediate point impact: mean ${impact.mean?.toFixed(2)} over ${impact.n} measured declarations.`);
  }
  parts.push(`Evidence grade: ${mech.evidenceGrade} (${gradeLabel(mech.evidenceGrade)}).`);
  if (mech.status === 'not-observable') parts.push('Status: not observable in current dataset.');
  return parts.join(' ');
}

function describeSynergy(syn) {
  const dir = syn.relationshipClass === 'synergy' ? 'positive synergy' : 'anti-synergy';
  const status = syn.status === 'positive' ? 'statistically significant' : syn.status === 'negative' ? 'statistically significant' : 'inconclusive after FDR correction';
  return `${syn.source} + ${syn.target}: ${dir} (effect ${syn.effect?.toFixed(3)}, shrunk ${syn.shrunkEffect?.toFixed(3)}, CI ${fmtCI(syn.confidenceInterval)}, q=${syn.qValue?.toFixed(4)}). ${status}. Joint sample: ${syn.jointOpportunityCount}.`;
}

function summarizeAnomalies(anomalies) {
  if (!anomalies.length) return { count: 0, byType: {}, summary: 'No anomalies detected.' };
  const byType = {};
  for (const a of anomalies) byType[a.type] = (byType[a.type] ?? 0) + 1;
  const parts = Object.entries(byType).map(([type, count]) => `${type} (${count})`);
  return {
    count: anomalies.length,
    byType,
    summary: `${anomalies.length} anomaly/anomalies: ${parts.join(', ')}.`,
    critical: anomalies.filter(a => a.severity === 'critical').length,
    warnings: anomalies.filter(a => a.severity === 'warning').length,
    info: anomalies.filter(a => a.severity === 'info').length
  };
}

function buildExecutiveSummary({ analytics, aggregate, policyFindings, mechanicFindings, synergyFindings, anomalySummary }) {
  const lines = [];
  const matchCount = aggregate?.matchCount ?? analytics.summaryCount ?? 0;
  const abortCount = aggregate?.abortCount ?? 0;
  lines.push(`Analysis covers ${matchCount} Advanced Core matches under Engine v4.2.6 / Rules v4.2.0.`);
  if (abortCount > 0) lines.push(`${abortCount} match(es) aborted — integrity failures present.`);
  else lines.push('All matches completed without aborts.');

  const topPolicy = [...policyFindings].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
  if (topPolicy) {
    lines.push(`Highest win rate: ${topPolicy.policyId} at ${pct(topPolicy.winRate)} (CI ${fmtCI(topPolicy.winRateCI)}, ${topPolicy.games} games).`);
  }

  const significantSynergies = synergyFindings.filter(s => s.status === 'positive' || s.status === 'negative');
  if (significantSynergies.length) {
    lines.push(`${significantSynergies.length} statistically significant synergy/anti-synergy pair(s) after BH-FDR correction (q<=0.1).`);
  } else {
    lines.push('No synergy pairs reached statistical significance after FDR correction.');
  }

  const measuredMechanics = mechanicFindings.filter(m => m.status === 'measured');
  lines.push(`${measuredMechanics.length} mechanic(s) measured with evidence-backed associations.`);

  if (anomalySummary.count > 0) {
    lines.push(`${anomalySummary.count} anomaly/anomalies flagged (${anomalySummary.critical} critical, ${anomalySummary.warnings} warning, ${anomalySummary.info} info).`);
  } else {
    lines.push('No anomalies flagged.');
  }

  const completeness = analytics.completeness;
  if (completeness && completeness.status === 'FAIL') {
    lines.push(`Data completeness: ${completeness.unclassifiedCount} unclassified fact(s) — tolerance exceeded.`);
  } else {
    lines.push('Data completeness: PASS (no unclassified facts).');
  }

  lines.push(analytics.interpretationBoundary);
  return lines.join(' ');
}

export function extractAnalysis({ analytics, aggregate = null }) {
  const policies = analytics.policies ?? [];
  const mechanics = analytics.mechanics ?? [];
  const synergies = analytics.synergies ?? [];
  const motifs = analytics.motifs ?? [];
  const anomalies = analytics.anomalies ?? [];

  const policyFindings = policies.map(p => ({
    policyId: p.policyId,
    games: p.games,
    wins: p.wins,
    winRate: p.winRate,
    winRateCI: p.winWilson95,
    fingerprint: p.fingerprint,
    keyTraits: describePolicy(p),
    summary: `${p.policyId}: ${p.wins}/${p.games} wins (${pct(p.winRate)}, Wilson CI ${fmtCI(p.winWilson95)}). Traits: ${describePolicy(p).join(', ') || 'none notable'}.`
  }));

  const mechanicFindings = mechanics.map(m => ({
    mechanic: m.mechanic,
    selectionCount: m.selectionCount,
    usageUnit: m.usageUnit ?? 'match',
    analysisUnitOpportunityCount: m.analysisUnitOpportunityCount ?? m.matchOpportunityCount,
    matchUsageRate: m.matchUsageRate,
    matchUsageWilson95: m.matchUsageWilson95,
    outcomeAssociation: m.outcomeAssociation,
    outcomeAssociationCI: m.outcomeAssociation95,
    immediatePointImpact: m.immediatePointImpact,
    evidenceGrade: m.evidenceGrade,
    status: m.status,
    sampleSize: m.sampleSize,
    replayRefs: m.replayRefs,
    summary: describeMechanic(m)
  }));

  const synergyFindings = synergies.map(s => ({
    pair: s.id,
    source: s.source,
    target: s.target,
    relationshipClass: s.relationshipClass,
    effect: s.effect,
    shrunkEffect: s.shrunkEffect,
    confidenceInterval: s.confidenceInterval,
    pValue: s.pValue,
    qValue: s.qValue,
    status: s.status,
    evidenceGrade: s.evidenceGrade,
    jointOpportunityCount: s.jointOpportunityCount,
    baselineCount: s.baselineCount,
    replayRefs: s.replayRefs,
    summary: describeSynergy(s)
  }));

  const motifFindings = motifs.map(m => ({
    motif: m.motif,
    count: m.count,
    matchIds: m.matchIds,
    outcomes: m.outcomes,
    summary: `${m.motif}: observed ${m.count} time(s) across ${m.matchIds?.length ?? 0} match(es).`
  }));

  const anomalySummary = summarizeAnomalies(anomalies);

  const executiveSummary = buildExecutiveSummary({
    analytics, aggregate, policyFindings, mechanicFindings, synergyFindings, anomalySummary
  });

  const recommendations = [];
  if (anomalySummary.critical > 0) recommendations.push('Investigate critical anomalies — engine rejections or unsupported configurations detected.');
  if (analytics.completeness?.status === 'FAIL') recommendations.push('Reduce unclassified facts by expanding mechanic tagging coverage.');
  const inconclusive = synergyFindings.filter(s => s.status === 'inconclusive').length;
  if (inconclusive > synergyFindings.length * 0.8) recommendations.push('Most synergy findings are inconclusive — consider increasing match count for statistical power.');
  const lowSample = mechanicFindings.filter(m => m.sampleSize < 20).length;
  if (lowSample > 0) recommendations.push(`${lowSample} mechanic(s) have sample size below 20 — interpret with caution.`);
  if (!recommendations.length) recommendations.push('No action required — dataset is internally consistent and statistically sound.');

  const core = {
    extractVersion: EXTRACT_VERSION,
    analyticsSchemaVersion: ANALYTICS_SCHEMA_VERSION,
    sourceHash: analytics.observatoryHash ?? null,
    aggregateHash: aggregate?.aggregateHash ?? analytics.aggregateHash ?? null,
    executiveSummary,
    dataset: {
      matchCount: aggregate?.matchCount ?? analytics.summaryCount ?? 0,
      completedMatchCount: aggregate?.completedMatchCount ?? 0,
      abortCount: aggregate?.abortCount ?? 0,
      drawCount: aggregate?.drawCount ?? 0,
      detailedMatchCount: analytics.detailedMatchCount ?? 0,
      policyCount: policies.length,
      mechanicCount: mechanics.length,
      synergyCount: synergies.length,
      motifCount: motifs.length,
      anomalyCount: anomalies.length
    },
    policyFindings,
    mechanicFindings,
    synergyFindings,
    motifFindings,
    anomalies: anomalySummary,
    completeness: analytics.completeness,
    metricRegistry: metricRegistryWithHashes(),
    interpretationBoundary: analytics.interpretationBoundary,
    recommendations
  };

  return { ...core, extractHash: hashCanonical(core) };
}
