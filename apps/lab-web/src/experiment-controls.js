// ═══════════════════════════════════════════════════════════════
// experiment-controls.js — Experiment panel, campaign runner, global bindings
// ═══════════════════════════════════════════════════════════════

import { state, esc, fmt, pct, short, definitionList, showToast, persistSetting } from './state.js';
import { WORKSPACES, WORKSPACE_KEYWORDS, route, policyOptions, updateRailContext } from './router.js';
import { RULES_VERSION, LAB_VERSION } from './version.js';
import { populateDialogHeading } from './seo-metadata.js';
import { rerender, invokeAppAction } from './rerender.js';
import { experimentsReady, nextRunOrdinalStart, recordCampaignRun, recordFailedRun, recordCancelledRun, applySelection, restoreBaseline } from './experiments/experiment-controller.mjs';
import { renderEvidenceStrip, renderRunsPanel } from './experiments/runs-panel.js';
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
    <label>Deep decision tracing <button type="button" class="info-dot tooltip-wide" data-tooltip="Re-ranks all legal actions at every decision and keeps a trace per decision — heavy compute and memory. Use for small evidence runs needing decision-level detail, not large campaigns. Telemetry is hash-excluded: results stay deterministic." aria-label="About deep decision tracing">ⓘ</button><input id="exp-deep-trace" type="checkbox"></label>
    <div class="preflight" id="preflight"><b>Preflight:</b> 25 ordered pairings · matched AB/BA seat-swap · paired McNemar + bootstrap · deterministic telemetry v4.1 · unsupported systems fail closed.</div>
    <div class="rail-actions"><button id="run-experiment" type="button" class="primary-button">Run experiment</button><button id="cancel-experiment" type="button" class="secondary-button" disabled>Cancel</button><button id="reset-experiment" type="button" class="ghost-button" title="Restore the bundled certified baseline as the working dataset — does not delete stored runs">Baseline</button></div>
    <output id="experiment-status" class="footer-note" aria-live="polite">Ready.</output>
    <div id="campaign-progress" class="campaign-progress-bar" hidden><div class="campaign-progress-bar-fill" style="width:0%"></div></div>
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
    { label: 'Show priority orchestration', detail: 'Developer evidence', run: () => { state.showOrchestration = !state.showOrchestration; rerender(); } },
    { label: 'Restart replay', detail: 'Identical seed / source replay', run: () => { invokeAppAction('stop'); state.frame = 0; rerender(); } },
    { label: 'Export Analysis Dossier (JSON)', detail: 'AI research-state export · downloads file', run: () => { invokeAppAction('exportAnalysisDossier', 'json'); } },
    { label: 'Export Analysis Dossier (Markdown)', detail: 'AI research-state export · downloads file', run: () => { invokeAppAction('exportAnalysisDossier', 'markdown'); } },
    { label: 'Export Analysis Dossier (JSON + Markdown)', detail: 'AI research-state export · downloads both files', run: () => { invokeAppAction('exportAnalysisDossier', 'both'); } },
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
async function runBrowserCampaign() {
  const status = document.querySelector('#experiment-status');
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
    seedStrategy, ordinalBase, strategicTrace,
  };
  state.pendingRunConfig = runConfig;
  status.textContent = `Running ${count} matches with ${workers} worker(s)…`;
  document.querySelector('#run-experiment').disabled = true;
  document.querySelector('#cancel-experiment').disabled = false;

  // Single-worker path: keep the original in-worker aggregation (returns a
  // fully-built campaign result incl. aggregate + observatory JSON).
  if (workers === 1) {
    const worker = new Worker('worker.js', { type: 'module' });
    state.campaignWorker = worker;
    state.campaignWorkers = [worker];
    worker.onmessage = async e => {
      const x = e.data;
      if (x.type === 'autonomy-campaign-progress') {
        const p = x.progress ?? {};
        const done = p.completed ?? 0, total = p.total ?? count;
        status.textContent = `Progress: ${done}/${total} matches (1 worker)`;
        const bar = document.querySelector('#campaign-progress');
        const fill = bar?.querySelector('.campaign-progress-bar-fill');
        if (bar && fill) { bar.hidden = false; fill.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`; }
      } else if (x.type === 'autonomy-campaign-result') {
        worker.terminate();
        state.campaignWorker = null;
        state.campaignWorkers = [];
        await finalizeCampaignResult(x, count, 1, runConfig);
      }
    };
    worker.onerror = e => {
      worker.terminate();
      state.campaignWorker = null;
      state.campaignWorkers = [];
      recordFailedRun({ config: runConfig, error: e.message }).catch(() => {});
      status.textContent = `Worker error: ${e.message}`;
      document.querySelector('#run-experiment').disabled = false;
      document.querySelector('#cancel-experiment').disabled = true;
      showToast(e.message ?? 'Worker error', { type: 'error', title: 'Worker error' });
    };
    worker.postMessage({ type: 'run-autonomy-campaign', config: { matchCount: count, policyIds: [p1, p2], profileId: profile, seedStrategy, workerCount: workers, ordinalBase, strategicTrace } });
    return;
  }

  // Multi-worker path: split the ordinal range into `workers` contiguous
  // segments and dispatch `run-autonomy-segment` to each. Each segment runs
  // `runBrowserCampaign` over its [ordinalStart, ordinalEnd) slice, preserving
  // the absolute-ordinal AB/BA seat-swap design. Summaries are reassembled in
  // ordinal order on the main thread, then the campaign core + aggregate +
  // observatory are built here.
  const segments = splitOrdinals(count, workers);
  const startedAt = performance.now();
  const segmentSummaries = new Array(segments.length).fill(null);
  const segmentDone = new Array(segments.length).fill(0);
  const segmentTotal = segments.map(s => s.size);
  let completedSegments = 0, failedSegment = null, finalized = false;
  const totalTotal = segmentTotal.reduce((a, b) => a + b, 0);
  const spawned = [];
  state.campaignWorkers = spawned;
  state.campaignWorker = null; // multi-worker: tracked via campaignWorkers

  const reportAggregateProgress = () => {
    const done = segmentDone.reduce((a, b) => a + b, 0);
    status.textContent = `Progress: ${done}/${totalTotal} matches (${workers} workers)`;
    const bar = document.querySelector('#campaign-progress');
    const fill = bar?.querySelector('.campaign-progress-bar-fill');
    if (bar && fill) { bar.hidden = false; fill.style.width = `${Math.round((done / Math.max(1, totalTotal)) * 100)}%`; }
  };

  const maybeFinalize = async () => {
    if (finalized || completedSegments < segments.length) return;
    finalized = true;
    // All segments done — terminate workers and assemble the campaign result.
    for (const w of spawned) { try { w.terminate(); } catch { /* already terminated */ } }
    state.campaignWorker = null;
    state.campaignWorkers = [];
    if (failedSegment) {
      await finalizeCampaignResult({ type: 'autonomy-campaign-result', ok: false, error: failedSegment }, count, workers, runConfig);
      return;
    }
    // Concatenate segment summaries in ordinal order (segments are contiguous
    // and assigned in order, so index order == ordinal order).
    const summaries = [];
    for (let i = 0; i < segmentSummaries.length; i += 1) {
      const seg = segmentSummaries[i];
      if (Array.isArray(seg)) summaries.push(...seg);
    }
    try {
      const { buildCampaignCore } = await import('./autonomy-runtime.js');
      const { campaignAggregate, buildObservatoryAnalytics } = await import('./browser-analytics.js');
      const core = buildCampaignCore(summaries, { profileId: profile, policyIds: [p1, p2], matchCount: count });
      const semantic = { experimentHash: core.canonicalResultHash, profileId: core.profileId, engineVersion: core.engineVersion, rulesVersion: RULES_VERSION, labVersion: LAB_VERSION, canonicalResultHash: core.canonicalResultHash };
      const aggregate = campaignAggregate(summaries, semantic);
      const observatory = buildObservatoryAnalytics({ summaries, aggregate });
      const result = { ...core, durationMs: Math.round(performance.now() - startedAt) };
      const x = { type: 'autonomy-campaign-result', ok: true, result, aggregateJson: JSON.stringify(aggregate), observatoryJson: JSON.stringify(observatory), summariesJson: JSON.stringify(summaries) };
      await finalizeCampaignResult(x, count, workers, runConfig);
    } catch (err) {
      await finalizeCampaignResult({ type: 'autonomy-campaign-result', ok: false, error: err?.stack ?? String(err) }, count, workers, runConfig);
    }
  };

  segments.forEach((seg, i) => {
    const worker = new Worker('worker.js', { type: 'module' });
    spawned.push(worker);
    worker.onmessage = e => {
      const x = e.data;
      if (x.type === 'autonomy-campaign-progress') {
        const p = x.progress ?? {};
        segmentDone[i] = p.completed ?? segmentDone[i];
        reportAggregateProgress();
      } else if (x.type === 'autonomy-segment-result') {
        if (x.ok) {
          try { segmentSummaries[i] = JSON.parse(x.summariesJson ?? '[]'); }
          catch { segmentSummaries[i] = []; }
        } else if (!failedSegment) {
          failedSegment = x.error ?? `Worker ${i} failed`;
        }
        completedSegments += 1;
        segmentDone[i] = segmentTotal[i];
        reportAggregateProgress();
        maybeFinalize();
      }
    };
    worker.onerror = e => {
      if (!failedSegment) failedSegment = e.message ?? `Worker ${i} error`;
      if (segmentSummaries[i] === null) { segmentSummaries[i] = []; completedSegments += 1; }
      reportAggregateProgress();
      maybeFinalize();
    };
    worker.postMessage({
      type: 'run-autonomy-segment',
      workerIndex: i,
      config: { matchCount: count, policyIds: [p1, p2], profileId: profile, seedStrategy, ordinalStart: seg.start, ordinalEnd: seg.end, ordinalBase, strategicTrace },
    });
  });
  reportAggregateProgress();
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

// Shared finalization for both single- and multi-worker paths: updates state,
// records the immutable Run, recomputes the active Analysis Set, renders the
// campaign summary, and re-renders the current workspace.
async function finalizeCampaignResult(x, count, _workers, runConfig = null) {
  state.lastCampaignResult = x;
  state.pendingRunConfig = null;
  document.querySelector('#run-experiment').disabled = false;
  document.querySelector('#cancel-experiment').disabled = true;
  const bar = document.querySelector('#campaign-progress');
  if (bar) bar.hidden = true;
  const status = document.querySelector('#experiment-status');
  if (x.ok) {
    const r = x.result ?? {};
    let summaries = [];
    try { summaries = JSON.parse(x.summariesJson ?? '[]'); } catch { summaries = []; }
    // Update state with campaign-derived data so workspaces reflect the new campaign
    try {
      if (summaries.length) {
        state.observatory = state.observatory ?? {};
        state.observatory.summaries = summaries;
        state.aggregate = x.aggregateJson ? JSON.parse(x.aggregateJson) : state.aggregate;
        if (x.observatoryJson) {
          const obs = JSON.parse(x.observatoryJson);
          // Tag the origin immediately — a campaign dataset is experiment
          // output even when the evidence store is unavailable, and the
          // dossier must never mislabel it as the certified corpus.
          state.observatory = { ...obs, summaries, datasetOrigin: 'EXPERIMENT_RUNS' };
        }
        // Fallback: if the worker's observatory arrived with 0 mechanics (e.g.
        // stale cached worker module), rebuild observatory analytics on the
        // main thread from the campaign summaries so Mechanics/Synergies propagate.
        if (!state.observatory.mechanics?.length && summaries.length > 0) {
          console.warn('[campaign] Worker observatory has 0 mechanics — rebuilding on main thread from', summaries.length, 'summaries');
          try {
            const { buildObservatoryAnalytics, campaignAggregate } = await import('./browser-analytics.js');
            const semantic = { experimentHash: r.canonicalResultHash, profileId: r.profileId, engineVersion: r.engineVersion, rulesVersion: RULES_VERSION, labVersion: LAB_VERSION, canonicalResultHash: r.canonicalResultHash };
            const fallbackAggregate = x.aggregateJson ? JSON.parse(x.aggregateJson) : campaignAggregate(summaries, semantic);
            const fallbackObs = buildObservatoryAnalytics({ summaries, aggregate: fallbackAggregate });
            state.observatory = { ...fallbackObs, summaries, datasetOrigin: 'EXPERIMENT_RUNS' };
            state.aggregate = fallbackAggregate;
            console.info(`[campaign] Main-thread observatory rebuild: ${fallbackObs.mechanics?.length} mechanics, ${fallbackObs.synergies?.length} synergies`);
          } catch (rebuildErr) { console.error('[campaign] Main-thread observatory rebuild failed:', rebuildErr); }
        }
      }
      // Sync derived state fields that some workspaces read directly rather
      // than via state.observatory. At boot, data-loader.js extracts these
      // from the loaded observatory (lines 114-123). After a campaign run
      // replaces state.observatory, they must be re-synced or the Ranks
      // workspace (rankPower, swapMatrix, variantAnalytics) will show stale
      // boot-time data instead of the freshly computed campaign analytics.
      state.rankPower = state.observatory.rankPower ?? null;
      state.swapMatrix = state.observatory.swapMatrix ?? null;
      state.variantAnalytics = state.observatory.variantAnalytics ?? state.variantAnalytics;
    } catch (err) { console.warn('Failed to update state from campaign result:', err); }
    // Persist the execution as an immutable Run in the experiment store and
    // recompute the analysis set over all included runs. Runs accumulate —
    // a new run never erases prior evidence.
    let rec = null;
    if (experimentsReady() && runConfig) {
      try {
        rec = await recordCampaignRun({
          config: { ...runConfig, ordinalStart: runConfig.ordinalBase, ordinalEnd: runConfig.ordinalBase + count },
          result: r,
          summaries,
          aggregate: state.aggregate,
        });
        const fastPath = {
          aggregate: x.aggregateJson ? JSON.parse(x.aggregateJson) : null,
          observatory: x.observatoryJson ? JSON.parse(x.observatoryJson) : null,
        };
        await applySelection({ fastPath });
        if (rec?.included === false && rec?.run) {
          showToast(`Run #${String(rec.run.ordinal).padStart(3, '0')} recorded but auto-excluded — it differs materially from the current baseline. Inspect it under Manage Runs.`, { type: 'warning', title: 'Incompatible run' });
        } else if (rec?.payloadSessionOnly) {
          showToast('Run recorded — evidence payload retained for this session only (storage limit).', { type: 'warning', title: 'Run recorded' });
        }
      } catch (err) {
        console.warn('[experiments] run record failed:', err);
        showToast('Campaign completed but the run could not be persisted this session.', { type: 'warning', title: 'Evidence persistence' });
      }
    }
    const mechCount = state.observatory?.mechanics?.length ?? 0;
    const synCount = state.observatory?.synergies?.length ?? 0;
    const basis = state.evidenceBasis;
    const evidenceNote = basis && !basis.fallback
      ? ` · evidence: ${fmt(basis.includedGames)} games from ${basis.includedRunCount} run${basis.includedRunCount === 1 ? '' : 's'}`
      : '';
    const runLabel = rec?.run ? `Run #${String(rec.run.ordinal).padStart(3, '0')} · ` : '';
    status.textContent = `${runLabel}${count} matches, ${r.abortCount ?? r.aborts ?? 0} aborts, ${r.durationMs ?? 0}ms · ${mechCount} mechanics, ${synCount} synergies${evidenceNote}`;
    showToast(`${count} matches · ${r.abortCount ?? r.aborts ?? 0} aborts · ${mechCount} mechanics · ${synCount} synergies${evidenceNote}`, { type: 'success', title: rec?.run ? `Run #${String(rec.run.ordinal).padStart(3, '0')} complete` : 'Campaign complete' });
  } else {
    if (experimentsReady() && runConfig) recordFailedRun({ config: runConfig, error: x.error }).catch(() => {});
    status.textContent = `Failed: ${x.error ?? 'unknown error'}`;
    showToast(x.error ?? 'Campaign failed', { type: 'error', title: 'Campaign failed' });
  }
  renderCampaignSummary(x);
  refreshRunsUi();
  updateRailContext();
  // Re-render the current workspace so Mechanics/Synergies/Compare/etc.
  // reflect the freshly updated state.observatory immediately.
  rerender();
}

function cancelBrowserCampaign() {
  if (state.campaignWorker) {
    try { state.campaignWorker.terminate(); } catch { /* already terminated */ }
    state.campaignWorker = null;
  }
  for (const w of state.campaignWorkers ?? []) { try { w.terminate(); } catch { /* already terminated */ } }
  state.campaignWorkers = [];
  if (experimentsReady() && state.pendingRunConfig) {
    recordCancelledRun({ config: state.pendingRunConfig }).catch(() => {});
    state.pendingRunConfig = null;
  }
  document.querySelector('#experiment-status').textContent = 'Cancelled.';
  document.querySelector('#run-experiment').disabled = false;
  document.querySelector('#cancel-experiment').disabled = true;
  refreshRunsUi();
}

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
