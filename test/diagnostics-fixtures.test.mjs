import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('decision traces exist as positive fixtures for diagnostics', async () => {
  const traceDir = path.join(root, 'sample-data/autonomy/decision-traces');
  const files = (await readdir(traceDir)).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= 27, `Expected at least 27 decision trace files, got ${files.length}`);
  // Verify first trace has the expected structure
  const first = JSON.parse(await readFile(path.join(traceDir, files[0]), 'utf8'));
  assert.ok(first.matchId, 'trace must have matchId');
  assert.ok(first.traceCount > 0, 'trace must have traceCount > 0');
  assert.ok(Array.isArray(first.traces), 'trace must have traces array');
  const firstTrace = first.traces[0];
  assert.ok(firstTrace.policyId, 'trace entry must have policyId');
  assert.ok(firstTrace.decisionId, 'trace entry must have decisionId');
  assert.ok(firstTrace.selectedActionId !== undefined, 'trace entry must have selectedActionId');
});

test('diagnostics pipeline produces valid output from retained traces', async () => {
  // Load the browser-side diagnostics function
  const browserDiagPath = path.join(root, 'apps/lab-web/src/decision-intelligence.js');
  const browserDiagUrl = `file://${browserDiagPath.replace(/\\/g, '/')}`;
  // The browser decision-intelligence imports from autonomy-runtime and engine
  // which have browser-specific imports. We'll test the diagnostics logic directly.
  // Instead, verify the Node-side diagnostics produces valid output.
  const { diagnosePolicy } = await import('@intrilex/decision-intelligence/policy-diagnostics');
  // Load retained traces
  const traceDir = path.join(root, 'sample-data/autonomy/decision-traces');
  const files = (await readdir(traceDir)).filter(f => f.endsWith('.json'));
  const allTraces = [];
  for (const f of files) {
    const data = JSON.parse(await readFile(path.join(traceDir, f), 'utf8'));
    allTraces.push(...data.traces);
  }
  // Load match summaries (NDJSON format)
  const ndjson = await readFile(path.join(root, 'sample-data/autonomy/match-summaries.ndjson'), 'utf8');
  const summaries = ndjson.trim().split('\n').map(l => JSON.parse(l));
  // Run diagnostics for a baseline policy
  const result = diagnosePolicy(summaries, allTraces, 'score-rush');
  assert.ok(result.policyId === 'score-rush', 'diagnostics must return correct policyId');
  assert.ok(result.matchCount > 0, 'diagnostics must find matches for policy');
  assert.ok(result.decisionCount > 0, 'diagnostics must find decisions for policy');
  assert.ok(result.metrics, 'diagnostics must produce metrics');
  assert.ok(typeof result.metrics.decisionMarginMean === 'number' || result.metrics.decisionMarginMean === undefined,
    'decisionMarginMean must be a number or undefined');
  assert.ok(Array.isArray(result.lowMarginDecisions), 'lowMarginDecisions must be an array');
  assert.ok(Array.isArray(result.highRiskDecisions), 'highRiskDecisions must be an array');
  assert.ok(result.diagnosticsHash, 'diagnostics must produce a hash');
});

test('diagnostics workspace renders fail-closed when no traces available', async () => {
  // The renderDiagnostics function was moved to workspaces/diagnostics.js during
  // decomposition. When no campaign data is available, it shows an empty-state message.
  const diagSrc = await readFile(path.join(root, 'apps/lab-web/src/workspaces/diagnostics.js'), 'utf8');
  assert.ok(diagSrc.includes('No campaign data'), 'diagnostics.js must show fail-closed message when no campaign data');
  assert.ok(diagSrc.includes('No decision traces'), 'diagnostics.js must show fail-closed message when no decision traces');
  assert.ok(diagSrc.includes('Run a campaign'), 'diagnostics.js must prompt user to run a campaign');
});
