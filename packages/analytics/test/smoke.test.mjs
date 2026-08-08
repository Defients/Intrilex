import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYTICS_SCHEMA_VERSION, METRIC_REGISTRY, metricRegistryWithHashes } from '@intrilex/analytics';

test('ANALYTICS_SCHEMA_VERSION is a defined string', () => {
  assert.ok(typeof ANALYTICS_SCHEMA_VERSION === 'string');
  assert.ok(ANALYTICS_SCHEMA_VERSION.length > 0);
});

test('METRIC_REGISTRY is a non-empty object', () => {
  assert.ok(typeof METRIC_REGISTRY === 'object');
  assert.ok(Object.keys(METRIC_REGISTRY).length >= 5, 'should have at least 5 metrics');
});

test('metricRegistryWithHashes adds formulaHash to each metric', () => {
  const withHashes = metricRegistryWithHashes();
  const entries = Object.values(withHashes);
  assert.ok(entries.length > 0);
  for (const m of entries) {
    assert.ok(m.formulaHash, 'each metric should have a formulaHash');
    assert.match(m.formulaHash, /^[a-f0-9]{64}$/, 'formulaHash should be 64-char hex');
  }
});
