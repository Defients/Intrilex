// ═══════════════════════════════════════════════════════════════
// workspaces/meta-atlas.js — /atlas workspace (Meta Atlas V1)
//
// Interactive population map of observed policy identities. All
// aggregation lives in @intrilex/analytics/meta-atlas (pure, tested);
// all canvas/inspector markup lives in ../atlas/atlas-render.mjs
// (pure string builders). This file owns DOM wiring only.
// ═══════════════════════════════════════════════════════════════

import { state, app, esc, persistSetting, showToast } from '../state.js?v=943d1ec6c237';
import { rerender } from '../rerender.js?v=943d1ec6c237';
import { chartTableAlternative } from '../chart-toolkit.js?v=943d1ec6c237';
import {
  buildAtlasModel, atlasMetric, atlasCohortLabel,
  ATLAS_DEFAULT_X, ATLAS_DEFAULT_Y, EVIDENCE_TIER_LABELS,
} from '../shared-analytics/meta-atlas.mjs?v=943d1ec6c237';
import {
  renderAtlasSvg, atlasSummaryHtml, atlasLegendHtml, atlasInspectorHtml,
  atlasTooltipHtml, atlasViewport, atlasScales, policyLabel, ATLAS_CANVAS,
} from '../atlas/atlas-render.mjs?v=943d1ec6c237';
import { labDatasetBanner } from './observatory.js?v=943d1ec6c237';
import { obsContextStrip } from './observatory-ui.js?v=943d1ec6c237';

const MIN_GAMES_OPTIONS = [1, 6, 12, 24];
const COLOR_OPTIONS = [['winRate', 'Win rate'], ['evidence', 'Evidence tier'], ['identity', 'Policy identity'], ['uniform', 'Uniform']];
const SIZE_OPTIONS = [['games', 'Games played'], ['winRate', 'Win rate'], ['uniform', 'Uniform']];
const OVERLAY_OPTIONS = [['off', 'Off'], ['selected', 'Selected node'], ['all', 'All edges']];
const ZOOM_MIN_FACTOR = 0.02;   // viewport span can't go below 2% of the auto-fit span
const ZOOM_MAX_FACTOR = 12;     // …or above 12× of it

// ── state ────────────────────────────────────────────────────────────────
// Prefs persist across reloads (intrilex:settings blob). Selection/view are
// ephemeral workspace state on `state`, matching existing conventions.
function prefs() {
  if (!state.atlasPrefs) {
    state.atlasPrefs = {
      x: ATLAS_DEFAULT_X, y: ATLAS_DEFAULT_Y, colorBy: 'winRate', sizeBy: 'games',
      overlay: 'selected', guides: true, minGames: 1, cohort: 'all', focusMode: false,
    };
  }
  return state.atlasPrefs;
}
function savePrefs() { persistSetting('atlasPrefs', state.atlasPrefs); }

// Hash-query round-trip: #/atlas?x=…&y=…&sel=…&cmp=… keeps views shareable.
function syncHash() {
  const p = prefs();
  const q = new URLSearchParams({ x: p.x, y: p.y });
  if (state.atlasSelected) q.set('sel', state.atlasSelected);
  if (state.atlasCompare) q.set('cmp', state.atlasCompare);
  history.replaceState(null, '', `#/atlas?${q}`);
}
function readHashIntoState() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const p = prefs();
  for (const k of ['x', 'y']) if (atlasMetric(q.get(k))) p[k] = q.get(k);
  if (q.get('sel')) state.atlasSelected = q.get('sel');
  if (q.get('cmp')) state.atlasCompare = q.get('cmp');
}

// ── model cache ──────────────────────────────────────────────────────────
// buildAtlasModel is O(summaries) — rebuilding per render is cheap, but the
// canvas repaints on every pan/zoom commit so we cache by input signature.
let _cache = { sig: null, model: null };
function atlasModel() {
  const p = prefs();
  const summaries = state.observatory?.summaries ?? [];
  // Cheap data fingerprint: identity isn't reliable, so key on endpoints+length.
  const dataFp = `${summaries.length}|${summaries[0]?.matchId ?? ''}|${summaries[summaries.length - 1]?.matchId ?? ''}`;
  const sig = `${dataFp}|${p.x}|${p.y}|${p.minGames}|${p.cohort}|${state.observatory?.datasetOrigin ?? ''}`;
  if (_cache.sig !== sig) {
    _cache = { sig, model: buildAtlasModel({ summaries, xMetricId: p.x, yMetricId: p.y, minGames: p.minGames, cohort: p.cohort }) };
  }
  return _cache.model;
}

