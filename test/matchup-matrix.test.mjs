import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

test('renderMatchupMatrix is exported from observatory.js', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/export function renderMatchupMatrix/.test(js), 'must export renderMatchupMatrix');
});

test('renderMatchupMatrix produces an SVG heatmap with ix-chart-heatmap class', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(js.includes('heatmap('), 'must call heatmap from toolkit');
  assert.ok(/matchup-matrix/.test(js), 'must emit matchup-matrix container');
  assert.ok(js.includes('ix-chart-container'), 'must use ix-chart-container class');
});

test('matchup matrix computation filters to decisive 2-player matches', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/pids\.length !== 2/.test(js), 'must require exactly 2 policyIds');
  assert.ok(/computeMatchupMatrix/.test(js), 'must define computeMatchupMatrix');
});

test('matchup matrix is symmetric (A vs B + B vs A = 100% for decisive matches)', async () => {
  const js = await src('workspaces/observatory.js');
  // The win rate is computed as aWins / (aWins + bWins), so A-vs-B + B-vs-A = 1
  assert.ok(/aWins \/ total/.test(js), 'must compute win rate as aWins/total');
  assert.ok(/wins\[a\]\?\.\[b\]/.test(js), 'must look up wins[a][b]');
});

test('renderPolicyArchetypes is exported from observatory.js', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/export function renderPolicyArchetypes/.test(js), 'must export renderPolicyArchetypes');
});

test('archetype clustering assigns every policy to a cluster via k-means', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/kMeansCluster/.test(js), 'must define kMeansCluster');
  assert.ok(/assignments/.test(js), 'must produce assignments array');
  // k-means must iterate assign + update
  assert.ok(/for \(let iter = 0/.test(js), 'must iterate');
  assert.ok(/centroids/.test(js), 'must track centroids');
});

test('archetype clustering uses a behavioral fingerprint vector', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/policyFingerprint/.test(js), 'must define policyFingerprint');
  // Fingerprint includes winRate, exhaustedPassRate, responsePlayRate, avgScoreMargin
  assert.ok(js.includes('winRate'), 'fingerprint must include winRate');
  assert.ok(js.includes('exhaustedPassRate'), 'fingerprint must include exhaustedPassRate');
  assert.ok(js.includes('responsePlayRate'), 'fingerprint must include responsePlayRate');
  assert.ok(js.includes('avgScoreMargin'), 'fingerprint must include avgScoreMargin');
});

test('archetype clustering renders a donut chart of distribution', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/donutChart\(/.test(js), 'must call donutChart');
  assert.ok(/donutSegments/.test(js), 'must build donut segments from cluster counts');
});

test('archetype clustering renders a bar chart of archetype-average metrics', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/barChart\(/.test(js), 'must call barChart');
  assert.ok(/archAvg/.test(js), 'must compute archetype averages');
});

test('archetype clustering renders a table of policies with assigned archetype', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/chartTableAlternative\(/.test(js), 'must call chartTableAlternative');
  assert.ok(/Distance to centroid/.test(js), 'table must include distance to centroid');
});

test('empty summaries produce graceful empty state for matchup matrix', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/policies\.length < 2/.test(js), 'must guard on policies.length < 2');
  assert.ok(/No decisive 2-player matches/.test(js), 'must show graceful empty message');
});

test('empty policy data produces graceful empty state for archetype clustering', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/policies\.length < 2/.test(js), 'must guard on policies.length < 2');
  assert.ok(/Not enough policy data/.test(js), 'must show graceful empty message');
});

test('diagnostics workspace renders the archetype clustering section', async () => {
  const js = await src('workspaces/diagnostics.js');
  assert.ok(js.includes('renderPolicyArchetypes'), 'diagnostics must import renderPolicyArchetypes');
  assert.ok(/archetypeHtml/.test(js), 'diagnostics must render archetypeHtml');
});

test('compare workspace renders the matchup matrix section', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/matchupHtml/.test(js), 'compare must render matchupHtml');
  assert.ok(/renderMatchupMatrix\(\)/.test(js), 'compare must call renderMatchupMatrix');
});

test('no new dependencies are introduced for clustering (inline k-means)', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(!/from ['"]ml-kmeans|from ['"]clusterfck|from ['"]skmeans/i.test(js), 'must not import a clustering library');
});
