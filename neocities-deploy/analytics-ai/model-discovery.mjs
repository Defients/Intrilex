// ═══════════════════════════════════════════════════════════════
// model-discovery.mjs — Connection + model listing helpers built on
// OllamaClient. Returns stable status objects the UI can render.
// ═══════════════════════════════════════════════════════════════

import { OllamaClient, OLLAMA_ERROR } from './ollama-client.mjs';
import { DEFAULT_OLLAMA_ENDPOINT } from './config.mjs';

/**
 * Probe an endpoint and return a structured status object describing
 * whether Ollama is reachable, which version it reports, and which
 * models are installed. Never throws.
 *
 * @returns {Promise<{ ok: boolean, reachable: boolean, version: object|null, models: Array, error: string|null, endpoint: string }>}
 */
export async function discoverOllama({ endpoint = DEFAULT_OLLAMA_ENDPOINT, timeoutMs = 8000, signal } = {}) {
  const client = new OllamaClient({ endpoint, timeoutMs });
  const conn = await client.testConnection({ signal });
  if (!conn.ok) {
    return { ok: false, reachable: false, version: null, models: [], error: conn.error || OLLAMA_ERROR.UNREACHABLE, message: conn.message, endpoint: client.endpoint };
  }
  const models = await client.listModels({ signal });
  return {
    ok: models.ok,
    reachable: true,
    version: conn.version,
    models: models.models,
    error: models.ok ? null : models.error,
    message: models.ok ? null : models.message,
    endpoint: client.endpoint
  };
}

/**
 * Verify that a specific model name is present on the server.
 * Returns { available, model, installedModels }.
 */
export async function verifyModel({ endpoint, model, timeoutMs = 8000, signal } = {}) {
  if (!model) return { available: false, model: null, installedModels: [], reason: 'no-model-selected' };
  const discovery = await discoverOllama({ endpoint, timeoutMs, signal });
  if (!discovery.reachable) {
    return { available: false, model, installedModels: [], reason: 'unreachable' };
  }
  const names = discovery.models.map(m => m.name);
  const available = names.includes(model) || names.some(n => n.startsWith(`${model}:`));
  return { available, model, installedModels: discovery.models, reason: available ? null : 'not-installed' };
}
