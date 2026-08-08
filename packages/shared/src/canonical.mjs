import { createHash } from 'node:crypto';

/**
 * @template T
 * @typedef {T extends null ? null : T extends object ? { [K in keyof T]: Normalized<T[K]> } : T} Normalized
 */

/**
 * Recursively normalizes a value for canonical JSON serialization.
 * - Object keys are sorted alphabetically
 * - `undefined` values are omitted
 * - Arrays are normalized element-wise
 * @param {unknown} value
 * @returns {unknown}
 */
function normalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalize);
  const output = /** @type {Record<string, unknown>} */ ({});
  for (const key of Object.keys(value).sort()) {
    const current = /** @type {Record<string, unknown>} */ (value)[key];
    if (current !== undefined) output[key] = normalize(current);
  }
  return output;
}

/**
 * Canonicalize a value into a deterministic JSON string.
 * Object keys are sorted alphabetically; `undefined` fields are dropped.
 * This is the basis for all content hashing in the Intrilex system.
 * @param {unknown} value - Any JSON-serializable value
 * @returns {string} Deterministic JSON string
 * @example canonicalize({ b: 2, a: 1 }) // '{"a":1,"b":2}'
 */
export function canonicalize(value) {
  return JSON.stringify(normalize(value));
}

/**
 * Compute the SHA-256 hash of a text string (hex-encoded).
 * @param {string} text - Input text to hash
 * @returns {string} 64-character lowercase hex SHA-256 digest
 * @example sha256Text('hello') // '2cf24dba...'
 */
export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Compute the canonical hash of a value: SHA-256 of its canonical JSON.
 * This is the primary integrity primitive used across the system.
 * @param {unknown} value - Any JSON-serializable value
 * @returns {string} 64-character lowercase hex SHA-256 digest
 * @example hashCanonical({ a: 1, b: 2 }) === hashCanonical({ b: 2, a: 1 }) // true
 */
export function hashCanonical(value) {
  return sha256Text(canonicalize(value));
}

/**
 * Sanitize a value for safe CSV cell embedding.
 * - Prefixes formula-injection characters (equals, plus, minus, at-sign) with a single quote
 * - Quotes cells containing commas, double-quotes, or newlines
 * - Escapes embedded double-quotes by doubling
 * @param {unknown} value - Value to sanitize (coerced to string)
 * @returns {string} CSV-safe cell content
 * @example sanitizeCsvCell('=cmd') // "'=cmd"
 * @example sanitizeCsvCell('a,b') // '"a,b"'
 */
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * Stable sort by a string selector. Preserves input order for equal keys.
 * @template T
 * @param {T[]} items - Items to sort
 * @param {(item: T) => string} selector - Function returning the sort key
 * @returns {T[]} New sorted array (input is not mutated)
 * @example stableSortBy([{n:'b'},{n:'a'}], x => x.n) // [{n:'a'},{n:'b'}]
 */
export function stableSortBy(items, selector) {
  return [...items].sort((a, b) => String(selector(a)).localeCompare(String(selector(b))));
}
