// ═══════════════════════════════════════════════════════════════
// brain-data.js — Pure data adapters: game state → graph nodes/edges
// ═══════════════════════════════════════════════════════════════
// No Three.js or browser-only imports here — these are pure functions
// that accept already-loaded data and return a { nodes, edges } graph.
// The brain-controller wires real imports and passes data in. This keeps
// the adapters unit-testable in Node without a DOM or WebGL.

/** @typedef {{id:string,label:string,category:string,color:string,weight:number,layer:string,data:object,route?:string}} GraphNode */
/** @typedef {{source:string,target:string,type:string,color:string,opacity:number,weight:number,dashed?:boolean}} GraphEdge */

// ── Design-token colors (mirror css/tokens-base.css) ──────────────
export const CATEGORY_COLORS = Object.freeze({
  scoring: '#5ad7e8',    // --cyan
  control: '#f2777a',    // --red
  resource: '#68d391',   // --green
  response: '#f1bd5d',   // --amber
  protection: '#5b9cf0', // --blue
  advanced: '#a78bfa',   // --violet
  terminal: '#ee6cb7',   // --magenta
  navigation: '#5b9cf0', // --blue
  card: '#f1bd5d',       // --amber
  hub: '#e8f0f4',        // --text
});

export const EDGE_COLORS = Object.freeze({
  synergy: '#68d391',       // --green
  'anti-synergy': '#f2777a',// --red
  navigation: '#5b9cf0',    // --blue
  card: '#f1bd5d',          // --amber
  motif: '#f1bd5d',         // --amber (dashed)
  cross: '#8ea5b2',         // --faint
});

/**
 * Human-readable labels for each edge type (used by the legend + tooltips).
 * @type {Readonly<Record<string,string>>}
 */
export const EDGE_TYPE_LABELS = Object.freeze({
  synergy: 'Synergy',
  'anti-synergy': 'Anti-Synergy',
  motif: 'Motif',
  navigation: 'Navigation',
  card: 'Card Interaction',
  cross: 'Cross-Layer',
});

// Suit → color mapping for the card layer.
export const SUIT_COLORS = Object.freeze({
  '♣': '#4fd387', // clubs green
  '♦': '#f07449', // diamonds orange
  '♥': '#f05d78', // hearts pink/red
  '♠': '#b08cff', // spades violet
  RJ: '#f1bd5d',  // red joker amber
  BJ: '#8ea5b2',  // black joker grey
});

export const LAYER_IDS = Object.freeze({
  MECHANICS: 'mechanics',
  WORKSPACES: 'workspaces',
  CARDS: 'cards',
  COMBINED: 'combined',
});

const MIN_OPACITY = 0.12;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Normalize a weight value to a node radius in [base, max].
 * @param {number} weight - Raw weight (cohort size, point value, etc.)
 * @param {number} [base=2.0]
 * @param {number} [max=5.0]
 * @returns {number}
 */
export function weightToRadius(weight, base = 2.0, max = 5.0) {
  if (!Number.isFinite(weight) || weight <= 0) return base;
  // Square-root scale so a few very-large values don't dominate.
  const scaled = Math.sqrt(weight);
  const norm = clamp(scaled / 10, 0, 1);
  return base + (max - base) * norm;
}

// ── Layer 1: Mechanics & Synergies ────────────────────────────────

/**
 * Build the Mechanics & Synergies layer.
 * @param {Array<object>} mechanics - Mechanic definitions (e.g. MECHANIC_REGISTRY values)
 * @param {{synergies?:Array<object>, motifs?:Array<object>}} observatory - Observatory analytics
 * @returns {{nodes:Array<GraphNode>, edges:Array<GraphEdge>}}
 */
