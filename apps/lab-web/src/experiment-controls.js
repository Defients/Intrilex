// ═══════════════════════════════════════════════════════════════
// experiment-controls.js — Experiment panel, campaign runner, global bindings
// ═══════════════════════════════════════════════════════════════

import { state, esc, fmt, pct, short, definitionList, showToast, persistSetting } from './state.js';
import { WORKSPACES, WORKSPACE_KEYWORDS, route, policyOptions, updateRailContext } from './router.js';
import { populateDialogHeading } from './seo-metadata.js';
import { rerender, invokeAppAction } from './rerender.js';
import { experimentsReady, nextRunOrdinalStart, beginExperimentRun, commitExperimentBatch, finalizeExperimentRun, failExperimentRun, cancelExperimentRun, registerRunExecutor, restoreBaseline } from './experiments/experiment-controller.mjs';
import { renderEvidenceStrip, renderRunsPanel, openRunsPanel } from './experiments/runs-panel.js';
import { initAnalysisExportHub } from './analysis-export-hub.mjs';

// ── Experiment panel ──────────────────────────────────────────────
export function renderExperimentControls() {
  document.querySelector('#experiment-controls').innerHTML = `<div class="experiment-grid">
    <div id="exp-evidence" class="exp-evidence-slot"></div>
    <label>Experiment preset<select id="exp-preset"><option value="">Custom (manual config)</option><option value="EXP-01-2B2R-HOLD-FIRE">EXP-01: 2B2R Hold vs Fire</option><option value="EXP-02-BOARD-LOCK-LEAD">EXP-02: Board Lock Lead vs Comeback</option><option value="EXP-03-TEN-HEART-OPPORTUNITY-COST">EXP-03: 10♥ Tempo Opportunity Cost</option><option value="EXP-04-QUEEN-FORTRESS-WINDOW">EXP-04: Queen Fortress Breach Window</option><option value="EXP-05-TOTAL-CLEAR-REBOUND">EXP-05: Total Clear Rebound</option><option value="EXP-06-UNRESTRICTED-BENCHMARK">EXP-06: Unrestricted Seat Balance</option><option value="EXP-07-COUNTER-RETENTION-VALUE">EXP-07: Counter Retention Value</option></select></label>
    <label>Profile<select id="exp-profile"><option value="core-advanced-authority">Advanced Core · supported</option><option value="core-unrestricted-authority">Unrestricted Core · hidden supers + sudden death</option><option value="first-contact-trigger-closure">Complete First Contact</option></select></label>
    <div class="inline-fields"><label>Seat 1<select id="exp-p1">${policyOptions('score-rush')}</select></label><label>Seat 2<select id="exp-p2">${policyOptions('control')}</select></label></div>
    <div class="inline-fields"><label>Matches<input id="exp-count" type="number" min="1" max="10000" value="100"></label><label>Workers<select id="exp-workers"><option>1</option><option selected>2</option><option>4</option></select></label></div>
    <label>Seed strategy<select id="exp-seed"><option value="ordinal-hash">Experiment hash + ordinal</option><option value="fixed">Fixed seed</option></select></label>
    <label class="exp-toggle"><span class="exp-toggle-text">Deep decision tracing<button type="button" class="info-dot tooltip-wide" data-tooltip="Re-ranks all legal actions at every decision and keeps a trace per decision — heavy compute and memory. Use for small evidence runs needing decision-level detail, not large campaigns. Telemetry is hash-excluded: results stay deterministic." aria-label="About deep decision tracing">ⓘ</button></span><input id="exp-deep-trace" type="checkbox" class="exp-switch" role="switch"></label>
    <div class="preflight" id="preflight"><b>Preflight:</b> 25 ordered pairings · matched AB/BA seat-swap · paired McNemar + bootstrap · deterministic telemetry v4.1 · unsupported systems fail closed.</div>
    <div class="rail-actions"><button id="run-experiment" type="button" class="primary-button">Run experiment</button><button id="cancel-experiment" type="button" class="secondary-button" disabled>Cancel</button><button id="reset-experiment" type="button" class="ghost-button" title="Restore the bundled certified baseline as the working dataset — does not delete stored runs">Baseline</button></div>
    <output id="experiment-status" class="footer-note" aria-live="polite" data-state="idle">Ready.</output>
    <div id="campaign-progress" class="campaign-progress" role="progressbar" aria-label="Experiment progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><div class="campaign-progress-bar"><div class="campaign-progress-bar-fill" style="width:0%"></div></div><output class="campaign-progress-pct">0%</output></div>
    <div id="campaign-summary" class="campaign-summary"></div>
    <div id="exp-runs" hidden></div>
  </div>`;
  renderEvidenceStrip();
  syncRunButtonLabel();
  document.querySelector('#run-experiment').addEventListener('click', runBrowserCampaign);
  document.querySelector('#cancel-experiment').addEventListener('click', cancelBrowserCampaign);
  document.querySelector('#reset-experiment').addEventListener('click', resetCampaignResults);
  for (const id of ['exp-preset', 'exp-profile', 'exp-p1', 'exp-p2', 'exp-count', 'exp-workers', 'exp-seed', 'exp-deep-trace'])
    document.querySelector(`#${id}`).addEventListener('change', updatePreflight);
}

