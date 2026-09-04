// ═══════════════════════════════════════════════════════════════
// brain-topology.mjs — Complete 2D Brain topology (no WebGL required)
// ═══════════════════════════════════════════════════════════════
// This module formalizes what the Brain's job IS — a mechanic/evidence
// topology explorer — and provides a complete 2D equivalent of the 3D
// Three.js Brain that requires no WebGL, no Three.js, and no canvas.
//
// It contains:
//   1. BRAIN_JOB_DESCRIPTION + getBrainJobSummary() — formal purpose
//   2. compute2DLayout() — deterministic force-directed 2D layout
//   3. build2DTopology() — render-ready structure from graph layers
//   4. render2DTopology() — pure-SVG renderer with hover/click/search/
//      layer-switch/zoom-pan, returning a controller
//   5. computeTopologyMetrics() — graph-theory metrics
//
// The layout + metrics are pure functions (work in Node for testing).
// The renderer uses standard DOM SVG APIs and only runs in a browser.
// hashCanonical is imported from @intrilex/shared (browser-bundleable).

import { hashCanonical } from '@intrilex/shared';
import {
  LAYER_IDS,
  CATEGORY_COLORS,
  EDGE_COLORS,
  weightToRadius,
} from './brain-data.js';

// ── Types ─────────────────────────────────────────────────────────
/** @typedef {{id:string,label:string,category:string,color:string,weight:number,layer:string,data:object,route?:string}} GraphNode */
/** @typedef {{source:string,target:string,type:string,color:string,opacity:number,weight:number,dashed?:boolean}} GraphEdge */
/** @typedef {{x:number,y:number}} Vec2 */
/** @typedef {{id:string,label:string,x:number,y:number,radius:number,color:string,category:string,layer:string,data:object,route?:string}} TopologyNode */
/** @typedef {{source:string,target:string,type:string,color:string,opacity:number,weight:number,dashed?:boolean,x1:number,y1:number,x2:number,y2:number}} TopologyEdge */
/** @typedef {{nodes:TopologyNode[],edges:TopologyEdge[]}} TwoDTopology */
/** @typedef {{iterations:number,repulsion:number,attraction:number,damping:number,centering:number,springLength:number,seed?:string|number,bounds?:{width:number,height:number}}} LayoutConfig */
/** @typedef {{nodeCount:number,edgeCount:number,density:number,averageDegree:number,maxDegree:number,clusterCount:number,largestClusterSize:number,topHubs:Array<{id:string,label:string,degree:number}>}} TopologyMetrics */
/** @typedef {{destroy():void,setLayer(layerId:string):void,setSearch(query:string):void,selectNode(nodeId:string|null):void}} TwoDController */

const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── 1. Brain job formalization ────────────────────────────────────

/**
 * Formal description of what the Brain visualization IS and does.
 * The Brain is a mechanic/evidence topology explorer: it surfaces how
 * game mechanics relate (synergy / anti-synergy / motif), how strongly
 * the relationship is supported by simulation evidence, how workspaces
 * navigate to mechanics, and how cards interact with mechanics and
 * each other. Frozen so UI copy cannot drift from the data contract.
 * @type {Readonly<object>}
 */
