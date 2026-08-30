import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');
const brainSrc = (rel) => readFile(path.join(root, 'apps/lab-web/src/brain', rel), 'utf8');

// ── Pure data adapters (importable in Node — no browser deps) ──
import {
  buildMechanicsLayer, buildWorkspaceLayer, buildCardLayer, buildCombinedLayer,
  searchNodes, collectCategories, clusterNodeIds, weightToRadius,
  CATEGORY_COLORS, EDGE_COLORS, SUIT_COLORS, LAYER_IDS, WORKSPACE_RELATIONSHIPS,
} from '../apps/lab-web/src/brain/brain-data.js';

import {
  initialSpherePositions, stepLayout, settleLayout, applyZLayering, relaxAround,
  DEFAULT_LAYOUT_OPTIONS,
} from '../apps/lab-web/src/brain/brain-layout.js';

import { detectWebGL, buildFallbackSVG } from '../apps/lab-web/src/brain/brain-fallback.js';

// ═══════════════════════════════════════════════════════════════
// brain-data.js — data adapters
// ═══════════════════════════════════════════════════════════════

const SAMPLE_MECHANICS = [
  { mechanicId: 'play-for-points', displayName: 'Play for Points', category: 'scoring', description: 'Bank points.' },
  { mechanicId: 'scuttle', displayName: 'Scuttle', category: 'control', description: 'Remove points.' },
  { mechanicId: 'draw', displayName: 'Draw', category: 'resource', description: 'Draw a card.' },
  { mechanicId: 'effect-three', displayName: 'Peek (3)', category: 'response', description: 'Reveal.' },
  { mechanicId: 'anchor', displayName: 'Anchor', category: 'protection', description: 'Protect.' },
  { mechanicId: 'super', displayName: 'Super', category: 'advanced', description: 'Combo.' },
  { mechanicId: 'ultra', displayName: 'Ultra', category: 'terminal', description: 'Terminal.' },
];

const SAMPLE_OBSERVATORY = {
  synergies: [
    { source: 'play-for-points', target: 'scuttle', relationshipClass: 'synergy', shrunkEffect: 1.8, effectiveN: 120, bothN: 60 },
    { source: 'draw', target: 'scuttle', relationshipClass: 'anti-synergy', shrunkEffect: 0.5, effectiveN: 80, bothN: 40 },
    { source: 'unknown-mech', target: 'scuttle', relationshipClass: 'synergy', shrunkEffect: 2, effectiveN: 50, bothN: 30 },
  ],
  motifs: [
    { motif: 'play-for-points → scuttle', count: 25 },
    { motif: 'draw → unknown-mech', count: 10 },
  ],
};

test('buildMechanicsLayer produces nodes for each mechanic with correct category colors', () => {
  const { nodes } = buildMechanicsLayer(SAMPLE_MECHANICS, SAMPLE_OBSERVATORY);
  assert.equal(nodes.length, SAMPLE_MECHANICS.length);
  for (const n of nodes) {
    assert.ok(n.id.startsWith('mech:'), `node id ${n.id} should be namespaced`);
    assert.equal(n.color, CATEGORY_COLORS[n.category], `color for ${n.category}`);
    assert.equal(n.layer, LAYER_IDS.MECHANICS);
    assert.ok(n.weight >= 1);
  }
});

test('buildMechanicsLayer creates synergy and anti-synergy edges with correct colors', () => {
  const { edges } = buildMechanicsLayer(SAMPLE_MECHANICS, SAMPLE_OBSERVATORY);
  const syn = edges.find((e) => e.type === 'synergy');
  const anti = edges.find((e) => e.type === 'anti-synergy');
  assert.ok(syn, 'must have a synergy edge');
  assert.equal(syn.color, EDGE_COLORS.synergy);
  assert.ok(anti, 'must have an anti-synergy edge');
  assert.equal(anti.color, EDGE_COLORS['anti-synergy']);
});

test('buildMechanicsLayer skips edges referencing unknown mechanics', () => {
  const { edges } = buildMechanicsLayer(SAMPLE_MECHANICS, SAMPLE_OBSERVATORY);
  // unknown-mech is not in SAMPLE_MECHANICS, so its edges must be dropped.
  const dangling = edges.filter((e) => e.source.includes('unknown-mech') || e.target.includes('unknown-mech'));
  assert.deepEqual(dangling, []);
});

