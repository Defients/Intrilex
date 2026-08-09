import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getCardRulesDefinition,
  listCanonicalIdentities,
  allRulings,
  validateCardRulesData,
  coverageAudit,
  CARD_RULES_DATA_META,
} from '../apps/lab-web/src/play/advanced-card-rules/card-rules-data.mjs';
import { renderAdvancedCardRulesView } from '../apps/lab-web/src/play/advanced-card-rules/advanced-card-rules-view.mjs';
import {
  findAuthorizedCard,
  isCardInspectable,
  buildCurrentMatchContext,
  openAdvancedCardRules,
  closeAdvancedCardRules,
  getOpenIdentity,
} from '../apps/lab-web/src/play/advanced-card-rules/advanced-card-rules-controller.mjs';

const root = join(import.meta.dirname, '..');

// ── Minimal DOM shim for controller open/close/focus tests ──────
function makeEl(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    children: [],
    childNodes: [],
    _attrs: {},
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    innerHTML: '',
    textContent: '',
    open: false,
    ariaHidden: 'false',
    _listeners: {},
    _focused: false,
    parentNode: null,
    setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'aria-hidden') this.ariaHidden = String(v); },
    getAttribute(k) { return this._attrs[k] ?? null; },
    addEventListener(t, fn) { (this._listeners[t] ??= []).push(fn); },
    removeEventListener(t, fn) {
      if (!this._listeners[t]) return;
      this._listeners[t] = this._listeners[t].filter(f => f !== fn);
    },
    querySelector(sel) { return this._qs(sel); },
    querySelectorAll(sel) { return this._qsa(sel); },
    _qs(sel) {
      // very small selector support: [data-x], tag, .class
      if (sel.startsWith('[data-')) {
        const key = sel.slice(1, -1).replace('data-', '').replace(/-/g, '');
        return this.children.find(c => c.dataset[key] !== undefined) ?? null;
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return this.children.find(c => (c._attrs.class ?? '').includes(cls)) ?? null;
      }
      return this.children.find(c => c.tagName === sel.toUpperCase()) ?? null;
    },
    _qsa(sel) {
      if (sel.startsWith('[data-')) {
        const key = sel.slice(1, -1).replace('data-', '').replace(/-/g, '');
        return this.children.filter(c => c.dataset[key] !== undefined);
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return this.children.filter(c => (c._attrs.class ?? '').includes(cls));
      }
      return this.children.filter(c => c.tagName === sel.toUpperCase());
    },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    replaceWith(n) {
      const p = this.parentNode;
      if (!p) return;
      const idx = p.children.indexOf(this);
      if (idx >= 0) p.children[idx] = n;
    },
    focus() { this._focused = true; globalShim.activeElement = this; },
    showModal() { this.open = true; },
    close() { this.open = false; },
  };
  return el;
}

let globalShim;
function installDom() {
  const dialog = makeEl('dialog');
  dialog.id = 'advanced-card-rules-dialog';
  const content = makeEl('div');
  content.id = 'advanced-card-rules-content';
  const title = makeEl('h2');
  title.id = 'advanced-card-rules-title';
  const closeBtn = makeEl('button');
  closeBtn.dataset.acrClose = '';
  dialog.children = [closeBtn, content];
  closeBtn.parentNode = dialog;
  content.parentNode = dialog;

  globalShim = {
    activeElement: null,
    getElementById(id) {
      if (id === 'advanced-card-rules-dialog') return dialog;
      if (id === 'advanced-card-rules-content') return content;
      if (id === 'advanced-card-rules-title') return title;
      return null;
    },
    querySelector(sel) {
      if (sel === '#advanced-card-rules-dialog') return dialog;
      return null;
    },
  };
  globalThis.document = globalShim;
  return { dialog, content, title, closeBtn };
}
function uninstallDom() { delete globalThis.document; }

// ═══════════════════════════════════════════════════════════════
// 1. Canonical data model
// ═══════════════════════════════════════════════════════════════

test('Advanced Card Rules: meta reports v4.3.1 canon and 54 identities', () => {
  assert.equal(CARD_RULES_DATA_META.rulesVersion, '4.3.1');
  assert.equal(CARD_RULES_DATA_META.identityCount, 54);
  assert.equal(listCanonicalIdentities().length, 54);
});

