import test from 'node:test';
import assert from 'node:assert/strict';
import { wilsonInterval, summarizeNumbers, deterministicClusterBootstrap } from '@intrilex/statistics';

test('wilsonInterval handles edge cases', () => {
  assert.deepEqual(wilsonInterval(0, 0), [0, 0]);
  const [lo, hi] = wilsonInterval(100, 100);
  assert.ok(lo > 0.9 && hi <= 1.0, 'full success should have high lower bound');
});

test('summarizeNumbers returns correct statistics', () => {
  const s = summarizeNumbers([3, 1, 2]);
  assert.equal(s.count, 3);
  assert.equal(s.mean, 2);
  assert.equal(s.median, 2);
  assert.equal(s.min, 1);
  assert.equal(s.max, 3);
});

test('deterministicClusterBootstrap is deterministic with same seed', () => {
  const sample = [1, 2, 3, 4].map((x, i) => ({ matchId: `M${i}`, x }));
  const stat = (arr) => arr.reduce((s, r) => s + r.x, 0) / arr.length;
  const r1 = deterministicClusterBootstrap(sample, stat, { iterations: 100, seed: 'x' });
  const r2 = deterministicClusterBootstrap(sample, stat, { iterations: 100, seed: 'x' });
  assert.deepEqual(r1, r2);
});