export const BRAIN_JOB_DESCRIPTION = Object.freeze({
  name: 'Intrilex Brain',
  role: 'mechanic/evidence topology explorer',
  summary:
    'Visualizes game mechanics as nodes sized by evidence weight, ' +
    'synergies/anti-synergies as edges colored by relationship and ' +
    'opaque by evidence, workspace navigation paths, and card ' +
    'interaction graphs — revealing how the game clusters and relates ' +
    'based on simulation evidence.',
  layers: Object.freeze({
    [LAYER_IDS.MECHANICS]: Object.freeze({
      label: 'Mechanics & Synergies',
      description:
        'Mechanic nodes sized by evidence weight (cohort size / degree). ' +
        'Synergy edges are green, anti-synergy edges are red, motif edges ' +
        'are dashed amber. Edge opacity scales with effective sample size.',
      nodeSource: 'MECHANIC_REGISTRY',
      edgeSource: 'observatory.synergies + observatory.motifs',
      nodeSizing: 'weightToRadius(1 + degree)',
      edgeColoring: 'EDGE_COLORS by relationship class',
      edgeOpacity: 'clamp(effectiveN / 200, 0.12, 1)',
    }),
    [LAYER_IDS.WORKSPACES]: Object.freeze({
      label: 'Workspace Navigation',
      description:
        'Workspace route nodes with section hubs. Navigation edges ' +
        'follow logical workspace relationships; hub→member edges are faint.',
      nodeSource: 'WORKSPACES + section groupings',
      edgeSource: 'WORKSPACE_RELATIONSHIPS + hub membership',
      nodeSizing: 'fixed (hubs weight 4, members weight 2)',
      edgeColoring: 'EDGE_COLORS.navigation (blue)',
      edgeOpacity: '0.18 (hub) / 0.30 (relationship)',
    }),
    [LAYER_IDS.CARDS]: Object.freeze({
      label: 'Card Interactions',
      description:
        'Card nodes colored by suit, sized by PR value. Edges encode ' +
        'royal marriages, effect chains, scuttle chains, and counter/' +
        'protection relationships.',
      nodeSource: 'listAuthoritativeCards',
      edgeSource: 'royal marriages + effect chains + scuttle + counters',
      nodeSizing: 'weightToRadius(prValue)',
      edgeColoring: 'EDGE_COLORS.card (amber) / SUIT_COLORS for nodes',
      edgeOpacity: '0.25–0.60 by relationship strength',
    }),
    [LAYER_IDS.COMBINED]: Object.freeze({
      label: 'Combined Topology',
      description:
        'All three layers with cross-layer edges linking effect-card ' +
        'mechanics to their card nodes (faint). In 3D the layers are ' +
        'Z-separated; in 2D they share a plane and are distinguished ' +
        'by color/category.',
      nodeSource: 'mechanics + workspaces + cards',
      edgeSource: 'all layer edges + cross-layer mechanic→card links',
      nodeSizing: 'per-layer rules',
      edgeColoring: 'per-layer + EDGE_COLORS.cross for cross-layer',
      edgeOpacity: 'per-layer, cross-layer = 0.10',
    }),
  }),
  dataSources: Object.freeze([
    'MECHANIC_REGISTRY — mechanic definitions',
    'observatory.synergies — synergy/anti-synergy evidence',
    'observatory.motifs — recurring mechanic sequences',
    'WORKSPACES — navigation routes',
    'section groupings — workspace hubs',
    'listAuthoritativeCards — card definitions',
  ]),
  evidenceModel: Object.freeze({
    nodeWeight: '1 + degree (mechanics) | prValue (cards) | fixed (workspaces)',
    edgeOpacity: 'clamp(effectiveN / 200, 0.12, 1)',
    radiusScale: 'weightToRadius = base + (max-base) * sqrt(weight)/10',
  }),
});

/**
 * Return a structured, human-readable summary of the Brain's purpose,
 * layers, and data sources. Useful for overlay UI, tooltips, and tests.
 * @returns {object}
 */
export function getBrainJobSummary() {
  return {
    name: BRAIN_JOB_DESCRIPTION.name,
    role: BRAIN_JOB_DESCRIPTION.role,
    summary: BRAIN_JOB_DESCRIPTION.summary,
    layers: Object.keys(BRAIN_JOB_DESCRIPTION.layers).map((id) => ({
      id,
      ...BRAIN_JOB_DESCRIPTION.layers[id],
    })),
    dataSources: [...BRAIN_JOB_DESCRIPTION.dataSources],
    evidenceModel: { ...BRAIN_JOB_DESCRIPTION.evidenceModel },
  };
}

// ── 2. Deterministic 2D force-directed layout ─────────────────────

/**
 * Default configuration for the 2D force-directed layout.
 * @type {Readonly<LayoutConfig>}
 */
