// ═══════════════════════════════════════════════════════════════
// cards-observatory.test.mjs — Card Observatory (/cards) regression
//
// Pins the post-rebuild contract:
//   Routing — /cards is a normal Lab workspace, not landing-mode
//   Canonical — all 54 identities resolve, no duplicates/missing
//   Evidence mapping — exact suit / shared normal / spade / super /
//     rank fallback / missing / legacy-telemetry integrity states
//   Dossier — canonical Advanced Card Rules only; no stale strategy
//   Filtering — search, suit/rank, evidence, confidence, clear
//   Cross-links — Ranks, Mechanics, Strategy deep links
//   Accessibility — grid semantics, roving tabindex, tablist
//   DOM truth — no 420px fixed drawer, no old card-reference page
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

const M = await import(pathToFileUrl('apps/lab-web/src/workspaces/cards/card-model.js'));
function pathToFileUrl(rel) {
  return new URL(`file:///${path.join(root, rel).replace(/\\/g, '/')}`).href;
}

const { listAuthoritativeCards, getCardDefinition } = await import(pathToFileUrl('apps/lab-web/src/card-face-data.js'));

// ── Synthetic variant-analytics artifact for evidence tests ─────
function makeVa({ metrics = {}, confidence = {}, entities = [], power = {}, rankComparisons = {} } = {}) {
  return { schemaVersion: '1.0.0', variantMetrics: metrics, variantPower: power, confidence, entities, rankComparisons };
}

// ═══ Routing ═══════════════════════════════════════════════════

test('routing: /cards is not a landing mode and renders through the Lab shell', async () => {
  const routerCode = await src('router.js');
  const landingModesMatch = routerCode.match(/LANDING_MODES\s*=\s*new Set\(\[([^\]]+)\]\)/);
  assert.ok(landingModesMatch);
  assert.ok(!landingModesMatch[1].includes("'/cards'"), '/cards must be removed from LANDING_MODES');
  assert.ok(routerCode.includes("['/cards'"), '/cards must stay in WORKSPACES navigation');
});

test('routing: app.js dispatches /cards through the renderer map', async () => {
  const appCode = await src('app.js');
  assert.ok(appCode.includes("'/cards': renderCards"), 'renderers map must contain /cards');
  assert.ok(!appCode.includes('renderCardReference'), 'old card-reference import must be gone');
});

test('routing: workspace keeps title/subtitle/instrument identity', async () => {
  const routerCode = await src('router.js');
  assert.ok(routerCode.includes("'/cards':") || routerCode.includes("'/cards'"), 'router must retain /cards entries');
  assert.ok(/INSTRUMENTS[\s\S]*'\/cards':\s*'OBS-18 · CARD OBSERVATORY'/.test(routerCode), 'INSTRUMENTS must name the Card Observatory');
  assert.ok(routerCode.includes('Card atlas'), 'subtitle must describe the atlas');
});

// ═══ Canonical coverage ════════════════════════════════════════

test('canonical: all 54 authoritative identities resolve through the model', () => {
  const cards = listAuthoritativeCards();
  assert.equal(cards.length, 54, 'registry must list exactly 54 cards');
  const deck = M.buildDeck(null);
  assert.equal(deck.length, 54, 'model must build all 54 view-models');
  const ids = new Set(deck.map(m => m.identity));
  assert.equal(ids.size, 54, 'no duplicated identities');
  for (const c of cards) {
    assert.ok(ids.has(c.identity), `missing ${c.identity}`);
    assert.ok(getCardDefinition(c.identity), `${c.identity} resolves`);
  }
});

test('canonical: deck matrix covers every card — 13 rank rows + jokers', () => {
  const rows = M.deckMatrix(M.buildDeck(null));
  assert.equal(rows.length, 14);
  assert.equal(rows.filter(r => r.joker).length, 1);
  for (const row of rows.filter(r => !r.joker)) {
    assert.equal(row.cells.length, 4, `rank ${row.rank} has 4 suit cells`);
    assert.ok(row.cells.every(c => c.model), `rank ${row.rank} all cells populated`);
  }
  const jokers = rows.find(r => r.joker);
  assert.deepEqual(jokers.cells.map(c => c.model?.identity), ['RJ', 'BJ']);
});

