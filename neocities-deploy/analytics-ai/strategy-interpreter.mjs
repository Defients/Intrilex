// ═══════════════════════════════════════════════════════════════
// strategy-interpreter.mjs — Optional local-only Ollama interpretation
// layer for Intrilex Strategy Intelligence ("FIELD MANUAL").
//
// AI EXPLAINS EVIDENCE. AI DOES NOT CREATE EVIDENCE.
//
// The interpreter never writes claims, confidence, recommendations or
// provenance. It receives a sanitized STRATEGY_EXPLANATION_PACKET_V1
// (public, actor-authorized evidence only), asks a local Ollama model
// for a strict structured explanation, validates the result, and
// returns it labeled as non-scientific interpretation. No cloud
// providers; non-local endpoints are rejected.
// ═══════════════════════════════════════════════════════════════

import { isLocalEndpoint } from './config.mjs';
import { OllamaClient, OllamaError, OLLAMA_ERROR } from './ollama-client.mjs';

export const STRATEGY_EXPLANATION_PACKET_CONTRACT = 'STRATEGY_EXPLANATION_PACKET_V1';
export const STRATEGY_INTERPRETER_PROMPT_VERSION = '1.0.0';
export const STRATEGY_INTERPRETER_MODES = Object.freeze({ OFF: 'OFF', OLLAMA_LOCAL: 'OLLAMA_LOCAL' });
export const STRATEGY_INTERPRETER_STYLES = Object.freeze({ DEFFY_ENGLISH: 'DEFFY_ENGLISH' });
export const STRATEGY_EVIDENCE_LABELS = Object.freeze(['OBSERVED_ONLY', 'CONTROLLED_ADVICE', 'MIXED', 'UNKNOWN']);

export const STRATEGY_INTERPRETER_SYSTEM_PROMPT = `You explain Intrilex Strategy evidence supplied in a structured packet.

Use ONLY the supplied packet and the public rules context inside it.

Do not invent mechanics, statistics, sample sizes, causal claims, recommendations, confidence levels, or hidden information.

Never upgrade evidence strength.

Clearly distinguish OBSERVED, CONTROLLED, HYPOTHESIS and PLAYER-ACTIONABLE content.

If evidence is observational only, say that it does not prove the move is better.

If the packet says UNKNOWN, preserve UNKNOWN.

If a recommendation already exists in the packet, explain it faithfully.

Do not produce scientific claims not present in the packet.

Write in plain, practical language ("Deffy English"): concise, smart without academic sludge, willing to say we don't know, uses game terms instead of internal schema terms, mildly conversational, never fake certainty.`;

export const STRATEGY_EXPLANATION_SCHEMA = Object.freeze({
  type: 'object',
  required: ['headline', 'plainSummary', 'whatThisMeans', 'whatThisDoesNotMean', 'practicalTakeaway', 'interestingSignal', 'nextUsefulTest', 'warnings', 'confidenceLanguage', 'evidenceLabel'],
  properties: {
    headline: { type: 'string' },
    plainSummary: { type: 'string' },
    whatThisMeans: { type: 'string' },
    whatThisDoesNotMean: { type: 'string' },
    practicalTakeaway: { type: 'string' },
    interestingSignal: { type: 'string' },
    nextUsefulTest: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
    confidenceLanguage: { type: 'string', enum: ['INSUFFICIENT', 'EXPERIMENTAL', 'SUGGESTIVE', 'STRONG', 'ESTABLISHED', 'UNKNOWN'] },
    evidenceLabel: { type: 'string', enum: [...STRATEGY_EVIDENCE_LABELS] }
  },
  additionalProperties: false
});

const round = (n, places = 4) => Number.isFinite(n) ? Math.round(n * 10 ** places) / 10 ** places : null;
const roundList = list => (list ?? []).map(v => round(v, 4));
const CONFIDENCE_ORDER = ['INSUFFICIENT', 'EXPERIMENTAL', 'SUGGESTIVE', 'STRONG', 'ESTABLISHED'];

/**
 * STRATEGY_EXPLANATION_PACKET_V1 — the only thing a local model ever sees.
 * Built from validated, actor-authorized evidence. Never includes hidden
 * engine state, opponent hand identities, replay commands, seed material or
 * raw provenance dumps.
 */
