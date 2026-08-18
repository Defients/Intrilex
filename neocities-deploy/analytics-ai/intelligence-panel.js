// ═══════════════════════════════════════════════════════════════
// intelligence-panel.js — Analytics AI interpretation panel. Hosts the
// analysis modes (Executive Summary, Balance, Anomaly, Ask), renders
// structured results, and shows deterministic warnings separately from
// LLM interpretations. Grounded in the active Observatory dataset.
// ═══════════════════════════════════════════════════════════════

import { state, esc } from '../state.js?v=3dca2dc8fde5';
import { getAnalyticsAi, ANALYSIS_MODE, ANALYSIS_STATUS } from './browser-controller.js?v=3dca2dc8fde5';
import { renderAnalyticsAiSettings } from './settings.js?v=3dca2dc8fde5';

const MODE_TABS = [
  { id: ANALYSIS_MODE.EXECUTIVE_SUMMARY, label: 'Summary', hint: 'Plain-language overview' },
  { id: ANALYSIS_MODE.BALANCE, label: 'Balance', hint: 'Over/underpowered watchlist' },
  { id: ANALYSIS_MODE.ANOMALY, label: 'Anomalies', hint: 'Internally inconsistent results' },
  { id: ANALYSIS_MODE.ASK, label: 'Ask', hint: 'Natural-language questions' }
];

let _activeMode = ANALYSIS_MODE.EXECUTIVE_SUMMARY;
let _askInput = '';
let _showDebug = false;

/**
 * Render the full Analytics AI panel into the given container.
 * Called by the /evidence workspace.
 */
export function renderAnalyticsAiPanel(container) {
  const ai = getAnalyticsAi();
  const snap = ai._snapshot();
  container.innerHTML = `<section class="panel aai-panel" aria-labelledby="aai-title">
    <div class="panel-header"><div><p class="eyebrow">OLLAMA ANALYTICS INTELLIGENCE</p><h2 id="aai-title">Analytics AI</h2><p>Grounded interpretation of the active simulation dataset. Deterministic warnings are computed locally; LLM interpretations are clearly labelled.</p></div>
      <div class="aai-header-actions">
        <span class="aai-prompt-ver" title="System prompt version">prompt v${esc(snap.systemPromptVersion)}</span>
        <button id="aai-clear-cache" class="secondary-button" type="button" title="Clear cached analyses">Clear cache</button>
      </div>
    </div>
    <div class="panel-body">
      <div id="aai-settings-mount"></div>
      <div id="aai-controls-mount"></div>
      <div id="aai-results-mount"></div>
    </div>
  </section>`;

  const settingsMount = container.querySelector('#aai-settings-mount');
  const controlsMount = container.querySelector('#aai-controls-mount');
  const resultsMount = container.querySelector('#aai-results-mount');

  const rerender = () => {
    renderAnalyticsAiSettings(settingsMount, ai, rerender);
    renderControls(controlsMount, ai, rerender);
    renderResults(resultsMount, ai, rerender);
  };
  rerender();

  // Subscribe to live status updates (streaming, completion, errors).
  const unsub = ai.subscribe(() => {
    // Only re-render the results + controls, not the settings (avoids
    // stealing focus from inputs the user is editing).
    renderControls(controlsMount, ai, rerender);
    renderResults(resultsMount, ai, rerender);
  });
  // Store unsubscribe on the container so re-renders of /evidence can clean up.
  container._aaiUnsub = unsub;

  const clearBtn = container.querySelector('#aai-clear-cache');
  if (clearBtn) clearBtn.addEventListener('click', () => { ai.clearCache(); rerender(); });
}