// ═══ Evidence mapping ══════════════════════════════════════════

test('evidence mapping: per-suit Tens map to exact suit entities', () => {
  const cases = { '10♣': '10:club', '10♦': '10:diamond', '10♥': '10:heart', '10♠': '10:spade' };
  for (const [id, key] of Object.entries(cases)) {
    const e = M.evidenceEntityForIdentity(id);
    assert.equal(e.variantKey, key, `${id} → ${key}`);
    assert.equal(e.scope, 'exact-suit', `${id} scope`);
    assert.match(e.scopeLabel, /Exact suit variant/);
  }
});

test('evidence mapping: normal ♣/♦/♥ cards map to shared normal, labeled shared', () => {
  for (const id of ['A♣', '5♦', 'K♥', '2♣', 'J♦']) {
    const e = M.evidenceEntityForIdentity(id);
    assert.equal(e.scope, 'shared-normal', `${id} must be shared-normal`);
    assert.match(e.scopeLabel, /Shared normal/);
    assert.match(e.variantKey, /:normal$/, `${id} → :normal entity`);
    assert.match(e.disclosure, /not independently measured/i, 'shared disclosure must be honest');
  }
});

test('evidence mapping: spade cards map to exact spade entities', () => {
  for (const id of ['A♠', 'K♠', '2♠', '9♠']) {
    const e = M.evidenceEntityForIdentity(id);
    assert.equal(e.scope, 'exact-spade', `${id} scope`);
    assert.equal(e.variantKey, `${id.replace('♠', '')}:spade`);
  }
});

test('evidence mapping: jokers map to their own exact-card entity', () => {
  for (const id of ['RJ', 'BJ']) {
    const e = M.evidenceEntityForIdentity(id);
    assert.equal(e.variantKey, id);
    assert.equal(e.scope, 'exact-card');
    assert.match(e.scopeLabel, /Exact card/);
  }
});

test('evidence status: missing metrics is unavailable — never fabricated zeros', () => {
  const va = makeVa({ metrics: { 'K:normal': { variantOpportunityCount: 50, variantSelectionCount: 10 } } });
  const ev = M.evidenceForEntity('Q:normal', va);
  assert.equal(ev.status, 'unavailable');
  assert.equal(ev.metrics, null);
});

test('evidence status: selections without opportunities is integrity-failure, not 0% pick', () => {
  const va = makeVa({ metrics: { 'K:normal': { variantOpportunityCount: 0, variantSelectionCount: 7 } } });
  const ev = M.evidenceForEntity('K:normal', va);
  assert.equal(ev.status, 'integrity-failure', 'legacy telemetry must be flagged, not rendered as 0%');
});

test('evidence status: below-confidence-floor is insufficient', () => {
  const va = makeVa({ metrics: { 'A:normal': { variantOpportunityCount: 3, variantSelectionCount: 1 } } });
  const ev = M.evidenceForEntity('A:normal', va);
  assert.equal(ev.status, 'insufficient');
  assert.equal(ev.confidence, 'INSUFFICIENT');
});

test('evidence status: rank-level fallback surfaced only as disclosure', () => {
  const va = makeVa({ metrics: { '8': { variantOpportunityCount: 60, variantSelectionCount: 20 } } });
  const ev = M.evidenceForEntity('8:normal', va);
  assert.equal(ev.status, 'unavailable');
  assert.ok(ev.rankFallback, 'rank fallback must be disclosed');
  assert.equal(ev.rankFallback.key, '8');
});

test('evidence status: no dataset degrades honestly', () => {
  const ev = M.evidenceForEntity('A:normal', null);
  assert.equal(ev.status, 'no-dataset');
});

