// ═══════════════════════════════════════════════════════════════
// brain-controller.js — Orchestrates all brain modules: lifecycle,
// data-layer switching, search, cluster collapse, and full cleanup.
// ═══════════════════════════════════════════════════════════════
// This is the lazy-loaded entry point. Three.js is pulled in transitively
// via brain-scene/nodes/edges/interaction, so it lands in a separate chunk.

import { MECHANIC_REGISTRY } from '../mechanic-registry-browser.js';
import { listAuthoritativeCards } from '../card-face-data.js';
import { WORKSPACES } from '../router.js';
import { state } from '../state.js';
import {
  buildMechanicsLayer, buildWorkspaceLayer, buildCardLayer, buildCombinedLayer,
  searchNodes, collectCategories, collectEdgeTypes, findShortestPath,
  EDGE_TYPE_LABELS, LAYER_IDS,
} from './brain-data.js';
import { initialSpherePositions, settleLayout, applyZLayering, relaxAround } from './brain-layout.js';
import { detectWebGL, renderFallback } from './brain-fallback.js';
import { createScene } from './brain-scene.js';
import { createNodeMesh, setHoverState, setSelectedState, setDimState } from './brain-nodes.js';
import { createEdgeLine, updateEdgeLine, setEdgeHighlight, setEdgeHover, createEdgeFlow } from './brain-edges.js';
import { attachInteraction } from './brain-interaction.js';
import { buildOverlay } from './brain-ui.js';

const SECTIONS = [
  { label: 'Analysis', routes: ['/watch', '/caster', '/replays', '/history', '/mechanics', '/synergies'] },
  { label: 'Investigation', routes: ['/ranks', '/compare', '/traces', '/branches', '/diagnostics', '/tournament'] },
  { label: 'System', routes: ['/evidence', '/intelligence'] },
];

/** @typedef {{container:HTMLElement,destroy:()=>void}} BrainInstance */
/** @type {BrainInstance|null} */
let _activeBrain = null;

/**
 * Initialize the 3D brain inside a container element.
 * Falls back to a 2D SVG mind map if WebGL is unavailable.
 * @param {HTMLElement} container
 * @returns {Promise<{destroy:()=>void}|null>}
 */
