import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolkitPath = path.join(root, 'apps/lab-web/src/chart-toolkit.js');

// The toolkit uses ES module exports. Node can import it directly since it is
// pure JS with no browser globals. We dynamically import it as a module.
let mod;
async function loadToolkit() {
  if (!mod) mod = await import('file://' + toolkitPath.replace(/\\/g, '/'));
  return mod;
}

test('chart-toolkit.js exists and exports all chart functions', async () => {
  const m = await loadToolkit();
  for (const fn of ['radarChart', 'barChart', 'heatmap', 'sparkline', 'donutChart', 'lineChart', 'stackedBarChart', 'chartTableAlternative']) {
    assert.equal(typeof m[fn], 'function', `${fn} must be a function`);
  }
});

test('radarChart returns an <svg> string starting with <svg and ending with </svg>', async () => {
  const { radarChart } = await loadToolkit();
  const svg = radarChart({ axes: [{ label: 'A', value: 0.5 }, { label: 'B', value: 0.7 }, { label: 'C', value: 0.3 }] });
  assert.ok(svg.startsWith('<svg'), 'must start with <svg');
  assert.ok(svg.trim().endsWith('</svg>'), 'must end with </svg>');
});

test('radarChart with 6 axes produces 6 spoke lines', async () => {
  const { radarChart } = await loadToolkit();
  const svg = radarChart({ axes: [
    { label: 'A', value: 0.5 }, { label: 'B', value: 0.7 }, { label: 'C', value: 0.3 },
    { label: 'D', value: 0.8 }, { label: 'E', value: 0.2 }, { label: 'F', value: 0.6 },
  ] });
  const spokeCount = (svg.match(/class="ix-radar-spoke"/g) ?? []).length;
  assert.equal(spokeCount, 6, 'must have 6 spoke lines');
});

test('radarChart with fewer than 3 axes returns graceful empty svg', async () => {
  const { radarChart } = await loadToolkit();
  const svg = radarChart({ axes: [{ label: 'A', value: 0.5 }, { label: 'B', value: 0.7 }] });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('</svg>'));
  // No polygon data should be present
  assert.ok(!svg.includes('ix-radar-polygon'));
});

test('barChart returns an <svg> string', async () => {
  const { barChart } = await loadToolkit();
  const svg = barChart({ items: [{ label: 'A', value: 10 }, { label: 'B', value: 20 }] });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.trim().endsWith('</svg>'));
});

test('barChart handles empty input gracefully', async () => {
  const { barChart } = await loadToolkit();
  const svg = barChart({ items: [] });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('No data'), 'should show No data message');
});

test('heatmap produces correct cell count (rows × cols)', async () => {
  const { heatmap } = await loadToolkit();
  const rows = ['r1', 'r2', 'r3'];
  const cols = ['c1', 'c2'];
  const cells = [[0.1, null], [0.5, null], [0.9, null], [-0.2, null], [0, null], [0.3, null]];
  // Reshape into rows×cols
  const matrix = [];
  let idx = 0;
  for (let r = 0; r < rows.length; r += 1) { matrix.push(cells.slice(idx, idx + cols.length)); idx += cols.length; }
  const svg = heatmap({ rows, cols, cells: matrix });
  assert.ok(svg.startsWith('<svg'));
  // 3 rows × 2 cols = 6 cells (ix-heatmap-cell class)
  const cellCount = (svg.match(/class="ix-heatmap-cell"/g) ?? []).length;
  assert.equal(cellCount, 6, 'must have 6 cells');
});

test('heatmap with empty rows/cols returns graceful empty svg', async () => {
  const { heatmap } = await loadToolkit();
  const svg = heatmap({ rows: [], cols: [], cells: [] });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('No data'));
});

test('sparkline handles empty array', async () => {
  const { sparkline } = await loadToolkit();
  const svg = sparkline({ values: [] });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('</svg>'));
});

test('sparkline handles single value', async () => {
  const { sparkline } = await loadToolkit();
  const svg = sparkline({ values: [42] });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('Single value'), 'single-value sparkline should note the single value');
});

test('sparkline with multiple values renders a polyline', async () => {
  const { sparkline } = await loadToolkit();
  const svg = sparkline({ values: [1, 2, 3, 4, 5] });
  assert.ok(svg.includes('ix-sparkline-line'), 'must render a polyline');
});

