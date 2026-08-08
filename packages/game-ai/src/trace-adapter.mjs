/**
 * HYBRIX AI — Trace Adapter
 *
 * Bridges HYBRIX why-traces with the existing decision-intelligence
 * decision trace system. Extracts HYBRIX metadata from simulation
 * match results and presents it in a unified, queryable format.
 *
 * Designers can call extractHybrixTraces(matchResult) to get
 * HYBRIX-specific decision explanations alongside standard traces.
 */

import { REASON_CODE_VOCABULARY } from '@intrilex/decision-intelligence/reason-codes';

/**
 * Extract HYBRIX traces from a simulation match result.
 * @param {object} matchResult - Result from runPolicyMatch()
 * @returns {Array} Array of HYBRIX trace entries with match context
 */
export function extractHybrixTraces(matchResult) {
  if (!matchResult?.decisions) return [];

  const traces = [];
  for (const decision of matchResult.decisions) {
    const hybrixTrace = decision.candidateScores?.find(c => c && c.hybrixTrace)?.hybrixTrace
      ?? extractTraceFromMetadata(decision);

    if (hybrixTrace || decision.policyId?.startsWith('hybrix-')) {
      traces.push({
        matchId: decision.matchId,
        decisionIndex: decision.decisionIndex,
        actorId: decision.actorId,
        policyId: decision.policyId,
        actionId: decision.actionId,
        family: decision.family,
        reasonCode: decision.reasonCode,
        hybrix: hybrixTrace ? normalizeHybrixTrace(hybrixTrace, decision) : null,
        standard: {
          reasonCode: decision.reasonCode,
          candidateScores: decision.candidateScores ?? [],
          legalActionCount: decision.legalActionCount
        }
      });
    }
  }

  return traces;
}

/**
 * Extract HYBRIX trace from decision metadata.
 * The HYBRIX choose() function embeds the trace in metadata.hybrixTrace.
 */
function extractTraceFromMetadata(decision) {
  // The runtime stores selected.metadata in the decision record
  // but only preserves candidateScores and reasonCode at the top level.
  // The full hybrixTrace is in the metadata object passed through.
  // Since the runtime doesn't forward arbitrary metadata fields,
  // we reconstruct what we can from available fields.
  if (!decision.policyId?.startsWith('hybrix-')) return null;

  return {
    btNode: 'TACTICAL',
    selectedAction: decision.actionId,
    score: decision.candidateScores?.[0]?.score ?? 0,
    margin: decision.candidateScores?.length > 1
      ? (decision.candidateScores[0]?.score ?? 0) - (decision.candidateScores[1]?.score ?? 0)
      : 0,
    alternatives: (decision.candidateScores ?? []).slice(0, 5).map(s => ({
      action: s.actionId,
      score: s.score
    })),
    personalityModifiers: {},
    memoryPatterns: [],
    adaptiveNudges: {},
    coordinationRole: 'LONE_WOLF',
    difficultyError: false,
    tick: decision.decisionIndex,
    failsafeTriggered: false,
    reconstructed: true
  };
}

/**
 * Normalize a HYBRIX trace into a standard format.
 */
function normalizeHybrixTrace(trace, decision) {
  return {
    btNode: trace.btNode ?? 'UNKNOWN',
    selectedAction: trace.selectedAction ?? decision.actionId,
    score: trace.score ?? 0,
    baseScore: trace.baseScore ?? null,
    scoringPolicyId: trace.scoringPolicyId ?? null,
    margin: trace.margin ?? 0,
    alternatives: trace.alternatives ?? [],
    personalityModifiers: trace.personalityModifiers ?? {},
    memoryPatterns: trace.memoryPatterns ?? [],
    adaptiveNudges: trace.adaptiveNudges ?? {},
    coordinationRole: trace.coordinationRole ?? 'LONE_WOLF',
    coordinationGoal: trace.coordinationGoal ?? null,
    difficultyError: trace.difficultyError ?? false,
    specialReason: trace.specialReason ?? null,
    failsafeTriggered: trace.failsafeTriggered ?? false,
    failsafeReason: trace.failsafeReason ?? null,
    lodTier: trace.lodTier ?? 'full',
    personalitySummary: trace.personalitySummary ?? null,
    elapsedMs: trace.elapsedMs ?? 0,
    tick: trace.tick ?? decision.decisionIndex,
    reconstructed: trace.reconstructed ?? false
  };
}

/**
 * Generate a human-readable explanation for a HYBRIX decision trace.
 * @param {object} hybrixTrace - Normalized HYBRIX trace
 * @returns {string} Multi-line explanation
 */
