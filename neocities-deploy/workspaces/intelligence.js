// ═══════════════════════════════════════════════════════════════
// workspaces/intelligence.js — /intelligence workspace: hosts the
// Ollama-powered Analytics AI panel as a full top-level workspace
// under the System nav section.
// ═══════════════════════════════════════════════════════════════

import { state, app, esc } from '../state.js?v=42162e3d88b3';
import { renderAnalyticsAiPanel } from '../analytics-ai/intelligence-panel.js?v=42162e3d88b3';

export function renderIntelligence() {
  // Clean up any previous Analytics AI subscription before wiping innerHTML.
  if (typeof app._aaiUnsub === 'function') { try { app._aaiUnsub(); } catch { /* ignore */ } app._aaiUnsub = null; }
  app.innerHTML = `<div class="notice info" style="margin-bottom:12px"><strong>Analytics AI is optional and local by default.</strong><p>Interpretations are grounded in the active simulation dataset. Deterministic warnings are computed locally and shown separately from LLM output. No remote data transmission occurs unless you configure a non-local Ollama endpoint.</p></div>
  <div id="analytics-ai-mount"></div>`;
  ensureAnalyticsAiStyles();
  const mount = app.querySelector('#analytics-ai-mount');
  if (mount) {
    try { renderAnalyticsAiPanel(mount); }
    catch (err) {
      console.error('[intelligence] Analytics AI panel failed to render:', err);
      mount.innerHTML = `<div class="notice danger"><strong>Analytics AI panel error.</strong><pre>${esc(err.stack ?? err.message)}</pre></div>`;
    }
  }
}

// Inject the Analytics AI stylesheet once. Idempotent.
let _stylesInjected = false;
function ensureAnalyticsAiStyles() {
  if (_stylesInjected) return;
  if (document.querySelector('link[data-aai-css]')) { _stylesInjected = true; return; }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'analytics-ai/styles.css';
  link.dataset.aaiCss = '1';
  document.head.appendChild(link);
  _stylesInjected = true;
}