test('Advanced Card Rules: every canonical identity has a rules definition with overview', () => {
  for (const id of listCanonicalIdentities()) {
    const def = getCardRulesDefinition(id);
    assert.ok(def, `missing definition for ${id}`);
    assert.ok(def.overview, `missing overview for ${id}`);
    assert.ok(def.canonSource, `missing canonSource for ${id}`);
    assert.equal(def.identity, id);
  }
});

test('Advanced Card Rules: canonical data validation succeeds (no drift)', () => {
  const result = validateCardRulesData();
  assert.equal(result.errors.length, 0, `validation errors:\n${result.errors.join('\n')}`);
});

test('Advanced Card Rules: no duplicate ruling ids across all cards', () => {
  const rulings = allRulings();
  const ids = rulings.map(r => r.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate ruling ids: ${dupes.join(', ')}`);
});

test('Advanced Card Rules: tooltips remain concise (summary is short, full is longer)', () => {
  for (const id of listCanonicalIdentities()) {
    const def = getCardRulesDefinition(id);
    for (const a of def.abilities) {
      assert.ok(a.summary, `ability ${a.id} on ${id} missing summary`);
      assert.ok(a.summary.length <= 220, `summary too long for ${a.id} on ${id} (${a.summary.length})`);
      if (a.full && a.full !== a.summary) {
        assert.ok(a.full.length >= a.summary.length, `full shorter than summary for ${a.id} on ${id}`);
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// 2. Renderer
// ═══════════════════════════════════════════════════════════════

test('Advanced Card Rules: view renders for a simple card without empty sections', () => {
  const html = renderAdvancedCardRulesView('2♥');
  assert.ok(html.includes('acr-view'), 'missing acr-view root');
  assert.ok(html.includes('Play Modes'), 'missing play modes section');
  // Simple card has no generated/recursive behavior → section must be absent
  assert.ok(!html.includes('Generated / Recursive'), 'empty generated section should not render');
});

test('Advanced Card Rules: structured rulings render for Rank 7', () => {
  const html = renderAdvancedCardRulesView('7♥');
  assert.ok(html.includes('Strange Cases'), 'missing rulings section');
  assert.ok(html.includes('acr-ruling'), 'missing ruling element');
  assert.ok(html.includes('Generated / Recursive'), 'missing generated section for 7');
  assert.ok(html.includes('Combinations'), 'missing combinations section');
  assert.ok(html.includes('Destinations'), 'missing destinations section');
});

test('Advanced Card Rules: complex card supports multiple sections (K♠)', () => {
  const html = renderAdvancedCardRulesView('K♠');
  assert.ok(html.includes('Wild Sovereignty'), 'K♠ missing Wild Sovereignty content');
  assert.ok(html.includes('Exile'), 'K♠ missing Exile destination');
  assert.ok((html.match(/acr-ruling/g) ?? []).length >= 3, 'K♠ should have multiple rulings');
  assert.ok(html.includes('Legal / Illegal Examples'), 'K♠ missing examples');
});

test('Advanced Card Rules: empty sections do not render', () => {
  const html = renderAdvancedCardRulesView('A♣');
  // A♣ has no generatedRecursive or combinations at identity level
  assert.ok(!html.includes('Generated / Recursive'), 'empty generated section rendered for A♣');
});

test('Advanced Card Rules: CURRENT MATCH section is separate and labeled', () => {
  const ctx = {
    cardId: 'c1', zone: 'HAND', actor: 'P1', stateRevision: 7,
    legalActions: [{ optionId: 'a1', displayLabel: 'Score for 7', form: 'score', timingClass: 'ACTION', isResponse: false, isSuper: false }],
    legalTargetCount: 0, available: true,
  };
  const html = renderAdvancedCardRulesView('7♥', { currentMatch: ctx });
  assert.ok(html.includes('Current Match'), 'missing current match section');
  assert.ok(html.includes('Score for 7'), 'missing legal action in current match');
  assert.ok(html.includes('authoritative legal-action'), 'missing provenance note');
});

test('Advanced Card Rules: unavailable current state shows neutral message', () => {
  const ctx = { cardId: 'c1', zone: 'HAND', legalActions: [], available: false };
  const html = renderAdvancedCardRulesView('7♥', { currentMatch: ctx });
  assert.ok(html.includes('Unavailable in the current state.'), 'missing unavailable message');
  // Must NOT invent a reason
  assert.ok(!html.includes('Board Lock prevents'), 'must not invent an illegality reason');
});

// ═══════════════════════════════════════════════════════════════
// 3. Controller — hidden-info firewall & current-match derivation
// ═══════════════════════════════════════════════════════════════

test('Advanced Card Rules: hidden card cannot be inspected', () => {
  const snapshot = {
    playerView: {
      own: { hand: [{ entityId: 'h1', identity: '7♥', zone: 'HAND' }] },
      opponent: { pointRow: [{ entityId: 'o1', identity: null, faceDown: true, zone: 'PR' }] },
    },
  };
  assert.equal(isCardInspectable(snapshot, 'h1'), true);
  assert.equal(isCardInspectable(snapshot, 'o1'), false, 'face-down card must not be inspectable');
  assert.equal(isCardInspectable(snapshot, 'missing'), false);
  assert.equal(isCardInspectable(null, 'h1'), false);
  // findAuthorizedCard returns the authorized card metadata for inspectable cards
  const found = findAuthorizedCard(snapshot, 'h1');
  assert.equal(found.identity, '7♥');
  assert.equal(findAuthorizedCard(snapshot, 'o1').faceDown, true);
});

test('Advanced Card Rules: current legal actions appear correctly', () => {
  const snapshot = {
    playerView: { own: { hand: [{ entityId: 'h1', identity: '7♥', zone: 'HAND' }] }, actorId: 'P1' },
    decision: {
      stateRevision: 42,
      legalActions: [
        { actionId: 'a1', label: 'Score for 7', sourceHandles: ['h1'], timingClass: 'ACTION' },
        { actionId: 'a2', label: 'Use Topdeck Casting', sourceHandles: ['h1'], timingClass: 'ACTION', mode: 'effect-7' },
        { actionId: 'a3', label: 'Draw', sourceHandles: [], timingClass: 'ACTION' },
      ],
    },
  };
  const ctx = buildCurrentMatchContext(snapshot, 'h1', '7♥');
  assert.equal(ctx.cardId, 'h1');
  assert.equal(ctx.stateRevision, 42);
  assert.equal(ctx.legalActions.length, 2, 'only actions using h1 as source should appear');
  assert.ok(ctx.legalActions.some(a => a.displayLabel === 'Score for 7'));
  assert.ok(ctx.available);
});

test('Advanced Card Rules: current legality updates with state', () => {
  const s1 = {
    playerView: { own: { hand: [{ entityId: 'h1', identity: '7♥', zone: 'HAND' }] } },
    decision: { legalActions: [{ actionId: 'a1', label: 'Score', sourceHandles: ['h1'] }] },
  };
  const s2 = {
    playerView: { own: { hand: [{ entityId: 'h1', identity: '7♥', zone: 'HAND' }] } },
    decision: { legalActions: [{ actionId: 'a2', label: 'Draw', sourceHandles: [] }] },
  };
  const ctx1 = buildCurrentMatchContext(s1, 'h1', '7♥');
  const ctx2 = buildCurrentMatchContext(s2, 'h1', '7♥');
  assert.equal(ctx1.legalActions.length, 1);
  assert.equal(ctx2.legalActions.length, 0, ' legality should reflect updated state');
  assert.equal(ctx2.available, false);
});

// ═══════════════════════════════════════════════════════════════
// 4. Controller — open/close/focus (DOM shim)
// ═══════════════════════════════════════════════════════════════

test('Advanced Card Rules: opens from authorized card and closes correctly', () => {
  const { dialog, content } = installDom();
  try {
    const opened = openAdvancedCardRules('7♥', { currentMatch: null });
    assert.equal(opened, true);
    assert.equal(getOpenIdentity(), '7♥');
    assert.equal(dialog.open, true, 'dialog should be shown');
    assert.ok(content.innerHTML.includes('acr-view'), 'content should render the view');
    closeAdvancedCardRules();
    assert.equal(getOpenIdentity(), null);
    assert.equal(content.innerHTML, '', 'content should be cleared on close');
  } finally {
    uninstallDom();
  }
});

test('Advanced Card Rules: refuses to open for concealed identity', () => {
  installDom();
  try {
    assert.equal(openAdvancedCardRules(''), false);
    assert.equal(openAdvancedCardRules('FACE_DOWN'), false);
    assert.equal(getOpenIdentity(), null);
  } finally {
    uninstallDom();
  }
});

test('Advanced Card Rules: focus returns to previously focused element', () => {
  installDom();
  try {
    const trigger = makeEl('button');
    trigger.focus();
    const before = globalShim.activeElement;
    openAdvancedCardRules('7♥');
    closeAdvancedCardRules();
    // After close, the previously focused element should be the active one again.
    assert.equal(globalShim.activeElement, before, 'focus should return to trigger');
  } finally {
    uninstallDom();
  }
});

// ═══════════════════════════════════════════════════════════════
// 5. Integration — source-text assertions (no DOM)
// ═══════════════════════════════════════════════════════════════

test('Advanced Card Rules: index.html mounts the advanced-card-rules dialog (old card-face-dialog removed)', () => {
  const html = readFileSync(join(root, 'apps/lab-web/src/index.html'), 'utf8');
  assert.ok(html.includes('id="advanced-card-rules-dialog"'), 'missing advanced-card-rules-dialog');
  assert.ok(html.includes('data-acr-close'), 'missing close button');
  assert.ok(!html.includes('id="card-face-dialog"'), 'old #card-face-dialog must be removed');
});

test('Advanced Card Rules: styles.css imports the advanced-card-rules stylesheet', () => {
  const css = readFileSync(join(root, 'apps/lab-web/src/styles.css'), 'utf8');
  assert.ok(css.includes('advanced-card-rules.css'), 'styles.css must @import advanced-card-rules.css');
});

test('Advanced Card Rules: play-app wires openAdvancedCardRules into board events', () => {
  const src = readFileSync(join(root, 'apps/lab-web/src/play/play-app.js'), 'utf8');
  assert.ok(src.includes('openAdvancedCardRules'), 'play-app must define openAdvancedCardRules');
  assert.ok(src.includes('handleAdvancedRulesShortcut'), 'play-app must bind the A shortcut');
  assert.ok(src.includes('isCardInspectable'), 'play-app must guard with isCardInspectable');
  assert.ok(!src.includes('openCardFaceDialog'), 'play-app must not reference the removed openCardFaceDialog');
  assert.ok(!src.includes('#card-face-dialog'), 'play-app must not reference the removed #card-face-dialog');
});

test('Advanced Card Rules: board-events wires the Advanced Rules button + Shift+right-click', () => {
  const src = readFileSync(join(root, 'apps/lab-web/src/play/board-events.js'), 'utf8');
  assert.ok(src.includes('data-inspector-advanced-rules'), 'board-events must wire the Advanced Rules button');
  assert.ok(src.includes('openAdvancedCardRules'), 'board-events must call openAdvancedCardRules');
});

test('Advanced Card Rules: inspector renders an Advanced Rules affordance', () => {
  const src = readFileSync(join(root, 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
  assert.ok(src.includes('data-inspector-advanced-rules'), 'inspector must render an Advanced Rules button');
});

// ═══════════════════════════════════════════════════════════════
// 6. Coverage audit (directive §21)
// ═══════════════════════════════════════════════════════════════

test('Advanced Card Rules: coverage audit covers all 54 cards', () => {
  const audit = coverageAudit();
  assert.equal(audit.length, 54);
  // Complex cards must be COMPLETE
  for (const id of ['7♥', '7♠', '10♦', '10♠', 'K♠', 'BJ', 'Q♠']) {
    const row = audit.find(r => r.identity === id);
    assert.ok(row, `missing audit row for ${id}`);
    assert.equal(row.status, 'COMPLETE', `${id} should be COMPLETE`);
  }
});
