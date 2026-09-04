// ═══════════════════════════════════════════════════════════════
// v0.30.0-product-truth.test.mjs — Product truth and three-lanes tests
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (p) => readFile(path.join(root, p), 'utf8');
const readJson = async (p) => JSON.parse(await read(p));
const exists = async (p) => { try { await access(path.join(root, p)); return true; } catch { return false; } };

// ── Capability truth generation ──

test('v0.30.0: capability-truth.json exists and has required fields', async () => {
  const truth = await readJson('config/capability-truth.json');
  assert.equal(truth.schemaVersion, '1.0.0');
  assert.ok(truth.product, 'must have product section');
  assert.ok(truth.profiles, 'must have profiles section');
  assert.ok(truth.lanes, 'must have lanes section');
  assert.ok(truth.limitations, 'must have limitations section');
  assert.ok(truth.networkAuthority, 'must have networkAuthority section');
});

test('v0.30.0: capability truth has three lanes (Play, Learn, Lab)', async () => {
  const truth = await readJson('config/capability-truth.json');
  assert.ok(truth.lanes.play, 'must have play lane');
  assert.ok(truth.lanes.learn, 'must have learn lane');
  assert.ok(truth.lanes.lab, 'must have lab lane');
  assert.ok(truth.lanes.play.routes.length > 0, 'play lane must have routes');
  assert.ok(truth.lanes.learn.routes.length > 0, 'learn lane must have routes');
  assert.ok(truth.lanes.lab.routes.length > 0, 'lab lane must have routes');
});

test('v0.30.0: capability truth product version matches release identity', async () => {
  const truth = await readJson('config/capability-truth.json');
  const ri = await readJson('config/release-identity.json');
  assert.equal(truth.product.version, ri.version);
  assert.equal(truth.product.engineVersion, ri.engineVersion);
  assert.equal(truth.product.rulesVersion, ri.rulesVersion);
});

test('v0.30.0: capability truth limitations include multiplayer blocked', async () => {
  const truth = await readJson('config/capability-truth.json');
  const mp = truth.limitations.find(l => l.id === 'MULTIPLAYER-01');
  assert.ok(mp, 'must have MULTIPLAYER-01 limitation');
  assert.equal(mp.severity, 'by-design');
});

test('v0.30.0: FEATURE_MATRIX.md is generated and contains profiles', async () => {
  const matrix = await read('docs/FEATURE_MATRIX.md');
  assert.match(matrix, /AUTO-GENERATED/);
  assert.match(matrix, /Simulation Profiles/);
  assert.match(matrix, /Advanced Core/);
  assert.match(matrix, /Unrestricted Core/);
  assert.match(matrix, /Online Play/);
  assert.match(matrix, /Product Lanes/);
  assert.match(matrix, /Limitations/);
});

test('v0.30.0: KNOWN_LIMITATIONS.md is generated and contains limitations', async () => {
  const kl = await read('KNOWN_LIMITATIONS.md');
  assert.match(kl, /AUTO-GENERATED/);
  assert.match(kl, /By Design/);
  assert.match(kl, /MULTIPLAYER/);
});

test('v0.30.0: README is concise and does not contain stale v0.10/v0.11/v0.12 prose', async () => {
  const readme = await read('README.md');
  assert.match(readme, /Product truth/);
  assert.match(readme, /Three lanes|Play.*Learn.*Lab|three lanes/i);
  assert.match(readme, /Online 1v1 Direct Duel/);
  assert.match(readme, /Ranked matchmaking/);
  // Should NOT contain stale version prose
  assert.doesNotMatch(readme, /v0\.10\.0 introduces/);
  assert.doesNotMatch(readme, /v0\.11\.0 introduced/);
  assert.doesNotMatch(readme, /v0\.12\.0 introduced/);
  assert.doesNotMatch(readme, /v0\.13\.0 introduced/);
});

test('v0.30.0: generate-capability-truth.mjs script exists', async () => {
  assert.ok(await exists('scripts/generate-capability-truth.mjs'));
});

// ── Three-lanes navigation ──

test('v0.30.0: router.js has three-lane navigation (Play, Learn, Lab)', async () => {
  const router = await read('apps/lab-web/src/router.js');
  assert.match(router, /label:\s*'Play'/);
  assert.match(router, /label:\s*'Learn'/);
  assert.match(router, /label:\s*'Lab'/);
});

test('v0.30.0: router.js WORKSPACES includes play and learn routes', async () => {
  const router = await read('apps/lab-web/src/router.js');
  assert.match(router, /\['\/play'/);
  assert.match(router, /\['\/play\/academy'/);
  assert.match(router, /\['\/puzzles'/);
  assert.match(router, /\['\/rules'/);
  assert.match(router, /\['\/cards'/);
  assert.match(router, /\['\/seasons'/);
  assert.match(router, /\['\/tournaments'/);
});

test('v0.30.0: router.js no longer uses Analysis/Investigation/System sections', async () => {
  const router = await read('apps/lab-web/src/router.js');
  // The old sections should not be the primary grouping
  // (Account is fine as a fourth section)
  assert.doesNotMatch(router, /label:\s*'Analysis'/);
  assert.doesNotMatch(router, /label:\s*'Investigation'/);
});

// ── Capability truth generator is runnable ──

test('v0.30.0: package.json has capability:generate script', async () => {
  const pkg = await readJson('package.json');
  assert.ok(pkg.scripts['capability:generate'], 'must have capability:generate script');
  assert.match(pkg.scripts['capability:generate'], /generate-capability-truth/);
});
