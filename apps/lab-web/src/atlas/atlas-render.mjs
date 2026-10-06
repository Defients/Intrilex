// ═══════════════════════════════════════════════════════════════
// atlas/atlas-render.mjs — Meta Atlas presentation layer.
//
// Pure string builders only — no DOM, no state.js, no side effects.
// The workspace (workspaces/meta-atlas.js) owns event binding and
// state; this module turns the domain model (@intrilex/analytics/
// meta-atlas) into SVG/HTML strings. Keeping it DOM-free makes every
// code path testable under node:test.
// ═══════════════════════════════════════════════════════════════

import {
  atlasMetric, formatAtlasMetric, formatAtlasTick, identityColor,
  collisionGroups, collisionOffsets, explainPosition, comparisonRows,
  headToHead, metricPercentile, EVIDENCE_TIER_LABELS,
} from '@intrilex/analytics/meta-atlas';

// ── helpers ──────────────────────────────────────────────────────────────
const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Display label for a policy identity (matches router policyOptions casing). */
export function policyLabel(id) {
  return String(id ?? '').replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Short label for dense canvases. */
function shortLabel(id) {
  const pretty = policyLabel(id);
  return pretty.length > 18 ? `${pretty.slice(0, 17)}…` : pretty;
}

// ── viewport / projection ────────────────────────────────────────────────
export const ATLAS_CANVAS = Object.freeze({ width: 980, height: 560, padL: 66, padR: 30, padT: 30, padB: 56 });

const padDomain = (lo, hi) => {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  const span = hi - lo;
  if (span <= 0) return [lo - Math.max(1, Math.abs(lo) * 0.1), hi + Math.max(1, Math.abs(hi) * 0.1)];
  return [lo - span * 0.09, hi + span * 0.09];
};

/**
 * Resolve the active viewport: explicit `view` (user zoom/pan) or a padded
 * auto-fit over the plotted nodes that always includes population medians.
 */
export function atlasViewport(model, view = null) {
  if (view && Number.isFinite(view.xMin) && Number.isFinite(view.xMax) && view.xMax > view.xMin
    && Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax > view.yMin) {
    return { xMin: view.xMin, yMin: view.yMin, xMax: view.xMax, yMax: view.yMax, auto: false };
  }
  const xs = model.nodes.map((n) => n.x);
  const ys = model.nodes.map((n) => n.y);
  const mx = model.population?.x?.median, my = model.population?.y?.median;
  if (Number.isFinite(mx)) xs.push(mx);
  if (Number.isFinite(my)) ys.push(my);
  const [xMin, xMax] = padDomain(xs.length ? Math.min(...xs) : 0, xs.length ? Math.max(...xs) : 1);
  const [yMin, yMax] = padDomain(ys.length ? Math.min(...ys) : 0, ys.length ? Math.max(...ys) : 1);
  return { xMin, yMin, xMax, yMax, auto: true };
}

/** Pixel/data projections shared by the SVG renderer and workspace pan/zoom math. */
export function atlasScales(viewport, { width = ATLAS_CANVAS.width, height = ATLAS_CANVAS.height } = {}) {
  const { padL, padR, padT, padB } = ATLAS_CANVAS;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xSpan = viewport.xMax - viewport.xMin || 1;
  const ySpan = viewport.yMax - viewport.yMin || 1;
  return {
    plot: { left: padL, top: padT, width: plotW, height: plotH },
    toPxX: (v) => padL + ((v - viewport.xMin) / xSpan) * plotW,
    toPxY: (v) => padT + plotH * (1 - (v - viewport.yMin) / ySpan),
    toDataX: (px) => viewport.xMin + ((px - padL) / plotW) * xSpan,
    toDataY: (px) => viewport.yMax - ((px - padT) / plotH) * ySpan,
  };
}

// ── node encodings ───────────────────────────────────────────────────────
const lerpColor = (a, b, t) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * clamp(t, 0, 1)).toString(16).padStart(2, '0')).join('')}`;
};

const EVIDENCE_COLORS = Object.freeze({
  'insufficient': '#6b7280', 'very-low': '#8a93a6', 'low': '#5b9cf0', 'moderate': '#5ad7e8', 'high': '#4fd387',
});

/** Diverging win-rate scale: red (0) → muted slate (0.5) → green (1). */
export function winRateColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  return v <= 0.5
    ? lerpColor('#f05d78', '#7d8aa0', v * 2)
    : lerpColor('#7d8aa0', '#4fd387', (v - 0.5) * 2);
}

export function nodeFill(node, colorBy) {
  switch (colorBy) {
    case 'identity': return identityColor(node.id);
    case 'winRate': return winRateColor(node.winRate);
    case 'evidence': return EVIDENCE_COLORS[node.evidence] ?? '#6b7280';
    default: return '#5ad7e8';
  }
}

export function nodeRadius(node, sizeBy, maxGames) {
  if (sizeBy === 'games') return 5 + 11 * Math.sqrt(clamp(node.games / Math.max(1, maxGames), 0, 1));
  if (sizeBy === 'winRate') return Number.isFinite(node.winRate) ? 5 + 11 * Math.sqrt(clamp(node.winRate, 0, 1)) : 5;
  return 7;
}

const EDGE_OPACITY = Object.freeze({ insufficient: 0.16, low: 0.34, moderate: 0.58, strong: 0.85 });
const edgeWidth = (advantage) => 1 + 5 * clamp(Math.abs(advantage ?? 0) * 2, 0, 1);

// ── the canvas ───────────────────────────────────────────────────────────
/**
 * Render the Atlas scatter canvas.
 * @param {object} opts
 * @param {object} opts.model - buildAtlasModel() output
 * @param {object|null} opts.view - {xMin,xMax,yMin,yMax} or null for auto-fit
 * @param {string} [opts.colorBy] - 'identity'|'winRate'|'evidence'|'uniform'
 * @param {string} [opts.sizeBy] - 'games'|'winRate'|'uniform'
 * @param {boolean} [opts.guides] - population median guide lines
 * @param {'off'|'selected'|'all'} [opts.overlay] - matchup edge overlay mode
 * @param {string|null} [opts.selectedId]
 * @param {string|null} [opts.compareId]
 * @param {boolean} [opts.focusMode] - dim nodes unrelated to the selection
 */
export function renderAtlasSvg({
  model, view = null, colorBy = 'winRate', sizeBy = 'games', guides = true,
  overlay = 'off', selectedId = null, compareId = null, focusMode = false,
  width = ATLAS_CANVAS.width, height = ATLAS_CANVAS.height,
} = {}) {
  const { xDef, yDef, nodes = [], edges = [], population } = model ?? {};
  const vp = atlasViewport(model ?? { nodes: [] }, view);
  const sc = atlasScales(vp, { width, height });
  const { padL, padT } = { padL: sc.plot.left, padT: sc.plot.top };
  const plotW = sc.plot.width, plotH = sc.plot.height;
  const maxGames = Math.max(1, ...nodes.map((n) => n.games));

  const xf = (v) => formatAtlasTick(v, xDef);
  const yf = (v) => formatAtlasTick(v, yDef);

  // ticks + subtle grid
  const tickVals = (min, max) => [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => min + (max - min) * t);
  const grid = tickVals(vp.yMin, vp.yMax).map((v) => {
    const y = sc.toPxY(v).toFixed(2);
    return `<line class="atlas-grid" x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}"/><text class="atlas-tick" x="${padL - 8}" y="${(+y + 3).toFixed(2)}" text-anchor="end">${esc(yf(v))}</text>`;
  }).join('') + tickVals(vp.xMin, vp.xMax).map((v) => {
    const x = sc.toPxX(v).toFixed(2);
    return `<line class="atlas-grid" x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}"/><text class="atlas-tick" x="${x}" y="${padT + plotH + 16}" text-anchor="middle">${esc(xf(v))}</text>`;
  }).join('');

  // median guides → mathematically neutral quadrant language
  let guidesSvg = '';
  if (guides && Number.isFinite(population?.x?.median) && Number.isFinite(population?.y?.median) && nodes.length >= 2) {
    const gx = sc.toPxX(population.x.median), gy = sc.toPxY(population.y.median);
    const xShort = xDef.axis.length > 16 ? `${xDef.axis.slice(0, 15)}…` : xDef.axis;
    const yShort = yDef.axis.length > 16 ? `${yDef.axis.slice(0, 15)}…` : yDef.axis;
    guidesSvg = [
      `<line class="atlas-median" x1="${gx.toFixed(2)}" y1="${padT}" x2="${gx.toFixed(2)}" y2="${padT + plotH}"/>`,
      `<line class="atlas-median" x1="${padL}" y1="${gy.toFixed(2)}" x2="${padL + plotW}" y2="${gy.toFixed(2)}"/>`,
      `<text class="atlas-median-label" x="${(gx + 5).toFixed(2)}" y="${padT + 11}">median ${esc(xf(population.x.median))}</text>`,
      `<text class="atlas-median-label" x="${padL + 5}" y="${(gy - 5).toFixed(2)}">median ${esc(yf(population.y.median))}</text>`,
      `<text class="atlas-quadrant" x="${padL + 8}" y="${padT + 16}">lower ${esc(xShort)} · higher ${esc(yShort)}</text>`,
      `<text class="atlas-quadrant" x="${padL + plotW - 8}" y="${padT + 16}" text-anchor="end">higher ${esc(xShort)} · higher ${esc(yShort)}</text>`,
      `<text class="atlas-quadrant" x="${padL + 8}" y="${padT + plotH - 8}">lower ${esc(xShort)} · lower ${esc(yShort)}</text>`,
      `<text class="atlas-quadrant" x="${padL + plotW - 8}" y="${padT + plotH - 8}" text-anchor="end">higher ${esc(xShort)} · lower ${esc(yShort)}</text>`,
    ].join('');
  }

  // collision groups over projected pixel positions (deterministic — nodes
  // arrive sorted by id; offsets never touch data values)
  const projected = nodes.map((n) => ({ node: n, cx: sc.toPxX(n.x), cy: sc.toPxY(n.y) }));
  const offsets = new Map();
  const halos = [];
  for (const group of collisionGroups(projected, (p) => `${p.cx.toFixed(1)}|${p.cy.toFixed(1)}`)) {
    const ring = collisionOffsets(group.length, 10);
    group.forEach((p, i) => offsets.set(p.node.id, ring[i]));
    halos.push(`<circle class="atlas-collision-halo" cx="${group[0].cx.toFixed(2)}" cy="${group[0].cy.toFixed(2)}" r="${(10 + Math.max(...group.map((p) => nodeRadius(p.node, sizeBy, maxGames)))).toFixed(1)}"/>`);
  }

  const inView = (p) => p.cx >= padL - 24 && p.cx <= padL + plotW + 24 && p.cy >= padT - 24 && p.cy <= padT + plotH + 24;

  // matchup edges: selected-only or all (populations stay small enough to read)
  const overlayEdges = overlay === 'off' ? [] : edges.filter((e) => {
    if (overlay === 'all') return nodes.some((n) => n.id === e.a) && nodes.some((n) => n.id === e.b);
    return selectedId && (e.a === selectedId || e.b === selectedId);
  });
  const connected = new Set();
  for (const e of overlayEdges) { connected.add(e.a); connected.add(e.b); }
  const nodePx = new Map(projected.map((p) => {
    const off = offsets.get(p.node.id) ?? { dx: 0, dy: 0 };
    return [p.node.id, { cx: p.cx + off.dx, cy: p.cy + off.dy, raw: p }];
  }));
  const edgesSvg = overlayEdges.map((e) => {
    const pa = nodePx.get(e.a), pb = nodePx.get(e.b);
    if (!pa || !pb) return '';
    // Advantage direction: arrow runs from the policy that wins more often.
    const from = (e.advantage ?? 0) >= 0 ? pa : pb;
    const to = (e.advantage ?? 0) >= 0 ? pb : pa;
    const dx = to.cx - from.cx, dy = to.cy - from.cy;
    const len = Math.hypot(dx, dy) || 1;
    const [ra, rb] = [nodeRadius(e.advantage >= 0 ? nodeOf(model, e.a) : nodeOf(model, e.b), sizeBy, maxGames), nodeRadius(e.advantage >= 0 ? nodeOf(model, e.b) : nodeOf(model, e.a), sizeBy, maxGames)];
    const x1 = from.cx + (dx / len) * (ra + 2), y1 = from.cy + (dy / len) * (ra + 2);
    const x2 = to.cx - (dx / len) * (rb + 5), y2 = to.cy - (dy / len) * (rb + 5);
    const neutral = Math.abs(e.advantage ?? 0) < 0.1;
    const aName = e.a, bName = e.b;
    const tip = `${aName} vs ${bName}: ${e.aWins}–${e.bWins} in ${e.decisive} decisive games (${e.games} total${e.draws ? `, ${e.draws} draws` : ''})`
      + `${e.winRate != null ? ` · ${aName} win rate ${(e.winRate * 100).toFixed(1)}%` : ''}`
      + ` · ${EVIDENCE_TIER_LABELS[e.tier] ?? e.tier}${e.balancedSeats ? ' · seats balanced' : ' · seats unbalanced'}`;
    return `<g class="atlas-edge atlas-edge-${e.tier}${neutral ? ' atlas-edge-neutral' : ''}" data-edge-a="${esc(e.a)}" data-edge-b="${esc(e.b)}">`
      + `<line class="atlas-edge-hit" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`
      + `<line class="atlas-edge-line" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke-width="${edgeWidth(e.advantage).toFixed(1)}" opacity="${EDGE_OPACITY[e.tier] ?? 0.2}"${neutral ? '' : ' marker-end="url(#atlas-arrow)"'}/>`
      + `<title>${esc(tip)}</title></g>`;
  }).join('');

  // nodes
  const nodesSvg = projected.filter(inView).map((p) => {
    const n = p.node;
    const off = offsets.get(n.id) ?? { dx: 0, dy: 0 };
    const cx = p.cx + off.dx, cy = p.cy + off.dy;
    const r = nodeRadius(n, sizeBy, maxGames);
    const fill = nodeFill(n, colorBy);
    const weak = n.evidence === 'insufficient' || n.evidence === 'very-low';
    const dimmed = focusMode && selectedId && n.id !== selectedId && n.id !== compareId && !connected.has(n.id);
    const cls = ['atlas-node', n.id === selectedId ? 'is-selected' : '', n.id === compareId ? 'is-compare' : '', weak ? 'is-weak' : '', dimmed ? 'is-dimmed' : ''].filter(Boolean).join(' ');
    const label = `${n.id}: ${xDef.label} ${formatAtlasMetric(n.x, xDef)}, ${yDef.label} ${formatAtlasMetric(n.y, yDef)}, ${n.games} games`;
    return `<g class="${cls}" data-atlas-node="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(`Select ${n.id}. ${label}`)}" data-testid="atlas-node-${esc(n.id)}">`
      + `${weak ? `<circle class="atlas-node-ring" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(r + 3.5).toFixed(1)}"/>` : ''}`
      + `<circle class="atlas-node-dot" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(1)}" fill="${fill}"/>`
      + `<text class="atlas-node-label" x="${(cx + r + 5).toFixed(2)}" y="${(cy + 3.5).toFixed(2)}">${esc(shortLabel(n.id))}</text>`
      + `<title>${esc(label)}</title></g>`;
  }).join('');

  const axisLabels = `<text class="atlas-axis-label" x="${padL + plotW / 2}" y="${height - 14}" text-anchor="middle">${esc(xDef.axis)}</text>`
    + `<text class="atlas-axis-label" x="16" y="${padT + plotH / 2}" text-anchor="middle" transform="rotate(-90 16 ${padT + plotH / 2})">${esc(yDef.axis)}</text>`;

  const frame = `<rect class="atlas-plot-frame" x="${padL}" y="${padT}" width="${plotW}" height="${plotH}"/>`;
  const desc = `Meta Atlas scatterplot of ${nodes.length} policies. X axis: ${xDef.label}. Y axis: ${yDef.label}.`;
  return `<svg class="atlas-canvas-svg" role="img" aria-label="${esc(desc)}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`
    + `<title>${esc('Meta Atlas')}</title><desc>${esc(desc)}</desc>`
    + `<defs><marker id="atlas-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path class="atlas-arrow-head" d="M0,0 L7,3.5 L0,7 z"/></marker></defs>`
    + `<g class="atlas-world">${frame}${grid}${guidesSvg}${halos.join('')}${edgesSvg}${nodesSvg}${axisLabels}</g></svg>`;
}