export async function initBrain(container) {
  if (!container || !container.isConnected) return null;
  if (_activeBrain) _activeBrain.destroy();
  container.innerHTML = '';

  const mechanics = Object.values(MECHANIC_REGISTRY).map((m) => ({
    mechanicId: m.mechanicId, displayName: m.displayName, category: m.category, description: m.description,
  }));
  const cards = listAuthoritativeCards();
  const observatory = state.observatory ?? {};

  const layers = {
    [LAYER_IDS.MECHANICS]: buildMechanicsLayer(mechanics, observatory),
    [LAYER_IDS.WORKSPACES]: buildWorkspaceLayer(
      /** @type {Array<[string,string,string,string]>} */ (WORKSPACES), SECTIONS),
    [LAYER_IDS.CARDS]: buildCardLayer(cards),
  };
  layers[LAYER_IDS.COMBINED] = buildCombinedLayer(
    layers[LAYER_IDS.MECHANICS], layers[LAYER_IDS.WORKSPACES], layers[LAYER_IDS.CARDS]);

  // WebGL fallback.
  if (!detectWebGL()) {
    const fallbackNodes = layers[LAYER_IDS.COMBINED].nodes.slice(0, 60).map((n) => ({
      id: n.id, label: n.label, color: n.color, route: n.route ?? n.data?.route,
    }));
    renderFallback(container, fallbackNodes, []);
    _activeBrain = { container, destroy() { container.innerHTML = ''; _activeBrain = null; } };
    return _activeBrain;
  }

  const reducedMotion = state.reducedMotion === true;
  const { scene, camera, renderer, resize, dispose: disposeScene } = createScene(container);

  /** @type {string} */
  let currentLayer = LAYER_IDS.MECHANICS;
  let graph = layers[currentLayer];
  let nodeMeshes = [];
  let edgeLines = [];
  let positions = [];
  let velocities = [];
  let selectedId = null;
  let hoveredId = null;
  let hoveredEdgeLine = null;
  let collapsedCategories = new Set();
  let hiddenEdgeTypes = new Set();
  let searchMatchIds = null;
  let rafId = null;
  let idToIndex = new Map();
  let idxEdges = [];
  const layoutCache = new Map();

  // Shortest-path state.
  let pathStart = null;
  let pathEdges = new Set();

  // Edge flow particles (active edges connected to selected/hovered node).
  /** @type {Array<{mesh:THREE.Mesh,update:(t:number)=>void,dispose:()=>void}>} */
  let edgeFlows = [];
  let flowClock = 0;

  function disposeObject(object) {
    object.traverse?.((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      for (const material of materials) {
        material.map?.dispose?.();
        material.dispose?.();
      }
    });
  }

  // ── Build meshes for the current graph ──
  function buildGraph() {
    // Clear previous.
    for (const m of nodeMeshes) { scene.remove(m); disposeObject(m); }
    for (const l of edgeLines) { scene.remove(l); disposeObject(l); }
    clearEdgeFlows();
    nodeMeshes = []; edgeLines = [];

    graph = layers[currentLayer];
    const n = graph.nodes.length;
    const cached = layoutCache.get(currentLayer);
    positions = cached ? cached.map((p) => ({ ...p })) : initialSpherePositions(n, 36);
    velocities = positions.map(() => ({ x: 0, y: 0, z: 0 }));

    // Z-layering for combined mode.
    if (currentLayer === LAYER_IDS.COMBINED) {
      const targetZ = graph.nodes.map((nd) => nd.data?.z ?? 0);
      applyZLayering(positions, targetZ, 1);
    }

    idToIndex = new Map(graph.nodes.map((nd, i) => [nd.id, i]));
    idxEdges = graph.edges.map((e) => ({
      source: idToIndex.get(e.source),
      target: idToIndex.get(e.target),
      weight: e.weight,
    })).filter((e) => e.source != null && e.target != null);

    if (!cached) {
      settleLayout(positions, idxEdges, { maxIterations: reducedMotion ? 40 : 80 });
      layoutCache.set(currentLayer, positions.map((p) => ({ ...p })));
    }

    for (let i = 0; i < n; i++) {
      const mesh = createNodeMesh(graph.nodes[i]);
      mesh.position.set(positions[i].x, positions[i].y, positions[i].z);
      scene.add(mesh);
      nodeMeshes.push(mesh);
    }
    for (const e of graph.edges) {
      const a = idToIndex.get(e.source), b = idToIndex.get(e.target);
      if (a == null || b == null) continue;
      const line = createEdgeLine(positions[a], positions[b], { color: e.color, opacity: e.opacity, dashed: e.dashed });
      line.__brainEdge = e;
      scene.add(line);
      edgeLines.push(line);
    }
    overlay.setCategories(collectCategories(graph.nodes));
    overlay.setNodes(graph.nodes);
    overlay.setEdgeTypes(collectEdgeTypes(graph.edges));
    overlay.setStats(computeGraphStats(graph.nodes, graph.edges));
    applyFilter();
  }

  // ── Filtering: search + collapsed clusters + edge-type filters ──
  function applyFilter() {
    const matchSet = searchMatchIds ?? new Set(graph.nodes.map((n) => n.id));
    for (const mesh of nodeMeshes) {
      const id = mesh.__brainId;
      const cat = mesh.__brainDef.category;
      const dimmed = !matchSet.has(id) || collapsedCategories.has(cat);
      setDimState(mesh, dimmed);
    }
    for (const line of edgeLines) {
      const e = line.__brainEdge;
      const aOk = matchSet.has(e.source) && !collapsedCategories.has(graph.nodes.find((n) => n.id === e.source)?.category);
      const bOk = matchSet.has(e.target) && !collapsedCategories.has(graph.nodes.find((n) => n.id === e.target)?.category);
      const typeOk = !hiddenEdgeTypes.has(e.type);
      line.visible = aOk && bOk && typeOk;
    }
  }

  // ── Edge flow particle management ──
  function clearEdgeFlows() {
    for (const f of edgeFlows) { scene.remove(f.mesh); f.dispose(); }
    edgeFlows = [];
  }

  /** Rebuild flow particles for edges connected to the selected/hovered node. */
  function rebuildEdgeFlows() {
    clearEdgeFlows();
    if (reducedMotion) return;
    const focusId = selectedId ?? hoveredId;
    if (!focusId) return;
    for (const line of edgeLines) {
      const e = line.__brainEdge;
      if (!line.visible) continue;
      if (e.source !== focusId && e.target !== focusId) continue;
      const a = idToIndex.get(e.source), b = idToIndex.get(e.target);
      if (a == null || b == null) continue;
      const flow = createEdgeFlow(positions[a], positions[b], { color: e.color, weight: e.weight });
      scene.add(flow.mesh);
      edgeFlows.push(flow);
    }
  }

  // ── Selection highlight ──
  function setSelected(id) {
    selectedId = id;
    for (const mesh of nodeMeshes) setSelectedState(mesh, mesh.__brainId === id);
    const connectedIds = new Set();
    if (id) {
      for (const e of graph.edges) {
        if (e.source === id) connectedIds.add(e.target);
        if (e.target === id) connectedIds.add(e.source);
      }
    }
    for (const line of edgeLines) {
      const e = line.__brainEdge;
      const connected = id && (e.source === id || e.target === id);
      const inPath = pathEdges.size > 0 && (pathEdges.has(`${e.source}|${e.target}`) || pathEdges.has(`${e.target}|${e.source}`));
      setEdgeHighlight(line, !!connected || inPath, e.opacity);
    }
    if (id) {
      const node = graph.nodes.find((n) => n.id === id);
      if (node) {
        const connected = graph.nodes.filter((n) => connectedIds.has(n.id));
        overlay.showDetail(node, connected);
      }
    } else {
      overlay.hideDetail();
    }
    rebuildEdgeFlows();
  }

  // ── Graph statistics (inlined to avoid pulling brain-topology.mjs's
  //    @intrilex/shared dependency into the lazy-loaded brain chunk) ──
  /**
   * @param {Array<object>} nodes
   * @param {Array<object>} edges
   * @returns {object}
   */
  function computeGraphStats(nodes, edges) {
    const nodeCount = nodes.length;
    const edgeCount = edges.length;
    const maxPossible = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 0;
    const density = maxPossible > 0 ? edgeCount / maxPossible : 0;
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
    const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); let c = x; while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; } return r; };
    for (const e of edges) {
      if (degree.has(e.source) && degree.has(e.target)) {
        const ra = find(e.source), rb = find(e.target);
        if (ra !== rb) parent.set(ra, rb);
      }
    }
    const compSizes = new Map();
    for (const id of degree.keys()) { const r = find(id); compSizes.set(r, (compSizes.get(r) ?? 0) + 1); }
    const clusterCount = compSizes.size;
    const largestClusterSize = compSizes.size > 0 ? Math.max(...compSizes.values()) : 0;
    const topHubs = nodes
      .map((n) => ({ id: n.id, label: n.label, degree: degree.get(n.id) ?? 0 }))
      .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
      .slice(0, 5);
    return { nodeCount, edgeCount, density, averageDegree, maxDegree, clusterCount, largestClusterSize, topHubs };
  }

  // ── Shortest-path management ──
  function clearPath() {
    pathStart = null;
    pathEdges = new Set();
    overlay.hidePathInfo();
    // Re-apply selection highlight to drop path styling.
    setSelected(selectedId);
  }

  /**
   * Handle shift-click: first click sets the path start; second click
   * computes the shortest path and highlights it.
   * @param {THREE.Mesh} node
   */
  function handleShiftClick(node) {
    if (!node) return;
    const id = node.__brainId;
    if (!pathStart) {
      pathStart = id;
      const label = node.__brainDef?.label ?? id;
      overlay.showPathInfo(label, '…', 0);
      return;
    }
    if (pathStart === id) { clearPath(); return; }
    const result = findShortestPath(graph.nodes, graph.edges, pathStart, id);
    if (!result) {
      // No path — reset start to the newly clicked node.
      pathStart = id;
      const label = node.__brainDef?.label ?? id;
      overlay.showPathInfo(label, '…', 0);
      return;
    }
    pathEdges = result.pathEdges;
    const startNode = graph.nodes.find((n) => n.id === pathStart);
    const endNode = graph.nodes.find((n) => n.id === id);
    overlay.showPathInfo(startNode?.label ?? pathStart, endNode?.label ?? id, result.path.length - 1);
    // Highlight path edges + rebuild flows along the path.
    for (const line of edgeLines) {
      const e = line.__brainEdge;
      const inPath = pathEdges.has(`${e.source}|${e.target}`) || pathEdges.has(`${e.target}|${e.source}`);
      setEdgeHighlight(line, inPath, e.opacity);
    }
    if (!reducedMotion) {
      clearEdgeFlows();
      for (const line of edgeLines) {
        const e = line.__brainEdge;
        if (!pathEdges.has(`${e.source}|${e.target}`) && !pathEdges.has(`${e.target}|${e.source}`)) continue;
        const a = idToIndex.get(e.source), b = idToIndex.get(e.target);
        if (a == null || b == null) continue;
        const flow = createEdgeFlow(positions[a], positions[b], { color: e.color, weight: e.weight });
        scene.add(flow.mesh);
        edgeFlows.push(flow);
      }
    }
  }

  // ── UI overlay ──
  const overlay = buildOverlay(container, {
    onLayerChange(layer) {
      currentLayer = layer;
      selectedId = null;
      clearPath();
      overlay.hideDetail();
      buildGraph();
    },
    onSearch(query) {
      searchMatchIds = searchNodes(graph.nodes, query);
      applyFilter();
    },
    onToggleCluster(category, collapsed) {
      if (collapsed) collapsedCategories.add(category);
      else collapsedCategories.delete(category);
      applyFilter();
    },
    onToggleEdgeType(type, visible) {
      if (visible) hiddenEdgeTypes.delete(type);
      else hiddenEdgeTypes.add(type);
      applyFilter();
      rebuildEdgeFlows();
    },
    onClearPath() {
      clearPath();
    },
  });
  overlay.detailPanel.addEventListener('brain:select', (ev) => {
    const event = /** @type {CustomEvent<{id:string}>} */ (ev);
    setSelected(event.detail.id);
  });

  // ── Interaction ──
  const interaction = attachInteraction(renderer, camera, scene, {
    getNodes: () => nodeMeshes,
    getEdges: () => edgeLines,
    onHover(node) {
      const id = node?.__brainId ?? null;
      if (id === hoveredId) return;
      if (hoveredId && hoveredId !== selectedId) {
        const prev = nodeMeshes.find((m) => m.__brainId === hoveredId);
        setHoverState(prev, false);
      }
      hoveredId = id;
      if (node) {
        setHoverState(node, true);
        const def = node.__brainDef;
        const rect = renderer.domElement.getBoundingClientRect();
        overlay.showTooltip(def.label, rect.left + (pointerLast.x + 1) * rect.width / 2, rect.top - (pointerLast.y - 1) * rect.height / 2);
        // Clear edge hover when a node is hovered.
        if (hoveredEdgeLine) {
          const e = hoveredEdgeLine.__brainEdge;
          setEdgeHover(hoveredEdgeLine, false, e?.opacity);
          hoveredEdgeLine = null;
        }
      } else {
        overlay.hideTooltip();
      }
      rebuildEdgeFlows();
    },
    onEdgeHover(line) {
      if (line === hoveredEdgeLine) return;
      if (hoveredEdgeLine) {
        const e = hoveredEdgeLine.__brainEdge;
        setEdgeHover(hoveredEdgeLine, false, e?.opacity);
      }
      hoveredEdgeLine = line;
      if (line) {
        const e = line.__brainEdge;
        setEdgeHover(line, true, e?.opacity);
        const type = e?.type ?? 'unknown';
        const label = EDGE_TYPE_LABELS[type] ?? type;
        const weight = e?.weight ?? 0;
        const evidence = e?.opacity ?? 0;
        const rect = renderer.domElement.getBoundingClientRect();
        overlay.showTooltip(
          `${label} · weight ${weight.toFixed(2)} · evidence ${(evidence * 100).toFixed(0)}%`,
          rect.left + (pointerLast.x + 1) * rect.width / 2,
          rect.top - (pointerLast.y - 1) * rect.height / 2,
        );
      } else {
        overlay.hideTooltip();
      }
    },
    onClick(node) {
      setSelected(node?.__brainId ?? null);
    },
    onShiftClick(node) {
      handleShiftClick(node);
    },
    onDoubleClick(node) {
      const def = node?.__brainDef;
      const route = def?.route ?? def?.data?.route;
      if (route) {
        window.location.hash = route;
      }
    },
    onDrag(node) {
      // Update connected edges + local relaxation.
      const idx = nodeMeshes.indexOf(node);
      if (idx < 0) return;
      positions[idx] = { x: node.position.x, y: node.position.y, z: node.position.z };
      if (!reducedMotion) relaxAround(positions, velocities, idxEdges, idx, 4);
      for (let i = 0; i < nodeMeshes.length; i++) {
        nodeMeshes[i].position.set(positions[i].x, positions[i].y, positions[i].z);
      }
      for (const line of edgeLines) {
        const e = line.__brainEdge;
        const a = idToIndex.get(e.source), b = idToIndex.get(e.target);
        if (a == null || b == null) continue;
        updateEdgeLine(line, positions[a], positions[b]);
      }
    },
  });

  let pointerLast = { x: 0, y: 0 };
  renderer.domElement.addEventListener('pointermove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerLast.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerLast.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });

  // ── Render loop ──
  function render() {
    rafId = requestAnimationFrame(render);
    if (document.hidden) return;
    interaction.update();
    // Gentle auto-rotation of the whole graph when idle (disabled by reducedMotion
    // or when a node is selected so the detail panel stays stable).
    if (!reducedMotion && !selectedId) {
      scene.rotation.y += 0.0009;
    }
    // Animate edge flow particles.
    if (edgeFlows.length && !reducedMotion) {
      flowClock += 0.016;
      for (const f of edgeFlows) f.update(flowClock);
    }
    renderer.render(scene, camera);
  }

  // Keyboard: Esc closes detail, / focuses search.
  function onKey(e) {
    if (e.key === 'Escape') { setSelected(null); }
    else if (e.key === '/' && document.activeElement !== overlay.searchInput) {
      e.preventDefault(); overlay.searchInput.focus();
    }
  }
  container.addEventListener('keydown', onKey);

  // Resize observer.
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container);

  // WebGL context loss → fallback.
  function onContextLost(e) {
    e.preventDefault();
    destroy();
    const fallbackNodes = graph.nodes.slice(0, 60).map((n) => ({ id: n.id, label: n.label, color: n.color, route: n.route ?? n.data?.route }));
    renderFallback(container, fallbackNodes, []);
  }
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  buildGraph();
  render();

  /** Full cleanup — disposes all GPU resources and DOM listeners. */
  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    resizeObserver.disconnect();
    interaction.dispose();
    overlay.destroy();
    container.removeEventListener('keydown', onKey);
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
    for (const m of nodeMeshes) { scene.remove(m); disposeObject(m); }
    for (const l of edgeLines) { scene.remove(l); disposeObject(l); }
    clearEdgeFlows();
    disposeScene();
    _activeBrain = null;
  }

  _activeBrain = { container, destroy };
  return _activeBrain;
}

/** Destroy the currently-active brain instance (if any). */
export function destroyBrain() {
  if (_activeBrain) _activeBrain.destroy();
  _activeBrain = null;
}
