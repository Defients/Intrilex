// ═══════════════════════════════════════════════════════════════
// workspaces/branches.js — /branches workspace: counterfactual lab
// ═══════════════════════════════════════════════════════════════

import { state,   app,   esc,   pct,   definitionList } from '../state.js';
import { rerender } from '../rerender.js';
import { POLICY_IDS } from '../autonomy-runtime.js';

// Build a human-readable label for a policy ID
function policyLabel(id) {
  if (id.startsWith('hybrix-')) {
    const rest = id.slice('hybrix-'.length);
    const parts = rest.split('-');
    const difficulty = parts.length > 1 ? parts[parts.length - 1] : '';
    const archetype = parts.slice(0, difficulty ? -1 : undefined).join('-');
    const diffLabel = difficulty ? ` (${difficulty})` : '';
    return `HYBRIX ${archetype}${diffLabel}`;
  }
  const labels = { 'random-legal': 'Random Legal', 'score-rush': 'Score Rush', 'control': 'Control', 'tempo': 'Tempo', 'value': 'Value' };
  return labels[id] ?? id;
}

// Build policy <option> elements for a <select>
function policyOptions(selectedId) {
  return POLICY_IDS.map(id => `<option value="${esc(id)}" ${id === selectedId ? 'selected' : ''}>${esc(policyLabel(id))}</option>`).join('');
}

