import test from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicPolicyRng, createPolicyDefinition, validateDecision } from '@intrilex/policy-sdk';

test('DeterministicPolicyRng produces deterministic sequence from seed', () => {
  const rng1 = new DeterministicPolicyRng(42);
  const rng2 = new DeterministicPolicyRng(42);
  const seq1 = [rng1.nextUint32(), rng1.nextUint32(), rng1.nextUint32()];
  const seq2 = [rng2.nextUint32(), rng2.nextUint32(), rng2.nextUint32()];
  assert.deepEqual(seq1, seq2);
});

test('createPolicyDefinition creates a policy with an id and version', () => {
  const policy = createPolicyDefinition({
    policyId: 'test-policy',
    version: '1.0.0',
    traits: { test: true },
    choose: () => ({ actionId: 'a1' }),
  });
  assert.equal(policy.policyId, 'test-policy');
  assert.equal(policy.version, '1.0.0');
});

test('validateDecision throws for invalid actionId', () => {
  const legalActions = [{ actionId: 'a1' }, { actionId: 'a2' }];
  assert.throws(() => validateDecision({ actionId: '', metadata: {} }, legalActions), /no actionId|unavailable/i);
});
