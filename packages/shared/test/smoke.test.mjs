import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, hashCanonical, sanitizeCsvCell } from '@intrilex/shared';

test('canonicalize sorts object keys deterministically', () => {
  assert.equal(canonicalize({ b: 1, a: [2, 1] }), '{"a":[2,1],"b":1}');
});

test('hashCanonical is key-order independent and produces 64-char hex', () => {
  const h1 = hashCanonical({ a: 1, b: 2 });
  const h2 = hashCanonical({ b: 2, a: 1 });
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
});

test('sanitizeCsvCell neutralizes formula injection', () => {
  assert.equal(sanitizeCsvCell('=2+2'), "'=2+2");
  assert.equal(sanitizeCsvCell('+1+1'), "'+1+1");
  assert.equal(sanitizeCsvCell('@SUM'), "'@SUM");
});
