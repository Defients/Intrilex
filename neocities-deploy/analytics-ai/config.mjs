// ═══════════════════════════════════════════════════════════════
// config.mjs — Default settings, schema, and validation for the
// Analytics AI layer. No runtime dependencies; pure data + helpers.
// ═══════════════════════════════════════════════════════════════

// Bumped whenever the system prompt contract changes. Included in
// cache keys so prompt edits invalidate cached analyses.
export const SYSTEM_PROMPT_VERSION = '1.0.0';
export const ANALYTICS_AI_SCHEMA_VERSION = '1.0.0';

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';

// Conservative defaults that keep the first-run experience safe and
// predictable. Users can raise these from the settings panel.
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  endpoint: DEFAULT_OLLAMA_ENDPOINT,
  model: '',
  requestTimeoutMs: 60000,
  contextBudgetTokens: 8192,
  maxGeneratedTokens: 2048,
  temperature: 0.2,
  systemPromptOverride: '',
  streaming: true,
  autoAnalyze: false,
  includeOfficialRules: true,
  includeAiDecisionTelemetry: true,
  includeHistoricalComparisons: true,
  developerMode: false,
  // Non-local endpoints are allowed but flagged prominently in the UI.
  acknowledgeNonLocal: false
});

// Numeric bounds used by validateSettings to clamp/repair bad input.
export const SETTINGS_BOUNDS = Object.freeze({
  requestTimeoutMs: { min: 5000, max: 600000 },
  contextBudgetTokens: { min: 1024, max: 131072 },
  maxGeneratedTokens: { min: 256, max: 32768 },
  temperature: { min: 0, max: 2 }
});

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

/**
 * Determine whether an endpoint points to a loopback / local address.
 * Used to decide whether to show the non-local warning banner.
 */
export function isLocalEndpoint(endpoint) {
  if (!endpoint) return true;
  try {
    const u = new URL(endpoint);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    // 127.0.0.0/8 loopback range
    const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (m && Number(m[1]) === 127) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Validate and repair a settings object. Returns a new settings object
 * with defaults filled in, numeric bounds enforced, and types coerced.
 * Never throws — bad input is repaired to safe defaults.
 */
export function normalizeSettings(input = {}) {
  const out = { ...DEFAULT_SETTINGS };
  if (input && typeof input === 'object') {
    for (const key of SETTING_KEYS) {
      if (key in input && input[key] !== undefined && input[key] !== null) {
        out[key] = input[key];
      }
    }
  }
  // Type coercion + bounds
  out.enabled = Boolean(out.enabled);
  out.streaming = Boolean(out.streaming);
  out.autoAnalyze = Boolean(out.autoAnalyze);
  out.includeOfficialRules = Boolean(out.includeOfficialRules);
  out.includeAiDecisionTelemetry = Boolean(out.includeAiDecisionTelemetry);
  out.includeHistoricalComparisons = Boolean(out.includeHistoricalComparisons);
  out.developerMode = Boolean(out.developerMode);
  out.acknowledgeNonLocal = Boolean(out.acknowledgeNonLocal);
  out.endpoint = typeof out.endpoint === 'string' && out.endpoint.trim() ? out.endpoint.trim() : DEFAULT_OLLAMA_ENDPOINT;
  out.model = typeof out.model === 'string' ? out.model.trim() : '';
  out.systemPromptOverride = typeof out.systemPromptOverride === 'string' ? out.systemPromptOverride : '';
  out.requestTimeoutMs = clampInt(out.requestTimeoutMs, SETTINGS_BOUNDS.requestTimeoutMs);
  out.contextBudgetTokens = clampInt(out.contextBudgetTokens, SETTINGS_BOUNDS.contextBudgetTokens);
  out.maxGeneratedTokens = clampInt(out.maxGeneratedTokens, SETTINGS_BOUNDS.maxGeneratedTokens);
  out.temperature = clampNum(out.temperature, SETTINGS_BOUNDS.temperature);
  return out;
}

function clampInt(v, { min, max }) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampNum(v, { min, max }) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Diff two settings objects, returning only the keys that changed.
 * Used to decide whether cached analyses must be invalidated.
 */
export function settingsDiff(a, b) {
  const aa = normalizeSettings(a);
  const bb = normalizeSettings(b);
  const changed = [];
  for (const key of SETTING_KEYS) {
    if (aa[key] !== bb[key]) changed.push(key);
  }
  return changed;
}
