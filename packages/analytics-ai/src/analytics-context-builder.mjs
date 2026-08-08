// ═══════════════════════════════════════════════════════════════
// analytics-context-builder.mjs — Selects relevant, structured context
// per analysis mode, summarizes oversized datasets deterministically,
// preserves outliers, labels missing evidence, and enforces a token
// budget. Output is plain text ready to be fenced into the prompt.
// ═══════════════════════════════════════════════════════════════

import { sanitizeObject, fenceContent, enforceTotalLimit } from './security-sanitizer.mjs';
import { summarizeDeterministicChecks } from './deterministic-statistics.mjs';

// Rough token estimate: ~4 chars per token for English/code mix.
const CHARS_PER_TOKEN = 4;

export const ANALYSIS_MODE = Object.freeze({
  EXECUTIVE_SUMMARY: 'executive-summary',
  BALANCE: 'balance',
  ANOMALY: 'anomaly',
  ASK: 'ask'
  // COMPARATIVE and RECOMMENDED_NEXT_TESTS deferred to a follow-up phase.
});

export const ALL_MODES = Object.values(ANALYSIS_MODE);

/**
 * Build the grounded context payload for a given analysis mode.
 *
 * @param {object} params
 * @param {string} params.mode - one of ANALYSIS_MODE
 * @param {object} params.bundle - { observatory, aggregate, variantAnalytics, engineVersion, rulesVersion, analyticsSchemaVersion, officialRules, historicalRuns }
 * @param {object} params.settings - normalized analytics-ai settings
 * @param {Array} params.deterministicWarnings - output of runDeterministicChecks
 * @param {string} [params.question] - natural-language question (ASK mode only)
 * @returns {{ text: string, tokenEstimate: number, sources: Array, omitted: Array, truncated: boolean, sanitizationFlags: Array }}
 */