function nodeOf(model, id) {
  return (model.nodes ?? []).find((n) => n.id === id) ?? { games: 1, winRate: null };
}

// ── summary strip ────────────────────────────────────────────────────────
export function atlasSummaryHtml(model) {
  const { nodes, excluded, population, xDef, yDef, matchCount } = model;
  const mapped = nodes.length;
  const total = model.totalPolicies;
  const stat = (label, value, sub = '', cls = '') =>
    `<div class="atlas-stat ${cls}"><small>${esc(label)}</small><b>${value}</b><span class="atlas-stat-sub">${esc(sub)}</span></div>`;
  return `<div class="atlas-summary" data-testid="atlas-summary">`
    + stat('Policies mapped', `${mapped}<i>/${total}</i>`, excluded.length ? `${excluded.length} excluded` : 'all qualify')
    + stat('Evidence games', `${matchCount}`, 'matches in scope')
    + stat(`Median ${xDef.label}`, esc(formatAtlasMetric(population.x.median, xDef)), `n=${population.x.count}`)
    + stat(`Median ${yDef.label}`, esc(formatAtlasMetric(population.y.median, yDef)), `n=${population.y.count}`)
    + `</div>`;
}

// ── legends ──────────────────────────────────────────────────────────────
export function atlasLegendHtml({ colorBy, sizeBy, overlay, model }) {
  const parts = [];
  if (colorBy === 'winRate') {
    parts.push(`<div class="atlas-legend-block"><small>Color · win rate</small><div class="atlas-legend-gradient" style="background:linear-gradient(90deg,#f05d78,#7d8aa0,#4fd387)"></div><span class="atlas-legend-ends"><i>0%</i><i>50%</i><i>100%</i></span></div>`);
  } else if (colorBy === 'evidence') {
    const items = ['insufficient', 'very-low', 'low', 'moderate', 'high']
      .map((t) => `<span class="atlas-legend-item"><i class="atlas-swatch" style="background:${EVIDENCE_COLORS[t]}"></i>${t.replace('-', ' ')}</span>`).join('');
    parts.push(`<div class="atlas-legend-block"><small>Color · evidence tier (games)</small><div class="atlas-legend-row">${items}</div></div>`);
  } else if (colorBy === 'identity') {
    parts.push(`<div class="atlas-legend-block"><small>Color · policy identity</small><span class="atlas-legend-note">deterministic per policy</span></div>`);
  } else {
    parts.push(`<div class="atlas-legend-block"><small>Color · uniform</small><span class="atlas-legend-note">no encoding</span></div>`);
  }
  if (sizeBy === 'games') {
    const max = Math.max(1, ...(model?.nodes ?? []).map((n) => n.games));
    parts.push(`<div class="atlas-legend-block"><small>Size · games played</small><div class="atlas-legend-sizes"><i style="width:10px;height:10px"></i><i style="width:16px;height:16px"></i><span>1 – ${max} games</span></div></div>`);
  } else if (sizeBy === 'winRate') {
    parts.push(`<div class="atlas-legend-block"><small>Size · win rate</small><div class="atlas-legend-sizes"><i style="width:10px;height:10px"></i><i style="width:16px;height:16px"></i><span>0% – 100%</span></div></div>`);
  } else {
    parts.push(`<div class="atlas-legend-block"><small>Size · uniform</small><span class="atlas-legend-note">no encoding</span></div>`);
  }
  parts.push(`<div class="atlas-legend-block"><small>Weak evidence</small><span class="atlas-legend-note"><i class="atlas-swatch atlas-swatch-ring"></i>dashed ring = limited sample</span></div>`);
  if (overlay !== 'off') {
    parts.push(`<div class="atlas-legend-block"><small>Edges</small><span class="atlas-legend-note">arrow → the side it beats · width = advantage · opacity = evidence</span></div>`);
  }
  return `<div class="atlas-legend" data-testid="atlas-legend">${parts.join('')}</div>`;
}