export const DEFAULT_2D_LAYOUT_CONFIG = Object.freeze({
  iterations: 300,   // simulation steps
  repulsion: 100,    // Coulomb-like node-node repulsion constant
  attraction: 0.1,   // spring strength along edges
  damping: 0.9,      // velocity decay per step
  centering: 0.01,   // pull toward canvas center
  springLength: 80,  // rest length for edge springs
  seed: 'intrilex-brain-2d',
  bounds: { width: 800, height: 600 },
});

/**
 * Mulberry32 — a tiny, fast, deterministic PRNG seeded by a 32-bit int.
 * Same seed → same sequence, everywhere (Node + browser).
 * @param {number} a - 32-bit seed
 * @returns {() => number} function returning [0,1)
 */
function mulberry32(a) {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a deterministic 32-bit integer seed from the config seed value.
 * Uses hashCanonical so string seeds are stable across key order.
 * @param {string|number|undefined} seed
 * @returns {number}
 */
function deriveSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const h = hashCanonical({ seed: seed ?? 'intrilex-brain-2d' });
  // Take the first 8 hex chars as a 32-bit int.
  return parseInt(h.slice(0, 8), 16) >>> 0;
}

/**
 * Seed initial 2D positions on a circle (deterministic via the PRNG).
 * @param {number} count
 * {() => number} rng
 * @param {number} radius
 * @returns {Vec2[]}
 */
function initialCirclePositions(count, rng, radius) {
  const pts = [];
  const n = Math.max(1, count);
  for (let i = 0; i < n; i++) {
    // Deterministic angle with small jitter from the PRNG.
    const base = (i / n) * Math.PI * 2;
    const jitter = (rng() - 0.5) * 0.4;
    const r = radius * (0.7 + rng() * 0.3);
    pts.push({
      x: Math.cos(base + jitter) * r,
      y: Math.sin(base + jitter) * r,
    });
  }
  return pts;
}

/**
 * Compute a deterministic 2D force-directed layout for a graph.
 *
 * The algorithm is a standard Fruchterman-Reingold-style simulation:
 *   - Repulsion between every pair of nodes (inverse-square)
 *   - Attraction (spring) along every edge
 *   - A centering force pulling toward the origin
 *   - Velocity damping each step
 *
 * Same input graph + same seed always produces identical positions,
 * in both Node and the browser.
 * @param {Array<GraphNode>} nodes - Graph nodes (id used as key)
 * @param {Array<GraphEdge>} edges - Graph edges (source/target reference node ids)
 * @param {Partial<LayoutConfig>} [config] - Override defaults
 * @returns {Map<string, Vec2>} nodeId → {x, y}
 */
export function compute2DLayout(nodes, edges, config = {}) {
  const o = { ...DEFAULT_2D_LAYOUT_CONFIG, ...config };
  const bounds = o.bounds ?? { width: 800, height: 600 };
  const cx = bounds.width / 2;
  const cy = bounds.height / 2;
  const n = nodes.length;
  if (n === 0) return new Map();

  const rng = mulberry32(deriveSeed(o.seed));
  const radius = Math.min(bounds.width, bounds.height) * 0.35;
  const pos = initialCirclePositions(n, rng, radius);
  // Offset to canvas center.
  for (const p of pos) { p.x += cx; p.y += cy; }

  // Map node ids → indices for edge lookups.
  const idToIndex = new Map();
  for (let i = 0; i < n; i++) idToIndex.set(nodes[i].id, i);

  // Normalize edges to index pairs with a weight.
  const idxEdges = [];
  for (const e of edges) {
    const a = idToIndex.get(e.source);
    const b = idToIndex.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    idxEdges.push({ a, b, w: Number.isFinite(e.weight) ? e.weight : 1 });
  }

  const vel = pos.map(() => ({ x: 0, y: 0 }));

  for (let iter = 0; iter < o.iterations; iter++) {
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);

    // Repulsion (all pairs).
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { d2 = 0.01; dx = 0.1; dy = 0.1; }
        const d = Math.sqrt(d2);
        const f = o.repulsion / d2;
        const ux = (dx / d) * f;
        const uy = (dy / d) * f;
        fx[i] += ux; fy[i] += uy;
        fx[j] -= ux; fy[j] -= uy;
      }
    }

    // Attraction (springs along edges).
    for (const e of idxEdges) {
      const a = pos[e.a], b = pos[e.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const rest = o.springLength * e.w;
      const f = o.attraction * (d - rest);
      const ux = (dx / d) * f;
      const uy = (dy / d) * f;
      fx[e.a] += ux; fy[e.a] += uy;
      fx[e.b] -= ux; fy[e.b] -= uy;
    }

    // Centering + integration.
    for (let i = 0; i < n; i++) {
      fx[i] -= (pos[i].x - cx) * o.centering;
      fy[i] -= (pos[i].y - cy) * o.centering;
      vel[i].x = (vel[i].x + fx[i]) * o.damping;
      vel[i].y = (vel[i].y + fy[i]) * o.damping;
      pos[i].x += vel[i].x;
      pos[i].y += vel[i].y;
    }
  }

  const out = new Map();
  for (let i = 0; i < n; i++) out.set(nodes[i].id, { x: pos[i].x, y: pos[i].y });
  return out;
}