export function renderBranches() {
  const index = state.autonomyIndex ?? state.index;
  const records = index?.records ?? [];
  if (!records.length) {
    app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">⎇</span><strong>No replay data.</strong><p>Load a campaign replay to explore counterfactual branches.</p></div>';
    return;
  }
  const replayId = state.branchReplayId ?? records[0]?.fixtureId;
  const record = records.find(r => r.fixtureId === replayId);
  const maxCheckpoint = (record?.commandCount ?? 0) - 1;
  const checkpoint = Math.min(state.branchCheckpoint, Math.max(0, maxCheckpoint));
  const altAction = state.branchAltAction ?? '';
  const legalActions = state.branchLegalActions ?? [];
  const legalLoading = state.branchLegalActionsLoading;
  const legalError = state.branchLegalActionsError;
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Counterfactual Branch Lab</h2><p>Policy-conditioned counterfactual estimates from verified decision anchors</p></div></div><div class="panel-body">
    <div class="experiment-grid">
      <label>Replay<select id="branch-replay">${records.map(r => `<option value="${esc(r.fixtureId)}" ${r.fixtureId === replayId ? 'selected' : ''}>${esc(r.fixtureId)} (${r.commandCount ?? '?'} commands)</option>`).join('')}</select></label>
      <div class="inline-fields"><label>Checkpoint<input id="branch-checkpoint" type="number" min="0" max="${maxCheckpoint}" value="${checkpoint}"></label><button id="branch-load-actions" class="secondary-button"${legalLoading ? ' disabled' : ''}>${legalLoading ? 'Loading…' : 'Load legal actions'}</button></div>
      <label>Alt action<select id="branch-alt-action"${legalActions.length ? '' : ' disabled'}>${legalActions.length ? legalActions.map(a => `<option value="${esc(a.actionId)}" ${a.actionId === altAction ? 'selected' : ''}${a.isHistorical ? ' data-historical="true"' : ''}>${esc(a.actionId)}${a.isHistorical ? ' (historical)' : ''}</option>`).join('') : '<option value="">Load legal actions first</option>'}</select></label>
      <div class="inline-fields"><label>Rollouts<input id="branch-rollouts" type="number" min="1" max="512" value="${state.branchRolloutCount}"></label><label>Cont P1<select id="branch-cont-p1">${policyOptions(state.branchContP1)}</select></label><label>Cont P2<select id="branch-cont-p2">${policyOptions(state.branchContP2)}</select></label></div>
      <button id="branch-run" class="primary-button" ${state.branchRunning ? 'disabled' : ''}>${state.branchRunning ? 'Running…' : 'Run paired counterfactual'}</button>
      <button id="branch-analyze-all" class="secondary-button" ${(state.branchAllActionsRunning || !legalActions.length) ? 'disabled' : ''}>${state.branchAllActionsRunning ? 'Analyzing all…' : 'Analyze all actions'}</button>
    </div>
    ${legalError ? `<div class="notice warning"><strong>Legal actions error:</strong> ${esc(legalError)}</div>` : ''}
    ${legalActions.length ? `<div class="notice"><strong>${legalActions.length} legal actions</strong> at checkpoint ${checkpoint}.${state.branchSelectedActionId ? ` Historical action: <code>${esc(state.branchSelectedActionId)}</code>` : ''}</div>` : ''}
    <div id="branch-output">${renderBranchResult()}</div>
  </div></section>`;
  document.querySelector('#branch-replay').onchange = e => {
    state.branchReplayId = e.target.value;
    state.branchResult = null;
    state.branchResultB = null;
    state.branchLegalActions = null;
    state.branchSelectedActionId = null;
    state.branchAltAction = null;
    rerender();
  };
  document.querySelector('#branch-checkpoint').onchange = e => {
    state.branchCheckpoint = Number(e.target.value);
    state.branchLegalActions = null;
    state.branchSelectedActionId = null;
    state.branchAltAction = null;
  };
  document.querySelector('#branch-load-actions').onclick = () => {
    state.branchReplayId = document.querySelector('#branch-replay').value;
    state.branchCheckpoint = Number(document.querySelector('#branch-checkpoint').value);
    loadLegalActions();
  };
  document.querySelector('#branch-alt-action').onchange = e => { state.branchAltAction = e.target.value; };
  document.querySelector('#branch-rollouts').onchange = e => { state.branchRolloutCount = Number(e.target.value); };
  document.querySelector('#branch-cont-p1').onchange = e => { state.branchContP1 = e.target.value; };
  document.querySelector('#branch-cont-p2').onchange = e => { state.branchContP2 = e.target.value; };
  document.querySelector('#branch-run').onclick = () => {
    state.branchReplayId = document.querySelector('#branch-replay').value;
    state.branchCheckpoint = Number(document.querySelector('#branch-checkpoint').value);
    state.branchAltAction = document.querySelector('#branch-alt-action')?.value || '';
    state.branchRolloutCount = Number(document.querySelector('#branch-rollouts').value);
    state.branchContP1 = document.querySelector('#branch-cont-p1').value;
    state.branchContP2 = document.querySelector('#branch-cont-p2').value;
    runPairedCounterfactual();
  };
  const analyzeAllBtn = document.querySelector('#branch-analyze-all');
  if (analyzeAllBtn) {
    analyzeAllBtn.onclick = () => {
      state.branchReplayId = document.querySelector('#branch-replay').value;
      state.branchCheckpoint = Number(document.querySelector('#branch-checkpoint').value);
      state.branchRolloutCount = Number(document.querySelector('#branch-rollouts').value);
      state.branchContP1 = document.querySelector('#branch-cont-p1').value;
      state.branchContP2 = document.querySelector('#branch-cont-p2').value;
      runAllActionsAnalysis();
    };
  }
}

function renderBranchResult() {
  if (state.branchAllActionsResult) return renderAllActionsResult(state.branchAllActionsResult);
  if (!state.branchResult) return '<div class="notice">Configure parameters above and click <strong>Load legal actions</strong> to see available actions at the checkpoint, then click <strong>Run paired counterfactual</strong> to estimate the causal effect of an alternative action, or <strong>Analyze all actions</strong> to rank every legal action by utility.</div>';
  const s = state.branchResult, a = state.branchResultB, c = state.branchComparison;
  if (s.status === 'NOT_SUPPORTED') return `<div class="notice warning"><strong>Not supported:</strong> ${esc(s.reason ?? 'unknown')}. Missing: ${esc(s.missingAuthority ?? 'unknown')}</div>`;
  return `<div class="grid two" style="margin-top:16px">
    <div class="panel"><div class="panel-header"><h3>Selected branch</h3></div><div class="panel-body">${renderBranchSummary(s)}</div></div>
    <div class="panel"><div class="panel-header"><h3>Alternative branch</h3></div><div class="panel-body">${renderBranchSummary(a)}</div></div>
  </div>${c ? renderBranchComparison(c) : ''}`;
}

function renderAllActionsResult(result) {
  if (!result || !result.rankings?.length) return '<div class="notice warning">No actions were analyzed.</div>';
  const rows = result.rankings.map((r, i) => {
    const util = r.meanFocalUtility != null ? r.meanFocalUtility.toFixed(4) : '—';
    const winRate = r.focalWinRate != null ? pct(r.focalWinRate) : '—';
    const ci = r.utilityCI ? `[${r.utilityCI[0].toFixed(4)}, ${r.utilityCI[1].toFixed(4)}]` : '—';
    const delta = r.utilityDelta != null ? (r.utilityDelta >= 0 ? `+${r.utilityDelta.toFixed(4)}` : r.utilityDelta.toFixed(4)) : '—';
    const deltaCls = r.utilityDelta > 0 ? 'style="color:var(--accent)"' : r.utilityDelta < 0 ? 'style="color:#f87171"' : '';
    const histBadge = r.isHistorical ? '<span class="badge-tag" style="background:var(--accent);color:var(--bg)">Historical</span>' : '';
    return `<tr><td>${i + 1}</td><td><code>${esc(r.actionId)}</code> ${histBadge}</td><td>${util}</td><td>${ci}</td><td>${winRate}</td><td ${deltaCls}>${delta}</td><td>${r.completedCount}/${r.totalRollouts}</td></tr>`;
  }).join('');
  return `<div class="panel" style="margin-top:16px"><div class="panel-header"><h3>All Actions Analysis — Ranked by Focal Utility</h3></div><div class="panel-body">
    <p style="color:var(--text-dim);margin-bottom:12px">Each legal action at checkpoint ${result.checkpointIndex} was executed and continued with ${esc(result.continuationPolicyIds?.join(' vs ') ?? 'N/A')} for ${result.rolloutCount} rollouts. Delta is relative to the historical action.</p>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Rank</th><th>Action</th><th>Mean Utility</th><th>95% CI</th><th>Win Rate</th><th>Δ vs Historical</th><th>Completed</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div></div>`;
}

function renderBranchSummary(b) {
  if (!b) return '<div class="notice warning">No result.</div>';
  const sum = b.summary ?? {};
  return definitionList([
    ['Status', b.status], ['Rollouts', sum.totalRollouts], ['Completed', sum.completedCount],
    ['Focal wins', sum.focalWins], ['Focal losses', sum.focalLosses], ['Draws', sum.draws],
    ['Focal win rate', sum.focalWinRate != null ? pct(sum.focalWinRate) : '—'],
    ['Mean utility', sum.meanFocalUtility != null ? sum.meanFocalUtility.toFixed(4) : '—'],
    ['Aborted', sum.abortedCount], ['Failed', sum.failedCount]
  ]);
}

function renderBranchComparison(c) {
  const fmtCI = (ci) => ci ? `[${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]` : '—';
  const fmtWinCI = (ci) => ci ? `[${pct(ci[0])}, ${pct(ci[1])}]` : '—';
  const sigBadge = c.significant
    ? '<span class="badge-tag" style="background:var(--accent);color:var(--bg)">Significant (95%)</span>'
    : '<span class="badge-tag" style="background:var(--text-dim);color:var(--bg)">Not significant</span>';
  return `<div class="panel" style="margin-top:16px"><div class="panel-header"><h3>Comparison ${sigBadge}</h3></div><div class="panel-body">
    ${definitionList([
      ['Selected utility', c.selectedFocalUtility?.toFixed(4)],
      ['Selected utility 95% CI', fmtCI(c.selectedUtilityCI)],
      ['Alternative utility', c.alternativeFocalUtility?.toFixed(4)],
      ['Alternative utility 95% CI', fmtCI(c.alternativeUtilityCI)],
      ['Estimated difference', c.estimatedDifference?.toFixed(4)],
      ['Cohen\'s d (effect size)', c.cohenD != null ? c.cohenD.toFixed(4) : '—'],
      ['Selected win rate 95% CI', fmtWinCI(c.selectedWinRateCI)],
      ['Alternative win rate 95% CI', fmtWinCI(c.alternativeWinRateCI)],
      ['Selected rollouts', c.selectedRolloutCount],
      ['Alternative rollouts', c.alternativeRolloutCount]
    ])}
    <div class="notice"><strong>Interpretation:</strong> ${esc(c.interpretation ?? '')}</div>
    ${(c.limitations ?? []).map(l => `<div class="footer-note">${esc(l)}</div>`).join('')}
  </div></div>`;
}

/**
 * Load legal actions at the selected checkpoint via the worker.
 * Populates state.branchLegalActions and state.branchSelectedActionId.
 */
function loadLegalActions() {
  state.branchLegalActionsLoading = true;
  state.branchLegalActionsError = null;
  rerender();
  const replayKind = state.replayKind ?? 'autonomy';
  const profileId = state.capabilities?.defaultSimulationProfile ?? 'core-advanced-authority';
  const worker = new Worker('worker.js', { type: 'module' });
  worker.onmessage = e => {
    const x = e.data;
    worker.terminate();
    state.branchLegalActionsLoading = false;
    if (x.ok && x.result?.status === 'OK') {
      state.branchLegalActions = x.result.legalActions;
      state.branchSelectedActionId = x.result.selectedActionId;
      // Default alt action to the first non-historical legal action
      if (!state.branchAltAction) {
        const firstAlt = x.result.legalActions.find(a => !a.isHistorical);
        state.branchAltAction = firstAlt?.actionId ?? x.result.legalActions[0]?.actionId ?? '';
      }
    } else if (x.ok && x.result?.status === 'NOT_SUPPORTED') {
      state.branchLegalActions = null;
      state.branchSelectedActionId = null;
      state.branchLegalActionsError = `${x.result.reason ?? 'unknown'} (${x.result.missingAuthority ?? 'unknown'})`;
    } else {
      state.branchLegalActions = null;
      state.branchSelectedActionId = null;
      state.branchLegalActionsError = x.error ?? 'worker error';
    }
    rerender();
  };
  worker.onerror = e => {
    worker.terminate();
    state.branchLegalActionsLoading = false;
    state.branchLegalActions = null;
    state.branchSelectedActionId = null;
    state.branchLegalActionsError = e.message ?? 'worker error';
    rerender();
  };
  worker.postMessage({
    type: 'get-legal-actions',
    fixtureId: state.branchReplayId,
    checkpointIndex: state.branchCheckpoint,
    profileId,
    replayKind,
  });
}

export async function runPairedCounterfactual() {
  state.branchRunning = true;
  rerender();
  try {
    const replayKind = state.replayKind ?? 'autonomy';
    const profileId = state.capabilities?.defaultSimulationProfile ?? 'core-advanced-authority';
    const config = {
      fixtureId: state.branchReplayId,
      replayKind,
      profileId,
      checkpointIndex: state.branchCheckpoint,
      selectedActionId: state.branchSelectedActionId ?? undefined,
      alternativeActionId: state.branchAltAction || undefined,
      rolloutCount: state.branchRolloutCount,
      continuationPolicyIds: [state.branchContP1, state.branchContP2],
    };
    const worker = new Worker('worker.js', { type: 'module' });
    worker.onmessage = e => {
      const x = e.data;
      worker.terminate();
      state.branchRunning = false;
      if (x.ok) {
        state.branchResult = x.result.selected;
        state.branchResultB = x.result.alternative;
        state.branchComparison = x.result.comparison;
      } else {
        const errResult = { status: 'NOT_SUPPORTED', reason: x.error ?? 'worker error', missingAuthority: 'worker' };
        state.branchResult = errResult; state.branchResultB = errResult;
      }
      rerender();
    };
    worker.onerror = e => {
      worker.terminate(); state.branchRunning = false;
      const errResult = { status: 'NOT_SUPPORTED', reason: e.message, missingAuthority: 'worker' };
      state.branchResult = errResult; state.branchResultB = errResult;
      rerender();
    };
    worker.postMessage({ type: 'run-paired-counterfactual', config });
  } catch (err) {
    state.branchRunning = false;
    const errResult = { status: 'NOT_SUPPORTED', reason: String(err?.message ?? err), missingAuthority: 'replay-loader' };
    state.branchResult = errResult; state.branchResultB = errResult;
    rerender();
  }
}

/**
 * Run counterfactual analysis for ALL legal actions at the checkpoint.
 * Ranks actions by mean focal utility and computes delta vs historical.
 */
function runAllActionsAnalysis() {
  state.branchAllActionsRunning = true;
  state.branchAllActionsResult = null;
  state.branchResult = null;
  state.branchResultB = null;
  state.branchComparison = null;
  rerender();
  const replayKind = state.replayKind ?? 'autonomy';
  const profileId = state.capabilities?.defaultSimulationProfile ?? 'core-advanced-authority';
  const worker = new Worker('worker.js', { type: 'module' });
  worker.onmessage = e => {
    const x = e.data;
    if (x.type === 'all-actions-progress') {
      // Could show progress bar here in the future
      return;
    }
    worker.terminate();
    state.branchAllActionsRunning = false;
    if (x.ok) {
      state.branchAllActionsResult = x.result;
    } else {
      state.branchAllActionsResult = { error: x.error ?? 'worker error', rankings: [] };
    }
    rerender();
  };
  worker.onerror = e => {
    worker.terminate();
    state.branchAllActionsRunning = false;
    state.branchAllActionsResult = { error: e.message ?? 'worker error', rankings: [] };
    rerender();
  };
  worker.postMessage({
    type: 'run-all-actions',
    fixtureId: state.branchReplayId,
    replayKind,
    profileId,
    checkpointIndex: state.branchCheckpoint,
    rolloutCount: state.branchRolloutCount,
    continuationPolicyIds: [state.branchContP1, state.branchContP2],
  });
}