// ── controls ─────────────────────────────────────────────────────────────
function axisSelect(id, current, model) {
  const groups = new Map();
  for (const a of model.metricAvailability) {
    if (!groups.has(a.def.category)) groups.set(a.def.category, []);
    groups.get(a.def.category).push(a);
  }
  const categoryLabel = { performance: 'Performance', tempo: 'Tempo', interaction: 'Interaction', resource: 'Resource', behavioral: 'Behavioral', evidence: 'Evidence / meta' };
  const opts = [...groups.entries()].map(([cat, items]) => `<optgroup label="${esc(categoryLabel[cat] ?? cat)}">${items.map((a) =>
    `<option value="${a.id}" ${a.id === current ? 'selected' : ''}${a.available ? '' : ' disabled title="unavailable for this dataset"'}>${esc(a.def.label)}${a.available ? '' : ' — n/a'}</option>`).join('')}</optgroup>`).join('');
  return `<select id="${id}" class="atlas-select" aria-label="${id === 'atlas-x' ? 'X axis metric' : 'Y axis metric'}">${opts}</select>`;
}

function controlsHtml(model) {
  const p = prefs();
  // A stale/unknown cohort stays visible in the selector (marked
  // unavailable) rather than silently presenting as "All evidence" —
  // the evidence scope shown must match the scope actually applied.
  const cohortVals = ['all', ...model.cohorts, ...(model.cohortError ? [model.cohortError.requested] : [])];
  const cohortOpts = cohortVals.map((c) =>
    `<option value="${esc(c)}" ${p.cohort === c ? 'selected' : ''}>${esc(c === 'all' ? 'All evidence' : c === model.cohortError?.requested ? `${c} — unavailable` : atlasCohortLabel(c))}</option>`).join('');
  const minGamesOpts = MIN_GAMES_OPTIONS.map((n) => `<option value="${n}" ${p.minGames === n ? 'selected' : ''}>≥ ${n} game${n > 1 ? 's' : ''}</option>`).join('');
  const nodeOpts = model.nodes.map((n) => `<option value="${esc(n.id)}" ${state.atlasSelected === n.id ? 'selected' : ''}>${esc(policyLabel(n.id))}</option>`).join('');
  return `<div class="atlas-controls" data-testid="atlas-controls">
    <div class="atlas-ctrl-group"><label for="atlas-x">X axis</label>${axisSelect('atlas-x', p.x, model)}</div>
    <button id="atlas-swap-axes" class="ghost-button atlas-swap" title="Swap X and Y metrics" aria-label="Swap X and Y metrics">⇄</button>
    <div class="atlas-ctrl-group"><label for="atlas-y">Y axis</label>${axisSelect('atlas-y', p.y, model)}</div>
    <div class="atlas-ctrl-group"><label for="atlas-cohort">Dataset</label><select id="atlas-cohort" class="atlas-select">${cohortOpts}</select></div>
    <div class="atlas-ctrl-group"><label for="atlas-min-games">Evidence</label><select id="atlas-min-games" class="atlas-select">${minGamesOpts}</select></div>
    <div class="atlas-ctrl-group"><label for="atlas-color-by">Color</label><select id="atlas-color-by" class="atlas-select">${COLOR_OPTIONS.map(([v, l]) => `<option value="${v}" ${p.colorBy === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="atlas-ctrl-group"><label for="atlas-size-by">Size</label><select id="atlas-size-by" class="atlas-select">${SIZE_OPTIONS.map(([v, l]) => `<option value="${v}" ${p.sizeBy === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="atlas-ctrl-group"><label for="atlas-overlay">Matchups</label><select id="atlas-overlay" class="atlas-select">${OVERLAY_OPTIONS.map(([v, l]) => `<option value="${v}" ${p.overlay === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="atlas-ctrl-group"><label for="atlas-find">Find</label><select id="atlas-find" class="atlas-select"><option value="">— node —</option>${nodeOpts}</select></div>
    <label class="atlas-check"><input type="checkbox" id="atlas-guides" ${p.guides ? 'checked' : ''}> medians</label>
    <label class="atlas-check" title="Dim nodes unrelated to the selection"><input type="checkbox" id="atlas-focus" ${p.focusMode ? 'checked' : ''} ${state.atlasSelected ? '' : 'disabled'}> focus</label>
  </div>`;
}

// ── render ───────────────────────────────────────────────────────────────
export function renderMetaAtlas() {
  readHashIntoState();
  const summaries = state.observatory?.summaries ?? [];
  if (!summaries.length) {
    app.innerHTML = `<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">⌖</span><strong>No match evidence</strong><p>Meta Atlas maps policies onto observed behavioral/performance space once campaign summaries exist. Run a campaign in Evolution Lab or load the certified corpus.</p></div>`;
    return;
  }
  const p = prefs();
  const model = atlasModel();
  const originNote = state.observatory?.datasetOrigin === 'EVOLUTION_LAB'
    ? ' Nodes derive from propagated lab runs (unverified telemetry).'
    : state.observatory?.datasetOrigin === 'EXPERIMENT_RUNS'
      ? ' Nodes derive from the experiment analysis set, not the certified corpus.' : '';
  const cohortNote = model.cohortError
    ? `<div class="notice warn atlas-cohort-note" data-testid="atlas-cohort-note"><strong>Cohort "${esc(model.cohortError.requested)}" has no evidence.</strong> ${esc(model.cohortError.reason)} — the scope was not widened to all evidence. Choose another dataset cohort.</div>`
    : '';
  const excludedNote = model.excluded.length
    ? `<div class="notice info atlas-exclusions" data-testid="atlas-exclusions"><strong>${model.nodes.length} of ${model.totalPolicies} policies mapped.</strong> ${model.excluded.length} excluded: ${model.excluded.map((e) => `${esc(e.id)} (${esc(e.reason)})`).join('; ')}.</div>`
    : '';
  const emptyCanvas = !model.nodes.length
    ? `<div class="empty-state"><strong>No policies qualify</strong><p>Every policy is excluded under the current axes/evidence filter. Lower the evidence threshold or pick a metric with coverage.</p></div>`
    : `<div id="atlas-stage" class="atlas-stage" data-testid="atlas-stage">${renderAtlasSvg({ model, view: state.atlasView, colorBy: p.colorBy, sizeBy: p.sizeBy, guides: p.guides, overlay: p.overlay, selectedId: state.atlasSelected, compareId: state.atlasCompare, focusMode: p.focusMode })}</div>`;

  app.innerHTML = `<section class="panel atlas-panel" data-testid="atlas-panel">
    <div class="panel-header"><div><h2>Meta Atlas</h2><p>Observed policy population in two chosen metric dimensions — measured behavior and outcomes, never inferred archetypes.${esc(originNote)}</p></div>
    <div class="toolbar"><button id="atlas-export" class="secondary-button" data-testid="atlas-export">⇩ Export model</button><button id="atlas-reset-view" class="secondary-button">Reset view</button></div></div>
    ${labDatasetBanner()}${obsContextStrip(state.observatory)}
    ${controlsHtml(model)}
    ${cohortNote}
    ${excludedNote}
    ${atlasSummaryHtml(model)}
    <div class="atlas-layout">
      <div class="atlas-canvas-wrap">
        ${emptyCanvas}
        <div id="atlas-tooltip" class="atlas-tooltip" role="tooltip" hidden></div>
        <div class="atlas-canvas-footer">
          ${atlasLegendHtml({ colorBy: p.colorBy, sizeBy: p.sizeBy, overlay: p.overlay, model })}
          <div class="atlas-zoom-ctrls" role="group" aria-label="Zoom controls">
            <button id="atlas-zoom-out" class="ghost-button" aria-label="Zoom out">−</button>
            <button id="atlas-zoom-in" class="ghost-button" aria-label="Zoom in">＋</button>
          </div>
        </div>
        <details class="atlas-table-details"><summary>Node data table (accessible alternative)</summary>
          ${chartTableAlternative({ headers: ['Policy', model.xDef.label, model.yDef.label, 'Win rate', 'Games', 'Evidence'], rows: model.nodes.map((n) => [n.id, String(n.x), String(n.y), String(n.winRate ?? '—'), String(n.games), EVIDENCE_TIER_LABELS[n.evidence] ?? n.evidence]), caption: 'Plotted Atlas nodes' })}
        </details>
      </div>
      <aside class="atlas-side" id="atlas-side" aria-live="polite">${atlasInspectorHtml({ model, selectedId: state.atlasSelected, compareId: state.atlasCompare })}</aside>
    </div>
  </section>`;
  bindAtlas(model);
}

// ── repaint (pan/zoom without full rerender) ─────────────────────────────
function repaintStage(model) {
  const stage = document.querySelector('#atlas-stage');
  if (!stage) return;
  const p = prefs();
  stage.innerHTML = renderAtlasSvg({ model, view: state.atlasView, colorBy: p.colorBy, sizeBy: p.sizeBy, guides: p.guides, overlay: p.overlay, selectedId: state.atlasSelected, compareId: state.atlasCompare, focusMode: p.focusMode });
  bindStageInteractions(model, stage);
}

// ── interactions ─────────────────────────────────────────────────────────
function bindAtlas(model) {
  const p = prefs();
  const onPref = (id, key, coerce = (v) => v) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      p[key] = coerce(e.target.value);
      if (key === 'x' || key === 'y' || key === 'cohort' || key === 'minGames') state.atlasView = null;
      savePrefs(); syncHash(); rerender();
    });
  };
  onPref('atlas-x', 'x');
  onPref('atlas-y', 'y');
  onPref('atlas-cohort', 'cohort');
  onPref('atlas-min-games', 'minGames', Number);
  onPref('atlas-color-by', 'colorBy');
  onPref('atlas-size-by', 'sizeBy');
  onPref('atlas-overlay', 'overlay');
  document.getElementById('atlas-guides')?.addEventListener('change', (e) => { p.guides = e.target.checked; savePrefs(); rerender(); });
  document.getElementById('atlas-focus')?.addEventListener('change', (e) => { p.focusMode = e.target.checked; savePrefs(); rerender(); });
  document.getElementById('atlas-swap-axes')?.addEventListener('click', () => {
    [p.x, p.y] = [p.y, p.x]; state.atlasView = null; savePrefs(); syncHash(); rerender();
  });
  document.getElementById('atlas-find')?.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    state.atlasSelected = id;
    centerOnNode(model, id);
    syncHash(); rerender();
  });
  document.getElementById('atlas-reset-view')?.addEventListener('click', () => { state.atlasView = null; repaintStage(model); });
  document.getElementById('atlas-zoom-in')?.addEventListener('click', () => zoomAt(model, 0.7));
  document.getElementById('atlas-zoom-out')?.addEventListener('click', () => zoomAt(model, 1 / 0.7));
  document.getElementById('atlas-export')?.addEventListener('click', () => exportModel(model));

  document.getElementById('atlas-view-games')?.addEventListener('click', () => {
    if (!state.atlasSelected) return;
    const node = model.nodes.find((n) => n.id === state.atlasSelected);
    state.historyFilterPolicy = state.atlasSelected;
    state.historyFilterMatchIds = node?.matchIds?.length ? node.matchIds : null;
    state.historyPage = 0;
    location.hash = '#/history';
  });
  document.getElementById('atlas-clear-selection')?.addEventListener('click', () => {
    state.atlasSelected = null; state.atlasCompare = null; syncHash(); rerender();
  });
  document.getElementById('atlas-clear-compare')?.addEventListener('click', () => {
    state.atlasCompare = null; syncHash(); rerender();
  });
  document.querySelectorAll('[data-compare-with]').forEach((btn) => btn.addEventListener('click', () => {
    state.atlasCompare = btn.getAttribute('data-compare-with'); syncHash(); rerender();
  }));

  bindStageInteractions(model, document.querySelector('#atlas-stage'));
}

