// ═══════════════════════════════════════════════════════════════
// v0.21.0-version-contract.test.mjs
// Gate 1 — Single Release Identity version-contract test
//
// Scans every release/version authority surface and fails on disagreement.
// The canonical authority is config/release-identity.json.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identity = JSON.parse(await readFile(path.join(root, 'config/release-identity.json'), 'utf8'));

const EXPECTED = {
  version: identity.version,
  engineVersion: identity.engineVersion,
  rulesVersion: identity.rulesVersion,
  officialRulesVersion: identity.officialRulesVersion,
  coreSchemaVersion: identity.coreSchemaVersion,
  telemetrySchemaVersion: identity.telemetrySchemaVersion,
  analyticsSchemaVersion: identity.analyticsSchemaVersion,
  decisionTraceSchemaVersion: identity.decisionTraceSchemaVersion,
  playerRuntimeVersion: identity.playerRuntimeVersion,
  saveFormatVersion: identity.saveFormatVersion,
  replayDataVersion: identity.replayDataVersion,
};

test('Gate 1: config/release-identity.json is the canonical authority with all required fields', () => {
  assert.equal(identity.schemaVersion, '1.0.0', 'release identity schemaVersion must be 1.0.0');
  assert.equal(identity.productName, 'Intrilex Simulation Lab');
  assert.equal(identity.version, '0.31.0');
  assert.equal(identity.releaseTitle, 'Competitive Operations');
  assert.equal(identity.buildKind, 'RANKED_DUEL_PLAYER_SHELL');
  assert.equal(identity.engineVersion, '4.2.6');
  assert.equal(identity.rulesVersion, '4.3.1');
  assert.equal(identity.officialRulesVersion, '4.3.1');
  assert.equal(identity.coreSchemaVersion, '4.1.0');
  assert.equal(identity.telemetrySchemaVersion, '4.1.0');
  assert.equal(identity.analyticsSchemaVersion, '4.2.0');
  assert.equal(identity.decisionTraceSchemaVersion, '2.0.0');
  assert.equal(identity.playerRuntimeVersion, '1.2.0');
  assert.equal(identity.saveFormatVersion, 2);
  assert.equal(identity.replayDataVersion, '0.10.1');
  assert.equal(identity.defaultSimulationProfile, 'core-advanced-authority');
  assert.deepEqual(identity.artifactKinds, ['source', 'deploy', 'evidence']);
});

test('Gate 1: root package.json version matches release identity', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, EXPECTED.version,
    `package.json version ${pkg.version} != release identity ${EXPECTED.version}`);
});

