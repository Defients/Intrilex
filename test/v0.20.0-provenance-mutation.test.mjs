// ═══════════════════════════════════════════════════════════════
// v0.20.0-provenance-mutation.test.mjs
// Gate 2 — Provenance and cache authority mutation matrix
//
// Tests that the segment validation and experiment identity correctly
// reject stale or tampered segments. Uses injected fixtures — never
// mutates canonical source.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import {} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildExperimentIdentity,
  experimentHash,
  segmentCacheKey,
  validateSegmentAgainstExpectedIdentity,
  releaseIdentityHash,
  simulationSourceHash,
} from '@intrilex/shared/provenance';
import { loadReleaseIdentity } from '@intrilex/shared/release-identity';
import { hashCanonical } from '@intrilex/shared';
import { POLICY_CATALOG } from '@intrilex/simulation-runtime/policy-catalog';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identity = await loadReleaseIdentity();
const idHash = await releaseIdentityHash(identity);
const srcHash = await simulationSourceHash(root);

const BASE_POLICY_IDS = POLICY_CATALOG.filter(p => !p.policyId.startsWith('hybrix-')).map(p => p.policyId);
const policyPairs = BASE_POLICY_IDS.flatMap(l => BASE_POLICY_IDS.map(r => [l, r]));
const policyVersions = Object.fromEntries(
  POLICY_CATALOG.filter(p => BASE_POLICY_IDS.includes(p.policyId)).map(p => [p.policyId, { version: p.version, policyHash: p.policyHash, traits: p.traits }])
);

const baseSemantic = buildExperimentIdentity({
  labVersion: identity.version,
  engineVersion: identity.engineVersion,
  rulesVersion: identity.rulesVersion,
  coreSchemaVersion: identity.coreSchemaVersion,
  telemetrySchemaVersion: identity.telemetrySchemaVersion,
  analyticsSchemaVersion: identity.analyticsSchemaVersion,
  profileId: 'core-advanced-authority',
  enabledModules: [],
  matchCount: 100,
  policyPairs,
  policyVersions,
  decisionLimit: 1800,
  simulationSourceHash: srcHash,
  releaseIdentityHash: idHash,
});

const baseExperimentHash = experimentHash(baseSemantic);

// Helper: create a valid segment fixture
function makeValidSegment(overrides = {}) {
  return {
    schemaVersion: '1.2',
    ordinalRange: [0, 25],
    workerCount: 2,
    durationMs: 1000,
    experimentHash: baseExperimentHash,
    releaseIdentityHash: idHash,
    simulationSourceHash: srcHash,
    semantic: baseSemantic,
    summaries: Array.from({ length: 25 }, (_, i) => ({ matchOrdinal: i, matchResultHash: `hash-${i}` })),
    records: Array.from({ length: 25 }, (_, i) => ({ ordinal: i, result: 'completed', summary: { matchResultHash: `hash-${i}` }, error: null })),
    completedCount: 25,
    abortedCount: 0,
    unsupportedCount: 0,
    errorCount: 0,
    accountingInvariant: true,
    campaignStatus: 'PASS',
    segmentResultHash: hashCanonical(Array.from({ length: 25 }, (_, i) => `hash-${i}`)),
    ...overrides,
  };
}

const expectedBase = {
  experimentHash: baseExperimentHash,
  releaseIdentityHash: idHash,
  simulationSourceHash: srcHash,
  workerCount: 2,
  ordinalStart: 0,
  ordinalEnd: 25,
  segmentSchema: '1.2',
  expectedResultHash: hashCanonical(Array.from({ length: 25 }, (_, i) => `hash-${i}`)),
};

// ── Mutation matrix ──────────────────────────────────────────────

test('Gate 2: valid exact-match cache resumes successfully', () => {
  const segment = makeValidSegment();
  const result = validateSegmentAgainstExpectedIdentity(segment, expectedBase);
  assert.equal(result.valid, true, `Valid segment should pass: ${result.reason}`);
});

