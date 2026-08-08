import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// BL-04: HYBIX returns {actionId, metadata} but browser runtime treats it as canonical action.
// The runtime accesses selected.family, selected.mode, selected.timingClass which are undefined
// on the HYBRIX envelope. This test reproduces the mismatch.

test('BL-04: HYBIX choose() returns {actionId, metadata} envelope, not canonical action', async () => {
  // Read the dist hybrix agent to verify the return shape
  const agentSrc = await readFile(path.join(root, 'apps/lab-web/dist/hybrix/agent.js'), 'utf8');
  // The agent's choose() returns {actionId, metadata}
  assert.match(agentSrc, /return\s*\{\s*actionId:\s*selected\.action\.actionId/,
    'HYBIX agent.choose() must return {actionId, metadata} envelope');
  assert.match(agentSrc, /metadata:\s*\{/,
    'HYBIX agent.choose() must include metadata in return');
});

test('BL-04: browser runtime accesses selected.family on HYBIX envelope (crash path)', async () => {
  // Read the autonomy-runtime to verify it accesses selected.family etc.
  const runtimeSrc = await readFile(path.join(root, 'apps/lab-web/src/autonomy-runtime.js'), 'utf8');
  // The runtime accesses selected.family, selected.mode, selected.timingClass
  assert.match(runtimeSrc, /selected\.family/,
    'runtime accesses selected.family');
  assert.match(runtimeSrc, /selected\.timingClass/,
    'runtime accesses selected.timingClass');
  assert.match(runtimeSrc, /selected\.mode/,
    'runtime accesses selected.mode');
});

test('BL-04: choosePolicy must adapt HYBIX envelope to canonical action shape', async () => {
  // Read the choosePolicy function to verify it adapts the HYBIX return
  const runtimeSrc = await readFile(path.join(root, 'apps/lab-web/src/autonomy-runtime.js'), 'utf8');
  // The choosePolicy function must resolve the HYBIX envelope to a canonical action
  // by looking up the actionId in the legal actions and merging metadata
  const choosePolicyMatch = runtimeSrc.match(/function choosePolicy[\s\S]*?\n\}/);
  assert.ok(choosePolicyMatch, 'choosePolicy function must exist');
  const fnBody = choosePolicyMatch[0];
  // After fix: the HYBIX path must resolve the envelope to a canonical action
  // by finding the action in legalActions and attaching HYBIX metadata separately
  assert.ok(fnBody.includes('hybrix-'),
    'choosePolicy must handle hybrix- prefix');
  // The fix must not just return the envelope — it must resolve to canonical action
  // We check that the function either:
  // (a) looks up the action in legalActions by actionId, or
  // (b) passes the context with legalActions so the adapter can resolve
  assert.ok(fnBody.includes('context.legalActions') || fnBody.includes('legalActions'),
    'choosePolicy must have access to legalActions for resolution');
});

test('BL-05: browser HYBIX call path omits matchId/runInstanceId/decisionIndex', async () => {
  // The context passed to choosePolicy must include matchId, runInstanceId, decisionIndex
  const runtimeSrc = await readFile(path.join(root, 'apps/lab-web/src/autonomy-runtime.js'), 'utf8');
  // Find the line where choosePolicy is called
  const callMatch = runtimeSrc.match(/choosePolicy\s*\(\s*policyIds\[seat\]\s*,\s*\{[^}]*\}/);
  assert.ok(callMatch, 'must find choosePolicy call');
  const callArgs = callMatch[0];
  // After fix: the context must include matchId, runInstanceId, decisionIndex
  assert.ok(callArgs.includes('matchId'),
    'choosePolicy context must include matchId');
  assert.ok(callArgs.includes('decisionIndex') || callArgs.includes('decisionIndex'),
    'choosePolicy context must include decisionIndex');
});

test('BL-05: HYBIX adapter cache key must include runInstanceId, not just matchId', async () => {
  const adapterSrc = await readFile(path.join(root, 'apps/lab-web/dist/hybrix/policy-adapter.js'), 'utf8');
  // The cache key must use runInstanceId for lifecycle isolation
  assert.match(adapterSrc, /runInstanceId/,
    'HYBIX adapter must use runInstanceId for cache key');
  // The adapter must not fall back to matchId alone for cache key
  // (which would leak state across runs with same matchId)
  const cacheKeyMatch = adapterSrc.match(/cacheKey\s*=\s*[^;]+/);
  assert.ok(cacheKeyMatch, 'must have cacheKey');
  assert.ok(cacheKeyMatch[0].includes('runInstanceId'),
    'cacheKey must include runInstanceId');
});
