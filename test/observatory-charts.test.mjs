import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

test('renderMechanics source wires a pick-rate bar chart with ix-chart-bar class', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(js.includes('renderMechanicsPickRateChart'), 'must define renderMechanicsPickRateChart');
  assert.ok(js.includes("barChart("), 'must call barChart from toolkit');
  assert.ok(/mechanics-pickrate-chart/.test(js), 'must emit a mechanics-pickrate-chart container');
  // The chart container uses the ix-chart-container class
  assert.ok(js.includes('ix-chart-container'), 'chart container must use ix-chart-container class');
});

test('renderSynergies source wires a synergy heatmap with ix-chart-heatmap class', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(js.includes('renderSynergyHeatmap'), 'must define renderSynergyHeatmap');
  assert.ok(js.includes('heatmap('), 'must call heatmap from toolkit');
  assert.ok(/synergy-heatmap/.test(js), 'must emit a synergy-heatmap container');
});

test('renderTournamentAnalytics source wires donut + bar + sparkline charts', async () => {
  const js = await src('workspaces/tournament.js');
  assert.ok(js.includes('donutChart('), 'must call donutChart');
  assert.ok(js.includes('barChart('), 'must call barChart');
  assert.ok(js.includes('sparkline('), 'must call sparkline');
  assert.ok(/tournament-donut-chart/.test(js), 'must emit tournament-donut-chart container');
  assert.ok(/tournament-bar-chart/.test(js), 'must emit tournament-bar-chart container');
  assert.ok(/tournament-sparklines/.test(js), 'must emit tournament-sparklines container');
});

test('observatory.js imports the chart toolkit', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(js.includes("from '../chart-toolkit.js'"), 'must import chart-toolkit');
});

test('tournament.js imports the chart toolkit', async () => {
  const js = await src('workspaces/tournament.js');
  assert.ok(js.includes("from '../chart-toolkit.js'"), 'must import chart-toolkit');
});

test('mechanics chart colors bars by evidence grade', async () => {
  const js = await src('workspaces/observatory.js');
  // The gradeColor helper maps SUPPORTED→green, EXPLORATORY→blue, INSUFFICIENT→amber
  assert.ok(/gradeColor/.test(js), 'must define gradeColor helper');
  assert.ok(js.includes("'#4fd387'"), 'SUPPORTED grade should be green');
  assert.ok(js.includes("'#5ad7e8'"), 'EXPLORATORY grade should be blue');
  assert.ok(js.includes("'#f1bd5d'"), 'INSUFFICIENT grade should be amber');
});

test('synergy heatmap only includes pairs with exploratory+ evidence', async () => {
  const js = await src('workspaces/observatory.js');
  // The eligible filter requires rank >= 2 (EXPLORATORY)
  assert.ok(/rank >= 2/.test(js), 'must filter to exploratory+ evidence');
});

test('charts include View as table toggle buttons', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(js.includes('data-chart-toggle'), 'must emit data-chart-toggle buttons');
  assert.ok(js.includes('chartTableAlternative'), 'must use chartTableAlternative for table view');
  assert.ok(js.includes('bindChartToggle'), 'must wire bindChartToggle');
});

test('tournament analytics table rows are clickable to compare workspace', async () => {
  const js = await src('workspaces/tournament.js');
  assert.ok(js.includes('data-compare-policy'), 'must emit data-compare-policy rows');
  assert.ok(js.includes("location.hash = '#/compare'"), 'must navigate to /compare');
});

test('empty data states render gracefully (no chart when no data)', async () => {
  const js = await src('workspaces/observatory.js');
  // renderMechanicsPickRateChart returns '' when withPick.length === 0
  assert.ok(/withPick\.length === 0\) return ''/.test(js), 'mechanics chart must return empty string when no pick-rate data');
  // renderSynergyHeatmap returns '' when eligible.length === 0
  assert.ok(/eligible\.length === 0\) return ''/.test(js), 'synergy heatmap must return empty string when no eligible pairs');
});

test('tournament donut/bar charts guard against empty policy data', async () => {
  const js = await src('workspaces/tournament.js');
  assert.ok(/donutSegments\.length > 0/.test(js), 'donut chart must guard on segment count');
  assert.ok(/barItems\.length > 0/.test(js), 'bar chart must guard on item count');
});
