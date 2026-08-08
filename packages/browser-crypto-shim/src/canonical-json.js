// canonical-json.js — Browser-safe canonical JSON serialization.
// Mirrors @intrilex/shared canonicalize for browser environments.
// Object keys sorted alphabetically; undefined fields dropped.

/**
 * Recursively normalizes a value for canonical JSON serialization.
 * @param {unknown} value
 * @returns {unknown}
 */
function normalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalize);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    const current = value[key];
    if (current !== undefined) output[key] = normalize(current);
  }
  return output;
}

/**
 * Canonicalize a value into a deterministic JSON string.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalize(value) {
  return JSON.stringify(normalize(value));
}

/**
 * Canonical clone — deep clone with canonical key ordering.
 * @param {unknown} value
 * @returns {unknown}
 */
export function canonicalClone(value) {
  return JSON.parse(canonicalize(value));
}
