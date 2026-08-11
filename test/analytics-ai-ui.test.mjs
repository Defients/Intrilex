import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Static contract tests for the Analytics AI browser UI. These verify the
// source files declare the expected exports, DOM hooks, states, and
// accessibility hooks — mirroring the project's browser-contract pattern.

const read = async (p) => readFile(p, 'utf8');

test('analytics-ai ui: index.html CSP allows localhost Ollama endpoints', async () => {
  const html = await read('apps/lab-web/src/index.html');
  assert.match(html, /connect-src 'self' http:\/\/localhost:\*/);
  assert.match(html, /http:\/\/127\.0\.0\.1:\*/);
});

test('analytics-ai ui: intelligence workspace mounts the Analytics AI panel', async () => {
  const js = await read('apps/lab-web/src/workspaces/intelligence.js');
  assert.match(js, /import \{ renderAnalyticsAiPanel \} from '\.\.\/analytics-ai\/intelligence-panel\.js'/);
  assert.match(js, /analytics-ai-mount/);
  assert.match(js, /ensureAnalyticsAiStyles/);
});

test('analytics-ai ui: evidence workspace no longer embeds the Analytics AI panel', async () => {
  const js = await read('apps/lab-web/src/workspaces/evidence.js');
  assert.doesNotMatch(js, /renderAnalyticsAiPanel/);
  assert.doesNotMatch(js, /analytics-ai-mount/);
});

