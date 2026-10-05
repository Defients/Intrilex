// ═══════════════════════════════════════════════════════════════
// strategy-interpreter.mjs — Optional local-only Ollama interpretation
// layer for Intrilex Strategy Intelligence ("FIELD MANUAL").
//
// AI EXPLAINS EVIDENCE. AI DOES NOT CREATE EVIDENCE.
//
// The interpreter never writes claims, confidence, recommendations or
// provenance. It receives a sanitized STRATEGY_EXPLANATION_PACKET_V2
// (public, actor-authorized evidence only) for one of the supported
// surfaces, asks a local Ollama model for a strict structured
// explanation, validates the result against typed grounding facts, and
// returns it labeled as non-scientific interpretation. No cloud
// providers; non-local endpoints are rejected.
// ═══════════════════════════════════════════════════════════════

import { isLocalEndpoint } from './config.mjs';
import { OllamaClient, OllamaError, OLLAMA_ERROR } from './ollama-client.mjs';

export const STRATEGY_EXPLANATION_PACKET_CONTRACT = 'STRATEGY_EXPLANATION_PACKET_V2';
export const STRATEGY_INTERPRETER_PROMPT_VERSION = '2.0.0';
export const STRATEGY_INTERPRETER_MODES = Object.freeze({ OFF: 'OFF', OLLAMA_LOCAL: 'OLLAMA_LOCAL' });
export const STRATEGY_INTERPRETER_STYLES = Object.freeze({ DEFFY_ENGLISH: 'DEFFY_ENGLISH' });
export const STRATEGY_EVIDENCE_LABELS = Object.freeze(['OBSERVED_ONLY', 'CONTROLLED_ADVICE', 'MIXED', 'UNKNOWN']);
export const STRATEGY_INTERPRETER_SURFACES = Object.freeze({
  CARD: 'CARD', MATCHUP: 'MATCHUP', POLICY_COMPARE: 'POLICY_COMPARE',
  CONTROLLED_STUDY: 'CONTROLLED_STUDY', GUIDE: 'GUIDE', EVIDENCE_DESK: 'EVIDENCE_DESK'
});

// Typed numeric units. Grounding is only valid when the model's numeric
// phrase matches a fact of the SAME unit — a count of games can never
// justify a percentage, and vice versa.
export const STRATEGY_FACT_UNITS = Object.freeze({
  PERCENT: 'PERCENT', PERCENTAGE_POINTS: 'PERCENTAGE_POINTS', GAME_SCORE_POINTS: 'GAME_SCORE_POINTS',
  COUNT_GAMES: 'COUNT_GAMES', COUNT_DECISIONS: 'COUNT_DECISIONS', COUNT_OPPORTUNITIES: 'COUNT_OPPORTUNITIES',
  COUNT_SELECTIONS: 'COUNT_SELECTIONS', COUNT_SKIPS: 'COUNT_SKIPS', COUNT_WORLDS: 'COUNT_WORLDS',
  COUNT_CONTINUATIONS: 'COUNT_CONTINUATIONS', COUNT_COMPARISONS: 'COUNT_COMPARISONS',
  COUNT_EXECUTIONS: 'COUNT_EXECUTIONS', COUNT_FAULTS: 'COUNT_FAULTS', COUNT_POLICIES: 'COUNT_POLICIES',
  COUNT_MATCHUPS: 'COUNT_MATCHUPS', COUNT_STATES: 'COUNT_STATES', COUNT_SEED_BLOCKS: 'COUNT_SEED_BLOCKS',
  COUNT_SOURCES: 'COUNT_SOURCES', COUNT_SUBJECTS: 'COUNT_SUBJECTS', COUNT_EVENTS: 'COUNT_EVENTS'
});

