// V0.17.0 Phase 4 — Guidance mode tests
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GuidanceMode,  buildImmediateExplanation,  buildWhyExplanation,  buildUnavailableExplanation } from '../apps/lab-web/src/play/intelligence/action-explanation.js';

// ─── Guidance Mode Tests ────────────────────────────────────────

test('GuidanceMode: has four modes', () => {
  assert.equal(GuidanceMode.OFF, 'OFF');
  assert.equal(GuidanceMode.ESSENTIAL, 'ESSENTIAL');
  assert.equal(GuidanceMode.GUIDED, 'GUIDED');
  assert.equal(GuidanceMode.DETAILED, 'DETAILED');
});

test('buildImmediateExplanation: OFF mode returns empty', () => {
  const result = buildImmediateExplanation({}, [], GuidanceMode.OFF);
  assert.equal(result.title, '');
  assert.equal(result.body, '');
});

test('buildImmediateExplanation: ESSENTIAL shows minimal info', () => {
  const ctx = { isHumanPriority: true, windowType: 'proactive', stackDepth: 0, canPass: false };
  const result = buildImmediateExplanation(ctx, [{ displayLabel: 'Draw', form: 'draw' }], GuidanceMode.ESSENTIAL);
  assert.ok(result.title);
});

test('buildWhyExplanation: OFF mode returns null', () => {
  const result = buildWhyExplanation({ displayLabel: 'Test' }, null, GuidanceMode.OFF);
  assert.equal(result, null);
});

test('buildUnavailableExplanation: OFF mode returns empty', () => {
  const result = buildUnavailableExplanation('NOT_PRIORITY_HOLDER', GuidanceMode.OFF);
  assert.equal(result.shortText, '');
});

test('buildUnavailableExplanation: ESSENTIAL returns short only', () => {
  const result = buildUnavailableExplanation('NOT_PRIORITY_HOLDER', GuidanceMode.ESSENTIAL);
  assert.ok(result.shortText);
  assert.equal(result.detailedText, '');
});

test('buildUnavailableExplanation: DETAILED returns full explanation', () => {
  const result = buildUnavailableExplanation('NOT_PRIORITY_HOLDER', GuidanceMode.DETAILED);
  assert.ok(result.shortText);
  assert.ok(result.detailedText);
  assert.ok(result.ruleRef);
});