test('buildMechanicsLayer emits dashed motif edges', () => {
  const { edges } = buildMechanicsLayer(SAMPLE_MECHANICS, SAMPLE_OBSERVATORY);
  const motif = edges.find((e) => e.type === 'motif');
  assert.ok(motif, 'must have a motif edge');
  assert.equal(motif.dashed, true);
  assert.equal(motif.color, EDGE_COLORS.motif);
});

test('buildMechanicsLayer scales node weight by edge degree', () => {
  const { nodes } = buildMechanicsLayer(SAMPLE_MECHANICS, SAMPLE_OBSERVATORY);
  const scuttle = nodes.find((n) => n.id === 'mech:scuttle');
  const ultra = nodes.find((n) => n.id === 'mech:ultra');
  assert.ok(scuttle.weight > ultra.weight, 'high-degree node should have larger weight');
});

test('buildWorkspaceLayer creates hub + workspace nodes and navigation edges', () => {
  const workspaces = [
    ['/watch', '◈', 'Watch', 'Match theatre'],
    ['/replays', '▶', 'Replays', 'Verification'],
    ['/mechanics', '⌁', 'Mechanics', 'Atlas'],
  ];
  const sections = [{ label: 'Analysis', routes: ['/watch', '/replays', '/mechanics'] }];
  const { nodes, edges } = buildWorkspaceLayer(workspaces, sections);
  const hub = nodes.find((n) => n.id === 'hub:Analysis');
  assert.ok(hub, 'must create a section hub node');
  assert.equal(hub.category, 'hub');
  assert.equal(nodes.filter((n) => n.id.startsWith('ws:')).length, 3);
  // Navigation edge watch→replays exists in WORKSPACE_RELATIONSHIPS.
  const nav = edges.find((e) => e.source === 'ws:/watch' && e.target === 'ws:/replays');
  assert.ok(nav, 'must have watch→replays navigation edge');
  assert.equal(nav.color, EDGE_COLORS.navigation);
  // Hub→member edges exist.
  const hubEdges = edges.filter((e) => e.source === 'hub:Analysis');
  assert.ok(hubEdges.length >= 3, 'hub must link to its members');
});

test('WORKSPACE_RELATIONSHIPS includes the spec-required chains', () => {
  const has = (a, b) => WORKSPACE_RELATIONSHIPS.some(([f, t]) => f === a && t === b);
  assert.ok(has('/watch', '/replays'));
  assert.ok(has('/mechanics', '/synergies'));
  assert.ok(has('/ranks', '/traces'));
  assert.ok(has('/traces', '/branches'));
  assert.ok(has('/tournament', '/watch'));
  assert.ok(has('/evidence', '/intelligence'));
  assert.ok(has('/profile', '/settings'));
});

const SAMPLE_CARDS = [
  { identity: 'K♥', rank: 'K', suit: '♥', prValue: 8, title: 'King of Hearts', family: 'royal' },
  { identity: 'Q♥', rank: 'Q', suit: '♥', prValue: 2, title: 'Queen of Hearts', family: 'royal' },
  { identity: '9♣', rank: '9', suit: '♣', prValue: 9, title: 'Nine of Clubs', family: 'common' },
  { identity: 'K♣', rank: 'K', suit: '♣', prValue: 8, title: 'King of Clubs', family: 'royal' },
  { identity: '3♦', rank: '3', suit: '♦', prValue: 3, title: 'Three of Diamonds', family: 'common' },
  { identity: '4♦', rank: '4', suit: '♦', prValue: 4, title: 'Four of Diamonds', family: 'common' },
  { identity: 'A♠', rank: 'A', suit: '♠', prValue: 4, title: 'Ace of Spades', family: 'common' },
  { identity: 'RJ', rank: 'RJ', suit: null, prValue: 5, title: 'Red Joker', family: 'joker' },
  { identity: 'BJ', rank: 'BJ', suit: null, prValue: 11, title: 'Black Joker', family: 'joker' },
];

test('buildCardLayer creates nodes with suit-based colors and prValue weight', () => {
  const { nodes } = buildCardLayer(SAMPLE_CARDS);
  const kh = nodes.find((n) => n.id === 'card:K♥');
  assert.equal(kh.color, SUIT_COLORS['♥']);
  assert.equal(kh.weight, 8);
  const rj = nodes.find((n) => n.id === 'card:RJ');
  assert.equal(rj.color, SUIT_COLORS.RJ);
  const bj = nodes.find((n) => n.id === 'card:BJ');
  assert.equal(bj.color, SUIT_COLORS.BJ);
});

