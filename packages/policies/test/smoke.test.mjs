import test from 'node:test';
import assert from 'node:assert/strict';
import { RANDOM_LEGAL,  CORE_POLICY_CATALOG,  CORE_POLICY_BY_ID} from '@intrilex/policies';

test('CORE_POLICY_CATALOG contains all 5 baseline policies', () => {
  const ids = CORE_POLICY_CATALOG.map(p => p.policyId);
  assert.ok(ids.includes('score-rush'), 'missing score-rush');
  assert.ok(ids.includes('control'), 'missing control');
  assert.ok(ids.includes('tempo'), 'missing tempo');
  assert.ok(ids.includes('value'), 'missing value');
  assert.ok(ids.includes('random-legal'), 'missing random-legal');
});

test('CORE_POLICY_BY_ID maps policy IDs to definitions', () => {
  assert.ok(CORE_POLICY_BY_ID['score-rush'], 'score-rush not in BY_ID map');
  assert.equal(CORE_POLICY_BY_ID['score-rush'].policyId, 'score-rush');
});

test('RANDOM_LEGAL policy selects from legal actions', () => {
  const legalActions = [
    { actionId: 'a1', family: 'score', featureVector: {} },
    { actionId: 'a2', family: 'draw', featureVector: {} },
  ];
  const context = { legalActions, authorizedView: {}, rng: { nextUint32: () => 0, nextIndex: (n) => 0 } };
  const result = RANDOM_LEGAL.choose(context);
  assert.ok(result.actionId === 'a1' || result.actionId === 'a2');
});
