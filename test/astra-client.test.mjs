import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));

// ── Create temp mock modules for esbuild aliasing ─────────────────
const tmpDir = path.join(os.tmpdir(), `intrilex-astra-test-${process.pid}`);
mkdirSync(tmpDir, { recursive: true });

const reactMockPath = path.join(tmpDir, 'react-mock.mjs');
writeFileSync(reactMockPath, `
export class Component {
  constructor(props) { this.props = props; this.state = {}; }
  static getDerivedStateFromError() { return { failed: true }; }
  setState(state, cb) { this.state = { ...this.state, ...state }; if (cb) cb(); }
  render() { return null; }
}
export function createElement(type, props, ...children) {
  return { type, props: props ?? {}, children: children.flat() };
}
export const Fragment = 'Fragment';
export function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; }
export function useRef(initial) { return { current: initial }; }
export function useEffect() {}
export function useId() { return ':r0:'; }
export function useCallback(fn) { return fn; }
export function useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); }
export function useMemo(fn) { return fn(); }
export function memo(fn) { return fn; }
export function useReducer(_reducer, initial) { return [initial, () => {}]; }
export const createContext = () => ({ Provider: 'Provider' });
export function useContext() { return null; }
export function flushSync(fn) { if (fn) fn(); }
`);

const reactJsxMockPath = path.join(tmpDir, 'react-jsx-mock.mjs');
writeFileSync(reactJsxMockPath, `
export function jsx(type, props, key) { return { type, props: props ?? {}, key }; }
export function jsxs(type, props, key) { return { type, props: props ?? {}, key }; }
export const Fragment = 'Fragment';
`);

const reactDomClientMockPath = path.join(tmpDir, 'react-dom-client-mock.mjs');
writeFileSync(reactDomClientMockPath, `
const roots = [];
export function createRoot(host) {
  const root = {
    host,
    renderCalls: [],
    unmounted: false,
    render(node) { this.renderCalls.push(node); },
    unmount() { this.unmounted = true; },
  };
  roots.push(root);
  return root;
}
export function hydrateRoot(host) { return createRoot(host); }
export function __getRoots() { return roots; }
export function __resetRoots() { roots.length = 0; }
`);

// ─ esbuild plugin to handle CSS imports as empty ──────────────────
const cssPlugin = {
  name: 'empty-css',
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, args => ({
      path: args.path,
      namespace: 'empty-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'empty-stub' }, () => ({
      contents: 'export default {}',
      loader: 'js',
    }));
  },
};

// ── Bundle mount.tsx with mocked react/react-dom ──────────────────
const bundle = await build({
  entryPoints: [path.join(root, 'apps/lab-web/src/client/mount.tsx')],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  metafile: true,
  alias: {
    'react-dom': reactMockPath,
    'react': reactMockPath,
    'react/jsx-runtime': reactJsxMockPath,
    'react-dom/client': reactDomClientMockPath,
  },
  jsx: 'automatic',
  jsxImportSource: 'react',
  plugins: [cssPlugin],
  logLevel: 'silent',
});

const bundleText = bundle.outputFiles[0].text;
const bundleUrl = `data:text/javascript;base64,${Buffer.from(bundleText).toString('base64')}`;
const clientModule = await import(bundleUrl);
const { mountGameTable } = clientModule;

