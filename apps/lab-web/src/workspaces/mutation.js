// ⚖ Rule Mutation Chamber — controlled A/B rules experimentation.
// Surgical Mode: exactly one scoped rule parameter changes; everything else
// stays canonical. Control and mutant arms run the same seeds, seats, and
// policies so the mutation is the only intended experimental variable.

import { app, esc, fmt } from '../state.js';
import { LAB_IDENTITY } from '../evolution/identity.mjs';
import { LAB_VERSION } from '../version.js';
import {
  MUTATION_TARGETS, MUTATION_TARGET_BY_ID, MUTATION_LIMITS,
  createRuleMutation, createExperimentConfig, buildMutationExperimentPlan,
  createExperimentRecord, finalizeExperimentRecord, compactExperimentRecord,
  serializeExperiment, mutationDisplay,
} from '../evolution/mutation-domain.mjs';
import { EvolutionStore, parseMutationImport } from '../evolution/evolution-store.mjs';

const store = new EvolutionStore(LAB_IDENTITY);
const POPULATION_IDS = ['random-legal', 'score-rush', 'control', 'tempo', 'value', 'score-rush-tactical', 'control-tactical', 'tempo-tactical', 'value-tactical'];
const policyName = (id) => id.replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const pct = (n) => Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—';
const num = (n, d = 2) => Number.isFinite(n) ? n.toFixed(d) : '—';
const pp = (n) => Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}pp` : '—';
const signed = (n, d = 2) => Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(d)}` : '—';
const ci = (row) => Number.isFinite(row?.interval?.[0]) && Number.isFinite(row?.interval?.[1])
  ? `[${(row.interval[0] * 100).toFixed(1)}pp, ${(row.interval[1] * 100).toFixed(1)}pp]`
  : '—';
const meanCi = (row) => Number.isFinite(row?.interval?.[0]) && Number.isFinite(row?.interval?.[1])
  ? `[${row.interval[0].toFixed(2)}, ${row.interval[1].toFixed(2)}]` : '—';

const view = {
  targetId: 'rank10.heartTempo.miniTurns',
  mutatedValue: 1,
  hypothesis: '',
  profileId: 'core-advanced-authority',
  population: new Set(['tempo-tactical', 'control-tactical']),
  gamesPerArm: 200,
  workers: 2,
  matchedSeeds: true,
  swapSides: true,
  seedBase: 1337,
  decisionLimit: 1800,
  mutation: null,
  record: null,
  running: false,
  progress: { done: 0, total: 0 },
  workersLive: [],
  error: '',
  savedList: [],
  savedError: '',
  imported: false,
  mounted: false,
};

let abortRequested = false;

function buildMutation() {
  const target = MUTATION_TARGET_BY_ID[view.targetId];
  if (!target) return null;
  try {
    view.error = '';
    return createRuleMutation({ targetId: view.targetId, mutatedValue: view.mutatedValue });
  } catch (error) {
    view.error = error.message;
    return null;
  }
}

export function cleanupMutationChamber() {
  abortRequested = true;
  for (const worker of view.workersLive) { try { worker.terminate(); } catch { /* terminated */ } }
  view.workersLive = [];
  view.running = false;
  view.mounted = false;
}

export function renderMutationChamber() {
  view.mounted = true;
  abortRequested = false;
  const mutation = view.mutation ?? buildMutation();
  view.mutation = mutation;
  const record = view.record;
  app.innerHTML = `<section class="panel" data-testid="mutation-chamber">
    <div class="panel-header"><div><h2>Rule Mutation Chamber</h2>
      <p>Surgical A/B rules experimentation — one parameter changes, everything else stays canonical.</p></div>
      <div class="toolbar">
        <span id="mut-state" class="evo-state evo-state-${view.running ? 'running' : record ? record.status : 'idle'}" data-testid="mut-state">${view.running ? 'RUNNING' : record ? record.status.toUpperCase() : 'CONFIGURED'}</span>
        <button id="mut-run" class="primary-button" data-testid="mut-run" ${view.running || !mutation ? 'disabled' : ''}>Initiate A/B</button>
        <button id="mut-cancel" class="secondary-button" ${view.running ? '' : 'disabled'}>Cancel</button>
      </div></div>
    <div class="panel-body">
      <div class="notice"><b>Surgical mode.</b> Exactly one rule parameter is overridden per experiment. The authoritative default ruleset is never modified — the mutation travels inside each mutant match's own state and cannot leak into control games, later runs, or production rules.</div>
      <p id="mut-error" class="danger" role="alert">${esc(view.error)}</p>
      ${view.imported ? '<div class="notice">Imported experiment: checksums and schema validated. Outcome claims have not been independently reproduced on this origin.</div>' : ''}
      ${baselineHtml()}
      ${mutationHtml(mutation)}
      ${hypothesisHtml()}
      ${configHtml(mutation)}
      ${runStatusHtml()}
      ${record ? resultsHtml(record) : '<section class="evo-section"><h3>Results / Impact</h3><p>No experiment results yet. Configure a mutation and initiate the A/B run.</p></section>'}
      ${savedHtml()}
    </div></section>`;
  bind();
  refreshSavedList();
}

