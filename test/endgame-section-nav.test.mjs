import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

test('renderEndgameAnalysis is exported from observatory.js', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/export function renderEndgameAnalysis/.test(js), 'must export renderEndgameAnalysis');
});

test('endgame analysis renders a donut chart of termination reasons', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/donutChart\(/.test(js), 'must call donutChart');
  assert.ok(/Termination reason distribution/.test(js), 'must label termination reason chart');
});

test('endgame analysis computes comeback rate per policy', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/comebackStats/.test(js), 'must compute comebackStats');
  assert.ok(/comebacks/.test(js), 'must track comebacks');
  assert.ok(/Comeback rate per policy/.test(js), 'must label comeback chart');
});

test('endgame analysis renders a bar chart of comeback rates', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/barChart\(/.test(js), 'must call barChart');
});

test('endgame analysis guards against empty summaries', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/endgame-empty/.test(js), 'must emit endgame-empty placeholder');
  assert.ok(/No match summaries available for endgame analysis/.test(js), 'must show graceful empty message');
});

test('endgame analysis includes table alternatives for termination and comeback data', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/chartTableAlternative\(/.test(js), 'must call chartTableAlternative');
  assert.ok(/Termination reason/.test(js), 'must include termination reason table');
  assert.ok(/Comeback rate/.test(js), 'must include comeback rate table');
});

test('diagnostics workspace renders the endgame analysis section', async () => {
  const js = await src('workspaces/diagnostics.js');
  assert.ok(js.includes('renderEndgameAnalysis'), 'diagnostics must import renderEndgameAnalysis');
  assert.ok(/endgameHtml/.test(js), 'diagnostics must render endgameHtml');
});

test('diagnostics workspace includes section tab navigation', async () => {
  const js = await src('workspaces/diagnostics.js');
  assert.ok(/ix-section-tabs/.test(js), 'must emit ix-section-tabs nav');
  assert.ok(/data-section-tab/.test(js), 'must emit data-section-tab buttons');
  assert.ok(/role="tablist"/.test(js), 'must use role="tablist"');
  assert.ok(/role="tab"/.test(js), 'must use role="tab"');
  assert.ok(/role="tabpanel"/.test(js), 'must use role="tabpanel"');
});

test('section tab state persists in state.diagActiveSection', async () => {
  const js = await src('workspaces/diagnostics.js');
  assert.ok(/state\.diagActiveSection/.test(js), 'must read state.diagActiveSection');
  assert.ok(/state\.diagActiveSection = tab\.dataset\.sectionTab/.test(js), 'must write state.diagActiveSection on tab click');
});

test('section tabs include Diagnostics, Archetypes, Tempo, and Endgame', async () => {
  const js = await src('workspaces/diagnostics.js');
  assert.ok(/Diagnostics/.test(js), 'must include Diagnostics tab');
  assert.ok(/Archetypes/.test(js), 'must include Archetypes tab');
  assert.ok(/Tempo/.test(js), 'must include Tempo tab');
  assert.ok(/Endgame/.test(js), 'must include Endgame tab');
});

test('state.js declares diagActiveSection field', async () => {
  const js = await src('state.js');
  assert.ok(js.includes('diagActiveSection'), 'state must declare diagActiveSection');
});

test('CSS includes reduced-motion support for chart elements', async () => {
  const css = await src('css/feature-components.css');
  assert.ok(/prefers-reduced-motion:reduce/.test(css), 'must include prefers-reduced-motion media query');
  assert.ok(/ix-chart-bar/.test(css), 'reduced-motion must cover bar chart');
  assert.ok(/ix-chart-donut/.test(css), 'reduced-motion must cover donut chart');
});

test('CSS includes print styles with grayscale for charts', async () => {
  const css = await src('css/feature-components.css');
  assert.ok(/@media print/.test(css), 'must include @media print');
  assert.ok(/grayscale\(1\)/.test(css), 'print must apply grayscale to charts');
  assert.ok(/ix-section-tabs/.test(css), 'print must hide section tabs');
}

);

test('CSS includes responsive max-width for charts', async () => {
  const css = await src('css/feature-components.css');
  assert.ok(/max-width:100%/.test(css), 'charts must have max-width:100%');
});

test('CSS includes section tab and cross-link styling', async () => {
  const css = await src('css/feature-components.css');
  assert.ok(/ix-section-tab/.test(css), 'must style ix-section-tab');
  assert.ok(/ix-cross-link/.test(css), 'must style ix-cross-link');
  assert.ok(/ix-filter-toolbar/.test(css), 'must style ix-filter-toolbar');
});

test('chart toolkit includes accessibility metadata (role=img, title, aria-label)', async () => {
  const js = await src('chart-toolkit.js');
  assert.ok(/role="img"/.test(js), 'must include role="img"');
  assert.ok(/<title>/.test(js), 'must include <title> elements');
  assert.ok(/aria-label/.test(js), 'must include aria-label attributes');
  assert.ok(/viewBox/.test(js), 'must include viewBox for responsive scaling');
});

test('chart toolkit includes chartTableAlternative helper', async () => {
  const js = await src('chart-toolkit.js');
  assert.ok(/chartTableAlternative/.test(js), 'must define chartTableAlternative');
});