test('evidence mapping: family entities expose super variants without mixing scopes', () => {
  const va = makeVa({
    metrics: {
      '7:normal': { variantOpportunityCount: 40, variantSelectionCount: 9 },
      '7:spade': { variantOpportunityCount: 35, variantSelectionCount: 8 },
      '7:super:super-seven-topdeck': { variantOpportunityCount: 12, variantSelectionCount: 5 },
      '7:super:all': { variantOpportunityCount: 12, variantSelectionCount: 5 },
    },
    entities: [
      { variantKey: '7:normal', tier: 'normal', displayName: 'Rank 7 Normal' },
      { variantKey: '7:spade', tier: 'spade', displayName: '7♠ Topdeck' },
      { variantKey: '7:super:super-seven-topdeck', tier: 'super', displayName: '⭐7 Sequential Topdeck' },
      { variantKey: '7:super:all', tier: 'super-aggregate', displayName: 'Rank 7 All Supers' },
    ],
    rankComparisons: { '7': { entityOrder: ['7', '7:normal', '7:spade', '7:super:super-seven-topdeck', '7:super:all'], levels: {} } },
  });
  const card = M.cardViewModel('7♠', va);
  const fam = M.rankFamilyEntities(card, va);
  const mapped = fam.find(e => e.mapped);
  assert.equal(mapped.key, '7:spade', '7♠ maps to the spade entity');
  assert.ok(fam.some(e => e.tier === 'super'), 'super entity must appear in family context');
  assert.ok(fam.some(e => e.tier === 'super-aggregate'), 'super aggregate must appear');
});

// ═══ Dossier / canonical authority ═════════════════════════════

test('dossier: authority tab embeds canonical Advanced Card Rules, not copied strings', async () => {
  const ws = await src('workspaces/cards/card-workspace.js');
  const model = await src('workspaces/cards/card-model.js');
  assert.ok(ws.includes("import { renderAdvancedCardRulesView } from '../../play/advanced-card-rules/advanced-card-rules-view.mjs'"),
    'must render the canonical ACR view');
  assert.ok(model.includes("import { getCardRulesDefinition } from '../../play/advanced-card-rules/card-rules-data.mjs'"),
    'model must read from card-rules-data.mjs');
  assert.ok(!model.includes('CARD_RULES_FOR_CARDS_PAGE'), 'no copied rules dataset');
});

test('dossier: old timing-derived strategy copy is gone', async () => {
  const ws = await src('workspaces/cards/card-workspace.js');
  for (const stale of ['buildWhenToPlayGuidance', 'when to play', 'card-ref-detail', 'card-reference-app', 'Play as a response']) {
    assert.ok(!ws.includes(stale), `stale reference "${stale}" must be removed`);
  }
});

test('dossier: four product layers exist as tabs', async () => {
  const ws = await src('workspaces/cards/card-workspace.js');
  for (const tab of ['identity', 'authority', 'evidence', 'connections']) {
    assert.ok(ws.includes(`id: '${tab}'`), `dossier tab ${tab} must exist`);
  }
});

// ═══ Filtering / search ════════════════════════════════════════

test('filters: identity search matches cards', () => {
  const deck = M.buildDeck(null);
  assert.equal(M.filterModels(deck, { search: 'K♠' }).length, 1);
  assert.equal(M.filterModels(deck, { search: '10' }).length, 4);
  assert.equal(M.filterModels(deck, { search: 'joker' }).length, 2);
});

test('filters: suit and rank filters', () => {
  const deck = M.buildDeck(null);
  assert.equal(M.filterModels(deck, { suit: '♠' }).length, 13);
  assert.equal(M.filterModels(deck, { suit: 'joker' }).length, 2);
  assert.equal(M.filterModels(deck, { rank: 'A' }).length, 4);
  assert.equal(M.filterModels(deck, { rank: 'joker' }).length, 2);
  assert.equal(M.filterModels(deck, { suit: '♠', rank: 'K' }).length, 1);
});