export function updatePreflight() {
  const n = Number(document.querySelector('#exp-count').value);
  const w = Number(document.querySelector('#exp-workers').value);
  const _p = document.querySelector('#exp-profile').value;
  const seed = document.querySelector('#exp-seed').value;
  const p1 = document.querySelector('#exp-p1').value;
  const p2 = document.querySelector('#exp-p2').value;
  const preset = document.querySelector('#exp-preset')?.value ?? '';
  const deepTrace = document.querySelector('#exp-deep-trace')?.checked === true;
  const scope = p1 === p2 ? 'self-play focused pair' : 'focused pair';
  const valid = Number.isInteger(n) && n >= 1 && n <= 10000;
  const runBtn = document.querySelector('#run-experiment');
  if (!valid) {
    runBtn.disabled = true;
    document.querySelector('#preflight').innerHTML = `<b class="danger">Rejected:</b> match count ${esc(String(n))} is outside permitted range 1–10000. Adjust before running.`;
    return;
  }
  runBtn.disabled = false;
  const seatDesign = p1 === p2 ? 'self-play' : 'matched AB/BA seat-swap';
  const presetLabel = preset ? `preset ${esc(preset)} · ` : '';
  document.querySelector('#preflight').innerHTML = `<b>Preflight:</b> ${presetLabel}${esc(scope)} · ${esc(p1)} vs ${esc(p2)} · ${fmt(n)} matches · ${w} browser worker${w === 1 ? '' : 's'} · ${esc(seed === 'ordinal-hash' ? 'ordinal-hash seed' : 'fixed seed')} · ${esc(seatDesign)} · paired McNemar + bootstrap · semantic telemetry v4.1${deepTrace ? ' · deep decision tracing (per-decision traces + candidate scores)' : ''} · evidence epoch: post-rules-parity-repair · unsupported systems fail closed.`;
}

/** Open the Experiment dialog directly on the Manage Runs surface —
 * used by the Evolution ledger bridge and command palette. */
export function openManageRuns() {
  const expDialog = document.querySelector('#experiment-dialog');
  if (expDialog && !expDialog.open) {
    populateDialogHeading('experiment-dialog', 'EXPERIMENT', 'Run configuration');
    if (typeof expDialog.showModal === 'function') expDialog.showModal();
    else expDialog.setAttribute('open', '');
  }
  openRunsPanel();
}

