import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicChecks, DET_CHECK, DET_SEVERITY } from '@intrilex/analytics-ai/deterministic-statistics';
import { buildContext, ANALYSIS_MODE } from '@intrilex/analytics-ai/analytics-context-builder';
import { buildSystemPrompt } from '@intrilex/analytics-ai/prompt-builder';
import { validateAnalysisResponse } from '@intrilex/analytics-ai/response-validator';
import { AnalysisController } from '@intrilex/analytics-ai/analysis-controller';

// ── Integrity principle: high usage is NOT automatically overpowered ──
test('integrity: high-usage mechanic is not flagged as overpowered by deterministic layer', () => {
  const bundle = {
    observatory: { mechanics: [{ mechanic: 'popular', metricId: 'popular', selectionCount: 990, legalOpportunityCount: 1000, pickRateWhenLegal: 0.99, hasOpportunityData: true }], hasOpportunityTelemetry: true },
    aggregate: { matchCount: 500, engineVersion: '4.2.6', rulesVersion: '4.3.1' }
  };
  const w = runDeterministicChecks(bundle);
  // The deterministic layer must NOT emit a "this is overpowered" warning.
  // It may emit an outlier warning (factual), but never a balance verdict.
  assert.ok(!w.some(x => x.title.toLowerCase().includes('overpowered')), 'deterministic layer must not declare overpowered');
  assert.ok(!w.some(x => x.title.toLowerCase().includes('underpowered')), 'deterministic layer must not declare underpowered');
});

// ── Integrity principle: low usage is NOT automatically underpowered ──
test('integrity: low-usage mechanic is not flagged as underpowered by deterministic layer', () => {
  const bundle = {
    observatory: { mechanics: [{ mechanic: 'unpopular', metricId: 'unpopular', selectionCount: 1, legalOpportunityCount: 1000, pickRateWhenLegal: 0.001, hasOpportunityData: true }], hasOpportunityTelemetry: true },
    aggregate: { matchCount: 500 }
  };
  const w = runDeterministicChecks(bundle);
  assert.ok(!w.some(x => x.title.toLowerCase().includes('underpowered')));
  assert.ok(!w.some(x => x.title.toLowerCase().includes('overpowered')));
});

// ── Integrity principle: insufficient samples reduce confidence ──
test('integrity: small sample size is flagged and reduces confidence language', () => {
  const bundle = { observatory: { mechanics: [], hasOpportunityTelemetry: true }, aggregate: { matchCount: 12 } };
  const w = runDeterministicChecks(bundle);
  const sample = w.find(x => x.check === DET_CHECK.SAMPLE_SIZE);
  assert.ok(sample, 'small sample must be flagged');
  assert.ok(sample.severity === DET_SEVERITY.HIGH || sample.severity === DET_SEVERITY.CRITICAL);
});

// ── Integrity principle: seat bias is detected deterministically ──
test('integrity: seat asymmetry is detected as a factual observation', () => {
  const bundle = { observatory: { hasOpportunityTelemetry: true }, aggregate: { matchCount: 200, drawCount: 0, abortCount: 0, seatWins: { '1': 70, '2': 130 } } };
  const w = runDeterministicChecks(bundle);
  const seat = w.find(x => x.check === DET_CHECK.SEAT_ASYMMETRY);
  assert.ok(seat, 'seat asymmetry must be detected');
  // The detail must frame it as an observation, not a verdict.
  assert.ok(seat.detail.toLowerCase().includes('factual observation'));
});

test('integrity: seat asymmetry not flagged when gap is small', () => {
  const bundle = { observatory: { hasOpportunityTelemetry: true }, aggregate: { matchCount: 200, drawCount: 0, abortCount: 0, seatWins: { '1': 99, '2': 101 } } };
  const w = runDeterministicChecks(bundle);
  assert.ok(!w.some(x => x.check === DET_CHECK.SEAT_ASYMMETRY), 'small gap should not be flagged');
});

// ── Integrity principle: opportunity-adjusted usage is preferred ──
test('integrity: usage exceeding opportunity is flagged (opportunity-adjusted)', () => {
  const bundle = {
    observatory: { mechanics: [{ mechanic: 'over', metricId: 'over', selectionCount: 150, legalOpportunityCount: 100, pickRateWhenLegal: 1.5, hasOpportunityData: true }], hasOpportunityTelemetry: true },
    aggregate: { matchCount: 500 }
  };
  const w = runDeterministicChecks(bundle);
  assert.ok(w.some(x => x.check === DET_CHECK.USAGE_VS_OPPORTUNITY));
  assert.ok(w.some(x => x.check === DET_CHECK.IMPOSSIBLE_PERCENT));
});

test('integrity: missing opportunity telemetry is flagged so usage cannot be interpreted as power', () => {
  const bundle = { observatory: { mechanics: [{ mechanic: 'm', metricId: 'm', selectionCount: 100 }], hasOpportunityTelemetry: false }, aggregate: { matchCount: 500 } };
  const w = runDeterministicChecks(bundle);
  const missing = w.find(x => x.check === DET_CHECK.MISSING_TELEMETRY && x.title.includes('Opportunity'));
  assert.ok(missing, 'missing opportunity telemetry must be flagged');
  assert.ok(missing.detail.includes('cannot be opportunity-adjusted'));
});

