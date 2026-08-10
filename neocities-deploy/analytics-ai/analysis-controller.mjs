// ═══════════════════════════════════════════════════════════════
// analysis-controller.mjs — Orchestrates the full analysis flow:
//   build context → deterministic checks → prompt → ollama request →
//   validate → repair → cache. Exposes async, cancellable analysis
//   with progress callbacks. Never blocks on a single failure step.
// ═══════════════════════════════════════════════════════════════

import { OllamaClient, OLLAMA_ERROR } from './ollama-client.mjs';
import { normalizeSettings } from './config.mjs';
import { runDeterministicChecks, summarizeDeterministicChecks } from './deterministic-statistics.mjs';
import { buildContext, ANALYSIS_MODE } from './analytics-context-builder.mjs';
import { buildMessages } from './prompt-builder.mjs';
import { validateAnalysisResponse } from './response-validator.mjs';
import { repairResponse } from './response-repair.mjs';
import { computeCacheKey, deriveDatasetId } from './analysis-cache.mjs';

// Re-export so browser adapters can import ANALYSIS_MODE from this module.
export { ANALYSIS_MODE } from './analytics-context-builder.mjs';

export const ANALYSIS_STATUS = Object.freeze({
  IDLE: 'idle',
  BUILDING_CONTEXT: 'building-context',
  REQUESTING: 'requesting',
  STREAMING: 'streaming',
  VALIDATING: 'validating',
  REPAIRING: 'repairing',
  DONE: 'done',
  ERROR: 'error',
  CANCELLED: 'cancelled',
  CACHED: 'cached'
});

/**
 * @param {object} opts
 * @param {object} [opts.cache] - an AnalysisCache instance (or null to disable)
 * @param {function} [opts.fetchImpl] - injectable fetch (for tests)
 */
export class AnalysisController {
  constructor({ cache = null, fetchImpl = null } = {}) {
    this._cache = cache;
    this._fetchImpl = fetchImpl;
  }