function centerOnNode(model, id) {
  const node = model.nodes.find((n) => n.id === id);
  if (!node) return;
  const vp = atlasViewport(model, state.atlasView);
  const xs = (vp.xMax - vp.xMin) * 0.32, ys = (vp.yMax - vp.yMin) * 0.32;
  state.atlasView = { xMin: node.x - xs, xMax: node.x + xs, yMin: node.y - ys, yMax: node.y + ys };
}

function clampView(model, view) {
  const auto = atlasViewport(model, null);
  const minX = (auto.xMax - auto.xMin) * ZOOM_MIN_FACTOR, minY = (auto.yMax - auto.yMin) * ZOOM_MIN_FACTOR;
  const maxX = (auto.xMax - auto.xMin) * ZOOM_MAX_FACTOR, maxY = (auto.yMax - auto.yMin) * ZOOM_MAX_FACTOR;
  let { xMin, xMax, yMin, yMax } = view;
  const fix = (lo, hi, minSpan, maxSpan) => {
    let a = lo, b = hi;
    if (b - a < minSpan) { const c = (a + b) / 2; a = c - minSpan / 2; b = c + minSpan / 2; }
    if (b - a > maxSpan) { const c = (a + b) / 2; a = c - maxSpan / 2; b = c + maxSpan / 2; }
    return [a, b];
  };
  [xMin, xMax] = fix(xMin, xMax, minX, maxX);
  [yMin, yMax] = fix(yMin, yMax, minY, maxY);
  return { xMin, xMax, yMin, yMax };
}

