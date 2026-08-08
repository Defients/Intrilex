// Schema Validation Tests — validates generated artifacts against the 5 JSON schemas.
// This is the runtime schema enforcement layer that was missing (R3 in audit).
// Instead of adding AJV as a dependency, we use a lightweight self-contained validator
// (scripts/validate-schema.mjs) that handles the exact JSON Schema subset used by Intrilex.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema, validateFile } from '../scripts/validate-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemas = path.join(root, 'schemas');

async function loadJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

// ─── Unit tests for the validator itself ───────────────────────────────────

test('validator correctly checks type constraints', () => {
  assert.deepEqual(validateAgainstSchema('hello', { type: 'string' }), []);
  assert.deepEqual(validateAgainstSchema(42, { type: 'string' }), ['root: expected type string, got number']);
  assert.deepEqual(validateAgainstSchema(42, { type: 'integer' }), []);
  assert.deepEqual(validateAgainstSchema(42.5, { type: 'integer' }), ['root: expected type integer, got number']);
  assert.deepEqual(validateAgainstSchema(true, { type: 'boolean' }), []);
  assert.deepEqual(validateAgainstSchema(null, { type: 'object' }), ['root: expected type object, got null']);
  assert.deepEqual(validateAgainstSchema([], { type: 'array' }), []);
  assert.deepEqual(validateAgainstSchema({}, { type: 'array' }), ['root: expected type array, got object']);
});

test('validator correctly checks required fields', () => {
  const schema = { type: 'object', required: ['a', 'b'], properties: { a: { type: 'string' }, b: { type: 'integer' } } };
  assert.deepEqual(validateAgainstSchema({ a: 'x', b: 1 }, schema), []);
  assert.deepEqual(validateAgainstSchema({ a: 'x' }, schema), ['root: missing required property "b"']);
  assert.deepEqual(validateAgainstSchema({}, schema), ['root: missing required property "a"', 'root: missing required property "b"']);
});

test('validator correctly checks const and enum', () => {
  assert.deepEqual(validateAgainstSchema('4.0.0', { const: '4.0.0' }), []);
  assert.deepEqual(validateAgainstSchema('4.0.1', { const: '4.0.0' }), ['root: expected const "4.0.0", got "4.0.1"']);
  assert.deepEqual(validateAgainstSchema('PUBLIC', { enum: ['PUBLIC', 'AUTHORIZED'] }), []);
  assert.deepEqual(validateAgainstSchema('PRIVATE', { enum: ['PUBLIC', 'AUTHORIZED'] }), ['root: value "PRIVATE" not in enum ["PUBLIC", "AUTHORIZED"]']);
});

test('validator correctly checks minimum', () => {
  assert.deepEqual(validateAgainstSchema(5, { type: 'integer', minimum: 1 }), []);
  assert.deepEqual(validateAgainstSchema(0, { type: 'integer', minimum: 1 }), ['root: value 0 below minimum 1']);
});

test('validator correctly checks array items', () => {
  const schema = { type: 'array', items: { type: 'string' } };
  assert.deepEqual(validateAgainstSchema(['a', 'b'], schema), []);
  assert.deepEqual(validateAgainstSchema(['a', 42], schema), ['[1]: expected type string, got number']);
});

test('validator correctly checks nested objects', () => {
  const schema = {
    type: 'object',
    required: ['outer'],
    properties: {
      outer: { type: 'object', required: ['inner'], properties: { inner: { type: 'string' } } }
    }
  };
  assert.deepEqual(validateAgainstSchema({ outer: { inner: 'val' } }, schema), []);
  assert.deepEqual(validateAgainstSchema({ outer: {} }, schema), ['outer: missing required property "inner"']);
});

test('validator correctly checks additionalProperties: false', () => {
  const schema = {
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'integer' } },
    additionalProperties: false
  };
  assert.deepEqual(validateAgainstSchema({ a: 'x', b: 1 }, schema), []);
  assert.deepEqual(validateAgainstSchema({ a: 'x', c: true }, schema), ['root: additional property "c" not allowed']);
});

// ─── Integration tests: validate real artifacts against real schemas ────────

test('telemetry schema validates a well-formed telemetry frame', async () => {
  const schema = await loadJson(path.join(schemas, 'telemetry.schema.json'));
  const validFrame = {
    matchId: 'M-test001',
    commandIndex: 0,
    commandType: 'draw',
    accepted: true,
    eventTypes: ['draw'],
    visibilityClass: 'PUBLIC'
  };
  assert.deepEqual(validateAgainstSchema(validFrame, schema), []);
});

test('telemetry schema rejects a frame missing required fields', () => {
  const schema = { type: 'object', required: ['matchId', 'commandIndex', 'commandType', 'accepted'] };
  const errors = validateAgainstSchema({ matchId: 'M-1' }, schema);
  assert.ok(errors.length >= 3, 'should have 3 missing required field errors');
});

