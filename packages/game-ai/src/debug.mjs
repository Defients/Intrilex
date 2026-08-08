/**
 * HYBRIX AI — Debug, Telemetry & Tuning
 *
 * Provides why-traces, debug visualization concepts, telemetry
 * metrics, and tuning infrastructure. Designers can always answer:
 * "Why did the bot do that?"
 */

export function createDebugSystem(botId, config) {
  const debugConfig = config.debug;
  const traceHistory = [];
  const metrics = {
    decisionsTotal: 0,
    failsafeTriggers: 0,
    actionCounts: {},
    actionDiversity: 0,
    entropy: 0,
    avgDecisionMs: 0,
    totalDecisionMs: 0,
    wins: 0,
    losses: 0,
    timeToKill: [],
    btNodeUsage: {}
  };

  function recordTrace(trace) {
    if (!debugConfig.whyTracesEnabled) return;

    traceHistory.push(trace);
    if (traceHistory.length > (debugConfig.maxTraceHistory ?? 100)) {
      traceHistory.shift();
    }

    metrics.decisionsTotal++;
    const actionKey = trace.selectedAction ?? trace.selectedType ?? 'unknown';
    metrics.actionCounts[actionKey] = (metrics.actionCounts[actionKey] ?? 0) + 1;

    const btNode = trace.btNode ?? 'UNKNOWN';
    metrics.btNodeUsage[btNode] = (metrics.btNodeUsage[btNode] ?? 0) + 1;

    if (trace.failsafeTriggered) {
      metrics.failsafeTriggers++;
    }

    if (trace.elapsedMs != null) {
      metrics.totalDecisionMs += trace.elapsedMs;
      metrics.avgDecisionMs = metrics.totalDecisionMs / metrics.decisionsTotal;
    }

    // Recompute action diversity (unique actions / total)
    metrics.actionDiversity = Object.keys(metrics.actionCounts).length;

    // Compute Shannon entropy of action distribution
    metrics.entropy = computeEntropy(metrics.actionCounts, metrics.decisionsTotal);
  }

  function recordOutcome(outcome, timeToKillMs) {
    if (outcome === 'win') metrics.wins++;
    else if (outcome === 'loss') metrics.losses++;
    if (timeToKillMs != null) metrics.timeToKill.push(timeToKillMs);
  }

  function getLastTrace() {
    return traceHistory[traceHistory.length - 1] ?? null;
  }

  function getTraceHistory() {
    return [...traceHistory];
  }

  function getMetrics() {
    return {
      ...metrics,
      winRate: (metrics.wins + metrics.losses) > 0
        ? metrics.wins / (metrics.wins + metrics.losses)
        : null,
      avgTimeToKill: metrics.timeToKill.length > 0
        ? metrics.timeToKill.reduce((a, b) => a + b, 0) / metrics.timeToKill.length
        : null,
      failsafeRate: metrics.decisionsTotal > 0
        ? metrics.failsafeTriggers / metrics.decisionsTotal
        : 0
    };
  }

  /**
   * Generate a human-readable explanation of the last decision.
   */
  function explainLastDecision() {
    const trace = getLastTrace();
    if (!trace) return 'No decisions recorded yet.';

    const parts = [];

    parts.push(`BT Node: ${trace.btNode}`);
    parts.push(`Action: ${trace.selectedAction} (score=${trace.score}, margin=${trace.margin})`);

    if (trace.difficultyError) {
      parts.push(`Note: Difficulty error injection caused suboptimal selection.`);
    }

    if (trace.specialReason) {
      parts.push(`Special: ${trace.specialReason}`);
    }

    if (trace.alternatives.length > 1) {
      parts.push(`Alternatives: ${trace.alternatives.slice(1).map(a => `${a.action}(${a.score})`).join(', ')}`);
    }

    const mods = trace.personalityModifiers;
    if (mods && Object.keys(mods).length > 0) {
      parts.push(`Personality: ${Object.entries(mods).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }

    if (trace.memoryPatterns?.length > 0) {
      parts.push(`Memory patterns: ${trace.memoryPatterns.map(p => `${p.type}(${p.confidence?.toFixed(2) ?? p.value?.toFixed(2)})`).join(', ')}`);
    }

    if (trace.adaptiveNudges && Object.values(trace.adaptiveNudges).some(v => v !== 0)) {
      parts.push(`Adaptive nudges: acc=${trace.adaptiveNudges.accuracy?.toFixed(2)} agg=${trace.adaptiveNudges.aggression?.toFixed(2)} spc=${trace.adaptiveNudges.spacing?.toFixed(2)}`);
    }

    parts.push(`Coordination: role=${trace.coordinationRole}${trace.coordinationGoal ? ` goal=${trace.coordinationGoal}` : ''}`);

    if (trace.failsafeTriggered) {
      parts.push(`FAILSAFE TRIGGERED: ${trace.failsafeReason ?? 'unknown'}`);
    }

    if (trace.elapsedMs != null) {
      parts.push(`Decision time: ${trace.elapsedMs.toFixed(3)}ms`);
    }

    return parts.join('\n');
  }

  /**
   * Get debug visualization overlay data for rendering.
   */
  function getVisualizationData(perceived, personality, decisionResult) {
    if (!debugConfig.metricsEnabled) return null;

    return {
      overlays: debugConfig.visualizationOverlays ?? [],
      data: {
        vision_cone: {
          range: perceived?.uncertainty ?? 0,
          entities: perceived?.entities ?? []
        },
        threat_rings: (perceived?.threats ?? []).map(t => ({
          id: t.id,
          position: t.position,
          threat: t.threatScore
        })),
        intent_arrow: decisionResult ? {
          action: decisionResult.action?.type,
          target: decisionResult.action?.target?.position
        } : null,
        bt_node_label: decisionResult?.reasonTrace?.btNode ?? null,
        memory_echo: null,
        coordination_lines: null
      }
    };
  }

  function reset() {
    traceHistory.length = 0;
    metrics.decisionsTotal = 0;
    metrics.failsafeTriggers = 0;
    metrics.actionCounts = {};
    metrics.actionDiversity = 0;
    metrics.entropy = 0;
    metrics.avgDecisionMs = 0;
    metrics.totalDecisionMs = 0;
    metrics.wins = 0;
    metrics.losses = 0;
    metrics.timeToKill = [];
    metrics.btNodeUsage = {};
  }

  return {
    recordTrace,
    recordOutcome,
    getLastTrace,
    getTraceHistory,
    getMetrics,
    explainLastDecision,
    getVisualizationData,
    reset,
    botId
  };
}

/**
 * Compute Shannon entropy of action distribution.
 * Higher entropy = more diverse action selection.
 */
function computeEntropy(counts, total) {
  if (total <= 0) return 0;
  let entropy = 0;
  for (const count of Object.values(counts)) {
    if (count === 0) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Generate a telemetry summary across multiple bots.
 * @param {Array} botDebugSystems - Array of debug system instances
 * @returns {object} Aggregate telemetry
 */
export function aggregateTelemetry(botDebugSystems) {
  const aggregate = {
    totalDecisions: 0,
    totalFailsafes: 0,
    avgEntropy: 0,
    avgDecisionMs: 0,
    botCount: botDebugSystems.length,
    perBot: []
  };

  let entropySum = 0;
  let decisionMsSum = 0;

  for (const debug of botDebugSystems) {
    const metrics = debug.getMetrics();
    aggregate.totalDecisions += metrics.decisionsTotal;
    aggregate.totalFailsafes += metrics.failsafeTriggers;
    entropySum += metrics.entropy;
    decisionMsSum += metrics.avgDecisionMs;
    aggregate.perBot.push({ botId: debug.botId, ...metrics });
  }

  aggregate.avgEntropy = botDebugSystems.length > 0 ? entropySum / botDebugSystems.length : 0;
  aggregate.avgDecisionMs = botDebugSystems.length > 0 ? decisionMsSum / botDebugSystems.length : 0;
  aggregate.failsafeRate = aggregate.totalDecisions > 0
    ? aggregate.totalFailsafes / aggregate.totalDecisions
    : 0;

  return aggregate;
}
