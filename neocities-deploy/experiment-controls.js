// ═══════════════════════════════════════════════════════════════
// experiment-controls.js — Experiment panel, campaign runner, global bindings
// ═══════════════════════════════════════════════════════════════

import { state, esc, fmt, pct, short, definitionList, showToast, persistSetting } from './state.js?v=e2bd7e8507fa';
import { WORKSPACES, route, policyOptions } from './router.js?v=e2bd7e8507fa';
import { showIntegrity } from './integrity.js?v=e2bd7e8507fa';
import { RULES_VERSION, LAB_VERSION } from './version.js?v=e2bd7e8507fa';
import { populateDialogHeading } from './seo-metadata.js?v=e2bd7e8507fa';

// ── Experiment panel ──────────────────────────────────────────────
export function renderExperimentControls() {
  document.querySelector('#experiment-controls').innerHTML = `<div class="experiment-grid">
    <label>Profile<select id="exp-profile"><option value="core-advanced-authority">Advanced Core · supported</option><option value="core-unrestricted-authority">Unrestricted Core · hidden supers + sudden death</option><option value="first-contact-trigger-closure">Complete First Contact</option></select></label>
    <div class="inline-fields"><label>Seat 1<select id="exp-p1">${policyOptions('score-rush')}</select></label><label>Seat 2<select id="exp-p2">${policyOptions('control')}</select></label></div>
    <div class="inline-fields"><label>Matches<input id="exp-count" type="number" min="1" max="10000" value="100"></label><label>Workers<select id="exp-workers"><option>1</option><option selected>2</option><option>4</option></select></label></div>
    <label>Seed strategy<select id="exp-seed"><option value="ordinal-hash">Experiment hash + ordinal</option><option value="fixed">Fixed seed</option></select></label>
    <div class="preflight" id="preflight"><b>Preflight:</b> 25 ordered pairings · matched AB/BA seat-swap · paired McNemar + bootstrap · deterministic telemetry v4.1 · unsupported systems fail closed.</div>
    <div class="rail-actions"><button id="run-experiment" class="primary-button">Run</button><button id="cancel-experiment" class="secondary-button" disabled>Cancel</button><button id="reset-experiment" class="ghost-button">Reset</button></div>
    <output id="experiment-status" class="footer-note" aria-live="polite">Ready.</output>
    <div id="campaign-progress" class="campaign-progress-bar" hidden><div class="campaign-progress-bar-fill" style="width:0%"></div></div>
    <div id="campaign-summary" class="campaign-summary"></div>
  </div>`;
  document.querySelector('#run-experiment').addEventListener('click', runBrowserCampaign);
  document.querySelector('#cancel-experiment').addEventListener('click', cancelBrowserCampaign);
  document.querySelector('#reset-experiment').addEventListener('click', resetCampaignResults);
  for (const id of ['exp-profile', 'exp-p1', 'exp-p2', 'exp-count', 'exp-workers', 'exp-seed'])
    document.querySelector(`#${id}`).addEventListener('change', updatePreflight);
}

export function updatePreflight() {
  const n = Number(document.querySelector('#exp-count').value);
  const w = Number(document.querySelector('#exp-workers').value);
  const p = document.querySelector('#exp-profile').value;
  const seed = document.querySelector('#exp-seed').value;
  const p1 = document.querySelector('#exp-p1').value;
  const p2 = document.querySelector('#exp-p2').value;
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
  document.querySelector('#preflight').innerHTML = `<b>Preflight:</b> ${esc(scope)} · ${esc(p1)} vs ${esc(p2)} · ${fmt(n)} matches · ${w} browser worker${w === 1 ? '' : 's'} · ${esc(seed === 'ordinal-hash' ? 'ordinal-hash seed' : 'fixed seed')} · ${esc(seatDesign)} · paired McNemar + bootstrap · semantic telemetry v4.1 · unsupported systems fail closed.`;
}

// ── Global bindings ───────────────────────────────────────────────
export function bindGlobal() {
  window.addEventListener('hashchange', () => { import('./app.js?v=e2bd7e8507fa').then(m => m.render()); });
  document.querySelector('#layout-preset').addEventListener('change', e => {
    state.layout = e.target.value;
    document.querySelector('.observatory-shell').dataset.preset = state.layout;
    persistSetting('layout', state.layout);
    import('./app.js?v=e2bd7e8507fa').then(m => m.render());
  });
  document.querySelector('#global-visibility').addEventListener('change', async e => {
    state.visibility = e.target.value;
    persistSetting('visibility', state.visibility);
    if (state.visibility !== 'public') {
      const { loadAuthorized } = await import('./data-loader.js?v=e2bd7e8507fa');
      await loadAuthorized();
    }
    import('./app.js?v=e2bd7e8507fa').then(m => m.render());
  });
  document.querySelector('#integrity-button').addEventListener('click', showIntegrity);
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
      import('./app.js?v=e2bd7e8507fa').then(m => m.togglePlay());
    }
  });
  document.querySelector('#collapse-experiment').addEventListener('click', () => {
    document.querySelector('.experiment-rail').classList.toggle('collapsed');
  });
}

