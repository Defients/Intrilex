// ═══════════════════════════════════════════════════════════════
// rank-anatomy-completion.test.mjs
// E2E completion tests for the Rank Anatomy Observatory workspace.
// Loads the real sample data and asserts all 5 tabs render non-empty
// HTML for multiple ranks, including edge cases (jokers, rank 9 no supers).
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderRankAnatomy } from '../apps/lab-web/src/workspaces/ranks/rank-anatomy-workspace.js';

// ── Test fixtures ─────────────────────────────────────────────────

async function loadTestData() {
  const [variantAnalyticsRaw, registryRaw] = await Promise.all([
    readFile('sample-data/observatory/variant-analytics.json', 'utf8'),
    readFile('sample-data/observatory/rank-anatomy-registry.json', 'utf8'),
  ]);
  return {
    variantAnalytics: JSON.parse(variantAnalyticsRaw),
    rankAnatomyRegistry: JSON.parse(registryRaw),
  };
}

let _testData = null;
async function getTestData() {
  if (!_testData) _testData = await loadTestData();
  return _testData;
}

// ── Helper: assert non-empty render ───────────────────────────────

function assertNonEmptyRender(html, label) {
  assert.ok(html, `${label}: render returned empty`);
  assert.ok(html.length > 100, `${label}: render too short (${html.length} chars)`);
  assert.ok(!html.includes('Rank Anatomy not available'), `${label}: variant analytics not loaded`);
}

function assertTabRenders(testData, rank, tab) {
  const html = renderRankAnatomy({
    variantAnalytics: testData.variantAnalytics,
    rankAnatomyRegistry: testData.rankAnatomyRegistry,
    selectedRank: rank,
    anatomyTab: tab,
  });
  assertNonEmptyRender(html, `Rank ${rank} / ${tab}`);
  return html;
}

// ═══════════════════════════════════════════════════════════════
// Tab render tests — all 5 tabs for a rank with full data
// ═══════════════════════════════════════════════════════════════

test('Rank Anatomy: all 5 tabs render non-empty for Rank A (full data)', async () => {
  const data = await getTestData();
  for (const tab of ['overall', 'ordinary', 'spades', 'supers', 'evidence']) {
    assertTabRenders(data, 'A', tab);
  }
});

test('Rank Anatomy: all 5 tabs render non-empty for Rank 7 (has supers)', async () => {
  const data = await getTestData();
  for (const tab of ['overall', 'ordinary', 'spades', 'supers', 'evidence']) {
    assertTabRenders(data, '7', tab);
  }
});

test('Rank Anatomy: all 5 tabs render non-empty for Rank 2 (distinct play form)', async () => {
  const data = await getTestData();
  for (const tab of ['overall', 'ordinary', 'spades', 'supers', 'evidence']) {
    assertTabRenders(data, '2', tab);
  }
});

// ═══════════════════════════════════════════════════════════════
// Edge case tests
// ═══════════════════════════════════════════════════════════════

test('Rank Anatomy: Rank 9 (no supers) renders Supers tab with "none" notice', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, '9', 'supers');
  assert.ok(html.includes('no Super effects'), 'Rank 9 should show "no Super effects" notice');
});

test('Rank Anatomy: Rank RJ (joker, no spades) renders Spades tab as not eligible', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, 'RJ', 'spades');
  assert.ok(html.includes('Not Eligible') || html.includes('not eligible'), 'RJ should show spades not eligible');
});

test('Rank Anatomy: Rank 10 (per-suit variants) renders all tabs', async () => {
  const data = await getTestData();
  for (const tab of ['overall', 'ordinary', 'spades', 'supers', 'evidence']) {
    assertTabRenders(data, '10', tab);
  }
});

// ═══════════════════════════════════════════════════════════════
// Evidence tab specific tests
// ═══════════════════════════════════════════════════════════════

test('Evidence tab: contains per-variant evidence table with sample sizes', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, 'A', 'evidence');
  assert.ok(html.includes('Per-Variant Evidence'), 'Evidence tab should have per-variant evidence table');
  assert.ok(html.includes('Policy Sens.'), 'Evidence tab should show policy sensitivity column');
  assert.ok(html.includes('Seat Sens.'), 'Evidence tab should show seat sensitivity column');
});

test('Evidence tab: contains sensitivity analysis section', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, 'A', 'evidence');
  assert.ok(html.includes('Sensitivity Analysis'), 'Evidence tab should have sensitivity analysis section');
});

test('Evidence tab: contains provenance section with aggregate hash', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, 'A', 'evidence');
  assert.ok(html.includes('Provenance'), 'Evidence tab should have provenance section');
  assert.ok(html.includes('Aggregate Hash'), 'Evidence tab should show aggregate hash');
});

