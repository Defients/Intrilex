import { hashCanonical } from '@intrilex/shared';

export const POLICY_DIAGNOSTICS_VERSION = '2.0.0';

export function diagnosePolicy(summaries, decisions = [], policyId) {
  const policyDecisions = decisions.filter((d) => d.policyId === policyId);
  const policyMatches = summaries.filter((s) => s.policyIds?.includes(policyId) || s.participants?.some((p) => p.policyId === policyId));

  const diagnostics = {
    policyId,
    schemaVersion: POLICY_DIAGNOSTICS_VERSION,
    matchCount: policyMatches.length,
    decisionCount: policyDecisions.length,
    metrics: {},
    lowMarginDecisions: [],
    highRiskDecisions: [],
    resourceConservation: {},
    timingAnalysis: {},
    limitations: []
  };

  // Normalize decision fields: accept both telemetry decisions and trace data
  const normalizeDecision = (d) => ({
    ...d,
    decisionId: d.decisionId ?? `DT-${d.matchId ?? ''}-${d.decisionIndex ?? 0}`,
    selectionMargin: d.selectionMargin ?? null,
    targetControllerId: d.targetControllerId ?? null,
    actorId: d.actorId ?? null,
    consumedMiniTurn: d.consumedMiniTurn ?? null
  });
  const normalized = policyDecisions.map(normalizeDecision);

  const margins = normalized.map((d) => d.selectionMargin).filter((m) => m !== null && Number.isFinite(m));
  if (margins.length) {
    diagnostics.metrics.decisionMarginMean = margins.reduce((a, b) => a + b, 0) / margins.length;
    diagnostics.metrics.decisionMarginMedian = margins.sort((a, b) => a - b)[Math.floor(margins.length / 2)];
    diagnostics.lowMarginDecisions = normalized.filter((d) => d.selectionMargin !== null && d.selectionMargin > 0 && d.selectionMargin < 5).map((d) => ({
      decisionId: d.decisionId,
      margin: d.selectionMargin,
      action: d.family
    }));
  }

  const counterDecisions = normalized.filter((d) => d.family === 'counter');
  const ownTopCounters = counterDecisions.filter((d) => d.targetControllerId !== null && d.actorId !== null && d.targetControllerId === d.actorId);
  if (counterDecisions.length) {
    diagnostics.metrics.selfCounterRate = ownTopCounters.length / counterDecisions.length;
    diagnostics.highRiskDecisions = ownTopCounters.map((d) => ({
      decisionId: d.decisionId,
      issue: 'self-counter-own-top',
      family: d.family
    }));
  }

  const responseDecisions = normalized.filter((d) => ['counter', 'disrupt', 'interrupt', 'instant', 'quick', 'response-decline'].includes(d.family));
  const declines = responseDecisions.filter((d) => d.family === 'response-decline');
  if (responseDecisions.length) {
    diagnostics.resourceConservation.responseDeclineRate = declines.length / responseDecisions.length;
    diagnostics.resourceConservation.responsePlayRate = (responseDecisions.length - declines.length) / responseDecisions.length;
  }

  const miniTurnActions = normalized.filter((d) => d.consumedMiniTurn === true);
  const exhaustedPasses = miniTurnActions.filter((d) => d.family === 'exhausted-pass');
  if (miniTurnActions.length) {
    diagnostics.metrics.exhaustedPassRate = exhaustedPasses.length / miniTurnActions.length;
  }

  const quickDecisions = normalized.filter((d) => d.timingClass === 'QUICK');
  const interruptDecisions = normalized.filter((d) => d.timingClass === 'INTERRUPT');
  diagnostics.timingAnalysis.quickCount = quickDecisions.length;
  diagnostics.timingAnalysis.interruptCount = interruptDecisions.length;

  const wins = policyMatches.filter((s) => {
    if (s.participants) {
      const p = s.participants.find((part) => part.policyId === policyId);
      return p?.result === 'win';
    }
    return s.winner !== 'DRAW' && s.winner !== 'ABORTED' && s.policyIds[s.seatOrder.indexOf(s.winner)] === policyId;
  }).length;
  const decisive = policyMatches.filter((s) => {
    if (s.participants) return s.participants.some((p) => p.policyId === policyId && (p.result === 'win' || p.result === 'loss'));
    return s.winner !== 'DRAW' && s.winner !== 'ABORTED';
  }).length;
  if (decisive > 0) {
    diagnostics.metrics.winRate = wins / decisive;
    diagnostics.metrics.decisiveMatches = decisive;
  }

  if (policyDecisions.length < 50) {
    diagnostics.limitations.push('Insufficient decision sample for robust statistical claims.');
  }
  if (policyMatches.length < 20) {
    diagnostics.limitations.push('Insufficient match sample for reliable win-rate estimates.');
  }

  return Object.freeze({ ...diagnostics, diagnosticsHash: hashCanonical(diagnostics) });
}

export function comparePolicyDiagnostics(baseline, candidate) {
  return {
    baselinePolicyId: baseline.policyId,
    candidatePolicyId: candidate.policyId,
    baselineWinRate: baseline.metrics.winRate ?? null,
    candidateWinRate: candidate.metrics.winRate ?? null,
    winRateDelta: (candidate.metrics.winRate ?? 0) - (baseline.metrics.winRate ?? 0),
    baselineSelfCounterRate: baseline.metrics.selfCounterRate ?? null,
    candidateSelfCounterRate: candidate.metrics.selfCounterRate ?? null,
    baselineDecisionMarginMean: baseline.metrics.decisionMarginMean ?? null,
    candidateDecisionMarginMean: candidate.metrics.decisionMarginMean ?? null,
    interpretation: 'Policy comparison is descriptive. Win-rate differences require uncertainty quantification and multiple opponents before promotion.',
    limitations: [
      'Win-rate alone is insufficient for policy promotion.',
      'Behavioral metrics must be evaluated across multiple opponents and seat orientations.',
      'A candidate that gains one matchup while degrading general robustness must be rejected or disclosed.'
    ]
  };
}
