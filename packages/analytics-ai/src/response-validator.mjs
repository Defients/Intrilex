// ═══════════════════════════════════════════════════════════════
// response-validator.mjs — Validates parsed model output against the
// structured contract. Reports errors without throwing; the controller
// decides whether to attempt repair or fall back.
// ═══════════════════════════════════════════════════════════════

import { ENUMS, emptyResponse } from './response-schema.mjs';

/**
 * Validate an analysis response object.
 * @returns {{ valid: boolean, errors: Array<string>, warnings: Array<string>, normalized: object }}
 */
export function validateAnalysisResponse(obj) {
  const errors = [];
  const warnings = [];
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['Response is not a JSON object'], warnings, normalized: emptyResponse() };
  }

  // Validate presence + types of required top-level fields on the INPUT
  // (before merging defaults) so missing fields are reported.
  if (!('summary' in obj)) errors.push('summary is required');
  else if (typeof obj.summary !== 'string') errors.push('summary must be a string');
  if (!('overallConfidence' in obj)) errors.push('overallConfidence is required');
  if (!('healthAssessment' in obj)) errors.push('healthAssessment is required');

  const normalized = { ...emptyResponse(), ...obj };

  // ── Top-level scalar fields ──
  if ('summary' in obj && typeof normalized.summary !== 'string') errors.push('summary must be a string');
  if ('overallConfidence' in obj) {
    const conf = Number(normalized.overallConfidence);
    if (!Number.isFinite(conf) || conf < 0 || conf > 1) {
      errors.push('overallConfidence must be a number in [0,1]');
    } else {
      normalized.overallConfidence = conf;
    }
  }

  // ── healthAssessment ──
  const ha = normalized.healthAssessment || {};
  const haStatus = enumOr(ha.status, ENUMS.healthStatus, 'unreliable', 'healthAssessment.status', errors);
  if (ha.explanation !== undefined && typeof ha.explanation !== 'string') errors.push('healthAssessment.explanation must be a string');
  normalized.healthAssessment = { status: haStatus, explanation: typeof ha.explanation === 'string' ? ha.explanation : '' };

  // ── keyFindings ──
  normalized.keyFindings = Array.isArray(normalized.keyFindings) ? normalized.keyFindings : [];
  normalized.keyFindings = normalized.keyFindings.map((f, i) => validateFinding(f, i, errors, warnings));

  // ── overpowered / underpowered ──
  normalized.potentiallyOverpowered = Array.isArray(normalized.potentiallyOverpowered) ? normalized.potentiallyOverpowered : [];
  normalized.potentiallyUnderpowered = Array.isArray(normalized.potentiallyUnderpowered) ? normalized.potentiallyUnderpowered : [];
  normalized.potentiallyOverpowered = normalized.potentiallyOverpowered.map((p, i) => validatePowerEntry(p, i, 'potentiallyOverpowered', errors, warnings));
  normalized.potentiallyUnderpowered = normalized.potentiallyUnderpowered.map((p, i) => validatePowerEntry(p, i, 'potentiallyUnderpowered', errors, warnings));

  // ── anomalies ──
  normalized.anomalies = Array.isArray(normalized.anomalies) ? normalized.anomalies : [];
  normalized.anomalies = normalized.anomalies.map((a, i) => validateAnomaly(a, i, errors, warnings));

  // ── string arrays ──
  normalized.dataLimitations = toStringArray(normalized.dataLimitations, 'dataLimitations', errors);
  normalized.followUpQuestions = toStringArray(normalized.followUpQuestions, 'followUpQuestions', errors);

  // ── recommendedExperiments ──
  normalized.recommendedExperiments = Array.isArray(normalized.recommendedExperiments) ? normalized.recommendedExperiments : [];
  normalized.recommendedExperiments = normalized.recommendedExperiments.map((e, i) => validateExperiment(e, i, errors, warnings));

  // Soft warnings for missing evidence on significant findings
  for (const f of normalized.keyFindings) {
    if (f.severity === 'high' || f.severity === 'critical') {
      if (!f.evidence || f.evidence.length === 0) {
        warnings.push(`Finding "${f.title}" is ${f.severity} but has no evidence entries`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, normalized };
}

function validateFinding(f, i, errors, warnings) {
  const path = `keyFindings[${i}]`;
  if (f == null || typeof f !== 'object') {
    errors.push(`${path} must be an object`);
    return { title: '(invalid)', classification: 'unknown', severity: 'info', confidence: 0, observation: '', evidence: [], interpretation: '', alternativeExplanations: [], recommendedAction: '' };
  }
  const out = {
    title: typeof f.title === 'string' ? f.title : (errors.push(`${path}.title must be a string`), '(missing)'),
    classification: enumOr(f.classification, ENUMS.classification, 'unknown', `${path}.classification`, errors),
    severity: enumOr(f.severity, ENUMS.severity, 'info', `${path}.severity`, errors),
    confidence: numIn(f.confidence, 0, 1, 0, `${path}.confidence`, errors),
    observation: typeof f.observation === 'string' ? f.observation : (errors.push(`${path}.observation must be a string`), ''),
    evidence: Array.isArray(f.evidence) ? f.evidence.map((e, j) => validateEvidence(e, `${path}.evidence[${j}]`, errors)) : [],
    interpretation: typeof f.interpretation === 'string' ? f.interpretation : (errors.push(`${path}.interpretation must be a string`), ''),
    alternativeExplanations: toStringArray(f.alternativeExplanations, `${path}.alternativeExplanations`, errors),
    recommendedAction: typeof f.recommendedAction === 'string' ? f.recommendedAction : (errors.push(`${path}.recommendedAction must be a string`), '')
  };
  return out;
}

function validateEvidence(e, path, errors) {
  if (e == null || typeof e !== 'object') {
    errors.push(`${path} must be an object`);
    return { metric: '', value: '', comparison: '', sourceId: '' };
  }
  return {
    metric: typeof e.metric === 'string' ? e.metric : (errors.push(`${path}.metric must be a string`), ''),
    value: e.value, // string or number — keep as-is
    comparison: typeof e.comparison === 'string' ? e.comparison : '',
    sourceId: typeof e.sourceId === 'string' ? e.sourceId : (errors.push(`${path}.sourceId must be a string`), '')
  };
}

function validatePowerEntry(p, i, field, errors, warnings) {
  const path = `${field}[${i}]`;
  if (p == null || typeof p !== 'object') {
    errors.push(`${path} must be an object`);
    return { entity: '(invalid)', confidence: 0, evidenceFor: [], evidenceAgainst: [], verdict: '' };
  }
  return {
    entity: typeof p.entity === 'string' ? p.entity : (errors.push(`${path}.entity must be a string`), '(missing)'),
    confidence: numIn(p.confidence, 0, 1, 0, `${path}.confidence`, errors),
    evidenceFor: toStringArray(p.evidenceFor, `${path}.evidenceFor`, errors),
    evidenceAgainst: toStringArray(p.evidenceAgainst, `${path}.evidenceAgainst`, errors),
    verdict: typeof p.verdict === 'string' ? p.verdict : (errors.push(`${path}.verdict must be a string`), '')
  };
}

function validateAnomaly(a, i, errors, warnings) {
  const path = `anomalies[${i}]`;
  if (a == null || typeof a !== 'object') {
    errors.push(`${path} must be an object`);
    return { metric: '(invalid)', observed: '', expectedOrReference: '', classification: 'INSUFFICIENT_EVIDENCE', confidence: 0, possibleCauses: [], verificationSteps: [] };
  }
  return {
    metric: typeof a.metric === 'string' ? a.metric : (errors.push(`${path}.metric must be a string`), '(missing)'),
    observed: typeof a.observed === 'string' ? a.observed : (errors.push(`${path}.observed must be a string`), ''),
    expectedOrReference: typeof a.expectedOrReference === 'string' ? a.expectedOrReference : '',
    classification: enumOr(a.classification, ENUMS.anomalyClassification, 'INSUFFICIENT_EVIDENCE', `${path}.classification`, errors),
    confidence: numIn(a.confidence, 0, 1, 0, `${path}.confidence`, errors),
    possibleCauses: toStringArray(a.possibleCauses, `${path}.possibleCauses`, errors),
    verificationSteps: toStringArray(a.verificationSteps, `${path}.verificationSteps`, errors)
  };
}

function validateExperiment(e, i, errors, warnings) {
  const path = `recommendedExperiments[${i}]`;
  if (e == null || typeof e !== 'object') {
    errors.push(`${path} must be an object`);
    return { hypothesis: '', configuration: '', metrics: [], supportingOutcome: '', rejectingOutcome: '' };
  }
  return {
    hypothesis: typeof e.hypothesis === 'string' ? e.hypothesis : (errors.push(`${path}.hypothesis must be a string`), ''),
    configuration: typeof e.configuration === 'string' ? e.configuration : (errors.push(`${path}.configuration must be a string`), ''),
    metrics: toStringArray(e.metrics, `${path}.metrics`, errors),
    supportingOutcome: typeof e.supportingOutcome === 'string' ? e.supportingOutcome : (errors.push(`${path}.supportingOutcome must be a string`), ''),
    rejectingOutcome: typeof e.rejectingOutcome === 'string' ? e.rejectingOutcome : (errors.push(`${path}.rejectingOutcome must be a string`), '')
  };
}

function enumOr(value, allowed, fallback, path, errors) {
  if (typeof value === 'string' && allowed.includes(value)) return value;
  // Case-insensitive fallback for near-misses
  const lower = typeof value === 'string' ? value.toLowerCase() : null;
  const match = lower ? allowed.find(a => a.toLowerCase() === lower) : null;
  if (match) return match;
  errors.push(`${path} must be one of ${allowed.join('|')} (got ${JSON.stringify(value)})`);
  return fallback;
}

function numIn(v, min, max, fallback, path, errors) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    errors.push(`${path} must be a number in [${min},${max}] (got ${JSON.stringify(v)})`);
    return fallback;
  }
  return n;
}

function toStringArray(v, path, errors) {
  if (v == null) return [];
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (typeof v[i] === 'string') out.push(v[i]);
      else errors.push(`${path}[${i}] must be a string`);
    }
    return out;
  }
  if (typeof v === 'string') return [v];
  errors.push(`${path} must be an array of strings`);
  return [];
}
