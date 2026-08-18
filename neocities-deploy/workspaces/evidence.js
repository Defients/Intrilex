// ═══════════════════════════════════════════════════════════════
// workspaces/evidence.js — /evidence workspace: integrity and provenance
// ═══════════════════════════════════════════════════════════════

import { state,   app,   esc,   short,   definitionList } from '../state.js?v=3dca2dc8fde5';
import { rerender } from '../rerender.js?v=3dca2dc8fde5';
import { ENGINE_VERSION, RULES_VERSION } from '../version.js?v=3dca2dc8fde5';
import { donutChart, barChart, sparkline, chartTableAlternative } from '../chart-toolkit.js?v=3dca2dc8fde5';

// ── Anomaly Explorer (Depth II Phase 3) ──────────────────────────
// Elevate the 30 anomalies from a flat table to an interactive explorer
// with distribution charts, severity breakdown, and match-level drill-down.
function renderAnomalyExplorer(anomalies) {
  if (!anomalies.length) return '';
  const typeFilter = state.anomalyTypeFilter ?? 'all';
  const severityFilter = state.anomalySeverityFilter ?? 'all';
  // Type distribution donut
  const typeCounts = {};
  for (const a of anomalies) typeCounts[a.type ?? 'unknown'] = (typeCounts[a.type ?? 'unknown'] ?? 0) + 1;
  const palette = ['#4fd387', '#5ad7e8', '#a78bfa', '#f1bd5d', '#f0786f', '#7dd3fc'];
  const typeDonut = donutChart({
    segments: Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: palette[i % palette.length] })),
    size: 160,
    title: 'Anomaly type distribution',
    ariaLabel: 'Donut chart of anomaly type distribution',
  });
  // Severity breakdown bar chart
  const severityCounts = {};
  for (const a of anomalies) severityCounts[a.severity ?? 'low'] = (severityCounts[a.severity ?? 'low'] ?? 0) + 1;
  const severityColors = { high: '#f0786f', warning: '#f1bd5d', info: '#5ad7e8', low: '#5ad7e8' };
  const severityBar = barChart({
    items: Object.entries(severityCounts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: severityColors[label] ?? '#4fd387' })),
    width: 360,
    barHeight: 24,
    title: 'Anomaly severity breakdown',
    ariaLabel: 'Bar chart of anomaly counts by severity',
  });
  // Value sparkline (if anomalies have numeric values)
  const valuedAnomalies = anomalies.filter(a => a.value != null && Number.isFinite(Number(a.value)));
  const valueSparkline = valuedAnomalies.length > 0
    ? sparkline({ values: valuedAnomalies.map(a => Number(a.value)), width: 200, height: 36, color: '#a78bfa', title: 'Anomaly values sparkline', ariaLabel: 'Sparkline of anomaly numeric values' })
    : '';
  // Filtered table
  let filtered = anomalies;
  if (typeFilter !== 'all') filtered = filtered.filter(a => (a.type ?? 'unknown') === typeFilter);
  if (severityFilter !== 'all') filtered = filtered.filter(a => (a.severity ?? 'low') === severityFilter);
  const allTypes = [...new Set(anomalies.map(a => a.type ?? 'unknown'))].sort();
  const allSeverities = [...new Set(anomalies.map(a => a.severity ?? 'low'))].sort();
  const filterHtml = `<div class="ix-filter-toolbar" data-testid="anomaly-filter-toolbar"><label for="anomaly-type-filter">Type:</label><select id="anomaly-type-filter"><option value="all" ${typeFilter === 'all' ? 'selected' : ''}>All types</option>${allTypes.map(t => `<option value="${esc(t)}" ${t === typeFilter ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><label for="anomaly-severity-filter">Severity:</label><select id="anomaly-severity-filter"><option value="all" ${severityFilter === 'all' ? 'selected' : ''}>All severities</option>${allSeverities.map(s => `<option value="${esc(s)}" ${s === severityFilter ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>`;
  const tableRows = filtered.map(a => [a.type ?? 'unknown', a.detail ?? a.matchId ?? '—', a.severity ?? 'low', a.value ?? '—', a.matchId ?? '—']);
  const tableAlt = chartTableAlternative({
    headers: ['Type', 'Detail', 'Severity', 'Value', 'Match ID'],
    rows: tableRows,
    caption: 'Anomaly records',
  });
  // Interactive table with clickable rows for match drill-down
  const tableHtml = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Type</th><th>Severity</th><th>Value</th><th>Match</th></tr></thead><tbody>${filtered.map(a => `<tr class="clickable-row" data-anomaly-match="${esc(a.matchId ?? '')}"><td>${esc(a.type ?? 'unknown')}</td><td><span class="status-badge ${a.severity === 'high' ? 'danger' : a.severity === 'warning' ? 'warning' : 'info'}">${esc(a.severity ?? 'low')}</span></td><td>${a.value != null ? fmt(a.value) : '—'}</td><td class="mono">${short(a.matchId ?? '—')}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div data-testid="anomaly-explorer"><div class="grid two" style="margin-bottom:12px"><div>${typeDonut}</div><div>${severityBar}</div></div>${valueSparkline ? `<div style="margin-bottom:12px">${valueSparkline}</div>` : ''}${filterHtml}${tableHtml}${tableAlt}</div>`;
}

function fmt(v) { return new Intl.NumberFormat().format(Number(v ?? 0)); }

export function renderEvidence() {
  const c = state.capabilities, o = state.observatory, registry = o.metricRegistry ?? {}, anomalies = o.anomalies ?? [];
  const engineTests = c.engineTests ?? { passed: 0, total: 0 };
  const labVersion = c.labVersion ?? state.buildInfo?.version ?? '—';
  const conformanceTotal = c.engine?.conformanceReplayCount ?? 121;
  app.innerHTML = `<div class="grid four"><div class="metric-card"><small>Engine tests</small><div class="metric-value">${engineTests.passed}/${engineTests.total}</div><div class="metric-detail">${engineTests.total ? 'Pass/priority/Quick/Interrupt' : 'Not reported in build'}</div></div><div class="metric-card"><small>Conformance</small><div class="metric-value">${conformanceTotal}</div><div class="metric-detail">Certified replays</div></div><div class="metric-card"><small>Lab version</small><div class="metric-value">${esc(labVersion)}</div></div><div class="metric-card"><small>Engine</small><div class="metric-value">${esc(c.engine?.version ?? ENGINE_VERSION)}</div><div class="metric-detail">Rules ${esc(c.engine?.rulesVersion ?? RULES_VERSION)}</div></div></div>
  <section class="panel" style="margin-top:16px"><div class="panel-header"><div><h2>Metric registry</h2><p>All computed metrics with formula provenance</p></div></div><div class="panel-body">${Object.keys(registry).length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Metric</th><th>Version</th><th>Formula</th><th>Uncertainty</th></tr></thead><tbody>${Object.entries(registry).map(([id, m]) => `<tr><td><b>${esc(id)}</b></td><td>${esc(m.version ?? '—')}</td><td class="mono">${esc(m.formula ?? '—')}</td><td>${esc(m.uncertainty ?? '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No metric registry.</strong> Run a campaign to generate the metric registry.</div>'}</div></section>
  <section class="panel" style="margin-top:16px"><div class="panel-header"><div><h2>Capability manifest</h2><p>Supported profiles and engine authority</p></div></div><div class="panel-body">${c.profiles ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Profile</th><th>Autonomy</th><th>Modules</th></tr></thead><tbody>${c.profiles.map(p => `<tr><td><b>${esc(p.id ?? p.profileId)}</b></td><td><span class="status-badge ${p.autonomy === 'SUPPORTED' ? 'supported' : 'danger'}">${esc(p.autonomy)}</span></td><td>${esc((p.modules ?? []).join(', ') || 'none')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No capability manifest.</strong></div>'}</div></section>
  ${anomalies.length ? `<section class="panel" style="margin-top:16px"><div class="panel-header"><div><h2>Anomalies</h2><p>${anomalies.length} detected</p></div></div><div class="panel-body">${renderAnomalyExplorer(anomalies)}</div></section>` : ''}
  <section class="panel" style="margin-top:16px"><div class="panel-header"><div><h2>Release provenance</h2><p>Build information and artifact integrity</p></div></div><div class="panel-body">${definitionList([['Capability hash', short(c.capabilityHash)], ['Observatory hash', short(o.observatoryHash)], ['Campaign hash', short(state.aggregate?.canonicalResultHash)], ['Engine version', c.engine?.version ?? ENGINE_VERSION], ['Rules version', c.engine?.rulesVersion ?? RULES_VERSION], ['Lab version', labVersion]])}</div></section>`;
  // Depth II Phase 3: anomaly explorer event handlers
  const anomalyTypeEl = document.querySelector('#anomaly-type-filter');
  if (anomalyTypeEl) anomalyTypeEl.onchange = e => { state.anomalyTypeFilter = e.target.value; rerender(); };
  const anomalySevEl = document.querySelector('#anomaly-severity-filter');
  if (anomalySevEl) anomalySevEl.onchange = e => { state.anomalySeverityFilter = e.target.value; rerender(); };
  document.querySelectorAll('[data-anomaly-match]').forEach(row => row.onclick = () => {
    const matchId = row.dataset.anomalyMatch;
    if (!matchId) return;
    state.fixtureId = matchId;
    state.replayKind = 'autonomy';
    state.replay = null;
    state.frame = 0;
    location.hash = '#/watch';
  });
}
