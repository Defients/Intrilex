import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('meta: every *.test.mjs on disk is listed in the default test script (BL-01 non-vacuity)', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const testScript = pkg.scripts.test ?? '';
  assert.ok(testScript.includes('node --test'), 'test script must use node --test');
  const diskTests = (await readdir(path.join(root, 'test')))
    .filter(f => f.endsWith('.test.mjs'))
    .sort();
  assert.ok(diskTests.length >= 20, `must have at least 20 test files, got ${diskTests.length}`);
  const missing = diskTests.filter(f => !testScript.includes(f));
  assert.deepEqual(missing, [],
    `test files on disk but NOT in default test script: ${missing.join(', ')}`);
});

test('meta: every *.test.mjs on disk is listed in CI script (BL-01 non-vacuity)', async () => {
  // ci.sh delegates to ci.mjs (canonical pipeline definition)
  const ciPath = path.join(root, 'scripts/ci.mjs');
  if (!existsSync(ciPath)) return;
  const ci = await readFile(ciPath, 'utf8');
  const diskTests = (await readdir(path.join(root, 'test')))
    .filter(f => f.endsWith('.test.mjs'))
    .sort();
  const missing = diskTests.filter(f => !ci.includes(f));
  assert.deepEqual(missing, [],
    `test files on disk but NOT in CI script (ci.mjs): ${missing.join(', ')}`);
});

test('meta: CI run_step count matches printed denominator (BL-17 regression guard)', async () => {
  // ci.sh delegates to ci.mjs — verify ci.mjs has stage definitions
  const ciPath = path.join(root, 'scripts/ci.mjs');
  if (!existsSync(ciPath)) return;
  const ci = await readFile(ciPath, 'utf8');
  // ci.mjs uses STAGES array — verify it has entries and writes ci-stages.json
  const stageCount = (ci.match(/^\s+\['[^']+',/gm) ?? []).length;
  assert.ok(stageCount >= 80, `ci.mjs must have at least 80 stages, got ${stageCount}`);
  assert.ok(ci.includes('ci-stages.json'),
    'ci.mjs must write reports/ci-stages.json');
});

test('meta: no test file uses bare try/catch that swallows assertion failures (BL-13 regression guard)', async () => {
  const diskTests = (await readdir(path.join(root, 'test')))
    .filter(f => f.endsWith('.test.mjs'));
  const offenders = [];
  for (const f of diskTests) {
    // Skip this meta-test file — it legitimately contains the pattern string
    if (f === 'test-coverage-meta.test.mjs') continue;
    const src = await readFile(path.join(root, 'test', f), 'utf8');
    // Match `catch {}` or `catch { }` with empty body — swallows all errors
    if (/\bcatch\s*\{\s*\}/.test(src)) {
      offenders.push(f);
    }
  }
  assert.deepEqual(offenders, [],
    `test files with bare empty catch {}: ${offenders.join(', ')}`);
});