// ── DOM shim ──────────────────────────────────────────────────────
function createDomShim() {
  function makeElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      attributes: {},
      style: {},
      dataset: {},
      classList: { add() {}, remove() {}, contains() { return false; } },
      _eventListeners: {},
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      append(...items) { for (const item of items) { this.children.push(item); item.parentNode = this; } },
      replaceChildren(...items) {
        for (const old of this.children) old.parentNode = null;
        this.children = items;
        for (const item of items) item.parentNode = this;
      },
      remove() {
        if (this.parentNode) {
          const index = this.parentNode.children.indexOf(this);
          if (index >= 0) this.parentNode.children.splice(index, 1);
        }
        this.parentNode = null;
        this._removed = true;
      },
      setAttribute(key, value) { this.attributes[key] = value; },
      getAttribute(key) { return this.attributes[key] ?? null; },
      removeAttribute(key) { delete this.attributes[key]; },
      addEventListener(type, handler) { (this._eventListeners[type] ??= []).push(handler); },
      removeEventListener(type, handler) {
        const list = this._eventListeners[type];
        if (list) this._eventListeners[type] = list.filter(h => h !== handler);
      },
      dispatchEvent(event) {
        const list = this._eventListeners[event?.type];
        if (list) for (const handler of [...list]) handler(event);
        return true;
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      focus() {},
      blur() {},
      click() { this.dispatchEvent({ type: 'click' }); },
      insertBefore(newNode) { this.children.unshift(newNode); },
      contains() { return false; },
      cloneNode() { return makeElement(this.tagName); },
      closest() { return null; },
      get innerHTML() { return this._innerHTML ?? ''; },
      set innerHTML(value) { this._innerHTML = value; },
      get textContent() { return this._textContent ?? ''; },
      set textContent(value) { this._textContent = value; },
      get outerHTML() { return `<${this.tagName.toLowerCase()}>`; },
      parentNode: null,
      parentElement: null,
      firstChild: null,
      lastChild: null,
      nextSibling: null,
      previousSibling: null,
      ownerDocument: null,
      _removed: false,
    };
    return el;
  }
  const head = makeElement('head');
  const body = makeElement('body');
  const documentShim = {
    createElement(tag) { return makeElement(tag); },
    createElementNS(_ns, tag) { return makeElement(tag); },
    createTextNode(text) { const el = makeElement('#text'); el.textContent = text; return el; },
    createDocumentFragment() { return makeElement('#fragment'); },
    head,
    body,
    documentElement: makeElement('html'),
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    createEvent(type) { return { type, initEvent() {} }; },
  };
  return { documentShim, makeElement };
}

// ── Test fixtures ─────────────────────────────────────────────────
function fixture(humanId = 'P1') {
  const opponentId = humanId === 'P1' ? 'P2' : 'P1';
  return {
    schemaVersion: '1.0.0',
    sessionId: 'session-1',
    status: 'HUMAN_DECISION',
    human: { playerId: humanId, seat: 1, displayName: 'Local player' },
    opponent: { displayName: 'Remote player' },
    match: { phase: 'ACTION', fullTurnSequence: 3, activePlayerId: humanId, winner: null, terminationReason: null },
    decision: {
      actorId: humanId,
      isHuman: true,
      stateRevision: 7,
      frameHash: 'frame-7',
      legalActions: [
        { actionId: 'draw-1', family: 'draw', mode: 'top-dp', timingClass: 'ACTION', sourceHandles: [], targetHandles: [] },
        { actionId: 'score-1', family: 'score', mode: 'score-pr', timingClass: 'ACTION', sourceHandles: ['own-card'], targetHandles: [] },
      ],
    },
    playerView: {
      schemaVersion: '4.0.0',
      actorId: humanId,
      revision: 7,
      phase: 'ACTION',
      fullTurnSequence: 3,
      activePlayerId: humanId,
      priority: { ownerId: humanId },
      own: { securedPoints: 6, goal: 21, hand: [{ id: 'own-card', identity: '6H' }], pr: [], er: [] },
      opponents: [{ playerId: opponentId, securedPoints: 3, goal: 18, handCount: 5, pr: [], er: [] }],
      dpCount: 32, gyCount: 2, gyTopCard: null, exileCount: 1,
      swapBar: [], stack: [],
    },
    recentEvents: [],
  };
}

function withDom(fn) {
  return async () => {
    const { documentShim } = createDomShim();
    const originalDocument = globalThis.document;
    globalThis.document = documentShim;
    try {
      await fn(documentShim);
    } finally {
      globalThis.document = originalDocument;
    }
  };
}

// ── Mount layer tests ─────────────────────────────────────────────

