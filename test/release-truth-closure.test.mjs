// ═══════════════════════════════════════════════════════════════
// release-truth-closure.test.mjs — v0.24.2 Truth Closure II
//
// Verifies that all version/capability surfaces agree with runtime reality.
// Catches truth drift between package.json, service worker, README,
// KNOWN_LIMITATIONS, capability manifest, and save-integrity.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(p) {
  return JSON.parse(await readFile(path.join(root, p), 'utf8'));
}

async function readText(p) {
  return readFile(path.join(root, p), 'utf8');
}

// ── Tests ──

test('release-truth: package.json version is 0.27.0', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.version, '0.27.0', 'package.json version must be 0.27.0');
});

test('release-truth: package.json description references v0.27.0, not stale v0.24.2', async () => {
  const pkg = await readJson('package.json');
  assert.ok(pkg.description.includes('0.27.0'),
    `description must reference v0.27.0, got: ${pkg.description.slice(0, 80)}...`);
  assert.ok(!pkg.description.includes('v0.24.2'),
    'description must not reference stale v0.24.2');
});

test('release-truth: save-integrity.js PRODUCT_VERSION is 0.27.0', async () => {
  const src = await readText('apps/lab-web/src/play/save-integrity.js');
  assert.ok(src.includes("PRODUCT_VERSION = '0.27.0'"),
    'save-integrity.js PRODUCT_VERSION must be 0.27.0');
});

test('release-truth: index.html references 0.27.0 via application-version meta', async () => {
  const html = await readText('apps/lab-web/src/index.html');
  assert.ok(html.includes('0.27.0'), 'index.html must reference version 0.27.0');
  assert.match(html, /application-version" content="0.27.0"/);
});

test('release-truth: config/release-identity.json version is 0.27.0', async () => {
  const ri = await readJson('config/release-identity.json');
  assert.equal(ri.version, '0.27.0');
  assert.ok(ri.canonicalArchivePrefix.includes('0.27.0'),
    `canonicalArchivePrefix must include 0.27.0, got: ${ri.canonicalArchivePrefix}`);
});

test('release-truth: README title references v0.27.0', async () => {
  const readme = await readText('README.md');
  assert.ok(readme.includes('v0.27.0'), 'README must reference v0.27.0');
});

test('release-truth: KNOWN_LIMITATIONS references v0.27.0', async () => {
  const kl = await readText('KNOWN_LIMITATIONS.md');
  assert.ok(kl.includes('v0.27.0'), 'KNOWN_LIMITATIONS must reference v0.27.0');
});

test('release-truth: service worker does NOT contain stale hardcoded v0.22.0 cache version', async () => {
  const sw = await readText('apps/lab-web/src/sw.js');
  assert.ok(!sw.includes("intrilex-v0.22.0"),
    'sw.js must NOT contain stale hardcoded cache version intrilex-v0.22.0');
  // v0.24.2: cache version should be derived from BUILD_INFO.json
  assert.ok(sw.includes('BUILD_INFO.json'),
    'sw.js must derive cache version from BUILD_INFO.json');
});

test('release-truth: README distinguishes online duel, tournament, and multiplayer correctly', async () => {
  const readme = await readText('README.md');
  // Must NOT contain the stale claim
  assert.ok(!readme.match(/Multiplayer.*Tournament.*not implemented/i),
    'README must NOT claim Multiplayer and Tournament are not implemented');
  // Must distinguish the three states
  assert.ok(readme.includes('Direct Duel') && readme.includes('SUPPORTED'),
    'README must state Online Direct Duel is SUPPORTED');
  assert.ok(readme.includes('Tournament workspace') && readme.match(/Tournament.*SUPPORTED/i),
    'README must state Tournament workspace is SUPPORTED');
  assert.ok(readme.includes('BLOCKED') && readme.includes('Multiplayer'),
    'README must state canonical 3-4 player Multiplayer is BLOCKED');
});

test('release-truth: KNOWN_LIMITATIONS spectator section is accurate', async () => {
  const kl = await readText('KNOWN_LIMITATIONS.md');
  // Must NOT claim spectators see P1's authorized view
  assert.ok(!kl.match(/Spectators see P1.*authorized view/i),
    'KNOWN_LIMITATIONS must NOT claim spectators see P1 authorized view — projection is NEUTRAL');
  // Must mention neutral projection
  assert.ok(kl.match(/neutral/i) || kl.match(/NEUTRAL/i),
    'KNOWN_LIMITATIONS must mention neutral spectator projection');
  // Must mention 50-spectator limit
  assert.ok(kl.includes('50 spectators'),
    'KNOWN_LIMITATIONS must state 50-spectator limit, not "no limit"');
  // Must NOT claim "no limit on spectator count"
  assert.ok(!kl.match(/No limit on spectator count/i),
    'KNOWN_LIMITATIONS must NOT claim "No limit on spectator count"');
});

test('release-truth: capability manifest separates capability from default state', async () => {
  // The manifest is generated, so we check the generator source
  const genSrc = await readText('scripts/generate-capability-manifest.mjs');
  // publicMatchmaking should be a structured object, not bare true
  assert.ok(genSrc.includes('publicMatchmaking:{supported:true,enabledByDefault:false'),
    'capability manifest generator must separate publicMatchmaking capability from default state');
  assert.ok(genSrc.includes('matchHistory:{supported:true,enabledByDefault:false'),
    'capability manifest generator must separate matchHistory capability from default state');
  // Must NOT use bare boolean for publicMatchmaking
  assert.ok(!genSrc.match(/publicMatchmaking:true[^{]/),
    'capability manifest must NOT use bare true for publicMatchmaking');
});

test('release-truth: server health endpoint reports v0.27.0', async () => {
  const serverSrc = await readText('apps/match-server/src/server.mjs');
  assert.ok(serverSrc.includes("version: '0.27.0'"),
    'server.mjs health endpoint must report version 0.27.0');
});