function renderControls(mount, ai, rerender) {
  const s = ai.settings;
  if (!s.enabled) {
    mount.innerHTML = `<div class="aai-disabled-notice">Analytics AI is disabled. Enable it above and connect to an Ollama instance to run interpretations.</div>`;
    return;
  }
  if (!s.model) {
    mount.innerHTML = `<div class="aai-disabled-notice">No model selected. Choose a model in the settings above (use “Refresh models” after testing the connection).</div>`;
    return;
  }
  const running = ai.status === ANALYSIS_STATUS.BUILDING_CONTEXT || ai.status === ANALYSIS_STATUS.REQUESTING || ai.status === ANALYSIS_STATUS.STREAMING || ai.status === ANALYSIS_STATUS.VALIDATING || ai.status === ANALYSIS_STATUS.REPAIRING;
  const tabs = MODE_TABS.map(t => `<button class="aai-tab ${t.id === _activeMode ? 'active' : ''}" data-mode="${t.id}" type="button" title="${esc(t.hint)}">${esc(t.label)}</button>`).join('');
  const askRow = _activeMode === ANALYSIS_MODE.ASK
    ? `<div class="aai-ask-row"><input type="search" id="aai-ask-input" value="${esc(_askInput)}" placeholder="e.g. Why is Anchor usage so low? Does Rank 7 look overtuned?" aria-label="Ask the analytics a question"/><button id="aai-ask-go" class="primary-button" type="button" ${running ? 'disabled' : ''}>Ask</button></div>`
    : '';
  mount.innerHTML = `<div class="aai-controls">
    <div class="aai-tabs" role="tablist">${tabs}</div>
    ${askRow}
    <div class="aai-run-row">
      <button id="aai-run" class="primary-button" type="button" ${running ? 'disabled' : ''}>${running ? 'Working…' : 'Run analysis'}</button>
      <button id="aai-cancel" class="secondary-button" type="button" ${running ? '' : 'disabled'}>Cancel</button>
      <button id="aai-regen" class="secondary-button" type="button" ${running ? 'disabled' : ''} title="Re-run ignoring the cache">Regenerate</button>
      <span class="aai-status-line" id="aai-status-line">${esc(statusLabel(ai.status))}</span>
    </div>
  </div>`;

  mount.querySelectorAll('.aai-tab').forEach(btn => {
    btn.addEventListener('click', () => { _activeMode = btn.dataset.mode; rerender(); });
  });
  const runBtn = mount.querySelector('#aai-run');
  if (runBtn) runBtn.addEventListener('click', () => runAnalysis(ai, { useCache: true }));
  const regenBtn = mount.querySelector('#aai-regen');
  if (regenBtn) regenBtn.addEventListener('click', () => runAnalysis(ai, { useCache: false }));
  const cancelBtn = mount.querySelector('#aai-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => ai.cancel());
  const askInput = mount.querySelector('#aai-ask-input');
  if (askInput) {
    askInput.addEventListener('input', () => { _askInput = askInput.value; });
    askInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runAnalysis(ai, { useCache: true }); } });
  }
  const askGo = mount.querySelector('#aai-ask-go');
  if (askGo) askGo.addEventListener('click', () => runAnalysis(ai, { useCache: true }));
}

async function runAnalysis(ai, { useCache }) {
  const mode = _activeMode;
  const question = mode === ANALYSIS_MODE.ASK ? _askInput.trim() : null;
  if (mode === ANALYSIS_MODE.ASK && !question) return;
  await ai.analyze({ state, mode, question, useCache });
}

function renderResults(mount, ai, rerender) {
  const s = ai.settings;
  if (!s.enabled || !s.model) { mount.innerHTML = ''; return; }

  // Deterministic warnings are always shown (computed locally, no LLM).
  const detWarnings = ai.deterministicWarnings(state);
  const detBlock = renderDeterministicWarnings(detWarnings);

  const result = ai.lastResult;
  const streaming = ai.status === ANALYSIS_STATUS.STREAMING && ai.streamingText;
  const errorBlock = renderError(ai);
  const resultBlock = result?.ok ? renderAnalysisResult(result, ai) : '';
  const debugBlock = (s.developerMode && result?.ok) ? renderDebugPanel(result, ai, rerender) : '';

  mount.innerHTML = `<div class="aai-results">
    ${detBlock}
    ${errorBlock}
    ${streaming ? `<details class="aai-streaming" open><summary>Streaming response…</summary><pre class="aai-stream-pre">${esc(ai.streamingText)}</pre></details>` : ''}
    ${resultBlock}
    ${debugBlock}
  </div>`;
}