// ── 3. Render-ready 2D topology ───────────────────────────────────

/**
 * Build a render-ready 2D topology from graph layers.
 *
 * Accepts the output of `buildCombinedLayer` (a `{nodes, edges}` graph)
 * or any individual layer's output. Computes 2D positions via
 * `compute2DLayout`, derives node radii from `weightToRadius`, and
 * computes edge endpoints from node positions (trimmed to node radius).
 * @param {{nodes:GraphNode[],edges:GraphEdge[]}} layers - Graph layers
 * @param {Partial<LayoutConfig>} [layoutConfig] - Layout overrides
 * @returns {TwoDTopology}
 */
export function build2DTopology(layers, layoutConfig = {}) {
  const { nodes = [], edges = [] } = layers ?? {};
  const positions = compute2DLayout(nodes, edges, layoutConfig);

  const posById = new Map();
  for (const [id, p] of positions) posById.set(id, p);

  const topoNodes = nodes.map((node) => {
    const p = posById.get(node.id) ?? { x: 0, y: 0 };
    return {
      id: node.id,
      label: node.label,
      x: p.x,
      y: p.y,
      radius: weightToRadius(node.weight ?? 1),
      color: node.color,
      category: node.category,
      layer: node.layer,
      data: node.data,
      route: node.route,
    };
  });

  const nodeById = new Map(topoNodes.map((tn) => [tn.id, tn]));
  const topoEdges = edges
    .map((e) => {
      const a = nodeById.get(e.source);
      const b = nodeById.get(e.target);
      if (!a || !b) return null;
      // Trim endpoints to the node circle boundary.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const ux = dx / d, uy = dy / d;
      return {
        source: e.source,
        target: e.target,
        type: e.type,
        color: e.color,
        opacity: e.opacity,
        weight: e.weight,
        dashed: e.dashed ?? false,
        x1: a.x + ux * a.radius,
        y1: a.y + uy * a.radius,
        x2: b.x - ux * b.radius,
        y2: b.y - uy * b.radius,
      };
    })
    .filter(Boolean);

  return { nodes: topoNodes, edges: topoEdges };
}

// ── 4. Pure-SVG 2D renderer ───────────────────────────────────────

/**
 * Create an SVG element in the correct namespace.
 * @param {string} tag
 * @returns {SVGElement}
 */
function svgEl(tag) {
  return document.createElementNS(SVG_NS, tag);
}