function renderCommandResults() {
  const q = document.querySelector('#command-search').value.toLowerCase();
  const commands = [
    ...WORKSPACES.map(([r, , label, sub]) => ({ label: `Open ${label}`, detail: sub, run: () => { location.hash = `#${r}`; } })),
    { label: 'Toggle reduced motion', detail: 'Accessibility', run: () => { state.reducedMotion = !state.reducedMotion; document.body.classList.toggle('reduced-motion', state.reducedMotion); persistSetting('reducedMotion', state.reducedMotion); } },
    { label: 'Toggle reduced sensory', detail: 'Accessibility', run: () => { state.reducedSensory = !state.reducedSensory; document.body.classList.toggle('reduced-sensory', state.reducedSensory); persistSetting('reducedSensory', state.reducedSensory); } },
    { label: 'Toggle FX', detail: 'Presentation', run: () => { state.fx = !state.fx; document.body.classList.toggle('fx-off', !state.fx); persistSetting('fx', state.fx); } },
    { label: 'Show priority orchestration', detail: 'Developer evidence', run: () => { state.showOrchestration = !state.showOrchestration; import('./app.js?v=e2bd7e8507fa').then(m => m.render()); } },
    { label: 'Restart replay', detail: 'Identical seed / source replay', run: () => { import('./app.js?v=e2bd7e8507fa').then(m => { m.stop(); state.frame = 0; m.render(); }); } },
    { label: 'Extract analysis (JSON)', detail: 'AI agent brief · copy to clipboard', run: () => { import('./app.js?v=e2bd7e8507fa').then(m => m.showExtract('json')); } },
    { label: 'Extract analysis (Markdown)', detail: 'AI agent brief · copy to clipboard', run: () => { import('./app.js?v=e2bd7e8507fa').then(m => m.showExtract('markdown')); } }
  ].filter(item => !q || `${item.label} ${item.detail}`.toLowerCase().includes(q));
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
        await finalizeCampaignResult(x, count, 1);
      }
    };
    worker.onerror = e => {
      worker.terminate();
      state.campaignWorker = null;
      state.campaignWorkers = [];
      status.textContent = `Worker error: ${e.message}`;
      document.querySelector('#run-experiment').disabled = false;
      document.querySelector('#cancel-experiment').disabled = true;
      showToast(e.message ?? 'Worker error', { type: 'error', title: 'Worker error' });
    };
    worker.postMessage({ type: 'run-autonomy-campaign', config: { matchCount: count, policyIds: [p1, p2], profileId: profile, seedStrategy, workerCount: workers } });
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
    for (const w of spawned) { try { w.terminate(); } catch (_) { /* already terminated */ } }
    state.campaignWorker = null;
    state.campaignWorkers = [];
    if (failedSegment) {
      await finalizeCampaignResult({ type: 'autonomy-campaign-result', ok: false, error: failedSegment }, count, workers);
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
      const { buildCampaignCore } = await import('./autonomy-runtime.js?v=e2bd7e8507fa');
      const { campaignAggregate, buildObservatoryAnalytics } = await import('./browser-analytics.js?v=e2bd7e8507fa');
      const core = buildCampaignCore(summaries, { profileId: profile, policyIds: [p1, p2], matchCount: count });
      const semantic = { experimentHash: core.canonicalResultHash, profileId: core.profileId, engineVersion: core.engineVersion, rulesVersion: RULES_VERSION, labVersion: LAB_VERSION, canonicalResultHash: core.canonicalResultHash };
      const aggregate = campaignAggregate(summaries, semantic);
      const observatory = buildObservatoryAnalytics({ summaries, aggregate });
      const result = { ...core, durationMs: Math.round(performance.now() - startedAt) };
      const x = { type: 'autonomy-campaign-result', ok: true, result, aggregateJson: JSON.stringify(aggregate), observatoryJson: JSON.stringify(observatory), summariesJson: JSON.stringify(summaries) };
      await finalizeCampaignResult(x, count, workers);
    } catch (err) {
      await finalizeCampaignResult({ type: 'autonomy-campaign-result', ok: false, error: err?.stack ?? String(err) }, count, workers);
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
          catch (_) { segmentSummaries[i] = []; }
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
      config: { matchCount: count, policyIds: [p1, p2], profileId: profile, seedStrategy, ordinalStart: seg.start, ordinalEnd: seg.end },
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

// Shared finalization for both single- and multi-worker paths: updates state,
// renders the campaign summary, and re-renders the current workspace.
async function finalizeCampaignResult(x, count, workers) {
  state.lastCampaignResult = x;
  document.querySelector('#run-experiment').disabled = false;
  document.querySelector('#cancel-experiment').disabled = true;
  const bar = document.querySelector('#campaign-progress');
  if (bar) bar.hidden = true;
  const status = document.querySelector('#experiment-status');
  if (x.ok) {
    const r = x.result ?? {};
    // Update state with campaign-derived data so workspaces reflect the new campaign
    try {
      if (x.summariesJson) {
        const summaries = JSON.parse(x.summariesJson);
        state.observatory = state.observatory ?? {};
        state.observatory.summaries = summaries;
        state.aggregate = x.aggregateJson ? JSON.parse(x.aggregateJson) : state.aggregate;
        if (x.observatoryJson) {
          const obs = JSON.parse(x.observatoryJson);
          state.observatory = { ...obs, summaries };
        }
        // Fallback: if the worker's observatory arrived with 0 mechanics (e.g.
        // stale cached worker module), rebuild observatory analytics on the
        // main thread from the campaign summaries so Mechanics/Synergies propagate.
        if (!state.observatory.mechanics?.length && summaries.length > 0) {
          console.warn('[campaign] Worker observatory has 0 mechanics — rebuilding on main thread from', summaries.length, 'summaries');
          try {
            const { buildObservatoryAnalytics, campaignAggregate } = await import('./browser-analytics.js?v=e2bd7e8507fa');
            const semantic = { experimentHash: r.canonicalResultHash, profileId: r.profileId, engineVersion: r.engineVersion, rulesVersion: RULES_VERSION, labVersion: LAB_VERSION, canonicalResultHash: r.canonicalResultHash };
            const fallbackAggregate = x.aggregateJson ? JSON.parse(x.aggregateJson) : campaignAggregate(summaries, semantic);
            const fallbackObs = buildObservatoryAnalytics({ summaries, aggregate: fallbackAggregate });
            state.observatory = { ...fallbackObs, summaries };
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
    const mechCount = state.observatory?.mechanics?.length ?? 0;
    const synCount = state.observatory?.synergies?.length ?? 0;
    status.textContent = `PASS · ${count} matches, ${r.abortCount ?? r.aborts ?? 0} aborts, ${r.durationMs ?? 0}ms · ${mechCount} mechanics, ${synCount} synergies`;
    showToast(`${count} matches · ${r.abortCount ?? r.aborts ?? 0} aborts · ${mechCount} mechanics · ${synCount} synergies`, { type: 'success', title: 'Campaign complete' });
  } else {
    status.textContent = `Failed: ${x.error ?? 'unknown error'}`;
    showToast(x.error ?? 'Campaign failed', { type: 'error', title: 'Campaign failed' });
  }
  renderCampaignSummary(x);
  // Re-render the current workspace so Mechanics/Synergies/Compare/etc.
  // reflect the freshly updated state.observatory immediately.
  import('./app.js?v=e2bd7e8507fa').then(m => m.render());
}

function cancelBrowserCampaign() {
  if (state.campaignWorker) {
    try { state.campaignWorker.terminate(); } catch (_) { /* already terminated */ }
    state.campaignWorker = null;
  }
  for (const w of state.campaignWorkers ?? []) { try { w.terminate(); } catch (_) { /* already terminated */ } }
  state.campaignWorkers = [];
  document.querySelector('#experiment-status').textContent = 'Cancelled.';
  document.querySelector('#run-experiment').disabled = false;
  document.querySelector('#cancel-experiment').disabled = true;
}

function resetCampaignResults() {
  state.lastCampaignResult = null;
  state.observatory = state.bootState?.observatory ? structuredClone(state.bootState.observatory) : state.observatory;
  state.aggregate = state.bootState?.aggregate ? structuredClone(state.bootState.aggregate) : state.aggregate;
  // Re-sync derived fields that some workspaces read directly. Without this,
  // the Ranks workspace would still show the last campaign's rankPower/
  // swapMatrix/variantAnalytics after a reset instead of the boot data.
  state.rankPower = state.bootState?.rankPower != null ? structuredClone(state.bootState.rankPower) : state.observatory?.rankPower ?? null;
  state.swapMatrix = state.bootState?.swapMatrix != null ? structuredClone(state.bootState.swapMatrix) : state.observatory?.swapMatrix ?? null;
  state.variantAnalytics = state.bootState?.variantAnalytics != null ? structuredClone(state.bootState.variantAnalytics) : state.observatory?.variantAnalytics ?? state.variantAnalytics;
  document.querySelector('#campaign-summary').innerHTML = '';
  document.querySelector('#experiment-status').textContent = 'Ready.';
  import('./app.js?v=e2bd7e8507fa').then(m => m.render());
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
