import { WEIGHT_FEATURES } from '../../policies/src/weighted-heuristic.mjs';
import { CONTRACTS, makeArtifact, canCompareMeasurements, fail, TRAIT_CATALOG } from './profile-contracts.mjs';

// LEARNING_JOURNAL v1: deterministic structured explanations generated from
// frozen inputs. "Parameter changed", "behavior changed" and "parameter caused
// behavior" are separate claims; this generator never asserts the third.

export const JOURNAL_KINDS = Object.freeze(['INITIALIZATION', 'PROMOTION', 'AUTHORED_ACTIVATION', 'MANUAL_ACTIVATION', 'ROLLBACK', 'CONTEXT_CHANGE', 'FORK', 'V1_LINK', 'IMPORT_AS_FORK']);
const NOT_MEASURED = Object.freeze({ status: 'NOT_MEASURED', note: 'No purpose-appropriate measurement is part of this transition.' });

/** Classify each parameter of a checkpoint by the most recent derivation that wrote it. */
export function parameterProvenance(checkpoint, checkpointsById) {
  const out = Object.fromEntries(WEIGHT_FEATURES.map(k => [k, null])), seen = new Set();
  for (let cp = checkpoint; cp && !seen.has(cp.checkpointId) && Object.values(out).some(v => v === null); cp = checkpointsById.get(cp.parentCheckpointId)) {
    seen.add(cp.checkpointId);
    const m = cp.mutation ?? {};
    if (m.kind === 'PROFILE_OPTIMIZER_MUTATION_V1' && m.operator?.delta !== 0 && out[m.operator.parameter] === null) out[m.operator.parameter] = 'LEARNED_BY_OPTIMIZER';
    else if (m.kind === 'BOUNDED_SINGLE_FEATURE_V1' && out[m.parameter] === null) out[m.parameter] = 'LEARNED_BY_OPTIMIZER_V1';
    else if (m.kind === 'PROFILE_AUTHORED_EDIT_V1') for (const w of m.writes) if (out[w.parameter] === null) out[w.parameter] = 'AUTHORED';
    if (!cp.parentCheckpointId) for (const k of WEIGHT_FEATURES) if (out[k] === null) out[k] = m.kind === 'PROFILE_BASELINE_V1' && m.writes?.some(w => w.parameter === k) ? 'AUTHORED' : cp.agentId?.startsWith('AP:') ? 'BASELINE' : 'V1_ROOT';
  }
  for (const k of WEIGHT_FEATURES) out[k] ??= 'UNKNOWN_ANCESTRY';
  return out;
}
export function genomeDelta(from, to) {
  return WEIGHT_FEATURES.map(parameter => {
    const before = from ? from.policyState.weights[parameter] : null, after = to.policyState.weights[parameter];
    return { parameter, before, after, delta: before === null ? null : after - before, changed: before !== after };
  });
}
const derivationOf = cp => ({ checkpointId: cp.checkpointId, derivation: cp.mutation?.kind ?? (cp.parentCheckpointId ? 'UNKNOWN' : 'ROOT'), parentCheckpointId: cp.parentCheckpointId });

function behaviorChange(challenger, incumbent) {
  if (!challenger || !incumbent || !canCompareMeasurements(challenger, incumbent).ok) return { status: 'UNAVAILABLE', note: 'No compatible paired measurement.' };
  const rows = [];
  for (const m of challenger.body.matchups) {
    const n = incumbent.body.matchups.find(x => x.opponentCheckpointId === m.opponentCheckpointId);
    if (!n || !m.behavior.decisions || !n.behavior.decisions) continue;
    for (const key of new Set([...Object.keys(m.behavior.actionRates), ...Object.keys(n.behavior.actionRates)])) {
      const a = n.behavior.actionRates[key] ?? 0, b = m.behavior.actionRates[key] ?? 0;
      rows.push({ opponent: m.opponentPolicyId, actionFamily: key, incumbentRate: a, challengerRate: b, delta: b - a, incumbentDecisions: n.behavior.decisions, challengerDecisions: m.behavior.decisions });
    }
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.opponent.localeCompare(y.opponent) || x.actionFamily.localeCompare(y.actionFamily));
  return { status: rows.length ? 'OBSERVED' : 'UNAVAILABLE', context: 'Same fresh challenge pack and opponents; per-opponent action-family rate per subject decision.', largest: rows.slice(0, 8), note: 'Observed differences in measured contexts only. Not evidence that a parameter caused a behavior.' };
}