test('analytics-ai ui: router defines /intelligence route under System section', async () => {
  const js = await read('apps/lab-web/src/router.js');
  assert.match(js, /\['\/intelligence','✦','Analytics AI','Ollama interpretation'\]/);
  assert.match(js, /System.*routes: \['\/evidence', '\/release-notes', '\/intelligence'\]/);
  assert.match(js, /'\/intelligence':'Optional local-LLM/);
});

test('analytics-ai ui: app.js dispatches /intelligence to renderIntelligence', async () => {
  const js = await read('apps/lab-web/src/app.js');
  assert.match(js, /import \{ renderIntelligence \} from '\.\/workspaces\/intelligence\.js'/);
  assert.match(js, /'\/intelligence': renderIntelligence/);
});

test('analytics-ai ui: intelligence-panel exports renderAnalyticsAiPanel and defines all view renderers', async () => {
  const js = await read('apps/lab-web/src/analytics-ai/intelligence-panel.js');
  assert.match(js, /export function renderAnalyticsAiPanel/);
  // Required views (spec §7)
  assert.match(js, /renderSummary/);
  assert.match(js, /renderFindings/);
  assert.match(js, /renderWatchlist/);
  assert.match(js, /renderAnomalies/);
  assert.match(js, /renderEvidenceTable/);
  assert.match(js, /renderFollowUps/);
  // Deterministic warnings shown separately from LLM output
  assert.match(js, /renderDeterministicWarnings/);
  assert.match(js, /not LLM-generated/);
  // Analysis modes
  assert.match(js, /EXECUTIVE_SUMMARY/);
  assert.match(js, /BALANCE/);
  assert.match(js, /ANOMALY/);
  assert.match(js, /ASK/);
});

test('analytics-ai ui: intelligence-panel handles disabled, loading, streaming, cancellation, error, cached states', async () => {
  const js = await read('apps/lab-web/src/analytics-ai/intelligence-panel.js');
  assert.match(js, /aai-disabled-notice/); // disabled state
  assert.match(js, /Working…/); // loading state
  assert.match(js, /Streaming response/); // streaming state
  assert.match(js, /ai\.cancel/); // cancellation
  assert.match(js, /aai-error/); // error state
  assert.match(js, /fromCache/); // cached result
  assert.match(js, /Regenerate/); // regeneration (ignores cache)
});

test('analytics-ai ui: settings panel exposes all required configuration controls', async () => {
  const js = await read('apps/lab-web/src/analytics-ai/settings.js');
  assert.match(js, /aai-enabled/); // Enable Analytics AI
  assert.match(js, /aai-endpoint/); // Ollama endpoint
  assert.match(js, /aai-test/); // Connection test
  assert.match(js, /aai-refresh/); // Refresh installed models
  assert.match(js, /aai-model/); // Model selector
  assert.match(js, /aai-temp/); // Temperature
  assert.match(js, /aai-ctx/); // Context budget
  assert.match(js, /aai-maxtok/); // Max response length
  assert.match(js, /aai-stream/); // Streaming
  assert.match(js, /aai-auto/); // Auto-analyze
  assert.match(js, /aai-rules/); // Include official rules
  assert.match(js, /aai-telemetry/); // Include AI decision telemetry
  assert.match(js, /aai-historical/); // Include historical comparisons
  assert.match(js, /aai-dev/); // Developer/debug mode
  assert.match(js, /aai-reset/); // Reset to defaults
  assert.match(js, /aai-timeout/); // Request timeout
});

test('analytics-ai ui: settings panel warns about non-local endpoints', async () => {
  const js = await read('apps/lab-web/src/analytics-ai/settings.js');
  assert.match(js, /Non-local endpoint/);
  assert.match(js, /aai-ack-nonlocal/);
});

test('analytics-ai ui: browser-controller persists settings and manages cache + cancellation', async () => {
  const js = await read('apps/lab-web/src/analytics-ai/browser-controller.js');
  assert.match(js, /intrilex-analytics-ai-settings/); // localStorage key
  assert.match(js, /saveSettings/);
  assert.match(js, /resetSettings/);
  assert.match(js, /testConnection/);
  assert.match(js, /refreshModels/);
  assert.match(js, /_abortController/); // cancellation
  assert.match(js, /cancel\(\)/);
  assert.match(js, /clearCache/);
  assert.match(js, /AnalysisCache/); // cache with localStorage adapter
  assert.match(js, /subscribe/); // live status updates
});

test('analytics-ai ui: controller never blocks simulation execution when disabled', async () => {
  const js = await read('apps/lab-web/src/analytics-ai/browser-controller.js');
  // The controller is lazily constructed (getAnalyticsAi) and the panel is
  // only rendered inside /evidence. Verify no top-level side effects.
  assert.match(js, /let _instance = null/);
  assert.match(js, /export function getAnalyticsAi/);
});

test('analytics-ai ui: debug panel is gated behind developer mode and shows transparency fields', async () => {
  const js = await read('apps/lab-web/src/analytics-ai/intelligence-panel.js');
  assert.match(js, /s\.developerMode && result\?\.ok/);
  assert.match(js, /renderDebugPanel/);
  assert.match(js, /System prompt/);
  assert.match(js, /Raw model response/);
  assert.match(js, /Context sources/);
  assert.match(js, /Context omitted/);
  assert.match(js, /Sanitization flags/);
  assert.match(js, /Repair used/);
});

test('analytics-ai ui: evidence expansion is accessible via keyboard (details/summary)', async () => {
  const js = await read('apps/lab-web/src/analytics-ai/intelligence-panel.js');
  // Findings use <details> for keyboard-accessible expansion
  assert.match(js, /<details class="aai-finding"/);
  assert.match(js, /<details class="aai-watch-item"/);
});

test('analytics-ai ui: keyboard focus visibility is styled for accessibility', async () => {
  const css = await read('apps/lab-web/src/analytics-ai/styles.css');
  assert.match(css, /focus-visible/);
});

test('analytics-ai ui: confidence labels use the spec language (strong/moderate/weak/insufficient)', async () => {
  const js = await read('apps/lab-web/src/analytics-ai/intelligence-panel.js');
  assert.match(js, /Strong evidence/);
  assert.match(js, /Moderate evidence/);
  assert.match(js, /Weak evidence/);
  assert.match(js, /Insufficient evidence/);
});

test('analytics-ai ui: anomaly classifications render with distinct classes', async () => {
  const js = await read('apps/lab-web/src/analytics-ai/intelligence-panel.js');
  assert.match(js, /LIKELY_BALANCE_ISSUE/);
  assert.match(js, /LIKELY_AI_POLICY_ISSUE/);
  assert.match(js, /LIKELY_ENGINE_OR_RULES_BUG/);
  assert.match(js, /LIKELY_ANALYTICS_BUG/);
  assert.match(js, /LIKELY_SAMPLE_NOISE/);
  assert.match(js, /INSUFFICIENT_EVIDENCE/);
  assert.match(js, /EXPECTED_BEHAVIOR/);
});

test('analytics-ai ui: build.mjs copies the package core into dist', async () => {
  const build = await read('scripts/build.mjs');
  assert.match(build, /packages\/analytics-ai\/src/);
  assert.match(build, /analytics-ai/);
});

test('analytics-ai ui: dev-server serves .mjs with javascript MIME and watches package src', async () => {
  const dev = await read('scripts/dev-server.mjs');
  assert.match(dev, /'\.mjs': 'text\/javascript/);
  assert.match(dev, /packages\/analytics-ai\/src/);
  assert.match(dev, /\.\(js\|mjs\|css/);
});

test('analytics-ai ui: stylesheet exists and defines panel + badge classes', async () => {
  const css = await read('apps/lab-web/src/analytics-ai/styles.css');
  assert.match(css, /\.aai-panel/);
  assert.match(css, /\.aai-badge/);
  assert.match(css, /\.aai-conf/);
  assert.match(css, /\.aai-debug/);
});
