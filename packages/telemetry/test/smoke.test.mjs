import test from 'node:test';
import assert from 'node:assert/strict';
import { TELEMETRY_SCHEMA_VERSION, SEMANTIC_CLASSES, semanticClassForAction, createRunProvenance } from '@intrilex/telemetry';

test('TELEMETRY_SCHEMA_VERSION is a defined string', () => {
  assert.ok(typeof TELEMETRY_SCHEMA_VERSION === 'string');
  assert.ok(TELEMETRY_SCHEMA_VERSION.length > 0);
});

test('SEMANTIC_CLASSES is a non-empty array', () => {
  assert.ok(Array.isArray(SEMANTIC_CLASSES));
  assert.ok(SEMANTIC_CLASSES.length > 0);
});

test('semanticClassForAction returns a string for known action families', () => {
  const result = semanticClassForAction({ family: 'score' });
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0);
});

test('createRunProvenance produces a valid provenance record with all required fields', () => {
  const provenance = createRunProvenance({
    runId: 'R-001',
    matchId: 'M-001',
    labVersion: '0.21.0',
    engineVersion: '4.2.6',
    rulesVersion: '4.3.1',
    profileId: 'core-advanced-authority',
    seed: 12345,
    policyIdsBySeat: ['score-rush', 'control'],
  });
  assert.equal(provenance.runId, 'R-001');
  assert.equal(provenance.authorizedScope, 'omniscient');
  assert.equal(provenance.workerCount, 1);
  assert.ok(provenance.provenanceHash, 'must have provenanceHash');
  assert.equal(typeof provenance.provenanceHash, 'string');
  assert.equal(provenance.provenanceHash.length, 64, 'provenanceHash must be 64-char hex');
});

test('createRunProvenance throws on missing required fields (runtime schema enforcement)', () => {
  assert.throws(
    () => createRunProvenance({ runId: 'R-1' }),
    /schema validation failed/,
    'must throw when required fields are missing',
  );
});

test('createRunProvenance throws on invalid authorizedScope enum value', () => {
  assert.throws(
    () => createRunProvenance({
      runId: 'R-1', matchId: 'M-1', engineVersion: '4.2.6', rulesVersion: '4.3.1',
      profileId: 'test', seed: 1, policyIdsBySeat: [], authorizedScope: 'invalid-scope',
    }),
    /authorizedScope.*not in enum/,
    'must throw when authorizedScope is not in enum',
  );
});
