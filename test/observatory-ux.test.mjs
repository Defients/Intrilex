import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scatterPlot, intervalPlot } from '../apps/lab-web/src/chart-toolkit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

// ══ Atlas UX pass (Phases 1–9) — UX/data-contract pins ═══════════
// These tests pin the *presentation contract* of the Observatory
// modernization: every page keeps its analytical semantics while the
// visual system generalizes the Ranks design grammar. Source contracts
// are used (same pattern as browser-workspace-liveness) because the
// workspace renderers are DOM-bound.

// ── UX-01: chart-toolkit gains scatter + interval primitives ─────
test('UX-01a: scatterPlot produces accessible SVG bubbles with per-point attrs', () => {
  const svg = scatterPlot({
    points: [
      { x: 0.5, y: 0.02, r: 40, color: '#4fd387', label: 'alpha', title: 'alpha tip', attrs: 'data-scatter-mechanic="alpha" tabindex="0" role="button"' },
      { x: 0.1, y: -0.01, r: 5, color: '#f0786f', label: 'beta' },
    ],
    xLabel: 'Legal pick rate', yLabel: 'Adjusted win association',
    xRef: 0.3, yRef: 0, quadrantLabels: { tr: 'hi/hi', tl: 'lo/hi', br: 'hi/lo', bl: 'lo/lo' },
    title: 't', ariaLabel: 'scatter a11y label',
  });
  assert.match(svg, /<svg/, 'produces an svg');
  assert.match(svg, /aria-label="scatter a11y label"/, 'carries the aria label');
  assert.match(svg, /data-scatter-mechanic="alpha"/, 'per-point attrs pass through for selection wiring');
  assert.match(svg, /hi\/hi/, 'quadrant labels render');
  assert.match(svg, /<title>alpha tip<\/title>/, 'hover titles render');
});

test('UX-01b: intervalPlot renders CI whiskers and a point estimate per row', () => {
  const svg = intervalPlot({
    rows: [
      { label: 'A', low: 0.4, high: 0.7, estimate: 0.55, note: 'n=40' },
      { label: 'B', low: 0.3, high: 0.5, estimate: 0.4 },
    ],
    refLine: 0.5, title: 't', ariaLabel: 'interval a11y label',
  });
  assert.match(svg, /<svg/);
  assert.match(svg, /aria-label="interval a11y label"/);
  assert.match(svg, /ix-interval-ci/, 'CI whisker elements present');
  assert.match(svg, /ix-interval-point/, 'point estimates render');
  assert.equal((svg.match(/<title>/g) ?? []).length >= 2, true, 'per-row titles present');
});

// ── UX-02: Mechanics Atlas hero scatter ──────────────────────────
test('UX-02a: Mechanics renders the scatter hero wired to real fields', async () => {
  const code = await src('workspaces/observatory.js');
  assert.ok(code.includes('renderMechanicsScatter'), 'mechanics scatter exists');
  assert.ok(code.includes('data-testid="mechanics-scatter-chart"'), 'scatter has a stable testid');
  // X/Y accessors read existing analytics fields only
  assert.ok(code.includes('acc: m => m.pickRateWhenLegal'), 'x = legal pick rate field');
  assert.ok(code.includes('acc: m => m.adjustedWinAssociation'), 'y = adjusted win association field');
  assert.ok(code.includes('acc: (m, o) => o.choiceAnalysis?.entities?.[m.mechanic]?.conditionalRate'),
    'conditional choice rate axis reads the choice-analysis artifact');
});

test('UX-02b: scatter excludes non-finite estimates instead of plotting them as zero', async () => {
  const code = await src('workspaces/observatory.js');
  const fn = code.match(/function renderMechanicsScatter[\s\S]*?\r?\n\}/);
  assert.ok(fn, 'scatter function found');
  assert.ok(fn[0].includes('Number.isFinite'), 'non-finite x/y values are excluded');
  assert.ok(fn[0].includes('excluded'), 'excluded count is surfaced to the user');
  assert.ok(fn[0].includes('not plotted'), 'exclusion note is rendered');
});

test('UX-02c: scatter points are keyboard-accessible and select the mechanic dossier', async () => {
  const code = await src('workspaces/observatory.js');
  assert.ok(code.includes('data-scatter-mechanic='), 'points carry mechanic identity');
  assert.ok(code.includes('tabindex="0" role="button"'), 'points are focusable buttons');
  const handler = code.match(/\.ix-scatter-point\[data-scatter-mechanic\][\s\S]*?e\.key === 'Enter'/);
  assert.ok(handler, 'scatter handler block exists');
  assert.ok(handler[0].includes('state.selectedMechanic'), 'click sets the selected mechanic');
  assert.ok(handler[0].includes('rerender()'), 'click re-renders into the dossier');
  assert.ok(handler[0].includes("e.key === 'Enter'"), 'Enter/Space activate the point');
});

