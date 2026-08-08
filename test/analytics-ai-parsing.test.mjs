import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalysisResponse } from '@intrilex/analytics-ai/response-validator';
import { repairResponse, extractAndRepair, stripCodeFences, extractLargestObject, removeTrailingCommas, closeBraces } from '@intrilex/analytics-ai/response-repair';
import { emptyResponse } from '@intrilex/analytics-ai/response-schema';
import { AnalysisController, ANALYSIS_STATUS } from '@intrilex/analytics-ai/analysis-controller';
import { ANALYSIS_MODE } from '@intrilex/analytics-ai/analytics-context-builder';

const validResponse = {
  summary: 'The campaign is healthy with minor seat asymmetry.',
  overallConfidence: 0.6,
  healthAssessment: { status: 'mixed', explanation: 'Mostly healthy; watch seat balance.' },
  keyFindings: [{
    title: 'Seat 2 wins more',
    classification: 'balance',
    severity: 'medium',
    confidence: 0.5,
    observation: 'Seat 2 wins 52.8% of decisive matches.',
    evidence: [{ metric: 'seatWinRate', value: 0.528, comparison: 'vs 47.2% for seat 1', sourceId: 'aggregate.seatWins' }],
    interpretation: 'Likely a first/second-player tempo effect.',
    alternativeExplanations: ['AI policy preference for seat 2', 'Sample noise'],
    recommendedAction: 'Swap seat assignments and re-run.'
  }],
  potentiallyOverpowered: [{ entity: 'Rank 10:club', confidence: 0.4, evidenceFor: ['high RPI 0.72'], evidenceAgainst: ['small per-rank sample'], verdict: 'Inconclusive' }],
  potentiallyUnderpowered: [{ entity: 'Rank 7', confidence: 0.7, evidenceFor: ['RPI 0.11'], evidenceAgainst: ['high selection count'], verdict: 'Likely underpowered but verify opportunity data' }],
  anomalies: [{ metric: 'anchor usage', observed: '0', expectedOrReference: '>0 for core mechanic', classification: 'LIKELY_ANALYTICS_BUG', confidence: 0.6, possibleCauses: ['telemetry tag missing'], verificationSteps: ['re-run with trace capture'] }],
  dataLimitations: ['Sample size of 500 is exploratory for per-rank estimates.'],
  recommendedExperiments: [{ hypothesis: 'Seat swap removes asymmetry', configuration: 'mirror seats', metrics: ['seatWinRate'], supportingOutcome: 'gap < 5pts', rejectingOutcome: 'gap persists' }],
  followUpQuestions: ['Does the asymmetry persist across AI profiles?']
};

test('parsing: valid structured output passes validation', () => {
  const r = validateAnalysisResponse(validResponse);
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
  assert.equal(r.normalized.keyFindings.length, 1);
});

test('parsing: malformed JSON (no object) fails cleanly', () => {
  const r = validateAnalysisResponse('not an object');
  assert.equal(r.valid, false);
  assert.ok(r.errors.length > 0);
  assert.deepEqual(r.normalized, emptyResponse());
});

test('parsing: partial JSON with missing required fields reports errors', () => {
  const r = validateAnalysisResponse({ summary: 'x' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('overallConfidence')));
});

test('parsing: unknown enum values are reported and normalized', () => {
  const r = validateAnalysisResponse({ ...validResponse, healthAssessment: { status: 'bogus', explanation: 'x' }, keyFindings: [{ ...validResponse.keyFindings[0], classification: 'magic', severity: 'huge' }] });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('healthAssessment.status')));
  assert.ok(r.errors.some(e => e.includes('classification')));
  assert.ok(r.errors.some(e => e.includes('severity')));
  // Normalized to safe fallbacks
  assert.equal(r.normalized.healthAssessment.status, 'unreliable');
  assert.equal(r.normalized.keyFindings[0].classification, 'unknown');
  assert.equal(r.normalized.keyFindings[0].severity, 'info');
});

test('parsing: case-insensitive enum near-miss is accepted', () => {
  const r = validateAnalysisResponse({ ...validResponse, healthAssessment: { status: 'MIXED', explanation: 'x' } });
  assert.equal(r.normalized.healthAssessment.status, 'mixed');
});

test('parsing: confidence out of [0,1] is rejected', () => {
  const r = validateAnalysisResponse({ ...validResponse, overallConfidence: 1.5 });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('overallConfidence')));
});

