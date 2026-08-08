import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, validateConfig, loadConfig, HYBRIX_POLICIES } from '@intrilex/game-ai';

test('DEFAULT_CONFIG passes validation', () => {
  const result = validateConfig(DEFAULT_CONFIG);
  assert.ok(result.valid, `Config validation errors: ${result.errors?.join(', ') ?? ''}`);
});

test('loadConfig merges partial overrides', () => {
  const custom = loadConfig({ perception: { visionRange: 99 } });
  assert.equal(custom.perception.visionRange, 99);
  // Untouched sections should retain defaults
  assert.ok(custom.cognition, 'cognition section should be preserved');
});

test('HYBRIX_POLICIES is a non-empty frozen array with IDs', () => {
  assert.ok(HYBRIX_POLICIES.length >= 10, 'should have at least 10 policy variants');
  assert.ok(Object.isFrozen(HYBRIX_POLICIES), 'should be frozen');
  for (const p of HYBRIX_POLICIES) {
    assert.ok(p.policyId, 'each policy should have an id');
  }
});
