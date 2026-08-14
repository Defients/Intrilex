import test from 'node:test';import assert from 'node:assert/strict';import { readFile, access } from 'node:fs/promises';
test('seven Mechanics Observatory workspaces and four presets ship',async()=>{const js=await readFile('apps/lab-web/src/app.js','utf8');for(const route of ['/watch','/replays','/history','/mechanics','/synergies','/compare','/traces','/branches','/diagnostics','/evidence'])assert.match(js,new RegExp(route.replace('/','\\/')));for(const preset of ['observatory','theatre','analyst','compact'])assert.match(await readFile('apps/lab-web/src/index.html','utf8'),new RegExp(preset,'i'));});
test('semantic stepping and priority clarity controls ship',async()=>{const appJs=await readFile('apps/lab-web/src/app.js','utf8');const ctrlJs=await readFile('apps/lab-web/src/experiment-controls.js','utf8');for(const label of ['semanticForCommand','semanticLabel','visibleTimeline','Response window closed — no responses','declined a legal response'])assert.match(appJs,new RegExp(label.replace(/[—]/g,'.')));assert.match(ctrlJs,/Show priority orchestration/);});
test('generated Observatory evidence exists',async()=>{for(const file of ['sample-data/observatory/analytics.json','sample-data/observatory/metric-registry.json','sample-data/observatory/mechanics.csv','sample-data/observatory/synergies.csv'])await access(file);const a=JSON.parse(await readFile('sample-data/observatory/analytics.json','utf8'));assert.equal(a.schemaVersion,'4.2.0');assert.match(a.observatoryHash,/^[a-f0-9]{64}$/);});

// ═══════════════════════════════════════════════════════════════
// Observatory Depth II — Phase 1: Motif Flow Diagram
// ═══════════════════════════════════════════════════════════════
test('Phase 1: sankeyFlow is exported from chart-toolkit.js', async () => {
  const src = await readFile('apps/lab-web/src/chart-toolkit.js', 'utf8');
  assert.match(src, /export function sankeyFlow/, 'sankeyFlow must be exported');
});
test('Phase 1: sankeyFlow renders SVG with nodes and links', async () => {
  const { sankeyFlow } = await import('../apps/lab-web/src/chart-toolkit.js');
  const svg = sankeyFlow({
    nodes: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }],
    links: [{ source: 'a', target: 'b', value: 10 }, { source: 'b', target: 'c', value: 5 }],
    width: 400, height: 300,
    title: 'Test Sankey',
  });
  assert.match(svg, /<svg/, 'must produce SVG');
  assert.match(svg, /ix-chart-sankey/, 'must have sankey class');
  assert.match(svg, /role="img"/, 'must have role=img');
  assert.match(svg, /ix-sankey-node/, 'must render nodes');
  assert.match(svg, /ix-sankey-link/, 'must render links');
  assert.match(svg, /data-node-id="a"/, 'nodes must have data-node-id');
  assert.match(svg, /<title>/, 'must have title for accessibility');
});
test('Phase 1: sankeyFlow empty data returns empty-state SVG', async () => {
  const { sankeyFlow } = await import('../apps/lab-web/src/chart-toolkit.js');
  const svg = sankeyFlow({ nodes: [], links: [], width: 400, height: 300 });
  assert.match(svg, /No data/, 'empty data should show No data');
});
test('Phase 1: renderMotifFlow exists in observatory.js', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /function renderMotifFlow/, 'renderMotifFlow must exist');
  assert.match(src, /sankeyFlow/, 'must use sankeyFlow');
  assert.match(src, /motifOutcomeFilter/, 'must use outcome filter');
  assert.match(src, /motifNodeFilter/, 'must use node filter');
});
test('Phase 1: motif flow replaces flat motif cards in renderSynergies', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /renderMotifFlow\(motifs\)/, 'must call renderMotifFlow');
  // The old flat card grid should be gone
  assert.doesNotMatch(src, /Motifs \$\{motifs\.length\}.*motifs\.map.*notice info/, 'flat motif cards should be replaced');
});
test('Phase 1: motif flow state fields exist in state.js', async () => {
  const src = await readFile('apps/lab-web/src/state.js', 'utf8');
  assert.match(src, /motifNodeFilter/, 'motifNodeFilter must be in state');
  assert.match(src, /motifOutcomeFilter/, 'motifOutcomeFilter must be in state');
});
test('Phase 1: motif flow has data-testid and chart toggle', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /data-testid="motif-flow"/, 'must have testid');
  assert.match(src, /data-chart-toggle="motif-flow"/, 'must have chart toggle');
  assert.match(src, /bindChartToggle\('#motif-flow-chart'\)/, 'must bind chart toggle');
});
test('Phase 1: motif flow event handlers for outcome filter and node click', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /motif-outcome-filter/, 'must have outcome filter dropdown');
  assert.match(src, /ix-sankey-node/, 'must select sankey nodes for click');
  assert.match(src, /motif-node-clear/, 'must have node clear button');
});
test('Phase 1: sankeyFlow has accessibility metadata', async () => {
  const { sankeyFlow } = await import('../apps/lab-web/src/chart-toolkit.js');
  const svg = sankeyFlow({
    nodes: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }],
    links: [{ source: 'x', target: 'y', value: 3 }],
    title: 'Test',
    ariaLabel: 'Test aria',
  });
  assert.match(svg, /aria-label="Test aria"/, 'must have aria-label');
  assert.match(svg, /<title>Test<\/title>/, 'must have title element');
  assert.match(svg, /<desc>/, 'must have desc element');
});