export function buildContext({ mode, bundle = {}, settings = {}, deterministicWarnings = [], question = null }) {
  const sources = [];
  const omitted = [];
  const budgetChars = (settings.contextBudgetTokens || 8192) * CHARS_PER_TOKEN;
  const sections = [];

  const { observatory = {}, aggregate = {}, variantAnalytics = null, officialRules = null, historicalRuns = null, engineVersion, rulesVersion, analyticsSchemaVersion } = bundle;

  // ── 1. Identity / version block (always included) ──
  const identity = {
    engineVersion: engineVersion || aggregate.engineVersion || observatory.engineVersion || null,
    rulesVersion: rulesVersion || aggregate.rulesVersion || observatory.rulesVersion || null,
    analyticsSchemaVersion: analyticsSchemaVersion || observatory.schemaVersion || null,
    labVersion: aggregate.labVersion || null,
    interpretationBoundary: observatory.interpretationBoundary || aggregate.interpretationBoundary || null
  };
  sources.push('identity');
  sections.push(fenceContent('IDENTITY_AND_VERSIONS', JSON.stringify(identity, null, 2)));

  // ── 2. Sample / campaign metadata (always included) ──
  const meta = {
    matchCount: aggregate.matchCount ?? observatory.summaryCount ?? 0,
    completedMatchCount: aggregate.completedMatchCount ?? null,
    drawCount: aggregate.drawCount ?? null,
    abortCount: aggregate.abortCount ?? null,
    profileId: aggregate.profileId ?? null,
    seatWins: aggregate.seatWins ?? null,
    seat1WinRate: aggregate.seat1WinRate ?? null,
    seat1Wilson95: aggregate.seat1Wilson95 ?? null,
    terminationCounts: aggregate.terminationCounts ?? null,
    campaignHealth: observatory.campaignHealth ?? null,
    completeness: observatory.completeness ?? null
  };
  sources.push('campaign-metadata');
  sections.push(fenceContent('CAMPAIGN_METADATA', JSON.stringify(meta, null, 2)));

  // ── 3. Deterministic checks (always included) ──
  const detSummary = summarizeDeterministicChecks(deterministicWarnings);
  sources.push('deterministic-checks');
  sections.push(fenceContent('DETERMINISTIC_CHECKS (pre-computed factual warnings — treat as ground truth)', JSON.stringify(detSummary, null, 2)));

  // ── 4. Mode-specific evidence ──
  if (mode === ANALYSIS_MODE.BALANCE) {
    addBalanceEvidence(sections, sources, omitted, { observatory, aggregate, variantAnalytics, settings });
  } else if (mode === ANALYSIS_MODE.ANOMALY) {
    addAnomalyEvidence(sections, sources, omitted, { observatory, aggregate });
  } else if (mode === ANALYSIS_MODE.ASK) {
    // For Ask mode, include a broad but compact slice so the model can
    // answer arbitrary questions, plus the question itself.
    addBalanceEvidence(sections, sources, omitted, { observatory, aggregate, variantAnalytics, settings, compact: true });
    addAnomalyEvidence(sections, sources, omitted, { observatory, aggregate, compact: true });
    if (question) {
      sources.push('user-question');
      sections.push(fenceContent('USER_QUESTION (interpret this question against the data above; cite metrics used)', question));
    }
  }
  // EXECUTIVE_SUMMARY uses only identity + meta + deterministic + a compact health slice.
  if (mode === ANALYSIS_MODE.EXECUTIVE_SUMMARY) {
    addHealthSlice(sections, sources, omitted, { observatory, aggregate });
  }

  // ── 5. Official rules (optional) ──
  if (settings.includeOfficialRules && officialRules) {
    sources.push('official-rules');
    const rulesText = typeof officialRules === 'string' ? officialRules.slice(0, 6000) : JSON.stringify(officialRules, null, 2).slice(0, 6000);
    sections.push(fenceContent('OFFICIAL_RULES (higher authority than model intuition)', rulesText));
  } else if (settings.includeOfficialRules) {
    omitted.push('official-rules (not available in bundle)');
  }

  // ── 6. Historical comparisons (optional) ──
  if (settings.includeHistoricalComparisons && historicalRuns && Array.isArray(historicalRuns) && historicalRuns.length > 0) {
    sources.push('historical-runs');
    const hist = historicalRuns.slice(0, 5).map(h => ({ label: h.label, engineVersion: h.engineVersion, rulesVersion: h.rulesVersion, matchCount: h.matchCount, seat1WinRate: h.seat1WinRate, keyMetrics: h.keyMetrics }));
    sections.push(fenceContent('HISTORICAL_RUNS (for comparison only)', JSON.stringify(hist, null, 2)));
  } else if (settings.includeHistoricalComparisons) {
    omitted.push('historical-runs (none provided)');
  }

  // ── 7. AI decision telemetry (optional) ──
  if (!settings.includeAiDecisionTelemetry) {
    omitted.push('ai-decision-telemetry (disabled by settings)');
  } else if (observatory.policies) {
    sources.push('ai-decision-telemetry');
    const telemetry = summarizePolicyTelemetry(observatory.policies, aggregate.policies);
    sections.push(fenceContent('AI_DECISION_TELEMETRY', JSON.stringify(telemetry, null, 2)));
  }

  // ── Assemble + sanitize + enforce budget ──
  let text = sections.join('\n\n');
  const { data: sanitized, flags } = sanitizeObject({ text });
  text = sanitized.text;
  const enforced = enforceTotalLimit(text, { maxChars: budgetChars });
  if (enforced.truncated) {
    omitted.push(`context-truncated (${enforced.omittedChars} chars omitted to fit budget)`);
  }

  return {
    text: enforced.text,
    tokenEstimate: Math.ceil(enforced.text.length / CHARS_PER_TOKEN),
    sources,
    omitted,
    truncated: enforced.truncated,
    sanitizationFlags: flags
  };
}

function addHealthSlice(sections, sources, omitted, { observatory, aggregate }) {
  const slice = {
    anomalies: (observatory.anomalies || []).slice(0, 10),
    rankWatchlist: observatory.rankPower?.watchlist ?? null,
    campaignHealth: observatory.campaignHealth ?? null,
    topPolicies: topPolicies(aggregate.policies, 5)
  };
  sources.push('health-slice');
  sections.push(fenceContent('HEALTH_SLICE', JSON.stringify(slice, null, 2)));
}