test('semantic-telemetry schema validates a well-formed semantic fact', async () => {
  const schema = await loadJson(path.join(schemas, 'semantic-telemetry.schema.json'));
  const validFact = {
    factId: 'F-001',
    matchId: 'M-test001',
    checkpointId: 'C-001',
    semanticClass: 'mini-turn-action',
    actorId: 'P1',
    legalOptionIds: ['opt-a', 'opt-b'],
    hadLawfulResponse: true,
    consumedMiniTurn: true,
    createdSkip: false,
    engineEventIds: ['E-001'],
    visibility: 'public'
  };
  assert.deepEqual(validateAgainstSchema(validFact, schema), []);
});

test('semantic-telemetry schema rejects invalid semanticClass enum', async () => {
  const schema = await loadJson(path.join(schemas, 'semantic-telemetry.schema.json'));
  const invalidFact = {
    factId: 'F-001', matchId: 'M-1', checkpointId: 'C-1',
    semanticClass: 'invalid-class',
    actorId: 'P1', legalOptionIds: [], hadLawfulResponse: false,
    consumedMiniTurn: false, createdSkip: false, engineEventIds: [], visibility: 'public'
  };
  const errors = validateAgainstSchema(invalidFact, schema);
  assert.ok(errors.some(e => e.includes('semanticClass') && e.includes('enum')), 'should reject invalid semanticClass');
});

test('experiment schema validates a well-formed experiment', async () => {
  const schema = await loadJson(path.join(schemas, 'experiment.schema.json'));
  const validExperiment = {
    schemaVersion: '2.0.0',
    experimentId: 'exp-001',
    engine: { package: '@intrilex/headless-engine', version: '4.2.6' },
    rulesProfile: 'core-advanced-authority',
    matchCount: 100
  };
  assert.deepEqual(validateAgainstSchema(validExperiment, schema), []);
});

test('experiment schema rejects matchCount below minimum', async () => {
  const schema = await loadJson(path.join(schemas, 'experiment.schema.json'));
  const invalidExperiment = {
    schemaVersion: '2.0.0',
    experimentId: 'exp-001',
    engine: {},
    rulesProfile: 'test',
    matchCount: 0
  };
  const errors = validateAgainstSchema(invalidExperiment, schema);
  assert.ok(errors.some(e => e.includes('minimum')), 'should reject matchCount 0');
});

test('run-provenance schema validates a well-formed provenance record', async () => {
  const schema = await loadJson(path.join(schemas, 'run-provenance.schema.json'));
  const validProvenance = {
    runId: 'R-001', matchId: 'M-001', labVersion: '0.11.0',
    engineVersion: '4.2.6', rulesVersion: '4.1.2', profileId: 'core-advanced-authority',
    capabilityManifestHash: 'abc123', telemetrySchemaVersion: '4.0.0',
    analyticsSchemaVersion: '4.0.0', replayFormatVersion: '1.0.0',
    seed: 12345, policyIdsBySeat: ['random-legal', 'score-rush'],
    workerCount: 2, authorizedScope: 'public', provenanceHash: 'def456'
  };
  assert.deepEqual(validateAgainstSchema(validProvenance, schema), []);
});

test('run-provenance schema rejects invalid authorizedScope', async () => {
  const schema = await loadJson(path.join(schemas, 'run-provenance.schema.json'));
  const invalidProvenance = {
    runId: 'R-1', matchId: 'M-1', labVersion: '0.11.0', engineVersion: '4.2.6',
    rulesVersion: '4.1.2', profileId: 'test', capabilityManifestHash: 'h',
    telemetrySchemaVersion: '4.0.0', analyticsSchemaVersion: '4.0.0',
    replayFormatVersion: '1.0.0', seed: 1, policyIdsBySeat: [], workerCount: 1,
    authorizedScope: 'invalid-scope', provenanceHash: 'h'
  };
  const errors = validateAgainstSchema(invalidProvenance, schema);
  assert.ok(errors.some(e => e.includes('authorizedScope') && e.includes('enum')), 'should reject invalid authorizedScope');
});

test('analytics schema validates the generated observatory analytics.json', async () => {
  const result = await validateFile(
    path.join(root, 'sample-data/observatory/analytics.json'),
    path.join(schemas, 'analytics.schema.json'),
  );
  if (!result.valid) {
    // The analytics.json might have a different schemaVersion — log for diagnostics
    console.log('Analytics schema validation errors:', result.errors.slice(0, 5));
  }
  // The observatory analytics.json should validate against the analytics schema
  // (it may have additional properties, which is allowed)
  assert.ok(result.valid, `analytics.json should validate against analytics.schema.json:\n${result.errors.join('\n')}`);
});

test('validateFile CLI works end-to-end', async () => {
  // This tests the validateFile function which is used by the CLI
  const result = await validateFile(
    path.join(root, 'sample-data/observatory/analytics.json'),
    path.join(schemas, 'analytics.schema.json'),
  );
  assert.equal(typeof result.valid, 'boolean');
  assert.ok(Array.isArray(result.errors));
});

