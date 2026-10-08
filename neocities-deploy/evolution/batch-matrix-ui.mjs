// Batch Profile Matrix UI. Pure HTML builders stay dependency-injected so this
// module is importable in Node tests; the interactive bind receives all
// runtime/store functions through ctx so no package import is required here.
import { escapeHtml } from './evolution-analytics-charts.mjs';

const esc = escapeHtml;
const fmt = n => Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
const pct = n => Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—';
const mib = n => Number.isFinite(n) ? `${(n / 1048576).toFixed(1)} MiB` : 'unavailable';
const selectionOf = participantId => participantId.startsWith('profile:') ? { kind: 'AGENT_PROFILE', agentProfileId: participantId.slice(8) } : { kind: 'STATIC_POLICY', policyId: participantId.slice(7) };

export function rosterRows(state, roster, statics) {
  const rows = [];
  for (const p of roster) {
    const id = `profile:${p.id}`;
    const incompatible = p.reason ? p.reason : p.snapshot.rulesProfileId !== state.profileId ? `Rules mismatch: ${p.snapshot.rulesProfileId}` : null;
    rows.push({ participantId: id, label: p.displayName, kindLabel: 'Custom Profile',
      meta: p.snapshot ? `head v${p.snapshot.profile.headVersion} · ${p.snapshot.policyId}` : 'unavailable',
      available: !incompatible, reason: incompatible, selected: state.selected.has(id) });
  }
  for (const s of statics) rows.push({ participantId: `static:${s.id}`, label: s.label, kindLabel: 'Static Policy', meta: s.id, available: true, reason: null, selected: state.selected.has(`static:${s.id}`) });
  return rows;
}

export function batchRosterHtml(rows, { disabled = false } = {}) {
  if (!rows.length) return '<p class="bm-empty">No participants available. Create Custom Profiles in the Profiles surface or use static policies.</p>';
  return `<ul class="bm-roster" role="group" aria-label="Batch matrix participants">${rows.map(r => `
    <li><label class="bm-row ${r.available ? '' : 'bm-unavailable'} ${r.selected ? 'bm-selected' : ''}">
      <input type="checkbox" data-bm-select="${esc(r.participantId)}" ${r.selected ? 'checked' : ''} ${disabled || !r.available ? 'disabled' : ''}>
      <span class="bm-name">${esc(r.label)}</span>
      <span class="bm-meta">${esc(r.kindLabel)} · ${esc(r.meta)}${r.reason ? `<br><span class="bm-reason">${esc(r.reason)}</span>` : ''}</span>
    </label></li>`).join('')}</ul>`;
}