test('Gate 1: all workspace package.json versions match release identity', async () => {
  const pkgDirs = ['packages/analytics', 'packages/browser-crypto-shim', 'packages/decision-intelligence',
    'packages/engine-adapter', 'packages/game-ai', 'packages/policies', 'packages/policy-sdk',
    'packages/shared', 'packages/simulation-runtime', 'packages/statistics', 'packages/telemetry',
    'apps/batch-cli'];
  for (const dir of pkgDirs) {
    const pkgPath = path.join(root, dir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    assert.equal(pkg.version, EXPECTED.version,
      `${dir} version ${pkg.version} != release identity ${EXPECTED.version}`);
  }
});

test('Gate 1: generated Node version.mjs matches release identity', async () => {
  const versionModule = await readFile(path.join(root, 'packages/shared/src/version.mjs'), 'utf8');
  assert.match(versionModule, new RegExp(`LAB_VERSION = "${EXPECTED.version}"`));
  assert.match(versionModule, new RegExp(`ENGINE_VERSION = "${EXPECTED.engineVersion}"`));
  assert.match(versionModule, new RegExp(`RULES_VERSION = "${EXPECTED.rulesVersion}"`));
  assert.match(versionModule, new RegExp(`OFFICIAL_RULES_VERSION = "${EXPECTED.officialRulesVersion}"`));
  assert.match(versionModule, new RegExp(`SCHEMA_VERSION = "${EXPECTED.coreSchemaVersion}"`));
  assert.match(versionModule, new RegExp(`DECISION_TRACE_SCHEMA_VERSION = "${EXPECTED.decisionTraceSchemaVersion}"`));
  assert.match(versionModule, new RegExp(`ANALYTICS_SCHEMA_VERSION = "${EXPECTED.analyticsSchemaVersion}"`));
  assert.match(versionModule, new RegExp(`TELEMETRY_SCHEMA_VERSION = "${EXPECTED.telemetrySchemaVersion}"`));
  assert.match(versionModule, new RegExp(`REPLAY_DATA_VERSION = "${EXPECTED.replayDataVersion}"`));
});

test('Gate 1: generated browser version.js matches release identity', async () => {
  const versionModule = await readFile(path.join(root, 'apps/lab-web/src/version.js'), 'utf8');
  assert.match(versionModule, new RegExp(`LAB_VERSION = "${EXPECTED.version}"`));
  assert.match(versionModule, new RegExp(`ENGINE_VERSION = "${EXPECTED.engineVersion}"`));
  assert.match(versionModule, new RegExp(`RULES_VERSION = "${EXPECTED.rulesVersion}"`));
  assert.match(versionModule, new RegExp(`SCHEMA_VERSION = "${EXPECTED.coreSchemaVersion}"`));
});

test('Gate 1: save-integrity.js PRODUCT_VERSION matches release identity', async () => {
  const saveIntegrity = await readFile(path.join(root, 'apps/lab-web/src/play/save-integrity.js'), 'utf8');
  assert.match(saveIntegrity, new RegExp(`PRODUCT_VERSION = '${EXPECTED.version}'`));
  assert.match(saveIntegrity, new RegExp(`PLAYER_RUNTIME_VERSION = '${EXPECTED.playerRuntimeVersion}'`));
  assert.match(saveIntegrity, new RegExp(`ENGINE_VERSION = '${EXPECTED.engineVersion}'`));
  assert.match(saveIntegrity, new RegExp(`RULES_VERSION = '${EXPECTED.rulesVersion}'`));
  assert.match(saveIntegrity, new RegExp(`SAVE_FORMAT_VERSION = ${EXPECTED.saveFormatVersion}`));
});

test('Gate 1: index.html contains version via application-version meta and JSON-LD softwareVersion', async () => {
  const html = await readFile(path.join(root, 'apps/lab-web/src/index.html'), 'utf8');
  // Version is present in the application-version meta tag and JSON-LD
  assert.match(html, new RegExp(`application-version" content="${EXPECTED.version}"`));
  assert.match(html, new RegExp(`"softwareVersion": "${EXPECTED.version}"`));
  // Homepage identity — title must be game-focused, not Lab-focused
  assert.match(html, /Intrilex — Competitive Playing Card Game/);
  assert.doesNotMatch(html, /Intrilex Simulation Lab v/);
  // Lab text is NOT in the static HTML (populated by JS at runtime)
  assert.doesNotMatch(html, /SIMULATION LAB · v/);
});

test('Gate 1: campaign.mjs uses LAB_VERSION from version module, not hardcoded', async () => {
  const campaign = await readFile(path.join(root, 'packages/simulation-runtime/src/campaign.mjs'), 'utf8');
  assert.match(campaign, /import.*LAB_VERSION.*from.*@intrilex\/shared\/version/,
    'campaign.mjs must import LAB_VERSION from @intrilex/shared/version');
  assert.doesNotMatch(campaign, /labVersion:\s*['"]0\.14\.1['"]/,
    'campaign.mjs must NOT hardcode labVersion 0.14.1');
});

test('Gate 1: runtime.mjs exports LAB_VERSION as product version, not replay data version', async () => {
  const runtime = await readFile(path.join(root, 'packages/simulation-runtime/src/runtime.mjs'), 'utf8');
  assert.doesNotMatch(runtime, /REPLAY_DATA_VERSION as LAB_VERSION/,
    'runtime.mjs must NOT alias REPLAY_DATA_VERSION as LAB_VERSION');
  assert.match(runtime, /import.*\{.*LAB_VERSION.*REPLAY_DATA_VERSION.*\}.*from.*@intrilex\/shared\/version/,
    'runtime.mjs must import both LAB_VERSION and REPLAY_DATA_VERSION separately');
});

test('Gate 1: no source file hardcodes labVersion 0.14.1 (except historical docs)', async () => {
  const sourceDirs = ['packages', 'scripts', 'apps/lab-web/src'];
  for (const dir of sourceDirs) {
    const fullDir = path.join(root, dir);
    if (!existsSync(fullDir)) continue;
    await scanDir(fullDir, async (filePath, content) => {
      if (filePath.endsWith('.md')) return; // historical docs allowed
      if (filePath.includes('node_modules')) return;
      assert.doesNotMatch(content, /labVersion:\s*['"]0\.14\.1['"]/,
        `${filePath} must not hardcode labVersion 0.14.1`);
    });
  }
});

test('Gate 1: version generation is idempotent (running twice produces identical output)', async () => {
  const { spawnSync } = await import('node:child_process');
  const { readFileSync} = await import('node:fs');
  const versionPath = path.join(root, 'packages/shared/src/version.mjs');
  const original = readFileSync(versionPath, 'utf8');
  // Run once
  spawnSync(process.execPath, ['scripts/generate-version.mjs'], { cwd: root, stdio: 'pipe' });
  const run1 = readFileSync(versionPath, 'utf8');
  // Run again
  spawnSync(process.execPath, ['scripts/generate-version.mjs'], { cwd: root, stdio: 'pipe' });
  const run2 = readFileSync(versionPath, 'utf8');
  assert.equal(run1, run2, 'version generation must be idempotent');
  assert.equal(run1, original, 'version generation must produce stable output');
});

test('Gate 1: release identity hash is deterministic (excluding volatile releaseDate)', async () => {
  const { hashCanonical } = await import('@intrilex/shared');
  const stable = { ...identity };
  delete stable.releaseDate;
  const hash1 = hashCanonical(stable);
  const hash2 = hashCanonical({ ...stable });
  assert.equal(hash1, hash2, 'release identity hash must be deterministic');
  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64, 'hash must be SHA-256 (64 hex chars)');
});

test('Gate 1: runtime.mjs ANALYTICS_SCHEMA_VERSION matches release identity', async () => {
  const runtime = await readFile(path.join(root, 'packages/simulation-runtime/src/runtime.mjs'), 'utf8');
  assert.match(runtime, /ANALYTICS_SCHEMA_VERSION/,
    'runtime.mjs must reference ANALYTICS_SCHEMA_VERSION');
  assert.doesNotMatch(runtime, /ANALYTICS_SCHEMA_VERSION\s*=\s*['"]4\.1\.0['"]/,
    'runtime.mjs must NOT hardcode stale ANALYTICS_SCHEMA_VERSION 4.1.0');
  assert.match(runtime, /import.*ANALYTICS_SCHEMA_VERSION.*from.*@intrilex\/shared\/version/,
    'runtime.mjs must import ANALYTICS_SCHEMA_VERSION from @intrilex/shared/version');
});

test('Gate 1: manifest.mjs schema versions match release identity', async () => {
  const manifest = await readFile(path.join(root, 'scripts/manifest.mjs'), 'utf8');
  assert.match(manifest, /identity\.telemetrySchemaVersion/,
    'manifest.mjs must use identity.telemetrySchemaVersion (not hardcoded)');
  assert.match(manifest, /identity\.analyticsSchemaVersion/,
    'manifest.mjs must use identity.analyticsSchemaVersion (not hardcoded)');
  assert.doesNotMatch(manifest, /telemetrySchemaVersion:\s*['"]4\.0\.0['"]/,
    'manifest.mjs must NOT hardcode stale telemetrySchemaVersion 4.0.0');
  assert.doesNotMatch(manifest, /analyticsSchemaVersion:\s*['"]4\.0\.0['"]/,
    'manifest.mjs must NOT hardcode stale analyticsSchemaVersion 4.0.0');
});

test('Gate 1: release-identity.json canonicalArchivePrefix matches current version', () => {
  const prefix = identity.canonicalArchivePrefix;
  assert.ok(prefix, 'canonicalArchivePrefix must be defined');
  assert.match(prefix, new RegExp(`v${EXPECTED.version}`),
    `canonicalArchivePrefix "${prefix}" must contain current version ${EXPECTED.version}`);
});

test('Gate 1: release-identity.json localProfileSchemaVersion matches local-profile.mjs', async () => {
  const profileSrc = await readFile(path.join(root, 'apps/lab-web/src/play/local-profile.mjs'), 'utf8');
  const schemaMatch = profileSrc.match(/SCHEMA_VERSION\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(schemaMatch, 'local-profile.mjs must define SCHEMA_VERSION');
  assert.equal(schemaMatch[1], identity.localProfileSchemaVersion,
    `local-profile.mjs SCHEMA_VERSION "${schemaMatch[1]}" != release identity localProfileSchemaVersion "${identity.localProfileSchemaVersion}"`);
});

test('Gate 1: rulebook-renderer.js imports RULES_VERSION from version.js (not hardcoded)', async () => {
  const renderer = await readFile(path.join(root, 'apps/lab-web/src/rulebook-renderer.js'), 'utf8');
  assert.match(renderer, /import.*RULES_VERSION.*from.*\.\/version\.js/,
    'rulebook-renderer.js must import RULES_VERSION from version.js');
  assert.doesNotMatch(renderer, /rules-toc-meta.*v4\.3\.1/,
    'rulebook-renderer.js must NOT hardcode v4.3.1 in TOC meta');
});

async function scanDir(dir, fn) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      await scanDir(fullPath, fn);
    } else if (entry.isFile() && /\.(mjs|js)$/.test(entry.name)) {
      const content = await readFile(fullPath, 'utf8');
      await fn(fullPath, content);
    }
  }
}