export function createStrategyExplanationPacket({
  subject, humanSubjectName = subject,
  context = {},
  aggregate = null,
  claims = [],
  controlledClaims = [],
  researchLeads = [],
  publicMechanicDescription = null
} = {}) {
  if (typeof subject !== 'string' || !subject) throw new Error('STRATEGY_PACKET_SUBJECT_REQUIRED');
  const total = aggregate?.total ?? null;
  const association = total && total.selectedOutcomeAssociation !== null && total.skippedOutcomeAssociation !== null
    ? round(total.selectedOutcomeAssociation - total.skippedOutcomeAssociation) : null;
  const actionable = controlledClaims.filter(c => !['INSUFFICIENT', 'EXPERIMENTAL'].includes(c.confidence) && c.recommendation && c.recommendation !== 'UNKNOWN');
  const allClaims = [...claims, ...controlledClaims];
  const highestConfidence = allClaims.length
    ? CONFIDENCE_ORDER.reduce((best, level) => allClaims.some(c => c.confidence === level) ? level : best, 'INSUFFICIENT')
    : 'UNKNOWN';
  const evidenceLabel = !allClaims.length && !total?.opportunities ? 'UNKNOWN'
    : actionable.length ? 'CONTROLLED_ADVICE'
    : controlledClaims.length ? 'MIXED' : 'OBSERVED_ONLY';
  return {
    contract: STRATEGY_EXPLANATION_PACKET_CONTRACT,
    subject,
    humanSubjectName,
    context: { rulesProfile: context.rulesProfile ?? null, eraId: context.eraId ?? null, filters: context.filters ?? {}, historical: Boolean(context.historical) },
    highestConfidence,
    evidenceLabel,
    actionable: actionable.map(c => ({
      recommendation: c.recommendation, confidence: c.confidence,
      statement: c.statement ?? null,
      effectPoints: round(c.estimatedMagnitude),
      intervalPoints: c.uncertainty?.interval ? roundList(c.uncertainty.interval) : null,
      heterogeneity: c.statementData?.heterogeneity ?? null,
      hiddenWorlds: c.statementData?.hiddenWorlds ?? null,
      context: 'Exact tested opening context only'
    })),
    observationalSummary: total ? {
      opportunities: total.opportunities, selected: total.selected, skipped: total.skipped,
      selectionRate: round(total.selectionRate), holdRate: round(total.holdRate),
      selectedOutcomeAssociation: round(total.selectedOutcomeAssociation),
      skippedOutcomeAssociation: round(total.skippedOutcomeAssociation),
      association
    } : null,
    controlledSummary: {
      testedComparisons: controlledClaims.length,
      actionable: actionable.length,
      experimental: controlledClaims.filter(c => c.confidence === 'EXPERIMENTAL').length,
      insufficient: controlledClaims.filter(c => c.confidence === 'INSUFFICIENT').length
    },
    timingSummary: (aggregate?.timing ?? []).filter(t => t.opportunities > 0)
      .map(t => ({ bucket: t.bucket, opportunities: t.opportunities, selected: t.selected, selectionRate: round(t.selectionRate) })),
    semanticBreakdown: aggregate?.semantics
      ? Object.fromEntries(Object.entries(aggregate.semantics).filter(([, cell]) => cell.opportunities > 0)
        .map(([category, cell]) => [category, { opportunities: cell.opportunities, selected: cell.selected, selectionRate: round(cell.selectionRate) }]))
      : null,
    matchupSummary: aggregate?.matchups?.length ? { opponentPoliciesObserved: aggregate.matchups.length } : null,
    sampleSummary: aggregate ? {
      uniqueGames: aggregate.games ?? null, seedBlocks: aggregate.seedBlocks ?? null,
      decisions: aggregate.total?.decisions ?? null, distinctStates: aggregate.distinctStates ?? null,
      policies: (aggregate.policies ?? []).length, matchups: (aggregate.matchups ?? []).length
    } : null,
    uncertainty: actionable.some(c => c.intervalPoints)
      ? { note: 'Familywise 95% intervals on paired world effects; see actionable entries.', units: 'terminal game-score points (win=1, draw=0.5)' }
      : { note: 'No controlled uncertainty bound exists for this subject.', units: 'terminal game-score points (win=1, draw=0.5)' },
    knownLimitations: [
      'Observational usage describes what policies did; it cannot prove a play is better.',
      'Controlled evidence covers the first P1 opening decision only — not midgame.',
      'Decision-weighted samples; repeated decisions in one game are correlated.',
      'Skipped opportunity does not prove deliberate holding.'
    ],
    researchLeads: researchLeads.map(l => ({ kind: l.kind, detail: l.detail ?? null })),
    rulesSummary: publicMechanicDescription,
    publicMechanicDescription
  };
}

/**
 * Strict validation of structured model output. Fails closed: a malformed
 * or ungrounded response is rejected, never treated as evidence.
 */