// ── tooltip ──────────────────────────────────────────────────────────────
export function atlasTooltipHtml(node, model) {
  const h2hNote = node.evidence === 'insufficient' || node.evidence === 'very-low'
    ? `<div class="atlas-tip-warn">Limited evidence — ${node.games} qualifying games</div>` : '';
  const ci = node.winWilson95 ? ` [${formatAtlasMetric(node.winWilson95[0], 'winRate')}–${formatAtlasMetric(node.winWilson95[1], 'winRate')}]` : '';
  return `<div class="atlas-tip"><strong>${esc(policyLabel(node.id))}</strong><code>${esc(node.id)}</code>`
    + `<div class="atlas-tip-row"><span>${esc(model.xDef.label)}</span><b>${esc(formatAtlasMetric(node.x, model.xDef))}</b></div>`
    + `<div class="atlas-tip-row"><span>${esc(model.yDef.label)}</span><b>${esc(formatAtlasMetric(node.y, model.yDef))}</b></div>`
    + `<div class="atlas-tip-row"><span>Win rate</span><b>${esc(formatAtlasMetric(node.winRate, 'winRate'))}${esc(ci)}</b></div>`
    + `<div class="atlas-tip-row"><span>Games</span><b>${node.games}</b></div>`
    + h2hNote + `<div class="atlas-tip-hint">click to inspect · shift-click to compare</div></div>`;
}