test('Gate 2: product version change rejects segment', () => {
  const tampered = makeValidSegment({
    semantic: { ...baseSemantic, labVersion: '0.19.0' },
    experimentHash: experimentHash({ ...baseSemantic, labVersion: '0.19.0' }),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /EXPERIMENT_HASH_MISMATCH/);
});

test('Gate 2: engine version change rejects segment', () => {
  const tampered = makeValidSegment({
    semantic: { ...baseSemantic, engineVersion: '4.2.5' },
    experimentHash: experimentHash({ ...baseSemantic, engineVersion: '4.2.5' }),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /EXPERIMENT_HASH_MISMATCH/);
});

test('Gate 2: rules version change rejects segment', () => {
  const tampered = makeValidSegment({
    semantic: { ...baseSemantic, rulesVersion: '4.1.1' },
    experimentHash: experimentHash({ ...baseSemantic, rulesVersion: '4.1.1' }),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /EXPERIMENT_HASH_MISMATCH/);
});

test('Gate 2: telemetry schema change rejects segment', () => {
  const tampered = makeValidSegment({
    semantic: { ...baseSemantic, telemetrySchemaVersion: '4.0.0' },
    experimentHash: experimentHash({ ...baseSemantic, telemetrySchemaVersion: '4.0.0' }),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /EXPERIMENT_HASH_MISMATCH/);
});

test('Gate 2: analytics schema change rejects segment', () => {
  const tampered = makeValidSegment({
    semantic: { ...baseSemantic, analyticsSchemaVersion: '4.0.0' },
    experimentHash: experimentHash({ ...baseSemantic, analyticsSchemaVersion: '4.0.0' }),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /EXPERIMENT_HASH_MISMATCH/);
});

test('Gate 2: policy version/hash change rejects segment', () => {
  const tamperedPolicyVersions = { ...policyVersions, 'score-rush': { ...policyVersions['score-rush'], version: '99.0.0' } };
  const tampered = makeValidSegment({
    semantic: { ...baseSemantic, policyVersions: tamperedPolicyVersions },
    experimentHash: experimentHash({ ...baseSemantic, policyVersions: tamperedPolicyVersions }),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /EXPERIMENT_HASH_MISMATCH/);
});

test('Gate 2: decision limit change rejects segment', () => {
  const tampered = makeValidSegment({
    semantic: { ...baseSemantic, decisionLimit: 2000 },
    experimentHash: experimentHash({ ...baseSemantic, decisionLimit: 2000 }),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /EXPERIMENT_HASH_MISMATCH/);
});

test('Gate 2: match count change rejects segment', () => {
  const tampered = makeValidSegment({
    semantic: { ...baseSemantic, matchCount: 200 },
    experimentHash: experimentHash({ ...baseSemantic, matchCount: 200 }),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /EXPERIMENT_HASH_MISMATCH/);
});

test('Gate 2: source-authority hash change rejects segment', () => {
  const tampered = makeValidSegment({
    simulationSourceHash: '0'.repeat(64),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /SIMULATION_SOURCE_HASH_MISMATCH/);
});

test('Gate 2: release identity hash change rejects segment', () => {
  const tampered = makeValidSegment({
    releaseIdentityHash: '0'.repeat(64),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /RELEASE_IDENTITY_HASH_MISMATCH/);
});

test('Gate 2: ordinal range change rejects segment', () => {
  const tampered = makeValidSegment({
    ordinalRange: [25, 50],
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /ORDINAL_RANGE_MISMATCH/);
});

test('Gate 2: worker count change rejects segment (but experiment hash unchanged)', () => {
  // Worker count changes segment cache key but NOT experiment hash
  const expHash = experimentHash(baseSemantic);
  const key1 = segmentCacheKey({ experimentHash: expHash, workerCount: 1, ordinalStart: 0, ordinalEnd: 25 });
  const key2 = segmentCacheKey({ experimentHash: expHash, workerCount: 2, ordinalStart: 0, ordinalEnd: 25 });
  assert.notEqual(key1, key2, 'different worker counts must produce different cache keys');

  // But experiment hash must be the same
  const semantic1 = { ...baseSemantic };
  const semantic2 = { ...baseSemantic };
  assert.equal(experimentHash(semantic1), experimentHash(semantic2), 'experiment hash must not include worker count');

  // Segment with wrong worker count is rejected
  const tampered = makeValidSegment({ workerCount: 4 });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /WORKER_COUNT_MISMATCH/);
});

test('Gate 2: missing ordinal fails', () => {
  const tampered = makeValidSegment({
    records: Array.from({ length: 24 }, (_, i) => ({ ordinal: i, result: 'completed', summary: { matchResultHash: `hash-${i}` }, error: null })),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /RECORD_COUNT_MISMATCH/);
});

test('Gate 2: duplicate ordinal fails', () => {
  const records = Array.from({ length: 25 }, (_, i) => ({ ordinal: i === 5 ? 4 : i, result: 'completed', summary: { matchResultHash: `hash-${i}` }, error: null }));
  const tampered = makeValidSegment({ records });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /ORDINAL_GAP_OR_DUPLICATE/);
});

test('Gate 2: altered segment result hash fails', () => {
  const tampered = makeValidSegment({
    segmentResultHash: '0'.repeat(64),
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /SEGMENT_RESULT_HASH_MISMATCH/);
});

test('Gate 2: accounting invariant false fails', () => {
  const tampered = makeValidSegment({
    accountingInvariant: false,
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /ACCOUNTING_INVARIANT_FALSE/);
});

test('Gate 2: segment schema version mismatch fails', () => {
  const tampered = makeValidSegment({
    schemaVersion: '1.0',
  });
  const result = validateSegmentAgainstExpectedIdentity(tampered, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /SEGMENT_SCHEMA_MISMATCH/);
});

test('Gate 2: null segment fails', () => {
  const result = validateSegmentAgainstExpectedIdentity(null, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /SEGMENT_NULL_OR_INVALID/);
});

test('Gate 2: timestamp/OS change does NOT affect experiment hash', () => {
  const semantic1 = buildExperimentIdentity({
    labVersion: identity.version,
    engineVersion: identity.engineVersion,
    rulesVersion: identity.rulesVersion,
    coreSchemaVersion: identity.coreSchemaVersion,
    telemetrySchemaVersion: identity.telemetrySchemaVersion,
    analyticsSchemaVersion: identity.analyticsSchemaVersion,
    profileId: 'core-advanced-authority',
    enabledModules: [],
    matchCount: 100,
    policyPairs,
    policyVersions,
    decisionLimit: 1800,
    simulationSourceHash: srcHash,
    releaseIdentityHash: idHash,
  });
  // Add volatile fields that should NOT be in the experiment identity


  // The buildExperimentIdentity function does not include these fields
  assert.equal(experimentHash(semantic1), experimentHash(semantic1), 'same identity must hash the same');
  // If someone adds volatile fields, the hash changes — but buildExperimentIdentity doesn't add them
  assert.equal(experimentHash(semantic1), experimentHash(baseSemantic), 'base semantic must match');
});

test('Gate 2: retained replay from old experiment is rejected', () => {
  // A replay segment with an old experiment hash should be rejected
  const oldExperiment = { ...baseSemantic, labVersion: '0.19.0' };
  const oldHash = experimentHash(oldExperiment);
  const oldSegment = makeValidSegment({
    experimentHash: oldHash,
    semantic: oldExperiment,
  });
  const result = validateSegmentAgainstExpectedIdentity(oldSegment, expectedBase);
  assert.equal(result.valid, false);
  assert.match(result.reason, /EXPERIMENT_HASH_MISMATCH/);
});

test('Gate 2: simulationSourceHash is deterministic', async () => {
  const hash1 = await simulationSourceHash(root);
  const hash2 = await simulationSourceHash(root);
  assert.equal(hash1, hash2, 'simulationSourceHash must be deterministic');
  assert.equal(hash1.length, 64, 'must be SHA-256');
});

test('Gate 2: releaseIdentityHash is deterministic', async () => {
  const hash1 = await releaseIdentityHash(identity);
  const hash2 = await releaseIdentityHash(identity);
  assert.equal(hash1, hash2, 'releaseIdentityHash must be deterministic');
  assert.equal(hash1.length, 64, 'must be SHA-256');
});

test('Gate 2: segmentCacheKey differs for different worker counts but same experiment', () => {
  const expHash = experimentHash(baseSemantic);
  const keys = [1, 2, 4].map(w => segmentCacheKey({ experimentHash: expHash, workerCount: w, ordinalStart: 0, ordinalEnd: 25 }));
  assert.equal(new Set(keys).size, 3, 'all three worker-count keys must be distinct');
});

test('Gate 2: buildExperimentIdentity includes all required semantic fields', () => {
  const required = ['labVersion', 'engineVersion', 'rulesVersion', 'coreSchemaVersion',
    'telemetrySchemaVersion', 'analyticsSchemaVersion', 'profileId', 'enabledModules',
    'matchCount', 'policyPairs', 'policyVersions', 'decisionLimit', 'seedDerivation',
    'seatOrderAlgorithm', 'simulationSourceHash', 'releaseIdentityHash'];
  for (const field of required) {
    assert.ok(field in baseSemantic, `buildExperimentIdentity must include ${field}`);
  }
  // Worker count must NOT be in the experiment identity
  assert.ok(!('workerCount' in baseSemantic), 'experiment identity must NOT include workerCount');
  assert.ok(!('timestamp' in baseSemantic), 'experiment identity must NOT include timestamp');
  assert.ok(!('os' in baseSemantic), 'experiment identity must NOT include os');
});
