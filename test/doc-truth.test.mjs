// ═══════════════════════════════════════════════════════════════
// doc-truth.test.mjs — T2: Doc-truth CI gate
//
// Validates that docs/CAPABILITY_MATRIX.md agrees with code truth.
// Prevents C1–C9 class contradictions from recurring.
//
// Checks:
//   1. Rules version in capability matrix matches version.mjs
//   2. Engine version in capability matrix matches version.mjs
//   3. Product version in capability matrix matches package.json
//   4. Unrestricted Core is marked SUPPORTED (not REPLAY_ONLY)
//   5. 1v1 PvP is marked SUPPORTED (not BLOCKED)
//   6. 3–4 player modules are BLOCKED (scope freeze)
//   7. CHANGELOG has an entry for the current version
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const matrixSrc = readFileSync(join(process.cwd(), 'docs/CAPABILITY_MATRIX.md'), 'utf8');
const versionSrc = readFileSync(join(process.cwd(), 'packages/shared/src/version.mjs'), 'utf8');
const pkgSrc = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
const changelogSrc = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
const saveIntegritySrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/save-integrity.js'), 'utf8');

// Extract version values from code truth
const labVersion = versionSrc.match(/LAB_VERSION\s*=\s*"([^"]+)"/)?.[1];
const engineVersion = versionSrc.match(/ENGINE_VERSION\s*=\s*"([^"]+)"/)?.[1];
const rulesVersion = versionSrc.match(/RULES_VERSION\s*=\s*"([^"]+)"/)?.[1];
const pkgVersion = JSON.parse(pkgSrc).version;

test('Doc-truth: version.mjs exports are present', () => {
  assert.ok(labVersion, 'LAB_VERSION must be defined');
  assert.ok(engineVersion, 'ENGINE_VERSION must be defined');
  assert.ok(rulesVersion, 'RULES_VERSION must be defined');
});

test('Doc-truth: capability matrix rules version matches code', () => {
  assert.ok(matrixSrc.includes(`Rules v${rulesVersion}`),
    `Capability matrix must reference Rules v${rulesVersion} (found in version.mjs)`);
});

test('Doc-truth: capability matrix engine version matches code', () => {
  assert.ok(matrixSrc.includes(`Engine v${engineVersion}`),
    `Capability matrix must reference Engine v${engineVersion} (found in version.mjs)`);
});

test('Doc-truth: capability matrix product version matches package.json', () => {
  assert.ok(matrixSrc.includes(`v${pkgVersion}`),
    `Capability matrix must reference v${pkgVersion} (found in package.json)`);
});

test('Doc-truth: Unrestricted Core is SUPPORTED (not REPLAY_ONLY)', () => {
  assert.ok(matrixSrc.includes('Complete Unrestricted Core (human-playable) | SUPPORTED'),
    'Capability matrix must mark Unrestricted Core as SUPPORTED');
  assert.ok(!matrixSrc.includes('REPLAY_ONLY'),
    'Capability matrix must not contain REPLAY_ONLY (contradicts playable status)');
});

test('Doc-truth: 1v1 PvP is SUPPORTED (not BLOCKED)', () => {
  assert.ok(matrixSrc.includes('Server-authoritative online Direct Duel (1v1 PvP) | SUPPORTED'),
    'Capability matrix must mark 1v1 PvP as SUPPORTED');
});

test('Doc-truth: 3–4 player modules are BLOCKED (scope freeze respected)', () => {
  assert.ok(matrixSrc.includes('Optional modules (3–4 player) | BLOCKED'),
    'Capability matrix must mark 3–4 player as BLOCKED');
});

test('Doc-truth: CHANGELOG has entry for current version', () => {
  assert.ok(changelogSrc.includes(`## v${pkgVersion}`),
    `CHANGELOG must have an entry for v${pkgVersion}`);
});

test('Doc-truth: save-integrity.js rules version matches version.mjs', () => {
  const siRules = saveIntegritySrc.match(/RULES_VERSION\s*[:=]\s*['"]([^'"]+)['"]/)?.[1];
  assert.ok(siRules, 'save-integrity.js must define RULES_VERSION');
  assert.equal(siRules, rulesVersion,
    `save-integrity.js RULES_VERSION (${siRules}) must match version.mjs (${rulesVersion})`);
});

test('Doc-truth: save-integrity.js engine version matches version.mjs', () => {
  const siEngine = saveIntegritySrc.match(/ENGINE_VERSION\s*[:=]\s*['"]([^'"]+)['"]/)?.[1];
  assert.ok(siEngine, 'save-integrity.js must define ENGINE_VERSION');
  assert.equal(siEngine, engineVersion,
    `save-integrity.js ENGINE_VERSION (${siEngine}) must match version.mjs (${engineVersion})`);
});

test('Doc-truth: package.json version matches version.mjs LAB_VERSION', () => {
  assert.equal(pkgVersion, labVersion,
    `package.json version (${pkgVersion}) must match version.mjs LAB_VERSION (${labVersion})`);
});