// ── Global bindings ───────────────────────────────────────────────
export function syncRailToggle() {
  const btn = document.querySelector('#rail-toggle');
  if (!btn) return;
  const collapsed = state.layout === 'theatre';
  btn.setAttribute('aria-expanded', String(!collapsed));
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

export function bindGlobal() {
  // app.js owns route changes. Importing its entry point here creates a
  // second ESM entry graph and discards in-memory developer sessions.
  initAnalysisExportHub();
  document.querySelector('#rail-toggle').addEventListener('click', () => {
    state.layout = state.layout === 'theatre' ? 'observatory' : 'theatre';
    document.querySelector('.observatory-shell').dataset.preset = state.layout;
    persistSetting('layout', state.layout);
    syncRailToggle();
    rerender();
  });
  const palette = document.querySelector('#command-palette');
  const openCommandPalette = () => {
    populateDialogHeading('command-palette', 'QUICK NAVIGATION', 'Command palette');
    palette.showModal();
    renderCommandResults();
    setTimeout(() => document.querySelector('#command-search').focus(), 0);
  };
  document.querySelector('#command-palette-button').addEventListener('click', openCommandPalette);
  document.querySelector('#command-search').addEventListener('input', renderCommandResults);
  // Keyboard navigation for command palette results
  palette.addEventListener('keydown', (e) => {
    const root = document.querySelector('#command-results');
    if (root._keyHandler) root._keyHandler(e);
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
    // "/" focuses the workspace nav search (when not already in an input)
    if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) {
      const navSearch = document.querySelector('#nav-search');
      if (navSearch) { e.preventDefault(); navSearch.focus(); }
    }
    if (e.key === ' ' && route() === '/watch' && !['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      // No replay loaded → do not even invoke the action. togglePlay() also
      // guards internally; this is the controller-layer defense.
      if (state.replay?.frames?.length) invokeAppAction('togglePlay');
    }
    // Forensic transport keys on Watch: ←/→ semantic frame step,
    // Home/End jump to record bounds. Deliberately excludes INPUT/SELECT
    // so slider and speed-control keep their native key behavior.
    if (route() === '/watch' && state.replay?.frames?.length
        && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        invokeAppAction('stepBy', e.key === 'ArrowRight' ? 1 : -1);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        invokeAppAction('stepTo', e.key === 'End' ? state.replay.frames.length - 1 : 0);
      }
    }
  });
  // Experiment panel lives in a dialog — the header button opens it and
  // mirrors live campaign status so progress stays visible when closed.
  const expDialog = document.querySelector('#experiment-dialog');
  const expBtn = document.querySelector('#experiment-button');
  if (expDialog && expBtn) {
    expBtn.addEventListener('click', () => {
      populateDialogHeading('experiment-dialog', 'EXPERIMENT', 'Run configuration');
      if (typeof expDialog.showModal === 'function') expDialog.showModal();
      else expDialog.setAttribute('open', '');
    });
    document.querySelector('#experiment-close')?.addEventListener('click', () => expDialog.close());
    const badge = document.querySelector('#experiment-badge');
    const syncBadge = () => {
      const t = document.querySelector('#experiment-status')?.textContent ?? '';
      const busy = /running|progress:/i.test(t);
      if (badge) { badge.hidden = !busy; badge.textContent = busy ? t.replace(/^Progress:\s*/i, '').slice(0, 40) : ''; }
      expBtn.classList.toggle('running', busy);
    };
    const host = document.querySelector('#experiment-controls');
    if (host) new MutationObserver(syncBadge).observe(host, { subtree: true, characterData: true, childList: true });
  }
}

