// ═══════════════════════════════════════════════════════════════
// workspaces/diagnostics.js — /diagnostics workspace
// ═══════════════════════════════════════════════════════════════

import { state, app, esc, pct, short, definitionList } from '../state.js?v=659a089d50b6';
import { loadTraceIndex, loadTraceData } from '../data-loader.js?v=659a089d50b6';

export function renderDiagnostics() {
  const summaries = state.observatory?.summaries ?? [];
  const policies = [...new Set(summaries.flatMap(s => s.policyIds ?? []))].sort();
  if (!policies.length) {
    app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">⚙</span><strong>No campaign data</strong><p>Run a campaign to generate policy diagnostics.</p></div>';
    return;
  }
  const baselineId = state.diagBaseline ?? policies[0];
  const candidateId = state.diagCandidate ?? policies.find(p => p !== baselineId) ?? policies[0];
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Policy Diagnostics</h2><p>Decision margins, self-counter rates, response conservation, timing, and win rates</p></div><div class="toolbar"><select id="diag-baseline">${policies.map(p => `<option value="${esc(p)}" ${p === baselineId ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select><span>vs</span><select id="diag-candidate">${policies.map(p => `<option value="${esc(p)}" ${p === candidateId ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select><button id="diag-run" class="primary-button">Run diagnostics</button></div></div><div class="panel-body" id="diag-output"><div class="notice">Select two policies and click <strong>Run diagnostics</strong>. Diagnostics uses retained decision traces as evidence.</div></div></section>`;
  document.querySelector('#diag-baseline').onchange = e => { state.diagBaseline = e.target.value; };
  document.querySelector('#diag-candidate').onchange = e => { state.diagCandidate = e.target.value; };
  document.querySelector('#diag-run').onclick = () => {
    const b = document.querySelector('#diag-baseline')?.value ?? baselineId;
    const c = document.querySelector('#diag-candidate')?.value ?? candidateId;
    runDiagnostics(b, c);
  };
  if (state.lastDiagResult) renderDiagOutput(state.lastDiagResult);
}

export async function runDiagnostics(baselineId, candidateId) {
  const out = document.querySelector('#diag-output');
  out.innerHTML = '<div class="diag-skeleton"><div class="skeleton-card"><div class="skeleton skeleton-line medium"></div><div class="skeleton skeleton-line short"></div><div class="skeleton skeleton-block"></div></div><div class="skeleton-card"><div class="skeleton skeleton-line medium"></div><div class="skeleton skeleton-line short"></div><div class="skeleton skeleton-block"></div></div></div>';
  const idx = state.traceIndex ?? await loadTraceIndex();
  if (!idx || !idx.records) {
    out.innerHTML = '<div class="notice warning"><strong>No decision traces.</strong> Run a campaign with decision traces enabled to generate diagnostic evidence.</div>';
    return;
  }
  const traceFiles = await Promise.all(idx.records.map(r => loadTraceData(r.matchId)));
  const allDecisions = [];
  for (let i = 0; i < idx.records.length; i += 1) {
    const tf = traceFiles[i];
    if (tf && tf.traces) for (const t of tf.traces) allDecisions.push({ ...t, matchId: idx.records[i].matchId, policyId: t.policyId });
  }
  const summaries = state.observatory?.summaries ?? [];
  const worker = new Worker('worker.js', { type: 'module' });
  worker.onmessage = e => {
    const x = e.data;
    if (x.type === 'diagnostics-result') {
      worker.terminate();
      if (x.ok) {
        state.lastDiagResult = { baseline: x.baseline, candidate: x.candidate };
        renderDiagOutput(state.lastDiagResult);
      } else {
        out.innerHTML = `<div class="notice warning"><strong>Diagnostics failed:</strong> ${esc(x.error ?? 'unknown error')}</div>`;
      }
    }
  };
  worker.onerror = e => { worker.terminate(); out.innerHTML = `<div class="notice warning"><strong>Worker error:</strong> ${esc(e.message)}</div>`; };
  worker.postMessage({ type: 'run-diagnostics', summariesJson: JSON.stringify(summaries), decisionsJson: JSON.stringify(allDecisions), baselinePolicyId: baselineId, candidatePolicyId: candidateId });
}

function renderDiagOutput({ baseline, candidate }) {
  const out = document.querySelector('#diag-output');
  if (!out) return;
  out.innerHTML = `<div class="grid two"><div>${renderDiagResult(baseline)}</div><div>${renderDiagResult(candidate)}</div></div>${renderDiagComparison(baseline, candidate)}`;
}

function renderDiagResult(d) {
  const m = d.metrics ?? {}, rc = d.resourceConservation ?? {}, ta = d.timingAnalysis ?? {}, lim = d.limitations ?? [];
  const wr = m.winRate != null ? pct(m.winRate) : '—';
  const ci = m.winWilson95 ? [`${pct(m.winWilson95[0])} to ${pct(m.winWilson95[1])}`] : '—';
  return `${definitionList([
    ['Policy', d.policyId], ['Matches', d.matchCount], ['Decisions', d.decisionCount],
    ['Win rate', wr], ['Win rate 95% CI', ci], ['Decisive matches', m.decisiveMatches ?? '—'],
    ['Decision margin mean', m.decisionMarginMean != null ? Number(m.decisionMarginMean).toFixed(2) : '—'],
    ['Decision margin median', m.decisionMarginMedian != null ? Number(m.decisionMarginMedian).toFixed(2) : '—'],
    ['Self-counter rate', m.selfCounterRate != null ? pct(m.selfCounterRate) : '—'],
    ['Exhausted pass rate', m.exhaustedPassRate != null ? pct(m.exhaustedPassRate) : '—'],
    ['Response decline rate', rc.responseDeclineRate != null ? pct(rc.responseDeclineRate) : '—'],
    ['Response play rate', rc.responsePlayRate != null ? pct(rc.responsePlayRate) : '—'],
    ['Quick count', ta.quickCount ?? 0], ['Interrupt count', ta.interruptCount ?? 0],
    ['Diagnostics hash', short(d.diagnosticsHash)]
  ])}${d.lowMarginDecisions?.length ? `<h3>Low-margin decisions (${d.lowMarginDecisions.length})</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Decision</th><th>Margin</th><th>Action</th></tr></thead><tbody>${d.lowMarginDecisions.slice(0, 20).map(d => `<tr><td class="mono">${short(d.decisionId)}</td><td>${d.margin}</td><td>${esc(d.action)}</td></tr>`).join('')}</tbody></table></div>` : ''}${d.highRiskDecisions?.length ? `<h3>High-risk decisions (${d.highRiskDecisions.length})</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Decision</th><th>Issue</th><th>Family</th></tr></thead><tbody>${d.highRiskDecisions.slice(0, 20).map(d => `<tr><td class="mono">${short(d.decisionId)}</td><td>${esc(d.issue)}</td><td>${esc(d.family)}</td></tr>`).join('')}</tbody></table></div>` : ''}${lim.length ? `<div class="notice warning"><strong>Limitations:</strong> ${esc(lim.join(' '))}</div>` : ''}`;
}

function renderDiagComparison(base, cand) {
  const wrDelta = (cand.metrics?.winRate ?? 0) - (base.metrics?.winRate ?? 0);
  const scDelta = (cand.metrics?.selfCounterRate ?? 0) - (base.metrics?.selfCounterRate ?? 0);
  const dmDelta = (cand.metrics?.decisionMarginMean ?? 0) - (base.metrics?.decisionMarginMean ?? 0);
  return `<section class="panel" style="margin-top:16px"><div class="panel-header"><div><h2>Policy comparison</h2><p>${esc(base.policyId)} vs ${esc(cand.policyId)}</p></div></div><div class="grid four">${[['Win rate Δ', wrDelta, 'percent'], ['Self-counter Δ', scDelta, 'percent'], ['Margin Δ', dmDelta, 'number']].map(([label, v, type]) => `<div class="metric-card"><small>${esc(label)}</small><div class="metric-value ${v >= 0 ? 'positive' : 'negative'}">${type === 'percent' ? `${(v * 100).toFixed(1)} pp` : v.toFixed(2)}</div></div>`).join('')}</div><div class="notice warning"><strong>Interpretation:</strong> Policy comparison is descriptive. Win-rate differences require uncertainty quantification and multiple opponents before promotion.</div></section>`;
}
