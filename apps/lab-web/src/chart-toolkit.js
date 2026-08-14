// ═══════════════════════════════════════════════════════════════
// chart-toolkit.js — Pure SVG chart primitives.
// Every function returns an SVG string. No DOM mutation, no deps.
// Callers inject via innerHTML. SVG elements carry CSS classes for theming.
// ═══════════════════════════════════════════════════════════════

/**
 * Escape text for safe inclusion in SVG markup.
 * @param {string|number|null} value
 * @returns {string}
 */
function escSvg(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * Format a numeric value for display in tooltips/labels.
 * @param {number} v
 * @returns {string}
 */
function fmtNum(v) {
  if (!Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(3);
}

/**
 * Wrap an SVG body with the standard container attributes used by every chart.
 * Includes role="img" and a <title>/<desc> pair for accessibility.
 * @param {object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {string} opts.viewBox
 * @param {string} opts.className
 * @param {string} [opts.title]
 * @param {string} [opts.desc]
 * @param {string} [opts.ariaLabel]
 * @param {string} body - inner SVG markup
 * @returns {string}
 */
function svgWrap({ width, height, viewBox, className, title, desc, ariaLabel }, body) {
  const titleId = title ? ` title="${escSvg(title)}"` : '';
  const descEl = desc ? `<desc>${escSvg(desc)}</desc>` : '';
  const titleEl = title ? `<title>${escSvg(title)}</title>` : '';
  const aria = ariaLabel ? ` aria-label="${escSvg(ariaLabel)}"` : (title ? ` aria-label="${escSvg(title)}"` : '');
  return `<svg class="${escSvg(className)}" role="img"${aria} width="${width}" height="${height}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg"${titleId}>${titleEl}${descEl}${body}</svg>`;
}

// ── radarChart ───────────────────────────────────────────────────
/**
 * Render a radar (spider) chart from normalized axis values.
 * @param {object} opts
 * @param {Array<{label:string,value:number,rawText?:string}>} opts.axes - 3–8 axes, value in [0,1]
 * @param {number} [opts.max] - maximum value for normalization (default 1)
 * @param {number} [opts.size] - pixel size of the square SVG (default 240)
 * @param {string} [opts.color] - fill/stroke color (default '#4fd387')
 * @param {string} [opts.title]
 * @param {string} [opts.ariaLabel]
 * @returns {string} SVG string
 */
export function radarChart({ axes, max = 1, size = 240, color = '#4fd387', title, ariaLabel } = {}) {
  const list = Array.isArray(axes) ? axes.filter(a => a && a.label != null) : [];
  if (list.length < 3) return svgWrap({ width: size, height: size, viewBox: `0 0 ${size} ${size}`, className: 'ix-chart-radar', title, ariaLabel, desc: 'Radar chart requires at least 3 axes.' }, '');
  const n = Math.min(list.length, 8);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;
  const labelRadius = radius + Math.max(18, size * 0.08);
  const safeMax = max > 0 ? max : 1;
  const angles = [];
  for (let i = 0; i < n; i += 1) angles.push((Math.PI * 2 * i) / n - Math.PI / 2);
  // Spokes + concentric grid rings (3 levels)
  const rings = [0.33, 0.66, 1].map(level => {
    const pts = angles.map(a => `${(cx + Math.cos(a) * radius * level).toFixed(2)},${(cy + Math.sin(a) * radius * level).toFixed(2)}`).join(' ');
    return `<polygon class="ix-radar-ring" points="${pts}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  }).join('');
  const spokes = angles.map(a => {
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    return `<line class="ix-radar-spoke" x1="${cx.toFixed(2)}" y1="${cy.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
  }).join('');
  // Data polygon
  const dataPts = angles.map((a, i) => {
    const v = Math.max(0, Math.min(1, Number(list[i]?.value ?? 0) / safeMax));
    const x = cx + Math.cos(a) * radius * v;
    const y = cy + Math.sin(a) * radius * v;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const dataDots = angles.map((a, i) => {
    const v = Math.max(0, Math.min(1, Number(list[i]?.value ?? 0) / safeMax));
    const x = cx + Math.cos(a) * radius * v;
    const y = cy + Math.sin(a) * radius * v;
    const raw = list[i]?.rawText ? ` — ${escSvg(list[i].rawText)}` : '';
    return `<circle class="ix-radar-point" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3" fill="${escSvg(color)}"><title>${escSvg(list[i]?.label)}${raw}</title></circle>`;
  }).join('');
  const labels = angles.map((a, i) => {
    const x = cx + Math.cos(a) * labelRadius;
    const y = cy + Math.sin(a) * labelRadius;
    const anchor = Math.abs(Math.cos(a)) < 0.25 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
    const valPct = `${(Math.max(0, Math.min(1, Number(list[i]?.value ?? 0) / safeMax)) * 100).toFixed(0)}%`;
    return `<text class="ix-radar-label" x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="rgba(255,255,255,0.78)">${escSvg(list[i]?.label)}</text><text class="ix-radar-value" x="${x.toFixed(2)}" y="${(y + 13).toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" fill="${escSvg(color)}">${valPct}</text>`;
  }).join('');
  const body = `${rings}${spokes}<polygon class="ix-radar-polygon" points="${dataPts}" fill="${escSvg(color)}" fill-opacity="0.22" stroke="${escSvg(color)}" stroke-width="2" stroke-linejoin="round"/>${dataDots}${labels}`;
  const desc = `Radar chart with ${n} axes: ${list.slice(0, n).map(a => a.label).join(', ')}.`;
  return svgWrap({ width: size, height: size, viewBox: `0 0 ${size} ${size}`, className: 'ix-chart-radar', title, desc, ariaLabel }, body);
}

// ── barChart ─────────────────────────────────────────────────────
/**
 * Render a horizontal bar chart.
 * @param {object} opts
 * @param {Array<{label:string,value:number,color?:string}>} opts.items
 * @param {number} [opts.maxValue] - explicit max; auto-computed if omitted
 * @param {number} [opts.width] - SVG width (default 400)
 * @param {number} [opts.barHeight] - per-bar height (default 24)
 * @param {string} [opts.title]
 * @param {string} [opts.ariaLabel]
 * @returns {string} SVG string
 */
export function barChart({ items, maxValue, width = 400, barHeight = 24, title, ariaLabel } = {}) {
  const list = Array.isArray(items) ? items.filter(i => i && i.label != null) : [];
  if (list.length === 0) return svgWrap({ width, height: 40, viewBox: `0 0 ${width} 40`, className: 'ix-chart-bar', title, ariaLabel, desc: 'No data available for bar chart.' }, `<text x="${width / 2}" y="22" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.5)">No data</text>`);
  const labelW = Math.min(160, Math.max(60, Math.max(...list.map(i => String(i.label).length)) * 7));
  const gap = 6;
  const chartW = width - labelW - 60;
  const height = list.length * (barHeight + gap) + 16;
  const vals = list.map(i => Number(i.value ?? 0));
  const max = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : (Math.max(...vals, 0) || 1);
  const defaultColor = '#4fd387';
  const bars = list.map((item, i) => {
    const v = Number(item.value ?? 0);
    const w = Math.max(0, Math.min(chartW, (v / max) * chartW));
    const y = i * (barHeight + gap) + 8;
    const color = item.color ?? defaultColor;
    const label = escSvg(item.label);
    const valueText = fmtNum(v);
    return `<text class="ix-bar-label" x="${labelW - 8}" y="${y + barHeight / 2 + 3}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.82)">${label}</text><rect class="ix-bar-track" x="${labelW}" y="${y}" width="${chartW}" height="${barHeight}" rx="3" fill="rgba(255,255,255,0.05)"/><rect class="ix-bar-fill" x="${labelW}" y="${y}" width="${w.toFixed(2)}" height="${barHeight}" rx="3" fill="${escSvg(color)}"><title>${label}: ${valueText}</title></rect><text class="ix-bar-value" x="${labelW + w + 5}" y="${y + barHeight / 2 + 3}" font-size="11" fill="rgba(255,255,255,0.7)">${valueText}</text>`;
  }).join('');
  const desc = `Bar chart with ${list.length} items.`;
  return svgWrap({ width, height, viewBox: `0 0 ${width} ${height}`, className: 'ix-chart-bar', title, desc, ariaLabel }, bars);
}

// ── heatmap ──────────────────────────────────────────────────────
/**
 * Render a heatmap grid.
 * @param {object} opts
 * @param {string[]} opts.rows - row labels
 * @param {string[]} opts.cols - column labels
 * @param {Array<Array<[number, *]>>} opts.cells - rows×cols matrix; each cell is [value, meta?]
 * @param {(value:number,meta:*)=>string} [opts.colorScale] - maps value → rgba() string
 * @param {number} [opts.cellSize] - pixel size of each cell (default 36)
 * @param {string} [opts.title]
 * @param {string} [opts.ariaLabel]
 * @returns {string} SVG string
 */
export function heatmap({ rows, cols, cells, colorScale, cellSize = 36, title, ariaLabel, cellAttrs } = {}) {
  const rowLabels = Array.isArray(rows) ? rows : [];
  const colLabels = Array.isArray(cols) ? cols : [];
  const matrix = Array.isArray(cells) ? cells : [];
  if (rowLabels.length === 0 || colLabels.length === 0) {
    return svgWrap({ width: 200, height: 60, viewBox: `0 0 200 60`, className: 'ix-chart-heatmap', title, ariaLabel, desc: 'No data available for heatmap.' }, `<text x="100" y="32" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.5)">No data</text>`);
  }
  const labelW = Math.min(140, Math.max(50, Math.max(...rowLabels.map(r => String(r).length)) * 7));
  const labelH = Math.min(120, Math.max(40, Math.max(...colLabels.map(c => String(c).length)) * 7));
  const w = labelW + colLabels.length * cellSize + 8;
  const h = labelH + rowLabels.length * cellSize + 8;
  const scale = typeof colorScale === 'function' ? colorScale : defaultDivergingScale;
  const colHeaders = colLabels.map((c, i) => {
    const x = labelW + i * cellSize + cellSize / 2;
    const y = labelH - 6;
    return `<text class="ix-heatmap-col-label" x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.7)" transform="rotate(-45 ${x.toFixed(2)} ${(y - 4).toFixed(2)})">${escSvg(c)}</text>`;
  }).join('');
  const rowHeaders = rowLabels.map((r, i) => {
    const y = labelH + i * cellSize + cellSize / 2;
    return `<text class="ix-heatmap-row-label" x="${labelW - 6}" y="${(y + 3).toFixed(2)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.7)">${escSvg(r)}</text>`;
  }).join('');
  const cellRects = [];
  for (let r = 0; r < rowLabels.length; r += 1) {
    for (let c = 0; c < colLabels.length; c += 1) {
      const cell = matrix[r]?.[c];
      const x = labelW + c * cellSize;
      const y = labelH + r * cellSize;
      if (!cell) {
        cellRects.push(`<rect class="ix-heatmap-cell ix-heatmap-empty" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellSize}" height="${cellSize}" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)"/>`);
        continue;
      }
      const [value, meta] = Array.isArray(cell) ? cell : [cell, null];
      const fill = scale(value, meta);
      const valText = fmtNum(value);
      const tip = `${escSvg(rowLabels[r])} vs ${escSvg(colLabels[c])}: ${valText}`;
      const extraAttrs = typeof cellAttrs === 'function' ? (cellAttrs(r, c, meta) || '') : '';
      cellRects.push(`<rect class="ix-heatmap-cell" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellSize}" height="${cellSize}" fill="${escSvg(fill)}" stroke="rgba(255,255,255,0.08)"${extraAttrs}><title>${tip}</title></rect>`);
    }
  }
  const desc = `Heatmap with ${rowLabels.length} rows and ${colLabels.length} columns.`;
  return svgWrap({ width: w, height: h, viewBox: `0 0 ${w} ${h}`, className: 'ix-chart-heatmap', title, desc, ariaLabel }, `${colHeaders}${rowHeaders}${cellRects.join('')}`);
}

/**
 * Default diverging color scale: green for positive, red for negative.
 * @param {number} value
 * @returns {string}
 */
function defaultDivergingScale(value) {
  const v = Number(value ?? 0);
  const intensity = Math.min(Math.abs(v), 1);
  const alpha = 0.15 + intensity * 0.7;
  if (v >= 0) return `rgba(79,211,135,${alpha.toFixed(3)})`;
  return `rgba(240,93,120,${alpha.toFixed(3)})`;
}

// ── sparkline ────────────────────────────────────────────────────
/**
 * Render a small inline line chart.
 * @param {object} opts
 * @param {number[]} opts.values
 * @param {number} [opts.width] - default 120
 * @param {number} [opts.height] - default 32
 * @param {string} [opts.color] - default '#4fd387'
 * @param {string} [opts.title]
 * @param {string} [opts.ariaLabel]
 * @returns {string} SVG string
 */
export function sparkline({ values, width = 120, height = 32, color = '#4fd387', title, ariaLabel } = {}) {
  const list = Array.isArray(values) ? values.map(v => Number(v ?? 0)).filter(v => Number.isFinite(v)) : [];
  if (list.length === 0) return svgWrap({ width, height, viewBox: `0 0 ${width} ${height}`, className: 'ix-chart-sparkline', title, ariaLabel, desc: 'No data for sparkline.' }, '');
  if (list.length === 1) {
    const y = height / 2;
    return svgWrap({ width, height, viewBox: `0 0 ${width} ${height}`, className: 'ix-chart-sparkline', title, desc: `Single value: ${fmtNum(list[0])}.`, ariaLabel }, `<line x1="2" y1="${y}" x2="${width - 2}" y2="${y}" stroke="${escSvg(color)}" stroke-width="2"/>`);
  }
  const min = Math.min(...list);
  const max = Math.max(...list);
  const range = max - min || 1;
  const stepX = (width - 4) / (list.length - 1);
  const pts = list.map((v, i) => {
    const x = 2 + i * stepX;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const polyline = `<polyline class="ix-sparkline-line" points="${pts.join(' ')}" fill="none" stroke="${escSvg(color)}" stroke-width="1.5" stroke-linejoin="round"/>`;
  const areaPts = `2,${height - 2} ${pts.join(' ')} ${(2 + (list.length - 1) * stepX).toFixed(2)},${height - 2}`;
  const area = `<polygon class="ix-sparkline-area" points="${areaPts}" fill="${escSvg(color)}" fill-opacity="0.12"/>`;
  const desc = `Sparkline of ${list.length} values, range ${fmtNum(min)} to ${fmtNum(max)}.`;
  return svgWrap({ width, height, viewBox: `0 0 ${width} ${height}`, className: 'ix-chart-sparkline', title, desc, ariaLabel }, `${area}${polyline}`);
}

// ── donutChart ───────────────────────────────────────────────────
/**
 * Render a donut chart from segments.
 * @param {object} opts
 * @param {Array<{label:string,value:number,color?:string}>} opts.segments
 * @param {number} [opts.size] - default 160
 * @param {string} [opts.title]
 * @param {string} [opts.ariaLabel]
 * @returns {string} SVG string
 */
export function donutChart({ segments, size = 160, title, ariaLabel } = {}) {
  const list = Array.isArray(segments) ? segments.filter(s => s && s.label != null && Number(s.value) > 0) : [];
  const total = list.reduce((sum, s) => sum + Number(s.value ?? 0), 0);
  if (total <= 0) return svgWrap({ width: size, height: size, viewBox: `0 0 ${size} ${size}`, className: 'ix-chart-donut', title, ariaLabel, desc: 'No data for donut chart.' }, `<text x="${size / 2}" y="${size / 2}" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.5)">No data</text>`);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.42;
  const inner = size * 0.26;
  const palette = ['#4fd387', '#5ad7e8', '#a78bfa', '#f1bd5d', '#f0786f', '#7dd3fc', '#fbbf24', '#34d399'];
  let angle = -Math.PI / 2;
  const arcs = list.map((seg, i) => {
    const v = Number(seg.value ?? 0);
    const sweep = (v / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const color = seg.color ?? palette[i % palette.length];
    const path = donutArcPath(cx, cy, outer, inner, a0, a1);
    const pctVal = `${((v / total) * 100).toFixed(1)}%`;
    return `<path class="ix-donut-segment" d="${path}" fill="${escSvg(color)}" stroke="rgba(7,11,17,0.6)" stroke-width="1"><title>${escSvg(seg.label)}: ${fmtNum(v)} (${pctVal})</title></path>`;
  }).join('');
  // Legend
  const legend = list.map((seg, i) => {
    const color = seg.color ?? palette[i % palette.length];
    const y = 12 + i * 14;
    const pctVal = `${((Number(seg.value ?? 0) / total) * 100).toFixed(1)}%`;
    return `<rect x="${size + 8}" y="${y - 8}" width="10" height="10" fill="${escSvg(color)}"/><text x="${size + 24}" y="${y}" font-size="11" fill="rgba(255,255,255,0.8)">${escSvg(seg.label)} (${pctVal})</text>`;
  }).join('');
  const totalW = size + 8 + Math.max(120, Math.max(...list.map(s => String(s.label).length)) * 7 + 60);
  const desc = `Donut chart with ${list.length} segments totaling ${fmtNum(total)}.`;
  return svgWrap({ width: totalW, height: Math.max(size, list.length * 14 + 12), viewBox: `0 0 ${totalW} ${Math.max(size, list.length * 14 + 12)}`, className: 'ix-chart-donut', title, desc, ariaLabel }, `${arcs}<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="14" font-weight="600" fill="rgba(255,255,255,0.9)">${fmtNum(total)}</text>${legend}`);
}

/**
 * Build an SVG donut arc path between two angles.
 * @param {number} cx
 * @param {number} cy
 * @param {number} outer
 * @param {number} inner
 * @param {number} a0
 * @param {number} a1
 * @returns {string}
 */
function donutArcPath(cx, cy, outer, inner, a0, a1) {
  const largeArc = (a1 - a0) > Math.PI ? 1 : 0;
  const ox0 = cx + Math.cos(a0) * outer;
  const oy0 = cy + Math.sin(a0) * outer;
  const ox1 = cx + Math.cos(a1) * outer;
  const oy1 = cy + Math.sin(a1) * outer;
  const ix0 = cx + Math.cos(a0) * inner;
  const iy0 = cy + Math.sin(a0) * inner;
  const ix1 = cx + Math.cos(a1) * inner;
  const iy1 = cy + Math.sin(a1) * inner;
  return `M ${ox0.toFixed(2)} ${oy0.toFixed(2)} A ${outer.toFixed(2)} ${outer.toFixed(2)} 0 ${largeArc} 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)} L ${ix1.toFixed(2)} ${iy1.toFixed(2)} A ${inner.toFixed(2)} ${inner.toFixed(2)} 0 ${largeArc} 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)} Z`;
}

// ── lineChart ────────────────────────────────────────────────────
/**
 * Render a multi-series line chart with axis labels and a legend.
 * @param {object} opts
 * @param {Array<{label:string,values:number[],color?:string}>} opts.series
 * @param {string[]} [opts.xLabels] - labels for x-axis ticks
 * @param {number} [opts.width] - default 520
 * @param {number} [opts.height] - default 280
 * @param {string} [opts.title]
 * @param {string} [opts.ariaLabel]
 * @returns {string} SVG string
 */
export function lineChart({ series, xLabels, width = 520, height = 280, title, ariaLabel } = {}) {
  const list = Array.isArray(series) ? series.filter(s => s && s.label != null && Array.isArray(s.values)) : [];
  if (list.length === 0) return svgWrap({ width, height, viewBox: `0 0 ${width} ${height}`, className: 'ix-chart-line', title, ariaLabel, desc: 'No data for line chart.' }, `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.5)">No data</text>`);
  const palette = ['#4fd387', '#5ad7e8', '#a78bfa', '#f1bd5d', '#f0786f', '#7dd3fc', '#fbbf24', '#34d399'];
  const padL = 48, padR = 16, padT = 16, padB = 40;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const allVals = list.flatMap(s => s.values.map(v => Number(v ?? 0))).filter(Number.isFinite);
  const min = allVals.length ? Math.min(...allVals) : 0;
  const max = allVals.length ? Math.max(...allVals) : 1;
  const range = max - min || 1;
  const maxLen = Math.max(...list.map(s => s.values.length), 1);
  const stepX = maxLen > 1 ? chartW / (maxLen - 1) : 0;
  // Grid lines (4 horizontal)
  const grid = [0, 0.25, 0.5, 0.75, 1].map(level => {
    const y = padT + chartH * (1 - level);
    const val = min + range * level;
    return `<line x1="${padL}" y1="${y.toFixed(2)}" x2="${padL + chartW}" y2="${y.toFixed(2)}" stroke="rgba(255,255,255,0.06)"/><text x="${padL - 6}" y="${(y + 3).toFixed(2)}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.5)">${fmtNum(val)}</text>`;
  }).join('');
  // X labels
  const xLab = Array.isArray(xLabels) && xLabels.length ? xLabels : [];
  const xTicks = xLab.map((label, i) => {
    if (i >= maxLen) return '';
    const x = padL + i * stepX;
    return `<text x="${x.toFixed(2)}" y="${padT + chartH + 14}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.5)">${escSvg(label)}</text>`;
  }).join('');
  // Series polylines
  const lines = list.map((s, i) => {
    const color = s.color ?? palette[i % palette.length];
    const pts = s.values.map((v, j) => {
      const x = padL + j * stepX;
      const y = padT + chartH * (1 - (Number(v ?? 0) - min) / range);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    return `<polyline class="ix-line-series" points="${pts}" fill="none" stroke="${escSvg(color)}" stroke-width="2" stroke-linejoin="round"><title>${escSvg(s.label)}</title></polyline>`;
  }).join('');
  // Legend
  const legend = list.map((s, i) => {
    const color = s.color ?? palette[i % palette.length];
    const x = padL + (i % 4) * (chartW / 4);
    const y = height - 14 + Math.floor(i / 4) * -0;
    return `<line x1="${x.toFixed(2)}" y1="${y}" x2="${(x + 12).toFixed(2)}" y2="${y}" stroke="${escSvg(color)}" stroke-width="2"/><text x="${(x + 16).toFixed(2)}" y="${(y + 3).toFixed(2)}" font-size="10" fill="rgba(255,255,255,0.75)">${escSvg(s.label)}</text>`;
  }).join('');
  const desc = `Line chart with ${list.length} series across ${maxLen} points.`;
  return svgWrap({ width, height, viewBox: `0 0 ${width} ${height}`, className: 'ix-chart-line', title, desc, ariaLabel }, `${grid}${xTicks}${lines}${legend}`);
}

// ── stackedBarChart ──────────────────────────────────────────────
/**
 * Render a stacked bar chart (one stacked bar per category).
 * @param {object} opts
 * @param {Array<{label:string,stack:[{label:string,value:number,color?:string}]}>} opts.items
 * @param {number} [opts.width] - default 480
 * @param {number} [opts.barHeight] - default 28
 * @param {string[]} [opts.legendLabels] - segment labels for legend
 * @param {string} [opts.title]
 * @param {string} [opts.ariaLabel]
 * @returns {string} SVG string
 */
export function stackedBarChart({ items, width = 480, barHeight = 28, legendLabels, title, ariaLabel } = {}) {
  const list = Array.isArray(items) ? items.filter(i => i && i.label != null) : [];
  if (list.length === 0) return svgWrap({ width, height: 40, viewBox: `0 0 ${width} 40`, className: 'ix-chart-stacked-bar', title, ariaLabel, desc: 'No data for stacked bar chart.' }, `<text x="${width / 2}" y="22" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.5)">No data</text>`);
  const palette = ['#4fd387', '#5ad7e8', '#a78bfa', '#f1bd5d', '#f0786f', '#7dd3fc'];
  const labelW = Math.min(150, Math.max(60, Math.max(...list.map(i => String(i.label).length)) * 7));
  const gap = 6;
  const chartW = width - labelW - 16;
  const maxTotal = Math.max(...list.map(i => (i.stack ?? []).reduce((s, seg) => s + Number(seg.value ?? 0), 0)), 1);
  const height = list.length * (barHeight + gap) + 16;
  const bars = list.map((item, i) => {
    const y = i * (barHeight + gap) + 8;
    let x = labelW;
    const segs = (item.stack ?? []).map((seg, j) => {
      const v = Number(seg.value ?? 0);
      const w = (v / maxTotal) * chartW;
      const color = seg.color ?? palette[j % palette.length];
      const rect = `<rect class="ix-stacked-segment" x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${barHeight}" fill="${escSvg(color)}"><title>${escSvg(item.label)} · ${escSvg(seg.label)}: ${fmtNum(v)}</title></rect>`;
      x += w;
      return rect;
    }).join('');
    return `<text class="ix-stacked-label" x="${labelW - 8}" y="${y + barHeight / 2 + 3}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.82)">${escSvg(item.label)}</text>${segs}`;
  }).join('');
  // Legend
  const legend = Array.isArray(legendLabels) ? legendLabels.map((label, i) => {
    const color = palette[i % palette.length];
    const lx = 8 + i * 110;
    return `<rect x="${lx}" y="${height - 4}" width="10" height="10" fill="${escSvg(color)}"/><text x="${lx + 14}" y="${height + 4}" font-size="10" fill="rgba(255,255,255,0.75)">${escSvg(label)}</text>`;
  }).join('') : '';
  const totalH = height + (legendLabels?.length ? 18 : 0);
  const desc = `Stacked bar chart with ${list.length} categories.`;
  return svgWrap({ width, height: totalH, viewBox: `0 0 ${width} ${totalH}`, className: 'ix-chart-stacked-bar', title, desc, ariaLabel }, `${bars}${legend}`);
}

// ── chartTableAlternative ─────────────────────────────────────────
/**
 * Render a tabular data alternative for a chart (accessibility / "View as table").
 * @param {object} opts
 * @param {string[]} opts.headers
 * @param {Array<Array<*>>} opts.rows - each row is an array of cell values
 * @param {string} [opts.caption]
 * @returns {string} HTML string (a <table> with class ix-chart-table-alt)
 */
export function chartTableAlternative({ headers, rows, caption } = {}) {
  const h = Array.isArray(headers) ? headers : [];
  const r = Array.isArray(rows) ? rows : [];
  if (h.length === 0) return '<div class="ix-chart-table-alt-empty">No tabular data available.</div>';
  const head = `<tr>${h.map(x => `<th>${escSvg(x)}</th>`).join('')}</tr>`;
  const body = r.map(row => `<tr>${(Array.isArray(row) ? row : [row]).map(c => `<td>${typeof c === 'number' ? fmtNum(c) : escSvg(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="ix-chart-table-alt data-table">${caption ? `<caption>${escSvg(caption)}</caption>` : ''}<thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// ── sankeyFlow ───────────────────────────────────────────────────
/**
 * Render a Sankey-style flow diagram showing source→target transition
 * frequencies. Nodes are positioned in two columns (source left, target
 * right). Links are cubic Bézier curves with stroke-width proportional
 * to value. Node height is proportional to total flow.
 *
 * @param {object} opts
 * @param {Array<{id:string,label:string}>} opts.nodes - unique source/target IDs
 * @param {Array<{source:string,target:string,value:number,color?:string}>} opts.links - flow counts
 * @param {number} [opts.width] - SVG width (default 600)
 * @param {number} [opts.height] - SVG height (default 400)
 * @param {number} [opts.nodeWidth] - width of node bars (default 14)
 * @param {number} [opts.nodeGap] - vertical gap between nodes (default 8)
 * @param {string} [opts.title]
 * @param {string} [opts.ariaLabel]
 * @returns {string} SVG string
 */
export function sankeyFlow({ nodes, links, width = 600, height = 400, nodeWidth = 14, nodeGap = 8, title, ariaLabel } = {}) {
  const nodeList = Array.isArray(nodes) ? nodes.filter(n => n && n.id != null) : [];
  const linkList = Array.isArray(links) ? links.filter(l => l && l.source != null && l.target != null && Number(l.value) > 0) : [];
  if (nodeList.length === 0 || linkList.length === 0) {
    return svgWrap({ width, height, viewBox: `0 0 ${width} ${height}`, className: 'ix-chart-sankey', title, ariaLabel, desc: 'No data available for Sankey flow diagram.' }, `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.5)">No data</text>`);
  }
  // Separate source nodes (left column) and target nodes (right column).
  // A node can appear on both sides if it is both a source and a target.
  const sourceIds = [...new Set(linkList.map(l => l.source))];
  const targetIds = [...new Set(linkList.map(l => l.target))];
  // Compute total flow per node (as source and as target)
  const sourceTotals = {};
  const targetTotals = {};
  for (const l of linkList) {
    sourceTotals[l.source] = (sourceTotals[l.source] ?? 0) + Number(l.value);
    targetTotals[l.target] = (targetTotals[l.target] ?? 0) + Number(l.value);
  }
  // Sort by total flow descending for visual stability
  const leftNodes = sourceIds.sort((a, b) => (sourceTotals[b] ?? 0) - (sourceTotals[a] ?? 0));
  const rightNodes = targetIds.sort((a, b) => (targetTotals[b] ?? 0) - (targetTotals[a] ?? 0));
  // Layout: position nodes vertically. Node height proportional to total flow.
  const totalSourceFlow = leftNodes.reduce((s, id) => s + (sourceTotals[id] ?? 0), 0) || 1;
  const totalTargetFlow = rightNodes.reduce((s, id) => s + (targetTotals[id] ?? 0), 0) || 1;
  const padT = 20, padB = 20;
  const availH = height - padT - padB;
  // Compute y positions and heights for left nodes
  const leftLayout = {};
  let leftY = padT;
  for (const id of leftNodes) {
    const flow = sourceTotals[id] ?? 0;
    const nodeH = Math.max(4, (flow / totalSourceFlow) * availH - nodeGap);
    leftLayout[id] = { y: leftY, h: nodeH, totalFlow: flow };
    leftY += nodeH + nodeGap;
  }
  // Compute y positions and heights for right nodes
  const rightLayout = {};
  let rightY = padT;
  for (const id of rightNodes) {
    const flow = targetTotals[id] ?? 0;
    const nodeH = Math.max(4, (flow / totalTargetFlow) * availH - nodeGap);
    rightLayout[id] = { y: rightY, h: nodeH, totalFlow: flow };
    rightY += nodeH + nodeGap;
  }
  const leftX = 60;
  const rightX = width - 60 - nodeWidth;
  // Build a label map
  const labelMap = {};
  for (const n of nodeList) labelMap[n.id] = n.label ?? n.id;
  // Render left nodes
  const leftRects = leftNodes.map(id => {
    const ly = leftLayout[id];
    const label = escSvg(labelMap[id] ?? id);
    return `<rect class="ix-sankey-node ix-sankey-node-left" x="${leftX}" y="${ly.y.toFixed(2)}" width="${nodeWidth}" height="${ly.h.toFixed(2)}" rx="2" fill="rgba(79,211,135,0.7)" data-node-id="${escSvg(id)}"><title>${label}: ${fmtNum(ly.totalFlow)} outgoing</title></rect><text class="ix-sankey-label" x="${leftX - 6}" y="${(ly.y + ly.h / 2 + 3).toFixed(2)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.82)">${label}</text>`;
  }).join('');
  // Render right nodes
  const rightRects = rightNodes.map(id => {
    const ry = rightLayout[id];
    const label = escSvg(labelMap[id] ?? id);
    return `<rect class="ix-sankey-node ix-sankey-node-right" x="${rightX}" y="${ry.y.toFixed(2)}" width="${nodeWidth}" height="${ry.h.toFixed(2)}" rx="2" fill="rgba(90,215,232,0.7)" data-node-id="${escSvg(id)}"><title>${label}: ${fmtNum(ry.totalFlow)} incoming</title></rect><text class="ix-sankey-label" x="${rightX + nodeWidth + 6}" y="${(ry.y + ry.h / 2 + 3).toFixed(2)}" text-anchor="start" font-size="10" fill="rgba(255,255,255,0.82)">${label}</text>`;
  }).join('');
  // Render links as cubic Bézier curves
  // Track vertical offset within each source/target node for stacking
  const sourceOffsets = {};
  for (const id of leftNodes) sourceOffsets[id] = leftLayout[id].y;
  const targetOffsets = {};
  for (const id of rightNodes) targetOffsets[id] = rightLayout[id].y;
  const maxLinkValue = Math.max(...linkList.map(l => Number(l.value)), 1);
  const linkPaths = linkList.map(l => {
    const v = Number(l.value);
    const sLayout = leftLayout[l.source];
    const tLayout = rightLayout[l.target];
    if (!sLayout || !tLayout) return '';
    // Stack links within each node proportionally
    const sFlow = sourceTotals[l.source] ?? 1;
    const tFlow = targetTotals[l.target] ?? 1;
    const sH = (v / sFlow) * sLayout.h;
    const tH = (v / tFlow) * tLayout.h;
    const sy = sourceOffsets[l.source];
    const ty = targetOffsets[l.target];
    sourceOffsets[l.source] += sH;
    targetOffsets[l.target] += tH;
    const sx0 = leftX + nodeWidth;
    const sx1 = rightX;
    const ctrlOffset = (sx1 - sx0) * 0.5;
    const color = l.color ?? 'rgba(167,139,250,0.35)';
    const strokeW = Math.max(1, (v / maxLinkValue) * 24);
    const sLabel = escSvg(labelMap[l.source] ?? l.source);
    const tLabel = escSvg(labelMap[l.target] ?? l.target);
    const path = `M ${sx0.toFixed(2)} ${sy.toFixed(2)} C ${(sx0 + ctrlOffset).toFixed(2)} ${sy.toFixed(2)}, ${(sx1 - ctrlOffset).toFixed(2)} ${ty.toFixed(2)}, ${sx1.toFixed(2)} ${ty.toFixed(2)}`;
    return `<path class="ix-sankey-link" d="${path}" fill="none" stroke="${escSvg(color)}" stroke-width="${strokeW.toFixed(2)}" data-source="${escSvg(l.source)}" data-target="${escSvg(l.target)}"><title>${sLabel} → ${tLabel}: ${fmtNum(v)}</title></path>`;
  }).join('');
  const desc = `Sankey flow diagram with ${leftNodes.length} source nodes, ${rightNodes.length} target nodes, and ${linkList.length} links.`;
  return svgWrap({ width, height, viewBox: `0 0 ${width} ${height}`, className: 'ix-chart-sankey', title, desc, ariaLabel }, `${linkPaths}${leftRects}${rightRects}`);
}