/** Build a journal artifact. `inputs` must be frozen evidence; nothing here reads storage or clocks. */
export function buildJournal({ kind, agentProfileId, transitionId, from, to, inputs = {} }) {
  if (!JOURNAL_KINDS.includes(kind)) fail('UNSUPPORTED_JOURNAL_KIND', kind);
  if (!to?.checkpoint || !to.revisionId) fail('JOURNAL_INPUT_MISSING', 'to');
  const parameterChange = { delta: genomeDelta(from?.checkpoint ?? null, to.checkpoint), toDerivation: derivationOf(to.checkpoint),
    provenance: inputs.provenance ?? null, note: 'Concrete executable parameters; derivation describes how the active genome was obtained.' };
  const sections = { parameterChange, behaviorChange: NOT_MEASURED, performanceChange: NOT_MEASURED, tradeoffs: NOT_MEASURED };
  let decision, interpretation, evidenceQuality, references = { transitionId, fromCheckpointId: from?.checkpoint.checkpointId ?? null, toCheckpointId: to.checkpoint.checkpointId, fromRevisionId: from?.revisionId ?? null, toRevisionId: to.revisionId };
  if (kind === 'PROMOTION') {
    const { decision: d, manifest, challengerMeasurement, incumbentMeasurement, nomination, priorAttempts = [] } = inputs;
    if (!d || !manifest || !challengerMeasurement || !incumbentMeasurement || !nomination) fail('JOURNAL_INPUT_MISSING', 'promotion evidence');
    if (d.body.decision !== 'APPROVE') fail('JOURNAL_INPUT_INVALID', 'only approved decisions promote');
    const s = d.body.statistics;
    sections.behaviorChange = behaviorChange(challengerMeasurement, incumbentMeasurement);
    sections.performanceChange = { status: 'MEASURED', purpose: 'PROMOTION_CHALLENGE', blocks: s.blocks, games: s.games, meanBlockDifference: s.mean, oneSidedLower95: s.lower, oneSidedUpper95: s.upper, perOpponent: d.body.perOpponent, estimator: d.body.estimator };
    sections.tradeoffs = { status: 'MEASURED', regressions: d.body.perOpponent.filter(o => o.delta < 0), constraintResults: d.body.constraintResults };
    decision = { outcome: 'APPROVE', policyId: manifest.body.promotionPolicyId, reasons: d.body.reasons, activation: 'AUTOMATIC_PROMOTION', attemptNumber: manifest.body.attempt.number };
    interpretation = `On ${s.blocks} fresh paired seed blocks (${s.games} games) against the frozen reference suite, the Challenger's weighted paired score exceeded the incumbent's by ${s.mean.toFixed(4)} (one-sided 95% lower bound ${s.lower.toFixed(4)}). This satisfied the frozen promotion policy against this exact incumbent. It is Profile-level selection evidence, not an unbiased estimate of general strength, and it does not show that any parameter change caused any behavior change.`;
    evidenceQuality = { purposes: { selection: 'TRAINING', promotion: 'PROMOTION_CHALLENGE' }, challengePackId: manifest.body.packId, exposure: manifest.body.exposureCheck, comparability: { eraId: manifest.body.eraId, sameEraAndPack: canCompareMeasurements(challengerMeasurement, incumbentMeasurement).ok },
      repeatedTesting: { attemptNumber: manifest.body.attempt.number, priorAttemptIds: priorAttempts, note: 'Per-challenge uncertainty only; no lifetime family-wise error control.' } };
    references = { ...references, nominationId: nomination.id, seriesId: nomination.body.seriesId, challengeId: manifest.id, decisionId: d.id, challengerMeasurementId: challengerMeasurement.id, incumbentMeasurementId: incumbentMeasurement.id, policyId: manifest.body.promotionPolicyId, eraId: manifest.body.eraId };
  } else if (kind === 'MANUAL_ACTIVATION') {
    const { reason, waivedCriteria = [], recommendation = null } = inputs;
    if (typeof reason !== 'string' || !reason.trim()) fail('JOURNAL_INPUT_MISSING', 'reason');
    decision = { outcome: 'MANUAL_ACTIVATION', reason, waivedCriteria, automatedRecommendation: recommendation, activation: 'HUMAN_DECISION' };
    interpretation = recommendation ? `Activated by explicit human decision. The automated recommendation (${recommendation.decision}) is preserved and was not overridden into an automatic qualification.` : 'Activated by explicit human decision without a purpose-appropriate automated challenge. Strength relative to the previous Champion is not measured.';
    evidenceQuality = { status: recommendation ? 'AUTOMATED_RECOMMENDATION_PRESERVED' : 'UNEVALUATED', note: 'Manual activation is not independent automatic qualification.' };
    references = { ...references, recommendationDecisionId: recommendation?.decisionId ?? null };
  } else {
    const text = {
      INITIALIZATION: 'Initial Champion installed from the authored revision. Performance is not measured; this is not a promotion.',
      AUTHORED_ACTIVATION: 'Authored revision activated. Executable changes, if any, were compiled from authored traits; no performance improvement is claimed.',
      ROLLBACK: 'A historical Champion/revision pair was explicitly re-activated with a fresh head version. Earlier challenge authorizations are not restored.',
      CONTEXT_CHANGE: 'The required Evaluation Era or effective promotion policy changed. The Champion genome is unchanged.',
      FORK: 'A new Profile was forked from an exact source checkpoint and revision. The source Profile and checkpoint ancestry are unchanged.',
      V1_LINK: 'An explicitly selected V1 checkpoint was linked with its original ID and hash. V1 EVALUATION evidence is historical and is not promotion-challenge evidence.',
      IMPORT_AS_FORK: 'An imported Profile was installed as a new local fork. Imported claims remain externally unverified.',
    }[kind];
    decision = { outcome: kind, activation: kind === 'CONTEXT_CHANGE' ? 'CONTEXT_CHANGE' : 'EXPLICIT_COMMAND', ...(inputs.context ? { context: inputs.context } : {}) };
    interpretation = text;
    evidenceQuality = { status: inputs.evidenceStatus ?? 'UNEVALUATED' };
    if (inputs.references) references = { ...references, ...inputs.references };
  }
  return makeArtifact('LEARNING_JOURNAL', { generator: { ...CONTRACTS.journal }, kind, agentProfileId, transitionId,
    from: from ? { checkpointId: from.checkpoint.checkpointId, revisionId: from.revisionId } : null, to: { checkpointId: to.checkpoint.checkpointId, revisionId: to.revisionId },
    sections: { ...sections, decision, interpretation, evidenceQuality, references } }, { scope: agentProfileId });
}

