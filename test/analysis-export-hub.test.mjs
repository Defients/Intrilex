// analysis-export-hub.test.mjs — structural contract for the global
// Analysis Export hub (sidebar footer trigger + anchored overlay) and its
// shared export pipeline. Node tests cannot execute browser DOM code, so
// this suite asserts the source-level contract: markup, wiring, and the
// single canonical exporter path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('apps/lab-web/src/index.html', 'utf8');
const hub = readFileSync('apps/lab-web/src/analysis-export-hub.mjs', 'utf8');
const exporter = readFileSync('apps/lab-web/src/analysis-dossier-export.js', 'utf8');
const controls = readFileSync('apps/lab-web/src/experiment-controls.js', 'utf8');
const controller = readFileSync('apps/lab-web/src/experiments/experiment-controller.mjs', 'utf8');
const evidence = readFileSync('apps/lab-web/src/workspaces/evidence.js', 'utf8');
const dataLoader = readFileSync('apps/lab-web/src/data-loader.js', 'utf8');
const css = readFileSync('apps/lab-web/src/css/observatory.css', 'utf8');

// ── Sidebar footer trigger ───────────────────────────────────────────────
test('EXPORT-01: a compact export trigger sits inside the sidebar authority stamp', () => {
  const stamp = html.match(/<details class="authority-stamp">[\s\S]*?<\/details>/)?.[0] ?? '';
  assert.ok(stamp, 'authority stamp exists');
  assert.ok(stamp.includes('id="analysis-export-trigger"'), 'trigger lives in the authority stamp');
  const btn = stamp.match(/<button id="analysis-export-trigger"[^>]*>/)?.[0] ?? '';
  assert.ok(btn.includes('aria-label="Export Research Data"'), 'accessible label');
  assert.ok(btn.includes('title="Export Research Data"'), 'tooltip');
  assert.ok(btn.includes('aria-haspopup="dialog"'), 'dialog relationship declared');
  assert.ok(btn.includes('aria-expanded="false"'), 'collapsed by default');
  assert.ok(btn.includes('aria-controls="analysis-export-hub"'), 'points at the hub panel');
});

test('EXPORT-02: trigger click does not toggle the details element — JS preventDefaults', () => {
  assert.ok(hub.includes('e.preventDefault()'), 'click preventDefault keeps the stamp closed');
  assert.ok(hub.includes('e.stopPropagation()'), 'click stopPropagation isolates the summary toggle');
});

// ── Anchored overlay semantics ───────────────────────────────────────────
test('EXPORT-03: the hub is a non-modal dialog with close control and status region', () => {
  const panel = html.match(/<div id="analysis-export-hub"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0]
    ?? html.slice(html.indexOf('id="analysis-export-hub"'), html.indexOf('<main'));
  assert.ok(panel.includes('role="dialog"'), 'dialog role');
  assert.ok(panel.includes('aria-modal="false"'), 'non-modal — no focus trap');
  assert.ok(panel.includes('aria-labelledby='), 'labelled by its title');
  assert.ok(panel.includes('hidden'), 'starts hidden');
  assert.ok(panel.includes('id="analysis-export-close"'), 'close button present');
  assert.ok(panel.includes('aria-label="Close analysis export"'), 'close is labelled, not icon-only');
  assert.ok(panel.includes('id="export-status-rows"'), 'evidence status rows exist');
  assert.ok(panel.includes('aria-live="polite"'), 'status updates announced politely');
  assert.ok(panel.includes('id="export-status-warnings"'), 'warning list exists');
});

test('EXPORT-04: all three canonical formats are exposed through one action path', () => {
  for (const format of ['json', 'markdown', 'both']) {
    assert.ok(html.includes(`data-export-format="${format}"`), `format button: ${format}`);
  }
  assert.ok(hub.includes("invokeAppAction('exportAnalysisDossier'"), 'hub calls the app action, not a private builder');
  assert.ok(evidence.includes("invokeAppAction(\n  'exportAnalysisDossier'") || evidence.includes("invokeAppAction('exportAnalysisDossier'"), 'evidence workspace uses the same action');
  assert.ok(!hub.includes('buildAnalysisDossier('), 'hub never builds a dossier itself');
});

