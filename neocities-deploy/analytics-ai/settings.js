// ═══════════════════════════════════════════════════════════════
// settings.js — Analytics AI settings panel. Rendered inside the
// /evidence workspace. All controls persist immediately via the
// browser controller.
// ═══════════════════════════════════════════════════════════════

import { esc } from '../state.js?v=75c53031ef21';
import { isLocalEndpoint } from './browser-controller.js?v=75c53031ef21';

/**
 * Render the settings + connection block into a container element.
 * @param {HTMLElement} container
 * @param {BrowserAnalyticsAi} ai
 * @param {function} onSettingsChanged - called after a setting changes
 */
export function renderAnalyticsAiSettings(container, ai, onSettingsChanged) {
  const s = ai.settings;
  const conn = ai.connection;
  const local = isLocalEndpoint(s.endpoint);
  const modelOptions = conn.models.length
    ? conn.models.map(m => `<option value="${esc(m.name)}" ${m.name === s.model ? 'selected' : ''}>${esc(m.name)}${m.size ? ` (${formatBytes(m.size)})` : ''}</option>`).join('')
    : `<option value="${esc(s.model)}" ${s.model ? 'selected' : ''}>${s.model ? esc(s.model) + ' (not detected)' : 'No model selected'}</option>`;

  const connBadge = !conn.tested
    ? `<span class="aai-status-badge neutral">Not tested</span>`
    : conn.ok
      ? `<span class="aai-status-badge ok">Connected · ${esc(conn.version?.version || 'Ollama')}</span>`
      : `<span class="aai-status-badge danger">Unreachable${conn.error ? ` · ${esc(conn.error)}` : ''}</span>`;

  container.innerHTML = `<div class="aai-settings">
    <div class="aai-settings-header">
      <div><h3>Analytics AI</h3><p>Optional local-LLM interpretation layer powered by Ollama. Processing stays local by default.</p></div>
      <label class="aai-toggle"><input type="checkbox" id="aai-enabled" ${s.enabled ? 'checked' : ''}/><span>Enable Analytics AI</span></label>
    </div>
    ${!local ? `<div class="aai-warning" role="alert"><strong>Non-local endpoint.</strong> This endpoint is not on localhost. Data will be sent to ${esc(s.endpoint)}. Only continue if you trust that host. <label class="aai-ack"><input type="checkbox" id="aai-ack-nonlocal" ${s.acknowledgeNonLocal ? 'checked' : ''}/><span>I acknowledge this endpoint is non-local.</span></label></div>` : ''}
    <div class="aai-grid">
      <label class="aai-field"><span>Ollama endpoint</span><input type="text" id="aai-endpoint" value="${esc(s.endpoint)}" placeholder="http://localhost:11434"/></label>
      <div class="aai-field aai-conn"><span>Connection</span><div class="aai-conn-row">${connBadge}<button id="aai-test" class="secondary-button" type="button">Test</button><button id="aai-refresh" class="secondary-button" type="button">Refresh models</button></div></div>
      <label class="aai-field"><span>Model</span><select id="aai-model">${modelOptions}</select></label>
      <label class="aai-field"><span>Temperature</span><input type="number" id="aai-temp" value="${s.temperature}" min="0" max="2" step="0.1"/></label>
      <label class="aai-field"><span>Context budget (tokens)</span><input type="number" id="aai-ctx" value="${s.contextBudgetTokens}" min="1024" max="131072" step="512"/></label>
      <label class="aai-field"><span>Max response tokens</span><input type="number" id="aai-maxtok" value="${s.maxGeneratedTokens}" min="256" max="32768" step="128"/></label>
      <label class="aai-field"><span>Request timeout (ms)</span><input type="number" id="aai-timeout" value="${s.requestTimeoutMs}" min="5000" max="600000" step="1000"/></label>
    </div>
    <div class="aai-toggles">
      <label class="aai-toggle"><input type="checkbox" id="aai-stream" ${s.streaming ? 'checked' : ''}/><span>Streaming</span></label>
      <label class="aai-toggle"><input type="checkbox" id="aai-auto" ${s.autoAnalyze ? 'checked' : ''}/><span>Auto-analyze completed runs</span></label>
      <label class="aai-toggle"><input type="checkbox" id="aai-rules" ${s.includeOfficialRules ? 'checked' : ''}/><span>Include official rules context</span></label>
      <label class="aai-toggle"><input type="checkbox" id="aai-telemetry" ${s.includeAiDecisionTelemetry ? 'checked' : ''}/><span>Include AI decision telemetry</span></label>
      <label class="aai-toggle"><input type="checkbox" id="aai-historical" ${s.includeHistoricalComparisons ? 'checked' : ''}/><span>Include historical comparisons</span></label>
      <label class="aai-toggle"><input type="checkbox" id="aai-dev" ${s.developerMode ? 'checked' : ''}/><span>Developer/debug mode</span></label>
    </div>
    <details class="aai-advanced">
      <summary>Advanced: system prompt override</summary>
      <textarea id="aai-sysprompt" rows="4" placeholder="Leave blank to use the built-in grounded system prompt.">${esc(s.systemPromptOverride)}</textarea>
      <button id="aai-reset" class="secondary-button" type="button">Reset to defaults</button>
    </details>
  </div>`;

  // ── Wire up controls ──
  const bind = (id, key, transform = (v) => v) => {
    const el = container.querySelector(`#${id}`);
    if (!el) return;
    const handler = () => {
      const v = el.type === 'checkbox' ? el.checked : transform(el.value);
      ai.saveSettings({ [key]: v });
      onSettingsChanged();
    };
    el.addEventListener('change', handler);
  };
  bind('aai-enabled', 'enabled');
  bind('aai-ack-nonlocal', 'acknowledgeNonLocal');
  bind('aai-endpoint', 'endpoint', (v) => v.trim());
  bind('aai-model', 'model');
  bind('aai-temp', 'temperature', (v) => Number(v));
  bind('aai-ctx', 'contextBudgetTokens', (v) => Number(v));
  bind('aai-maxtok', 'maxGeneratedTokens', (v) => Number(v));
  bind('aai-timeout', 'requestTimeoutMs', (v) => Number(v));
  bind('aai-stream', 'streaming');
  bind('aai-auto', 'autoAnalyze');
  bind('aai-rules', 'includeOfficialRules');
  bind('aai-telemetry', 'includeAiDecisionTelemetry');
  bind('aai-historical', 'includeHistoricalComparisons');
  bind('aai-dev', 'developerMode');
  bind('aai-sysprompt', 'systemPromptOverride');

  const testBtn = container.querySelector('#aai-test');
  if (testBtn) testBtn.addEventListener('click', async () => {
    testBtn.disabled = true; testBtn.textContent = 'Testing…';
    await ai.testConnection();
    testBtn.disabled = false; testBtn.textContent = 'Test';
    onSettingsChanged(); // re-render to update model list + badge
  });
  const refreshBtn = container.querySelector('#aai-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true; refreshBtn.textContent = 'Refreshing…';
    await ai.refreshModels();
    refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh models';
    onSettingsChanged();
  });
  const resetBtn = container.querySelector('#aai-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    ai.resetSettings();
    onSettingsChanged();
  });
}

function formatBytes(n) {
  if (!n || !Number.isFinite(n)) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}
