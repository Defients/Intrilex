import { BROWSER_CAPACITY, assertBrowserCapacity, browserSizeEstimate } from './evolution/browser-capacity.mjs';
import { campaignExecution } from './evolution/campaign-execution.mjs';
import { persistenceLabel } from './evolution/persistence-state.mjs';
// ═══════════════════════════════════════════════════════════════
// experiment-controls.js — Experiment panel, campaign runner, global bindings
// ═══════════════════════════════════════════════════════════════

import { state, esc, fmt, pct, short, definitionList, showToast, persistSetting } from './state.js';
import { WORKSPACES, WORKSPACE_KEYWORDS, route, policyOptions, updateRailContext } from './router.js';
import { populateDialogHeading } from './seo-metadata.js';
import { rerender, invokeAppAction } from './rerender.js';
import { experimentsReady, storePersisted, nextRunOrdinalStart, beginExperimentRun, commitExperimentBatch, finalizeExperimentRun, failExperimentRun, cancelExperimentRun, registerRunExecutor, restoreBaseline, touchRunLease } from './experiments/experiment-controller.mjs';
import { renderEvidenceStrip, renderRunsPanel, openRunsPanel } from './experiments/runs-panel.js';
import { initAnalysisExportHub } from './analysis-export-hub.mjs';