function addBalanceEvidence(sections, sources, omitted, { observatory, variantAnalytics, compact = false }) {
  // Rank power ladder + watchlist
  if (observatory.rankPower) {
    sources.push('rank-power');
    const rp = observatory.rankPower;
    const ladder = (rp.ladder || []).slice(0, compact ? 10 : 30);
    sections.push(fenceContent('RANK_POWER', JSON.stringify({ schemaVersion: rp.schemaVersion, axisWeights: rp.axisWeights, axisCoverage: rp.axisCoverage, ladder, watchlist: rp.watchlist }, null, 2)));
  } else {
    omitted.push('rank-power (not available)');
  }

  // Variant analytics (Normal vs Super etc.) — keep separate per spec.
  if (variantAnalytics) {
    sources.push('variant-analytics');
    const va = variantAnalytics;
    const variantPower = compact ? Object.fromEntries(Object.entries(va.variantPower || {}).slice(0, 10)) : va.variantPower;
    sections.push(fenceContent('VARIANT_ANALYTICS (Normal/Super/Ultra/Spade/Joker kept separate)', JSON.stringify({ schemaVersion: va.schemaVersion, variantKeys: va.variantKeys, variantPower, confidence: va.confidence }, null, 2)));
  } else {
    omitted.push('variant-analytics (not available)');
  }

  // Mechanics with opportunity-adjusted usage (the key anti-shortcut data).
  const mechanics = observatory.mechanics || [];
  if (mechanics.length > 0) {
    sources.push('mechanics');
    const summarized = summarizeMechanics(mechanics, compact ? 20 : 60);
    sections.push(fenceContent('MECHANICS (opportunity-adjusted usage — do NOT equate usage with power)', JSON.stringify(summarized, null, 2)));
  } else {
    omitted.push('mechanics (not available)');
  }
}

function addAnomalyEvidence(sections, sources, omitted, { observatory, aggregate, compact = false }) {
  // Pre-computed anomalies from the analytics pipeline
  const anomalies = observatory.anomalies || [];
  if (anomalies.length > 0) {
    sources.push('observatory-anomalies');
    sections.push(fenceContent('OBSERVATORY_ANOMALIES (pre-detected)', JSON.stringify(anomalies.slice(0, compact ? 10 : 40), null, 2)));
  } else {
    omitted.push('observatory-anomalies (none pre-detected)');
  }
  // Termination distribution for internal-consistency checks
  sources.push('termination-distribution');
  sections.push(fenceContent('TERMINATION_DISTRIBUTION', JSON.stringify(aggregate.terminationCounts || {}, null, 2)));
}

function summarizeMechanics(mechanics, limit) {
  const sorted = [...mechanics].sort((a, b) => (b.selectionCount ?? 0) - (a.selectionCount ?? 0));
  const top = sorted.slice(0, limit);
  // Preserve outliers even if they fall outside the top-N by usage.
  const included = new Set(top.map(m => m.metricId));
  for (const m of mechanics) {
    if (included.has(m.metricId)) continue;
    const pick = m.pickRateWhenLegal ?? m.pickRate;
    if (pick != null && (pick > 0.95 || pick < 0.02)) {
      top.push(m);
      included.add(m.metricId);
    }
  }
  return top.map(m => ({
    mechanic: m.mechanic,
    category: m.category,
    selectionCount: m.selectionCount,
    legalOpportunityCount: m.legalOpportunityCount,
    pickRateWhenLegal: m.pickRateWhenLegal ?? null,
    hasOpportunityData: m.hasOpportunityData ?? null,
    winAssociation: m.winAssociation ?? m.winRateAssociation ?? null,
    quarantined: m.quarantined ?? null
  }));
}

function summarizePolicyTelemetry(obsPolicies, aggPolicies) {
  const out = {};
  const obs = Array.isArray(obsPolicies) ? Object.fromEntries(obsPolicies.map(p => [p.policyId, p])) : (obsPolicies || {});
  const keys = new Set([...Object.keys(obs), ...(aggPolicies ? Object.keys(aggPolicies) : [])]);
  for (const pid of keys) {
    const op = obs[pid] || {};
    const ap = aggPolicies?.[pid] || {};
    out[pid] = {
      games: ap.games ?? op.games ?? null,
      winRate: ap.winRate ?? op.winRate ?? null,
      wilson95: ap.wilson95 ?? op.winWilson95 ?? null,
      miniTurnActions: ap.miniTurnActions ?? op.miniTurnActions ?? null,
      responsesPlayed: ap.responsesPlayed ?? op.responsePlays ?? null,
      responsesDeclined: ap.responsesDeclined ?? op.responseDeclines ?? null
    };
  }
  return out;
}

function topPolicies(policies, n) {
  if (!policies) return [];
  const entries = Object.entries(policies).map(([pid, p]) => ({ policyId: pid, games: p.games, winRate: p.winRate, wilson95: p.wilson95 ?? p.winWilson95 }));
  entries.sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  return entries.slice(0, n);
}