/**
 * Render a 2D topology as an interactive SVG into a container element.
 *
 * Features: hover highlight (node + connected edges), click selection
 * with a details panel, search filtering (dims non-matching nodes),
 * layer switching, and zoom/pan via SVG viewBox transform. No external
 * dependencies — pure SVG DOM manipulation.
 *
 * Only call this in a browser environment (requires document).
 * @param {HTMLElement} container - Host element
 * @param {TwoDTopology} topology - Render-ready topology from build2DTopology
 * @param {{onSelect?:function,initialLayer?:string,viewBox?:{x:number,y:number,w:number,h:number}}} [options]
 * @returns {TwoDController}
 */
export function render2DTopology(container, topology, options = {}) {
  if (!container || typeof document === 'undefined') {
    return makeNoopController();
  }
  const onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
  const vb = options.viewBox ?? { x: 0, y: 0, w: 800, h: 600 };

  // State
  let currentLayer = options.initialLayer ?? LAYER_IDS.COMBINED;
  let searchQuery = '';
  let selectedId = null;
  let hoveredId = null;
  /** @type {Map<string, TopologyNode>} */
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]));
  /** @type {Map<string, string[]>} adjacency: nodeId → connected node ids */
  const adjacency = new Map();
  for (const n of topology.nodes) adjacency.set(n.id, []);
  for (const e of topology.edges) {
    (adjacency.get(e.source) ?? []).push(e.target);
    (adjacency.get(e.target) ?? []).push(e.source);
  }

  // Build SVG scaffold.
  container.innerHTML = '';
  const svg = svgEl('svg');
  svg.setAttribute('class', 'brain-topology-svg');
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Intrilex Brain 2D topology');
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.cursor = 'grab';
  container.appendChild(svg);

  // Edge + node layers (edges first so nodes render on top).
  const edgeLayer = svgEl('g');
  edgeLayer.setAttribute('class', 'brain-topo-edges');
  svg.appendChild(edgeLayer);
  const nodeLayer = svgEl('g');
  nodeLayer.setAttribute('class', 'brain-topo-nodes');
  svg.appendChild(nodeLayer);
  const labelLayer = svgEl('g');
  labelLayer.setAttribute('class', 'brain-topo-labels');
  svg.appendChild(labelLayer);

  /** @type {Map<string,{line:SVGElement,circle:SVGElement,label:SVGElement}>} */
  const nodeEls = new Map();
  /** @type {Map<string,SVGElement>} edgeEls keyed by `${source}|${target}` */
  const edgeEls = new Map();

  function edgeKey(e) { return `${e.source}|${e.target}`; }

  function buildElements() {
    edgeLayer.innerHTML = '';
    nodeLayer.innerHTML = '';
    labelLayer.innerHTML = '';
    nodeEls.clear();
    edgeEls.clear();

    for (const e of topology.edges) {
      const line = svgEl('line');
      line.setAttribute('x1', e.x1.toFixed(1));
      line.setAttribute('y1', e.y1.toFixed(1));
      line.setAttribute('x2', e.x2.toFixed(1));
      line.setAttribute('y2', e.y2.toFixed(1));
      line.setAttribute('stroke', e.color);
      line.setAttribute('stroke-width', String(0.5 + (e.weight ?? 1) * 0.5));
      line.setAttribute('stroke-opacity', String(e.opacity ?? 0.5));
      if (e.dashed) line.setAttribute('stroke-dasharray', '4 3');
      edgeLayer.appendChild(line);
      edgeEls.set(edgeKey(e), line);
    }

    for (const n of topology.nodes) {
      const circle = svgEl('circle');
      circle.setAttribute('cx', n.x.toFixed(1));
      circle.setAttribute('cy', n.y.toFixed(1));
      circle.setAttribute('r', n.radius.toFixed(1));
      circle.setAttribute('fill', n.color);
      circle.setAttribute('stroke', '#0d1a24');
      circle.setAttribute('stroke-width', '0.5');
      circle.setAttribute('opacity', '0.9');
      circle.style.cursor = 'pointer';
      nodeLayer.appendChild(circle);

      const label = svgEl('text');
      label.setAttribute('x', n.x.toFixed(1));
      label.setAttribute('y', (n.y + n.radius + 10).toFixed(1));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#a0b8c4');
      label.setAttribute('font-size', '9');
      label.setAttribute('font-family', 'sans-serif');
      label.setAttribute('pointer-events', 'none');
      label.textContent = n.label;
      labelLayer.appendChild(label);

      nodeEls.set(n.id, { line: null, circle, label });
    }
  }

  buildElements();

  // ── Highlighting ────────────────────────────────────────────────
  function matchesLayer(node) {
    if (currentLayer === LAYER_IDS.COMBINED) return true;
    return node.layer === currentLayer;
  }

  function matchesSearch(node) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const hay = `${node.label} ${node.category} ${node.data?.description ?? ''} ${node.data?.subtitle ?? ''} ${node.route ?? ''}`.toLowerCase();
    return hay.includes(q);
  }

  function refreshHighlight() {
    const focusId = hoveredId ?? selectedId;
    const connected = focusId ? new Set(adjacency.get(focusId) ?? []) : null;

    for (const n of topology.nodes) {
      const els = nodeEls.get(n.id);
      if (!els) continue;
      const inLayer = matchesLayer(n);
      const inSearch = matchesSearch(n);
      let opacity = 0.9;
      if (!inLayer) opacity = 0.08;
      else if (!inSearch) opacity = 0.15;
      else if (focusId && focusId !== n.id && !connected.has(n.id)) opacity = 0.25;
      else if (focusId === n.id) opacity = 1;
      els.circle.setAttribute('opacity', String(opacity));
      els.circle.setAttribute('stroke', focusId === n.id ? '#e8f0f4' : '#0d1a24');
      els.circle.setAttribute('stroke-width', focusId === n.id ? '1.5' : '0.5');
      els.label.setAttribute('opacity', String(inLayer && inSearch ? 1 : 0.1));
    }

    for (const e of topology.edges) {
      const line = edgeEls.get(edgeKey(e));
      if (!line) continue;
      const a = nodeById.get(e.source);
      const b = nodeById.get(e.target);
      const inLayer = matchesLayer(a) && matchesLayer(b);
      let op = e.opacity ?? 0.5;
      if (!inLayer) op = 0.03;
      else if (focusId && e.source !== focusId && e.target !== focusId) op *= 0.3;
      else if (focusId && (e.source === focusId || e.target === focusId)) op = Math.min(1, op * 1.5);
      line.setAttribute('stroke-opacity', String(op));
    }
  }

  refreshHighlight();

  // ── Interaction: hover ──────────────────────────────────────────
  nodeLayer.addEventListener('mousemove', (ev) => {
    const id = findNodeAt(ev);
    if (id !== hoveredId) {
      hoveredId = id;
      svg.style.cursor = id ? 'pointer' : 'grab';
      refreshHighlight();
    }
  });
  nodeLayer.addEventListener('mouseleave', () => {
    if (hoveredId !== null) { hoveredId = null; refreshHighlight(); }
  });

  // ── Interaction: click select ───────────────────────────────────
  nodeLayer.addEventListener('click', (ev) => {
    const id = findNodeAt(ev);
    selectedId = id;
    refreshHighlight();
    if (onSelect && id) {
      const node = nodeById.get(id);
      onSelect(node ?? null);
    }
  });

  function findNodeAt(ev) {
    const pt = svgPoint(ev);
    // Search topmost-first (reverse render order).
    for (let i = topology.nodes.length - 1; i >= 0; i--) {
      const n = topology.nodes[i];
      const dx = pt.x - n.x, dy = pt.y - n.y;
      if (dx * dx + dy * dy <= (n.radius + 2) ** 2) return n.id;
    }
    return null;
  }

  function svgPoint(ev) {
    const rect = svg.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * vb.w + vb.x;
    const y = ((ev.clientY - rect.top) / rect.height) * vb.h + vb.y;
    return { x, y };
  }

  // ── Zoom / pan ──────────────────────────────────────────────────
  let panning = false;
  let panStart = null;
  let vbState = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };

  function setViewBox(v) {
    vbState = v;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  }

  svg.addEventListener('mousedown', (ev) => {
    if (findNodeAt(ev)) return; // don't pan when clicking a node
    panning = true;
    panStart = { x: ev.clientX, y: ev.clientY, vb: { ...vbState } };
    svg.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (ev) => {
    if (!panning || !panStart) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((ev.clientX - panStart.x) / rect.width) * panStart.vb.w;
    const dy = ((ev.clientY - panStart.y) / rect.height) * panStart.vb.h;
    setViewBox({ x: panStart.vb.x - dx, y: panStart.vb.y - dy, w: panStart.vb.w, h: panStart.vb.h });
  });
  window.addEventListener('mouseup', () => {
    if (panning) { panning = false; panStart = null; svg.style.cursor = 'grab'; }
  });

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY > 0 ? 1.1 : 0.9;
    const pt = svgPoint(ev);
    const newW = clamp(vbState.w * factor, 50, 4000);
    const newH = newW * (vbState.h / vbState.w);
    // Keep the cursor point stationary in graph space.
    const nx = pt.x - (pt.x - vbState.x) * (newW / vbState.w);
    const ny = pt.y - (pt.y - vbState.y) * (newH / vbState.h);
    setViewBox({ x: nx, y: ny, w: newW, h: newH });
  }, { passive: false });

  // ── Controller ──────────────────────────────────────────────────
  /**
   * @type {TwoDController}
   */
  const controller = {
    destroy() {
      container.innerHTML = '';
      nodeEls.clear();
      edgeEls.clear();
    },
    setLayer(layerId) {
      currentLayer = layerId;
      refreshHighlight();
    },
    setSearch(query) {
      searchQuery = String(query ?? '').trim();
      refreshHighlight();
    },
    selectNode(nodeId) {
      selectedId = nodeId || null;
      refreshHighlight();
      if (onSelect && nodeId) {
        const node = nodeById.get(nodeId);
        onSelect(node ?? null);
      }
    },
  };
  return controller;
}