test('EXPORT-05: overlay behavior — toggle, Escape, click-away, focus, no trap', () => {
  assert.ok(hub.includes("e.key === 'Escape'"), 'Escape closes');
  assert.ok(hub.includes('pointerdown'), 'click-away dismissal');
  assert.ok(hub.includes("setAttribute('aria-expanded'"), 'aria-expanded tracked on the trigger');
  assert.ok(hub.includes('trigger.focus()'), 'focus returns to the trigger on close');
  assert.ok(!hub.includes('showModal'), 'never modal — no keyboard trap');
  assert.ok(hub.includes('getBoundingClientRect'), 'anchored to the trigger position');
});

test('EXPORT-06: status refresh is recomputed on every open and tolerates races', () => {
  assert.ok(hub.includes('dossierEvidenceStatus'), 'status comes from the canonical evidence collector');
  assert.ok(hub.includes('statusToken'), 'stale async results are discarded (token guard)');
  assert.ok(hub.includes('renderStatus()'), 'status recomputed when opened');
  assert.ok(!hub.includes('localStorage'), 'no cached status');
});

test('EXPORT-07: export buttons disable while generating to prevent duplicate downloads', () => {
  const clickBlock = hub.match(/for \(const btn of hub\.querySelectorAll\('\[data-export-format\]'\)\)[\s\S]*?\}\);?\s*\}\)?/)?.[0]
    ?? hub.slice(hub.indexOf('[data-export-format]'));
  assert.ok(clickBlock.includes('btn.disabled = true'), 'button disabled during export');
  assert.ok(clickBlock.includes('btn.disabled = false'), 'button re-enabled afterward');
  assert.ok(clickBlock.includes('if (btn.disabled) return'), 're-entrancy guard');
});

// ── Evidence Status semantics ────────────────────────────────────────────
test('EXPORT-08: status is derived from the same collected evidence the dossier exports', () => {
  assert.ok(exporter.includes('collectExperimentEvidence'), 'exporter collects experiment evidence');
  assert.ok(exporter.includes('experiments: lab.experiments'), 'dossier input carries the experiment projection');
  assert.ok(exporter.includes('export async function dossierEvidenceStatus'), 'status entry point exists');
  const status = exporter.slice(exporter.indexOf('export async function dossierEvidenceStatus'));
  assert.ok(status.includes('collectExperimentEvidence'), 'status reads the experiment store');
  assert.ok(status.includes('listSources'), 'status reads strategy sources');
  assert.ok(status.includes('deriveEvidenceStatus'), 'status uses the pure dossier-side derivation');
});

test('EXPORT-09: experiment store is initialized at boot — dossier scope can never be silently empty', () => {
  assert.ok(dataLoader.includes('initExperiments'), 'boot initializes the experiment evidence store');
  assert.ok(dataLoader.includes('applySelection'), 'a saved selection is reapplied at boot');
  assert.ok(controls.includes('beginExperimentRun'), 'a durable run manifest is opened before any simulation work');
  assert.ok(controls.includes('finalizeExperimentRun'), 'campaign completions are sealed as durable runs');
  assert.ok(controls.includes('failExperimentRun'), 'failed executions are recorded');
  assert.ok(controls.includes('cancelExperimentRun'), 'cancelled executions are recorded');
});

test('EXPORT-10: campaign observatory is tagged EXPERIMENT_RUNS; runs refuse to start without durable persistence', () => {
  assert.match(controller,/publishEvidenceSnapshot\(state,.*origin:'EXPERIMENT_RUNS'/,'campaign snapshot carries the experimental origin');
  assert.ok(controls.includes('Evidence store unavailable'), 'a persistence-unavailable run never produces undurable campaign data');
});

// ── Styling ──────────────────────────────────────────────────────────────
test('EXPORT-11: hub styling exists, stays above content, and is width-safe', () => {
  assert.ok(css.includes('.export-hub{'), 'export-hub styled');
  assert.ok(css.includes('position:fixed'), 'anchored overlay positioning');
  const hubRule = css.match(/\.export-hub\{[^}]*\}/)?.[0] ?? '';
  assert.ok(hubRule.includes('z-index'), 'sits above main content');
  assert.ok(hubRule.includes('calc(100vw'), 'narrow-desktop safe width');
  assert.ok(css.includes('.export-trigger{'), 'footer trigger styled');
  assert.ok(css.includes('.export-status-row'), 'status rows styled');
});
