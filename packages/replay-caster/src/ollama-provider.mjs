// ═══════════════════════════════════════════════════════════════
// ollama-provider.mjs — Optional local-LLM commentary provider.
//
// Uses an OllamaClient (injected or dynamically imported from
// @intrilex/analytics-ai on Node). The provider is a thin adapter: it
// builds the prompt via the planner, calls the model, parses JSON, and
// returns a validated record. It NEVER sends anything to
// IntrilexEngine.execute and never mutates replay data.
//
// Browser integration: the UI injects the browser's OllamaClient
// instance (from the analytics-ai browser controller) via the `client`
// option, so this module never imports @intrilex/analytics-ai at the
// top level (that package is not aliased in the browser bundle).
//
// Failure behavior (spec §13): on any failure, returns { ok: false }
// with an error category. Playback continues regardless.
// ═══════════════════════════════════════════════════════════════

import { SPOILER_CHECK } from './schemas.mjs';
import { buildCommentaryPrompt } from './commentary-planner.mjs';
import { validateAndAccept } from './commentary-validator.mjs';

export const OLLAMA_ERROR = Object.freeze({
  UNREACHABLE: 'UNREACHABLE',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  HTTP_ERROR: 'HTTP_ERROR',
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
  NETWORK: 'NETWORK',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Ollama-backed commentary provider.
 *
 * @param {object} opts
 * @param {string} [opts.endpoint] - Ollama base URL (Node default path)
 * @param {string} opts.model - model name (required when enabled)
 * @param {number} [opts.timeoutMs] - per-request timeout
 * @param {number} [opts.temperature] - sampling temperature
 * @param {object} [opts.client] - inject an OllamaClient (browser/Node)
 * @param {function} [opts.fetchImpl] - inject fetch (Node default path)
 * @param {boolean} [opts.stream] - enable streaming (default false)
 */
export class OllamaCommentaryProvider {
  constructor({ endpoint, model, timeoutMs, temperature, client, fetchImpl, stream } = {}) {
    this._model = model || '';
    this._temperature = Number.isFinite(temperature) ? temperature : 0.4;
    this._client = client || null;
    this._clientOpts = { endpoint, timeoutMs, fetchImpl };
    this._stream = stream === true;
    this._providerName = 'ollama';
  }

  get name() { return this._providerName; }
  get model() { return this._model; }

  async _ensureClient() {
    if (this._client) return this._client;
    // Node default path: dynamically import the analytics-ai client.
    // Browser callers always inject `client`, so this branch is Node-only.
    // String concatenation prevents esbuild from statically resolving this
    // import at bundle time (the analytics-ai package is not aliased in the
    // browser bundle).
    const analyticsPath = '@intrilex/' + 'analytics-ai/ollama-client';
    const { OllamaClient } = await import(analyticsPath);
    this._client = new OllamaClient(this._clientOpts);
    return this._client;
  }

  /** Ping the Ollama endpoint. Never throws. */
  async testConnection({ signal } = {}) {
    try {
      const client = await this._ensureClient();
      return client.testConnection({ signal });
    } catch (err) {
      return { ok: false, status: null, error: OLLAMA_ERROR.UNKNOWN, message: err?.message || String(err) };
    }
  }

  /**
   * Generate commentary for a single beat.
   * @param {object} input - output of buildCommentaryInput
   * @param {object} [opts]
   * @param {AbortSignal} [opts.signal]
   * @param {function} [opts.onToken] - streaming callback (textChunk) => void
   * @returns {Promise<{ok, record, error, cached}>}
   */
  async generateCommentary(input, { signal, onToken } = {}) {
    if (!this._model) {
      return { ok: false, record: null, error: OLLAMA_ERROR.MODEL_NOT_FOUND, cached: false };
    }
    let client;
    try { client = await this._ensureClient(); }
    catch (err) {
      return { ok: false, record: null, error: OLLAMA_ERROR.UNREACHABLE, cached: false };
    }
    const { messages } = buildCommentaryPrompt(input);
    const useStream = this._stream && typeof onToken === 'function';
    let result;
    try {
      result = await client.chat({
        model: this._model,
        messages,
        stream: useStream,
        options: { temperature: this._temperature, num_predict: 512 },
        onToken: useStream ? onToken : undefined,
        signal
      });
    } catch (err) {
      return { ok: false, record: null, error: err?.category || OLLAMA_ERROR.UNKNOWN, cached: false };
    }
    const raw = result?.text ?? '';
    if (!raw || !raw.trim()) {
      return { ok: false, record: null, error: OLLAMA_ERROR.MALFORMED_RESPONSE, cached: false };
    }
    const accepted = validateAndAccept(raw, input);
    if (!accepted.accepted) {
      return { ok: false, record: accepted.record, error: accepted.error || OLLAMA_ERROR.MALFORMED_RESPONSE, cached: false };
    }
    return { ok: true, record: accepted.record, error: null, cached: false };
  }
}
