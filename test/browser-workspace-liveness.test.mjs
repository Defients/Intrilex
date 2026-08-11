import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'apps/lab-web/src');
const src = (file) => readFile(path.join(srcDir, file), 'utf8');
const cssSrc = async () => (await Promise.all(['tokens-base','feature-components','pages-polish'].map(f => readFile(path.join(srcDir, 'css', `${f}.css`), 'utf8')))).join('\n');

// BL-07: Traces must load shard files, not read record.traces from index
test('BL-07: renderTraces loads trace shards via ensureTraceShardsLoaded', async () => {
  const code = await src('workspaces/observatory.js');
  // Must not read r.traces from index records
  const renderTracesMatch = code.match(/export function renderTraces[\s\S]*$/);
  assert.ok(renderTracesMatch, 'must find renderTraces function');
  const fnBody = renderTracesMatch[0];
  assert.ok(!fnBody.includes('r.traces??[]'),
    'renderTraces must not read r.traces from index records (BL-07)');
  assert.ok(fnBody.includes('traceCount'),
    'renderTraces must read traceCount metadata from index records');
  assert.ok(fnBody.includes('shard files'),
    'renderTraces must reference shard files for trace detail');
});

// BL-08: Branches must use fixtureId, not matchId, from lab-replay-index
test('BL-08: renderBranches uses fixtureId from lab-replay-index records', async () => {
  const code = await src('workspaces/branches.js');
  const renderBranchesMatch = code.match(/function renderBranches[\s\S]*?\nfunction renderBranchResult/);
  assert.ok(renderBranchesMatch, 'must find renderBranches function');
  const fnBody = renderBranchesMatch[0];
  assert.ok(fnBody.includes('fixtureId'),
    'renderBranches must use fixtureId from lab-replay-index records');
  assert.ok(!fnBody.includes('retention[0].matchId'),
    'renderBranches must not read matchId from retention records (BL-08)');
});

test('BL-08: runPairedCounterfactual uses fixtureId from lab-replay-index records', async () => {
  const code = await src('workspaces/branches.js');
  const runMatch = code.match(/async function runPairedCounterfactual[\s\S]*?\n\}/);
  assert.ok(runMatch, 'must find runPairedCounterfactual function');
  const fnBody = runMatch[0];
  assert.ok(fnBody.includes('fixtureId'),
    'runPairedCounterfactual must use fixtureId from retention records');
});

// BL-09: Diagnostics must read selector values at click time, not stale closure
test('BL-09: Diagnostics Run button reads current selector values at click time', async () => {
  const code = await src('workspaces/diagnostics.js');
  const diagMatch = code.match(/function renderDiagnostics[\s\S]*?\nexport async function runDiagnostics/);
  assert.ok(diagMatch, 'must find renderDiagnostics function');
  const fnBody = diagMatch[0];
  // Must read from DOM at click time, not use stale closure variables
  assert.ok(fnBody.includes("querySelector('#diag-baseline')"),
    'Run button must read current selector value from DOM at click time');
  assert.ok(!fnBody.includes('onclick=()=>runDiagnostics(baselineId,candidateId)'),
    'must not use stale closure values (BL-09)');
});

// BL-07: Trace index records must not contain traces array
test('BL-07: trace index records contain metadata only, not traces array', async () => {
  const idx = JSON.parse(await readFile(path.join(root, 'apps/lab-web/dist/data/autonomy/decision-trace-index.json'), 'utf8'));
  assert.ok(idx.records.length > 0, 'trace index must have records');
  for (const r of idx.records) {
    assert.ok(!r.traces, `trace index record ${r.matchId} must not contain traces array`);
    assert.ok(r.traceCount > 0, `trace index record ${r.matchId} must have traceCount > 0`);
  }
});

// BL-08: lab-replay-index records must have fixtureId
test('BL-08: lab-replay-index records have fixtureId, not matchId', async () => {
  const idx = JSON.parse(await readFile(path.join(root, 'apps/lab-web/dist/data/autonomy/lab-replay-index.json'), 'utf8'));
  assert.ok(idx.records.length > 0, 'lab-replay-index must have records');
  for (const r of idx.records) {
    assert.ok(r.fixtureId, `lab-replay-index record must have fixtureId`);
    // matchId may be in summary but not at top level
    assert.ok(!r.matchId, `lab-replay-index record must not have top-level matchId (use fixtureId)`);
  }
});

// BL-16: Rank swap matrix heatmap must be present in /ranks workspace
test('BL-16: renderRanks includes swap matrix heatmap section', async () => {
  const code = await src('workspaces/ranks.js');
  assert.ok(code.includes('rankSwapMatrixSection'),
    'renderRanks must call rankSwapMatrixSection to render the swap matrix heatmap');
  assert.ok(code.includes('swap-matrix'),
    'ranks.js must contain swap-matrix CSS class for the heatmap table');
  assert.ok(code.includes('swap-cell'),
    'ranks.js must contain swap-cell CSS class for heatmap cells');
  assert.ok(code.includes('data-swap-from'),
    'swap matrix cells must have data-swap-from attribute for interactivity');
});

// BL-16: Swap matrix data must be present in observatory analytics
test('BL-16: observatory analytics.json contains swap matrix data', async () => {
  const analytics = JSON.parse(await readFile(path.join(root, 'apps/lab-web/dist/data/observatory/analytics.json'), 'utf8'));
  assert.ok(analytics.swapMatrix, 'observatory analytics.json must contain swapMatrix');
  const ranks = Object.keys(analytics.swapMatrix);
  // 14 base ranks + 4 per-suit Ten entries (10:club, 10:diamond, 10:heart, 10:spade) = 18
  assert.ok(ranks.length === 18, `swapMatrix must have 18 ranks, got ${ranks.length}`);
  // Verify each rank has alternatives
  for (const rank of ranks) {
    const alternatives = Object.keys(analytics.swapMatrix[rank]);
    assert.ok(alternatives.length >= 14, `rank ${rank} must have at least 14 alternatives, got ${alternatives.length}`);
  }
  // Verify a sample cell has the expected structure
  const sampleCell = analytics.swapMatrix['A']?.['2'];
  assert.ok(sampleCell, 'swapMatrix A->2 cell must exist');
  assert.equal(typeof sampleCell.decisionValue, 'number', 'cell must have numeric decisionValue');
  assert.equal(typeof sampleCell.winRateDelta, 'number', 'cell must have numeric winRateDelta');
  assert.ok(sampleCell.confidence, 'cell must have confidence level');
});

// BL-16: Swap matrix CSS must be present in styles.css
test('BL-16: styles.css contains swap matrix heatmap styles', async () => {
  const css = await cssSrc();
  assert.ok(css.includes('.swap-matrix'), 'styles.css must have .swap-matrix class');
  assert.ok(css.includes('.swap-cell'), 'styles.css must have .swap-cell class');
  assert.ok(css.includes('.swap-header'), 'styles.css must have .swap-header class');
  assert.ok(css.includes('.swap-legend'), 'styles.css must have .swap-legend class');
  assert.ok(css.includes('.swap-diagonal'), 'styles.css must have .swap-diagonal class for self-swap cells');
});