function renderDeterministicWarnings(warnings) {
  if (!warnings.length) {
    return `<section class="aai-det aai-det-ok" aria-label="Deterministic checks"><div class="aai-det-head"><h4>Deterministic checks</h4><span class="aai-badge ok">0 warnings</span></div><p>No factual anomalies detected by the local pre-computation layer.</p></section>`;
  }
  const high = warnings.filter(w => w.severity === 'high' || w.severity === 'critical').length;
  const rows = warnings.map(w => `<tr><td><span class="aai-badge ${w.severity}">${esc(w.severity)}</span></td><td><b>${esc(w.check)}</b></td><td>${esc(w.title)}</td><td>${esc(w.detail)}</td></tr>`).join('');
  return `<section class="aai-det" aria-label="Deterministic checks">
    <div class="aai-det-head"><h4>Deterministic checks <small>— computed locally, not LLM-generated</small></h4><span class="aai-badge ${high ? 'high' : 'ok'}">${warnings.length} warning${warnings.length === 1 ? '' : 's'}${high ? ` · ${high} high` : ''}</span></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Severity</th><th>Check</th><th>Title</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

function renderError(ai) {
  if (ai.status !== ANALYSIS_STATUS.ERROR) return '';
  const r = ai.lastResult;
  if (r?.ok) return '';
  // The last analyze() result is stored only on success; for errors we
  // rely on the controller return value captured in runAnalysis. To keep
  // the panel reactive, we surface a generic error line plus streaming text.
  const msg = ai.streamingText ? '' : 'The last analysis request failed. Check the connection and model, then try again. Details are available in the browser console.';
  return `<div class="aai-error" role="alert"><strong>Analysis error.</strong> ${esc(msg)}</div>`;
}

function renderAnalysisResult(result, ai) {
  const a = result.analysis;
  const sections = [];
  sections.push(renderSummary(a));
  sections.push(renderHealth(a));
  sections.push(renderFindings(a));
  sections.push(renderWatchlist(a));
  sections.push(renderAnomalies(a));
  sections.push(renderEvidenceTable(a));
  sections.push(renderDataLimitations(a));
  sections.push(renderFollowUps(a));
  const cached = result.fromCache ? `<span class="aai-badge ok" title="Returned from cache">cached</span>` : '';
  const conf = confidenceLabel(a.overallConfidence);
  return `<section class="aai-output" aria-label="LLM analysis output">
    <div class="aai-output-head"><h4>Interpretation <small>— LLM-generated, grounded in the data above</small></h4><div><span class="aai-conf ${conf.cls}">${esc(conf.label)} · ${(a.overallConfidence * 100).toFixed(0)}%</span>${cached}</div></div>
    ${sections.join('')}
  </section>`;
}

function renderSummary(a) {
  if (!a.summary) return '';
  return `<div class="aai-block"><h5>Summary</h5><p class="aai-summary">${esc(a.summary)}</p></div>`;
}

function renderHealth(a) {
  const h = a.healthAssessment || {};
  return `<div class="aai-block aai-health"><h5>Health assessment</h5><p><span class="aai-badge ${healthClass(h.status)}">${esc(h.status)}</span> ${esc(h.explanation || '')}</p></div>`;
}

function renderFindings(a) {
  if (!a.keyFindings?.length) return '';
  const items = a.keyFindings.map(f => {
    const conf = confidenceLabel(f.confidence);
    return `<details class="aai-finding">
      <summary><span class="aai-badge ${f.severity}">${esc(f.severity)}</span><span class="aai-badge ${f.classification}">${esc(f.classification)}</span> <b>${esc(f.title)}</b> <span class="aai-conf ${conf.cls}">${esc(conf.label)}</span></summary>
      <div class="aai-finding-body">
        <p><b>Observation:</b> ${esc(f.observation)}</p>
        <p><b>Interpretation:</b> ${esc(f.interpretation)}</p>
        ${f.evidence?.length ? `<div class="aai-evidence-mini"><b>Evidence:</b><ul>${f.evidence.map(e => `<li><code>${esc(e.metric)}</code> = ${esc(String(e.value))}${e.comparison ? ` (${esc(e.comparison)})` : ''}${e.sourceId ? ` <small>[${esc(e.sourceId)}]</small>` : ''}</li>`).join('')}</ul></div>` : ''}
        ${f.alternativeExplanations?.length ? `<p><b>Alternative explanations:</b></p><ul>${f.alternativeExplanations.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <p><b>Recommended action:</b> ${esc(f.recommendedAction)}</p>
      </div>
    </details>`;
  }).join('');
  return `<div class="aai-block"><h5>Key findings</h5>${items}</div>`;
}