function renderCommandResults() {
  const q = document.querySelector('#command-search').value.toLowerCase();
  const commands = [
    // WORKSPACE_KEYWORDS lets analysts find instruments by the question
    // they ask ("counterfactual", "why did it choose this", "best cards")
    // rather than only by technical workspace name.
    ...WORKSPACES.map(([r, , label, sub]) => ({ label: `Open ${label}`, detail: sub, keywords: WORKSPACE_KEYWORDS[r] ?? '', run: () => { location.hash = `#${r}`; } })),
    { label: 'Toggle reduced motion', detail: 'Accessibility', run: () => { state.reducedMotion = !state.reducedMotion; document.body.classList.toggle('reduced-motion', state.reducedMotion); persistSetting('reducedMotion', state.reducedMotion); } },
    { label: 'Toggle reduced sensory', detail: 'Accessibility', run: () => { state.reducedSensory = !state.reducedSensory; document.body.classList.toggle('reduced-sensory', state.reducedSensory); persistSetting('reducedSensory', state.reducedSensory); } },
    { label: 'Toggle FX', detail: 'Presentation', run: () => { state.fx = !state.fx; document.body.classList.toggle('fx-off', !state.fx); persistSetting('fx', state.fx); } },
    { label: 'Show priority orchestration', detail: 'Developer evidence', run: () => { state.showOrchestration = !state.showOrchestration; if (state.showOrchestration) state.watchTimelineMode = 'all'; persistSetting('watchTimelineMode', state.watchTimelineMode); rerender(); } },
    { label: 'Restart replay', detail: 'Identical seed / source replay', run: () => { invokeAppAction('stop'); state.frame = 0; rerender(); } },
    { label: 'Export Analysis Dossier (JSON)', detail: 'AI research-state export · downloads file', run: () => { invokeAppAction('exportAnalysisDossier', 'json'); } },
    { label: 'Export Analysis Dossier (Markdown)', detail: 'AI research-state export · downloads file', run: () => { invokeAppAction('exportAnalysisDossier', 'markdown'); } },
    { label: 'Export Analysis Dossier (JSON + Markdown)', detail: 'AI research-state export · downloads both files', run: () => { invokeAppAction('exportAnalysisDossier', 'both'); } },
    { label: 'Export Research Package', detail: 'Manifest + dossier + all durable run artifacts · downloads file', run: () => { invokeAppAction('exportResearchPackage'); } },
    { label: 'Manage Experiment Runs', detail: 'Manage runs · include/exclude · verify · export artifacts', run: () => { openManageRuns(); } },
    { label: 'Extract analysis (JSON)', detail: 'Analysis dossier · copy to clipboard (legacy)', run: () => { invokeAppAction('showExtract', 'json'); } },
    { label: 'Extract analysis (Markdown)', detail: 'Analysis dossier · copy to clipboard (legacy)', run: () => { invokeAppAction('showExtract', 'markdown'); } }
  ].filter(item => !q || `${item.label} ${item.detail} ${item.keywords ?? ''}`.toLowerCase().includes(q));
  const root = document.querySelector('#command-results');
  root.innerHTML = commands.map((item, i) => `<button type="button" class="command-result" data-command="${i}" role="option"><span>${esc(item.label)}</span><small>${esc(item.detail)}</small></button>`).join('') || '<div class="empty-state"><strong>No command found</strong>Try a workspace or accessibility setting.</div>';
  const cmdButtons = root.querySelectorAll('[data-command]');
  cmdButtons.forEach(button => button.addEventListener('click', () => { commands[Number(button.dataset.command)].run(); document.querySelector('#command-palette').close(); }));
  // Keyboard navigation: arrow up/down to move active, Enter to select
  let activeIndex = -1;
  const setActive = (idx) => {
    activeIndex = (idx + cmdButtons.length) % cmdButtons.length;
    cmdButtons.forEach((b, i) => b.classList.toggle('active', i === activeIndex));
    cmdButtons[activeIndex]?.focus();
  };
  root._keyHandler = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex < 0 ? 0 : activeIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex < 0 ? cmdButtons.length - 1 : activeIndex - 1); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); cmdButtons[activeIndex]?.click(); }
  };
  cmdButtons.forEach((b, i) => { b.addEventListener('mouseenter', () => { activeIndex = i; cmdButtons.forEach((bb, ii) => bb.classList.toggle('active', ii === i)); }); });
}

// ── Campaign runner (browser worker-based) ────────────────────────
// Spawns N browser workers and splits the ordinal range across them so matches
// run in true parallel (one worker per segment). Progress is aggregated across
// all workers and reported frequently so the UI never looks frozen.
// Semantic campaign state — the machine-readable contract for tests and CI.
// textContent stays free-form presentation; data-state is the stable signal:
// idle → running → complete | failed | cancelled → idle.
function setCampaignState(value) {
  const el = document.querySelector('#experiment-status');
  if (el) el.dataset.state = value;
}

