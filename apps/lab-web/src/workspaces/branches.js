// ═══════════════════════════════════════════════════════════════
// workspaces/branches.js — /branches workspace: counterfactual lab
// ═══════════════════════════════════════════════════════════════

import { state,   app,   esc,   pct,   definitionList } from '../state.js';

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
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Counterfactual Branch Lab</h2><p>Policy-conditioned counterfactual estimates from verified decision anchors</p></div></div><div class="panel-body">
    <div class="experiment-grid">
      <label>Replay<select id="branch-replay">${records.map(r => `<option value="${esc(r.fixtureId)}" ${r.fixtureId === replayId ? 'selected' : ''}>${esc(r.fixtureId)} (${r.commandCount ?? '?'} commands)</option>`).join('')}</select></label>
      <div class="inline-fields"><label>Checkpoint<input id="branch-checkpoint" type="number" min="0" max="${maxCheckpoint}" value="${checkpoint}"></label><label>Alt action ID<input id="branch-alt-action" type="text" value="${esc(altAction)}" placeholder="e.g. action-3"></label></div>
      <div class="inline-fields"><label>Rollouts<input id="branch-rollouts" type="number" min="1" max="512" value="${state.branchRolloutCount}"></label><label>Cont P1<select id="branch-cont-p1"><option value="score-rush" ${state.branchContP1 === 'score-rush' ? 'selected' : ''}>Score Rush</option><option value="control" ${state.branchContP1 === 'control' ? 'selected' : ''}>Control</option><option value="tempo" ${state.branchContP1 === 'tempo' ? 'selected' : ''}>Tempo</option><option value="value" ${state.branchContP1 === 'value' ? 'selected' : ''}>Value</option></select></label><label>Cont P2<select id="branch-cont-p2"><option value="score-rush" ${state.branchContP2 === 'score-rush' ? 'selected' : ''}>Score Rush</option><option value="control" ${state.branchContP2 === 'control' ? 'selected' : ''}>Control</option><option value="tempo" ${state.branchContP2 === 'tempo' ? 'selected' : ''}>Tempo</option><option value="value" ${state.branchContP2 === 'value' ? 'selected' : ''}>Value</option></select></label></div>
      <button id="branch-run" class="primary-button" ${state.branchRunning ? 'disabled' : ''}>${state.branchRunning ? 'Running…' : 'Run paired counterfactual'}</button>
    </div>
    <div id="branch-output">${renderBranchResult()}</div>
  </div></section>`;
  document.querySelector('#branch-replay').onchange = e => { state.branchReplayId = e.target.value; state.branchResult = null; state.branchResultB = null; import('../app.js').then(m => m.render()); };
  document.querySelector('#branch-checkpoint').onchange = e => { state.branchCheckpoint = Number(e.target.value); };
  document.querySelector('#branch-alt-action').oninput = e => { state.branchAltAction = e.target.value; };
  document.querySelector('#branch-rollouts').onchange = e => { state.branchRolloutCount = Number(e.target.value); };
  document.querySelector('#branch-cont-p1').onchange = e => { state.branchContP1 = e.target.value; };
  document.querySelector('#branch-cont-p2').onchange = e => { state.branchContP2 = e.target.value; };
  document.querySelector('#branch-run').onclick = () => {
    state.branchReplayId = document.querySelector('#branch-replay').value;
    state.branchCheckpoint = Number(document.querySelector('#branch-checkpoint').value);
    state.branchAltAction = document.querySelector('#branch-alt-action').value;
    state.branchRolloutCount = Number(document.querySelector('#branch-rollouts').value);
    state.branchContP1 = document.querySelector('#branch-cont-p1').value;
    state.branchContP2 = document.querySelector('#branch-cont-p2').value;
    runPairedCounterfactual();
  };
}

function renderBranchResult() {
  if (!state.branchResult) return '<div class="notice">Configure parameters above and click <strong>Run paired counterfactual</strong> to estimate the causal effect of an alternative action.</div>';
  const s = state.branchResult, a = state.branchResultB, c = state.branchComparison;
  if (s.status === 'NOT_SUPPORTED') return `<div class="notice warning"><strong>Not supported:</strong> ${esc(s.reason ?? 'unknown')}. Missing: ${esc(s.missingAuthority ?? 'unknown')}</div>`;
  return `<div class="grid two" style="margin-top:16px">
    <div class="panel"><div class="panel-header"><h3>Selected branch</h3></div><div class="panel-body">${renderBranchSummary(s)}</div></div>
    <div class="panel"><div class="panel-header"><h3>Alternative branch</h3></div><div class="panel-body">${renderBranchSummary(a)}</div></div>
  </div>${c ? renderBranchComparison(c) : ''}`;
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
  return `<div class="panel" style="margin-top:16px"><div class="panel-header"><h3>Comparison</h3></div><div class="panel-body">
    ${definitionList([
      ['Selected utility', c.selectedFocalUtility?.toFixed(4)],
      ['Alternative utility', c.alternativeFocalUtility?.toFixed(4)],
      ['Estimated difference', c.estimatedDifference?.toFixed(4)],
      ['Selected rollouts', c.selectedRolloutCount],
      ['Alternative rollouts', c.alternativeRolloutCount]
    ])}
    <div class="notice"><strong>Interpretation:</strong> ${esc(c.interpretation ?? '')}</div>
    ${(c.limitations ?? []).map(l => `<div class="footer-note">${esc(l)}</div>`).join('')}
  </div></div>`;
}

export async function runPairedCounterfactual() {
  state.branchRunning = true;
  import('../app.js').then(m => m.render());
  try {
    const config = {
      fixtureId: state.branchReplayId,
      checkpointIndex: state.branchCheckpoint,
      alternativeActionId: state.branchAltAction,
      rolloutCount: state.branchRolloutCount,
      continuationPolicyIds: [state.branchContP1, state.branchContP2]
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
      import('../app.js').then(m => m.render());
    };
    worker.onerror = e => {
      worker.terminate(); state.branchRunning = false;
      const errResult = { status: 'NOT_SUPPORTED', reason: e.message, missingAuthority: 'worker' };
      state.branchResult = errResult; state.branchResultB = errResult;
      import('../app.js').then(m => m.render());
    };
    worker.postMessage({ type: 'run-paired-counterfactual', config });
  } catch (err) {
    state.branchRunning = false;
    const errResult = { status: 'NOT_SUPPORTED', reason: String(err?.message ?? err), missingAuthority: 'replay-loader' };
    state.branchResult = errResult; state.branchResultB = errResult;
    import('../app.js').then(m => m.render());
  }
}