test('donutChart segments sum correctly via title tooltips', async () => {
  const { donutChart } = await loadToolkit();
  const svg = donutChart({ segments: [
    { label: 'A', value: 30 }, { label: 'B', value: 20 }, { label: 'C', value: 50 },
  ] });
  assert.ok(svg.startsWith('<svg'));
  // 3 segments → 3 donut-segment paths
  const segCount = (svg.match(/class="ix-donut-segment"/g) ?? []).length;
  assert.equal(segCount, 3, 'must have 3 donut segments');
});

test('donutChart with all-zero values returns graceful empty svg', async () => {
  const { donutChart } = await loadToolkit();
  const svg = donutChart({ segments: [{ label: 'A', value: 0 }, { label: 'B', value: 0 }] });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('No data'));
});

test('lineChart renders one polyline per series', async () => {
  const { lineChart } = await loadToolkit();
  const svg = lineChart({ series: [
    { label: 'A', values: [1, 2, 3] }, { label: 'B', values: [3, 2, 1] },
  ], xLabels: ['t1', 't2', 't3'] });
  assert.ok(svg.startsWith('<svg'));
  const seriesCount = (svg.match(/class="ix-line-series"/g) ?? []).length;
  assert.equal(seriesCount, 2, 'must have 2 line series');
});

test('lineChart with no series returns graceful empty svg', async () => {
  const { lineChart } = await loadToolkit();
  const svg = lineChart({ series: [] });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('No data'));
});

test('stackedBarChart renders segments per category', async () => {
  const { stackedBarChart } = await loadToolkit();
  const svg = stackedBarChart({ items: [
    { label: 'P1', stack: [{ label: 'off', value: 5 }, { label: 'def', value: 3 }] },
    { label: 'P2', stack: [{ label: 'off', value: 2 }, { label: 'def', value: 8 }] },
  ], legendLabels: ['off', 'def'] });
  assert.ok(svg.startsWith('<svg'));
  const segCount = (svg.match(/class="ix-stacked-segment"/g) ?? []).length;
  assert.equal(segCount, 4, 'must have 4 stacked segments (2 categories × 2 segments)');
});

test('chartTableAlternative renders a table with headers and rows', async () => {
  const { chartTableAlternative } = await loadToolkit();
  const html = chartTableAlternative({ headers: ['A', 'B'], rows: [[1, 2], [3, 4]], caption: 'Test' });
  assert.ok(html.includes('<table'));
  assert.ok(html.includes('ix-chart-table-alt'));
  assert.ok(html.includes('<caption>Test</caption>'));
  assert.ok(html.includes('<th>A</th>'));
});

test('all chart svgs include role="img" for accessibility', async () => {
  const m = await loadToolkit();
  const cases = [
    m.radarChart({ axes: [{ label: 'A', value: 0.5 }, { label: 'B', value: 0.7 }, { label: 'C', value: 0.3 }] }),
    m.barChart({ items: [{ label: 'A', value: 1 }] }),
    m.heatmap({ rows: ['r'], cols: ['c'], cells: [[[0.5]]] }),
    m.sparkline({ values: [1, 2, 3] }),
    m.donutChart({ segments: [{ label: 'A', value: 1 }] }),
    m.lineChart({ series: [{ label: 'A', values: [1, 2] }] }),
  ];
  for (const svg of cases) {
    assert.ok(svg.includes('role="img"'), 'every chart svg must have role="img"');
  }
});

test('charts include <title> element when title is provided', async () => {
  const { radarChart } = await loadToolkit();
  const svg = radarChart({ axes: [{ label: 'A', value: 0.5 }, { label: 'B', value: 0.7 }, { label: 'C', value: 0.3 }], title: 'My Radar' });
  assert.ok(svg.includes('<title>My Radar</title>'), 'must include a <title> element');
});

test('source file declares no new dependencies and uses pure template strings', async () => {
  const src = await readFile(toolkitPath, 'utf8');
  assert.ok(src.includes('export function radarChart'), 'must export radarChart');
  assert.ok(src.includes('export function barChart'), 'must export barChart');
  assert.ok(src.includes('export function heatmap'), 'must export heatmap');
  assert.ok(src.includes('export function sparkline'), 'must export sparkline');
  assert.ok(src.includes('export function donutChart'), 'must export donutChart');
  assert.ok(!src.includes('require('), 'must not use CommonJS require');
  assert.ok(!/from ['"]chart\.js['"]|from ['"]d3|from ['"]chartist|from ['"]recharts/i.test(src), 'must not import any chart library');
});