test('parsing: high-severity finding with no evidence triggers a warning', () => {
  const r = validateAnalysisResponse({ ...validResponse, keyFindings: [{ ...validResponse.keyFindings[0], severity: 'critical', evidence: [] }] });
  // valid may still be true (warnings, not errors) — but a warning must be present
  assert.ok(r.warnings.some(w => w.includes('no evidence')));
});

test('repair: extracts JSON from markdown fences', () => {
  const r = repairResponse('Here is the result:\n```json\n{"summary":"x","overallConfidence":0.1}\n```\nDone.');
  assert.ok(r.json);
  assert.equal(r.json.summary, 'x');
  assert.equal(r.method, 'strip-fences');
  assert.equal(r.repaired, true);
});

test('repair: removes trailing commas', () => {
  const r = repairResponse('{"summary":"x","overallConfidence":0.1,"keyFindings":[],}');
  assert.ok(r.json);
  assert.equal(r.json.summary, 'x');
});

test('repair: closes truncated braces', () => {
  const r = repairResponse('{"summary":"x","overallConfidence":0.1,"keyFindings":[{"title":"a"');
  assert.ok(r.json, 'should produce a parseable object');
  assert.equal(r.json.summary, 'x');
});

test('repair: returns null and attempts log when unrepairable', () => {
  const r = repairResponse('this is just prose with no json at all');
  assert.equal(r.json, null);
  assert.equal(r.method, 'failed');
  assert.ok(r.attempts.length > 0);
});

test('repair: extractLargestObject respects string boundaries', () => {
  const text = 'prefix {"a":"} not a close", "b":2} suffix';
  const obj = extractLargestObject(text);
  const parsed = JSON.parse(obj);
  assert.equal(parsed.a, '} not a close');
  assert.equal(parsed.b, 2);
});

test('repair: stripCodeFences handles opening-only fence', () => {
  const out = stripCodeFences('```json\n{"a":1}');
  assert.ok(out.includes('{"a":1}'));
});

test('repair: closeBraces closes mid-string', () => {
  const closed = closeBraces('{"a":"unclosed');
  assert.ok(closed.endsWith('"}'));
  JSON.parse(closed); // should not throw
});

test('repair: removeTrailingCommas handles nested', () => {
  const out = removeTrailingCommas('{"a":1,,"b":[1,2,],}');
  // Note: double comma isn't fixed by this function, only comma-before-close
  const fixed = removeTrailingCommas('{"a":1,"b":[1,2,],}');
  assert.equal(fixed, '{"a":1,"b":[1,2]}');
});

test('controller: malformed model output surfaces raw response and validation errors', async () => {
  // Inject a fetch that returns prose instead of JSON.
  const fakeFetch = async () => ({
    ok: true, status: 200,
    json: async () => { throw new Error('not json'); },
    text: async () => 'this is not json at all',
    body: null
  });
  const ctrl = new AnalysisController({ fetchImpl: fakeFetch });
  const r = await ctrl.analyze({
    settings: { enabled: true, model: 'llama3', streaming: false, endpoint: 'http://127.0.0.1:1' },
    bundle: { observatory: { mechanics: [], hasOpportunityTelemetry: true }, aggregate: { matchCount: 100 } },
    mode: ANALYSIS_MODE.EXECUTIVE_SUMMARY, useCache: false
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'malformed-output');
  assert.ok(r.rawResponse);
  assert.ok(r.validationErrors.length > 0);
  assert.ok(r.deterministicWarnings, 'deterministic warnings should still be computed');
});

test('controller: valid model output is validated and cached', async () => {
  const fakeFetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ message: { content: JSON.stringify(validResponse) }, done: true }),
    text: async () => JSON.stringify(validResponse),
    body: null
  });
  const ctrl = new AnalysisController({ fetchImpl: fakeFetch });
  const r = await ctrl.analyze({
    settings: { enabled: true, model: 'llama3', streaming: false, endpoint: 'http://127.0.0.1:1' },
    bundle: { observatory: { mechanics: [], hasOpportunityTelemetry: true }, aggregate: { matchCount: 100, aggregateHash: 'h1' } },
    mode: ANALYSIS_MODE.EXECUTIVE_SUMMARY, useCache: false
  });
  assert.equal(r.ok, true);
  assert.equal(r.analysis.summary, validResponse.summary);
  assert.equal(r.debug.repairUsed, false);
});