test('UX-02d: Mechanics summary strip surfaces denominators and evidence', async () => {
  const code = await src('workspaces/observatory.js');
  const fn = code.match(/export function renderMechanics[\s\S]*?\r?\n\}/);
  assert.ok(fn, 'renderMechanics found');
  assert.ok(fn[0].includes('metricStrip'), 'summary strip renders');
  assert.ok(fn[0].includes('obsContextStrip'), 'dataset context strip renders');
});

// ── UX-03: Mechanic dossier ──────────────────────────────────────
test('UX-03a: dossier keeps the legal-opportunity denominator visible', async () => {
  const code = await src('workspaces/observatory.js');
  const fn = code.match(/function renderMechanicDetail[\s\S]*?\r?\n\}/);
  assert.ok(fn, 'renderMechanicDetail found');
  assert.ok(fn[0].includes('legalOpportunityCount'), 'legal opportunities shown');
  assert.ok(fn[0].includes('evidenceBadge') || fn[0].includes('evidenceGrade'), 'evidence grade surfaced');
  assert.ok(fn[0].includes('observational'), 'association flagged as observational, not causal');
});

test('UX-03b: dossier uses sectioned progressive disclosure, not one flat list', async () => {
  const code = await src('workspaces/observatory.js');
  const fn = code.match(/function renderMechanicDetail[\s\S]*?\r?\n\}/);
  assert.ok((fn[0].match(/dossierSection\(/g) ?? []).length >= 4, 'dossier is split into named sections');
  assert.ok(fn[0].includes('Choice context'), 'choice context section exists');
  assert.ok(fn[0].includes('Provenance'), 'provenance section exists');
});

// ── UX-04: Choice-set diagnostics ────────────────────────────────
test('UX-04: structural same-action rivals are never presented as contested choices', async () => {
  const code = await src('workspaces/observatory.js');
  const fn = code.match(/function renderMechanicChoiceBlock[\s\S]*?\r?\n\}/);
  assert.ok(fn, 'renderMechanicChoiceBlock found');
  assert.ok(fn[0].includes("same-action-only"), 'same-action relation is detected');
  assert.ok(fn[0].includes('structural co-occurrence'), 'structural shares are labelled, not treated as preference');
  assert.ok(fn[0].includes('Rival independently selectable'), 'contract column retained');
});

// ── UX-05: Synergy matrix — every status, never a neutral blank ──
test('UX-05a: the semantic matrix covers all six non-self cell statuses', async () => {
  const code = await src('workspaces/observatory.js');
  const statusBlock = code.match(/const STATUS_STYLE = \{[\s\S]*?\};/);
  assert.ok(statusBlock, 'STATUS_STYLE map exists');
  for (const st of ['MODELED', 'MODELED_INCONCLUSIVE', 'INSUFFICIENT_DATA', 'FAILED', 'NOT_IDENTIFIABLE', 'NOT_EVALUATED']) {
    assert.ok(statusBlock[0].includes(st), `STATUS_STYLE covers ${st}`);
  }
});

test('UX-05b: non-modeled cells get glyphs/dashes — status never rests on color alone', async () => {
  const code = await src('workspaces/observatory.js');
  const glyphBlock = code.match(/const SYNERGY_CELL_GLYPH = \{[^}]*\}/);
  assert.ok(glyphBlock, 'cell glyph map exists');
  assert.match(glyphBlock[0], /INSUFFICIENT_DATA.*◌/u, 'insufficient carries a glyph');
  assert.match(glyphBlock[0], /NOT_IDENTIFIABLE.*∄/u, 'not-identifiable carries a glyph');
  assert.match(glyphBlock[0], /FAILED.*✕/u, 'failed model carries a glyph');
  // Dashed borders distinguish non-modeled states structurally
  assert.ok(code.includes("INSUFFICIENT_DATA: { stroke: 'rgba(241,189,93,0.6)', dash: '3 2' }"), 'insufficient border is dashed');
  // The unevaluated tooltip states the semantics explicitly
  assert.ok(code.includes('Unknown ≠ neutral'), 'not-evaluated tooltip explains itself');
});