function zoomAt(model, factor, at = null) {
  const vp = atlasViewport(model, state.atlasView);
  const cx = at?.x ?? (vp.xMin + vp.xMax) / 2;
  const cy = at?.y ?? (vp.yMin + vp.yMax) / 2;
  state.atlasView = clampView(model, {
    xMin: cx - (cx - vp.xMin) * factor, xMax: cx + (vp.xMax - cx) * factor,
    yMin: cy - (cy - vp.yMin) * factor, yMax: cy + (vp.yMax - cy) * factor,
  });
  repaintStage(model);
}

function selectNode(id, { compare = false } = {}) {
  if (compare && state.atlasSelected && id !== state.atlasSelected) {
    state.atlasCompare = id;
  } else if (!compare && state.atlasSelected === id) {
    state.atlasSelected = null; state.atlasCompare = null;
  } else {
    state.atlasSelected = id;
    if (state.atlasCompare === id) state.atlasCompare = null;
  }
  syncHash(); rerender();
}

function bindStageInteractions(model, stage) {
  if (!stage) return;
  const svg = stage.querySelector('svg');
  const tip = document.getElementById('atlas-tooltip');
  if (!svg || !tip) return;
  const world = () => svg.querySelector('.atlas-world');
  const scaleX = () => ATLAS_CANVAS.width / svg.getBoundingClientRect().width;
  const showTip = (html, clientX, clientY) => {
    tip.innerHTML = html; tip.hidden = false;
    const stageRect = stage.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(8, clientX - stageRect.left + 14), stageRect.width - 230)}px`;
    tip.style.top = `${Math.max(8, clientY - stageRect.top - 12)}px`;
  };
  const hideTip = () => { tip.hidden = true; };

  // node hover + focus tooltips
  svg.querySelectorAll('[data-atlas-node]').forEach((el) => {
    const id = el.getAttribute('data-atlas-node');
    const node = model.nodes.find((n) => n.id === id);
    el.addEventListener('mouseenter', (e) => { if (node) showTip(atlasTooltipHtml(node, model), e.clientX, e.clientY); });
    el.addEventListener('mousemove', (e) => { if (!tip.hidden) showTip(tip.innerHTML, e.clientX, e.clientY); });
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus', () => {
      if (!node) return;
      const r = el.getBoundingClientRect();
      showTip(atlasTooltipHtml(node, model), r.left + r.width / 2, r.top);
    });
    el.addEventListener('blur', hideTip);
    el.addEventListener('click', (e) => { if (suppressClick) return; selectNode(id, { compare: e.shiftKey }); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(id, { compare: e.shiftKey }); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const order = [...svg.querySelectorAll('[data-atlas-node]')];
        const i = order.indexOf(el);
        const next = order[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + order.length) % order.length];
        next?.focus();
      } else if (e.key === 'Escape') { state.atlasSelected = null; state.atlasCompare = null; syncHash(); rerender(); }
    });
  });

  // edge tooltips (model lookup — richer than the raw <title>)
  svg.querySelectorAll('.atlas-edge').forEach((el) => {
    const a = el.getAttribute('data-edge-a'), b = el.getAttribute('data-edge-b');
    const edge = model.edges.find((e) => e.a === a && e.b === b);
    el.addEventListener('mouseenter', (e) => {
      if (!edge) return;
      const arrowText = edge.advantage == null ? 'no decisive games'
        : edge.advantage >= 0 ? `${esc(policyLabel(a))} leads ${edge.aWins}–${edge.bWins}` : `${esc(policyLabel(b))} leads ${edge.bWins}–${edge.aWins}`;
      showTip(`<div class="atlas-tip"><strong>${esc(policyLabel(a))} vs ${esc(policyLabel(b))}</strong>`
        + `<div class="atlas-tip-row"><span>Record</span><b>${edge.aWins}–${edge.bWins} (${edge.decisive} decisive${edge.draws ? `, ${edge.draws} draws` : ''})</b></div>`
        + `<div class="atlas-tip-row"><span>Observed</span><b>${arrowText}</b></div>`
        + `<div class="atlas-tip-row"><span>Evidence</span><b>${edge.tier}${edge.balancedSeats ? ' · seats balanced' : ' · seats unbalanced'}</b></div>`
        + `<div class="atlas-tip-hint">observed matchup record — not a causal counter claim</div></div>`, e.clientX, e.clientY);
    });
    el.addEventListener('mouseleave', hideTip);
  });

  // wheel zoom anchored at cursor (non-passive — we preventDefault)
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const k = ATLAS_CANVAS.width / rect.width;
    const px = (e.clientX - rect.left) * k, py = (e.clientY - rect.top) * k;
    const vp = atlasViewport(model, state.atlasView);
    const sc = atlasScales(vp);
    zoomAt(model, e.deltaY > 0 ? 1.22 : 1 / 1.22, { x: sc.toDataX(px), y: sc.toDataY(py) });
  }, { passive: false });

  // drag pan — transform the world group live, commit viewport on release
  let drag = null;
  let suppressClick = false;
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) * scaleX(), dy = (e.clientY - drag.y) * scaleX();
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) {
      drag.moved = true; svg.classList.add('is-panning');
    }
    if (drag.moved) { const w = world(); if (w) w.style.transform = `translate(${dx}px,${dy}px)`; }
  });
  const endDrag = (e) => {
    if (!drag) return;
    const wasMoved = drag.moved;
    if (wasMoved) {
      const k = scaleX();
      const vp = atlasViewport(model, state.atlasView);
      const sc = atlasScales(vp);
      const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
      const dDataX = sc.toDataX(sc.plot.left + dx) - sc.toDataX(sc.plot.left);
      const dDataY = sc.toDataY(sc.plot.top + dy) - sc.toDataY(sc.plot.top);
      state.atlasView = { xMin: vp.xMin - dDataX, xMax: vp.xMax - dDataX, yMin: vp.yMin - dDataY, yMax: vp.yMax - dDataY };
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      repaintStage(model);
    }
    svg.classList.remove('is-panning');
    drag = null;
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
}

// ── export ───────────────────────────────────────────────────────────────
function exportModel(model) {
  const payload = {
    kind: 'meta-atlas-model', schemaVersion: model.schemaVersion, exportedAt: new Date().toISOString(),
    axes: { x: model.xDef.id, y: model.yDef.id },
    datasetOrigin: state.observatory?.datasetOrigin ?? 'CERTIFIED',
    matchCount: model.matchCount,
    population: model.population,
    nodes: model.nodes.map((n) => ({
      id: n.id, x: n.x, y: n.y, games: n.games, decisive: n.decisive,
      winRate: n.winRate, winWilson95: n.winWilson95, evidence: n.evidence,
      matchIds: n.matchIds,
    })),
    excluded: model.excluded,
    edges: model.edges,
    note: 'Observed measurements only. Policy IDs are executable policies, not persistent Agent Profiles or rules profiles.',
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `meta-atlas-${model.xDef.id}-x-${model.yDef.id}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Atlas model exported — nodes, edges, and population stats.', { type: 'success' });
}