  /**
   * Run an analysis. Returns a result object; never throws.
   *
   * @param {object} params
   * @param {object} params.settings - raw settings (will be normalized)
   * @param {object} params.bundle - analytics bundle
   * @param {string} params.mode - ANALYSIS_MODE value
   * @param {string} [params.question] - for ASK mode
   * @param {AbortSignal} [params.signal] - cancellation
   * @param {function} [params.onProgress] - ({ status, detail }) => void
   * @param {function} [params.onToken] - (textChunk) => void (streaming)
   * @param {boolean} [params.useCache=true]
   * @returns {Promise<object>} result
   */
  async analyze({ settings, bundle, mode = ANALYSIS_MODE.EXECUTIVE_SUMMARY, question = null, signal, onProgress, onToken, useCache = true }) {
    const progress = (status, detail) => { try { onProgress?.({ status, detail }); } catch { /* ignore */ } };
    const normSettings = normalizeSettings(settings);

    if (!normSettings.enabled) {
      return this._error('Analytics AI is disabled.', { disabled: true });
    }
    if (!normSettings.model) {
      return this._error('No Ollama model selected. Choose a model in Analytics AI settings.', { code: 'no-model' });
    }
    if (signal?.aborted) {
      return this._cancelled();
    }

    const datasetId = deriveDatasetId(bundle);
    const engineVersion = bundle.engineVersion || bundle.aggregate?.engineVersion;
    const rulesVersion = bundle.rulesVersion || bundle.aggregate?.rulesVersion;
    const analyticsSchemaVersion = bundle.analyticsSchemaVersion || bundle.observatory?.schemaVersion;

    // ── Cache lookup ──
    const cacheKey = computeCacheKey({ datasetId, engineVersion, rulesVersion, analyticsSchemaVersion, mode, model: normSettings.model, modelSettings: normSettings, question });
    if (useCache && this._cache) {
      const cached = this._cache.get(cacheKey);
      if (cached) {
        progress(ANALYSIS_STATUS.CACHED, 'Returning cached analysis');
        return { ...cached, fromCache: true, deterministicWarnings: cached.deterministicWarnings };
      }
    }

    // ── Deterministic checks (always run; cheap and factual) ──
    const deterministicWarnings = runDeterministicChecks(bundle);

    // ── Build context ──
    progress(ANALYSIS_STATUS.BUILDING_CONTEXT, 'Selecting relevant analytics context');
    const context = buildContext({ mode, bundle, settings: normSettings, deterministicWarnings, question });

    // ── Build prompt ──
    const { messages, systemPromptVersion, systemPrompt, userPrompt } = buildMessages({ mode, contextText: context.text, settings: normSettings, question });

    // ── Request ──
    progress(ANALYSIS_STATUS.REQUESTING, `Requesting analysis from ${normSettings.model}`);
    const client = new OllamaClient({ endpoint: normSettings.endpoint, timeoutMs: normSettings.requestTimeoutMs, fetchImpl: this._fetchImpl });
    const requestStarted = Date.now();
    let rawText = '';
    try {
      const result = await client.chat({
        model: normSettings.model,
        messages,
        options: { temperature: normSettings.temperature, num_predict: normSettings.maxGeneratedTokens },
        stream: normSettings.streaming,
        onToken: (chunk) => { progress(ANALYSIS_STATUS.STREAMING, 'Streaming response'); try { onToken?.(chunk); } catch { /* ignore */ } },
        onProgress: (p) => progress(ANALYSIS_STATUS.STREAMING, `${p.tokens} tokens`),
        signal
      });
      rawText = result.text;
    } catch (err) {
      const requestDurationMs = Date.now() - requestStarted;
      if (err?.category === OLLAMA_ERROR.CANCELLED) return this._cancelled({ requestDurationMs, deterministicWarnings });
      return this._error(err?.message || 'Ollama request failed', { code: err?.category || OLLAMA_ERROR.UNKNOWN, requestDurationMs, endpoint: normSettings.endpoint, deterministicWarnings });
    }
    const requestDurationMs = Date.now() - requestStarted;

    // ── Validate ──
    progress(ANALYSIS_STATUS.VALIDATING, 'Validating structured response');
    let parsed = null;
    try { parsed = JSON.parse(rawText); }
    catch { parsed = null; }

    let validation = parsed ? validateAnalysisResponse(parsed) : null;
    let repairInfo = null;

    if (!validation || !validation.valid) {
      // ── Repair pass ──
      progress(ANALYSIS_STATUS.REPAIRING, 'Attempting constrained repair of malformed output');
      repairInfo = repairResponse(rawText);
      if (repairInfo.json) {
        validation = validateAnalysisResponse(repairInfo.json);
      }
    }

    if (!validation || !validation.valid) {
      // Repair failed — preserve raw response for debugging.
      return this._error('Model returned malformed output that could not be repaired.', {
        code: 'malformed-output',
        requestDurationMs,
        rawResponse: rawText,
        validationErrors: validation?.errors || ['no parseable JSON'],
        repairAttempts: repairInfo?.attempts || [],
        context: { sources: context.sources, omitted: context.omitted, tokenEstimate: context.tokenEstimate, sanitizationFlags: context.sanitizationFlags },
        systemPromptVersion,
        deterministicWarnings
      });
    }

    const result = {
      ok: true,
      analysis: validation.normalized,
      validationWarnings: validation.warnings,
      deterministicWarnings,
      deterministicSummary: summarizeDeterministicChecks(deterministicWarnings),
      debug: {
        model: normSettings.model,
        endpoint: normSettings.endpoint,
        requestDurationMs,
        contextSources: context.sources,
        contextOmitted: context.omitted,
        contextTokenEstimate: context.tokenEstimate,
        contextTruncated: context.truncated,
        sanitizationFlags: context.sanitizationFlags,
        systemPromptVersion,
        repairUsed: repairInfo?.repaired || false,
        repairMethod: repairInfo?.method || null,
        rawResponse: rawText,
        systemPrompt,
        userPrompt
      },
      fromCache: false,
      cacheKey,
      datasetId
    };

    if (useCache && this._cache) {
      this._cache.set(cacheKey, {
        ok: true,
        analysis: result.analysis,
        validationWarnings: result.validationWarnings,
        deterministicWarnings: result.deterministicWarnings,
        deterministicSummary: result.deterministicSummary,
        debug: { model: result.debug.model, requestDurationMs: result.debug.requestDurationMs, systemPromptVersion },
        datasetId,
        cacheKey
      });
    }

    progress(ANALYSIS_STATUS.DONE, 'Analysis complete');
    return result;
  }

  _error(message, extra = {}) {
    return { ok: false, error: message, ...extra };
  }

  _cancelled(extra = {}) {
    return { ok: false, cancelled: true, error: 'Analysis cancelled.', ...extra };
  }
}
