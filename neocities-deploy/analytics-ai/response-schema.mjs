// ═══════════════════════════════════════════════════════════════
// response-schema.mjs — Structured output contract for the Ollama
// model (spec §6). Defines the JSON schema the model must return and
// the enum vocabularies the validator enforces.
// ═══════════════════════════════════════════════════════════════

export const ANALYSIS_RESPONSE_SCHEMA_VERSION = '1.0.0';

export const ENUMS = Object.freeze({
  healthStatus: ['healthy', 'mixed', 'concerning', 'unreliable'],
  classification: ['balance', 'ai_policy', 'engine', 'analytics', 'sample_noise', 'expected', 'unknown'],
  severity: ['info', 'low', 'medium', 'high', 'critical'],
  anomalyClassification: [
    'LIKELY_BALANCE_ISSUE',
    'LIKELY_AI_POLICY_ISSUE',
    'LIKELY_ENGINE_OR_RULES_BUG',
    'LIKELY_ANALYTICS_BUG',
    'LIKELY_SAMPLE_NOISE',
    'INSUFFICIENT_EVIDENCE',
    'EXPECTED_BEHAVIOR'
  ]
});

/**
 * Human-readable schema description embedded in the prompt so the model
 * knows the exact contract. Kept in sync with the validator below.
 */
export const SCHEMA_PROMPT_DESCRIPTION = `Return ONLY a single JSON object (no prose, no markdown fences) matching this contract:
{
  "summary": string,
  "overallConfidence": number (0..1),
  "healthAssessment": { "status": "healthy"|"mixed"|"concerning"|"unreliable", "explanation": string },
  "keyFindings": [
    {
      "title": string,
      "classification": "balance"|"ai_policy"|"engine"|"analytics"|"sample_noise"|"expected"|"unknown",
      "severity": "info"|"low"|"medium"|"high"|"critical",
      "confidence": number (0..1),
      "observation": string,
      "evidence": [ { "metric": string, "value": string|number, "comparison": string, "sourceId": string } ],
      "interpretation": string,
      "alternativeExplanations": [string],
      "recommendedAction": string
    }
  ],
  "potentiallyOverpowered": [ { "entity": string, "confidence": number, "evidenceFor": [string], "evidenceAgainst": [string], "verdict": string } ],
  "potentiallyUnderpowered": [ same shape ],
  "anomalies": [
    {
      "metric": string,
      "observed": string,
      "expectedOrReference": string,
      "classification": "LIKELY_BALANCE_ISSUE"|"LIKELY_AI_POLICY_ISSUE"|"LIKELY_ENGINE_OR_RULES_BUG"|"LIKELY_ANALYTICS_BUG"|"LIKELY_SAMPLE_NOISE"|"INSUFFICIENT_EVIDENCE"|"EXPECTED_BEHAVIOR",
      "confidence": number,
      "possibleCauses": [string],
      "verificationSteps": [string]
    }
  ],
  "dataLimitations": [string],
  "recommendedExperiments": [
    { "hypothesis": string, "configuration": string, "metrics": [string], "supportingOutcome": string, "rejectingOutcome": string }
  ],
  "followUpQuestions": [string]
}
Rules:
- Every significant finding MUST include at least one evidence entry with a sourceId.
- Never label something overpowered or underpowered from a single metric (usage or win rate alone).
- confidence is a number in [0,1]; use low values when sample size is small or evidence is conflicting.
- If evidence is insufficient, prefer "INSUFFICIENT_EVIDENCE" / "unknown" over a confident diagnosis.
- Include alternativeExplanations for every major finding.`;

// Shared building blocks for ANALYSIS_RESPONSE_SCHEMA. The `value`
// evidence field accepts string|number, so it is left unconstrained.
const EVIDENCE_SCHEMA = {
  type: 'object',
  required: ['metric', 'sourceId'],
  properties: {
    metric: { type: 'string' },
    value: {},
    comparison: { type: 'string' },
    sourceId: { type: 'string' }
  }
};
const POWER_ENTRY_SCHEMA = {
  type: 'object',
  required: ['entity', 'confidence', 'verdict'],
  properties: {
    entity: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    evidenceFor: { type: 'array', items: { type: 'string' } },
    evidenceAgainst: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' }
  }
};
const STRING_ARRAY = { type: 'array', items: { type: 'string' } };

/**
 * JSON Schema matching the contract above, sent as the Ollama `format`
 * field so generation is constrained to parseable, correctly shaped
 * output instead of relying on prompt discipline alone. Mirrors what
 * validateAnalysisResponse treats as errors (not just warnings).
 */
export const ANALYSIS_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  required: ['summary', 'overallConfidence', 'healthAssessment'],
  properties: {
    summary: { type: 'string' },
    overallConfidence: { type: 'number', minimum: 0, maximum: 1 },
    healthAssessment: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ENUMS.healthStatus },
        explanation: { type: 'string' }
      }
    },
    keyFindings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'classification', 'severity', 'confidence', 'observation', 'interpretation', 'recommendedAction'],
        properties: {
          title: { type: 'string' },
          classification: { type: 'string', enum: ENUMS.classification },
          severity: { type: 'string', enum: ENUMS.severity },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          observation: { type: 'string' },
          evidence: { type: 'array', items: EVIDENCE_SCHEMA },
          interpretation: { type: 'string' },
          alternativeExplanations: STRING_ARRAY,
          recommendedAction: { type: 'string' }
        }
      }
    },
    potentiallyOverpowered: { type: 'array', items: POWER_ENTRY_SCHEMA },
    potentiallyUnderpowered: { type: 'array', items: POWER_ENTRY_SCHEMA },
    anomalies: {
      type: 'array',
      items: {
        type: 'object',
        required: ['metric', 'observed', 'classification', 'confidence'],
        properties: {
          metric: { type: 'string' },
          observed: { type: 'string' },
          expectedOrReference: { type: 'string' },
          classification: { type: 'string', enum: ENUMS.anomalyClassification },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          possibleCauses: STRING_ARRAY,
          verificationSteps: STRING_ARRAY
        }
      }
    },
    dataLimitations: STRING_ARRAY,
    recommendedExperiments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['hypothesis', 'configuration', 'supportingOutcome', 'rejectingOutcome'],
        properties: {
          hypothesis: { type: 'string' },
          configuration: { type: 'string' },
          metrics: STRING_ARRAY,
          supportingOutcome: { type: 'string' },
          rejectingOutcome: { type: 'string' }
        }
      }
    },
    followUpQuestions: STRING_ARRAY
  }
});

/**
 * The minimal empty response, used as a fallback when repair fails.
 */
export function emptyResponse() {
  return {
    summary: '',
    overallConfidence: 0,
    healthAssessment: { status: 'unreliable', explanation: 'No valid analysis produced.' },
    keyFindings: [],
    potentiallyOverpowered: [],
    potentiallyUnderpowered: [],
    anomalies: [],
    dataLimitations: [],
    recommendedExperiments: [],
    followUpQuestions: []
  };
}