test('UX-05c: matrix cells are keyboard-selectable dossier entries', async () => {
  const code = await src('workspaces/observatory.js');
  assert.ok(code.includes('class="sy-cell'), 'cells are grouped sy-cell elements');
  assert.ok(code.includes('data-synergy="${esc(cell.id)}" role="button" tabindex="0"'), 'cells are focusable buttons with the pair id');
  const kb = code.match(/\.sy-cell\[data-synergy\][\s\S]*?rerender\(\)[\s\S]*?\}\)/);
  assert.ok(kb, 'matrix keyboard binding exists');
  assert.ok(kb[0].includes("e.key === 'Enter'"), 'Enter activates a cell');
  assert.ok(code.includes('role="grid"'), 'matrix svg exposes a grid role');
});

test('UX-05d: matrix offers the five required display modes', async () => {
  const code = await src('workspaces/observatory.js');
  const modes = code.match(/const SYNERGY_MATRIX_MODES = \{[\s\S]*?\};/);
  assert.ok(modes, 'mode map exists');
  for (const mode of ['status', 'effect', 'marginal', 'support', 'grade']) {
    assert.ok(modes[0].includes(mode), `display mode ${mode} exists`);
  }
  assert.ok(code.includes('chartTableAlternative'), 'matrix carries a table alternative');
});

test('UX-05e: rejected diagnostics rows open the cell dossier, not a dead end', async () => {
  const code = await src('workspaces/observatory.js');
  const fn = code.match(/function renderRejectedSynergyCells[\s\S]*?\r?\n\}/);
  assert.ok(fn, 'rejected-cells renderer found');
  assert.ok(fn[0].includes('data-synergy='), 'rejected rows are clickable into the dossier');
});

// ── UX-06: Synergy dossier — model vs marginal stay distinct ─────
test('UX-06a: dossier reports both estimands and flags disagreement', async () => {
  const code = await src('workspaces/observatory.js');
  const fn = code.match(/function renderSynergyDetail[\s\S]*?bindSynergyDetailNav\(\);\r?\n\}/);
  assert.ok(fn, 'renderSynergyDetail found');
  assert.ok(fn[0].includes('modelDirection') && fn[0].includes('marginalDirection'), 'both directions shown');
  assert.ok(fn[0].includes('Scale disagreement'), 'disagreement is explicitly disclosed');
  assert.ok(fn[0].includes('confidenceInterval ?? s.interval'), 'CI compatibility path preserved');
});

test('UX-06b: rejected-cell dossier says unknown, not neutral', async () => {
  const code = await src('workspaces/observatory.js');
  const fn = code.match(/function renderSynergyCellDetail[\s\S]*?bindSynergyDetailNav\(\);\r?\n\}/);
  assert.ok(fn, 'renderSynergyCellDetail found');
  assert.ok(fn[0].includes('reasonCode'), 'rejection reason code surfaced');
  assert.ok(fn[0].includes('an unknown, not a zero'), 'absence-of-estimate is explicit');
});

// ── UX-07: Compare matchup analyzer ──────────────────────────────
test('UX-07a: Compare renders the A-vs-B hero, interval plot, and fingerprint divergence', async () => {
  const code = await src('workspaces/observatory.js');
  const fn = code.match(/export function renderCompare[\s\S]*?app\.innerHTML/);
  assert.ok(fn, 'renderCompare found');
  assert.ok(fn[0].includes('matchup-hero'), 'A-vs-B hero present');
  assert.ok(fn[0].includes('data-testid="compare-interval-chart"'), 'win-rate CI interval plot present');
  assert.ok(fn[0].includes('data-testid="compare-fingerprint"'), 'fingerprint divergence present');
  assert.ok(fn[0].includes('seatSplit'), 'seat split surfaced');
});

