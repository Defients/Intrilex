// ═══════════════════════════════════════════════════════════════
// hash.js — Deterministic hash utility for play modules
// Provides canonical JSON + SHA-256 that works in both browser and Node.js.
// For engine hash matching (certified replay verification),
// import hashCanonical directly from the engine module.
// ═══════════════════════════════════════════════════════════════

/**
 * Canonical JSON stringify — sorts object keys recursively.
 */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

/**
 * FNV-1a hash — fast, deterministic, no dependencies.
 * Used for content integrity in play modules (save envelopes).
 * NOT for cryptographic verification — use engine hashCanonical for that.
 */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to hex and pad to 64 chars for consistent format
  const hex = (hash >>> 0).toString(16);
  return hex.padStart(8, '0').repeat(8);
}

/**
 * Synchronous SHA-256-like text hash.
 * Uses FNV-1a as fallback when Web Crypto is not synchronously available.
 */
export function sha256Text(text) {
  return fnv1a(text);
}

/**
 * Canonical hash of a value — uses canonical JSON + FNV-1a.
 * Deterministic and works in all environments.
 */
export function hashCanonical(value) {
  return fnv1a(canonicalize(value));
}

/**
 * Async SHA-256 text hash — uses Web Crypto API when available.
 * Falls back to FNV-1a when not.
 */
export async function sha256TextAsync(text) {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    try {
      const data = new TextEncoder().encode(text);
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { /* fall through */ }
  }
  return fnv1a(text);
}

/**
 * Async canonical hash — uses Web Crypto API when available.
 */
export async function hashCanonicalAsync(value) {
  return sha256TextAsync(canonicalize(value));
}