// Durability batch size: each segment flushes this many match summaries to
// the evidence store (batch record + manifest checkpoint, one transaction)
// before continuing. Bounds the volatile working set to ~this many payloads
// per worker regardless of run size.
const RUN_BATCH_SIZE = 50;

async function runBrowserCampaign() {
  const status = document.querySelector('#experiment-status');
  setCampaignState('running');
  const profile = document.querySelector('#exp-profile').value;
  const p1 = document.querySelector('#exp-p1').value;
  const p2 = document.querySelector('#exp-p2').value;
  const count = Number(document.querySelector('#exp-count').value);
  const workers = Math.max(1, Number(document.querySelector('#exp-workers').value));
  const seedSel = document.querySelector('#exp-seed');
  const seedStrategy = seedSel ? seedSel.value : 'ordinal-hash';
  const strategicTrace = document.querySelector('#exp-deep-trace')?.checked === true;
  // Ordinals continue where prior runs stopped so a new run observes fresh
  // seeds (and continues AB/BA pairing) instead of re-observing identical
  // games — evidence accumulation, not duplication.
  const ordinalBase = nextRunOrdinalStart();
  const runConfig = {
    presetId: document.querySelector('#exp-preset')?.value || null,
    profileId: profile, policyIds: [p1, p2], matchCount: count, workers,
    seedStrategy, ordinalStart: ordinalBase, ordinalEnd: ordinalBase + count, ordinalBase, strategicTrace,
  };
  state.pendingRunConfig = runConfig;
  document.querySelector('#run-experiment').disabled = true;
  document.querySelector('#cancel-experiment').disabled = false;

  // The durable path requires the evidence store: a run that cannot
  // checkpoint must never pretend to be durable.
  if (!experimentsReady()) {
    setCampaignState('failed');
    status.textContent = 'Evidence store unavailable — a durable run cannot start. Reload to retry.';
    document.querySelector('#run-experiment').disabled = false;
    document.querySelector('#cancel-experiment').disabled = true;
    showToast('Experiment evidence store is unavailable — the run was not started.', { type: 'error', title: 'Durability unavailable' });
    return;
  }

  // Segment layout: relative ordinals for workers, absolute for the manifest.
  const relSegments = splitOrdinals(count, workers).map((s, i) => ({ index: i, ordinalStart: s.start, ordinalEnd: s.end }));
  const absSegments = relSegments.map(s => ({ index: s.index, ordinalStart: ordinalBase + s.ordinalStart, ordinalEnd: ordinalBase + s.ordinalEnd }));
  status.textContent = 'Opening durable run — writing manifest…';
  let begun;
  try {
    begun = await beginExperimentRun({ config: runConfig, segments: absSegments, batchSize: RUN_BATCH_SIZE });
  } catch (error) {
    setCampaignState('failed');
    status.textContent = `Run could not start — manifest persistence failed: ${error?.message ?? error}`;
    document.querySelector('#run-experiment').disabled = false;
    document.querySelector('#cancel-experiment').disabled = true;
    showToast('The run manifest could not be persisted — no simulation started.', { type: 'error', title: 'Durability unavailable' });
    return;
  }
  status.textContent = `Running ${count} matches with ${workers} worker(s)…`;
  await _driveRunSegments({
    runId: begun.runId,
    config: runConfig,
    batchSize: RUN_BATCH_SIZE,
    requestedMatches: count,
    committedMatches: 0,
    segments: relSegments,
  });
}

/**
 * Shared execution driver for fresh runs and resumes. Spawns one worker per
 * remaining segment range; every emitted batch is committed transactionally
 * (batch record + manifest checkpoint) through a serialized queue so the
 * manifest's committedMatches can never run ahead of durable evidence.
 */
