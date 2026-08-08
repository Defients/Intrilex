import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');

test('browser autonomy-runtime exports all 19 policies (5 baseline + 14 HYBRIX)', async () => {
  const src = await readFile(path.join(dist, 'autonomy-runtime.js'), 'utf8');
  // Check that HYBRIX import is present
  assert.ok(src.includes('HYBRIX_POLICY_IDS'), 'autonomy-runtime must import HYBRIX_POLICY_IDS');
  assert.ok(src.includes('chooseHybrixPolicy'), 'autonomy-runtime must import chooseHybrixPolicy');
  // Check that POLICY_IDS includes both baseline and HYBRIX
  assert.ok(src.includes('BASELINE_POLICY_IDS'), 'must define BASELINE_POLICY_IDS');
  assert.ok(src.includes('[...BASELINE_POLICY_IDS, ...HYBRIX_POLICY_IDS]'), 'POLICY_IDS must spread baseline + HYBRIX');
});

test('browser app.js exposes all 19 policies in the dropdown', async () => {
  const src = await readFile(path.join(dist, 'router.js'), 'utf8');
  // Check that HYBRIX policies are in the dropdown (policyOptions lives in router.js after decomposition)
  const hybrixIds = ['hybrix-rusher','hybrix-defender','hybrix-trickster','hybrix-sniper','hybrix-support','hybrix-tank',
    'hybrix-rusher-hard','hybrix-defender-hard','hybrix-trickster-hard','hybrix-sniper-hard',
    'hybrix-rusher-easy','hybrix-defender-easy','hybrix-rusher-nightmare','hybrix-defender-nightmare'];
  for (const id of hybrixIds) {
    assert.ok(src.includes(`'${id}'`), `router.js must include HYBRIX policy '${id}' in dropdown`);
  }
});

test('browser hybrix dist contains all required modules', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(path.join(dist, 'hybrix'))).filter(f => f.endsWith('.js'));
  const required = ['agent.js','perception.js','personality.js','memory.js','cognition.js','coordination.js',
    'failsafe.js','debug.js','difficulty.js','config.js','policy-adapter.js',
    'browser-shared.js','browser-policy-sdk.js'];
  for (const mod of required) {
    assert.ok(files.includes(mod), `HYBRIX dist must contain ${mod}`);
  }
});

test('browser hybrix policy-adapter exports HYBRIX_POLICY_IDS and chooseHybrixPolicy', async () => {
  const src = await readFile(path.join(dist, 'hybrix/policy-adapter.js'), 'utf8');
  assert.ok(src.includes('export const HYBRIX_POLICY_IDS'), 'must export HYBRIX_POLICY_IDS');
  assert.ok(src.includes('export function chooseHybrixPolicy'), 'must export chooseHybrixPolicy');
  assert.ok(src.includes('export const HYBRIX_POLICIES'), 'must export HYBRIX_POLICIES');
  // Count the HYBRIX policy definitions
  const createCount = (src.match(/createHybrixPolicy\(/g) || []).length;
  assert.ok(createCount >= 14, `must define at least 14 HYBRIX policies, found ${createCount}`);
});