export function validateStrategyExplanation(value, packet) {
  const fail = code => { throw new Error(code); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('STRATEGY_EXPLANATION_SCHEMA');
  const required = STRATEGY_EXPLANATION_SCHEMA.required;
  if (Object.keys(value).sort().join('|') !== [...required].sort().join('|')) fail('STRATEGY_EXPLANATION_SCHEMA');
  for (const key of required.filter(k => k !== 'warnings'))
    if (typeof value[key] !== 'string') fail('STRATEGY_EXPLANATION_SCHEMA');
  if (!Array.isArray(value.warnings) || value.warnings.some(w => typeof w !== 'string')) fail('STRATEGY_EXPLANATION_SCHEMA');
  if (!STRATEGY_EVIDENCE_LABELS.includes(value.evidenceLabel)) fail('STRATEGY_EXPLANATION_SCHEMA');
  // The model must echo the deterministic classification, not invent one.
  if (packet && value.evidenceLabel !== packet.evidenceLabel) fail('STRATEGY_EXPLANATION_LABEL_MISMATCH');
  if (packet && packet.highestConfidence !== 'UNKNOWN' && value.confidenceLanguage !== packet.highestConfidence) fail('STRATEGY_EXPLANATION_CONFIDENCE_MISMATCH');
  if (packet && packet.highestConfidence === 'UNKNOWN' && !['UNKNOWN', 'INSUFFICIENT'].includes(value.confidenceLanguage)) fail('STRATEGY_EXPLANATION_CONFIDENCE_MISMATCH');
  // Grounding guardrail: any percentage / point figure quoted by the model
  // must match a number published in the packet (rates rendered as % or pp).
  if (packet) {
    const allowed = new Set();
    const add = n => { if (Number.isFinite(n)) { allowed.add((n * 100).toFixed(1)); allowed.add(String(Math.round(n * 100))); allowed.add(String(n)); } };
    const walk = v => { if (Number.isFinite(v)) add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(packet);
    const text = required.filter(k => k !== 'warnings').map(k => value[k]).join(' ') + ' ' + value.warnings.join(' ');
    for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|pp\b|percentage points?|percent)/g)) {
      if (!allowed.has(match[1])) fail('STRATEGY_EXPLANATION_UNGROUNDED_NUMBER');
    }
  }
  return value;
}

/** Local-only config. Non-local endpoints are rejected — no cloud fallback. */
export function normalizeStrategyAiConfig(input = {}) {
  const mode = input.mode ?? STRATEGY_INTERPRETER_MODES.OFF;
  if (!Object.values(STRATEGY_INTERPRETER_MODES).includes(mode)) throw new Error('STRATEGY_AI_MODE_INVALID');
  const endpoint = String(input.endpoint ?? 'http://localhost:11434').replace(/\/+$/, '');
  if (!isLocalEndpoint(endpoint)) throw new Error('STRATEGY_AI_NON_LOCAL_ENDPOINT');
  const style = input.style ?? STRATEGY_INTERPRETER_STYLES.DEFFY_ENGLISH;
  if (!Object.values(STRATEGY_INTERPRETER_STYLES).includes(style)) throw new Error('STRATEGY_AI_STYLE_INVALID');
  const depth = input.analysisDepth ?? 'standard';
  if (!['brief', 'standard'].includes(depth)) throw new Error('STRATEGY_AI_DEPTH_INVALID');
  return { mode, endpoint, model: String(input.model ?? ''), style, analysisDepth: depth, requestTimeoutMs: Number.isFinite(input.requestTimeoutMs) ? Math.max(5000, Math.min(300000, input.requestTimeoutMs)) : 60000 };
}
export function strategyAiClient(config, { fetchImpl } = {}) {
  return new OllamaClient({ endpoint: config.endpoint, timeoutMs: config.requestTimeoutMs ?? 60000, fetchImpl });
}

/**
 * Ask a local Ollama model to explain a packet. Returns the validated
 * interpretation labeled as non-scientific, or throws on any failure.
 */
export async function explainStrategyEvidence({ client, packet, model, signal, stream = false, onToken, options = {} } = {}) {
  if (!client || typeof client.chat !== 'function') throw new Error('STRATEGY_AI_CLIENT_REQUIRED');
  const messages = [
    { role: 'system', content: STRATEGY_INTERPRETER_SYSTEM_PROMPT },
    { role: 'user', content: `Explain this Intrilex Strategy evidence packet to a player. Reply ONLY with JSON matching the required schema.\n\nPACKET:\n${JSON.stringify(packet)}` }
  ];
  const { text } = await client.chat({ model, messages, format: STRATEGY_EXPLANATION_SCHEMA, stream, onToken, signal, options: { temperature: 0.2, num_predict: 1200, ...options } });
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new OllamaError(OLLAMA_ERROR.MALFORMED_RESPONSE, 'Model response was not valid JSON'); }
  return {
    explanation: validateStrategyExplanation(parsed, packet),
    model,
    generatedAt: new Date().toISOString(),
    packetVersion: packet?.contract ?? STRATEGY_EXPLANATION_PACKET_CONTRACT,
    promptVersion: STRATEGY_INTERPRETER_PROMPT_VERSION,
    scientific: false,
    disclaimer: 'AI interpretation of Field Manual evidence — not scientific output.'
  };
}