async function _driveRunSegments(plan) {
  const status = document.querySelector('#experiment-status');
  const count = plan.requestedMatches ?? plan.config?.matchCount ?? 0;
  const priorCommitted = plan.committedMatches ?? 0;
  const segs = plan.segments;
  const startedAt = performance.now();
  const segmentDone = segs.map(() => 0);
  const segmentTotal = segs.map(s => s.ordinalEnd - s.ordinalStart);
  let completedSegments = 0, failedSegment = null, finalized = false;
  let committed = priorCommitted;
  const spawned = [];
  state.campaignWorkers = spawned;
  state.campaignWorker = null;
  state.activeRunManifest = plan.runId;

  const commitQueue = { chain: Promise.resolve(), error: null };
  const reportProgress = () => {
    const done = priorCommitted + segmentDone.reduce((a, b) => a + b, 0);
    // Simulated vs durably committed are distinct numbers — always.
    status.textContent = `Progress: ${done}/${count} simulated · ${committed} saved`;
    updateCampaignProgress(done, Math.max(count, 1));
  };
  const enqueueCommit = msg => {
    commitQueue.chain = commitQueue.chain.then(async () => {
      const summaries = JSON.parse(msg.summariesJson ?? '[]');
      const res = await commitExperimentBatch(plan.runId, {
        segmentIndex: msg.workerIndex ?? 0,
        ordinalStart: msg.ordinalStart,
        ordinalEnd: msg.ordinalEnd,
        summaries,
      });
      committed = res.committedMatches;
      reportProgress();
    }).catch(error => { if (!commitQueue.error) commitQueue.error = error; });
  };
  const finishRun = async () => {
    if (finalized || completedSegments < segs.length) return;
    finalized = true;
    for (const w of spawned) { try { w.terminate(); } catch { /* already terminated */ } }
    state.campaignWorker = null;
    state.campaignWorkers = [];
    state.activeRunManifest = null;
    // Flush pending commits — the seal only counts durably committed work.
    await commitQueue.chain;
    document.querySelector('#run-experiment').disabled = false;
    document.querySelector('#cancel-experiment').disabled = true;
    const bar = document.querySelector('#campaign-progress');
    if (bar) bar.hidden = true;
    if (commitQueue.error) {
      // Persistence failure: stop honestly — committed batches are retained,
      // the run is resumable/sealable from Manage Runs.
      await failExperimentRun(plan.runId, commitQueue.error?.message ?? commitQueue.error);
      setCampaignState('failed');
      status.textContent = `Persistence failed — ${committed} of ${count} matches durably committed. Resume or seal partial evidence from Manage Runs.`;
      showToast(`Persistence failed at ${committed}/${count} — committed evidence is retained; the run is resumable from Manage Runs.`, { type: 'error', title: 'Run paused (persistence)' });
      refreshRunsUi();
      updateRailContext();
      rerender();
      return;
    }
    if (failedSegment) {
      await failExperimentRun(plan.runId, failedSegment);
      setCampaignState('failed');
      status.textContent = `Failed: ${failedSegment} — ${committed} of ${count} matches committed. Resume or seal from Manage Runs.`;
      showToast(failedSegment, { type: 'error', title: 'Run failed' });
      refreshRunsUi();
      updateRailContext();
      rerender();
      return;
    }
    try {
      const rec = await finalizeExperimentRun(plan.runId, { durationMs: Math.round(performance.now() - startedAt) });
      const run = rec?.run;
      const mechCount = state.observatory?.mechanics?.length ?? 0;
      const synCount = state.observatory?.synergies?.length ?? 0;
      const basis = state.evidenceBasis;
      const evidenceNote = basis && !basis.fallback
        ? ` · evidence: ${fmt(basis.includedGames)} games from ${basis.includedRunCount} run${basis.includedRunCount === 1 ? '' : 's'}`
        : '';
      const runLabel = run ? `Run #${String(run.ordinal).padStart(3, '0')} · ` : '';
      setCampaignState('complete');
      status.textContent = `${runLabel}${run?.metrics?.matchCount ?? committed} matches committed, ${run?.metrics?.abortCount ?? 0} aborts · ${mechCount} mechanics, ${synCount} synergies${evidenceNote} · persisted`;
      showToast(`${run?.metrics?.matchCount ?? committed} matches durably committed${evidenceNote}`, { type: 'success', title: run ? `Run #${String(run.ordinal).padStart(3, '0')} complete` : 'Run complete' });
      if (rec?.included === false && run) {
        showToast(`Run #${String(run.ordinal).padStart(3, '0')} recorded but auto-excluded — it differs materially from the current baseline. Inspect it under Manage Runs.`, { type: 'warning', title: 'Incompatible run' });
      }
      renderCampaignSummary({ ok: true, result: { matchCount: run?.metrics?.matchCount ?? committed, abortCount: run?.metrics?.abortCount ?? 0, durationMs: run?.metrics?.durationMs ?? 0, canonicalResultHash: run?.provenance?.canonicalResultHash ?? null } });
      state.lastCampaignResult = null;
      state.pendingRunConfig = null;
    } catch (error) {
      await failExperimentRun(plan.runId, error?.message ?? error);
      setCampaignState('failed');
      status.textContent = `Seal failed: ${error?.message ?? error} — ${committed} of ${count} matches committed. Resume or seal from Manage Runs.`;
      showToast(error?.message ?? 'Run seal failed', { type: 'error', title: 'Run seal failed' });
    }
    refreshRunsUi();
    updateRailContext();
    rerender();
  };

  segs.forEach((seg, i) => {
    const worker = new Worker('worker.js', { type: 'module' });
    spawned.push(worker);
    worker.onmessage = e => {
      const x = e.data;
      if (x.type === 'autonomy-campaign-progress') {
        const p = x.progress ?? {};
        segmentDone[i] = p.completed ?? segmentDone[i];
        reportProgress();
      } else if (x.type === 'autonomy-campaign-batch') {
        enqueueCommit(x);
      } else if (x.type === 'autonomy-segment-result' || x.type === 'autonomy-campaign-result') {
        if (x.ok !== true && !failedSegment) failedSegment = x.error ?? `Worker ${i} failed`;
        completedSegments += 1;
        segmentDone[i] = segmentTotal[i];
        reportProgress();
        finishRun();
      }
    };
    worker.onerror = e => {
      if (!failedSegment) failedSegment = e.message ?? `Worker ${i} error`;
      completedSegments += 1;
      segmentDone[i] = segmentTotal[i];
      reportProgress();
      finishRun();
    };
    worker.postMessage({
      type: 'run-autonomy-segment',
      workerIndex: seg.index,
      config: { matchCount: count, policyIds: plan.config.policyIds, profileId: plan.config.profileId, seedStrategy: plan.config.seedStrategy, ordinalStart: seg.ordinalStart, ordinalEnd: seg.ordinalEnd, ordinalBase: plan.config.ordinalBase ?? plan.config.ordinalStart ?? 0, strategicTrace: plan.config.strategicTrace === true, batchSize: plan.batchSize || RUN_BATCH_SIZE },
    });
  });
  reportProgress();
}