test('buildCardLayer creates Royal Marriage edges K↔Q same suit', () => {
  const { edges } = buildCardLayer(SAMPLE_CARDS);
  const marriage = edges.find((e) =>
    (e.source === 'card:K♥' && e.target === 'card:Q♥') ||
    (e.source === 'card:Q♥' && e.target === 'card:K♥'));
  assert.ok(marriage, 'must have K♥↔Q♥ royal marriage edge');
});

test('buildCardLayer creates counter edges A♠→RJ and A♠→BJ', () => {
  const { edges } = buildCardLayer(SAMPLE_CARDS);
  const toRj = edges.find((e) => e.source === 'card:A♠' && e.target === 'card:RJ');
  const toBj = edges.find((e) => e.source === 'card:A♠' && e.target === 'card:BJ');
  assert.ok(toRj, 'must have A♠→RJ counter edge');
  assert.ok(toBj, 'must have A♠→BJ counter edge');
});

test('buildCombinedLayer separates layers by Z and adds cross-layer edges', () => {
  const mech = buildMechanicsLayer(SAMPLE_MECHANICS, SAMPLE_OBSERVATORY);
  const ws = buildWorkspaceLayer([['/watch', '◈', 'Watch', 'x']], [{ label: 'Analysis', routes: ['/watch'] }]);
  const cards = buildCardLayer(SAMPLE_CARDS);
  const combined = buildCombinedLayer(mech, ws, cards);
  // Z stamped into data.
  const cardZs = combined.nodes.filter((n) => n.data?.z < 0);
  const wsZs = combined.nodes.filter((n) => n.data?.z > 0);
  assert.ok(cardZs.length > 0, 'card nodes must have negative Z');
  assert.ok(wsZs.length > 0, 'workspace nodes must have positive Z');
  // Cross-layer edges present (effect mechanic → effect card).
  const cross = combined.edges.filter((e) => e.type === 'cross');
  assert.ok(cross.length > 0, 'must have cross-layer edges');
  assert.equal(cross[0].color, EDGE_COLORS.cross);
});

test('searchNodes returns all ids for empty query and filters by label', () => {
  const nodes = [
    { id: 'a', label: 'Scuttle', category: 'control', data: {} },
    { id: 'b', label: 'Draw', category: 'resource', data: {} },
  ];
  assert.equal(searchNodes(nodes, '').size, 2);
  assert.equal(searchNodes(nodes, 'scut').size, 1);
  assert.ok(searchNodes(nodes, 'scut').has('a'));
});

test('collectCategories and clusterNodeIds group nodes by category', () => {
  const nodes = [
    { id: 'a', category: 'scoring' },
    { id: 'b', category: 'control' },
    { id: 'c', category: 'scoring' },
  ];
  assert.deepEqual(collectCategories(nodes), ['control', 'scoring']);
  assert.deepEqual([...clusterNodeIds(nodes, 'scoring')].sort(), ['a', 'c']);
});

test('weightToRadius maps weight to a radius within [base, max]', () => {
  assert.equal(weightToRadius(0), 2.0);
  assert.ok(weightToRadius(100) <= 5.0);
  assert.ok(weightToRadius(100) >= 2.0);
  assert.ok(weightToRadius(5) > weightToRadius(1));
});

test('CATEGORY_COLORS covers all spec categories with design-token colors', () => {
  for (const cat of ['scoring', 'control', 'resource', 'response', 'protection', 'advanced', 'terminal']) {
    assert.ok(CATEGORY_COLORS[cat], `missing color for ${cat}`);
  }
  assert.equal(CATEGORY_COLORS.scoring, '#5ad7e8');
  assert.equal(CATEGORY_COLORS.terminal, '#ee6cb7');
});

// ═══════════════════════════════════════════════════════════════
// brain-layout.js — force simulation math
// ═══════════════════════════════════════════════════════════════

test('initialSpherePositions returns count points on a sphere', () => {
  const pts = initialSpherePositions(20, 40);
  assert.equal(pts.length, 20);
  for (const p of pts) {
    const r = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2);
    assert.ok(Math.abs(r - 40) < 1.5, `point should be near radius 40, got ${r}`);
  }
});

test('initialSpherePositions handles count=1 without NaN', () => {
  const pts = initialSpherePositions(1, 30);
  assert.equal(pts.length, 1);
  assert.ok(Number.isFinite(pts[0].x));
});

test('stepLayout mutates positions and returns finite kinetic energy', () => {
  const pos = initialSpherePositions(5, 20);
  const vel = pos.map(() => ({ x: 0, y: 0, z: 0 }));
  const edges = [{ source: 0, target: 1, weight: 1 }, { source: 1, target: 2, weight: 1 }];
  const energy = stepLayout(pos, vel, edges);
  assert.ok(Number.isFinite(energy));
  assert.ok(energy >= 0);
});

