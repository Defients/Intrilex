// ═══════════════════════════════════════════════════════════════
// brain-fallback.js — WebGL detection + static 2D SVG fallback
// ═══════════════════════════════════════════════════════════════
// The detection logic is split into a pure, injectable function so it
// can be unit-tested in Node by passing a mock context factory.

/**
 * Detect WebGL availability via an injectable canvas/context factory.
 * In the browser, pass nothing and it uses document.createElement.
 * In tests, pass a factory returning null to simulate unavailable WebGL.
 * @param {() => HTMLCanvasElement} [canvasFactory]
 * @param {(canvas: HTMLCanvasElement) => WebGLRenderingContext|null} [contextFactory]
 * @returns {boolean}
 */
export function detectWebGL(canvasFactory, contextFactory) {
  try {
    const makeCanvas = canvasFactory ?? (() => {
      if (typeof document === 'undefined') return null;
      return document.createElement('canvas');
    });
    const canvas = makeCanvas();
    if (!canvas) return false;
    const getContext = contextFactory ?? ((c) => {
      return c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
    });
    const gl = getContext(canvas);
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Build a static 2D SVG radial mind-map fallback (no WebGL required).
 * Renders nodes as circles around a center, with simple link lines.
 * Clicking a node navigates to its route (if any).
 * @param {Array<{id:string,label:string,color:string,route?:string}>} nodes
 * @param {Array<{source:string,target:string}>} [edges]
 * @returns {string} SVG markup string
 */
export function buildFallbackSVG(nodes, edges = []) {
  const cx = 300, cy = 300, r = 220;
  const placed = {};
  const n = Math.max(1, nodes.length);
  nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    placed[node.id] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });

  const lines = edges.map((e) => {
    const a = placed[e.source], b = placed[e.target];
    if (!a || !b) return '';
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#284050" stroke-width="1" opacity="0.4"/>`;
  }).join('');

  const circles = nodes.map((node) => {
    const p = placed[node.id];
    const href = node.route ? `#/` + node.route.replace(/^\/+/, '') : null;
    const open = href ? `<a href="#${node.route}" data-route="${node.route}">` : '';
    const close = href ? '</a>' : '';
    return `${open}<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="8" fill="${node.color}" opacity="0.85"><title>${escapeXml(node.label)}</title></circle><text x="${p.x.toFixed(1)}" y="${(p.y + 22).toFixed(1)}" text-anchor="middle" fill="#a0b8c4" font-size="9">${escapeXml(node.label)}</text>${close}`;
  }).join('');

  return `<svg class="brain-fallback-svg" viewBox="0 0 600 600" role="img" aria-label="Intrilex mind map (2D fallback)">${lines}${circles}</svg>`;
}

function escapeXml(s) {
  return String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

/**
 * Render the fallback content into a container element.
 * @param {HTMLElement} container
 * @param {Array<object>} nodes
 * @param {Array<object>} edges
 */
export function renderFallback(container, nodes, edges) {
  if (!container) return;
  const svg = buildFallbackSVG(nodes, edges);
  container.innerHTML = `<div class="brain-fallback-wrap" role="region" aria-label="Mind map (2D view — WebGL unavailable)"><p class="brain-fallback-note">3D view unavailable — showing 2D mind map.</p>${svg}</div>`;
}
