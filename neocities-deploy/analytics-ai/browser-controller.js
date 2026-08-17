// ═══════════════════════════════════════════════════════════════
// browser-controller.js — Browser adapter for @intrilex/analytics-ai.
// Owns settings persistence (localStorage), cache, connection state,
// and the bridge between the Observatory state and the package core.
// ═══════════════════════════════════════════════════════════════

import { normalizeSettings, isLocalEndpoint, DEFAULT_SETTINGS, SYSTEM_PROMPT_VERSION } from './config.mjs?v=4f30833b427f';
import { OLLAMA_ERROR } from './ollama-client.mjs?v=4f30833b427f';
import { discoverOllama, verifyModel } from './model-discovery.mjs?v=4f30833b427f';
import { runDeterministicChecks, summarizeDeterministicChecks } from './deterministic-statistics.mjs?v=4f30833b427f';
import { AnalysisController, ANALYSIS_STATUS, ANALYSIS_MODE } from './analysis-controller.mjs?v=4f30833b427f';
import { AnalysisCache, deriveDatasetId } from './analysis-cache.mjs?v=4f30833b427f';

const SETTINGS_KEY = 'intrilex-analytics-ai-settings';

// A localStorage-backed storage adapter for the AnalysisCache.
const localStorageStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* quota */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  keys: () => { try { return Object.keys(localStorage).filter(k => k.startsWith('intrilex-aai-cache:')); } catch { return []; } }
};

/**
 * Singleton controller for the browser. Lazily constructed on first use
 * so it never impacts boot when Analytics AI is unused.
 */
let _instance = null;
export function getAnalyticsAi() {
  if (!_instance) _instance = new BrowserAnalyticsAi();
  return _instance;
}

export class BrowserAnalyticsAi {
  constructor() {
    this.settings = normalizeSettings(loadSettings());
    this._cache = new AnalysisCache({ storage: localStorageStorage, maxEntries: 24 });
    this._controller = new AnalysisController({ cache: this._cache });
    this._abortController = null;
    this.connection = { tested: false, ok: false, reachable: false, models: [], error: null, version: null, endpoint: this.settings.endpoint };
    this.lastResult = null;
    this.status = ANALYSIS_STATUS.IDLE;
    this.streamingText = '';
    this._listeners = new Set();
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { for (const fn of this._listeners) { try { fn(this._snapshot()); } catch { /* ignore */ } } }
  _snapshot() {
    return {
      settings: this.settings,
      connection: this.connection,
      status: this.status,
      streamingText: this.streamingText,
      lastResult: this.lastResult,
      systemPromptVersion: SYSTEM_PROMPT_VERSION,
      isLocal: isLocalEndpoint(this.settings.endpoint)
    };
  }

  _setStatus(status, detail) { this.status = status; this._emit(); }

  loadSettings() { this.settings = normalizeSettings(loadSettings()); this.connection.endpoint = this.settings.endpoint; this._emit(); return this.settings; }
  saveSettings(partial) {
    this.settings = normalizeSettings({ ...this.settings, ...partial });
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.connection.endpoint = this.settings.endpoint;
    // Invalidate cache when model or model-settings change (the cache key already
    // encodes these, but clearing avoids stale growth).
    this._emit();
    return this.settings;
  }
  resetSettings() {
    this.settings = normalizeSettings(DEFAULT_SETTINGS);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.connection = { tested: false, ok: false, reachable: false, models: [], error: null, version: null, endpoint: this.settings.endpoint };
    this._emit();
    return this.settings;
  }

  async testConnection() {
    this._setStatus(ANALYSIS_STATUS.REQUESTING, 'Testing connection');
    const discovery = await discoverOllama({ endpoint: this.settings.endpoint, timeoutMs: 8000 });
    this.connection = {
      tested: true,
      ok: discovery.reachable,
      reachable: discovery.reachable,
      models: discovery.models,
      error: discovery.error,
      message: discovery.message,
      version: discovery.version,
      endpoint: this.settings.endpoint
    };
    // If the configured model is no longer present, clear it.
    if (this.settings.model && !this.connection.models.some(m => m.name === this.settings.model || m.name.startsWith(`${this.settings.model}:`))) {
      // keep the setting but mark unavailable; do not silently wipe
    }
    this._setStatus(ANALYSIS_STATUS.IDLE, 'Connection test complete');
    return this.connection;
  }

  async refreshModels() {
    return this.testConnection();
  }

  /** Verify the currently selected model is available. */
  async verifySelectedModel() {
    if (!this.settings.model) return { available: false, reason: 'no-model-selected' };
    return verifyModel({ endpoint: this.settings.endpoint, model: this.settings.model, timeoutMs: 8000 });
  }

  /**
   * Build the analytics bundle from Observatory state. Kept in the
   * controller so the UI panel stays declarative.
   */
  buildBundle(state) {
    return {
      observatory: state.observatory || {},
      aggregate: state.aggregate || {},
      variantAnalytics: state.variantAnalytics || state.observatory?.variantAnalytics || null,
      engineVersion: state.capabilities?.engine?.version || null,
      rulesVersion: state.capabilities?.engine?.rulesVersion || null,
      analyticsSchemaVersion: state.observatory?.schemaVersion || null,
      officialRules: null, // populated when a rules summary is available
      historicalRuns: null
    };
  }

  /**
   * Run an analysis. Resolves to the controller result. While running,
   * streaming tokens accumulate in `this.streamingText`.
   */
  async analyze({ state, mode, question = null, useCache = true }) {
    if (this._abortController) {
      return { ok: false, error: 'An analysis is already running.', code: 'busy' };
    }
    this._abortController = new AbortController();
    this.streamingText = '';
    this._setStatus(ANALYSIS_STATUS.BUILDING_CONTEXT, 'Starting analysis');
    const bundle = this.buildBundle(state);
    const result = await this._controller.analyze({
      settings: this.settings,
      bundle,
      mode,
      question,
      signal: this._abortController.signal,
      useCache,
      onProgress: ({ status }) => this._setStatus(status, status),
      onToken: (chunk) => { this.streamingText += chunk; this._setStatus(ANALYSIS_STATUS.STREAMING, 'streaming'); }
    });
    this._abortController = null;
    if (result.ok) this.lastResult = result;
    this._setStatus(result.ok ? ANALYSIS_STATUS.DONE : (result.cancelled ? ANALYSIS_STATUS.CANCELLED : ANALYSIS_STATUS.ERROR), result.ok ? 'done' : (result.error || 'error'));
    return result;
  }

  cancel() {
    if (this._abortController) {
      this._abortController.abort();
      this._setStatus(ANALYSIS_STATUS.CANCELLED, 'Cancelling');
    }
  }

  clearCache() { this._cache.clear(); this._emit(); }
  invalidateDataset(state) { this._cache.invalidateDataset(deriveDatasetId(this.buildBundle(state))); this._emit(); }

  /** Compute deterministic warnings without invoking the LLM. */
  deterministicWarnings(state) {
    return runDeterministicChecks(this.buildBundle(state));
  }
  deterministicSummary(state) {
    return summarizeDeterministicChecks(this.deterministicWarnings(state));
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

// Re-export enums for the UI panel.
export { ANALYSIS_MODE, ANALYSIS_STATUS, OLLAMA_ERROR, SYSTEM_PROMPT_VERSION, isLocalEndpoint };