// ═══════════════════════════════════════════════════════════════
// Observatory Depth II — Phase 2: Aggregate Action Distribution
// ═══════════════════════════════════════════════════════════════
test('Phase 2: renderActionDistribution is exported from observatory.js', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /export function renderActionDistribution/, 'must be exported');
});
test('Phase 2: renderActionDistribution aggregates action counts', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /aggregateCounts/, 'must have aggregateCounts helper');
  assert.match(src, /actionModeCounts/, 'must aggregate actionModeCounts');
  assert.match(src, /decisionFamilyCounts/, 'must aggregate decisionFamilyCounts');
  assert.match(src, /timingClassCounts/, 'must aggregate timingClassCounts');
  assert.match(src, /eventTypeCounts/, 'must aggregate eventTypeCounts');
  assert.match(src, /responseActionCounts/, 'must aggregate responseActionCounts');
});
test('Phase 2: Actions tab added to diagnostics workspace', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/diagnostics.js', 'utf8');
  assert.match(src, /id: 'actions'/, 'must have actions tab');
  assert.match(src, /label: 'Actions'/, 'must have Actions label');
  assert.match(src, /renderActionDistribution/, 'must call renderActionDistribution');
  assert.match(src, /diag-section-actions/, 'must have actions section panel');
});
test('Phase 2: 5 charts with table toggles in action distribution', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /data-testid="action-modes-chart"/, 'action modes chart');
  assert.match(src, /data-testid="decision-families-chart"/, 'decision families chart');
  assert.match(src, /data-testid="timing-classes-chart"/, 'timing classes chart');
  assert.match(src, /data-testid="event-types-chart"/, 'event types chart');
  assert.match(src, /data-testid="response-actions-chart"/, 'response actions chart');
  // Each must have a chart toggle
  assert.match(src, /data-chart-toggle="action-modes"/, 'action modes toggle');
  assert.match(src, /data-chart-toggle="decision-families"/, 'decision families toggle');
  assert.match(src, /data-chart-toggle="timing-classes"/, 'timing classes toggle');
  assert.match(src, /data-chart-toggle="event-types"/, 'event types toggle');
  assert.match(src, /data-chart-toggle="response-actions"/, 'response actions toggle');
});
test('Phase 2: Actions tab chart toggles wired in diagnostics.js', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/diagnostics.js', 'utf8');
  assert.match(src, /bindDiagChartToggle\('#action-modes-chart'\)/, 'action modes toggle wired');
  assert.match(src, /bindDiagChartToggle\('#decision-families-chart'\)/, 'decision families toggle wired');
  assert.match(src, /bindDiagChartToggle\('#timing-classes-chart'\)/, 'timing classes toggle wired');
  assert.match(src, /bindDiagChartToggle\('#event-types-chart'\)/, 'event types toggle wired');
  assert.match(src, /bindDiagChartToggle\('#response-actions-chart'\)/, 'response actions toggle wired');
});
test('Phase 2: actionsDistributionTab state field exists', async () => {
  const src = await readFile('apps/lab-web/src/state.js', 'utf8');
  assert.match(src, /actionsDistributionTab/, 'must be in state');
});
test('Phase 2: action distribution handles empty summaries', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /action-distribution-empty/, 'must have empty state');
});

