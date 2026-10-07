// ═══════════════════════════════════════════════════════════════
// workspaces/combo-atlas.js — ⚡ Combo Atlas
// First-class canonical Combo analytics (rulebook §8): usage,
// recipe matrix, component map, lifecycle, and policy propensity.
// Data: state.observatory.combo — produced by buildComboAtlas from
// authoritative combo telemetry (or the rankDecisions fallback).
// ═══════════════════════════════════════════════════════════════

import { state, app, esc, fmt, pct } from '../state.js?v=943d1ec6c237';
import { barChart, donutChart, sankeyFlow, chartTableAlternative, sparkline } from '../chart-toolkit.js?v=943d1ec6c237';
import { obsContextStrip, metricStrip } from './observatory-ui.js?v=943d1ec6c237';
import { labDatasetBanner } from './observatory.js?v=943d1ec6c237';
import { rerender } from '../rerender.js?v=943d1ec6c237';

const na = '<span class="metric-na" title="Unavailable in this dataset or engine build">n/a</span>';
const rateFmt = (v) => (v == null || !Number.isFinite(v) ? na : pct(v));
const ppFmt = (v) => (v == null || !Number.isFinite(v) ? na : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}pp`);

const LIFECYCLE_ORDER = ['resolved', 'countered', 'fizzled', 'broken', 'pending', 'unobserved'];
// `unobserved` = declared records whose resolution was never tracked (legacy datasets).
const LIFECYCLE_LABEL = { resolved: 'Resolved', countered: 'Countered', fizzled: 'Fizzled', broken: 'Broken (4♥)', pending: 'Pending', unobserved: 'Unobserved' };
const LIFECYCLE_COLOR = { resolved: '#4fd387', countered: '#f0a35e', fizzled: '#e05d5d', broken: '#c07ce8', pending: '#8a94a6', unobserved: '#5c6575' };
const COUNTER_LABEL = { 'king-spade-counter': 'K♠ counter', 'super-ace-counter': '⭐A counter', 'ultra-three-red': '🌠3R counter' };
const counterLabel = (kind) => COUNTER_LABEL[kind] ?? kind ?? 'unknown';

function comboCoverageNotice(c) {
  const cov = c.coverage ?? {};
  const notes = [];
  if (cov.lifecycleStatus === 'partial') notes.push(`Lifecycle coverage is partial — ${fmt(cov.lifecycleCoveredMatches)}/${fmt(cov.matches)} matches carry Combo telemetry.`);
  if (cov.lifecycleStatus === 'unavailable') notes.push('Lifecycle unavailable — this dataset predates Combo telemetry; only opportunities and declarations are measured.');
  if (cov.brokenStatus === 'unavailable') notes.push('Broken (4♥ Combo Breaker) is unavailable — the engine build has no breaker implementation; it is never inferred from counters or failures.');
  if (!notes.length) return '';
  return `<div class="notice warning" data-testid="combo-coverage-notice"><strong>Coverage disclosure:</strong> ${notes.map((n) => esc(n)).join(' ')}</div>`;
}

function kpiStrip(c) {
  const t = c.totals ?? {};
  return metricStrip([
    { label: 'Combos', value: fmt(t.declarations ?? 0), sub: `${fmt(t.gamesWithCombo ?? 0)} games with ≥1` },
    { label: 'Legal opportunities', value: fmt(t.opportunities ?? 0), sub: 'frames with a legal Combo' },
    { label: 'Pick rate', value: t.pickRate == null ? 'n/a' : pct(t.pickRate), sub: 'declarations / legal opportunities' },
    { label: 'Resolve rate', value: t.resolveRate == null ? 'n/a' : pct(t.resolveRate), sub: t.resolveRate == null ? 'lifecycle not covered' : 'of settled declarations', tone: t.resolveRate != null ? 'lead' : null },
    { label: 'Countered', value: fmt(t.countered ?? 0), sub: 'counter authority (incl. K♠)' },
    { label: 'Broken', value: 'n/a', sub: '4♥ breaker unimplemented', tone: 'alert' },
  ]);
}

function funnelHtml(c) {
  const f = c.funnel ?? {};
  const stages = [
    { label: 'Legal opportunities', value: f.opportunities ?? 0 },
    { label: 'Declared', value: f.declared ?? 0 },
    { label: 'Uncountered', value: f.uncountered ?? 0 },
    { label: 'Resolved', value: f.resolved ?? 0 },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));
  const unobserved = (c.lifecycle?.counts?.unobserved) ?? 0;
  const branch = (label, value, color, note) => `<div class="combo-funnel-branch" style="border-left-color:${color}"><b>${esc(label)}</b> ${fmt(value)}${note ? ` <small>${esc(note)}</small>` : ''}</div>`;
  return `<div class="combo-funnel" data-testid="combo-funnel">${stages.map((s, i) => `<div class="combo-funnel-stage"><span class="combo-funnel-label">${esc(s.label)}</span><span class="combo-funnel-bar" style="width:${(s.value / max) * 100}%">${fmt(s.value)}</span></div>${i < stages.length - 1 ? '<div class="combo-funnel-arrow" aria-hidden="true">↓</div>' : ''}`).join('')}<div class="combo-funnel-exits">${branch('Countered', f.countered ?? 0, LIFECYCLE_COLOR.countered)}${branch('Broken by 4♥', f.broken ?? 0, LIFECYCLE_COLOR.broken, 'unavailable in this engine build')}${branch('Validation failure', f.fizzled ?? 0, LIFECYCLE_COLOR.fizzled)}${unobserved > 0 ? branch('Unobserved lifecycle', unobserved, LIFECYCLE_COLOR.unobserved, 'declared before combo telemetry — resolution not retained') : ''}</div></div>`;
}

function overviewHtml(c) {
  const dist = Object.entries(c.committedDistribution ?? {}).map(([k, v]) => ({ label: `${k} cards`, value: v }));
  const lifecycle = c.lifecycle?.counts ?? {};
  const donut = LIFECYCLE_ORDER.filter((k) => (lifecycle[k] ?? 0) > 0 || k === 'broken')
    .map((k) => ({ label: k === 'broken' ? `${LIFECYCLE_LABEL[k]} — n/a` : LIFECYCLE_LABEL[k], value: lifecycle[k] ?? 0, color: LIFECYCLE_COLOR[k] }));
  const trendValues = (c.trends ?? []).map((t) => t.declarations);
  return `<div class="grid two">
    <div class="ct-well"><h3>Opportunity → resolution funnel</h3>${funnelHtml(c)}</div>
    <div class="ct-well"><h3>Committed-card-count distribution</h3>${dist.length ? barChart({ items: dist, ariaLabel: 'Committed cards per Combo' }) : '<div class="notice">No Combo declarations recorded.</div>'}<h3 style="margin-top:16px">Declarations per match</h3>${trendValues.length ? sparkline({ values: trendValues, ariaLabel: 'Combo declarations per match' }) : '<div class="notice">No matches.</div>'}</div>
    <div class="ct-well"><h3>Lifecycle distribution</h3>${donut.some((s) => s.value > 0) ? donutChart({ segments: donut, ariaLabel: 'Combo lifecycle distribution' }) + chartTableAlternative({ caption: 'Combo lifecycle counts', headers: ['Outcome', 'Count'], rows: LIFECYCLE_ORDER.map((k) => [LIFECYCLE_LABEL[k], fmt(lifecycle[k] ?? 0)]) }) : '<div class="notice">No settled Combo lifecycle in this dataset.</div>'}</div>
    <div class="ct-well"><h3>Where Combos die</h3>${lifecycleFlow(c)}</div>
  </div>`;
}

function lifecycleFlow(c) {
  const l = c.lifecycle?.counts ?? {};
  const declared = (l.resolved ?? 0) + (l.countered ?? 0) + (l.fizzled ?? 0) + (l.broken ?? 0) + (l.pending ?? 0);
  if (!declared) return '<div class="notice">No lifecycle evidence — declarations were not tracked to resolution in this dataset.</div>';
  const links = [
    { source: 'Declared', target: 'Resolved', value: l.resolved ?? 0 },
    { source: 'Declared', target: 'Countered', value: l.countered ?? 0 },
    { source: 'Declared', target: 'Fizzled (validation)', value: l.fizzled ?? 0 },
    { source: 'Declared', target: 'Pending (unresolved at end)', value: l.pending ?? 0 },
  ];
  const counters = c.lifecycle?.counterAuthorities ?? {};
  for (const [kind, n] of Object.entries(counters)) {
    links.push({ source: 'Countered', target: counterLabel(kind), value: n });
  }
  const nodeIds = ['Declared', 'Resolved', 'Countered', 'Fizzled (validation)', 'Pending (unresolved at end)', ...Object.keys(counters).map(counterLabel)];
  return sankeyFlow({ nodes: nodeIds.map((id) => ({ id, label: id })), links: links.filter((l2) => l2.value > 0), ariaLabel: 'Combo lifecycle flow' })
    + `<div class="notice info" style="margin-top:8px">Broken by 4♥ Combo Breaker: <b>n/a</b> — not implemented in this engine build (never inferred).</div>`;
}

function recipeMatrixHtml(c) {
  const recipes = c.recipes ?? [];
  if (!recipes.length) return '<div class="notice">No Combo recipes observed in this dataset.</div>';
  const rows = recipes.map((r) => `<tr>
    <td><b>${esc(r.label)}</b><br><small class="mono">${esc(r.recipeId)}</small></td>
    <td>${esc(r.comboClass)}</td>
    <td>${fmt(r.uses)}</td>
    <td>${fmt(r.opportunities)}</td>
    <td>${rateFmt(r.pickRate)}</td>
    <td>${rateFmt(r.resolveRate)}</td>
    <td>${rateFmt(r.counterRate)}</td>
    <td title="${esc(r.breakRateStatus?.detail ?? '')}">${na}</td>
    <td>${r.avgCommittedCards != null ? r.avgCommittedCards.toFixed(1) : '—'}</td>
    <td>${ppFmt(r.adjustedAssociation)}</td>
    <td><span class="status-badge ${r.evidenceGrade === 'strong' || r.evidenceGrade === 'moderate' ? 'supported' : r.evidenceGrade === 'weak' ? 'info' : 'warning'}">${esc((r.evidenceGrade ?? 'insufficient').toUpperCase())}</span></td>
  </tr>`);
  return `<div class="table-wrap"><table class="data-table" data-testid="combo-recipe-matrix"><thead><tr><th>Recipe</th><th>Class</th><th>Uses</th><th>Opportunities</th><th>Pick%</th><th>Resolve%</th><th>Counter%</th><th>Break%</th><th>Avg cards</th><th>Adj. assoc</th><th>Evidence</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function componentMapHtml(c) {
  const ranks = c.components?.ranks ?? [];
  const recipes = (c.recipes ?? []).filter((r) => r.uses > 0);
  const cards = c.components?.cards ?? [];
  const records = c.records ?? [];
  if (!ranks.length) return '<div class="notice">No component participation recorded.</div>';
  // Recipe × rank participation matrix — which ranks feed which recipes.
  const rankList = ranks.slice(0, 14).map((r) => r.rank);
  const cells = {};
  for (const rec of records) {
    if (!rec.recipeId) continue;
    for (const rank of rec.componentRanks ?? []) {
      const key = `${rec.recipeId}|${rank}`;
      cells[key] = (cells[key] ?? 0) + 1;
    }
  }
  const heat = recipes.length && rankList.length
    ? `<h3>Recipe × rank participation</h3><div class="table-wrap"><table class="data-table combo-component-matrix"><thead><tr><th>Recipe</th>${rankList.map((r) => `<th>${esc(r)}</th>`).join('')}</tr></thead><tbody>${recipes.map((r) => `<tr><td>${esc(r.label)}</td>${rankList.map((rk) => { const v = cells[`${r.recipeId}|${rk}`] ?? 0; return `<td class="${v ? 'combo-cell-hot' : ''}">${v || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`
    : '';
  const rankBars = barChart({ items: ranks.slice(0, 13).map((r) => ({ label: r.rank, value: r.declarations })), ariaLabel: 'Combo participation by rank' });
  const cardRows = cards.slice(0, 16).map((cd) => `<tr><td><b>${esc(cd.identity)}</b></td><td>${fmt(cd.declarations)}</td><td>${rateFmt(cd.declarations ? cd.resolved / cd.declarations : null)}</td></tr>`).join('');
  return `<div class="grid two"><div class="ct-well"><h3>Rank participation</h3>${rankBars}</div>
    <div class="ct-well"><h3>Top component cards</h3>${cards.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Card</th><th>Combos</th><th>Resolve%</th></tr></thead><tbody>${cardRows}</tbody></table></div>` : '<div class="notice">Card-level identities require combo telemetry (not retained in legacy datasets).</div>'}</div></div>${heat}`;
}

function policyTableHtml(c) {
  const policies = c.policies ?? [];
  if (!policies.length) return '<div class="notice">No policy observations.</div>';
  const rows = policies.map((p) => `<tr>
    <td><b>${esc(p.policyId)}</b></td>
    <td>${fmt(p.participations)}</td>
    <td>${fmt(p.opportunities)}</td>
    <td>${fmt(p.declarations)}</td>
    <td>${rateFmt(p.comboPropensity)}</td>
    <td>${rateFmt(p.resolveRate)}</td>
    <td>${pct(p.winRate)}</td>
    <td>${ppFmt(p.adjustedAssociation)}</td>
    <td>${fmt(p.recipeDiversity)}</td>
    <td><small>${p.contexts.ahead || p.contexts.behind || p.contexts.tied ? `↑${fmt(p.contexts.ahead)} · ≈${fmt(p.contexts.tied)} · ↓${fmt(p.contexts.behind)}` : '—'}</small></td>
  </tr>`);
  return `<div class="table-wrap"><table class="data-table" data-testid="combo-policy-table"><thead><tr><th>Policy</th><th>Games</th><th>Opportunities</th><th>Declared</th><th>Combo propensity</th><th>Resolve%</th><th>Win%</th><th>Adj. assoc</th><th>Recipes</th><th>Contexts <small>(↑lead ≈tied ↓behind)</small></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
  <div class="notice info"><strong>Comboing ≠ Combo count.</strong> Combo propensity is declarations ÷ legal Combo opportunities — a behavioral tendency under legal choice, not raw usage.</div>`;
}

export function renderComboAtlas() {
  const o = state.observatory;
  const c = o?.combo;
  if (!o || !Array.isArray(o.summaries) || !o.summaries.length) {
    app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">⚡</span><strong>No dataset loaded</strong><p>Load match summaries or run a campaign to generate Combo evidence.</p></div>';
    return;
  }
  if (!c) {
    app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>⚡ Combo Atlas</h2><p>Canonical Combo analytics</p></div></div><div class="panel-body"><div class="notice warning">Combo analytics were not computed for this dataset artifact.</div></div></section>`;
    return;
  }
  const t = c.totals ?? {};
  const section = state.comboAtlasSection ?? 'overview';
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'recipes', label: `Recipe Matrix (${(c.recipes ?? []).length})` },
    { id: 'components', label: 'Component Map' },
    { id: 'lifecycle', label: 'Lifecycle' },
    { id: 'policies', label: `Policies (${(c.policies ?? []).length})` },
  ];
  const tabHtml = `<nav class="ix-section-tabs" data-testid="combo-section-tabs" role="tablist">${tabs.map((tb) => `<button role="tab" data-combo-tab="${tb.id}" aria-selected="${tb.id === section}" class="ix-section-tab ${tb.id === section ? 'active' : ''}">${esc(tb.label)}</button>`).join('')}</nav>`;
  const body = section === 'overview' ? overviewHtml(c)
    : section === 'recipes' ? recipeMatrixHtml(c)
    : section === 'components' ? componentMapHtml(c)
    : section === 'lifecycle' ? `<div class="ct-well"><h3>Combo lifecycle — where declarations end</h3>${lifecycleFlow(c)}</div><div class="ct-well"><h3>Failure detail</h3>${failureDetailHtml(c)}</div>`
    : policyTableHtml(c);
  app.innerHTML = `<section class="panel" data-testid="combo-atlas"><div class="panel-header"><div><h2>⚡ Combo Atlas</h2><p>Canonical Combo (§8) — ${fmt(t.declarations ?? 0)} declarations · ${fmt(t.opportunities ?? 0)} legal opportunities · lifecycle ${esc(c.coverage?.lifecycleStatus ?? 'unknown')}</p></div></div><div class="panel-body">${labDatasetBanner()}${obsContextStrip(o)}${comboCoverageNotice(c)}${kpiStrip(c)}${tabHtml}<div class="combo-section" data-testid="combo-section-${esc(section)}">${body}</div></div></section>`;
  document.querySelectorAll('[data-combo-tab]').forEach((btn) => {
    btn.onclick = () => { state.comboAtlasSection = btn.dataset.comboTab; rerender(); };
  });
}

function failureDetailHtml(c) {
  const records = (c.records ?? []).filter((r) => ['countered', 'fizzled', 'broken'].includes(r.lifecycleStatus));
  if (!records.length) return '<div class="notice">No countered, fizzled, or broken Combos recorded.</div>';
  const rows = records.slice(0, 30).map((r) => `<tr><td class="mono">${esc(r.matchId ?? '—')}</td><td>${fmt(r.decisionOrdinal ?? '—')}</td><td>${esc(r.recipeId ?? '—')}</td><td><span class="status-badge warning">${esc(r.lifecycleStatus)}</span></td><td>${esc(r.counterKind ? counterLabel(r.counterKind) : (r.failureReason ?? '—'))}</td></tr>`);
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Match</th><th>Decision</th><th>Recipe</th><th>Outcome</th><th>Authority / reason</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