const UNIT_COUNT_WORDS = Object.freeze({
  COUNT_GAMES: ['game', 'games'], COUNT_DECISIONS: ['decision', 'decisions'],
  COUNT_OPPORTUNITIES: ['opportunity', 'opportunities'], COUNT_SELECTIONS: ['selection', 'selections'],
  COUNT_SKIPS: ['skipped opportunity', 'skipped opportunities'],
  COUNT_WORLDS: ['hidden world', 'hidden worlds'], COUNT_CONTINUATIONS: ['continuation', 'continuations'],
  COUNT_COMPARISONS: ['comparison', 'comparisons'], COUNT_EXECUTIONS: ['execution', 'executions'],
  COUNT_FAULTS: ['fault', 'faults'], COUNT_POLICIES: ['policy', 'policies'],
  COUNT_MATCHUPS: ['matchup', 'matchups'], COUNT_STATES: ['state', 'states'],
  COUNT_SEED_BLOCKS: ['seed block', 'seed blocks'], COUNT_SOURCES: ['source', 'sources'],
  COUNT_SUBJECTS: ['subject', 'subjects'], COUNT_EVENTS: ['event', 'events']
});

/** Canonical rendered display for one typed fact. */
export function renderFactDisplay(value, unit) {
  if (!Number.isFinite(value)) return null;
  if (unit === STRATEGY_FACT_UNITS.PERCENT) return `${(value * 100).toFixed(1)}%`;
  if (unit === STRATEGY_FACT_UNITS.PERCENTAGE_POINTS) return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pp`;
  if (unit === STRATEGY_FACT_UNITS.GAME_SCORE_POINTS) return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pp game score`;
  const words = UNIT_COUNT_WORDS[unit] ?? ['unit', 'units'];
  return `${value} ${value === 1 ? words[0] : words[1]}`;
}

// The number a model would quote for a fact of this unit (unit-phrase form).
function factNumber(fact) {
  if (!Number.isFinite(fact.value)) return null;
  return fact.unit === STRATEGY_FACT_UNITS.PERCENT || fact.unit === STRATEGY_FACT_UNITS.PERCENTAGE_POINTS || fact.unit === STRATEGY_FACT_UNITS.GAME_SCORE_POINTS
    ? Number((fact.value * 100).toFixed(1)) : fact.value;
}