test('settleLayout converges within maxIterations and freezes', () => {
  const pos = initialSpherePositions(8, 30);
  const edges = [{ source: 0, target: 1 }, { source: 2, target: 3 }, { source: 4, target: 5 }];
  const { iterations, energy } = settleLayout(pos, edges, { maxIterations: 50 });
  assert.ok(iterations <= 50);
  assert.ok(Number.isFinite(energy));
});

test('applyZLayering moves positions toward target Z', () => {
  const pos = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }];
  applyZLayering(pos, [-40, 40], 1);
  assert.equal(pos[0].z, -40);
  assert.equal(pos[1].z, 40);
});

test('relaxAround zeroes velocity of the pinned node', () => {
  const pos = initialSpherePositions(6, 25);
  const vel = pos.map(() => ({ x: 1, y: 1, z: 1 }));
  const edges = [{ source: 0, target: 1 }, { source: 1, target: 2 }];
  relaxAround(pos, vel, edges, 0, 3);
  assert.equal(vel[0].x, 0);
  assert.equal(vel[0].y, 0);
  assert.equal(vel[0].z, 0);
});

test('DEFAULT_LAYOUT_OPTIONS has damping and velocity clamp', () => {
  assert.ok(DEFAULT_LAYOUT_OPTIONS.damping > 0 && DEFAULT_LAYOUT_OPTIONS.damping < 1);
  assert.ok(DEFAULT_LAYOUT_OPTIONS.maxVelocity > 0);
  assert.ok(DEFAULT_LAYOUT_OPTIONS.maxIterations > 0);
});

// ═══════════════════════════════════════════════════════════════
// brain-fallback.js — WebGL detection + SVG fallback
// ═══════════════════════════════════════════════════════════════

test('detectWebGL returns false when context factory returns null', () => {
  assert.equal(detectWebGL(() => ({}), () => null), false);
});

test('detectWebGL returns true when a context is available', () => {
  assert.equal(detectWebGL(() => ({}), () => ({})), true);
});

test('detectWebGL returns false when canvas factory returns null', () => {
  assert.equal(detectWebGL(() => null, () => ({})), false);
});

test('buildFallbackSVG produces valid SVG markup with nodes', () => {
  const nodes = [
    { id: 'a', label: 'Scuttle', color: '#f2777a', route: '/mechanics' },
    { id: 'b', label: 'Draw', color: '#68d391' },
  ];
  const svg = buildFallbackSVG(nodes, [{ source: 'a', target: 'b' }]);
  assert.match(svg, /<svg/);
  assert.match(svg, /Scuttle/);
  assert.match(svg, /<line/);
  assert.match(svg, /role="img"/);
});

test('buildFallbackSVG escapes XML special characters in labels', () => {
  const svg = buildFallbackSVG([{ id: 'x', label: '<b>&"\'', color: '#fff' }], []);
  assert.ok(!svg.includes('<b>'), 'must escape raw <');
  assert.ok(svg.includes('&lt;'));
});

// ═══════════════════════════════════════════════════════════════
// Source presence — app.js integration, CSS, module structure
// ═══════════════════════════════════════════════════════════════

test('app.js lazy-loads the brain controller via dynamic import', async () => {
  const js = await src('app.js');
  assert.match(js, /getBrain\s*=\s*lazyLoad\(\(\)\s*=>\s*import\('\.\/brain\/brain-controller\.js'\)\)/);
});

test('app.js embeds #brain-container in renderWipLanding', async () => {
  const js = await src('app.js');
  assert.match(js, /id="brain-container"/);
  assert.match(js, /wip-brain-section/);
});

test('app.js initializes the brain after renderWipLanding innerHTML', async () => {
  const js = await src('app.js');
  assert.match(js, /getBrain\(\)\.then\(\(\{ initBrain \}\)\s*=>\s*brainHost\.isConnected\s*\?\s*initBrain\(brainHost\)\s*:\s*null\)/);
});

test('app.js cleans up the brain before every homepage replacement', async () => {
  const js = await src('app.js');
  assert.match(js, /if\s*\(_previousRoute === '\/'\)/);
  assert.match(js, /destroyBrain/);
});

test('brain-controller.js exports initBrain and destroyBrain', async () => {
  const js = await brainSrc('brain-controller.js');
  assert.match(js, /export async function initBrain/);
  assert.match(js, /export function destroyBrain/);
});