// Drives the campaign progress bar: fill width, percentage readout, and the
// progressbar aria-valuenow so assistive tech hears the same fraction.
function updateCampaignProgress(done, total) {
  const bar = document.querySelector('#campaign-progress');
  if (!bar) return;
  const pctDone = Math.round((done / Math.max(1, total)) * 100);
  bar.hidden = false;
  bar.setAttribute('aria-valuenow', String(pctDone));
  const fill = bar.querySelector('.campaign-progress-bar-fill');
  if (fill) fill.style.width = `${pctDone}%`;
  const pctLabel = bar.querySelector('.campaign-progress-pct');
  if (pctLabel) pctLabel.textContent = `${pctDone}%`;
}

// Split `count` ordinals into `workers` contiguous, near-equal segments.
// Each segment is {start, end, size} with start inclusive and end exclusive.
function splitOrdinals(count, workers) {
  const n = Math.max(1, Math.floor(count));
  const w = Math.max(1, Math.min(workers, n));
  const base = Math.floor(n / w);
  const rem = n % w;
  const segments = [];
  let cursor = 0;
  for (let i = 0; i < w; i += 1) {
    const size = base + (i < rem ? 1 : 0);
    segments.push({ start: cursor, end: cursor + size, size });
    cursor += size;
  }
  return segments;
}

