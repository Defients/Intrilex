// ═══════════════════════════════════════════════════════════════
// ollama-client.mjs — Isomorphic Ollama HTTP client.
// Uses the Fetch API (available in Node >=18 and modern browsers).
// No Node-only imports. Supports streaming, timeout, and cancellation.
// ═══════════════════════════════════════════════════════════════

import { DEFAULT_OLLAMA_ENDPOINT } from './config.mjs';

/**
 * Error categories the UI can branch on. Kept as a stable string union
 * so callers never need to parse free-text messages.
 */
export const OLLAMA_ERROR = Object.freeze({
  UNREACHABLE: 'UNREACHABLE',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  HTTP_ERROR: 'HTTP_ERROR',
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
  EMPTY_RESPONSE: 'EMPTY_RESPONSE',
  NETWORK: 'NETWORK',
  UNKNOWN: 'UNKNOWN'
});

export class OllamaError extends Error {
  constructor(category, message, { status, endpoint, cause } = {}) {
    super(message);
    this.name = 'OllamaError';
    this.category = category;
    this.status = status ?? null;
    this.endpoint = endpoint ?? null;
    if (cause) this.cause = cause;
  }
}

/**
 * Minimal Ollama client. Construct with an endpoint and call the
 * methods. Each request honours a timeout and an optional external
 * AbortSignal so the UI can cancel in-flight analysis.
 */
export class OllamaClient {
  constructor({ endpoint = DEFAULT_OLLAMA_ENDPOINT, timeoutMs = 60000, fetchImpl = null } = {}) {
    this.endpoint = endpoint?.replace(/\/+$/, '') || DEFAULT_OLLAMA_ENDPOINT;
    this.timeoutMs = Number(timeoutMs) || 60000;
    this._fetch = fetchImpl || globalThis.fetch?.bind(globalThis);
    if (typeof this._fetch !== 'function') {
      throw new OllamaError(OLLAMA_ERROR.UNKNOWN, 'No fetch implementation available');
    }
  }