test('Evidence tab: contains source links to Traces and Replays workspaces', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, 'A', 'evidence');
  assert.ok(html.includes('href="#/traces"'), 'Evidence tab should link to Traces workspace');
  assert.ok(html.includes('href="#/replays"'), 'Evidence tab should link to Replays workspace');
  assert.ok(html.includes('href="#/diagnostics"'), 'Evidence tab should link to Diagnostics workspace');
});

test('Evidence tab: contains interpretation boundary disclaimer', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, 'A', 'evidence');
  assert.ok(html.includes('Interpretation boundary'), 'Evidence tab should have interpretation boundary');
  assert.ok(html.includes('not causal claims'), 'Interpretation boundary should mention causal claims');
});

// ═══════════════════════════════════════════════════════════════
// Supers tab specific tests
// ═══════════════════════════════════════════════════════════════

test('Supers tab: contains Super Effect Inventory from registry', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, 'A', 'supers');
  assert.ok(html.includes('Super Effect Inventory'), 'Supers tab should have inventory section');
  assert.ok(html.includes('super-ace'), 'Supers tab should list super-ace effect ID');
});

test('Supers tab: shows insufficient evidence notice when no Super data', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, 'A', 'supers');
  // All Super data is zero in the current campaign
  assert.ok(
    html.includes('Insufficient Super evidence') || html.includes('No campaign data'),
    'Supers tab should show insufficient evidence notice when no Super data'
  );
});

test('Supers tab: dossiers show registry metadata (mode, kind, profiles)', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, '7', 'supers');
  assert.ok(html.includes('super-seven-topdeck'), 'Supers tab should list super-seven-topdeck effect');
  assert.ok(html.includes('Mode:'), 'Dossiers should show mode');
  assert.ok(html.includes('Kind:'), 'Dossiers should show kind');
  assert.ok(html.includes('Profiles:'), 'Dossiers should show profiles');
});

test('Supers tab: dossiers show authority refs from registry', async () => {
  const data = await getTestData();
  const html = assertTabRenders(data, 'A', 'supers');
  assert.ok(html.includes('Authority refs:'), 'Dossiers should show authority refs');
  assert.ok(html.includes('SUPER_EFFECTS'), 'Authority refs should include SUPER_EFFECTS');
});

// ═══════════════════════════════════════════════════════════════
// Profile filter tests
// ═══════════════════════════════════════════════════════════════

test('Profile filter: renders profile filter dropdown with all/advanced/unrestricted options', async () => {
  const data = await getTestData();
  const html = renderRankAnatomy({
    variantAnalytics: data.variantAnalytics,
    rankAnatomyRegistry: data.rankAnatomyRegistry,
    selectedRank: 'A',
    anatomyTab: 'overall',
  });
  assert.ok(html.includes('id="variant-profile-filter"'), 'Profile filter dropdown should be present');
  assert.ok(html.includes('core-advanced-authority'), 'Profile filter should include advanced core option');
  assert.ok(html.includes('core-unrestricted-authority'), 'Profile filter should include unrestricted core option');
});

test('Profile filter: applying core-advanced-authority changes metrics', async () => {
  const data = await getTestData();
  const allHtml = renderRankAnatomy({
    variantAnalytics: data.variantAnalytics,
    rankAnatomyRegistry: data.rankAnatomyRegistry,
    selectedRank: 'A',
    anatomyTab: 'overall',
    profileFilter: 'all',
  });
  const advHtml = renderRankAnatomy({
    variantAnalytics: data.variantAnalytics,
    rankAnatomyRegistry: data.rankAnatomyRegistry,
    selectedRank: 'A',
    anatomyTab: 'overall',
    profileFilter: 'core-advanced-authority',
  });
  assert.ok(allHtml.length > 100 && advHtml.length > 100, 'Both profile filters should render');
  // The metrics should differ when filtered (different opportunity counts)
  assert.notEqual(allHtml, advHtml, 'Profile filter should change the rendered output');
});

// ═══════════════════════════════════════════════════════════════
// Integrity banner tests
// ═══════════════════════════════════════════════════════════════

test('Integrity banner: does not show false DATA INTEGRITY FAILURE for valid data', async () => {
  const data = await getTestData();
  const html = renderRankAnatomy({
    variantAnalytics: data.variantAnalytics,
    rankAnatomyRegistry: data.rankAnatomyRegistry,
    selectedRank: 'A',
    anatomyTab: 'overall',
  });
  // The banner should NOT appear if data is clean
  assert.ok(!html.includes('DATA INTEGRITY FAILURE'), 'Clean data should not show integrity failure banner');
});