/** Longitudinal dossier: a rebuildable projection. Charts and deltas break at era/pack boundaries. */
export function buildDossier({ head, revision, measurements = [], identityConstraints = [] }) {
  const byEra = new Map();
  for (const m of measurements) {
    if (m.body.status !== 'COMPLETE') continue;
    const list = byEra.get(m.body.eraId) ?? [];list.push(m);byEra.set(m.body.eraId, list);
  }
  const eras = [...byEra.entries()].map(([eraId, list]) => ({ eraId, current: eraId === head.requiredEvaluationEraId,
    purposes: Object.fromEntries(['TRAINING', 'HELD_OUT_EVALUATION', 'PROMOTION_CHALLENGE', 'DIAGNOSTIC'].map(p => [p, list.filter(m => m.body.purpose === p).map(m => ({
      measurementId: m.id, subjectCheckpointId: m.body.subjectCheckpointId, packId: m.body.packId, objectiveScore: m.body.aggregate.objectiveScore,
      perOpponent: m.body.matchups.map(x => ({ opponent: x.opponentPolicyId, pairedScore: x.metrics.pairedScore, interval95: x.metrics.pairedScoreInterval95, pairs: x.metrics.pairCount, games: x.metrics.games, clean: x.metrics.clean, firstSeatWinRate: x.metrics.firstPlayerWinRate, nonClean: x.metrics.abortReasons, decisions: x.behavior.decisions })),
    }))])) }));
  const observedIdentity = identityConstraints.map(c => ({ constraint: c, observations: measurements.filter(m => m.body.status === 'COMPLETE').map(m => ({ measurementId: m.id, purpose: m.body.purpose, eraId: m.body.eraId, ...identityMetric(m, c) })) }));
  return { agentProfileId: head.agentProfileId, headVersion: head.headVersion, intended: { traits: revision.body.intendedIdentity.traits, statement: revision.body.intendedIdentity.statement, catalog: TRAIT_CATALOG }, eras, observedIdentity,
    note: 'Measurements are grouped by Evaluation Era and purpose. Deltas are shown only for matching era and pack. Zero-denominator metrics are unavailable, not zero.' };
}
/** Identity metric with explicit denominator; unavailable below the declared minimum. */
export function identityMetric(measurement, constraint) {
  let numerator = 0, denominator = 0;
  for (const m of measurement.body.matchups) {
    const counts = m.behaviorCounts;
    if (!counts) return { available: false, numerator: null, denominator: null, value: null, reason: 'RAW_COUNTS_UNAVAILABLE' };
    denominator += counts.decisions;
    numerator += (constraint.metricId === 'ACTION_FAMILY_RATE' ? counts.actionCounts : counts.mechanicCounts)[constraint.key] ?? 0;
  }
  if (denominator < constraint.minDenominator) return { available: false, numerator, denominator, value: null, reason: 'INSUFFICIENT_OPPORTUNITIES' };
  const value = numerator / denominator;
  return { available: true, numerator, denominator, value, withinBounds: (constraint.min === null || value >= constraint.min) && (constraint.max === null || value <= constraint.max) };
}
export const VERSIONED_JOURNAL_FUNCTIONS = { 'LEARNING_JOURNAL@1': buildJournal, 'PARAMETER_PROVENANCE@1': parameterProvenance, 'IDENTITY_METRIC@1': identityMetric };