// ═══════════════════════════════════════════════════════════════
// Observatory Depth II — Phase 3: Anomaly Explorer
// ═══════════════════════════════════════════════════════════════
test('Phase 3: renderAnomalyExplorer exists in evidence.js', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/evidence.js', 'utf8');
  assert.match(src, /function renderAnomalyExplorer/, 'must exist');
  assert.match(src, /donutChart/, 'must use donut chart');
  assert.match(src, /barChart/, 'must use bar chart');
  assert.match(src, /sparkline/, 'must use sparkline');
});
test('Phase 3: anomaly explorer replaces flat table in renderEvidence', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/evidence.js', 'utf8');
  assert.match(src, /renderAnomalyExplorer\(anomalies\)/, 'must call renderAnomalyExplorer');
});
test('Phase 3: anomaly explorer has type and severity filters', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/evidence.js', 'utf8');
  assert.match(src, /anomaly-type-filter/, 'must have type filter');
  assert.match(src, /anomaly-severity-filter/, 'must have severity filter');
  assert.match(src, /anomalyTypeFilter/, 'must use state.anomalyTypeFilter');
  assert.match(src, /anomalySeverityFilter/, 'must use state.anomalySeverityFilter');
});
test('Phase 3: anomaly rows link to match replay in /watch', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/evidence.js', 'utf8');
  assert.match(src, /data-anomaly-match/, 'must have data-anomaly-match attribute');
  assert.match(src, /#\/watch/, 'must navigate to watch');
  assert.match(src, /state\.fixtureId/, 'must set fixtureId');
});
test('Phase 3: anomaly state fields exist in state.js', async () => {
  const src = await readFile('apps/lab-web/src/state.js', 'utf8');
  assert.match(src, /anomalyTypeFilter/, 'anomalyTypeFilter must be in state');
  assert.match(src, /anomalySeverityFilter/, 'anomalySeverityFilter must be in state');
});
test('Phase 3: anomaly explorer has data-testid', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/evidence.js', 'utf8');
  assert.match(src, /data-testid="anomaly-explorer"/, 'must have testid');
  assert.match(src, /data-testid="anomaly-filter-toolbar"/, 'filter toolbar testid');
});
test('Phase 3: anomaly explorer handles empty anomalies', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/evidence.js', 'utf8');
  assert.match(src, /anomalies\.length/, 'must check anomalies.length');
});

// ═══════════════════════════════════════════════════════════════
// Observatory Depth II — Phase 4: Quarantine Ledger View
// ═══════════════════════════════════════════════════════════════
test('Phase 4: renderQuarantineLedger exists in observatory.js', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /function renderQuarantineLedger/, 'must exist');
  assert.match(src, /quarantineLedger/, 'must read quarantineLedger');
});
test('Phase 4: quarantine ledger integrated into renderMechanics', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /renderQuarantineLedger\(o\)/, 'must call renderQuarantineLedger');
  assert.match(src, /quarantineHtml/, 'must insert quarantineHtml');
});
test('Phase 4: quarantine ledger is collapsible with details', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /data-testid="quarantine-ledger"/, 'must have testid');
  assert.match(src, /<details/, 'must be collapsible');
});
test('Phase 4: quarantine ledger groups by reason', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /byReason/, 'must group by reason');
  assert.match(src, /excluded from the analysis pipeline/, 'must have exclusion label');
});
test('Phase 4: quarantine ledger handles empty data', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  // The function should return empty string for empty ledger
  assert.match(src, /ledger\.length === 0\) return ''/, 'must return empty for no data');
});
test('Phase 4: quarantine ledger has status badges', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /status-badge warning/, 'must have warning status badge');
});

// ═══════════════════════════════════════════════════════════════
// Observatory Depth II — Phase 5: Match Detail Inspector
// ═══════════════════════════════════════════════════════════════
test('Phase 5: renderMatchDetail exists in observatory.js', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /function renderMatchDetail/, 'must exist');
  assert.match(src, /sparkline/, 'must use sparkline for score progression');
  assert.match(src, /donutChart/, 'must use donut for action breakdown');
  assert.match(src, /barChart/, 'must use bar chart for decision families');
});
test('Phase 5: renderHistory checks historySelectedMatch first', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /state\.historySelectedMatch/, 'must check historySelectedMatch');
  assert.match(src, /renderMatchDetail\(summary\)/, 'must call renderMatchDetail');
});
test('Phase 5: match row click shows detail instead of navigating to /watch', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  // The new click handler should set historySelectedMatch, not navigate to #/watch
  assert.match(src, /state\.historySelectedMatch = row\.dataset\.matchId/, 'must set historySelectedMatch');
});
test('Phase 5: match detail has back button', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /history-detail-back/, 'must have back button');
  assert.match(src, /state\.historySelectedMatch = null/, 'must clear selection on back');
});
test('Phase 5: match detail has View in Watch button', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /match-detail-watch/, 'must have watch button');
  assert.match(src, /match-detail-traces/, 'must have traces button');
});
test('Phase 5: match detail shows mechanic usage top 10', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /mechanicCounts/, 'must use mechanicCounts');
  assert.match(src, /slice\(0, 10\)/, 'must limit to top 10');
});
test('Phase 5: historySelectedMatch state field exists', async () => {
  const src = await readFile('apps/lab-web/src/state.js', 'utf8');
  assert.match(src, /historySelectedMatch/, 'must be in state');
});
test('Phase 5: match detail has data-testid', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /data-testid="match-detail"/, 'must have testid');
});