export function buildMechanicsLayer(mechanics, observatory = {}) {
  const nodes = [];
  const byId = new Map();
  for (const m of mechanics) {
    const id = m.mechanicId ?? m.id ?? String(m);
    const category = m.category ?? 'unknown';
    const node = {
      id: `mech:${id}`,
      label: m.displayName ?? id,
      category,
      color: CATEGORY_COLORS[category] ?? CATEGORY_COLORS.advanced,
      weight: 1,
      layer: LAYER_IDS.MECHANICS,
      route: '/mechanics',
      data: { mechanicId: id, description: m.description ?? '', category },
    };
    nodes.push(node);
    byId.set(id, node);
  }

  const edges = [];
  const synergies = Array.isArray(observatory.synergies) ? observatory.synergies : [];
  for (const s of synergies) {
    const a = s.source, b = s.target;
    if (!byId.has(a) || !byId.has(b)) continue;
    const isSyn = (s.relationshipClass ?? (s.effect >= 1 ? 'synergy' : 'anti-synergy')) === 'synergy';
    const type = isSyn ? 'synergy' : 'anti-synergy';
    const strength = Math.abs(Number(s.shrunkEffect ?? s.effect ?? 1) - 1);
    const evidence = clamp(Number(s.effectiveN ?? s.bothN ?? 0) / 200, MIN_OPACITY, 1);
    edges.push({
      source: `mech:${a}`, target: `mech:${b}`, type,
      color: EDGE_COLORS[type], opacity: evidence,
      weight: clamp(strength * 2, 0.2, 3),
    });
  }

  const motifs = Array.isArray(observatory.motifs) ? observatory.motifs : [];
  for (const mot of motifs) {
    const parts = String(mot.motif ?? '').split('→').map((x) => x.trim());
    if (parts.length !== 2) continue;
    const [a, b] = parts;
    if (!byId.has(a) || !byId.has(b)) continue;
    const op = clamp(Number(mot.count ?? 1) / 50, MIN_OPACITY, 0.7);
    edges.push({
      source: `mech:${a}`, target: `mech:${b}`, type: 'motif',
      color: EDGE_COLORS.motif, opacity: op, weight: 0.6, dashed: true,
    });
  }

  // Scale node weights by connected edge evidence so hubs stand out.
  const degree = new Map();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  for (const n of nodes) {
    n.weight = 1 + (degree.get(n.id) ?? 0);
  }

  return { nodes, edges };
}

// ── Layer 2: Workspace Navigation ─────────────────────────────────

/**
 * Logical workspace relationships (source route → target route).
 * Used to draw navigation edges between workspace nodes.
 */
export const WORKSPACE_RELATIONSHIPS = Object.freeze([
  ['/watch', '/replays'],
  ['/watch', '/history'],
  ['/mechanics', '/synergies'],
  ['/mechanics', '/ranks'],
  ['/ranks', '/compare'],
  ['/ranks', '/traces'],
  ['/traces', '/branches'],
  ['/traces', '/diagnostics'],
  ['/tournament', '/watch'],
  ['/evidence', '/intelligence'],
  ['/profile', '/settings'],
  ['/profile', '/auth'],
  ['/replays', '/caster'],
]);

/**
 * Build the Workspace Navigation layer.
 * @param {Array<[string,string,string,string]>} workspaces - WORKSPACES array [route,icon,label,sub]
 * @param {Array<{label:string,routes:string[]}>} [sections] - Section groupings
 * @returns {{nodes:Array<GraphNode>, edges:Array<GraphEdge>}}
 */
export function buildWorkspaceLayer(workspaces, sections = []) {
  const nodes = [];
  const routeToNode = new Map();

  // Section hub nodes (larger, central).
  for (const section of sections) {
    const id = `hub:${section.label}`;
    const node = {
      id, label: section.label, category: 'hub',
      color: CATEGORY_COLORS.hub, weight: 4,
      layer: LAYER_IDS.WORKSPACES, route: section.routes[0],
      data: { section: section.label, isHub: true },
    };
    nodes.push(node);
    for (const r of section.routes) routeToNode.set(`sec:${r}`, node);
  }

  for (const [route, icon, label, sub] of workspaces) {
    const id = `ws:${route}`;
    const node = {
      id, label, category: 'navigation',
      color: CATEGORY_COLORS.navigation, weight: 2,
      layer: LAYER_IDS.WORKSPACES, route,
      data: { route, icon, subtitle: sub, isHub: false },
    };
    nodes.push(node);
    routeToNode.set(route, node);
  }

  const edges = [];
  // Navigation edges between workspaces.
  for (const [from, to] of WORKSPACE_RELATIONSHIPS) {
    const a = routeToNode.get(from), b = routeToNode.get(to);
    if (a && b) {
      edges.push({ source: a.id, target: b.id, type: 'navigation', color: EDGE_COLORS.navigation, opacity: 0.3, weight: 0.5 });
    }
  }
  // Hub → member edges (faint).
  for (const section of sections) {
    const hub = nodes.find((n) => n.id === `hub:${section.label}`);
    if (!hub) continue;
    for (const r of section.routes) {
      const member = routeToNode.get(r);
      if (member && member.id !== hub.id) {
        edges.push({ source: hub.id, target: member.id, type: 'navigation', color: EDGE_COLORS.navigation, opacity: 0.18, weight: 0.3 });
      }
    }
  }

  return { nodes, edges };
}

