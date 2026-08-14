import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

test('renderTempoCurve is exported from observatory.js', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/export function renderTempoCurve/.test(js), 'must export renderTempoCurve');
});

test('tempo curve uses lineChart from the chart toolkit', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/lineChart\(/.test(js), 'must call lineChart');
  assert.ok(js.includes('Tempo curve'), 'must label the chart "Tempo curve"');
});

test('tempo curve buckets matches by turn count', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/tempoBucket/.test(js), 'must define tempoBucket');
  assert.ok(/TEMPO_BUCKETS/.test(js), 'must define TEMPO_BUCKETS');
  // Buckets should cover early, mid, and late game
  assert.ok(js.includes("'0-5'"), 'must include 0-5 bucket');
  assert.ok(js.includes("'21+'"), 'must include 21+ bucket');
});

test('tempo curve attributes signed score margin per seat', async () => {
  const js = await src('workspaces/observatory.js');
  // policyIds[0] gets +margin, policyIds[1] gets -margin
  assert.ok(/signed = i === 0 \? margin : -margin/.test(js), 'must sign score margin by seat');
});

test('tempo curve guards against empty summaries', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/summaries\.length === 0/.test(js), 'must guard on empty summaries');
  assert.ok(/tempo-curve-empty/.test(js), 'must emit tempo-curve-empty placeholder');
});

test('renderOpeningPatterns is exported from observatory.js', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/export async function renderOpeningPatterns/.test(js), 'must export async renderOpeningPatterns');
});

test('opening patterns analyzes first 3 decisions per policy', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/first3/.test(js), 'must extract first 3 decisions');
  assert.ok(/slice\(0, 3\)/.test(js), 'must slice first 3 traces');
});

test('opening patterns uses stacked bar chart for action distribution', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/stackedBarChart\(/.test(js), 'must call stackedBarChart');
  assert.ok(/Opening action distribution/.test(js), 'must label the chart');
});

test('opening patterns computes an aggression score', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/aggression/.test(js), 'must compute aggression score');
  assert.ok(/isOffensiveAction/.test(js), 'must define isOffensiveAction');
  assert.ok(/isDefensiveAction/.test(js), 'must define isDefensiveAction');
});

test('opening patterns shows top opening sequences in table alternative', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/Opening sequence/.test(js), 'table must include opening sequence column');
  assert.ok(/topSeqs/.test(js), 'must compute top sequences');
  assert.ok(/slice\(0, 5\)/.test(js), 'must limit to top 5 sequences');
});

test('opening patterns guards against missing trace data', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/opening-patterns-empty/.test(js), 'must emit opening-patterns-empty placeholder');
  assert.ok(/No decision traces/.test(js), 'must show graceful empty message');
});

test('diagnostics workspace renders the tempo curve section', async () => {
  const js = await src('workspaces/diagnostics.js');
  assert.ok(js.includes('renderTempoCurve'), 'diagnostics must import renderTempoCurve');
  assert.ok(/tempoHtml/.test(js), 'diagnostics must render tempoHtml');
});

test('traces workspace renders the opening patterns section', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/opening-patterns-slot/.test(js), 'traces must emit opening-patterns-slot');
  assert.ok(/renderOpeningPatterns\(\)/.test(js), 'traces must call renderOpeningPatterns');
});

test('opening patterns uses existing trace data (no new data files)', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/loadTraceIndex/.test(js), 'must use loadTraceIndex');
  assert.ok(/loadTraceData/.test(js), 'must use loadTraceData');
  assert.ok(/state\.traceIndex/.test(js), 'must use state.traceIndex');
});

test('no new dependencies introduced for tempo or opening analysis', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(!/from ['"]fast-xml-parser|from ['"]csv-parse|from ['"]d3-array/i.test(js), 'must not import new analysis libraries');
});
