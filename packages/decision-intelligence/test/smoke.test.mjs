import test from 'node:test';
import assert from 'node:assert/strict';
import { MECHANIC_REGISTRY, mechanicRegistryHash, reasonCodeDisplay, REASON_CODE_VOCABULARY } from '@intrilex/decision-intelligence';

test('MECHANIC_REGISTRY is a non-empty object', () => {
  assert.ok(typeof MECHANIC_REGISTRY === 'object');
  assert.ok(Object.keys(MECHANIC_REGISTRY).length > 0, 'registry should not be empty');
});

test('mechanicRegistryHash produces a stable 64-char hex', () => {
  const h1 = mechanicRegistryHash();
  const h2 = mechanicRegistryHash();
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
});

test('reasonCodeDisplay returns a string for known reason codes', () => {
  const codes = Object.keys(REASON_CODE_VOCABULARY);
  assert.ok(codes.length > 0, 'vocabulary should not be empty');
  const display = reasonCodeDisplay(codes[0]);
  assert.equal(typeof display, 'string');
  assert.ok(display.length > 0);
});