// ── inspector ────────────────────────────────────────────────────────────
const SNAPSHOT_METRICS = ['responsePlayRate', 'miniTurnsPerGame', 'matchLength', 'scoreFrequency', 'advancedFrequency', 'privateChoiceDensity', 'prInteractionRate', 'drawRate'];

function snapshotRow(model, node, metricId) {
  const def = atlasMetric(metricId);
  const v = def.extract(node.stats);
  if (v == null) {
    return `<div class="atlas-snap-row is-na"><span class="atlas-snap-label">${esc(def.label)}</span><span class="atlas-snap-val">— <small>${esc(def.unavailableReason ?? 'unavailable')}</small></span></div>`;
  }
  const pctile = metricPercentile(model, metricId, v);
  const peers = [...(model.stats?.values() ?? [])].map((s) => def.extract(s)).filter(Number.isFinite);
  const maxV = peers.length ? Math.max(...peers) : 1;
  const minV = peers.length ? Math.min(...peers) : 0;
  const w = maxV > minV ? ((v - minV) / (maxV - minV)) * 100 : 50;
  const pctText = pctile == null ? '' : ` <small>p${Math.round(pctile * 100)}</small>`;
  return `<div class="atlas-snap-row"><span class="atlas-snap-label" title="${esc(def.description)}">${esc(def.label)}</span>`
    + `<span class="atlas-snap-track"><i style="width:${clamp(w, 1.5, 100).toFixed(1)}%"></i></span>`
    + `<span class="atlas-snap-val">${esc(formatAtlasMetric(v, def))}${pctText}</span></div>`;
}