function baselineHtml() {
  return `<section class="evo-section" data-testid="mut-baseline"><h3>Baseline</h3>
    <div class="mut-baseline"><div><b>Current Intrilex Rules</b> <span class="mut-verified">VERIFIED</span><br>
      <small>Rules ${esc(LAB_IDENTITY.rulesVersion)} · engine ${esc(LAB_IDENTITY.engineVersion)} · lab ${esc(LAB_VERSION)}</small><br>
      <code class="evo-hash">${esc(LAB_IDENTITY.fingerprint)}</code><br>
      <small>engineHash ${esc(LAB_IDENTITY.engineHash.slice(0, 16))}… · runtimeHash ${esc(LAB_IDENTITY.runtimeHash.slice(0, 16))}…</small></div>
    <div><b>Mutation scope</b><br><small>Surgical — single parameter override, stamped into each mutant match's initial state hash and matchId. Control arm carries <code>null</code> overrides.</small></div></div></section>`;
}

function mutationHtml(mutation) {
  const target = MUTATION_TARGET_BY_ID[view.targetId];
  const groups = [...new Set(MUTATION_TARGETS.map((t) => t.group))];
  const options = groups.map((group) => `<optgroup label="${esc(group)}">${MUTATION_TARGETS.filter((t) => t.group === group).map((t) => `<option value="${t.id}" ${t.id === view.targetId ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</optgroup>`).join('');
  const valueInput = target?.kind === 'boolean'
    ? `<select id="mut-value" ${view.running ? 'disabled' : ''}><option value="true" ${view.mutatedValue === true ? 'selected' : ''}>enabled</option><option value="false" ${view.mutatedValue === false ? 'selected' : ''}>disabled</option></select>`
    : `<input id="mut-value" type="number" step="1" min="${target?.min ?? 0}" max="${target?.max ?? 0}" value="${esc(String(view.mutatedValue))}" ${view.running ? 'disabled' : ''}>`;
  return `<section class="evo-section" data-testid="mut-mutation"><h3>Mutation</h3>
    <div class="evo-config-row">
      <label class="field">Rule parameter<select id="mut-target" data-testid="mut-target" ${view.running ? 'disabled' : ''}>${options}</select></label>
      <div class="mut-delta-display"><span class="mut-baseline-value">${esc(String(target?.baseline === true ? 'enabled' : target?.baseline ?? '—'))}</span><span class="mut-arrow">→</span>${valueInput}</div>
      <label class="field">Min<input value="${esc(String(target?.min ?? '—'))}" disabled></label>
      <label class="field">Max<input value="${esc(String(target?.max ?? '—'))}" disabled></label>
    </div>
    <p class="footer-note">${esc(target?.description ?? '')}</p>
    ${mutation ? `<p class="mut-label"><b>Mutation:</b> ${esc(mutationDisplay(mutation))} · <code>${esc(mutation.id)}</code></p>` : ''}
  </section>`;
}

function hypothesisHtml() {
  return `<section class="evo-section"><h3>Hypothesis <small>(metadata — never used to bias results)</small></h3>
    <textarea id="mut-hypothesis" rows="2" maxlength="${MUTATION_LIMITS.hypothesisChars}" placeholder="e.g. Reducing the 10♥ Mini-Turn grant should reduce excessive tempo advantage without materially harming strategy diversity." ${view.running ? 'disabled' : ''}>${esc(view.hypothesis)}</textarea></section>`;
}

function configHtml(mutation) {
  const popCheckboxes = POPULATION_IDS.map((id) => `<label class="mut-pop"><input type="checkbox" class="mut-pop-check" value="${id}" ${view.population.has(id) ? 'checked' : ''} ${view.running ? 'disabled' : ''}> ${esc(policyName(id))}</label>`).join('');
  return `<section class="evo-section" data-testid="mut-config"><h3>Experiment</h3>
    <div class="evo-config-row">
      <label class="field">Rules profile<select id="mut-profile" ${view.running ? 'disabled' : ''}>${[['core-advanced-authority', 'Advanced Core'], ['core-unrestricted-authority', 'Unrestricted Core'], ['core-foundation-authority', 'Foundation Core (setup rules only)'], ['core-effects-authority', 'Effects Core (no combos)']].map(([id, label]) => `<option value="${id}" ${view.profileId === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="field">Games / arm<input id="mut-games" type="number" min="2" max="${MUTATION_LIMITS.gamesPerArm}" step="1" value="${view.gamesPerArm}" ${view.running ? 'disabled' : ''}></label>
      <label class="field">Workers<select id="mut-workers" ${view.running ? 'disabled' : ''}>${[1, 2, 4].map((n) => `<option ${n === view.workers ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field">Seed base<input id="mut-seed" type="number" min="1" max="4294967295" step="1" value="${view.seedBase}" ${view.running ? 'disabled' : ''}></label>
      <label class="field">Decision limit<input id="mut-decisions" type="number" min="100" max="8000" step="50" value="${view.decisionLimit}" ${view.running ? 'disabled' : ''}></label>
      <label class="field evo-mirror">Matched seeds<input id="mut-matched" type="checkbox" ${view.matchedSeeds ? 'checked' : ''} ${view.running ? 'disabled' : ''}></label>
      <label class="field evo-mirror">Swap sides<input id="mut-swap" type="checkbox" ${view.swapSides ? 'checked' : ''} ${view.running ? 'disabled' : ''}></label>
    </div>
    <fieldset class="mut-population"><legend>Population — agent profiles in self-play (${view.population.size} selected)</legend>${popCheckboxes}</fieldset>
    <p id="mut-preflight" class="preflight"><b>Preflight:</b> ${mutation ? `${fmt(view.gamesPerArm)} games per arm · ${view.population.size} profile${view.population.size === 1 ? '' : 's'} · ${view.matchedSeeds ? 'matched seeds' : 'independent deterministic seeds'} · ${view.swapSides ? 'AB/BA seat-swap' : 'fixed seats'} · ${view.workers} worker${view.workers === 1 ? '' : 's'} · ${esc(view.profileId)}` : 'resolve the mutation error before initiating.'}</p>
  </section>`;
}

function runStatusHtml() {
  if (!view.running && !view.record) return '';
  const pctDone = view.progress.total > 0 ? Math.round((view.progress.done / view.progress.total) * 100) : 0;
  return `<section class="evo-section" data-testid="mut-status"><h3>Run status</h3>
    ${view.running ? `<div class="evo-progress-track"><div class="evo-progress-fill" style="width:${pctDone}%"></div></div>
    <p role="status">${fmt(view.progress.done)} / ${fmt(view.progress.total)} matches (${view.workers} worker${view.workers === 1 ? '' : 's'}) — control + mutant interleaved</p>` : `<p>Run ${view.record ? esc(view.record.status) : 'idle'}${view.record?.execution ? ` · ${fmt(view.record.execution.completedSpecCount)}/${fmt(view.record.execution.plannedSpecCount)} matches · matched seeds: ${view.record.execution.matchedSeeds ? 'YES' : 'NO'} · paired coverage: ${pct(view.record.execution.pairedCoverage)}` : ''}</p>`}
  </section>`;
}

function resultsHtml(record) {
  const c = record.arms.control.summary, m = record.arms.mutant.summary;
  const armCard = (title, sub, s) => `<div class="mut-arm"><h4>${esc(title)}</h4><small>${esc(sub)}</small>
    <div class="mut-arm-stats"><span><b>${fmt(s.games)}</b> games</span><span><b>${fmt(s.decisive)}</b> decisive</span><span><b>${fmt(s.draws)}</b> draws</span><span><b>${fmt(s.aborted)}</b> aborted</span></div>
    <div class="mut-arm-stats"><span>seat-1 win <b>${pct(s.seat1WinRate)}</b></span><span>mean turns <b>${num(s.turns.mean, 1)}</b></span><span>mean margin <b>${num(s.meanMargin, 1)}</b></span></div></div>`;
  return `
  <section class="evo-section" data-testid="mut-arms"><h3>Control vs Mutant</h3>
    <div class="mut-arms">
      ${armCard('CONTROL', 'Current rules', c)}
      ${armCard('MUTANT', record.mutation ? mutationDisplay(record.mutation) : '', m)}
    </div>
    ${record.evidenceOrigin === 'IMPORTED_UNVERIFIED' ? '' : `<p class="footer-note">Matched seeds: ${record.config.matchedSeeds ? 'YES' : 'NO'} · side swapping: ${record.config.swapSides ? 'YES' : 'NO'} · games per arm: ${fmt(record.config.gamesPerArm)} · paired ordinals: ${fmt(record.comparison.pairedN)}${record.comparison.pairedCoverage < 0.99 ? ` · <b class="danger">unpaired games retained and disclosed</b>` : ''}</p>`}
  </section>
  ${impactHtml(record)}
  ${profilesHtml(record)}
  ${regressionsHtml(record)}
  ${outcomeHtml(record)}
  ${metadataHtml(record)}`;
}

function impactHtml(record) {
  const rows = record.comparison?.rows ?? [];
  const cell = (row) => row.unit === 'proportion'
    ? `<td>${pct(row.control)}</td><td>${pct(row.mutant)}</td><td class="${deltaClass(row.delta)}">${pp(row.delta)}</td><td>${ci(row)}</td>`
    : `<td>${num(row.control)}</td><td>${num(row.mutant)}</td><td class="${deltaClass(row.delta)}">${signed(row.delta)}</td><td>${row.paired ? `paired ${meanCi(row)}` : '—'}</td>`;
  return `<section class="evo-section" data-testid="mut-impact"><h3>Result / Impact Vector</h3>
    <table class="mut-table"><thead><tr><th>Metric</th><th>Baseline</th><th>Mutation</th><th>Δ</th><th>Interval</th><th>Evidence</th><th>n</th></tr></thead>
    <tbody>${rows.map((row) => `<tr><td>${esc(row.label)}</td>${cell(row)}<td><span class="mut-grade mut-grade-${esc(row.grade.toLowerCase())}">${esc(row.grade)}</span></td><td>${fmt(Math.min(row.n.control, row.n.mutant))}</td></tr>`).join('')}</tbody></table>
    <p class="footer-note">Δ for rates is a percentage-point difference (mutant − control). Δ for means is a raw-unit difference over genuine paired ordinals only (same seed, seat order, policies). Evidence grades use the shared estimator contract — INSUFFICIENT means the interval cannot exclude the null or the sample is too thin, not that no effect exists.</p>
    ${unmeasuredNote()}</section>`;
}

function unmeasuredNote() {
  return `<p class="footer-note">Not yet measurable from available telemetry: comeback frequency, zone accumulation detail, matchup matrices, strategy diversity indices. These are disclosed as unavailable rather than estimated.</p>`;
}

function deltaClass(delta) {
  if (!Number.isFinite(delta) || delta === 0) return 'mut-delta-flat';
  return delta > 0 ? 'mut-delta-up' : 'mut-delta-down';
}

function profilesHtml(record) {
  const deltas = record.comparison?.policyDeltas ?? [];
  if (!deltas.length) return '';
  return `<section class="evo-section" data-testid="mut-profiles"><h3>Profile Effects</h3>
    <table class="mut-table"><thead><tr><th>Agent profile</th><th>Baseline seat-1</th><th>Mutant seat-1</th><th>Δ seat-1</th><th>Δ turns</th><th>n (ctrl/mut)</th><th>Note</th></tr></thead>
    <tbody>${deltas.map((d) => `<tr><td>${esc(policyName(d.policyId))}</td><td>${pct(d.control.seat1WinRate)}</td><td>${pct(d.mutant.seat1WinRate)}</td><td class="${deltaClass(d.seat1Delta)}">${pp(d.seat1Delta)}</td><td class="${deltaClass(d.turnsDelta)}">${signed(d.turnsDelta, 1)}</td><td>${fmt(d.n.control)}/${fmt(d.n.mutant)}</td><td>${d.warning ? 'SMALL SAMPLE — treat as exploratory' : ''}</td></tr>`).join('')}</tbody></table>
    <p class="footer-note">Each row compares the same agent profile in self-play under both rulesets. A small global effect may conceal a large profile-specific effect — deltas are shown per profile with sample sizes retained.</p></section>`;
}

function regressionsHtml(record) {
  const reg = record.regressions;
  if (!reg) return '';
  const statusClass = reg.status === 'REGRESSION' ? 'danger' : reg.status === 'WARNING' ? 'warning' : '';
  return `<section class="evo-section" data-testid="mut-regressions"><h3>Regression Findings</h3>
    <p class="${statusClass}"><b>${esc(reg.status)}</b> — ${esc(reg.summary)}</p>
    ${reg.findings.length ? `<ul>${reg.findings.map((f) => `<li><b>${esc(f.severity.toUpperCase())}</b> ${esc(f.code)} — ${esc(f.detail)}</li>`).join('')}</ul>` : '<p>No major regressions detected.</p>'}
    <p class="footer-note">Checked: ${reg.checked.join(', ')}. Unmeasured this version: ${reg.unmeasured.join(', ')}.</p></section>`;
}

function outcomeHtml(record) {
  const outcome = record.outcome;
  if (!outcome) return '';
  return `<section class="evo-section" data-testid="mut-outcome"><h3>Outcome classification</h3>
    <p><span class="mut-verdict mut-verdict-${esc(outcome.verdict.toLowerCase())}">${esc(outcome.verdict)}${outcome.provisional ? ' · provisional' : ''}</span></p>
    <ul>${outcome.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <p class="footer-note">Deterministic classification from measured outputs only — not an LLM judgment. Inferred mechanisms belong in the hypothesis field, not the verdict.</p></section>`;
}

function metadataHtml(record) {
  return `<section class="evo-section" data-testid="mut-metadata"><h3>Experiment metadata</h3>
    <dl class="mut-meta">
      <dt>Experiment</dt><dd><code>${esc(record.experimentId)}</code> · schema v${record.schemaVersion} · ${esc(record.mutationMode)} mode</dd>
      <dt>Baseline</dt><dd>engine ${esc(record.baseline.engineVersion)} · rules ${esc(record.baseline.rulesVersion)} · lab ${esc(record.baseline.labVersion)} · profile ${esc(record.baseline.profileId)}</dd>
      <dt>Mutation</dt><dd>${esc(mutationDisplay(record.mutation))} · <code>${esc(record.mutation.id)}</code></dd>
      <dt>Config</dt><dd>${fmt(record.config.gamesPerArm)}/arm · population [${record.config.population.map(esc).join(', ')}] · seed base ${fmt(record.config.seedBase)} · decision limit ${fmt(record.config.decisionLimit)}</dd>
      <dt>Content hash</dt><dd><code class="evo-hash">${esc(record.contentHash ?? '—')}</code></dd>
      <dt>Created</dt><dd>${esc(record.createdAt)}${record.execution?.completedAt ? ` · completed ${esc(record.execution.completedAt)}` : ''}</dd>
    </dl></section>`;
}

function savedHtml() {
  return `<section class="evo-section"><h3>Saved experiments</h3>
    <div class="toolbar">
      <button id="mut-export" class="secondary-button" ${view.record ? '' : 'disabled'}>Export experiment JSON</button>
      <label class="secondary-button">Import experiment<input id="mut-import" type="file" accept="application/json,.json" hidden></label>
      <button id="mut-saved-refresh" class="ghost-button">Refresh list</button>
    </div>
    <p id="mut-storage" role="status">${esc(view.savedError)}</p>
    <div id="mut-saved-list">${savedListHtml()}</div></section>`;
}

function savedListHtml() {
  if (!view.savedList.length) return '<p class="footer-note">No saved mutation experiments on this browser origin.</p>';
  return view.savedList.map((s) => `<div class="evo-checkpoint"><b>${esc(s.mutationLabel ?? s.experimentId)}</b><br><code>${esc(s.experimentId)}</code><br><small>${esc(s.status)} · ${s.verdict ? `${esc(s.verdict)} · ` : ''}${fmt(s.gamesPerArm ?? 0)}/arm · ${esc(s.createdAt)}</small> <button type="button" class="ghost-button mut-load" data-id="${esc(s.experimentId)}">Inspect</button></div>`).join('');
}

function bind() {
  const on = (id, fn, event = 'change') => document.getElementById(id)?.addEventListener(event, fn);
  on('mut-target', (e) => {
    view.targetId = e.target.value;
    const target = MUTATION_TARGET_BY_ID[view.targetId];
    view.mutatedValue = target?.kind === 'boolean' ? false : (view.mutatedValue === target?.baseline ? target.min : view.mutatedValue);
    if (target?.kind === 'numeric' && (view.mutatedValue < target.min || view.mutatedValue > target.max || view.mutatedValue === target.baseline)) view.mutatedValue = target.min;
    view.mutation = null; renderMutationChamber();
  });
  on('mut-value', (e) => {
    const target = MUTATION_TARGET_BY_ID[view.targetId];
    view.mutatedValue = target?.kind === 'boolean' ? e.target.value === 'true' : Number(e.target.value);
    view.mutation = null; renderMutationChamber();
  });
  on('mut-hypothesis', (e) => { view.hypothesis = e.target.value; }, 'input');
  on('mut-profile', (e) => { view.profileId = e.target.value; });
  on('mut-games', (e) => { view.gamesPerArm = Number(e.target.value); renderMutationChamber(); });
  on('mut-workers', (e) => { view.workers = Number(e.target.value); });
  on('mut-seed', (e) => { view.seedBase = Number(e.target.value); });
  on('mut-decisions', (e) => { view.decisionLimit = Number(e.target.value); });
  on('mut-matched', (e) => { view.matchedSeeds = e.target.checked; renderMutationChamber(); });
  on('mut-swap', (e) => { view.swapSides = e.target.checked; renderMutationChamber(); });
  document.querySelectorAll('.mut-pop-check').forEach((box) => box.addEventListener('change', () => {
    if (box.checked) view.population.add(box.value); else view.population.delete(box.value);
    renderMutationChamber();
  }));
  document.getElementById('mut-run')?.addEventListener('click', runExperiment);
  document.getElementById('mut-cancel')?.addEventListener('click', () => { abortRequested = true; for (const w of view.workersLive) { try { w.terminate(); } catch { } } view.workersLive = []; view.running = false; renderMutationChamber(); });
  document.getElementById('mut-export')?.addEventListener('click', exportExperiment);
  document.getElementById('mut-saved-refresh')?.addEventListener('click', refreshSavedList);
  document.getElementById('mut-import')?.addEventListener('change', importExperiment);
  document.querySelectorAll('.mut-load').forEach((btn) => btn.addEventListener('click', () => loadSaved(btn.dataset.id)));
}

async function runExperiment() {
  const mutation = view.mutation ?? buildMutation();
  if (!mutation) { renderMutationChamber(); return; }
  let config;
  try {
    config = createExperimentConfig({
      profileId: view.profileId, population: [...view.population],
      gamesPerArm: view.gamesPerArm, matchedSeeds: view.matchedSeeds,
      swapSides: view.swapSides, seedBase: view.seedBase, decisionLimit: view.decisionLimit,
    });
  } catch (error) { view.error = error.message; renderMutationChamber(); return; }
  const experimentId = `EXP-${Date.now().toString(36).toUpperCase()}`;
  const plan = buildMutationExperimentPlan({ experimentId, mutation, config });
  view.record = createExperimentRecord({
    experimentId, createdAt: new Date().toISOString(),
    baseline: { engineVersion: LAB_IDENTITY.engineVersion, rulesVersion: LAB_IDENTITY.rulesVersion, labVersion: LAB_VERSION, authorityHash: LAB_IDENTITY.fingerprint },
    mutation, hypothesis: view.hypothesis, config,
  });
  view.record.status = 'running';
  view.imported = false;
  view.running = true;
  view.error = '';
  view.progress = { done: 0, total: plan.specs.length };
  abortRequested = false;
  renderMutationChamber();

  const workers = Math.max(1, Math.min(view.workers, plan.specs.length));
  const segments = [];
  const perWorker = Math.ceil(plan.specs.length / workers);
  for (let i = 0; i < plan.specs.length; i += perWorker) segments.push(plan.specs.slice(i, i + perWorker));
  const results = [];
  await Promise.all(segments.map((specs, index) => new Promise((resolve) => {
    const worker = new Worker('worker.js', { type: 'module' });
    view.workersLive.push(worker);
    worker.onmessage = (e) => {
      const x = e.data;
      if (x.type === 'mutation-segment-progress' && view.mounted) {
        view.progress.done = Math.min(view.progress.total, view.progress.done + (x.completed - (segments[index]._done ?? 0)));
        segments[index]._done = x.completed;
        const el = document.querySelector('[data-testid="mut-status"] p[role="status"]');
        if (el) el.textContent = `${fmt(view.progress.done)} / ${fmt(view.progress.total)} matches (${workers} workers) — control + mutant interleaved`;
        const fill = document.querySelector('.evo-progress-fill');
        if (fill) fill.style.width = `${Math.round((view.progress.done / view.progress.total) * 100)}%`;
      } else if (x.type === 'mutation-segment-result') {
        try { worker.terminate(); } catch { }
        if (x.ok) results.push(...JSON.parse(x.resultsJson));
        else results.push(...specs.map((s) => ({ arm: s.arm, pairIndex: s.pairIndex, pairedRunId: s.pairedRunId, specOrdinal: s.ordinal, seed: s.seed, policyId: s.policyId, ruleOverrides: s.ruleOverrides ?? null, ok: false, error: x.error ?? 'WORKER_FAULT' })));
        resolve();
      }
    };
    worker.onerror = () => {
      try { worker.terminate(); } catch { }
      results.push(...specs.map((s) => ({ arm: s.arm, pairIndex: s.pairIndex, pairedRunId: s.pairedRunId, specOrdinal: s.ordinal, seed: s.seed, policyId: s.policyId, ruleOverrides: s.ruleOverrides ?? null, ok: false, error: 'WORKER_FAULT' })));
      resolve();
    };
    worker.postMessage({ type: 'run-mutation-segment', workerIndex: index, specs });
  })));
  view.workersLive = [];
  view.running = false;
  if (abortRequested) { view.record.status = 'incomplete'; renderMutationChamber(); return; }

  // Fold results into arm-separated summaries; worker faults become honest
  // abort stubs so invalid games are counted, never silently discarded.
  const stub = (r) => ({ winner: 'ABORTED', winningSeat: null, terminationReason: 'WORKER_FAULT', errorCode: 'MUTATION_WORKER_FAULT', completedFullTurns: null, scoreMargin: null, commandCount: null, eventCount: null, actionCounts: {}, decisionFamilyCounts: {}, participants: [], policyIds: [r.policyId ?? 'unknown', r.policyId ?? 'unknown'], pairedRunId: r.pairedRunId, seed: r.seed ?? 0, seatOrder: [], ruleCompliance: null, ruleOverrides: r.ruleOverrides ?? null });
  const controlSummaries = [], mutantSummaries = [];
  for (const r of results) {
    const summary = r.ok ? { ...r.summary, pairedRunId: r.pairedRunId } : stub(r);
    (r.arm === 'mutant' ? mutantSummaries : controlSummaries).push(summary);
  }
  try {
    view.record = finalizeExperimentRecord(view.record, {
      controlSummaries, mutantSummaries,
      completedSpecCount: results.length, plannedSpecCount: plan.specs.length,
    });
    const compact = compactExperimentRecord(view.record);
    try { await store.saveMutation(compact); } catch (error) { view.savedError = `Autosave failed: ${error.message}`; }
  } catch (error) {
    view.error = `Finalization failed: ${error.message}`;
    view.record.status = 'failed';
  }
  renderMutationChamber();
}

async function exportExperiment() {
  if (!view.record) return;
  const blob = new Blob([serializeExperiment(view.record)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${view.record.experimentId}.rule-mutation.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importExperiment(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const record = parseMutationImport(await file.text());
    view.record = record;
    view.imported = true;
    view.running = false;
    view.error = '';
  } catch (error) { view.error = `Import rejected: ${error.message}`; }
  event.target.value = '';
  renderMutationChamber();
}

async function loadSaved(id) {
  try {
    view.record = await store.loadMutation(id);
    view.imported = false;
    view.error = '';
  } catch (error) { view.error = `Load failed: ${error.message}`; }
  renderMutationChamber();
}

async function refreshSavedList() {
  try {
    view.savedList = await store.listMutations();
    view.savedError = '';
  } catch (error) { view.savedError = `Storage unavailable: ${error.message}`; }
  const el = document.getElementById('mut-saved-list');
  if (el) {
    el.innerHTML = savedListHtml();
    el.querySelectorAll('.mut-load').forEach((btn) => btn.addEventListener('click', () => loadSaved(btn.dataset.id)));
  }
  const status = document.getElementById('mut-storage');
  if (status) status.textContent = view.savedError;
}
