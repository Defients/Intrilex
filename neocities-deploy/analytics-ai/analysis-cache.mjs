// ═══════════════════════════════════════════════════════════════
// analysis-cache.mjs — Deterministic analysis cache. Keys are derived
// from the analytics dataset identity, engine/rules/schema versions,
// selected model, system-prompt version, and model settings (spec §9).
// In-memory by default; optional localStorage persistence for the
// browser. Never re-runs expensive analysis just because the user
// switched presentation tabs.
// ═══════════════════════════════════════════════════════════════

import { SYSTEM_PROMPT_VERSION } from './config.mjs';

// A tiny stable string hash (FNV-1a) — deterministic, no crypto needed.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Convert to unsigned hex
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compute a deterministic cache key for an analysis request.
 * @param {object} params
 * @param {string} params.datasetId - stable id for the analytics dataset (e.g. aggregate hash)
 * @param {string} params.engineVersion
 * @param {string} params.rulesVersion
 * @param {string} params.analyticsSchemaVersion
 * @param {string} params.mode - analysis mode
 * @param {string} params.model - selected ollama model
 * @param {object} params.modelSettings - { temperature, maxGeneratedTokens, contextBudgetTokens }
 * @param {string} [params.question] - for ASK mode
 * @returns {string}
 */
export function computeCacheKey({ datasetId, engineVersion, rulesVersion, analyticsSchemaVersion, mode, model, modelSettings = {}, question = null }) {
  const parts = [
    `dataset:${datasetId || 'unknown'}`,
    `engine:${engineVersion || 'unknown'}`,
    `rules:${rulesVersion || 'unknown'}`,
    `schema:${analyticsSchemaVersion || 'unknown'}`,
    `mode:${mode || 'unknown'}`,
    `model:${model || 'unknown'}`,
    `prompt:${SYSTEM_PROMPT_VERSION}`,
    `temp:${modelSettings.temperature ?? 0.2}`,
    `maxTok:${modelSettings.maxGeneratedTokens ?? 2048}`,
    `ctx:${modelSettings.contextBudgetTokens ?? 8192}`
  ];
  if (mode === 'ask' && question) parts.push(`q:${fnv1a(question)}`);
  return fnv1a(parts.join('|'));
}

/**
 * Derive a stable dataset id from an analytics bundle when an explicit
 * one is not provided. Falls back to a hash of salient version + count
 * fields so two loads of the same campaign share a key.
 */
export function deriveDatasetId(bundle = {}) {
  const { observatory = {}, aggregate = {} } = bundle;
  const explicit = aggregate.aggregateHash || aggregate.canonicalResultHash || observatory.observatoryHash || aggregate.experimentHash;
  if (explicit) return String(explicit);
  const parts = [
    `m:${aggregate.matchCount ?? observatory.summaryCount ?? 0}`,
    `e:${aggregate.engineVersion ?? observatory.engineVersion ?? ''}`,
    `r:${aggregate.rulesVersion ?? observatory.rulesVersion ?? ''}`,
    `p:${aggregate.profileId ?? ''}`
  ];
  return fnv1a(parts.join('|'));
}

/**
 * In-memory + optional persistent cache. The persistent layer is
 * pluggable: pass { getItem, setItem, removeItem } for localStorage.
 */
export class AnalysisCache {
  constructor({ storage = null, maxEntries = 32 } = {}) {
    this._mem = new Map();
    this._storage = storage || null;
    this._maxEntries = maxEntries;
    this._prefix = 'intrilex-aai-cache:';
  }

  get(key) {
    if (this._mem.has(key)) return this._mem.get(key);
    if (this._storage) {
      try {
        const raw = this._storage.getItem(this._prefix + key);
        if (raw) {
          const entry = JSON.parse(raw);
          this._mem.set(key, entry);
          return entry;
        }
      } catch { /* ignore corrupt entries */ }
    }
    return null;
  }

  set(key, entry) {
    this._mem.set(key, entry);
    // LRU-ish eviction
    if (this._mem.size > this._maxEntries) {
      const firstKey = this._mem.keys().next().value;
      this._mem.delete(firstKey);
      if (this._storage) { try { this._storage.removeItem(this._prefix + firstKey); } catch { /* ignore */ } }
    }
    if (this._storage) {
      try { this._storage.setItem(this._prefix + key, JSON.stringify(entry)); }
      catch { /* quota exceeded — keep in-memory only */ }
    }
  }

  invalidate(key) {
    this._mem.delete(key);
    if (this._storage) { try { this._storage.removeItem(this._prefix + key); } catch { /* ignore */ } }
  }

  clear() {
    this._mem.clear();
    if (this._storage) {
      try {
        const keys = this._storage.keys ? Array.from(this._storage.keys()) : [];
        for (const k of keys) {
          if (k.startsWith(this._prefix)) this._storage.removeItem(k);
        }
      } catch { /* ignore */ }
    }
  }

  /**
   * Invalidate entries whose datasetId matches. Used when the analytics
   * data changes but we don't know the exact mode/model combinations.
   */
  invalidateDataset(datasetId) {
    const targets = [];
    for (const [key, entry] of this._mem) {
      if (entry?.datasetId === datasetId) targets.push(key);
    }
    for (const k of targets) this.invalidate(k);
  }
}