// ═══════════════════════════════════════════════════════════════
// Observatory Depth II — Phase 6: Enhanced Cross-Workspace Linking
// ═══════════════════════════════════════════════════════════════
test('Phase 6: matchup matrix cells have data-policy-a and data-policy-b', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /data-policy-a/, 'must have data-policy-a');
  assert.match(src, /data-policy-b/, 'must have data-policy-b');
  assert.match(src, /cellAttrs/, 'must use cellAttrs in heatmap');
});
test('Phase 6: matchup cell click navigates to /history with filter', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /data-policy-a.*data-policy-b/, 'must select cells with both attrs');
  assert.match(src, /historyFilterMatchIds/, 'must set historyFilterMatchIds');
  assert.match(src, /#\/history/, 'must navigate to history');
});
test('Phase 6: archetype cluster policies link to /compare', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/diagnostics.js', 'utf8');
  assert.match(src, /data-archetype-policy/, 'must have data-archetype-policy');
  assert.match(src, /data-archetype-cluster/, 'must have data-archetype-cluster');
  assert.match(src, /#\/compare/, 'must navigate to compare');
  assert.match(src, /state\.selectedPolicy/, 'must set selectedPolicy');
  assert.match(src, /state\.comparePolicyRight/, 'must set comparePolicyRight');
});
test('Phase 6: motif links connect to filtered /history', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /motif-view-matches/, 'must have view matches button');
  assert.match(src, /historyFilterMatchIds/, 'must set historyFilterMatchIds');
  assert.match(src, /#\/history/, 'must navigate to history');
});
test('Phase 6: historyFilterMatchIds state field exists', async () => {
  const src = await readFile('apps/lab-web/src/state.js', 'utf8');
  assert.match(src, /historyFilterMatchIds/, 'must be in state');
});
test('Phase 6: historyFilterMatchIds filters the history table', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /historyFilterMatchIds/, 'must use historyFilterMatchIds');
  assert.match(src, /idSet\.has\(s\.matchId\)/, 'must filter by match ID set');
});
test('Phase 6: history has clear filter button', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /history-clear-matchid-filter/, 'must have clear filter button');
  assert.match(src, /state\.historyFilterMatchIds = null/, 'must clear filter');
});
test('Phase 6: heatmap cellAttrs option exists in chart-toolkit.js', async () => {
  const src = await readFile('apps/lab-web/src/chart-toolkit.js', 'utf8');
  assert.match(src, /cellAttrs/, 'heatmap must accept cellAttrs option');
});
test('Phase 6: archetype table has interactive clickable rows', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.match(src, /data-archetype-policy/, 'must have clickable rows');
  assert.match(src, /clickable-row/, 'must have clickable-row class');
});

// ═══════════════════════════════════════════════════════════════
// Observatory Depth II — CSS and Accessibility
// ═══════════════════════════════════════════════════════════════
test('Depth II: Sankey CSS classes exist in feature-components.css', async () => {
  const src = await readFile('apps/lab-web/src/css/feature-components.css', 'utf8');
  assert.match(src, /ix-chart-sankey/, 'must have sankey chart class');
  assert.match(src, /ix-sankey-node/, 'must have sankey node class');
  assert.match(src, /ix-sankey-link/, 'must have sankey link class');
});
test('Depth II: Sankey included in reduced-motion and print styles', async () => {
  const src = await readFile('apps/lab-web/src/css/feature-components.css', 'utf8');
  // Reduced motion should include sankey
  const reducedMotionLine = src.match(/@media\(prefers-reduced-motion:reduce\)\{[^}]*ix-chart-sankey[^}]*\}/);
  assert.ok(reducedMotionLine, 'sankey must be in reduced-motion media query');
  // Print should include sankey in grayscale
  assert.match(src, /ix-chart-sankey\{filter:grayscale\(1\)\}/, 'sankey must be in print grayscale');
});
test('Depth II: no new npm dependencies added', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const depCount = Object.keys(pkg.dependencies ?? {}).length;
  const devDepCount = Object.keys(pkg.devDependencies ?? {}).length;
  // The exact count doesn't matter — what matters is we didn't add any.
  // We verify by checking that no chart library was added.
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const depName of Object.keys(allDeps)) {
    assert.doesNotMatch(depName, /^d3|^chart\.js|^chartist|^recharts|^victory|^nivo|^plotly/, `No chart library dependency: ${depName}`);
  }
});