  /**
   * Low-level request wrapper that applies timeout + cancellation and
   * normalizes errors into OllamaError instances.
   *
   * @param {string} path - path under the endpoint, e.g. '/api/tags'
   * @param {object} opts - { method, body, signal, headers, raw }
   * @returns {Promise<Response>}
   */
  async _request(path, opts = {}) {
    const url = `${this.endpoint}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('ollama-timeout')), this.timeoutMs);
    // Bridge an external signal so callers can cancel before the timeout.
    const external = opts.signal;
    if (external) {
      if (external.aborted) { clearTimeout(timer); throw new OllamaError(OLLAMA_ERROR.CANCELLED, 'Request cancelled before start', { endpoint: this.endpoint }); }
      external.addEventListener('abort', () => controller.abort(new Error('cancelled-by-caller')), { once: true });
    }
    try {
      const response = await this._fetch(url, {
        method: opts.method || 'GET',
        headers: opts.headers || (opts.body ? { 'content-type': 'application/json' } : undefined),
        body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
        signal: controller.signal
      });
      return response;
    } catch (err) {
      const aborted = controller.signal.aborted;
      const reason = controller.signal.reason?.message || '';
      if (aborted && reason === 'cancelled-by-caller') {
        throw new OllamaError(OLLAMA_ERROR.CANCELLED, 'Request cancelled by caller', { endpoint: this.endpoint, cause: err });
      }
      if (aborted || /timeout/i.test(reason) || /abort/i.test(err?.name || '')) {
        throw new OllamaError(OLLAMA_ERROR.TIMEOUT, `Request timed out after ${this.timeoutMs}ms`, { endpoint: this.endpoint, cause: err });
      }
      // fetch throws TypeError on network failure / DNS / connection refused
      throw new OllamaError(OLLAMA_ERROR.UNREACHABLE, `Cannot reach Ollama at ${this.endpoint}: ${err?.message || err}`, { endpoint: this.endpoint, cause: err });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Ping the server. Resolves to a connection status object.
   * Never throws — failures are reported in the returned status.
   */
  async testConnection({ signal } = {}) {
    try {
      const res = await this._request('/api/version', { signal });
      if (!res.ok) {
        return { ok: false, status: res.status, error: `HTTP ${res.status}`, endpoint: this.endpoint };
      }
      let version = null;
      try { version = await res.json(); } catch { version = null; }
      return { ok: true, status: res.status, version, endpoint: this.endpoint };
    } catch (err) {
      return { ok: false, status: null, error: err?.category || OLLAMA_ERROR.UNKNOWN, message: err?.message, endpoint: this.endpoint };
    }
  }

  /**
   * List installed models. Returns { models: [{name, size, ...}], raw }.
   * Never throws — returns an empty list with an error field on failure.
   */
  async listModels({ signal } = {}) {
    try {
      const res = await this._request('/api/tags', { signal });
      if (!res.ok) {
        throw new OllamaError(OLLAMA_ERROR.HTTP_ERROR, `HTTP ${res.status} from /api/tags`, { status: res.status, endpoint: this.endpoint });
      }
      const data = await res.json();
      const models = Array.isArray(data?.models) ? data.models.map(m => ({ name: m.name ?? m.model, size: m.size ?? null, digest: m.digest ?? null, details: m.details ?? null })).filter(m => m.name) : [];
      return { ok: true, models, raw: data };
    } catch (err) {
      if (err instanceof OllamaError) return { ok: false, models: [], error: err.category, message: err.message };
      return { ok: false, models: [], error: OLLAMA_ERROR.UNKNOWN, message: err?.message || String(err) };
    }
  }

  /**
   * Send a chat completion request. When stream=false, resolves to the
   * full assistant message string. When stream=true, invokes onToken for
   * each streamed chunk and resolves to the concatenated text.
   *
   * @param {object} params
   * @param {string} params.model
   * @param {Array} params.messages - [{role, content}]
   * @param {object} params.options - { temperature, num_predict, ... }
   * @param {boolean} params.stream
   * @param {object} [params.format] - Ollama structured-output JSON schema
   *   (forwarded verbatim as the request `format` field; 'json' also accepted)
   * @param {boolean} [params.think] - forwarded as the request `think` field;
   *   pass false to disable reasoning-model thinking so the token budget is
   *   spent on content. Ignored by models/servers without thinking support.
   * @param {function} [params.onToken] - (textChunk) => void
   * @param {function} [params.onProgress] - ({ tokens, done }) => void
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{ text: string, done: boolean, rawChunks: Array, thinking?: string, doneReason?: string|null }>}
   */
  async chat({ model, messages, options = {}, stream = false, format = null, think = null, onToken, onProgress, signal } = {}) {
    if (!model) throw new OllamaError(OLLAMA_ERROR.MODEL_NOT_FOUND, 'No model selected', { endpoint: this.endpoint });
    const body = { model, messages, stream, ...(format ? { format } : {}), ...(think != null ? { think: Boolean(think) } : {}), options: { temperature: options.temperature ?? 0.2, num_predict: options.num_predict ?? 2048, ...options } };
    const res = await this._request('/api/chat', { method: 'POST', body, signal });
    if (res.status === 404) {
      throw new OllamaError(OLLAMA_ERROR.MODEL_NOT_FOUND, `Model "${model}" not found on Ollama server`, { status: 404, endpoint: this.endpoint });
    }
    if (!res.ok) {
      const text = await safeText(res);
      throw new OllamaError(OLLAMA_ERROR.HTTP_ERROR, `Ollama chat failed: HTTP ${res.status} ${text.slice(0, 200)}`, { status: res.status, endpoint: this.endpoint });
    }

    if (!stream) {
      let data = null;
      try { data = await res.json(); }
      catch {
        // Malformed JSON body — fall back to text so the caller's repair
        // pipeline can attempt recovery rather than crashing.
        const text = await safeText(res);
        if (onProgress) onProgress({ tokens: 1, done: true });
        if (!text) this._throwEmpty({ doneReason: null });
        return { text, done: true, rawChunks: [], malformed: true };
      }
      this._throwIfErrorField(data, res.status);
      const text = data?.message?.content ?? data?.response ?? '';
      const thinking = data?.message?.thinking ?? '';
      const doneReason = data?.done_reason ?? null;
      if (onProgress) onProgress({ tokens: 1, done: true });
      if (!text) this._throwEmpty({ thinking, doneReason });
      return { text, thinking, doneReason, done: true, rawChunks: [data] };
    }

    // Streaming: Ollama emits newline-delimited JSON objects, one per token.
    const rawChunks = [];
    let text = '';
    let thinking = '';
    let doneReason = null;
    const reader = res.body?.getReader?.();
    if (!reader) {
      // No readable body — fall back to buffering the whole response.
      const data = await res.json();
      this._throwIfErrorField(data, res.status);
      const t = data?.message?.content ?? data?.response ?? '';
      const th = data?.message?.thinking ?? '';
      if (onToken && t) onToken(t);
      if (onProgress) onProgress({ tokens: 1, done: true });
      if (!t) this._throwEmpty({ thinking: th, doneReason: data?.done_reason ?? null });
      return { text: t, thinking: th, doneReason: data?.done_reason ?? null, done: true, rawChunks: [data] };
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let tokenCount = 0;
    // Parse one NDJSON line. Returns true when the terminal `done` chunk
    // arrives; throws on server-reported error payloads.
    const consumeLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      let chunk;
      try { chunk = JSON.parse(trimmed); }
      catch { return false; } // skip malformed line, do not crash
      rawChunks.push(chunk);
      this._throwIfErrorField(chunk, res.status);
      const piece = chunk?.message?.content ?? chunk?.response ?? '';
      const thinkPiece = chunk?.message?.thinking ?? '';
      if (thinkPiece) thinking += thinkPiece;
      if (piece) {
        text += piece;
        tokenCount += 1;
        if (onToken) onToken(piece);
        if (onProgress) onProgress({ tokens: tokenCount, done: false });
      }
      if (chunk?.done) {
        doneReason = chunk.done_reason ?? doneReason;
        return true;
      }
      return false;
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (consumeLine(line)) {
            if (onProgress) onProgress({ tokens: tokenCount, done: true });
            if (!text) this._throwEmpty({ thinking, doneReason });
            return { text, thinking, doneReason, done: true, rawChunks };
          }
        }
      }
      // Flush the decoder and process any final line that lacked a
      // trailing newline — some proxies terminate the stream without one.
      buffer += decoder.decode();
      if (buffer.trim()) consumeLine(buffer);
      // Stream ended without an explicit done flag.
      if (onProgress) onProgress({ tokens: tokenCount, done: true });
      if (!text) this._throwEmpty({ thinking, doneReason });
      return { text, thinking, doneReason, done: true, rawChunks };
    } finally {
      try { reader.releaseLock?.(); } catch { /* ignore */ }
    }
  }

  /** Surface a server-reported `error` payload instead of ignoring it. */
  _throwIfErrorField(data, status) {
    if (data && typeof data === 'object' && typeof data.error === 'string' && data.error) {
      throw new OllamaError(OLLAMA_ERROR.HTTP_ERROR, `Ollama error: ${data.error}`, { status, endpoint: this.endpoint });
    }
  }

  /** Fail loudly when the model produced no content at all. */
  _throwEmpty({ thinking = '', doneReason = null } = {}) {
    const notes = [];
    if (thinking) notes.push('the model produced only reasoning (thinking) output — a reasoning model may have spent the whole num_predict budget before answering; raise max tokens or pick a non-reasoning model');
    if (doneReason) notes.push(`done_reason=${doneReason}`);
    throw new OllamaError(
      OLLAMA_ERROR.EMPTY_RESPONSE,
      `Ollama returned an empty response${notes.length ? ` (${notes.join('; ')})` : ''}`,
      { endpoint: this.endpoint }
    );
  }
}

async function safeText(res) {
  try { return await res.text(); } catch { return ''; }
}