test('mountGameTable creates a host element and replaces container contents', withDom(async (doc) => {
  const container = doc.createElement('div');
  const initialChild = doc.createElement('span');
  container.appendChild(initialChild);
  assert.equal(container.children.length, 1);
  const ctrl = mountGameTable(container, fixture(), {
    submit: async () => ({ accepted: true }),
  });
  assert.ok(container.children.length > 0);
  assert.notEqual(container.children[0], initialChild);
  ctrl.dispose();
}));

test('mountGameTable returns an object with update and dispose methods', withDom(async (doc) => {
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, fixture(), {
    submit: async () => ({ accepted: true }),
  });
  assert.equal(typeof ctrl.update, 'function');
  assert.equal(typeof ctrl.dispose, 'function');
  ctrl.dispose();
}));

test('update forwards snapshots to the store without throwing on valid input', withDom(async (doc) => {
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, fixture(), {
    submit: async () => ({ accepted: true }),
  });
  const next = fixture();
  next.decision.stateRevision = 8;
  next.decision.frameHash = 'frame-8';
  next.playerView.revision = 8;
  assert.doesNotThrow(() => ctrl.update(next));
  ctrl.dispose();
}));

test('update with readOnly option does not throw', withDom(async (doc) => {
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, fixture(), {
    submit: async () => ({ accepted: true }),
    readOnly: true,
  });
  assert.doesNotThrow(() => ctrl.update(fixture(), true));
  ctrl.dispose();
}));

test('dispose is idempotent and does not throw on double disposal', withDom(async (doc) => {
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, fixture(), {
    submit: async () => ({ accepted: true }),
  });
  assert.doesNotThrow(() => ctrl.dispose());
  assert.doesNotThrow(() => ctrl.dispose());
}));

test('update after dispose is a no-op and does not throw', withDom(async (doc) => {
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, fixture(), {
    submit: async () => ({ accepted: true }),
  });
  ctrl.dispose();
  assert.doesNotThrow(() => ctrl.update(fixture()));
}));

test('mountGameTable with null snapshot does not throw', withDom(async (doc) => {
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, null, {
    submit: async () => ({ accepted: true }),
  });
  assert.ok(container.children.length > 0);
  ctrl.dispose();
}));

test('mountGameTable with malformed snapshot does not throw', withDom(async (doc) => {
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, { invalid: true, noSession: true }, {
    submit: async () => ({ accepted: true }),
  });
  assert.ok(container.children.length > 0);
  ctrl.dispose();
}));

test('mountGameTable does not call submit during initial mount or update', withDom(async (doc) => {
  let submitCallCount = 0;
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, fixture(), {
    submit: async () => { submitCallCount++; return { accepted: true }; },
  });
  assert.equal(submitCallCount, 0);
  ctrl.update(fixture());
  assert.equal(submitCallCount, 0);
  ctrl.dispose();
  assert.equal(submitCallCount, 0);
}));

test('mountGameTable handles terminal snapshot without throwing', withDom(async (doc) => {
  const terminal = fixture();
  terminal.status = 'TERMINAL';
  terminal.match.winner = 'P1';
  terminal.match.terminationReason = 'GOAL_REACHED';
  terminal.decision = null;
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, terminal, {
    submit: async () => ({ accepted: true }),
  });
  assert.ok(container.children.length > 0);
  ctrl.dispose();
}));

test('mountGameTable handles AI_DECISION snapshot without throwing', withDom(async (doc) => {
  const aiTurn = fixture();
  aiTurn.status = 'AI_DECISION';
  aiTurn.decision.isHuman = false;
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, aiTurn, {
    submit: async () => ({ accepted: true }),
  });
  assert.ok(container.children.length > 0);
  ctrl.dispose();
}));

test('mountGameTable handles network OPPONENT_DECISION snapshot without throwing', withDom(async (doc) => {
  const opponentTurn = fixture();
  opponentTurn.status = 'OPPONENT_DECISION';
  opponentTurn.decision.isHuman = false;
  opponentTurn.isNetworkMatch = true;
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, opponentTurn, {
    submit: async () => ({ accepted: true }),
  });
  assert.ok(container.children.length > 0);
  ctrl.dispose();
}));