export const STRATEGY_INTERPRETER_SYSTEM_PROMPT = `You explain Intrilex Strategy evidence supplied in a structured packet.

Use ONLY the supplied packet and the public rules context inside it.

Do not invent mechanics, statistics, sample sizes, causal claims, recommendations, confidence levels, or hidden information.

Never upgrade evidence strength.

Clearly distinguish OBSERVED, CONTROLLED, HYPOTHESIS and PLAYER-ACTIONABLE content.

If evidence is observational only, say that it does not prove the move is better.

If the packet says UNKNOWN, preserve UNKNOWN.

If a recommendation already exists in the packet, explain it faithfully.

Every quantitative statement must quote a groundingFacts entry exactly as displayed, with the same unit — a game count is not a percentage, a percentage-point interval is not a win rate. When you use a number, list its grounding fact id in usedFactIds.

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
    evidenceLabel: { type: 'string', enum: [...STRATEGY_EVIDENCE_LABELS] },
    usedFactIds: { type: 'array', items: { type: 'string' } }
  },
  additionalProperties: false
});

const round = (n, places = 4) => Number.isFinite(n) ? Math.round(n * 10 ** places) / 10 ** places : null;
const roundList = list => (list ?? []).map(v => round(v, 4));
const CONFIDENCE_ORDER = ['INSUFFICIENT', 'EXPERIMENTAL', 'SUGGESTIVE', 'STRONG', 'ESTABLISHED'];

// Keys that must never appear anywhere in a packet — hidden engine state,
// provenance internals and replay material are never model input.
const BANNED_PACKET_KEYS = new Set(['artifactId', 'provenance', 'replayHash', 'derivedSeed', 'initialStateHash', 'finalStateHash', 'sourceHandles', 'commands', 'masterSeed', 'seed', 'hiddenState', 'privateState', 'opponentHand']);
const MAX_SURFACE_BYTES = 24 * 1024;

function collectKeys(value, into = []) {
  if (Array.isArray(value)) for (const item of value) collectKeys(item, into);
  else if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) { into.push(key); collectKeys(entry, into); }
  return into;
}
function assertPacketSafe(data, label) {
  if (data == null) return;
  for (const key of collectKeys(data)) if (BANNED_PACKET_KEYS.has(key)) throw new Error(`STRATEGY_PACKET_UNSAFE_KEY:${label}:${key}`);
  if (JSON.stringify(data).length > MAX_SURFACE_BYTES) throw new Error(`STRATEGY_PACKET_TOO_LARGE:${label}`);
}

/**
 * STRATEGY_EXPLANATION_PACKET_V2 — the only thing a local model ever sees.
 * Built from validated, actor-authorized evidence. Never includes hidden
 * engine state, opponent hand identities, replay commands, seed material or
 * raw provenance dumps. Numbers are published as typed groundingFacts so
 * the validator can reject same-number/wrong-unit prose.
 */
export function createStrategyExplanationPacket({
  surface = STRATEGY_INTERPRETER_SURFACES.CARD,
  subject, humanSubjectName = subject,
  context = {},
  aggregate = null,
  claims = [],
  controlledClaims = [],
  researchLeads = [],
  publicMechanicDescription = null,
  surfaceData = null
} = {}) {
  if (!Object.values(STRATEGY_INTERPRETER_SURFACES).includes(surface)) throw new Error('STRATEGY_PACKET_SURFACE_INVALID');
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
  // The controlled-uncertainty flag reads the actual Claim field
  // (claim.uncertainty.interval) mapped onto packet entries — never a raw
  // claim property that does not exist.
  const actionableEntries = actionable.map(c => ({
    recommendation: c.recommendation, confidence: c.confidence,
    statement: c.statement ?? null,
    effectPoints: round(c.estimatedMagnitude),
    intervalPoints: c.uncertainty?.interval ? roundList(c.uncertainty.interval) : null,
    heterogeneity: c.statementData?.heterogeneity ?? null,
    hiddenWorlds: c.statementData?.hiddenWorlds ?? null,
    context: 'Exact tested opening context only'
  }));
  const packet = {
    contract: STRATEGY_EXPLANATION_PACKET_CONTRACT,
    surface,
    subject,
    humanSubjectName,
    context: { rulesProfile: context.rulesProfile ?? null, eraId: context.eraId ?? null, filters: context.filters ?? {}, historical: Boolean(context.historical) },
    highestConfidence,
    evidenceLabel,
    actionable: actionableEntries,
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
      insufficient: controlledClaims.filter(c => c.confidence === 'INSUFFICIENT').length,
      // Every controlled claim's real uncertainty.interval is mapped
      // explicitly — intervals are never inferred or fabricated.
      intervals: controlledClaims.map(c => ({
        confidence: c.confidence, recommendation: c.recommendation ?? null,
        intervalPoints: c.uncertainty?.interval ? roundList(c.uncertainty.interval) : null
      }))
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
    uncertainty: actionableEntries.some(c => c.intervalPoints)
      ? { note: 'Familywise 95% intervals on paired world effects; see actionable entries.', units: 'terminal game-score points (win=1, draw=0.5)', controlledBoundExists: true }
      : { note: 'No admissible controlled uncertainty interval exists for this subject.', units: 'terminal game-score points (win=1, draw=0.5)', controlledBoundExists: false },
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
  // Typed grounding facts — the only numbers the model may quote.
  const facts = [];
  const fact = (id, value, unit, meaning) => {
    if (!Number.isFinite(value)) return;
    facts.push({ id, value, unit, display: renderFactDisplay(value, unit), meaning });
  };
  if (total) {
    fact('selection_rate', round(total.selectionRate), STRATEGY_FACT_UNITS.PERCENT, 'selection rate across legal opportunities');
    fact('hold_rate', round(total.holdRate), STRATEGY_FACT_UNITS.PERCENT, 'share of opportunities not selected');
    fact('selected_outcome_association', round(total.selectedOutcomeAssociation), STRATEGY_FACT_UNITS.PERCENT, 'mean terminal game score after selection');
    fact('skipped_outcome_association', round(total.skippedOutcomeAssociation), STRATEGY_FACT_UNITS.PERCENT, 'mean terminal game score after skipping');
    fact('observational_association', association, STRATEGY_FACT_UNITS.PERCENTAGE_POINTS, 'observational terminal game-score association');
    fact('opportunities', total.opportunities, STRATEGY_FACT_UNITS.COUNT_OPPORTUNITIES, 'legal opportunities observed');
    fact('selections', total.selected, STRATEGY_FACT_UNITS.COUNT_SELECTIONS, 'opportunities where the subject was selected');
    fact('skips', total.skipped, STRATEGY_FACT_UNITS.COUNT_SKIPS, 'opportunities not selected');
    fact('decisions', total.decisions, STRATEGY_FACT_UNITS.COUNT_DECISIONS, 'decision frames in scope');
  }
  for (const t of packet.timingSummary) {
    fact(`timing_${t.bucket.toLowerCase()}_rate`, t.selectionRate, STRATEGY_FACT_UNITS.PERCENT, `selection rate in ${t.bucket}`);
    fact(`timing_${t.bucket.toLowerCase()}_opportunities`, t.opportunities, STRATEGY_FACT_UNITS.COUNT_OPPORTUNITIES, `legal opportunities in ${t.bucket}`);
    fact(`timing_${t.bucket.toLowerCase()}_selections`, t.selected, STRATEGY_FACT_UNITS.COUNT_SELECTIONS, `selections in ${t.bucket}`);
  }
  for (const [category, cell] of Object.entries(packet.semanticBreakdown ?? {})) {
    const key = category.toLowerCase();
    fact(`semantic_${key}_rate`, cell.selectionRate, STRATEGY_FACT_UNITS.PERCENT, `selection rate when used as ${category}`);
    fact(`semantic_${key}_opportunities`, cell.opportunities, STRATEGY_FACT_UNITS.COUNT_OPPORTUNITIES, `opportunities offering ${category} use`);
    fact(`semantic_${key}_selections`, cell.selected, STRATEGY_FACT_UNITS.COUNT_SELECTIONS, `selections via ${category}`);
  }
  for (const [index, c] of actionableEntries.entries()) {
    fact(`advice_${index}_effect`, c.effectPoints, STRATEGY_FACT_UNITS.PERCENTAGE_POINTS, 'estimated paired terminal game-score effect');
    if (c.intervalPoints) {
      fact(`advice_${index}_interval_low`, c.intervalPoints[0], STRATEGY_FACT_UNITS.PERCENTAGE_POINTS, 'lower familywise 95% bound');
      fact(`advice_${index}_interval_high`, c.intervalPoints[1], STRATEGY_FACT_UNITS.PERCENTAGE_POINTS, 'upper familywise 95% bound');
    }
    fact(`advice_${index}_worlds`, c.hiddenWorlds, STRATEGY_FACT_UNITS.COUNT_WORLDS, 'compatible hidden worlds tested');
  }
  if (packet.sampleSummary) {
    fact('unique_games', packet.sampleSummary.uniqueGames, STRATEGY_FACT_UNITS.COUNT_GAMES, 'unique games contributing evidence');
    fact('seed_blocks', packet.sampleSummary.seedBlocks, STRATEGY_FACT_UNITS.COUNT_SEED_BLOCKS, 'distinct seed blocks');
    fact('distinct_states', packet.sampleSummary.distinctStates, STRATEGY_FACT_UNITS.COUNT_STATES, 'distinct recorded states');
    fact('policies', packet.sampleSummary.policies, STRATEGY_FACT_UNITS.COUNT_POLICIES, 'policies observed');
    fact('matchups', packet.sampleSummary.matchups, STRATEGY_FACT_UNITS.COUNT_MATCHUPS, 'opponent policies observed');
  }
  fact('controlled_comparisons', packet.controlledSummary.testedComparisons, STRATEGY_FACT_UNITS.COUNT_COMPARISONS, 'controlled comparisons tested');
  fact('controlled_experimental', packet.controlledSummary.experimental, STRATEGY_FACT_UNITS.COUNT_COMPARISONS, 'experimental controlled results');
  packet.groundingFacts = facts;
  if (surfaceData !== null) {
    assertPacketSafe(surfaceData, 'surfaceData');
    packet.surfaceData = surfaceData;
  }
  return packet;
}

/** Append a typed grounding fact to a packet built above. */
export function addGroundingFact(packet, id, value, unit, meaning) {
  if (!packet || !Array.isArray(packet.groundingFacts)) throw new Error('STRATEGY_PACKET_REQUIRED');
  if (!Number.isFinite(value)) return packet;
  packet.groundingFacts.push({ id, value, unit, display: renderFactDisplay(value, unit), meaning });
  return packet;
}

/**
 * CONTROLLED_STUDY surface — explain a committed information-set study.
 * Only public study metadata and its already-computed claims are included;
 * hidden worlds, seeds and replay commands never reach the packet.
 */
export function createControlledStudyPacket({ study, claims = [], humanName = s => s } = {}) {
  if (!study) throw new Error('STRATEGY_PACKET_STUDY_REQUIRED');
  const subject = study.plan?.question?.subject ?? 'controlled-study';
  const packet = createStrategyExplanationPacket({
    surface: STRATEGY_INTERPRETER_SURFACES.CONTROLLED_STUDY,
    subject, humanSubjectName: humanName(subject),
    context: { rulesProfile: study.plan?.rulesProfile, eraId: study.plan?.eraId },
    controlledClaims: claims,
    surfaceData: {
      study: {
        status: study.status ?? null,
        hiddenWorlds: study.counts?.hiddenWorlds ?? null,
        continuationsPerWorld: study.counts?.continuationsPerWorld ?? null,
        executions: study.counts?.executions ?? null,
        faults: study.faults ?? null,
        scope: 'P1 opening Start only — not midgame'
      }
    }
  });
  addGroundingFact(packet, 'study_worlds', study.counts?.hiddenWorlds, STRATEGY_FACT_UNITS.COUNT_WORLDS, 'compatible hidden worlds sampled');
  addGroundingFact(packet, 'study_executions', study.counts?.executions, STRATEGY_FACT_UNITS.COUNT_EXECUTIONS, 'branch executions completed');
  addGroundingFact(packet, 'study_faults', study.faults, STRATEGY_FACT_UNITS.COUNT_FAULTS, 'non-clean executions');
  return packet;
}

/**
 * POLICY_COMPARE surface — explain a same-context two-policy comparison.
 * Both aggregates come from identical filters, so neither side can smuggle
 * in a different evidence era.
 */
export function createPolicyComparePacket({ kind = 'policyId', left, right, context = {}, humanName: _humanName = s => s } = {}) {
  if (!left?.aggregate || !right?.aggregate) throw new Error('STRATEGY_PACKET_COMPARISON_REQUIRED');
  const subject = `compare:${kind}:${left.id}:${right.id}`;
  const side = a => a?.total ? {
    opportunities: a.total.opportunities ?? null, selected: a.total.selected ?? null,
    selectionRate: round(a.total.selectionRate), holdRate: round(a.total.holdRate),
    selectedOutcomeAssociation: round(a.total.selectedOutcomeAssociation),
    skippedOutcomeAssociation: round(a.total.skippedOutcomeAssociation)
  } : null;
  const packet = createStrategyExplanationPacket({
    surface: STRATEGY_INTERPRETER_SURFACES.POLICY_COMPARE,
    subject, humanSubjectName: `${left.id} vs ${right.id}`,
    context,
    surfaceData: { comparison: { kind, left: { id: left.id, total: side(left.aggregate) }, right: { id: right.id, total: side(right.aggregate) }, note: 'Behavior difference is not global policy superiority.' } }
  });
  for (const tag of ['left', 'right']) {
    const t = tag === 'left' ? left.aggregate?.total : right.aggregate?.total;
    addGroundingFact(packet, `${tag}_selection_rate`, round(t?.selectionRate), STRATEGY_FACT_UNITS.PERCENT, `selection rate for ${tag === 'left' ? left.id : right.id}`);
    addGroundingFact(packet, `${tag}_opportunities`, t?.opportunities, STRATEGY_FACT_UNITS.COUNT_OPPORTUNITIES, `legal opportunities for ${tag === 'left' ? left.id : right.id}`);
    addGroundingFact(packet, `${tag}_selections`, t?.selected, STRATEGY_FACT_UNITS.COUNT_SELECTIONS, `selections for ${tag === 'left' ? left.id : right.id}`);
  }
  return packet;
}

/**
 * GUIDE surface — polish/explain the deterministic Expert Guide. The sealed
 * markdown is interpretation input; AI output is never a replacement
 * scientific artifact and cannot alter claims, confidence or provenance.
 */
export function createGuidePacket({ manifest, markdown, context = {}, humanName: _humanName = s => s } = {}) {
  if (!manifest || typeof markdown !== 'string' || !markdown) throw new Error('STRATEGY_PACKET_GUIDE_REQUIRED');
  const claims = manifest.claims ?? [];
  const packet = createStrategyExplanationPacket({
    surface: STRATEGY_INTERPRETER_SURFACES.GUIDE,
    subject: 'guide:expert', humanSubjectName: 'Expert Strategy Guide',
    context,
    claims: claims.filter(c => c.evidenceType !== 'COUNTERFACTUAL'),
    controlledClaims: claims.filter(c => c.evidenceType === 'COUNTERFACTUAL'),
    researchLeads: manifest.leads ?? [],
    surfaceData: {
      guide: {
        entries: manifest.entries?.length ?? null, claimCount: claims.length,
        leadCount: (manifest.leads ?? []).length, generatedAt: manifest.generatedAt ?? null,
        text: markdown.slice(0, 16000)
      }
    }
  });
  addGroundingFact(packet, 'guide_claims', claims.length, STRATEGY_FACT_UNITS.COUNT_COMPARISONS, 'claims cited by the deterministic guide');
  addGroundingFact(packet, 'guide_subjects', manifest.entries?.length, STRATEGY_FACT_UNITS.COUNT_SUBJECTS, 'subjects covered by the guide');
  return packet;
}

/**
 * EVIDENCE_DESK surface — summarize what evidence exists and what is
 * missing. Caller supplies counts; no raw artifacts or provenance rows.
 */
export function createEvidenceDeskPacket({ summary, context = {} } = {}) {
  if (!summary) throw new Error('STRATEGY_PACKET_SUMMARY_REQUIRED');
  const packet = createStrategyExplanationPacket({
    surface: STRATEGY_INTERPRETER_SURFACES.EVIDENCE_DESK,
    subject: 'evidence-desk', humanSubjectName: 'Evidence desk',
    context,
    surfaceData: {
      desk: {
        sources: summary.sources ?? null, fullDecisionGames: summary.fullDecisionGames ?? null,
        events: summary.events ?? null, subjects: summary.subjects ?? null,
        transcripts: summary.transcripts ?? null, importedResearch: summary.importedResearch ?? null,
        studies: summary.studies ?? null, informationStudies: summary.informationStudies ?? null
      }
    }
  });
  addGroundingFact(packet, 'desk_sources', summary.sources, STRATEGY_FACT_UNITS.COUNT_SOURCES, 'immutable evidence sources stored');
  addGroundingFact(packet, 'desk_games', summary.fullDecisionGames, STRATEGY_FACT_UNITS.COUNT_GAMES, 'games with full decision evidence');
  addGroundingFact(packet, 'desk_events', summary.events, STRATEGY_FACT_UNITS.COUNT_EVENTS, 'decision events indexed');
  addGroundingFact(packet, 'desk_subjects', summary.subjects, STRATEGY_FACT_UNITS.COUNT_SUBJECTS, 'subjects with evidence');
  return packet;
}

// Number+unit phrases the validator recognizes. A bare numeral ("Rank 7",
// "Seven", "128") with no unit word is subject identity or ordinary prose —
// never a statistical claim — and is not checked here.
const NUMERIC_UNIT_PATTERN = /(?<![\d.,])([+-]?\d+(?:\.\d+)?)\s*(%|percentage points?|\bpp\b|percent\b|points?\b|games?\b|decisions?\b|hidden worlds?\b|worlds?\b|opportunit(?:y|ies)\b|selections?\b|continuations?\b|comparisons?\b|executions?\b|faults?\b|policies\b|matchups?\b|states?\b|seed blocks?\b|subjects?\b|sources?\b|events?\b)/gi;
const UNIT_ALIASES = Object.freeze({
  '%': STRATEGY_FACT_UNITS.PERCENT, 'percent': STRATEGY_FACT_UNITS.PERCENT,
  'percentage point': STRATEGY_FACT_UNITS.PERCENTAGE_POINTS, 'percentage points': STRATEGY_FACT_UNITS.PERCENTAGE_POINTS,
  'pp': STRATEGY_FACT_UNITS.PERCENTAGE_POINTS, 'point': STRATEGY_FACT_UNITS.PERCENTAGE_POINTS, 'points': STRATEGY_FACT_UNITS.PERCENTAGE_POINTS,
  'game': STRATEGY_FACT_UNITS.COUNT_GAMES, 'games': STRATEGY_FACT_UNITS.COUNT_GAMES,
  'decision': STRATEGY_FACT_UNITS.COUNT_DECISIONS, 'decisions': STRATEGY_FACT_UNITS.COUNT_DECISIONS,
  'hidden world': STRATEGY_FACT_UNITS.COUNT_WORLDS, 'hidden worlds': STRATEGY_FACT_UNITS.COUNT_WORLDS,
  'world': STRATEGY_FACT_UNITS.COUNT_WORLDS, 'worlds': STRATEGY_FACT_UNITS.COUNT_WORLDS,
  'opportunity': STRATEGY_FACT_UNITS.COUNT_OPPORTUNITIES, 'opportunities': STRATEGY_FACT_UNITS.COUNT_OPPORTUNITIES,
  'selection': STRATEGY_FACT_UNITS.COUNT_SELECTIONS, 'selections': STRATEGY_FACT_UNITS.COUNT_SELECTIONS,
  'continuation': STRATEGY_FACT_UNITS.COUNT_CONTINUATIONS, 'continuations': STRATEGY_FACT_UNITS.COUNT_CONTINUATIONS,
  'comparison': STRATEGY_FACT_UNITS.COUNT_COMPARISONS, 'comparisons': STRATEGY_FACT_UNITS.COUNT_COMPARISONS,
  'execution': STRATEGY_FACT_UNITS.COUNT_EXECUTIONS, 'executions': STRATEGY_FACT_UNITS.COUNT_EXECUTIONS,
  'fault': STRATEGY_FACT_UNITS.COUNT_FAULTS, 'faults': STRATEGY_FACT_UNITS.COUNT_FAULTS,
  'policy': STRATEGY_FACT_UNITS.COUNT_POLICIES, 'policies': STRATEGY_FACT_UNITS.COUNT_POLICIES,
  'matchup': STRATEGY_FACT_UNITS.COUNT_MATCHUPS, 'matchups': STRATEGY_FACT_UNITS.COUNT_MATCHUPS,
  'state': STRATEGY_FACT_UNITS.COUNT_STATES, 'states': STRATEGY_FACT_UNITS.COUNT_STATES,
  'seed block': STRATEGY_FACT_UNITS.COUNT_SEED_BLOCKS, 'seed blocks': STRATEGY_FACT_UNITS.COUNT_SEED_BLOCKS,
  'subject': STRATEGY_FACT_UNITS.COUNT_SUBJECTS, 'subjects': STRATEGY_FACT_UNITS.COUNT_SUBJECTS,
  'source': STRATEGY_FACT_UNITS.COUNT_SOURCES, 'sources': STRATEGY_FACT_UNITS.COUNT_SOURCES,
  'event': STRATEGY_FACT_UNITS.COUNT_EVENTS, 'events': STRATEGY_FACT_UNITS.COUNT_EVENTS
});

/**
 * Strict validation of structured model output. Fails closed: a malformed
 * or ungrounded response is rejected, never treated as evidence. Numeric
 * claims are checked per-unit — "29 games" cannot authorize "29%".
 */
export function validateStrategyExplanation(value, packet) {
  const fail = code => { throw new Error(code); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('STRATEGY_EXPLANATION_SCHEMA');
  const required = STRATEGY_EXPLANATION_SCHEMA.required;
  const allowed = Object.keys(STRATEGY_EXPLANATION_SCHEMA.properties);
  for (const key of required) if (!(key in value)) fail('STRATEGY_EXPLANATION_SCHEMA');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('STRATEGY_EXPLANATION_SCHEMA');
  for (const key of required.filter(k => k !== 'warnings' && k !== 'usedFactIds'))
    if (typeof value[key] !== 'string') fail('STRATEGY_EXPLANATION_SCHEMA');
  if (!Array.isArray(value.warnings) || value.warnings.some(w => typeof w !== 'string')) fail('STRATEGY_EXPLANATION_SCHEMA');
  if ('usedFactIds' in value && (!Array.isArray(value.usedFactIds) || value.usedFactIds.some(id => typeof id !== 'string'))) fail('STRATEGY_EXPLANATION_SCHEMA');
  if (!STRATEGY_EVIDENCE_LABELS.includes(value.evidenceLabel)) fail('STRATEGY_EXPLANATION_SCHEMA');
  // The model must echo the deterministic classification, not invent one.
  if (packet && value.evidenceLabel !== packet.evidenceLabel) fail('STRATEGY_EXPLANATION_LABEL_MISMATCH');
  if (packet && packet.highestConfidence !== 'UNKNOWN' && value.confidenceLanguage !== packet.highestConfidence) fail('STRATEGY_EXPLANATION_CONFIDENCE_MISMATCH');
  if (packet && packet.highestConfidence === 'UNKNOWN' && !['UNKNOWN', 'INSUFFICIENT'].includes(value.confidenceLanguage)) fail('STRATEGY_EXPLANATION_CONFIDENCE_MISMATCH');
  if (packet) {
    const facts = packet.groundingFacts ?? [];
    const factIds = new Set(facts.map(f => f.id));
    // Declared citations must reference real grounding facts.
    for (const id of value.usedFactIds ?? []) if (!factIds.has(id)) fail('STRATEGY_EXPLANATION_UNKNOWN_FACT');
    // Unit-aware grounding: every "number + unit" phrase must match a fact
    // of the SAME unit at the same value. Same-number/wrong-unit prose fails.
    const allowedByUnit = new Map();
    for (const f of facts) {
      const n = factNumber(f);
      if (n === null) continue;
      if (!allowedByUnit.has(f.unit)) allowedByUnit.set(f.unit, new Set());
      allowedByUnit.get(f.unit).add(n);
    }
    const text = required.filter(k => k !== 'warnings').map(k => value[k]).join(' ') + ' ' + value.warnings.join(' ');
    for (const match of text.matchAll(NUMERIC_UNIT_PATTERN)) {
      const unit = UNIT_ALIASES[match[2].toLowerCase()];
      const num = Number(match[1]);
      if (!unit || !allowedByUnit.get(unit)?.has(num)) fail('STRATEGY_EXPLANATION_UNGROUNDED_NUMBER');
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
    surface: packet?.surface ?? STRATEGY_INTERPRETER_SURFACES.CARD,
    model,
    generatedAt: new Date().toISOString(),
    packetVersion: packet?.contract ?? STRATEGY_EXPLANATION_PACKET_CONTRACT,
    promptVersion: STRATEGY_INTERPRETER_PROMPT_VERSION,
    scientific: false,
    disclaimer: 'AI interpretation of Field Manual evidence — not scientific output.'
  };
}
