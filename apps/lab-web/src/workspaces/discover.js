// ✦ DISCOVER — autonomous evidence-driven research engine.
// Scans accumulated Lab evidence for testable anomalies, forms falsifiable
// hypotheses, runs targeted mirrored series, attempts falsification,
// replicates survivors, and promotes only gated results. Zero discoveries
// after a real evidence scan is a valid, successful outcome — never an
// error state. A run that received zero admissible evidence is BLOCKED,
// an input failure distinct from any scientific outcome.
//
// Scientific logic lives entirely in the runtime modules
// (evolution/discovery-*.mjs). This workspace renders state and forwards
// intents — it never judges evidence itself.

import { app, esc, fmt, state } from '../state.js';
import { LAB_IDENTITY } from '../evolution/identity.mjs';
import { EvolutionStore } from '../evolution/evolution-store.mjs';
import { executeDiscoveryRun, prepareDiscoveryRun, resolveEvidenceScope } from '../evolution/discovery-runner.mjs';
import { DISCOVERY_MODES, DISCOVERY_LIMITS, PROMOTION_GATES, discoveryRunSummary } from '../evolution/discovery-domain.mjs';

const store = new EvolutionStore(LAB_IDENTITY);
const pp = (n) => Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}pp` : '—';
const intervalText = (iv) => Array.isArray(iv) && Number.isFinite(iv[0]) && Number.isFinite(iv[1])
  ? `[${pp(iv[0])}, ${pp(iv[1])}]` : '—';
const policyName = (id) => String(id ?? '').replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const clock = (iso) => { const d = Date.parse(iso ?? ''); return Number.isFinite(d) ? new Date(d).toTimeString().slice(0, 5) : ''; };

const MODE_LABELS = {
  open: 'Open Discovery — scheduler picks promising targets',
  explorer: 'Explorer — novelty and unusual interactions',
  auditor: 'Auditor — re-tests existing discoveries',
  balancer: 'Balancer — problematic cards, matchups, first-player effects',
  'bug-hunter': 'Bug Hunter — discontinuities, outliers, integrity anomalies',
};

const view = {
  mode: 'open',
  gameBudget: DISCOVERY_LIMITS.gameBudgetDefault,
  confirmGames: 128,
  workers: 2,
  profileId: 'core-advanced-authority',
  seed: 1,
  run: null,
  running: false,
  // launching: set the instant START is pressed and held until the run
  // reaches executeDiscoveryRun (or the launch fails). It is what makes
  // the gap between click and RUNNING visible — and prevents double-fire.
  launching: false,
  live: { completed: 0, total: 0, hypothesisId: null, stageKey: null },
  inspectedDiscovery: null,
  history: [],
  library: [],
  error: '',
  storageError: '',
  mounted: false,
  // Pre-run evidence resolution — what a new run would actually scan.
  // 'idle' means the store has not been inspected yet on this mount.
  evidence: { status: 'idle', scope: null, error: '' },
};

let controller = null;

function cancelRun() {
  const c = controller;
  controller = null;
  try { c?.abort(); } catch { /* abort is idempotent */ }
  view.running = false;
}

export function cleanupDiscover() {
  cancelRun();
  view.mounted = false;
}

/** Single source of truth for whether START can fire — used by the render,
 * the evidence patch, and the library patch so the button can never drift
 * from the reasons that actually block a launch. Auditor is exempt from the
 * zero-evidence disable only when prior Discoveries exist to re-test. */
function startDisabledReason() {
  if (view.launching) return 'Preparing the run — evidence is being resolved';
  if (view.running) return 'A run is in progress';
  if (view.run?.status === 'PAUSED') return 'A paused run exists — Resume it or use New Discovery';
  if (view.evidence.status === 'loading') return 'Evidence is still being resolved';
  if (view.evidence.status === 'ready'
    && (view.evidence.scope?.eligibleGameCount ?? 0) === 0
    && !(view.mode === 'auditor' && view.library.length > 0)) {
    return 'No admissible Lab evidence — run a Lab series first';
  }
  return null;
}

export function renderDiscover() {
  view.mounted = true;
  const run = view.run;
  const startReason = startDisabledReason();
  app.innerHTML = `<section class="panel" data-testid="discover-workspace">
    <div class="panel-header"><div><h2>✦ Discovery Engine</h2>
      <p>Autonomous research — anomaly scan → falsifiable hypotheses → targeted experiments → falsification → replication → gated promotion.</p></div>
      <div class="toolbar">
        <span class="evo-state dsc-state-${esc((run?.status ?? 'idle').toLowerCase())}" data-testid="dsc-state">${esc(view.running ? 'RUNNING' : view.launching ? 'PREPARING' : run?.status ?? 'CONFIGURED')}</span>
        <button id="dsc-start" class="primary-button" data-testid="dsc-start" ${startReason ? 'disabled' : ''}>Start Run</button>
        <small id="dsc-start-hint" class="dsc-start-hint" data-testid="dsc-start-hint" ${startReason ? '' : 'hidden'}>${esc(startReason ?? '')}</small>
        <button id="dsc-resume" class="secondary-button" data-testid="dsc-resume" ${!view.running && run?.status === 'PAUSED' ? '' : 'disabled'}>Resume</button>
        <button id="dsc-pause" class="secondary-button" data-testid="dsc-pause" ${view.running ? '' : 'disabled'}>Pause</button>
        <button id="dsc-new" class="secondary-button" data-testid="dsc-new" ${view.running ? 'disabled' : ''}>New Discovery</button>
        <button id="dsc-evidence-refresh" class="ghost-button" data-testid="dsc-evidence-refresh" ${view.running ? 'disabled' : ''} title="Re-resolve stored Lab evidence">↻ Evidence</button>
      </div></div>
    <div class="panel-body">
      <div class="notice"><b>Finding ≠ Discovery.</b> Candidates are only signals — a Discovery requires controlled fresh evidence, seat-mirroring where relevant, independent-seed replication, challenge stages, and every promotion gate. A run that ends with <b>zero discoveries</b> is a successful result. Effect claims are reproducible associations inside deterministic self-play simulation, not causal proofs.</div>
      <p id="dsc-error" class="danger" role="alert">${esc(view.error)}</p>
      ${view.storageError ? `<div class="notice warning">Storage: ${esc(view.storageError)}</div>` : ''}
      ${configHtml(run)}
      ${evidenceHtml()}
      ${run ? runHtml(run) : ''}
      ${queueHtml(run)}
      ${journalHtml(run)}
      ${summaryHtml(run)}
      ${inspectionHtml()}
      ${libraryHtml()}
      ${historyHtml()}
    </div></section>`;
  bind();
  refreshLists();
  if (!view.running && view.evidence.status === 'idle') void refreshEvidence();
}

function configHtml(run) {
  const locked = view.running || (run && run.status !== 'IDLE');
  return `<section class="evo-section" data-testid="dsc-config"><h3>Research Program</h3>
    <div class="evo-config-row">
      <label class="field">Mode<select id="dsc-mode" data-testid="dsc-mode" ${locked ? 'disabled' : ''}>${DISCOVERY_MODES.map((m) => `<option value="${m}" ${m === view.mode ? 'selected' : ''}>${esc(MODE_LABELS[m] ?? m)}</option>`).join('')}</select></label>
      <label class="field">Game budget<input id="dsc-budget" type="number" min="${DISCOVERY_LIMITS.gameBudgetMin}" max="${DISCOVERY_LIMITS.gameBudgetMax}" step="128" value="${view.gameBudget}" ${locked ? 'disabled' : ''}></label>
      <label class="field">Confirm games<input id="dsc-confirm" type="number" min="${DISCOVERY_LIMITS.confirmGamesMin}" max="${DISCOVERY_LIMITS.confirmGamesMax}" step="2" value="${view.confirmGames}" ${locked ? 'disabled' : ''}></label>
      <label class="field">Workers<select id="dsc-workers" ${locked ? 'disabled' : ''}>${[1, 2, 4].map((n) => `<option ${n === view.workers ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field">Rules profile<select id="dsc-profile" ${locked ? 'disabled' : ''}>${[['core-advanced-authority', 'Advanced Core'], ['core-unrestricted-authority', 'Unrestricted Core'], ['first-contact-trigger-closure', 'First Contact']].map(([id, label]) => `<option value="${id}" ${view.profileId === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="field">Run seed<input id="dsc-seed" type="number" min="1" max="4294967295" step="1" value="${view.seed}" ${locked ? 'disabled' : ''}></label>
    </div>
    <p class="footer-note">Evidence scope: all admissible Lab series on this origin (identity fingerprint match, verified imports excluded). The snapshot is frozen into the run artifact — later lab runs cannot change what this run investigated. Promotion gates: ≥${PROMOTION_GATES.minDecisiveGames} pooled decisive games, |effect| ≥ ${(PROMOTION_GATES.minEffect * 100).toFixed(0)}pp, interval excludes null, ≥${PROMOTION_GATES.minReplicationBatches} independent replication batches all passing, seat-mirror cleared, no unresolved confound.</p>
  </section>`;
}

/** Render a per-reason exclusion ledger line. Reason codes come from the
 * snapshot (EVIDENCE_EXCLUSION); unknown codes degrade to lowercase text. */
function exclusionText(reasons) {
  return Object.entries(reasons ?? {})
    .map(([k, v]) => `${fmt(v)}× ${String(k).toLowerCase().replaceAll('_', ' ')}`)
    .join(' · ');
}

/** What a run started right now would scan — resolved against the Lab
 * series store before launch so an empty scope is visible up front,
 * never discovered as a zero-game run after the fact. */
function evidenceHtml() {
  if (view.running) return '';
  const ev = view.evidence;
  const corpus = state.aggregate?.matchCount;
  const expRuns = state.evidenceBasis?.totalRuns ?? 0;
  const corpusNote = `${typeof corpus === 'number' && corpus > 0
    ? `The COHORT strip above reports ${fmt(corpus)} certified corpus matches — match-evidence summaries (M-*/PR-* identifiers). DISCOVER does not scan those: it investigates stored Lab series run artifacts (EL-*) produced by this origin.`
    : 'DISCOVER scans stored Lab series run artifacts on this origin — it does not consume the certified corpus cohort shown in the strip.'} ${expRuns > 0
    ? `${fmt(expRuns)} Experiment run(s) live in the separate Experiment evidence store (Run → Analysis Set) — DISCOVER does not scan them either; the two evidence stores are intentionally distinct.`
    : 'Experiment runs live in a separate evidence store (Run → Analysis Set) — DISCOVER does not scan them; the two evidence stores are intentionally distinct.'}`;
  let body;
  if (ev.status === 'idle' || ev.status === 'loading') {
    body = '<p class="footer-note">Resolving stored Lab evidence…</p>';
  } else if (ev.status === 'error') {
    body = `<p class="footer-note warning">Evidence store could not be inspected: ${esc(ev.error || 'unknown error')}</p>`;
  } else {
    const s = ev.scope;
    const reasons = exclusionText(s.exclusionReasons);
    const trunc = s.truncatedRunCount ? ` · ${fmt(s.truncatedRunCount)} stored run(s) beyond the scan cap` : '';
    body = `<div class="dsc-run-grid">
      <span><small>Stored runs</small><b>${fmt(s.historyRunCount)}</b></span>
      <span><small>Selected</small><b>${fmt(s.selectedGameCount)} games · ${fmt(s.selectedRunCount)} runs</b></span>
      <span><small>Admissible</small><b>${fmt(s.eligibleGameCount)} games · ${fmt(s.eligibleRunCount)} runs</b></span>
      <span><small>Excluded</small><b>${fmt(s.excludedRunCount)} runs</b></span>
    </div>
    ${(reasons || trunc) ? `<p class="footer-note warning">Exclusions: ${esc(reasons || 'none')}${esc(trunc)}</p>` : ''}
    ${s.eligibleGameCount === 0 ? '<p class="footer-note warning"><b>No admissible evidence.</b> A run started now would block before research — run a Lab series on this origin first, then refresh.</p>' : ''}`;
  }
  return `<section class="evo-section" data-testid="dsc-evidence"><h3>Evidence Resolution</h3>
    ${body}
    <p class="footer-note">${esc(corpusNote)}</p>
  </section>`;
}

async function refreshEvidence() {
  if (view.running || view.launching) return;
  view.evidence = { status: 'loading', scope: view.evidence.scope, error: '' };
  patchEvidence();
  try {
    const scope = await resolveEvidenceScope(store, {}, LAB_IDENTITY);
    if (!view.mounted || view.running) return;
    view.evidence = { status: 'ready', scope, error: '' };
  } catch (error) {
    if (!view.mounted || view.running) return;
    view.evidence = { status: 'error', scope: null, error: String(error?.message ?? error) };
  }
  patchEvidence();
}

function patchStartButton() {
  const start = document.getElementById('dsc-start');
  if (!start) return;
  const reason = startDisabledReason();
  start.disabled = reason != null;
  const hint = document.getElementById('dsc-start-hint');
  if (hint) { hint.textContent = reason ?? ''; hint.hidden = !reason; }
}

function patchEvidence() {
  const el = document.querySelector('[data-testid="dsc-evidence"]');
  if (el) el.outerHTML = evidenceHtml();
  patchStartButton();
}

/** Reset the current Discovery session to a clean workspace. Only
 * ephemeral current-run state is cleared — past run envelopes and the
 * promoted Discovery Library are historical artifacts in IndexedDB and
 * are never touched. A new run can be started immediately. */
function resetDiscovery() {
  if (view.running || view.launching) return;
  view.run = null;
  view.inspectedDiscovery = null;
  view.live = { completed: 0, total: 0, hypothesisId: null, stageKey: null };
  view.error = '';
  view.evidence = { status: 'idle', scope: null, error: '' };
  renderDiscover();
}

function runHtml(run) {
  const live = view.live;
  const pctDone = live.total > 0 ? Math.min(100, Math.round((live.completed / live.total) * 100)) : 0;
  return `<section class="evo-section" data-testid="dsc-run"><h3>Discovery Run <code>${esc(run.runId)}</code></h3>
    <div class="dsc-run-grid">
      <span><small>Status</small><b>${esc(run.status)}</b></span>
      <span><small>Mode</small><b>${esc(run.mode)}</b></span>
      <span><small>Evidence</small><b>${fmt(run.evidence.gameCount)} games · ${run.evidence.runCount} runs</b></span>
      <span><small>Budget</small><b>${fmt(run.budget.consumed)} / ${fmt(run.budget.allocated)}</b></span>
      <span><small>Candidates</small><b>${run.candidates.length}</b></span>
      <span><small>Hypotheses</small><b>${run.hypotheses.length}</b></span>
      <span><small>Discoveries</small><b>${run.discoveries.length}</b></span>
      <span><small>Snapshot</small><b><code>${esc(String(run.evidence.snapshotId).slice(0, 18))}…</code></b></span>
    </div>
    ${run.evidence.excludedCount ? `<p class="footer-note warning">${fmt(run.evidence.excludedCount)} stored run(s) excluded — ${esc(exclusionText(run.evidence.exclusionReasons) || 'inadmissible')} (disclosed, never pooled).</p>` : ''}
    ${run.status === 'BLOCKED' ? `<p class="footer-note warning"><b>Blocked before research:</b> ${esc((run.warnings ?? []).find((w) => w.code === 'EVIDENCE_RESOLUTION_FAILED')?.detail ?? 'no admissible evidence reached the scanner')}. 0 hypotheses were evaluated — this is an input failure, not a scientific result.</p>` : ''}
    ${run.warnings.length ? `<p class="footer-note warning">${run.warnings.map((w) => esc(`${w.code}${w.detail ? ` — ${w.detail}` : ''}`)).join(' · ')}</p>` : ''}
    ${view.running ? `<div class="evo-progress-track"><div class="evo-progress-fill" style="width:${pctDone}%"></div></div>
      <p role="status">${live.hypothesisId ? `Investigating <b>${esc(live.hypothesisId)}</b>${live.stageKey ? ` → ${esc(live.stageKey)}` : ''} · ` : ''}${fmt(live.completed)} / ${fmt(live.total)} stage games · ${fmt(run.budget.consumed + live.completed)} / ${fmt(run.budget.allocated)} budget consumed</p>` : ''}
  </section>`;
}

function scoreChip(label, value, title) {
  const v = Math.round(value ?? 0);
  return `<span class="dsc-score" title="${esc(title ?? label)}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i><em>${esc(label)}</em><b>${v}</b></span>`;
}

function queueHtml(run) {
  if (!run) return '';
  const items = run.hypotheses.map((h) => {
    const cand = run.candidates.find((c) => c.candidateId === h.candidateId);
    const s = cand?.scores ?? {};
    const stages = h.plan.stages.map((st) => {
      const mark = st.status === 'complete' ? (st.result?.verdict === 'passed' || st.result?.verdict === 'supported' ? '✓' : st.result?.verdict === 'refuted' || st.result?.verdict === 'failed' ? '✗' : '◐') : st.status === 'running' ? '▸' : st.status === 'skipped' ? '–' : '·';
      return `<span class="dsc-stage dsc-stage-${esc(st.status)}" title="${esc(st.key)} — ${esc(st.status)}${st.result?.reason ? ` · ${esc(st.result.reason)}` : ''}">${mark} ${esc(st.key)}</span>`;
    }).join('');
    const checks = (h.checks ?? []).map((c) => `<span class="dsc-check dsc-check-${esc(c.verdict)}" title="${esc(c.detail ?? '')}">${esc(c.kind)}: ${esc(c.verdict.toUpperCase())}</span>`).join('');
    const est = h.evidence?.estimate;
    return `<article class="dsc-card dsc-card-${esc(h.status)}" data-testid="dsc-hyp-${esc(h.hypothesisId)}">
      <header><code>${esc(h.hypothesisId)}</code><span class="dsc-lifecycle dsc-lc-${esc(h.status)}">${esc(h.status.replaceAll('_', ' '))}</span><span class="dsc-cat">${esc(h.category)}</span></header>
      <p class="dsc-claim">${esc(h.claim)}</p>
      <div class="dsc-scores">${scoreChip('NOV', s.novelty, 'Novelty')}${scoreChip('IMP', s.impact, 'Potential impact')}${scoreChip('SIG', s.signal, 'Signal strength')}${scoreChip('GAP', s.evidenceGap, 'Evidence gap')}${scoreChip('TST', s.testability, 'Testability')}<span class="dsc-priority" title="Research priority">PRI <b>${Math.round(s.priority ?? 0)}</b></span></div>
      <div class="dsc-meta"><span>est. ${fmt(h.estimatedGames)} games</span><span>replication ${h.replication.passed}/${h.replication.attempted}</span>${Number.isFinite(est) ? `<span>est ${pp(est)} ${intervalText(h.evidence.interval)}</span>` : ''}${h.scope?.policies ? `<span>${h.scope.policies.map(policyName).map(esc).join(' vs ')}</span>` : ''}</div>
      ${stages ? `<div class="dsc-stages">${stages}</div>` : ''}
      ${checks ? `<div class="dsc-checks">${checks}</div>` : ''}
      ${h.scopeNote ? `<p class="dsc-scope-note">${esc(h.scopeNote)}</p>` : ''}
    </article>`;
  }).join('');
  const pendingCandidates = run.candidates.filter((c) => !run.hypotheses.some((h) => h.candidateId === c.candidateId));
  return `<section class="evo-section" data-testid="dsc-queue"><h3>Research Queue</h3>
    ${items || '<p>No hypotheses yet — the evidence scan decides what is worth investigating. Normal noise produces none.</p>'}
    ${pendingCandidates.length ? `<details><summary>Uninvestigated candidates (${pendingCandidates.length})</summary><div class="dsc-cand-list">${pendingCandidates.slice(0, 24).map((c) => `<div class="dsc-cand"><code>${esc(c.candidateId)}</code> <b>${esc(c.category)}</b> ${esc(c.summary)} <small>priority ${Math.round(c.scores?.priority ?? 0)}${c.signal?.surprise != null ? ` · surprise ${c.signal.surprise}` : ''}</small></div>`).join('')}</div></details>` : ''}
  </section>`;
}

function journalHtml(run) {
  if (!run) return '';
  const rows = (run.journal ?? []).slice(-120).map((j) => `<div class="dsc-journal-row dsc-j-${esc(j.type)}"><time>${esc(clock(j.at))}</time><span>${esc(j.message)}</span></div>`).join('');
  return `<section class="evo-section" data-testid="dsc-journal"><h3>Research Journal</h3>
    <div class="dsc-journal">${rows}</div>
    ${run.journalTruncated ? '<p class="footer-note">Journal truncated at the storage bound — full detail is in the per-stage run references.</p>' : ''}
  </section>`;
}

function summaryHtml(run) {
  if (!run || !['COMPLETE', 'PAUSED', 'STOPPED', 'ERROR', 'BLOCKED'].includes(run.status)) return '';
  const s = discoveryRunSummary(run);
  // Verdict wording is honest about what actually happened: an input
  // failure (BLOCKED) evaluated no hypotheses; a scanned-but-quiet run
  // produced no candidates; tested-and-rejected is a real negative result.
  const zeroNote = run.status === 'BLOCKED'
    ? '<p class="dsc-zero"><b>No hypotheses were evaluated — this run received no admissible evidence.</b> This is an input-resolution failure, not a scientific result.</p>'
    : (s.promoted === 0 && s.conditional === 0 && run.status === 'COMPLETE'
      ? (s.evaluated === 0
        ? `<p class="dsc-zero"><b>Evidence was scanned successfully, but no candidate met the discovery thresholds.</b> ${fmt(run.evidence.gameCount)} games across ${run.evidence.runCount} run(s) were evaluated — a valid negative scan.${run.candidates.length ? ` ${run.candidates.length} candidate(s) surfaced but none could be shaped into an executable plan within the budget.` : ''}</p>`
        : `<p class="dsc-zero"><b>No claim satisfied the promotion criteria.</b> ${s.evaluated} hypothesis(es) were tested and did not survive the evidence gates — a valid result.</p>`)
      : '');
  return `<section class="evo-section" data-testid="dsc-summary"><h3>Run Summary</h3>
    <div class="dsc-run-grid">
      <span><small>Evaluated</small><b>${s.evaluated}</b></span>
      <span><small>Rejected</small><b>${s.rejected}</b></span>
      <span><small>Unresolved</small><b>${s.unresolved}</b></span>
      <span><small>Conditional</small><b>${s.conditional}</b></span>
      <span><small>Promoted</small><b>${s.promoted}</b></span>
      <span><small>Games used</small><b>${fmt(s.budget.consumed)}</b></span>
    </div>
    ${zeroNote}
    ${run.discoveries.length ? `<p>${run.discoveries.map((d) => `<code>${esc(d.discoveryId)}</code>`).join(' ')} promoted — see the Discovery Library below.</p>` : ''}
  </section>`;
}

function inspectionHtml() {
  const d = view.inspectedDiscovery;
  if (!d) return '';
  return `<section class="evo-section" data-testid="dsc-inspect"><h3>✦ Discovery ${esc(d.discoveryId)} <span class="dsc-lifecycle dsc-lc-${esc(d.status)}">${esc(d.status.replaceAll('_', ' '))}</span></h3>
    <p class="dsc-claim">${esc(d.claim)}</p>
    <div class="dsc-run-grid">
      <span><small>Effect</small><b>${pp(d.effect?.estimate)}</b></span>
      <span><small>95% interval</small><b>${intervalText(d.effect?.interval95)}</b></span>
      <span><small>Games</small><b>${fmt(d.effect?.games)}</b></span>
      <span><small>Decisive</small><b>${fmt(d.effect?.decisive)}</b></span>
      <span><small>Replication</small><b>${d.replication?.passed}/${d.replication?.attempted} passed</b></span>
      <span><small>Seat mirroring</small><b>${esc(d.seatMirroring)}</b></span>
      <span><small>Confidence</small><b>${esc(d.confidence)}</b></span>
      <span><small>Evidence grade</small><b>${esc(d.evidenceGrade)}</b></span>
    </div>
    ${d.challenges?.length ? `<div class="dsc-checks">${d.challenges.map((c) => `<span class="dsc-check dsc-check-${esc(c.verdict)}" title="${esc(c.detail ?? '')}">${esc(c.kind)}: ${esc(c.verdict.toUpperCase())}</span>`).join('')}</div>` : ''}
    ${d.scope?.note ? `<p class="dsc-scope-note"><b>Scope:</b> ${esc(d.scope.note)}</p>` : ''}
    ${d.interpretation?.text ? `<p class="dsc-interpretation"><b>Interpretation (not empirical fact):</b> ${esc(d.interpretation.text)}</p>` : ''}
    <p class="footer-note">${esc(d.limitation ?? 'Effect is measured inside deterministic self-play simulation — a reproducible association, not a causal proof.')}</p>
    <details><summary>Promotion gate ledger (${d.promotionGates?.length ?? 0})</summary>
      <table class="dsc-gates">${(d.promotionGates ?? []).map((g) => `<tr><td><code>${esc(g.code)}</code></td><td class="dsc-check-${g.passed ? 'passed' : 'failed'}">${g.passed ? 'PASS' : 'FAIL'}</td><td>${esc(g.detail ?? '')}</td></tr>`).join('')}</table></details>
    <details><summary>Provenance</summary>
      <p class="dsc-prov"><code>run ${esc(d.provenance?.runId)}</code> · snapshot <code>${esc(String(d.provenance?.evidenceSnapshotId).slice(0, 24))}…</code><br>
      policies: ${(d.policiesTested ?? []).map((p) => esc(policyName(p))).join(', ')}<br>
      experiment runs: ${(d.provenance?.experimentRunIds ?? []).map((r) => `<code>${esc(r)}</code>`).join(' ') || '—'}<br>
      fingerprint <code>${esc(String(d.provenance?.fingerprint ?? '').slice(0, 16))}…</code> · created ${esc(d.createdAt)}</p></details>
    <p class="footer-note">Reproducible association inside deterministic self-play simulation — not a causal proof. Status history: ${(d.statusHistory ?? []).map((s2) => esc(`${s2.status} @ ${clock(s2.at)}`)).join(' → ')}</p>
  </section>`;
}

function libraryHtml() {
  const rows = view.library.map((d) => `<button class="dsc-lib-row" data-inspect="${esc(d.discoveryId)}">
    <code>${esc(d.discoveryId)}</code><span class="dsc-lifecycle dsc-lc-${esc(d.status)}">${esc(String(d.status).replaceAll('_', ' '))}</span>
    <span class="dsc-lib-claim">${esc(String(d.claim ?? '').slice(0, 110))}</span>
    <small>${esc(d.category ?? '')} · ${pp(d.estimate)} · ${esc(d.confidence ?? '')} · ${esc(String(d.createdAt ?? '').slice(0, 10))}</small>
  </button>`).join('');
  return `<section class="evo-section" data-testid="dsc-library"><h3>Discovery Library</h3>
    ${rows || '<p>No promoted discoveries on this origin. The library accumulates only artifacts that passed every promotion gate.</p>'}
  </section>`;
}

function historyHtml() {
  const rows = view.history.map((r) => `<button class="dsc-lib-row" data-load-run="${esc(r.runId)}">
    <code>${esc(String(r.runId).slice(0, 16))}…</code><span class="dsc-lifecycle dsc-lc-${esc(String(r.status).toLowerCase())}">${esc(r.status)}</span>
    <span class="dsc-lib-claim">${esc(r.mode ?? '')} · ${r.hypotheses ?? 0} hypotheses · ${r.promoted ?? 0} promoted</span>
    <small>${fmt(r.budget?.consumed ?? 0)} games · ${esc(String(r.createdAt ?? '').slice(0, 16).replace('T', ' '))}</small>
  </button>`).join('');
  return `<section class="evo-section" data-testid="dsc-history"><h3>Past Runs</h3>
    ${rows || '<p>No discovery runs recorded yet.</p>'}
  </section>`;
}

async function refreshLists() {
  try {
    view.storageError = '';
    const [history, library] = await Promise.all([store.listDiscoveryRuns(), store.listDiscoveries()]);
    if (!view.mounted) return;
    view.history = history;
    view.library = library;
    const h = document.querySelector('[data-testid="dsc-history"]');
    if (h) h.outerHTML = historyHtml();
    const l = document.querySelector('[data-testid="dsc-library"]');
    if (l) l.outerHTML = libraryHtml();
    bindLists();
    // Auditor eligibility depends on the library — a zero-evidence scope
    // unlocks START for auditor once prior Discoveries are known.
    patchStartButton();
  } catch (error) {
    view.storageError = error.message;
  }
}

function bindLists() {
  document.querySelectorAll('[data-load-run]').forEach((b) => b.addEventListener('click', async () => {
    if (view.running) return;
    try { view.run = await store.loadDiscoveryRun(b.dataset.loadRun); view.inspectedDiscovery = null; view.error = ''; renderDiscover(); }
    catch (error) { view.error = `Load rejected: ${error.message}`; renderDiscover(); }
  }));
  document.querySelectorAll('[data-inspect]').forEach((b) => b.addEventListener('click', async () => {
    try { view.inspectedDiscovery = await store.loadDiscovery(b.dataset.inspect); view.error = ''; renderDiscover(); }
    catch (error) { view.error = `Inspection rejected: ${error.message}`; renderDiscover(); }
  }));
}

/** Turn a launch failure into a precise inline message — the START button
 * must never look like it did nothing. Codes map to root-cause text. */
function launchErrorText(error) {
  const msg = String(error?.message ?? error ?? 'unknown failure');
  if (msg === 'INDEXEDDB_UNAVAILABLE') return 'Evidence store could not be inspected — IndexedDB is unavailable in this context. Lab evidence cannot be read or retained here.';
  if (msg === 'LAB_STORAGE_BLOCKED') return 'Evidence store could not be inspected — the Lab database is blocked by another open Intrilex tab. Close it and retry.';
  if (msg.startsWith('LAB_STORAGE')) return `Evidence store could not be inspected — ${msg}.`;
  return `Discovery run could not start — ${msg}.`;
}

async function startRun(resume = false) {
  // START must never silently no-op: the button is disabled while launching
  // or running, so a click that reaches here always produces a visible
  // transition — PREPARING immediately, then RUNNING or an inline error.
  if (view.running || view.launching) return;
  view.error = '';
  view.launching = true;
  // Immediate visible transition — before any storage awaits — plus a
  // disabled button so rapid clicks cannot double-fire the launch.
  const startBtn = document.getElementById('dsc-start');
  if (startBtn) startBtn.disabled = true;
  const hint = document.getElementById('dsc-start-hint');
  if (hint) { hint.textContent = 'Preparing the run — evidence is being resolved'; hint.hidden = false; }
  const chip = document.querySelector('[data-testid="dsc-state"]');
  if (chip) chip.textContent = resume ? 'RESUMING' : 'PREPARING';
  try {
    if (!resume || !view.run || view.run.status !== 'PAUSED') {
      const run = await prepareDiscoveryRun(store, {
        mode: view.mode, gameBudget: view.gameBudget, confirmGames: view.confirmGames,
        workerCount: view.workers, profileId: view.profileId, seed: view.seed,
      }, LAB_IDENTITY);
      if (!view.mounted) { view.launching = false; return; }
      await store.saveDiscoveryRun(run);
      if (!view.mounted) { view.launching = false; return; }
      view.run = run;
    }
  } catch (error) {
    view.launching = false;
    if (!view.mounted) return; // navigated away mid-prepare — never clobber the live route
    view.error = launchErrorText(error);
    renderDiscover();
    return;
  }

  view.launching = false;
  view.running = true;
  controller = new AbortController();
  renderDiscover();
  try {
    const run = await executeDiscoveryRun(view.run, {
      store,
      signal: controller.signal,
      onJournal: () => { patchJournal(); },
      onStage: () => { patchQueue(); },
      onProgress: (p) => { view.live = p; patchLive(); },
      onPersist: () => { refreshLists(); },
    });
    view.run = run;
  } catch (error) {
    view.error = String(error?.message ?? error);
    // The last persisted envelope is authoritative — reload it so a
    // mid-stage fault surfaces as PAUSED (resumable) rather than a stale
    // in-memory RUNNING state.
    try { if (view.run?.runId) view.run = await store.loadDiscoveryRun(view.run.runId); } catch { /* storage may be the failure */ }
  } finally {
    view.running = false;
    view.launching = false;
    controller = null;
    view.live = { completed: 0, total: 0, hypothesisId: null, stageKey: null };
    // Stage runs were persisted mid-run — the stored-evidence scope has
    // changed, so the pre-run resolution preview must be re-resolved.
    view.evidence = { status: 'idle', scope: null, error: '' };
    if (view.mounted) renderDiscover();
  }
}

/** Live patches — bounded DOM writes between full re-renders. */
function patchLive() {
  const el = document.querySelector('[data-testid="dsc-run"]');
  if (el && view.run) el.outerHTML = runHtml(view.run);
}
function patchJournal() {
  const el = document.querySelector('[data-testid="dsc-journal"] .dsc-journal');
  const run = view.run;
  if (el && run?.journal?.length) {
    const j = run.journal.at(-1);
    el.insertAdjacentHTML('beforeend', `<div class="dsc-journal-row dsc-j-${esc(j.type)}"><time>${esc(clock(j.at))}</time><span>${esc(j.message)}</span></div>`);
    el.scrollTop = el.scrollHeight;
  }
}
function patchQueue() {
  const el = document.querySelector('[data-testid="dsc-queue"]');
  if (el && view.run) el.outerHTML = queueHtml(view.run);
}

function bind() {
  document.getElementById('dsc-mode')?.addEventListener('change', (e) => { view.mode = e.target.value; });
  document.getElementById('dsc-budget')?.addEventListener('change', (e) => { view.gameBudget = Math.max(DISCOVERY_LIMITS.gameBudgetMin, Math.min(DISCOVERY_LIMITS.gameBudgetMax, Math.floor(Number(e.target.value) || DISCOVERY_LIMITS.gameBudgetDefault))); });
  document.getElementById('dsc-confirm')?.addEventListener('change', (e) => { view.confirmGames = Math.max(DISCOVERY_LIMITS.confirmGamesMin, Math.min(DISCOVERY_LIMITS.confirmGamesMax, Math.floor(Number(e.target.value) / 2) * 2 || 128)); });
  document.getElementById('dsc-workers')?.addEventListener('change', (e) => { view.workers = Number(e.target.value) || 2; });
  document.getElementById('dsc-profile')?.addEventListener('change', (e) => { view.profileId = e.target.value; });
  document.getElementById('dsc-seed')?.addEventListener('change', (e) => { view.seed = Math.max(1, Math.floor(Number(e.target.value) || 1)); });
  document.getElementById('dsc-start')?.addEventListener('click', () => { startRun(false); });
  document.getElementById('dsc-resume')?.addEventListener('click', () => { startRun(true); });
  document.getElementById('dsc-pause')?.addEventListener('click', () => { cancelRun(); });
  document.getElementById('dsc-new')?.addEventListener('click', () => { resetDiscovery(); });
  document.getElementById('dsc-evidence-refresh')?.addEventListener('click', () => { refreshEvidence(); });
  bindLists();
}