function renderWatchlist(a) {
  const op = a.potentiallyOverpowered || [];
  const up = a.potentiallyUnderpowered || [];
  if (!op.length && !up.length) return '';
  const renderList = (list, label, cls) => list.length ? `<div class="aai-watchlist ${cls}"><h6>${esc(label)} (${list.length})</h6>${list.map(p => {
    const conf = confidenceLabel(p.confidence);
    return `<details class="aai-watch-item"><summary><b>${esc(p.entity)}</b> <span class="aai-conf ${conf.cls}">${esc(conf.label)}</span></summary>
      <p><b>Verdict:</b> ${esc(p.verdict)}</p>
      ${p.evidenceFor?.length ? `<p><b>Evidence for:</b></p><ul>${p.evidenceFor.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${p.evidenceAgainst?.length ? `<p><b>Evidence against:</b></p><ul>${p.evidenceAgainst.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </details>`;
  }).join('')}</div>` : '';
  return `<div class="aai-block"><h5>Balance watchlist</h5><div class="aai-watchlists">${renderList(op, 'Possibly overpowered', 'op')}${renderList(up, 'Possibly underpowered', 'up')}</div></div>`;
}

function renderAnomalies(a) {
  if (!a.anomalies?.length) return '';
  const rows = a.anomalies.map(an => `<tr><td><b>${esc(an.metric)}</b></td><td>${esc(an.observed)}</td><td>${esc(an.expectedOrReference)}</td><td><span class="aai-badge ${anomalyClass(an.classification)}">${esc(an.classification)}</span></td><td>${(an.confidence * 100).toFixed(0)}%</td><td>${an.possibleCauses?.map(esc).join('; ') || '—'}</td></tr>`).join('');
  return `<div class="aai-block"><h5>Anomalies</h5><div class="table-wrap"><table class="data-table"><thead><tr><th>Metric</th><th>Observed</th><th>Expected</th><th>Classification</th><th>Conf.</th><th>Possible causes</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderEvidenceTable(a) {
  const all = [];
  for (const f of a.keyFindings || []) for (const e of f.evidence || []) all.push({ ...e, finding: f.title });
  if (!all.length) return '';
  const rows = all.map(e => `<tr><td>${esc(e.finding)}</td><td><code>${esc(e.metric)}</code></td><td>${esc(String(e.value))}</td><td>${esc(e.comparison || '—')}</td><td><small>${esc(e.sourceId || '—')}</small></td></tr>`).join('');
  return `<div class="aai-block"><h5>Evidence table</h5><div class="table-wrap"><table class="data-table"><thead><tr><th>Finding</th><th>Metric</th><th>Value</th><th>Comparison</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderDataLimitations(a) {
  if (!a.dataLimitations?.length) return '';
  return `<div class="aai-block aai-limitations"><h5>Data limitations</h5><ul>${a.dataLimitations.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
}

function renderFollowUps(a) {
  if (!a.followUpQuestions?.length) return '';
  return `<div class="aai-block"><h5>Suggested follow-up questions</h5><ul class="aai-followups">${a.followUpQuestions.map(q => `<li><button class="aai-followup-btn" type="button" data-q="${esc(q)}">${esc(q)}</button></li>`).join('')}</ul></div>`;
}

function renderDebugPanel(result, ai, rerender) {
  const d = result.debug || {};
  const body = `<div class="aai-debug-grid">
    <div><b>Model:</b> ${esc(d.model)}</div>
    <div><b>Endpoint:</b> ${esc(d.endpoint)}</div>
    <div><b>Request duration:</b> ${d.requestDurationMs}ms</div>
    <div><b>Context tokens (est.):</b> ${d.contextTokenEstimate}</div>
    <div><b>Context sources:</b> ${esc((d.contextSources || []).join(', ') || '—')}</div>
    <div><b>Context omitted:</b> ${esc((d.contextOmitted || []).join('; ') || '—')}</div>
    <div><b>Context truncated:</b> ${d.contextTruncated ? 'yes' : 'no'}</div>
    <div><b>Sanitization flags:</b> ${esc((d.sanitizationFlags || []).join(', ') || 'none')}</div>
    <div><b>System prompt version:</b> ${esc(d.systemPromptVersion)}</div>
    <div><b>Repair used:</b> ${d.repairUsed ? `yes (${esc(d.repairMethod)})` : 'no'}</div>
  </div>
  <details class="aai-debug-raw"><summary>System prompt</summary><pre>${esc(d.systemPrompt || '')}</pre></details>
  <details class="aai-debug-raw"><summary>User prompt</summary><pre>${esc(d.userPrompt || '')}</pre></details>
  <details class="aai-debug-raw"><summary>Raw model response</summary><pre>${esc(d.rawResponse || '')}</pre></details>`;
  return `<details class="aai-debug" ${_showDebug ? 'open' : ''}><summary>Developer / debug panel</summary>${body}</details>`;
}

function statusLabel(status) {
  const map = {
    [ANALYSIS_STATUS.IDLE]: 'Idle',
    [ANALYSIS_STATUS.BUILDING_CONTEXT]: 'Building context…',
    [ANALYSIS_STATUS.REQUESTING]: 'Requesting…',
    [ANALYSIS_STATUS.STREAMING]: 'Streaming…',
    [ANALYSIS_STATUS.VALIDATING]: 'Validating…',
    [ANALYSIS_STATUS.REPAIRING]: 'Repairing malformed output…',
    [ANALYSIS_STATUS.DONE]: 'Done',
    [ANALYSIS_STATUS.ERROR]: 'Error',
    [ANALYSIS_STATUS.CANCELLED]: 'Cancelled',
    [ANALYSIS_STATUS.CACHED]: 'Cached'
  };
  return map[status] || status;
}

function confidenceLabel(c) {
  const n = Number(c) || 0;
  if (n >= 0.75) return { label: 'Strong evidence', cls: 'strong' };
  if (n >= 0.5) return { label: 'Moderate evidence', cls: 'moderate' };
  if (n >= 0.25) return { label: 'Weak evidence', cls: 'weak' };
  return { label: 'Insufficient evidence', cls: 'insufficient' };
}

function healthClass(status) {
  return ({ healthy: 'ok', mixed: 'warning', concerning: 'high', unreliable: 'danger' })[status] || 'neutral';
}

function anomalyClass(cls) {
  return ({
    LIKELY_BALANCE_ISSUE: 'high',
    LIKELY_AI_POLICY_ISSUE: 'warning',
    LIKELY_ENGINE_OR_RULES_BUG: 'danger',
    LIKELY_ANALYTICS_BUG: 'danger',
    LIKELY_SAMPLE_NOISE: 'neutral',
    INSUFFICIENT_EVIDENCE: 'neutral',
    EXPECTED_BEHAVIOR: 'ok'
  })[cls] || 'neutral';
}