export function explainHybrixTrace(hybrixTrace) {
  if (!hybrixTrace) return 'No HYBRIX trace available.';

  const parts = [];

  parts.push(`BT Node: ${hybrixTrace.btNode}`);
  parts.push(`Action: ${hybrixTrace.selectedAction} (score=${hybrixTrace.score}, margin=${hybrixTrace.margin})`);

  if (hybrixTrace.baseScore != null) {
    parts.push(`Base score: ${hybrixTrace.baseScore}${hybrixTrace.scoringPolicyId ? ` (via ${hybrixTrace.scoringPolicyId})` : ''}`);
  }

  if (hybrixTrace.difficultyError) {
    parts.push(`Note: Difficulty error injection caused suboptimal selection.`);
  }

  if (hybrixTrace.specialReason) {
    parts.push(`Special: ${hybrixTrace.specialReason}`);
  }

  if (hybrixTrace.alternatives?.length > 1) {
    parts.push(`Alternatives: ${hybrixTrace.alternatives.slice(1, 5).map(a => `${a.action}(${a.score})`).join(', ')}`);
  }

  const mods = hybrixTrace.personalityModifiers;
  if (mods && Object.keys(mods).length > 0) {
    parts.push(`Personality: ${Object.entries(mods).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  if (hybrixTrace.memoryPatterns?.length > 0) {
    parts.push(`Memory patterns: ${hybrixTrace.memoryPatterns.map(p => `${p.type}(${p.confidence?.toFixed?.(2) ?? p.value?.toFixed?.(2) ?? '?'})`).join(', ')}`);
  }

  if (hybrixTrace.adaptiveNudges && Object.values(hybrixTrace.adaptiveNudges).some(v => v !== 0)) {
    const n = hybrixTrace.adaptiveNudges;
    parts.push(`Adaptive nudges: acc=${n.accuracy?.toFixed(2) ?? 0} agg=${n.aggression?.toFixed(2) ?? 0} spc=${n.spacing?.toFixed(2) ?? 0}`);
  }

  parts.push(`Coordination: role=${hybrixTrace.coordinationRole}${hybrixTrace.coordinationGoal ? ` goal=${hybrixTrace.coordinationGoal}` : ''}`);

  if (hybrixTrace.failsafeTriggered) {
    parts.push(`FAILSAFE: ${hybrixTrace.failsafeReason ?? 'unknown'}`);
  }

  if (hybrixTrace.lodTier && hybrixTrace.lodTier !== 'full') {
    parts.push(`LOD: ${hybrixTrace.lodTier}`);
  }

  if (hybrixTrace.personalitySummary) {
    parts.push(`Personality: ${hybrixTrace.personalitySummary}`);
  }

  if (hybrixTrace.elapsedMs != null && hybrixTrace.elapsedMs > 0) {
    parts.push(`Decision time: ${hybrixTrace.elapsedMs.toFixed(3)}ms`);
  }

  if (hybrixTrace.reconstructed) {
    parts.push(`(Reconstructed from standard trace data)`);
  }

  return parts.join('\n');
}

/**
 * Summarize HYBRIX decision patterns across a match.
 * @param {Array} hybrixTraces - Output of extractHybrixTraces()
 * @returns {object} Summary statistics
 */
export function summarizeHybrixDecisions(hybrixTraces) {
  if (!hybrixTraces.length) return null;

  const btNodeCounts = {};
  const actionCounts = {};
  let totalMargin = 0;
  let difficultyErrors = 0;
  let failsafeTriggers = 0;
  let totalElapsedMs = 0;
  let tracedCount = 0;

  for (const entry of hybrixTraces) {
    if (!entry.hybrix) continue;
    const t = entry.hybrix;
    tracedCount++;

    btNodeCounts[t.btNode] = (btNodeCounts[t.btNode] ?? 0) + 1;
    actionCounts[entry.family] = (actionCounts[entry.family] ?? 0) + 1;
    totalMargin += t.margin;
    if (t.difficultyError) difficultyErrors++;
    if (t.failsafeTriggered) failsafeTriggers++;
    if (t.elapsedMs) totalElapsedMs += t.elapsedMs;
  }

  return {
    totalDecisions: hybrixTraces.length,
    tracedDecisions: tracedCount,
    btNodeDistribution: btNodeCounts,
    actionDistribution: actionCounts,
    avgMargin: tracedCount > 0 ? Number((totalMargin / tracedCount).toFixed(2)) : 0,
    difficultyErrorRate: tracedCount > 0 ? Number((difficultyErrors / tracedCount).toFixed(3)) : 0,
    failsafeRate: tracedCount > 0 ? Number((failsafeTriggers / tracedCount).toFixed(3)) : 0,
    avgDecisionMs: tracedCount > 0 ? Number((totalElapsedMs / tracedCount).toFixed(3)) : 0
  };
}

/**
 * Map HYBRIX reason codes to the existing REASON_CODE_VOCABULARY.
 * This ensures HYBRIX decisions are searchable in the existing
 * decision-intelligence tooling.
 */
export function mapHybrixReasonCodes(hybrixTrace) {
  const codes = [];

  if (!hybrixTrace) return codes;

  // Map BT node to reason code category
  const btNodeMap = {
    SURVIVAL: 'RISK_AVERSE',
    COORDINATION: 'BOARD_CONTROL_MAINTAIN',
    MACRO_GOAL: 'EFFECT_GOAL_PROGRESS',
    TACTICAL: 'BOARD_CONTROL_GAIN',
    IDLE_ROAM: 'UNIFORM_RANDOM',
    FALLBACK: 'EXHAUSTED_FORCED'
  };

  const btCode = btNodeMap[hybrixTrace.btNode];
  if (btCode && REASON_CODE_VOCABULARY[btCode]) {
    codes.push(btCode);
  }

  // Map failsafe triggers
  if (hybrixTrace.failsafeTriggered) {
    codes.push('RISK_AVERSE');
  }

  // Map difficulty errors
  if (hybrixTrace.difficultyError) {
    codes.push('LOW_MARGIN_ALTERNATIVE');
  }

  return codes;
}