function matchupListHtml(model, node) {
  const rows = (model.edges ?? [])
    .filter((e) => e.a === node.id || e.b === node.id)
    .map((e) => {
      const other = e.a === node.id ? e.b : e.a;
      const mine = e.a === node.id ? e.aWins : e.bWins;
      const theirs = e.a === node.id ? e.bWins : e.aWins;
      const wr = e.decisive > 0 ? mine / e.decisive : null;
      return { other, mine, theirs, e, wr };
    }).sort((x, y) => y.e.decisive - x.e.decisive || x.other.localeCompare(y.other));
  if (!rows.length) return '<div class="atlas-note">No cross-policy matchups recorded for this node.</div>';
  return `<ul class="atlas-matchup-list">${rows.map(({ other, mine, theirs, e, wr }) => {
    const warn = e.tier === 'insufficient' ? ' <small class="atlas-warn">low sample</small>' : '';
    return `<li><button class="atlas-matchup-row" data-compare-with="${esc(other)}" title="Compare with ${esc(other)}">`
      + `<span class="atlas-matchup-name">${esc(shortLabel(other))}</span>`
      + `<span class="atlas-matchup-record">${mine}–${theirs}</span>`
      + `<span class="atlas-matchup-wr ${wr != null && wr >= 0.5 ? 'pos' : 'neg'}">${wr == null ? '—' : `${(wr * 100).toFixed(0)}%`}</span>`
      + `<span class="badge badge-${e.tier === 'strong' ? 'supported' : e.tier === 'moderate' ? 'info' : 'warning'}">${e.tier}</span>${warn}</button></li>`;
  }).join('')}</ul>`;
}

