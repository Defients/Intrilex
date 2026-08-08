import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256Text, hashCanonical } from '@intrilex/browser-crypto-shim';

// Reference SHA-256 using Node.js native crypto for cross-validation.
function nativeSha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

test('sha256Text produces correct hash for empty string', () => {
  const expected = nativeSha256('');
  assert.equal(sha256Text(''), expected);
  assert.equal(sha256Text(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('sha256Text produces correct hash for "hello"', () => {
  const expected = nativeSha256('hello');
  assert.equal(sha256Text('hello'), expected);
  assert.equal(sha256Text('hello'), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('sha256Text produces correct hash for longer text', () => {
  const text = 'Intrilex Simulation Lab v0.21.0 — Official Rules v4.3.1';
  assert.equal(sha256Text(text), nativeSha256(text));
});

test('sha256Text handles unicode text', () => {
  const text = '⭐A K♠ Black Joker ♣♦♥♠';
  assert.equal(sha256Text(text), nativeSha256(text));
});

test('sha256Text returns 64-character lowercase hex', () => {
  const hash = sha256Text('test');
  assert.equal(hash.length, 64);
  assert.ok(/^[0-9a-f]{64}$/.test(hash), 'must be 64 lowercase hex chars');
});

test('sha256Text is deterministic — same input produces same output', () => {
  assert.equal(sha256Text('deterministic'), sha256Text('deterministic'));
});

test('sha256Text different inputs produce different outputs', () => {
  assert.notEqual(sha256Text('a'), sha256Text('b'));
});

test('hashCanonical produces correct hash for simple object', () => {
  const obj = { a: 1, b: 2 };
  const canonical = JSON.stringify({ a: 1, b: 2 }); // already sorted
  assert.equal(hashCanonical(obj), nativeSha256(canonical));
});

test('hashCanonical is order-independent — key order does not matter', () => {
  const hash1 = hashCanonical({ b: 2, a: 1 });
  const hash2 = hashCanonical({ a: 1, b: 2 });
  assert.equal(hash1, hash2, 'canonical hash must be independent of key order');
});

test('hashCanonical drops undefined fields', () => {
  const withUndef = hashCanonical({ a: 1, b: undefined });
  const withoutUndef = hashCanonical({ a: 1 });
  assert.equal(withUndef, withoutUndef, 'undefined fields must be dropped');
});

test('hashCanonical handles nested objects', () => {
  const obj = { outer: { z: 1, a: 2 } };
  const canonical = JSON.stringify({ outer: { a: 2, z: 1 } });
  assert.equal(hashCanonical(obj), nativeSha256(canonical));
});

test('hashCanonical handles arrays (order matters)', () => {
  const hash1 = hashCanonical([1, 2, 3]);
  const hash2 = hashCanonical([3, 2, 1]);
  assert.notEqual(hash1, hash2, 'array order must be preserved');
});

test('hashCanonical handles null and primitive values', () => {
  assert.equal(typeof hashCanonical(null), 'string');
  assert.equal(hashCanonical(null).length, 64);
  assert.equal(typeof hashCanonical(42), 'string');
  assert.equal(typeof hashCanonical('hello'), 'string');
});
