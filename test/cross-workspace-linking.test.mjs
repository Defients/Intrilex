import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

test('mechanic detail view contains a "View synergies" cross-link button', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(js.includes('mechanic-view-synergies'), 'must emit mechanic-view-synergies button');
  assert.ok(/View synergies involving this mechanic/.test(js), 'must label the button with "View synergies involving this mechanic"');
  assert.ok(js.includes("location.hash = '#/synergies'"), 'must navigate to /synergies');
  assert.ok(js.includes('state.synergiesMechanicFilter'), 'must set the synergies mechanic filter state');
});

test('rank profile view contains a "View mechanics for this rank" button', async () => {
  const js = await src('workspaces/ranks.js');
  assert.ok(js.includes('rank-view-mechanics'), 'must emit rank-view-mechanics button');
  assert.ok(/View mechanics for this rank/.test(js), 'must label the button with "View mechanics for this rank"');
  assert.ok(js.includes("location.hash = '#/mechanics'"), 'must navigate to /mechanics');
  assert.ok(js.includes('state.mechanicsRankFilter'), 'must set the mechanics rank filter state');
});

test('tournament analytics contains compare-navigation buttons', async () => {
  const js = await src('workspaces/tournament.js');
  assert.ok(js.includes('data-compare-policy'), 'must emit data-compare-policy rows');
  assert.ok(js.includes("location.hash = '#/compare'"), 'must navigate to /compare');
  assert.ok(js.includes('state.selectedPolicy'), 'must set the selected policy state');
});

test('state.js declares the new cross-workspace filter fields', async () => {
  const js = await src('state.js');
  for (const field of [
    'mechanicsRankFilter', 'mechanicsEvidenceFilter', 'mechanicsMinSelections',
    'synergiesMechanicFilter', 'synergiesDirectionFilter', 'synergiesMinCohort',
  ]) {
    assert.ok(js.includes(field), `state must declare ${field}`);
  }
});

test('mechanics toolbar includes rank, evidence, and min-selections filter controls', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(js.includes('mechanics-rank-filter'), 'must emit mechanics-rank-filter select');
  assert.ok(js.includes('mechanics-evidence-filter'), 'must emit mechanics-evidence-filter select');
  assert.ok(js.includes('mechanics-min-selections'), 'must emit mechanics-min-selections range input');
  assert.ok(js.includes('ix-filter-toolbar'), 'must use ix-filter-toolbar class');
});

test('synergies toolbar includes mechanic, direction, and min-cohort filter controls', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(js.includes('synergies-mechanic-filter'), 'must emit synergies-mechanic-filter select');
  assert.ok(js.includes('synergies-direction-filter'), 'must emit synergies-direction-filter select');
  assert.ok(js.includes('synergies-min-cohort'), 'must emit synergies-min-cohort range input');
});

test('mechanics filtering applies rank, evidence, and min-selections filters', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/rankFilter !== 'all'/.test(js), 'must apply rank filter');
  assert.ok(/evidenceFilter !== 'all'/.test(js), 'must apply evidence filter');
  assert.ok(/minSelections > 0/.test(js), 'must apply min-selections filter');
});

test('synergies filtering applies mechanic, direction, and min-cohort filters', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/mechanicFilter !== 'all'/.test(js), 'must apply mechanic filter');
  assert.ok(/directionFilter !== 'all'/.test(js), 'must apply direction filter');
  assert.ok(/minCohort > 0/.test(js), 'must apply min-cohort filter');
});

test('cross-workspace links use the ix-cross-link class for consistent styling', async () => {
  const jsObs = await src('workspaces/observatory.js');
  const jsRanks = await src('workspaces/ranks.js');
  assert.ok(jsObs.includes('ix-cross-link'), 'observatory cross-link must use ix-cross-link class');
  assert.ok(jsRanks.includes('ix-cross-link'), 'ranks cross-link must use ix-cross-link class');
});