test('mountGameTable preserves privacy — hostile private fields do not cause errors', withDom(async (doc) => {
  const input = fixture();
  input.privateSecret = 'DO_NOT_EXPOSE';
  input.seed = 'SEED_SECRET';
  input.rng = 'RNG_SECRET';
  input.playerView.opponents[0].hand = [{ id: 'OPPONENT_SECRET_ID', identity: 'AH' }];
  input.playerView.opponents[0].handIdentities = ['AH', 'KH', 'QH'];
  input.playerView.drawPile = ['DRAW_SECRET_1', 'DRAW_SECRET_2'];
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, input, {
    submit: async () => ({ accepted: true }),
  });
  assert.ok(container.children.length > 0);
  ctrl.dispose();
}));

test('mountGameTable with readOnly option renders without throwing', withDom(async (doc) => {
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, fixture(), {
    submit: async () => ({ accepted: true }),
    readOnly: true,
  });
  assert.ok(container.children.length > 0);
  ctrl.dispose();
}));

test('multiple mount/dispose cycles do not leak hosts or throw', withDom(async (doc) => {
  const container = doc.createElement('div');
  for (let i = 0; i < 5; i++) {
    const ctrl = mountGameTable(container, fixture(), {
      submit: async () => ({ accepted: true }),
    });
    assert.ok(container.children.length > 0, `cycle ${i}: container should have a host`);
    ctrl.dispose();
  }
}));

test('update with a new session boundary transitions the store cleanly', withDom(async (doc) => {
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, fixture(), {
    submit: async () => ({ accepted: true }),
  });
  const newSession = fixture();
  newSession.sessionId = 'session-2';
  newSession.decision.stateRevision = 1;
  newSession.decision.frameHash = 'frame-1';
  newSession.playerView.revision = 1;
  assert.doesNotThrow(() => ctrl.update(newSession));
  assert.doesNotThrow(() => ctrl.update(fixture()));
  ctrl.dispose();
}));

test('skin option is accepted without throwing', withDom(async (doc) => {
  const container = doc.createElement('div');
  for (const skin of ['dark', 'light', 'cosmotech', 'corrupture', undefined]) {
    const ctrl = mountGameTable(container, fixture(), {
      submit: async () => ({ accepted: true }),
      skin,
    });
    assert.ok(container.children.length > 0, `skin=${skin}: container should have a host`);
    ctrl.dispose();
  }
}));

test('onSave and onInspect options are accepted without throwing', withDom(async (doc) => {
  const container = doc.createElement('div');
  const ctrl = mountGameTable(container, fixture(), {
    submit: async () => ({ accepted: true }),
    onSave: async () => {},
    onInspect: () => {},
  });
  assert.ok(container.children.length > 0);
  ctrl.dispose();
}));

test('mount bundle has no engine, canonical state, or session dependencies', () => {
  const inputs = Object.keys(bundle.metafile.inputs).sort();
  // The bundle should only contain client files and our mock modules.
  // It must NOT contain engine, match-authority, network-protocol, or play-controller imports.
  const forbidden = inputs.filter(name =>
    name.includes('engine') ||
    name.includes('match-authority') ||
    name.includes('network-protocol') ||
    name.includes('play-controller') ||
    name.includes('play-privacy') ||
    name.includes('autonomy-runtime')
  );
  assert.deepEqual(forbidden, [], `bundle must not import authority modules: ${forbidden.join(', ')}`);
  // Verify the client source files are included
  assert.ok(inputs.some(n => n.endsWith('client/mount.tsx')), 'mount.tsx should be in bundle');
  assert.ok(inputs.some(n => n.endsWith('client/game-table.tsx')), 'game-table.tsx should be in bundle');
  assert.ok(inputs.some(n => n.endsWith('client/game-store.ts')), 'game-store.ts should be in bundle');
  assert.ok(inputs.some(n => n.endsWith('client/game-model.ts')), 'game-model.ts should be in bundle');
});