export function batchConfigHtml(state, { disabled = false, rulesOptions = [] } = {}) {
  const d = disabled ? 'disabled' : '';
  return `<div class="evo-filterbar bm-config">
    <button id="evo-batch-select-all" class="ghost-button" type="button" ${d}>Select all compatible</button>
    <button id="evo-batch-clear" class="ghost-button" type="button" ${d}>Clear</button>
    <label>Games / matchup (even; browser max 100, deep max 10)<input id="evo-batch-games" type="number" min="2" max="100" step="2" value="${state.games}" list="bm-games-presets" ${d}><datalist id="bm-games-presets"><option value="32"></option><option value="64"></option><option value="100"></option></datalist></label>
    <label>Matrix seed<input id="evo-batch-seed" type="number" min="1" max="4294967295" step="1" value="${state.seed}" ${d}></label>
    <label>Workers<select id="evo-batch-workers" ${d}>${[1, 2, 4].map(n => `<option ${n === state.workers ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Rules profile<select id="evo-batch-profile" ${d}>${rulesOptions.map(([id, label]) => `<option value="${id}" ${state.profileId === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label class="evo-check">Deep decision tracing<input id="evo-batch-trace" type="checkbox" ${state.trace ? 'checked' : ''} ${d}></label>
  </div>`;
}

export function batchPreflightHtml(plan, blockers, { estimate = true } = {}) {
  if (!plan) return `<div class="bm-preflight"><strong>BATCH MATRIX</strong><ul class="bm-preflight-list">${blockers.map(b => `<li>${esc(b)}</li>`).join('') || '<li>Select participants to plan the matrix.</li>'}</ul></div>`;
  return `<div class="bm-preflight" data-testid="evo-batch-preflight"><strong>BATCH MATRIX</strong><ul class="bm-preflight-list">
    <li>Participants <b>${plan.participants}</b></li><li>Unique matchups <b>${plan.matchups}</b></li>
    <li>Games / matchup <b>${fmt(plan.gamesPerMatchup)}</b></li><li>Total games <b>${fmt(plan.totalGames)}</b></li>
    <li>Seat design <b>Balanced AB/BA</b></li><li>Rules <b>${esc(plan.profileId)}</b></li>
    ${estimate ? `<li>Evidence footprint (advisory estimate) <b>~${mib(plan.estimatedBytes)}</b></li>` : ''}
    ${blockers.map(b => `<li class="bm-reason">${esc(b)}</li>`).join('')}</ul>
    <p class="bm-note">Profiles freeze at their current heads when the matrix begins. Evaluation-only: matrix evidence cannot modify, train or promote Profiles.</p></div>`;
}

export function batchMatrixTableHtml(view, { focusCell = null } = {}) {
  if (!view) return '';
  const perMatchup = view.requestedGames / view.cellsTotal;
  const cell = (rowId, colId) => view.cells.find(c => (c.seatA === rowId && c.seatB === colId) || (c.seatA === colId && c.seatB === rowId));
  const focal = (c, rowId) => c?.metrics.pairedScore == null ? null : (c.seatA === rowId ? c.metrics.pairedScore : 1 - c.metrics.pairedScore);
  const body = view.participants.map((p, i) => `<tr><th scope="row" title="${esc(p.participantId)}">${esc(p.displayName)}</th>${view.participants.map((q, j) => {
    if (i === j) return '<td class="bm-diag">—</td>';
    const c = cell(p.participantId, q.participantId);
    const score = focal(c, p.participantId);
    const label = c ? `${p.displayName} vs ${q.displayName}: ${pct(score)} paired score; ${c.records}/${perMatchup} games; ${c.complete ? 'complete' : c.status.toLowerCase()}` : `${p.displayName} vs ${q.displayName}: pending`;
    const cls = !c ? 'bm-pending' : c.complete ? (score >= .5 ? 'bm-win' : 'bm-loss') : 'bm-partial';
    const selected = c && focusCell && focusCell.seatA === c.seatA && focusCell.seatB === c.seatB ? 'bm-focus-cell' : '';
    return `<td><button class="bm-cell ${cls} ${selected}" type="button" data-bm-cell="${c ? esc(`${c.seatA}|${c.seatB}`) : ''}" title="${esc(label)}" aria-label="${esc(label)}" ${c ? '' : 'disabled'}>${c ? pct(score) : '·'}<br><small>${c ? `${c.records}/${perMatchup}` : 'pending'}</small></button></td>`;
  }).join('')}</tr>`).join('');
  return `<div class="evo-table-scroll bm-matrix-scroll"><table class="bm-matrix"><caption>Head-to-head paired score · row participant versus column participant · draws score ½</caption>
    <thead><tr><th scope="col">vs</th>${view.participants.map(p => `<th scope="col" title="${esc(p.participantId)}">${esc(p.displayName)}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="bm-note">${fmt(view.acceptedGames)} / ${fmt(view.requestedGames)} accepted games · ${view.cellsComplete} / ${view.cellsTotal} matchups complete. ${esc(view.uncertainty)}</p>`;
}

export function batchLeaderboardHtml(view, { focus = null } = {}) {
  if (!view?.leaderboard.length) return '';
  return `<div class="evo-table-scroll"><table class="bm-board"><caption>Aggregate matrix performance — descriptive, not a transitive rating. Ties break by wins then participant id.</caption>
    <thead><tr><th>Rank</th><th>Participant</th><th>Type</th><th>Matchups</th><th>Games</th><th>W</th><th>L</th><th>D</th><th>Score</th><th>Faults</th></tr></thead>
    <tbody>${view.leaderboard.map(r => `<tr class="${focus === r.participantId ? 'bm-focus-cell' : ''}">
      <td>${r.rank}</td><td><button class="evo-link" type="button" data-bm-focus="${esc(r.participantId)}">${esc(r.displayName)}</button></td>
      <td>${r.kind === 'AGENT_PROFILE' ? `Profile${r.headVersion ? ` · head v${r.headVersion}` : ''}` : 'Static'}</td>
      <td>${r.matchupsComplete}</td><td>${fmt(r.games)}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.draws}</td><td>${pct(r.scoreRate)}</td><td>${r.faults}</td></tr>`).join('')}</tbody></table></div>`;
}

export function batchBreakdownHtml(view, participantId) {
  if (!view || !participantId) return '';
  const p = view.participants.find(x => x.participantId === participantId);
  if (!p) return '';
  const rows = view.cells.filter(c => c.seatA === participantId || c.seatB === participantId).map(c => {
    const focalA = c.seatA === participantId;
    return { opponent: focalA ? c.displayB : c.displayA, c, focal: c.metrics.pairedScore == null ? null : (focalA ? c.metrics.pairedScore : 1 - c.metrics.pairedScore) };
  });
  return `<div class="bm-breakdown"><h4>${esc(p.displayName)} <small>vs each opponent</small></h4>
    ${rows.map(r => `<div class="bm-breakdown-row"><span>${esc(r.opponent)}</span><b>${pct(r.focal)}</b><small>${r.c.complete ? `${r.c.metrics.clean} clean · ${r.c.metrics.aborted} faults` : r.c.status.toLowerCase()}</small></div>`).join('')}</div>`;
}

export function batchCellDetailHtml(view, cell) {
  if (!view) return '';
  const c = cell ? view.cells.find(x => x.seatA === cell.seatA && x.seatB === cell.seatB) : null;
  if (!c) return '<p>Select a matrix cell to inspect matchup evidence.</p>';
  const m = c.metrics, ci = m.pairedScoreInterval95;
  return `<div class="bm-detail" data-testid="evo-batch-detail"><h4>${esc(c.displayA)} vs ${esc(c.displayB)} <span class="bm-badge">${esc(c.status)}</span></h4>
    <p>${m.games} games · ${m.clean} clean · A wins ${m.winsA} · B wins ${m.winsB} · draws ${m.draws} · aborted ${m.aborted}</p>
    <p>Paired score (A) ${pct(m.pairedScore)} · ${m.pairCount} complete pairs${ci ? ` · conservative 95% ${pct(ci[0])}–${pct(ci[1])}` : ''} · ${esc(m.uncertainty)}</p>
    <p>Seat split — AB: ${c.seats[0].games} clean (${c.seats[0].winsA}–${c.seats[0].winsB}–${c.seats[0].draws}) · BA: ${c.seats[1].games} clean (${c.seats[1].winsA}–${c.seats[1].winsB}–${c.seats[1].draws})</p>
    <p>Terminations: ${esc(JSON.stringify(c.terminations))}</p>
    ${c.runId ? `<p><code>${esc(c.runId)}</code></p><div class="toolbar"><button class="secondary-button" type="button" data-bm-open-run="${esc(c.runId)}">Load series in Arena</button><button class="ghost-button" type="button" data-bm-export-run="${esc(c.runId)}">Export series artifact</button></div>` : '<p>Pending — no series evidence yet.</p>'}</div>`;
}

export function batchSavedHtml(saved) {
  if (!saved?.length) return '';
  return `<details class="bm-saved"><summary>Saved matrices on this origin (${saved.length})</summary>${saved.map(s => `<div class="evo-replay-row"><span>${esc(s.status)} · ${esc((s.participants ?? []).join(', '))} · ${s.cellsComplete}/${s.cellsTotal} matchups · ${fmt(s.records)} records · ${esc(s.createdAt ?? '')}<br><code>${esc(s.matrixId)}</code></span><button class="ghost-button" type="button" data-bm-load="${esc(s.matrixId)}">Inspect</button><button class="ghost-button" type="button" data-bm-resume="${esc(s.matrixId)}" ${s.status === 'COMPLETE' || s.corrupt ? 'disabled' : ''}>Resume</button></div>`).join('')}</details>`;
}

export function batchSectionHtml(state, deps) {
  const { rows = [], busy = false, rulesOptions = [], plan = null, blockers = [], view = null, v1Html = '', saved = [], progressText = '' } = deps;
  const running = state.abort && !state.abort.signal.aborted;
  return `<div class="evo-section" data-testid="evo-batch-matrix"><h3>Batch profile matrix</h3>
    <p>Frozen round robin over selected participants: Custom Profiles resolve once into immutable head snapshots, then every unique pairing runs one balanced AB/BA series. Static policies remain selectable alongside Profiles. Evaluation-only — Profiles cannot be mutated, trained or promoted here.</p>
    ${batchRosterHtml(rows, { disabled: busy })}
    ${batchConfigHtml(state, { disabled: busy, rulesOptions })}
    ${batchPreflightHtml(plan, blockers)}
    <div class="toolbar"><button id="evo-batch-start" class="primary-button" type="button" ${busy || blockers.length || !plan ? 'disabled' : ''}>Start batch matrix</button>
      <button id="evo-batch-stop" class="secondary-button" type="button" ${running ? '' : 'disabled'}>Stop matrix</button>
      <button id="evo-batch-resume" class="secondary-button" type="button" ${!busy && state.lab && !['COMPLETE', 'RUNNING'].includes(state.lab.status) ? '' : 'disabled'}>Resume matrix</button>
      <button id="evo-batch-export" class="secondary-button" type="button" ${state.lab ? '' : 'disabled'} title="Full artifact: embeds every game record — large file, portable across origins">Export matrix artifact</button>
      <button id="evo-batch-export-manifest" class="secondary-button" type="button" ${state.lab ? '' : 'disabled'} title="Compact manifest: run references only — rehydrates from this browser's run ledger">Export manifest</button>
      <label class="secondary-button">Inspect matrix artifact<input id="evo-batch-import" type="file" accept=".json,application/json" ${busy ? 'disabled' : ''}></label></div>
    <p id="evo-batch-status" role="status">${esc(state.error || progressText || (state.lab ? `${state.lab.status} · ${fmt(state.lab.runs.reduce((n, r) => n + r.records.length, 0))} accepted records` : 'Not run. Missing matchups remain pending.'))}${reconcileText(state)}</p>
    ${state.reconcile && state.reconcile.pending === 0 && (state.reconcile.failed > 0 || state.reconcile.failedRecords > 0) ? `<button id="evo-batch-reconcile-retry" class="secondary-button" type="button" data-testid="evo-batch-reconcile-retry">Retry Strategy index sync</button>` : ''}
    ${state.storage ? `<p class="danger" role="alert">${esc(state.storage)}</p>` : ''}
    <div id="evo-batch-results">${view ? `${batchMatrixTableHtml(view, { focusCell: state.cell })}${batchLeaderboardHtml(view, { focus: state.focus })}${batchBreakdownHtml(view, state.focus)}<div id="evo-batch-detail">${batchCellDetailHtml(view, state.cell)}</div>` : ''}${v1Html}</div>
    ${batchSavedHtml(saved)}</div>`;
}

/** Strategy-index reconciliation status suffix for the matrix status line.
 * Pending, committed and failed counts are disclosed — sync is never claimed
 * complete before results are known. */
function reconcileText(state) {
  const r = state.reconcile;
  if (!r) return '';
  if (r.pending > 0) return ` · Strategy index: reconciling ${r.offered - r.pending}/${r.offered} run(s)…`;
  if (r.failed > 0 || r.failedRecords > 0) return ` · Strategy index: ${r.committed}/${r.offered} run(s) synced, ${r.failed} run(s) failed, ${r.failedRecords} record(s) failed — evidence retained, retry available`;
  return ` · Strategy index: ${r.committed}/${r.offered} run(s) synced`;
}

/** Fold one ingestRun result into the running reconciliation tally. */
function tallyIngest(state, run, stats, error) {
  const r = state.reconcile ?? (state.reconcile = { offered: 0, committed: 0, failed: 0, pending: 0, committedRecords: 0, failedRecords: 0, errors: [] });
  r.offered += 1;
  const committed = stats?.committed ?? 0, failedRecords = stats?.failed ?? 0;
  r.committedRecords += committed;
  r.failedRecords += failedRecords;
  if (error || !stats) {
    r.failed += 1;
    r.errors.push({ runId: run?.runId ?? null, error: String(error?.message ?? error ?? 'unknown') });
  } else if (failedRecords > 0 || stats.error) {
    r.committed += 1; // run-level write completed; record failures disclosed
    r.errors.push({ runId: run?.runId ?? null, error: stats.error ?? `${failedRecords} record(s) failed` });
  } else r.committed += 1;
  return r;
}

/** Bind interactive controls on a stable root; re-renders replace innerHTML so
 * delegated listeners survive. ctx supplies state, roster(), statics,
 * rulesOptions, busy(), fns (runtime functions), identity, profiles,
 * persist {saveRun,saveMatrix,listMatrices,loadMatrix,loadRun}, executeSeries,
 * lock {get,set}, openRun, exportJson, runEnvelope, importLimit, legacy.
 * Optional analysis hooks: onAcceptedGame(evidence, cellRun) streams each
 * finalized game; ingestRun(run) reconciles a whole run into the index. */
export function bindBatchMatrix(root, ctx) {
  if (!root) return null;
  const { state, fns } = ctx;
  const status = () => {
    const el = root.querySelector('#evo-batch-status');
    if (el) el.textContent = (state.error || state.progressText || (state.lab ? `${state.lab.status} · ${fmt(state.lab.runs.reduce((n, r) => n + r.records.length, 0))} accepted records` : 'Not run. Missing matchups remain pending.')) + reconcileText(state);
  };
  const busy = () => ctx.busy() || !!ctx.lock.get();
  const enqueue = job => {
    state.queue = (state.queue ?? Promise.resolve()).then(job).catch(error => {
      state.storage = `Storage write failed: ${error.message}. Completed evidence stays in memory; use Export matrix artifact to preserve it externally.`;
      status();
    });
    return state.queue;
  };
  const loader = id => ctx.persist.loadRun(id).catch(error => /NOT_FOUND/.test(error.message) ? null : Promise.reject(error));
  /** Reconcile every lab run into the Strategy evidence index. Tracked and
   * idempotent: ingest dedups on sealed identity, so re-running only fills
   * gaps. A reconciliation failure never discards the game artifacts — it is
   * disclosed with a retry affordance instead. */
  const reconcileIndex = async () => {
    const runs = state.lab?.runs ?? [];
    if (!runs.length || !ctx.ingestRun) { state.reconcile = null; return; }
    state.reconcile = { offered: runs.length, committed: 0, failed: 0, pending: runs.length, committedRecords: 0, failedRecords: 0, errors: [] };
    status();
    const results = await Promise.allSettled(runs.map(run => ctx.ingestRun(run)));
    state.reconcile = { offered: 0, committed: 0, failed: 0, pending: 0, committedRecords: 0, failedRecords: 0, errors: [] };
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') tallyIngest(state, runs[i], result.value, null);
      else tallyIngest(state, runs[i], null, result.reason);
    });
    status();
    render();
  };
  /** Admits one validated matrix envelope (artifact or manifest): inspects
   * it, persists what the local ledger accepts and registers constituent
   * games with the analysis index. Sealed identity dedup keeps repeated
   * imports exactly-once. Throws on rejection — callers surface the error. */
  const importMatrix = async parsed => {
    if (parsed.schemaVersion === 1) { state.v1 = parsed; state.lab = null; state.progressText = 'Imported legacy (v1) matrix artifact — read-only inspection'; return; }
    if (parsed.runRefs) {
      state.lab = await fns.rehydrateBatchMatrix(parsed, loader); state.v1 = null;
      // Persist the manifest only when every referenced run resolved
      // locally — a regenerated manifest must not drop unknown cells.
      if (state.lab.runs.length === parsed.runRefs.length) await ctx.persist.saveMatrix(state.lab);
      state.progressText = `Imported matrix manifest · ${fmt(state.lab.runs.length)} / ${fmt(parsed.runRefs.length)} cell run(s) resolved from local storage${state.lab.runs.length === parsed.runRefs.length ? ' · matrix saved to Lab history' : ' · unresolved cells remain pending'}`;
    } else {
      state.lab = parsed; state.v1 = null;
      // Mirror the single-artifact import: admissible constituent runs
      // enter the run ledger and Lab history. Runs carrying a different
      // implementation fingerprint fail validateArtifact closed, so they
      // reach the analysis index only (marked IMPORTED_UNVERIFIED).
      let ledgered = 0, skipped = 0;
      for (const run of state.lab.runs) {
        run.evidenceOrigin ??= 'IMPORTED_UNVERIFIED';
        if (run.identity?.fingerprint !== ctx.identity.fingerprint) { skipped++; continue; }
        try { await ctx.persist.saveRun(run); ledgered++; } catch { skipped++; }
      }
      // The manifest is persisted only when every cell landed — a partial
      // manifest would let Resume fabricate replacement cells.
      if (!skipped) await ctx.persist.saveMatrix(state.lab);
      state.progressText = `Imported matrix · ${fmt(ledgered)} cell run(s) added to Lab history${skipped ? ` · ${fmt(skipped)} run(s) hold a different implementation fingerprint — analysis index only` : ''}`;
    }
    // Register imported constituent games with the analysis index; sealed
    // identity dedup keeps repeated imports exactly-once. Reconciliation is
    // tracked — pending/committed/failed are surfaced, never claimed early.
    if (state.lab?.runs?.length) void reconcileIndex();
    try { state.saved = await ctx.persist.listMatrices(); } catch { state.saved = []; }
    // Repaint here, not in callers — routed imports (main artifact input)
    // would otherwise update state invisibly.
    render();
  };
  const derived = () => {
    const rows = rosterRows(state, ctx.roster(), ctx.statics);
    const selected = rows.filter(r => r.selected);
    const blockers = [];
    let plan = null;
    if (selected.length < 2) blockers.push('Select at least 2 participants.');
    if (selected.length > 8) blockers.push('At most 8 participants.');
    for (const r of selected.filter(r => !r.available)) blockers.push(`${r.label}: ${r.reason}`);
    if (ctx.busy() && !ctx.lock.get()) blockers.push('Another Evolution operation is active.');
    if (selected.length >= 2 && selected.length <= 8 && !selected.some(r => !r.available)) {
      try { plan = fns.batchMatrixPlan({ participants: selected.map(r => selectionOf(r.participantId)), gamesPerMatchup: state.games, seed: state.seed, profileId: state.profileId, workerCount: state.workers, strategicTrace: state.trace }); }
      catch (error) { blockers.push(error.message); }
    }
    let view = null;
    if (state.lab) { try { view = fns.batchMatrixView(state.lab); } catch (error) { state.error = `Matrix artifact rejected: ${error.message}`; } }
    return { rows, plan, blockers, view, v1Html: state.v1 ? ctx.legacy.render(state.v1) : '', busy: busy(), rulesOptions: ctx.rulesOptions, saved: state.saved ?? [], progressText: state.progressText };
  };
  const render = () => { root.innerHTML = batchSectionHtml(state, derived()); };
  const execute = async source => {
    if (busy()) return;
    const controller = new AbortController();
    ctx.lock.set(controller); state.abort = controller; state.error = ''; state.storage = ''; state.progressText = 'Freezing participant manifest…';
    status(); render();
    try {
      const lab = await fns.runBatchMatrix(source, ctx.executeSeries, {
        identity: ctx.identity, store: ctx.profiles, signal: controller.signal,
        onAcceptedGame: async (evidence, runRef) => { await ctx.onAcceptedGame?.(evidence, runRef); if (runRef.records.length % 50 === 0) await enqueue(() => ctx.persist.saveRun(runRef)); },
        onProgress: p => { state.progressText = `${p.displayA} vs ${p.displayB} · ${fmt(p.gamesCompleted)} / ${fmt(p.gamesTotal)} games · ${p.cellsCompleted} / ${p.cellsTotal} matchups complete`; status(); },
        // Reconcile each finished cell against the analysis index — streamed
        // writes deduplicate, so resume and earlier sessions stay exactly-once.
        // Index failures are counted and disclosed, never fatal to the games.
        onRun: async saved => {
          await enqueue(() => ctx.persist.saveRun(saved));
          if (!ctx.ingestRun) return;
          try { tallyIngest(state, saved, await ctx.ingestRun(saved), null); }
          catch (error) { tallyIngest(state, saved, null, error); }
          status();
        },
        onMatrix: lab => enqueue(() => ctx.persist.saveMatrix(lab)),
      });
      state.lab = lab;
      state.progressText = `${lab.status} · ${fmt(lab.runs.reduce((n, r) => n + r.records.length, 0))} accepted records across ${lab.runs.filter(r => r.status === 'COMPLETE').length} / ${lab.participants.length * (lab.participants.length - 1) / 2} matchups`;
      // Final reconciliation sweep — dedup makes re-offering already-synced
      // runs a no-op, so this only fills gaps (resume, prior partial syncs).
      if (state.lab?.runs?.length) void reconcileIndex();
      try { state.saved = await ctx.persist.listMatrices(); } catch { state.saved = []; }
    } catch (error) { state.error = `Matrix failed: ${error.message}`; state.progressText = ''; }
    finally { if (ctx.lock.get() === controller) ctx.lock.set(null); state.abort = null; render(); }
  };
  const begin = async () => {
    const rows = rosterRows(state, ctx.roster(), ctx.statics).filter(r => r.selected && r.available);
    try {
      state.lab = await fns.createBatchMatrix({ participants: rows.map(r => selectionOf(r.participantId)), gamesPerMatchup: state.games, seed: state.seed, profileId: state.profileId, workerCount: state.workers, strategicTrace: state.trace }, ctx.identity, ctx.profiles);
      await enqueue(() => ctx.persist.saveMatrix(state.lab));
      await execute(state.lab);
    } catch (error) { state.error = `Matrix configuration rejected: ${error.message}`; state.progressText = ''; render(); }
  };
  root.addEventListener('change', event => {
    const select = event.target.closest('[data-bm-select]');
    if (select) { select.checked ? state.selected.add(select.dataset.bmSelect) : state.selected.delete(select.dataset.bmSelect); render(); return; }
    if (event.target.id === 'evo-batch-games') { state.games = Number(event.target.value); render(); return; }
    if (event.target.id === 'evo-batch-seed') { state.seed = Number(event.target.value); render(); return; }
    if (event.target.id === 'evo-batch-workers') { state.workers = Number(event.target.value); render(); return; }
    if (event.target.id === 'evo-batch-profile') { state.profileId = event.target.value; render(); return; }
    if (event.target.id === 'evo-batch-trace') { state.trace = event.target.checked; render(); return; }
    if (event.target.id !== 'evo-batch-import') return;
    const file = event.target.files?.[0];
    if (!file) return;
    (async () => {
      try {
        if (file.size > ctx.importLimit) throw new Error('MATRIX_IMPORT_TOO_LARGE');
        await importMatrix(fns.validateMatrixEnvelope(JSON.parse(await file.text())));
        state.error = '';
      } catch (error) { state.error = `Matrix import rejected: ${error.message}`; }
      render();
    })();
  });
  root.addEventListener('click', event => {
    const cell = event.target.closest('[data-bm-cell]');
    if (cell?.dataset.bmCell) { const [seatA, seatB] = cell.dataset.bmCell.split('|'); state.cell = { seatA, seatB }; render(); return; }
    const focus = event.target.closest('[data-bm-focus]');
    if (focus) { state.focus = state.focus === focus.dataset.bmFocus ? null : focus.dataset.bmFocus; render(); return; }
    const openRun = event.target.closest('[data-bm-open-run]');
    if (openRun) { void (async () => { try { ctx.openRun(await ctx.persist.loadRun(openRun.dataset.bmOpenRun)); } catch (error) { state.error = `Series load rejected: ${error.message}`; render(); } })(); return; }
    const exportRun = event.target.closest('[data-bm-export-run]');
    if (exportRun) { void (async () => { try { const run = await ctx.persist.loadRun(exportRun.dataset.bmExportRun); ctx.exportJson(ctx.runEnvelope(run), `${run.runId}.json`); } catch (error) { state.error = `Series export failed: ${error.message}`; render(); } })(); return; }
    const saved = event.target.closest('[data-bm-load],[data-bm-resume]');
    if (saved) {
      const resume = saved.hasAttribute('data-bm-resume'), id = saved.dataset.bmLoad ?? saved.dataset.bmResume;
      void (async () => {
        try {
          const manifest = await ctx.persist.loadMatrix(id);
          state.lab = await fns.rehydrateBatchMatrix(manifest, loader);
          state.v1 = null; state.error = ''; state.progressText = '';
          if (resume) await execute(state.lab); else render();
        } catch (error) { state.error = `Matrix load rejected: ${error.message}`; render(); }
      })();
      return;
    }
    if (event.target.id === 'evo-batch-select-all') { for (const r of rosterRows(state, ctx.roster(), ctx.statics)) if (r.available) state.selected.add(r.participantId); render(); }
    if (event.target.id === 'evo-batch-clear') { state.selected.clear(); render(); }
    if (event.target.id === 'evo-batch-start') void begin();
    if (event.target.id === 'evo-batch-stop') ctx.lock.get()?.abort();
    if (event.target.id === 'evo-batch-resume') { if (state.lab) void execute(state.lab); }
    if (event.target.id === 'evo-batch-reconcile-retry') void reconcileIndex();
    if (event.target.id === 'evo-batch-export') { if (state.lab) ctx.exportJson(fns.batchMatrixArtifact(state.lab), `${state.lab.matrixId}.json`); }
    if (event.target.id === 'evo-batch-export-manifest') { if (state.lab) ctx.exportJson(fns.batchMatrixManifest(state.lab), `${state.lab.matrixId}-manifest.json`); }
  });
  if (state.saved === undefined || state.saved === null) {
    void ctx.persist.listMatrices?.().then(list => { if (state.saved == null) { state.saved = list ?? []; render(); } }).catch(() => { state.saved = []; });
  }
  render();
  return { render, importMatrix, reconcileIndex };
}