/**
 * @returns {TwoDController}
 */
function makeNoopController() {
  return {
    destroy() {},
    setLayer() {},
    setSearch() {},
    selectNode() {},
  };
}

// ── 5. Topology metrics ───────────────────────────────────────────

/**
 * Compute graph-theory metrics for a set of nodes and edges.
 * @param {Array<GraphNode>} nodes
 * @param {Array<GraphEdge>} edges
 * @returns {TopologyMetrics}
 */
export function computeTopologyMetrics(nodes, edges) {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const maxPossible = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 0;
  const density = maxPossible > 0 ? edgeCount / maxPossible : 0;

  // Degree map.
  /** @type {Map<string,number>} */
  const degree = new Map();
  for (const n of nodes) degree.set(n.id, 0);
  for (const e of edges) {
    if (!degree.has(e.source)) degree.set(e.source, 0);
    if (!degree.has(e.target)) degree.set(e.target, 0);
    degree.set(e.source, degree.get(e.source) + 1);
    degree.set(e.target, degree.get(e.target) + 1);
  }

  const degrees = [...degree.values()];
  const averageDegree = degrees.length > 0 ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;
  const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0;

  // Connected components (union-find).
  const parent = new Map();
  for (const id of degree.keys()) parent.set(id, id);
  function find(x) {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    // Path compression.
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const e of edges) {
    if (degree.has(e.source) && degree.has(e.target)) union(e.source, e.target);
  }
  const componentSizes = new Map();
  for (const id of degree.keys()) {
    const root = find(id);
    componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1);
  }
  const clusterCount = componentSizes.size;
  const largestClusterSize = componentSizes.size > 0 ? Math.max(...componentSizes.values()) : 0;

  // Top 5 hubs by degree.
  const hubList = nodes
    .map((n) => ({ id: n.id, label: n.label, degree: degree.get(n.id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, 5);

  return {
    nodeCount,
    edgeCount,
    density,
    averageDegree,
    maxDegree,
    clusterCount,
    largestClusterSize,
    topHubs: hubList,
  };
}