test('filters: evidence scope filter uses the mapping, not guesses', () => {
  const deck = M.buildDeck(null);
  assert.equal(M.filterModels(deck, { evidence: 'shared' }).length, 36, '12 ranks × 3 normal suits');
  assert.equal(M.filterModels(deck, { evidence: 'exact' }).length, 18, '13 spades + 3 extra tens + 2 jokers');
  const va = makeVa({ metrics: { 'A:normal': { variantOpportunityCount: 50, variantSelectionCount: 10 } } });
  const withVa = M.buildDeck(va);
  const insufficient = M.filterModels(withVa, { evidence: 'insufficient' });
  assert.ok(!insufficient.some(m => m.identity === 'A♣'), 'card with mapped evidence must not appear as insufficient');
});

test('filters: clear filters restores the full deck (toolbar contract)', async () => {
  const ws = await src('workspaces/cards/card-workspace.js');
  assert.ok(ws.includes('card-clear-filters'), 'clear-filters control must exist');
  assert.ok(ws.includes("cardSuitFilter: 'all'") && ws.includes("cardSearch: ''"), 'clear must reset all filter fields');
});

// ═══ Cross-links ═══════════════════════════════════════════════

test('cross-links: rank, mechanics, and strategy targets exist', async () => {
  const ws = await src('workspaces/cards/card-workspace.js');
  assert.ok(ws.includes("location.hash = '#/ranks'"), 'Rank navigation');
  assert.ok(ws.includes("location.hash = '#/mechanics'"), 'Mechanics navigation');
  assert.ok(ws.includes('state.mechanicsRankFilter'), 'Mechanics rank filter must be set');
  assert.ok(ws.includes('state.selectedRank'), 'Rank dossier selection must be set');
  assert.ok(ws.includes('#/strategy?subject=rank:'), 'Strategy subject deep link');
  const m = M.relationshipsFor(M.cardViewModel('10♠', null));
  assert.ok(m.some(l => l.apply === 'rank:10:spade'), '10♠ must link to its suit dossier');
});

// ═══ Accessibility & DOM truth ═════════════════════════════════

test('a11y: atlas uses real grid semantics with roving tabindex', async () => {
  const ws = await src('workspaces/cards/card-workspace.js');
  assert.ok(ws.includes('role="grid"'), 'atlas must be a grid');
  assert.ok(ws.includes('role="gridcell"'), 'cells must be gridcells');
  assert.ok(ws.includes('aria-selected'), 'selection must be announced');
  assert.ok(ws.includes('tabindex="${tabbable'), 'roving tabindex must exist');
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    assert.ok(ws.includes(`'${key}'`), `arrow-key navigation must support ${key}`);
  }
});

test('a11y: dossier tabs use tablist semantics', async () => {
  const ws = await src('workspaces/cards/card-workspace.js');
  assert.ok(ws.includes('role="tablist"'), 'tablist');
  assert.ok(ws.includes('role="tab"'), 'tabs');
  assert.ok(ws.includes('role="tabpanel"'), 'tabpanel');
});

test('DOM truth: no 420px fixed drawer remains as the dossier interaction', async () => {
  const ws = await src('workspaces/cards/card-workspace.js');
  const css = await src('css/cards.css');
  assert.ok(!ws.includes('card-ref-detail'), 'old drawer markup gone');
  assert.ok(!css.includes('position:fixed'), 'no fixed-position dossier');
  const featureCss = await src('css/feature-components.css');
  assert.ok(!featureCss.includes('.card-ref-detail'), 'old drawer CSS removed');
});

test('deep-link: selected card syncs to ?card= without extra history entries', async () => {
  const ws = await src('workspaces/cards/card-workspace.js');
  assert.ok(ws.includes('history.replaceState'), 'must use replaceState (no history spam)');
  assert.ok(ws.includes("params.get('card')"), 'must read the card deep-link');
});