test('Integrity banner: shows failure when selections exist without opportunities', () => {
  const fakeVA = {
    schemaVersion: '1.0.0',
    variantMetrics: {
      'A': { variantOpportunityCount: 10, variantSelectionCount: 5 },
      'A:normal': { variantOpportunityCount: 0, variantSelectionCount: 5 }, // violation
    },
    rankComparisons: {
      'A': { rank: 'A', levels: {}, entityOrder: [] }
    },
    entities: [],
  };
  const fakeRegistry = {
    ranks: [{ rankId: 'A', displayName: 'A', authority: {}, spadesEligible: false, spadesVariant: { eligible: false, ineligibilityReason: 'test' }, supers: [], superEffectCount: 0 }],
  };
  const html = renderRankAnatomy({
    variantAnalytics: fakeVA,
    rankAnatomyRegistry: fakeRegistry,
    selectedRank: 'A',
    anatomyTab: 'overall',
  });
  assert.ok(html.includes('DATA INTEGRITY FAILURE'), 'Should show integrity failure for selections without opportunities');
  assert.ok(html.includes('A:normal'), 'Should mention the violating variant key');
});

// ═══════════════════════════════════════════════════════════════
// Anatomy rail tests
// ═══════════════════════════════════════════════════════════════

test('Anatomy rail: renders all 5 tab buttons with correct data attributes', async () => {
  const data = await getTestData();
  const html = renderRankAnatomy({
    variantAnalytics: data.variantAnalytics,
    rankAnatomyRegistry: data.rankAnatomyRegistry,
    selectedRank: 'A',
    anatomyTab: 'overall',
  });
  for (const tab of ['overall', 'ordinary', 'spades', 'supers', 'evidence']) {
    assert.ok(html.includes(`data-anatomy-tab="${tab}"`), `Rail should have ${tab} tab button`);
  }
});

test('Anatomy rail: active tab has active class', async () => {
  const data = await getTestData();
  const html = renderRankAnatomy({
    variantAnalytics: data.variantAnalytics,
    rankAnatomyRegistry: data.rankAnatomyRegistry,
    selectedRank: 'A',
    anatomyTab: 'spades',
  });
  assert.ok(html.includes('class="anatomy-tab active" data-anatomy-tab="spades"'), 'Spades tab should be active');
});

// ═══════════════════════════════════════════════════════════════
// Fallback / null handling tests
// ═══════════════════════════════════════════════════════════════

test('Null variant analytics: shows "not available" message', () => {
  const html = renderRankAnatomy({
    variantAnalytics: null,
    rankAnatomyRegistry: { ranks: [] },
    selectedRank: 'A',
  });
  assert.ok(html.includes('Rank Anatomy not available'), 'Should show not available message');
});

test('Unknown rank: shows "not in registry" message', async () => {
  const data = await getTestData();
  const html = renderRankAnatomy({
    variantAnalytics: data.variantAnalytics,
    rankAnatomyRegistry: data.rankAnatomyRegistry,
    selectedRank: 'ZZ',
  });
  assert.ok(html.includes('not in registry'), 'Should show not in registry message');
});

// ═══════════════════════════════════════════════════════════════
// Performance test — render must be <500ms for a single rank/tab
// ═══════════════════════════════════════════════════════════════

test('Performance: rendering all 5 tabs for a rank completes in <50ms', async () => {
  const data = await getTestData();
  const tabs = ['overall', 'ordinary', 'spades', 'supers', 'evidence'];
  // Warm up
  for (const t of tabs) {
    renderRankAnatomy({
      variantAnalytics: data.variantAnalytics,
      rankAnatomyRegistry: data.rankAnatomyRegistry,
      selectedRank: 'A',
      anatomyTab: t,
    });
  }
  // Measure
  const start = performance.now();
  for (const t of tabs) {
    renderRankAnatomy({
      variantAnalytics: data.variantAnalytics,
      rankAnatomyRegistry: data.rankAnatomyRegistry,
      selectedRank: 'A',
      anatomyTab: t,
    });
  }
  const elapsed = performance.now() - start;
  // Budget: 50ms for 5 tab renders (10ms per tab). Actual is ~0.2ms per tab.
  // The 500ms budget is for the full app render including DOM; this isolates the string builder.
  assert.ok(elapsed < 50, `5 tab renders should complete in <50ms, got ${elapsed.toFixed(2)}ms`);
});

test('Performance: rendering all 15 ranks × 5 tabs completes in <500ms', async () => {
  const data = await getTestData();
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','RJ','BJ'];
  const tabs = ['overall', 'ordinary', 'spades', 'supers', 'evidence'];
  // Warm up
  for (const r of ranks) {
    for (const t of tabs) {
      renderRankAnatomy({
        variantAnalytics: data.variantAnalytics,
        rankAnatomyRegistry: data.rankAnatomyRegistry,
        selectedRank: r,
        anatomyTab: t,
      });
    }
  }
  // Measure
  const start = performance.now();
  for (const r of ranks) {
    for (const t of tabs) {
      renderRankAnatomy({
        variantAnalytics: data.variantAnalytics,
        rankAnatomyRegistry: data.rankAnatomyRegistry,
        selectedRank: r,
        anatomyTab: t,
      });
    }
  }
  const elapsed = performance.now() - start;
  // Budget: 500ms for 75 renders (all ranks × all tabs)
  assert.ok(elapsed < 500, `75 renders should complete in <500ms, got ${elapsed.toFixed(2)}ms`);
});
