import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  isLocalEndpoint,
  ANALYSIS_MODE,
  validateAnalysisResponse,
  repairResponse,
  runDeterministicChecks,
  computeCacheKey,
  deriveDatasetId,
  AnalysisCache,
  AnalysisController,
  OllamaClient,
  OLLAMA_ERROR,
  SYSTEM_PROMPT_VERSION
} from '@intrilex/analytics-ai';

test('DEFAULT_SETTINGS has required keys and disabled by default', () => {
  assert.equal(DEFAULT_SETTINGS.enabled, false);
  assert.equal(DEFAULT_SETTINGS.endpoint, 'http://localhost:11434');
  assert.ok(typeof DEFAULT_SETTINGS.model === 'string');
});

test('normalizeSettings repairs bad input safely', () => {
  const s = normalizeSettings({ enabled: 'true', temperature: '99', requestTimeoutMs: -5, endpoint: '   ' });
  assert.equal(s.enabled, true);
  assert.equal(s.temperature, 2); // clamped
  assert.equal(s.requestTimeoutMs, 5000); // clamped to min
  assert.equal(s.endpoint, 'http://localhost:11434'); // defaulted
});

test('isLocalEndpoint detects loopback', () => {
  assert.equal(isLocalEndpoint('http://localhost:11434'), true);
  assert.equal(isLocalEndpoint('http://127.0.0.1:11434'), true);
  assert.equal(isLocalEndpoint('http://192.168.1.5:11434'), false);
  assert.equal(isLocalEndpoint('http://example.com:11434'), false);
});

test('validateAnalysisResponse accepts a well-formed response', () => {
  const res = validateAnalysisResponse({
    summary: 'ok', overallConfidence: 0.5,
    healthAssessment: { status: 'mixed', explanation: 'x' },
    keyFindings: [], potentiallyOverpowered: [], potentiallyUnderpowered: [],
    anomalies: [], dataLimitations: [], recommendedExperiments: [], followUpQuestions: []
  });
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);
});

test('validateAnalysisResponse reports enum violations', () => {
  const res = validateAnalysisResponse({
    summary: 'x', overallConfidence: 5,
    healthAssessment: { status: 'bogus', explanation: 'x' }
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('overallConfidence')));
  assert.ok(res.errors.some(e => e.includes('healthAssessment.status')));
});

test('repairResponse extracts JSON from markdown fences', () => {
  const r = repairResponse('Here is the analysis:\n```json\n{"summary":"x","overallConfidence":0.1}\n```\nDone.');
  assert.ok(r.json);
  assert.equal(r.json.summary, 'x');
  assert.equal(r.repaired, true);
});

test('runDeterministicChecks flags zero-denominator and usage>opportunity', () => {
  const bundle = {
    observatory: { mechanics: [
      { mechanic: 'zero-denom', metricId: 'zero-denom', selectionCount: 10, legalOpportunityCount: 0, pickRateWhenLegal: 1.5 },
      { mechanic: 'over-use', metricId: 'over-use', selectionCount: 10, legalOpportunityCount: 5, pickRateWhenLegal: 0.5 }
    ], hasOpportunityTelemetry: true },
    aggregate: { matchCount: 5, engineVersion: '4.2.6', rulesVersion: '4.3.1' }
  };
  const w = runDeterministicChecks(bundle);
  const checks = w.map(x => x.check);
  assert.ok(checks.includes('ZERO_DENOMINATOR'), `expected ZERO_DENOMINATOR in ${checks.join(',')}`);
  assert.ok(checks.includes('IMPOSSIBLE_PERCENT'), `expected IMPOSSIBLE_PERCENT in ${checks.join(',')}`);
  assert.ok(checks.includes('USAGE_VS_OPPORTUNITY'), `expected USAGE_VS_OPPORTUNITY in ${checks.join(',')}`);
  assert.ok(checks.includes('SAMPLE_SIZE'), `expected SAMPLE_SIZE in ${checks.join(',')}`);
});

test('computeCacheKey is deterministic and mode-sensitive', () => {
  const base = { datasetId: 'd1', engineVersion: 'e', rulesVersion: 'r', analyticsSchemaVersion: 's', model: 'llama3', modelSettings: { temperature: 0.2 } };
  const k1 = computeCacheKey({ ...base, mode: 'balance' });
  const k2 = computeCacheKey({ ...base, mode: 'balance' });
  const k3 = computeCacheKey({ ...base, mode: 'anomaly' });
  assert.equal(k1, k2);
  assert.notEqual(k1, k3);
});

test('AnalysisCache stores and invalidates entries', () => {
  const c = new AnalysisCache();
  c.set('k', { analysis: { summary: 'x' } });
  assert.deepEqual(c.get('k').analysis.summary, 'x');
  c.invalidate('k');
  assert.equal(c.get('k'), null);
});

test('AnalysisController returns error when disabled', async () => {
  const ctrl = new AnalysisController();
  const r = await ctrl.analyze({ settings: { enabled: false }, bundle: {}, mode: ANALYSIS_MODE.EXECUTIVE_SUMMARY });
  assert.equal(r.ok, false);
  assert.equal(r.disabled, true);
});

test('AnalysisController returns error when no model selected', async () => {
  const ctrl = new AnalysisController();
  const r = await ctrl.analyze({ settings: { enabled: true, model: '' }, bundle: {}, mode: ANALYSIS_MODE.EXECUTIVE_SUMMARY });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'no-model');
});

test('SYSTEM_PROMPT_VERSION is a defined string', () => {
  assert.ok(typeof SYSTEM_PROMPT_VERSION === 'string');
  assert.ok(SYSTEM_PROMPT_VERSION.length > 0);
});

test('OllamaClient constructs with default endpoint', () => {
  const c = new OllamaClient();
  assert.equal(c.endpoint, 'http://localhost:11434');
});

test('OLLAMA_ERROR categories are stable strings', () => {
  assert.equal(OLLAMA_ERROR.UNREACHABLE, 'UNREACHABLE');
  assert.equal(OLLAMA_ERROR.CANCELLED, 'CANCELLED');
  assert.equal(OLLAMA_ERROR.MODEL_NOT_FOUND, 'MODEL_NOT_FOUND');
});