// Sync the primary action label: 'Run experiment' before any evidence,
// 'Run more games' once runs exist — the action appends to the investigation,
// it never replaces it.
function syncRunButtonLabel() {
  const btn = document.querySelector('#run-experiment');
  if (!btn) return;
  const basis = state.evidenceBasis;
  const hasRuns = basis && basis.totalRuns > 1; // bundled corpus doesn't count
  btn.textContent = hasRuns ? 'Run more games' : 'Run experiment';
}

function refreshRunsUi() {
  renderEvidenceStrip();
  renderRunsPanel();
  syncRunButtonLabel();
}

function cancelBrowserCampaign() {
  if (state.campaignWorker) {
    try { state.campaignWorker.terminate(); } catch { /* already terminated */ }
    state.campaignWorker = null;
  }
  for (const w of state.campaignWorkers ?? []) { try { w.terminate(); } catch { /* already terminated */ } }
  state.campaignWorkers = [];
  if (experimentsReady() && state.activeRunManifest) {
    // Committed batches stay durable — the manifest becomes a resumable
    // cancelled run instead of a deleted one.
    cancelExperimentRun(state.activeRunManifest).catch(() => {});
  }
  state.activeRunManifest = null;
  state.pendingRunConfig = null;
  setCampaignState('cancelled');
  document.querySelector('#experiment-status').textContent = 'Cancelled — committed batches are retained and resumable from Manage Runs.';
  const bar = document.querySelector('#campaign-progress');
  if (bar) bar.hidden = true;
  document.querySelector('#run-experiment').disabled = false;
  document.querySelector('#cancel-experiment').disabled = true;
  refreshRunsUi();
}

// Resume entry point used by Manage Runs: the controller hands back a
// segment plan and this driver re-executes only the remaining ordinals.
registerRunExecutor(plan => _driveRunSegments(plan));

function resetCampaignResults() {
  state.lastCampaignResult = null;
  // The Baseline action restores the bundled certified corpus as the working
  // dataset by clearing the analysis selection — stored runs are excluded
  // with a recorded reason, never deleted.
  if (experimentsReady()) {
    restoreBaseline().catch(err => console.warn('[experiments] baseline restore failed:', err));
  } else {
    state.observatory = state.bootState?.observatory ? structuredClone(state.bootState.observatory) : state.observatory;
    state.aggregate = state.bootState?.aggregate ? structuredClone(state.bootState.aggregate) : state.aggregate;
    // Re-sync derived fields that some workspaces read directly. Without this,
    // the Ranks workspace would still show the last campaign's rankPower/
    // swapMatrix/variantAnalytics after a reset instead of the boot data.
    state.rankPower = state.bootState?.rankPower != null ? structuredClone(state.bootState.rankPower) : state.observatory?.rankPower ?? null;
    state.swapMatrix = state.bootState?.swapMatrix != null ? structuredClone(state.bootState.swapMatrix) : state.observatory?.swapMatrix ?? null;
    state.variantAnalytics = state.bootState?.variantAnalytics != null ? structuredClone(state.bootState.variantAnalytics) : state.observatory?.variantAnalytics ?? state.variantAnalytics;
    updateRailContext();
    rerender();
  }
  document.querySelector('#campaign-summary').innerHTML = '';
  setCampaignState('idle');
  document.querySelector('#experiment-status').textContent = 'Ready.';
  refreshRunsUi();
}

function renderCampaignSummary(result) {
  if (!result || !result.ok) return;
  const r = result.result ?? {};
  const matches = r.matchCount ?? r.matches ?? 0;
  const aborts = r.abortCount ?? r.aborts ?? 0;
  const winRateP1 = r.winRateP1 ?? r.winRates?.P1 ?? null;
  const expHash = r.experimentHash ?? r.canonicalResultHash ?? null;
  document.querySelector('#campaign-summary').innerHTML = `<div class="notice supported"><strong>Campaign complete</strong>
    ${definitionList([
      ['Matches', matches], ['Aborts', aborts], ['Win rate P1', winRateP1 != null ? pct(winRateP1) : '—'],
      ['Experiment hash', short(expHash)], ['Canonical hash', short(r.canonicalResultHash)]
    ])}
  </div>`;
}