// ── Layer 3: Card Interactions ────────────────────────────────────

const EFFECT_CHAIN = ['3', '4', '5', '6', '7', '9'];

/**
 * Build the Card Interactions layer.
 * @param {Array<object>} cards - Authoritative card definitions (from listAuthoritativeCards)
 * @returns {{nodes:Array<GraphNode>, edges:Array<GraphEdge>}}
 */
export function buildCardLayer(cards) {
  const nodes = [];
  const byIdentity = new Map();
  for (const card of cards) {
    const id = `card:${card.identity}`;
    const suitKey = card.suit ?? (card.identity === 'RJ' ? 'RJ' : card.identity === 'BJ' ? 'BJ' : '♣');
    const color = SUIT_COLORS[suitKey] ?? CATEGORY_COLORS.card;
    const weight = Number(card.prValue ?? 1);
    const node = {
      id, label: card.title ?? card.identity, category: 'card',
      color, weight, layer: LAYER_IDS.CARDS,
      data: { identity: card.identity, rank: card.rank, suit: card.suit, prValue: card.prValue, family: card.family },
    };
    nodes.push(node);
    byIdentity.set(card.identity, node);
  }

  const edges = [];
  const addEdge = (aId, bId, type, opacity, weight) => {
    const a = byIdentity.get(aId), b = byIdentity.get(bId);
    if (a && b && a.id !== b.id) {
      edges.push({ source: a.id, target: b.id, type, color: EDGE_COLORS.card, opacity, weight });
    }
  };

  // Royal Marriage: K♥↔Q♥, K♣↔Q♣, K♦↔Q♦, K♠↔Q♠
  for (const suit of ['♥', '♣', '♦', '♠']) {
    addEdge(`K${suit}`, `Q${suit}`, 'card', 0.6, 1.2);
  }

  // Effect chain: 3→4→5→6→7→9 per suit (effect progression).
  for (const suit of ['♥', '♣', '♦', '♠']) {
    for (let i = 0; i < EFFECT_CHAIN.length - 1; i++) {
      addEdge(`${EFFECT_CHAIN[i]}${suit}`, `${EFFECT_CHAIN[i + 1]}${suit}`, 'card', 0.35, 0.6);
    }
  }

  // Scuttle chains: per suit, sort by PR descending, link adjacent.
  for (const suit of ['♥', '♣', '♦', '♠']) {
    const suited = cards.filter((c) => c.suit === suit && c.rank !== 'RJ' && c.rank !== 'BJ');
    suited.sort((a, b) => (Number(b.prValue ?? 0) - Number(a.prValue ?? 0)));
    for (let i = 0; i < suited.length - 1; i++) {
      addEdge(suited[i].identity, suited[i + 1].identity, 'card', 0.25, 0.4);
    }
  }

  // Representative counter / protection relationships.
  addEdge('A♠', 'RJ', 'card', 0.5, 0.8); // Ace counters Red Joker shuffle reset
  addEdge('A♠', 'BJ', 'card', 0.5, 0.8); // Ace counters Board Lock
  for (const suit of ['♥', '♣', '♦', '♠']) {
    addEdge(`9${suit}`, `K${suit}`, 'card', 0.3, 0.5); // Anchor Guard protects
  }

  return { nodes, edges };
}

// ── Layer 4: All Combined ─────────────────────────────────────────

/**
 * Build the combined layer (all three layers with Z-axis separation).
 * Z < 0: cards, Z ≈ 0: mechanics, Z > 0: workspaces.
 * Cross-layer edges (mechanic → related card) are faint.
 * @param {{nodes:GraphNode[],edges:GraphEdge[]}} mechanics
 * @param {{nodes:GraphNode[],edges:GraphEdge[]}} workspaces
 * @param {{nodes:GraphNode[],edges:GraphEdge[]}} cards
 * @returns {{nodes:GraphNode[],edges:GraphEdge[]}}
 */