// ── Experiment panel ──────────────────────────────────────────────
export function renderExperimentControls() {
  document.querySelector('#experiment-controls').innerHTML = `<div class="experiment-grid">
    <div id="exp-evidence" class="exp-evidence-slot"></div>
    <p role="note">Exploratory evidence only. Confirmatory claims are suspended while evidence integrity is repaired.</p>
    <label>Experiment preset<select id="exp-preset"><option value="">Custom (manual config)</option><option value="EXP-01-2B2R-HOLD-FIRE">EXP-01: 2B2R Hold vs Fire</option><option value="EXP-02-BOARD-LOCK-LEAD">EXP-02: Board Lock Lead vs Comeback</option><option value="EXP-03-TEN-HEART-OPPORTUNITY-COST">EXP-03: 10♥ Tempo Opportunity Cost</option><option value="EXP-04-QUEEN-FORTRESS-WINDOW">EXP-04: Queen Fortress Breach Window</option><option value="EXP-05-TOTAL-CLEAR-REBOUND">EXP-05: Total Clear Rebound</option><option value="EXP-06-UNRESTRICTED-BENCHMARK">EXP-06: Unrestricted Seat Balance</option><option value="EXP-07-COUNTER-RETENTION-VALUE">EXP-07: Counter Retention Value</option></select></label>
    <label>Profile<select id="exp-profile"><option value="core-advanced-authority">Advanced Core · supported</option><option value="core-unrestricted-authority">Unrestricted Core · hidden supers + sudden death</option><option value="first-contact-trigger-closure">Complete First Contact</option></select></label>
    <div class="inline-fields"><label>Seat 1<select id="exp-p1">${policyOptions('score-rush')}</select></label><label>Seat 2<select id="exp-p2">${policyOptions('control')}</select></label></div>
    <div class="inline-fields"><label>Matches<input id="exp-count" type="number" min="1" max="100" value="100"></label><label>Workers<select id="exp-workers"><option>1</option><option selected>2</option><option>4</option></select></label></div>
    <label>Seed strategy<select id="exp-seed"><option value="ordinal-hash">Experiment hash + ordinal</option><option value="fixed">Fixed seed</option></select></label>
    <label class="exp-toggle"><span class="exp-toggle-text">Deep decision tracing<button type="button" class="info-dot tooltip-wide" data-tooltip="Re-ranks all legal actions at every decision and keeps a trace per decision — heavy compute and memory. Use for small evidence runs needing decision-level detail, not large campaigns. Telemetry is hash-excluded: results stay deterministic." aria-label="About deep decision tracing">ⓘ</button></span><input id="exp-deep-trace" type="checkbox" class="exp-switch" role="switch"></label>
    <div class="preflight" id="preflight"><b>Preflight:</b> 25 ordered pairings · paired AB/BA design — each policy plays once per physical seat per pair · paired McNemar + bootstrap · deterministic telemetry v4.1 · unsupported systems fail closed.</div>
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
  document.querySelector('#exp-count').addEventListener('input', updatePreflight);
  updatePreflight();
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
  const valid = Number.isInteger(n) && n >= 1 && n <= (deepTrace ? BROWSER_CAPACITY.deepGames : BROWSER_CAPACITY.games);
  const runBtn = document.querySelector('#run-experiment');
  if (!valid) {
    runBtn.disabled = true;
    document.querySelector('#preflight').innerHTML = `<b class="danger">Rejected:</b> match count ${esc(String(n))} is outside the supported browser range 1–${deepTrace ? BROWSER_CAPACITY.deepGames : BROWSER_CAPACITY.games}; larger tiers are restricted. Adjust before running.`;
    return;
  }
  runBtn.disabled = false;
  const seatDesign = p1 === p2 ? 'self-play (excluded from cross-policy inference)' : 'paired AB/BA — each policy occupies each physical seat once per 2-match block';
  const oddNote = n % 2 === 1 && p1 !== p2 ? ` · <b>odd count: last match is an unpaired AB leg</b> (pairing reports it incomplete)` : '';
  const presetLabel = preset ? `preset ${esc(preset)} · ` : '';
  document.querySelector('#preflight').innerHTML = `<b>Preflight:</b> ${presetLabel}${esc(scope)} · ${esc(p1)} vs ${esc(p2)} · ${fmt(n)} matches · ${w} browser worker${w === 1 ? '' : 's'} · ${esc(seed === 'ordinal-hash' ? 'ordinal-hash seed' : 'fixed seed')} · ${esc(seatDesign)}${oddNote} · paired McNemar + bootstrap · semantic telemetry v4.1${deepTrace ? ' · deep decision tracing (per-decision traces + candidate scores)' : ''} · record-size estimate: ~${(browserSizeEstimate({matchCount:n,strategicTrace:deepTrace}).bytes/1000000).toFixed(1)} MB (October 7, 2026 audit workload; varies by policy and tracing, excludes archive overhead; not a storage guarantee) · evidence epoch: post-rules-parity-repair · unsupported systems fail closed.`;
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
    { label: 'Export Research Package', detail: 'Manifest + dossier + every resolvable run artifact · missing evidence is declared in the manifest, never hidden', run: () => { invokeAppAction('exportResearchPackage'); } },
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
const RUN_BATCH_SIZE = 5;

let activeExecution = null, launchEpoch = 0;

async function runBrowserCampaign() {
  const launch = ++launchEpoch;
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
  try { assertBrowserCapacity({matchCount:count,workers,strategicTrace}); } catch(error) { setCampaignState('failed');status.textContent=error.message;return; }
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
  if (!experimentsReady() || !storePersisted()) {
    setCampaignState('failed');
    status.textContent = 'Evidence store unavailable — a durable run cannot start. Reload to retry.';
    document.querySelector('#run-experiment').disabled = false;
    document.querySelector('#cancel-experiment').disabled = true;
    showToast('Experiment evidence store is unavailable — the run was not started.', { type: 'error', title: 'Durability unavailable' });
    return;
  }

  // Segment layout: relative ordinals for workers, absolute for the manifest.
  // `ordinalBase` is only a REQUEST HINT — the store reserves the actual
  // sample range atomically inside allocation and may rebase it past ranges
  // another tab already holds. Workers must be driven by the RETURNED
  // manifest's ranges, never by the preliminary local frontier.
  const relSegments = splitOrdinals(count, workers).map((s, i) => ({ index: i, ordinalStart: s.start, ordinalEnd: s.end }));
  const absSegments = relSegments.map(s => ({ index: s.index, ordinalStart: ordinalBase + s.ordinalStart, ordinalEnd: ordinalBase + s.ordinalEnd }));
  status.textContent = 'Opening durable run — writing manifest…';
  let begun;
  try {
    begun = await beginExperimentRun({ config: runConfig, segments: absSegments, batchSize: RUN_BATCH_SIZE });
  } catch (error) {
    if(launch!==launchEpoch)return;
    setCampaignState('failed');
    status.textContent = `Run could not start — manifest persistence failed: ${error?.message ?? error}`;
    document.querySelector('#run-experiment').disabled = false;
    document.querySelector('#cancel-experiment').disabled = true;
    showToast('The run manifest could not be persisted — no simulation started.', { type: 'error', title: 'Durability unavailable' });
    return;
  }
  if(launch!==launchEpoch){await cancelExperimentRun(begun.runId,begun.execution);return;}
  const manifest = begun.manifest;
  const allocatedBase = manifest?.config?.ordinalBase ?? manifest?.config?.ordinalStart ?? ordinalBase;
  const workerSegments = (manifest?.segments ?? absSegments).map(s => ({
    index: s.index,
    ordinalStart: s.ordinalStart - allocatedBase,
    ordinalEnd: s.ordinalEnd - allocatedBase,
  }));
  status.textContent = `Running ${count} matches with ${workers} worker(s)…`;
  await _driveRunSegments({
    runId: begun.runId,
    execution: begun.execution,
    config: manifest?.config ?? runConfig,
    batchSize: RUN_BATCH_SIZE,
    requestedMatches: manifest?.requestedMatches ?? count,
    committedMatches: 0,
    segments: workerSegments,
  });
}

/**
 * Shared execution driver for fresh runs and resumes. Spawns one worker per
 * remaining segment range; every emitted batch is committed transactionally
 * (batch record + manifest checkpoint) through a serialized queue so the
 * manifest's committedMatches can never run ahead of durable evidence.
 */
async function _driveRunSegments(plan) {
  const status=document.querySelector('#experiment-status'),count=plan.requestedMatches ?? plan.config.matchCount;
  const startedAt=performance.now(),segmentDone=new Map(),spawned=[];
  let committed=plan.committedMatches ?? 0;
  if(activeExecution)activeExecution.cancel();
  const driver=campaignExecution({execution:plan.execution,
    commit:async(msg,execution)=>{
      const result=await commitExperimentBatch(plan.runId,{segmentIndex:plan.segments[msg.workerIndex]?.index ?? msg.workerIndex,ordinalStart:msg.ordinalStart,ordinalEnd:msg.ordinalEnd,summaries:JSON.parse(msg.summariesJson),execution});
      committed=result.committedMatches;
      if(activeExecution===driver)reportProgress();return result;
    },
    heartbeat:execution=>touchRunLease(plan.runId,execution),
    seal:execution=>finalizeExperimentRun(plan.runId,{durationMs:Math.round(performance.now()-startedAt),execution,requireComplete:true}),
    fail:(cause,execution)=>failExperimentRun(plan.runId,cause?.message ?? cause,execution),
    cancel:execution=>cancelExperimentRun(plan.runId,execution),
    onProgress:(index,progress)=>{if(activeExecution!==driver)return;segmentDone.set(index,progress?.completed ?? 0);reportProgress();},
    onTerminal:(phase,detail)=>{
      if(activeExecution!==driver)return;
      activeExecution=null;state.campaignWorkers=[];state.campaignWorker=null;state.activeRunManifest=null;
      document.querySelector('#run-experiment').disabled=false;
      document.querySelector('#cancel-experiment').disabled=true;
      const bar=document.querySelector('#campaign-progress');if(bar)bar.hidden=true;
      setCampaignState(phase);
      if(phase==='complete'){
        const run=detail?.run,saveState=detail?.persistenceState ?? 'SESSION_ONLY';
        const basis=state.evidenceBasis,mechCount=state.observatory?.mechanics?.length ?? 0,synCount=state.observatory?.synergies?.length ?? 0;
        const evidenceNote=basis && !basis.fallback ? ` · evidence: ${fmt(basis.includedGames)} games from ${basis.includedRunCount} runs` : '';
        status.textContent=`${run?`Run #${String(run.ordinal).padStart(3,'0')} · `:''}${run?.metrics?.matchCount ?? committed} matches committed, ${run?.metrics?.abortCount ?? 0} aborts · ${mechCount} mechanics, ${synCount} synergies${evidenceNote} · ${persistenceLabel(saveState)}`;
        showToast(status.textContent,{type:'success',title:'Run complete'});
        if(detail?.included===false && run)showToast(`Run #${String(run.ordinal).padStart(3,'0')} recorded but auto-excluded — it differs materially from the current baseline. Inspect it under Manage Runs.`,{type:'warning',title:'Incompatible run'});
        renderCampaignSummary({ok:true,result:{matchCount:run?.metrics?.matchCount ?? committed,abortCount:run?.metrics?.abortCount ?? 0,durationMs:run?.metrics?.durationMs ?? 0,canonicalResultHash:run?.provenance?.canonicalResultHash ?? null}});
        state.lastCampaignResult=null;state.pendingRunConfig=null;
      }else if(phase==='cancelled'){
        status.textContent='Cancelled — committed batches are retained. Resume or seal partial evidence from Manage Runs.';
      }else{
        status.textContent=`Execution stopped: ${detail?.message ?? detail} — ${committed} of ${count} matches saved locally. Resume or seal partial evidence from Manage Runs.`;
        showToast(status.textContent,{type:'error',title:'Run stopped'});
      }
      refreshRunsUi();updateRailContext();rerender();
    },
  });
  const reportProgress=()=>{
    const done=(plan.committedMatches ?? 0)+[...segmentDone.values()].reduce((a,b)=>a+b,0);
    status.textContent=`Progress: ${done}/${count} simulated · ${committed} saved`;
    updateCampaignProgress(done,Math.max(count,1));
  };
  activeExecution=driver;state.campaignWorkers=spawned;state.campaignWorker=null;state.activeRunManifest=plan.runId;
  setCampaignState('running');
  // Resume preserves all pinned executable/seed inputs; only hole ranges change.
  try{
    plan.segments.forEach((segment,index)=>{
      const worker=new Worker('worker.js',{type:'module'});spawned.push(worker);
      driver.attach(worker,{index,config:{...plan.config,matchCount:count,ordinalStart:segment.ordinalStart,ordinalEnd:segment.ordinalEnd,ordinalBase:plan.config.ordinalBase ?? plan.config.ordinalStart ?? 0,batchSize:plan.batchSize || RUN_BATCH_SIZE}});
    });
  }catch(cause){driver.startFailed(cause);}
  reportProgress();
  return driver.done;
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
  ++launchEpoch;
  if(activeExecution){activeExecution.cancel();return;}
  state.pendingRunConfig=null;
  setCampaignState('cancelled');
  document.querySelector('#experiment-status').textContent='Cancelled — committed batches are retained and resumable from Manage Runs.';
  document.querySelector('#run-experiment').disabled=false;
  document.querySelector('#cancel-experiment').disabled=true;
  refreshRunsUi();
}

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