test('UX-07b: matchup matrix keeps tiny-sample visual distinction', async () => {
  const code = await src('workspaces/observatory.js');
  const fn = code.match(/export function renderMatchupMatrix[\s\S]*?return `<details/);
  assert.ok(fn, 'renderMatchupMatrix found');
  assert.ok(fn[0].includes('TINY_SAMPLE_N'), 'tiny-sample threshold exists');
  assert.ok(fn[0].includes('stroke-dasharray'), 'tiny cells are dashed');
  assert.ok(fn[0].includes('tiny sample'), 'tiny-sample language in tooltip/legend');
  assert.ok(fn[0].includes('aWins / total'), 'decisive denominator contract preserved');
});

// ── UX-08: Evidence control room ─────────────────────────────────
test('UX-08a: Evidence renders control-room modules over real integrity fields', async () => {
  const code = await src('workspaces/evidence.js');
  assert.ok(code.includes('data-testid="evidence-control-room"'), 'control room present');
  assert.ok(code.includes('pipelineFlow'), 'pipeline flow renders');
  assert.ok(code.includes('invariantHolds'), 'reconciliation invariant surfaced');
  assert.ok(code.includes('evidenceEpoch'), 'evidence epoch surfaced');
  assert.ok(code.includes('evidenceQualifiedSynergyPairs'), 'inferential capability surfaced');
  assert.ok(code.includes('data-testid="evidence-epoch-panel"'), 'existing epoch panel retained');
});

test('UX-08b: anomaly rows link to both Watch and the History dossier', async () => {
  const code = await src('workspaces/evidence.js');
  assert.ok(code.includes('data-anomaly-match'), 'anomaly → Watch link retained');
  assert.ok(code.includes('data-anomaly-history'), 'anomaly → History link added');
  assert.ok(code.includes('state.historyFilterMatchIds'), 'history link filters the ledger to the match');
});

// ── UX-09: History / replay / trace investigative surface ────────
test('UX-09a: history rows carry anomaly flags and the dossier cross-links out', async () => {
  const code = await src('workspaces/observatory.js');
  assert.ok(code.includes('obs-anomaly-flag'), 'anomaly marker on history rows');
  assert.ok(code.includes('data-mech-link'), 'match dossier links into the Mechanics Atlas');
  const detail = code.match(/match-detail-watch[\s\S]*?match-detail-compare/);
  assert.ok(detail, 'watch + traces + compare links present in the dossier footer');
});

test('UX-09b: match dossier handlers preserve selection state across workspaces', async () => {
  const code = await src('workspaces/observatory.js');
  const handlers = code.match(/const watchBtn[\s\S]*?return;/);
  assert.ok(handlers, 'detail handler block exists');
  assert.ok(handlers[0].includes("location.hash = '#/watch'"), 'watch link navigates');
  assert.ok(handlers[0].includes("location.hash = '#/traces'"), 'trace link navigates');
  assert.ok(handlers[0].includes("location.hash = '#/mechanics'"), 'mechanic link navigates');
  assert.ok(handlers[0].includes("location.hash = '#/compare'"), 'compare link navigates');
  assert.ok(handlers[0].includes('state.selectedMechanic'), 'mechanic selection is preserved');
});

// ── UX-10: shared design layer + context strip ───────────────────
test('UX-10a: every Observatory workspace renders the dataset context strip', async () => {
  const obs = await src('workspaces/observatory.js');
  for (const fn of ['renderCompare', 'renderMechanics', 'renderSynergies', 'renderHistory', 'renderReplays', 'renderTraces']) {
    const start = obs.indexOf(`export function ${fn}`);
    assert.ok(start >= 0, `${fn} found`);
    const next = obs.indexOf('\nexport function ', start + 10);
    const block = obs.slice(start, next === -1 ? obs.length : next);
    assert.ok(block.includes('obsContextStrip'), `${fn} shows dataset context`);
  }
  const ranks = await src('workspaces/ranks.js');
  assert.ok(ranks.includes('obsContextStrip'), 'Ranks carries the shared context strip');
  const evidence = await src('workspaces/evidence.js');
  assert.ok(evidence.includes('control room') || evidence.includes('Evidence epoch'), 'Evidence surfaces epoch context');
});

test('UX-10b: observatory.css is the shared design layer and is imported', async () => {
  const styles = await src('styles.css');
  assert.ok(styles.includes('observatory.css'), 'styles.css imports the layer');
  const css = await src('css/observatory.css');
  assert.ok(css.includes('.obs-stat-grid'), 'summary-strip primitive styled');
  assert.ok(css.includes('.dossier-section'), 'dossier primitive styled');
  assert.ok(css.includes('prefers-reduced-motion'), 'reduced-motion respected');
  assert.ok(css.includes(':focus'), 'visible focus states exist');
  assert.ok(css.includes('@media(max-width:'), 'responsive breakpoints exist');
});

// ── UX-11: non-regression pins on the analytics-facing layer ─────
test('UX-11: the UX pass touched no estimator or denominator code', async () => {
  const code = await src('workspaces/observatory.js');
  // These invariants are the integrity surface the pass promised to keep.
  assert.ok(code.includes('s.confidenceInterval ?? s.interval'), 'synergy CI fallback intact');
  assert.ok(code.includes('pids.length !== 2'), 'matchup stays strictly two-player');
  assert.ok(code.includes('k-means'), 'inline k-means comment/impl preserved');
});