// ── Integrity principle: conflicting metrics are flagged ──
test('integrity: reconciliation conflicts are flagged', () => {
  const bundle = {
    observatory: { hasOpportunityTelemetry: true },
    aggregate: { matchCount: 100, completedMatchCount: 99, drawCount: 0, abortCount: 0, seatWins: { '1': 50, '2': 60 }, terminationCounts: { NORMAL_VICTORY: 100 } }
  };
  const w = runDeterministicChecks(bundle);
  assert.ok(w.some(x => x.check === DET_CHECK.RECONCILIATION), 'match count mismatch must be flagged');
});

// ── Integrity principle: Normal and Super variants remain separate ──
test('integrity: variant mixing is detected when a mechanic id contains multiple variant markers', () => {
  const bundle = {
    observatory: { mechanics: [{ mechanic: 'super-ultra-combo', metricId: 'super-ultra-combo', selectionCount: 1, legalOpportunityCount: 1 }], hasOpportunityTelemetry: true },
    aggregate: { matchCount: 500 }
  };
  const w = runDeterministicChecks(bundle);
  const mix = w.find(x => x.check === DET_CHECK.VARIANT_MIXING);
  assert.ok(mix, 'variant mixing must be detected');
  assert.ok(mix.detail.includes('separately'));
});

// ── Integrity principle: version mismatches are flagged ──
test('integrity: engine version mismatch is flagged', () => {
  const bundle = { observatory: { engineVersion: '4.2.5', hasOpportunityTelemetry: true }, aggregate: { matchCount: 100, engineVersion: '4.2.6' }, engineVersion: '4.2.6' };
  const w = runDeterministicChecks(bundle);
  assert.ok(w.some(x => x.check === DET_CHECK.VERSION_MISMATCH));
});

// ── Integrity principle: the prompt enforces the discipline rules ──
test('integrity: system prompt forbids equating usage with power', () => {
  const sys = buildSystemPrompt({ mode: ANALYSIS_MODE.BALANCE, settings: {} });
  assert.ok(sys.includes('High usage does NOT imply high power'), 'prompt must forbid usage→power inference');
  assert.ok(sys.includes('Low usage does NOT imply low power'));
  assert.ok(sys.includes('Correlation is not causation'));
  assert.ok(sys.includes('insufficient evidence'));
  assert.ok(sys.includes('alternative explanation'));
});

test('integrity: system prompt treats official rules as higher authority', () => {
  const sys = buildSystemPrompt({ mode: ANALYSIS_MODE.BALANCE, settings: {} });
  assert.ok(sys.includes('HIGHER AUTHORITY'));
});

test('integrity: context fences data so it cannot override instructions', () => {
  const det = runDeterministicChecks({ observatory: { hasOpportunityTelemetry: true }, aggregate: { matchCount: 100 } });
  const ctx = buildContext({ mode: ANALYSIS_MODE.BALANCE, bundle: { observatory: { hasOpportunityTelemetry: true }, aggregate: { matchCount: 100 } }, settings: { contextBudgetTokens: 8192, includeOfficialRules: false, includeAiDecisionTelemetry: false, includeHistoricalComparisons: false }, deterministicWarnings: det });
  assert.ok(ctx.text.includes('<<<ANALYTICS_DATA'), 'data must be fenced');
  assert.ok(ctx.text.includes('ANALYTICS_DATA>>>'));
});

// ── Integrity principle: a response that declares OP from one metric still
//    parses, but the validator does not endorse the claim — the discipline
//    is enforced by the prompt, not by rejecting the JSON. We verify the
//    validator does not silently strip such claims (transparency). ──
test('integrity: validator preserves a single-metric OP claim (transparency, not endorsement)', () => {
  const r = validateAnalysisResponse({
    summary: 'x', overallConfidence: 0.9,
    healthAssessment: { status: 'healthy', explanation: 'x' },
    potentiallyOverpowered: [{ entity: 'card-x', confidence: 0.95, evidenceFor: ['high usage'], evidenceAgainst: [], verdict: 'overpowered because high usage' }]
  });
  assert.equal(r.valid, true); // structurally valid
  // But the claim is preserved so the user (and debug panel) can see it.
  assert.equal(r.normalized.potentiallyOverpowered[0].verdict, 'overpowered because high usage');
});

// ── Integrity principle: confidence is bounded and low for small samples ──
test('integrity: confidence above 1 is rejected by the validator', () => {
  const r = validateAnalysisResponse({ summary: 'x', overallConfidence: 2, healthAssessment: { status: 'healthy', explanation: 'x' } });
  assert.equal(r.valid, false);
});

// ── Integrity principle: the controller always computes deterministic
//    warnings even when the LLM call fails, so the UI always has factual
//    context. ──
test('integrity: deterministic warnings present even on LLM failure', async () => {
  const fakeFetch = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'err', body: null });
  const ctrl = new AnalysisController({ fetchImpl: fakeFetch });
  const r = await ctrl.analyze({
    settings: { enabled: true, model: 'llama3', streaming: false, endpoint: 'http://127.0.0.1:1' },
    bundle: { observatory: { mechanics: [{ mechanic: 'm', metricId: 'm', selectionCount: 200, legalOpportunityCount: 100, pickRateWhenLegal: 2 }], hasOpportunityTelemetry: true }, aggregate: { matchCount: 5 } },
    mode: ANALYSIS_MODE.EXECUTIVE_SUMMARY, useCache: false
  });
  assert.equal(r.ok, false);
  assert.ok(r.deterministicWarnings.length > 0, 'deterministic warnings must be computed even on failure');
  assert.ok(r.deterministicWarnings.some(x => x.check === DET_CHECK.USAGE_VS_OPPORTUNITY));
});