export function atlasInspectorHtml({ model, selectedId, compareId }) {
  const nodes = model.nodes ?? [];
  const node = nodes.find((n) => n.id === selectedId) ?? null;
  const other = compareId ? nodes.find((n) => n.id === compareId) ?? null : null;

  if (!node) {
    return `<div class="atlas-inspector-empty" data-testid="atlas-inspector-empty">`
      + `<strong>No node selected</strong>`
      + `<p>Click a node to open its dossier. Shift-click a second node to compare. Hover for a compact readout; drag to pan, scroll to zoom.</p></div>`;
  }
  if (node && other) return atlasComparisonHtml(model, node, other);

  const s = node.stats;
  const ex = explainPosition(node, model);
  const seat = `${s.seat1Wins}/${s.seat1Games} seat-1 · ${s.seat2Wins}/${s.seat2Games} seat-2`;
  const evCls = { insufficient: 'warning', 'very-low': 'warning', low: 'info', moderate: 'info', high: 'supported' }[node.evidence] ?? 'info';
  return `<div class="atlas-inspector" data-testid="atlas-inspector">`
    + `<div class="atlas-inspector-head"><span class="atlas-node-chip" style="--node-color:${identityColor(node.id)}"></span>`
    + `<div><h3>${esc(policyLabel(node.id))}</h3><code class="mono">${esc(node.id)}</code></div>`
    + `<span class="badge badge-${evCls}">${esc(EVIDENCE_TIER_LABELS[node.evidence] ?? node.evidence)}</span></div>`
    + `<div class="dossier-section"><h4>Performance <small>observed</small></h4>`
    + `<dl class="definition-list">`
    + `<div><dt>Record</dt><dd>${s.crossWins}–${s.crossLosses}${s.crossDraws ? ` (${s.crossDraws} draws)` : ''} · cross-policy decisive</dd></div>`
    + `<div><dt>Win rate</dt><dd>${esc(formatAtlasMetric(node.winRate, 'winRate'))}${node.winWilson95 ? ` <small>95% CI ${esc(formatAtlasMetric(node.winWilson95[0], 'winRate'))}–${esc(formatAtlasMetric(node.winWilson95[1], 'winRate'))}</small>` : ''}</dd></div>`
    + `<div><dt>Games</dt><dd>${s.games}${s.selfPlayGames ? ` (${s.selfPlayGames} self-play)` : ''}</dd></div>`
    + `<div><dt>Avg differential</dt><dd>${esc(formatAtlasMetric(atlasMetric('avgScoreMargin').extract(s), 'avgScoreMargin'))}</dd></div>`
    + `<div><dt>Seats</dt><dd>${esc(seat)}</dd></div>`
    + `</dl></div>`
    + `<div class="dossier-section"><h4>Atlas position</h4><dl class="definition-list">`
    + `<div><dt>${esc(model.xDef.label)}</dt><dd>${esc(formatAtlasMetric(node.x, model.xDef))} <small>median ${esc(formatAtlasMetric(model.population.x.median, model.xDef))}</small></dd></div>`
    + `<div><dt>${esc(model.yDef.label)}</dt><dd>${esc(formatAtlasMetric(node.y, model.yDef))} <small>median ${esc(formatAtlasMetric(model.population.y.median, model.yDef))}</small></dd></div>`
    + `</dl></div>`
    + `<div class="dossier-section" data-testid="atlas-why"><h4>Why is this node here?</h4><p class="atlas-why">${esc(ex.x)}. ${esc(ex.y)}.</p>`
    + `<p class="footer-note">Deterministic comparison to the plotted population — observed measurements, not intent.</p></div>`
    + `<div class="dossier-section"><h4>Behavioral snapshot <small>vs population</small></h4>`
    + SNAPSHOT_METRICS.map((m) => snapshotRow(model, node, m)).join('') + `</div>`
    + `<div class="dossier-section"><h4>Head-to-head <small>click a row to compare</small></h4>${matchupListHtml(model, node)}</div>`
    + `<div class="atlas-inspector-actions"><button class="secondary-button" id="atlas-view-games" data-testid="atlas-view-games">◎ View source games</button>`
    + `<button class="ghost-button" id="atlas-clear-selection">Clear selection</button></div>`
    + `</div>`;
}