test('brain-controller.js imports three indirectly via scene/nodes/edges/interaction', async () => {
  const js = await brainSrc('brain-controller.js');
  assert.match(js, /from '\.\/brain-scene\.js'/);
  assert.match(js, /from '\.\/brain-nodes\.js'/);
  assert.match(js, /from '\.\/brain-edges\.js'/);
  assert.match(js, /from '\.\/brain-interaction\.js'/);
  assert.match(js, /from '\.\/brain-ui\.js'/);
  assert.match(js, /from '\.\/brain-data\.js'/);
  assert.match(js, /from '\.\/brain-layout\.js'/);
  assert.match(js, /from '\.\/brain-fallback\.js'/);
});

test('brain-controller.js handles WebGL context loss with fallback', async () => {
  const js = await brainSrc('brain-controller.js');
  assert.match(js, /webglcontextlost/);
  assert.match(js, /renderFallback/);
});

test('brain-controller.js respects reducedMotion setting', async () => {
  const js = await brainSrc('brain-controller.js');
  assert.match(js, /reducedMotion/);
  assert.match(js, /state\.reducedMotion/);
});

test('brain-scene.js dynamically imports three', async () => {
  const js = await brainSrc('brain-scene.js');
  assert.match(js, /import \* as THREE from 'three'/);
  assert.match(js, /WebGLRenderer/);
  assert.match(js, /FogExp2/);
  assert.match(js, /alpha:\s*true/);
});

test('brain-scene.js disposes renderer and removes canvas', async () => {
  const js = await brainSrc('brain-scene.js');
  assert.match(js, /renderer\.dispose/);
  assert.match(js, /removeChild/);
});

test('brain-nodes.js creates icosahedron geometry with emissive glow', async () => {
  const js = await brainSrc('brain-nodes.js');
  assert.match(js, /IcosahedronGeometry/);
  assert.match(js, /MeshStandardMaterial/);
  assert.match(js, /emissiveIntensity/);
  assert.match(js, /Sprite/);
  assert.match(js, /CanvasTexture/);
});

test('brain-edges.js renders synergy/anti-synergy/navigation/card/motif edge types', async () => {
  const js = await brainSrc('brain-edges.js');
  assert.match(js, /LineBasicMaterial/);
  assert.match(js, /LineDashedMaterial/);
  assert.match(js, /computeLineDistances/);
});

test('brain-interaction.js implements orbit/pan/zoom and raycaster', async () => {
  const js = await brainSrc('brain-interaction.js');
  assert.match(js, /Raycaster/);
  assert.match(js, /azimuth/);
  assert.match(js, /polar/);
  assert.match(js, /tRadius/);
  assert.match(js, /pointerdown/);
  assert.match(js, /wheel/);
  assert.match(js, /contextmenu/);
});

test('brain-ui.js builds layer switcher, search, tooltip, detail panel, cluster controls', async () => {
  const js = await brainSrc('brain-ui.js');
  assert.match(js, /brain-layer-switcher/);
  assert.match(js, /brain-search/);
  assert.match(js, /brain-tooltip/);
  assert.match(js, /brain-detail-panel/);
  assert.match(js, /brain-cluster-controls/);
  assert.match(js, /brain-help-hint/);
});

test('brain-data.js defines all four layer ids', async () => {
  const js = await brainSrc('brain-data.js');
  assert.match(js, /MECHANICS:/);
  assert.match(js, /WORKSPACES:/);
  assert.match(js, /CARDS:/);
  assert.match(js, /COMBINED:/);
});

// ── CSS presence ──
test('brain.css exists and is imported in styles.css', async () => {
  const styles = await src('styles.css');
  assert.match(styles, /@import\s+'\.\/css\/brain\.css'/);
  await access(path.join(root, 'apps/lab-web/src/css/brain.css'));
});

test('brain.css has container, overlay, detail panel, and mobile styles', async () => {
  const css = await readFile(path.join(root, 'apps/lab-web/src/css/brain.css'), 'utf8');
  assert.match(css, /#brain-container/);
  assert.match(css, /\.brain-overlay/);
  assert.match(css, /\.brain-layer-switcher/);
  assert.match(css, /\.brain-detail-panel/);
  assert.match(css, /\.brain-tooltip/);
  assert.match(css, /\.brain-cluster-controls/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media\s*\(max-width:768px\)/);
});

// ── three.js dependency ──
test('three.js is declared as a dependency in package.json', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies?.three, 'three must be in dependencies');
});