export function buildCombinedLayer(mechanics, workspaces, cards) {
  const Z = { cards: -40, mechanics: 0, workspaces: 40 };
  const stamp = (graph, z) => graph.nodes.map((n) => ({ ...n, data: { ...n.data, z } }));
  const nodes = [
    ...stamp(cards, Z.cards),
    ...stamp(mechanics, Z.mechanics),
    ...stamp(workspaces, Z.workspaces),
  ];

  const edges = [
    ...cards.edges,
    ...mechanics.edges,
    ...workspaces.edges,
  ];

  // Cross-layer: link effect-card mechanics to their card nodes (faint).
  const mechById = new Map(mechanics.nodes.map((n) => [n.data.mechanicId, n]));
  const EFFECT_MECHANIC_TO_RANK = {
    'effect-three': '3', 'effect-four': '4', 'effect-five': '5',
    'effect-six': '6', 'effect-seven': '7', 'effect-nine': '9',
  };
  for (const [mechId, rank] of Object.entries(EFFECT_MECHANIC_TO_RANK)) {
    const mechNode = mechById.get(mechId);
    if (!mechNode) continue;
    for (const cardNode of cards.nodes) {
      if (cardNode.data.rank === rank) {
        edges.push({ source: mechNode.id, target: cardNode.id, type: 'cross', color: EDGE_COLORS.cross, opacity: 0.1, weight: 0.2 });
      }
    }
  }

  return { nodes, edges };
}

// ── Filter / search helpers (pure) ────────────────────────────────

/**
 * Mark nodes matching a search query. Returns a Set of matching node ids.
 * Non-matching nodes should be dimmed by the renderer.
 * @param {Array<GraphNode>} nodes
 * @param {string} query
 * @returns {Set<string>}
 */
export function searchNodes(nodes, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return new Set(nodes.map((n) => n.id));
  const matches = new Set();
  for (const n of nodes) {
    const hay = `${n.label} ${n.category} ${n.data?.description ?? ''} ${n.data?.subtitle ?? ''} ${n.route ?? ''}`.toLowerCase();
    if (hay.includes(q)) matches.add(n.id);
  }
  return matches;
}

/**
 * Compute the set of node ids belonging to a category cluster.
 * @param {Array<GraphNode>} nodes
 * @param {string} category
 * @returns {Set<string>}
 */
export function clusterNodeIds(nodes, category) {
  return new Set(nodes.filter((n) => n.category === category).map((n) => n.id));
}

/**
 * Collect all categories present in a node set (for cluster controls).
 * @param {Array<GraphNode>} nodes
 * @returns {string[]}
 */
export function collectCategories(nodes) {
  return [...new Set(nodes.map((n) => n.category))].sort();
}

/**
 * Collect all unique edge types present in an edge set, sorted alphabetically.
 * Used to populate the edge-type filter bar.
 * @param {Array<GraphEdge>} edges
 * @returns {string[]}
 */
export function collectEdgeTypes(edges) {
  return [...new Set(edges.map((e) => e.type))].sort();
}

/**
 * Build an undirected adjacency map from edges (nodeId → Set<neighborId>).
 * @param {Array<GraphEdge>} edges
 * @returns {Map<string,Set<string>>}
 */
function buildAdjacency(edges) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source).add(e.target);
    adj.get(e.target).add(e.source);
  }
  return adj;
}

/**
 * Find the shortest path between two node ids via breadth-first search.
 * Edges are treated as undirected. Returns the ordered list of node ids
 * along the path and a Set of edge keys (`"${source}|${target}"`) covering
 * the path, or null when no path exists.
 * @param {Array<GraphNode>} nodes - Node set (used only to validate endpoints)
 * @param {Array<GraphEdge>} edges - Edge set
 * @param {string} startId
 * @param {string} endId
 * @returns {{path:string[],pathEdges:Set<string>}|null}
 */
export function findShortestPath(nodes, edges, startId, endId) {
  if (!startId || !endId || startId === endId) return null;
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodeIds.has(startId) || !nodeIds.has(endId)) return null;

  const adj = buildAdjacency(edges);
  if (!adj.has(startId) || !adj.has(endId)) return null;

  // BFS with predecessor tracking.
  const visited = new Set([startId]);
  const predecessor = new Map();
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === endId) break;
    for (const next of adj.get(cur) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      predecessor.set(next, cur);
      queue.push(next);
    }
  }

  if (!predecessor.has(endId)) return null;

  // Reconstruct path.
  const path = [endId];
  let cur = endId;
  while (predecessor.has(cur)) {
    cur = predecessor.get(cur);
    path.unshift(cur);
  }

  // Derive edge keys for the path (try both directions since undirected).
  const pathEdges = new Set();
  for (let i = 0; i < path.length - 1; i++) {
    pathEdges.add(`${path[i]}|${path[i + 1]}`);
    pathEdges.add(`${path[i + 1]}|${path[i]}`);
  }
  return { path, pathEdges };
}