function atlasComparisonHtml(model, a, b) {
  const rows = comparisonRows(a, b, model);
  const h2h = headToHead(model, a.id, b.id);
  const cell = (v, def) => `<td>${v == null ? '—' : esc(formatAtlasMetric(v, def))}</td>`;
  const deltaCell = (row) => {
    if (row.delta == null) return '<td class="atlas-delta">—</td>';
    const isPct = row.unit === 'percent';
    const d = isPct ? `${row.delta >= 0 ? '+' : ''}${(row.delta * 100).toFixed(1)} pp` : `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(2)}`;
    const cls = row.delta > 0 ? 'pos' : row.delta < 0 ? 'neg' : '';
    return `<td class="atlas-delta ${cls}">${esc(d)}</td>`;
  };
  const h2hRow = h2h
    ? `<div class="atlas-h2h"><strong>Head-to-head</strong> ${esc(policyLabel(a.id))} ${h2h.wins}–${h2h.losses} vs ${esc(policyLabel(b.id))} in ${h2h.decisive} decisive games (${h2h.games} total)`
    + `${h2h.winRate != null ? ` · ${esc(formatAtlasMetric(h2h.winRate, 'winRate'))}` : ''} · <span class="badge badge-${h2h.tier === 'strong' ? 'supported' : h2h.tier === 'moderate' ? 'info' : 'warning'}">${h2h.tier}</span>`
    + `${h2h.tier === 'insufficient' ? ' <small class="atlas-warn">below evidence threshold — interpret cautiously</small>' : ''}</div>`
    : `<div class="atlas-h2h atlas-note">No head-to-head games recorded between these policies in this dataset.</div>`;
  return `<div class="atlas-inspector atlas-comparison" data-testid="atlas-comparison">`
    + `<div class="atlas-inspector-head"><div><h3>Comparison</h3><code class="mono">${esc(a.id)} ⇄ ${esc(b.id)}</code></div></div>`
    + `<div class="dossier-section"><table class="data-table atlas-compare-table"><thead><tr><th>Metric</th><th>${esc(policyLabel(a.id))}</th><th>${esc(policyLabel(b.id))}</th><th>Δ (A−B)</th></tr></thead><tbody>`
    + rows.map((r) => `<tr><td>${esc(r.label)}</td>${cell(r.a, r.def)}${cell(r.b, r.def)}${deltaCell(r)}</tr>`).join('')
    + `</tbody></table>${h2hRow}</div>`
    + `<div class="atlas-inspector-actions"><button class="secondary-button" id="atlas-view-games" data-testid="atlas-view-games">◎ View ${esc(policyLabel(a.id))} games</button>`
    + `<button class="ghost-button" id="atlas-clear-compare">Exit comparison</button></div>`
    + `</div>`;
}

// ── table alternative (a11y / export-friendly) ───────────────────────────
export function atlasTableAlt(model) {
  const rows = (model.nodes ?? []).map((n) => [
    n.id, formatAtlasMetric(n.x, model.xDef), formatAtlasMetric(n.y, model.yDef),
    n.winRate == null ? '—' : formatAtlasMetric(n.winRate, 'winRate'),
    String(n.games), n.evidence,
  ]);
  const head = `<tr><th>Policy</th><th>${esc(model.xDef.label)}</th><th>${esc(model.yDef.label)}</th><th>Win rate</th><th>Games</th><th>Evidence</th></tr>`;
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="data-table atlas-table-alt"><caption>Plotted Atlas nodes with axis values, record, and evidence tier</caption><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
