// ═══════════════════════════════════════════════════════════════
// release-identity.test.mjs — Phase 2A: Release identity manifest truth
//
// Verifies that config/release-identity.json is consistent with the
// actual codebase state (package.json, engine-adapter, version.mjs).
// Fails closed on any drift.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReleaseIdentity } from '../scripts/generate-release-identity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

test('Phase 2A: release-identity.json matches actual codebase state', async () => {
  const { manifest, errors } = await generateReleaseIdentity();

  // No cross-check errors
  if (errors.length > 0) {
    assert.fail(`Release identity cross-check errors:\n  ${errors.join('\n  ')}`);
  }

  // Read the existing file and compare
  const existingPath = join(ROOT, 'config/release-identity.json');
  const existing = JSON.parse(readFileSync(existingPath, 'utf8'));

  // Critical fields must match exactly
  const criticalFields = [
    'version',
    'engineVersion',
    'rulesVersion',
    'officialRulesVersion',
    'coreSchemaVersion',
    'telemetrySchemaVersion',
    'analyticsSchemaVersion',
    'decisionTraceSchemaVersion',
    'replayDataVersion',
    'defaultSimulationProfile',
    'supportedProfileIds',
  ];

  for (const field of criticalFields) {
    assert.deepEqual(
      existing[field],
      manifest[field],
      `release-identity.json ${field} drift: existing=${JSON.stringify(existing[field])} vs generated=${JSON.stringify(manifest[field])}`
    );
  }
});

test('Phase 2A: supportedProfileIds contains exactly 6 engine profiles', async () => {
  const { manifest } = await generateReleaseIdentity();

  assert.ok(Array.isArray(manifest.supportedProfileIds), 'supportedProfileIds must be an array');
  assert.equal(manifest.supportedProfileIds.length, 6, 'must have exactly 6 supported profiles');

  // Verify all expected profile IDs are present
  const expected = [
    'core-foundation-authority',
    'core-advanced-authority',
    'core-unrestricted-authority',
    'core-effect-declaration-authority',
    'core-response-authority',
    'core-private-choice-authority',
  ];
  for (const id of expected) {
    assert.ok(manifest.supportedProfileIds.includes(id), `must include ${id}`);
  }
});

test('Phase 2A: release identity has integrity hash', async () => {
  const { manifest } = await generateReleaseIdentity();

  assert.ok(manifest.integrityHash, 'must have integrityHash');
  assert.equal(typeof manifest.integrityHash, 'string', 'integrityHash must be a string');
  assert.equal(manifest.integrityHash.length, 32, 'integrityHash must be 32 chars (truncated SHA-256)');
});

test('Phase 2A: version surfaces are consistent', async () => {
  const { manifest } = await generateReleaseIdentity();

  // package.json version must match manifest version
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');

  // version.mjs LAB_VERSION must match manifest version
  const versionContent = readFileSync(join(ROOT, 'packages/shared/src/version.mjs'), 'utf8');
  const labVersionMatch = versionContent.match(/LAB_VERSION\s*=\s*"([^"]+)"/);
  assert.ok(labVersionMatch, 'version.mjs must define LAB_VERSION');
  assert.equal(manifest.version, labVersionMatch[1], 'manifest version must match version.mjs LAB_VERSION');
});
