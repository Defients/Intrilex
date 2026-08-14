// shared-browser.js — Browser-safe replacement for @intrilex/shared canonical.mjs.
// Re-exports hash primitives from the browser crypto shim and defines pure
// helpers so the browser bundle never pulls in node:crypto.
export { canonicalize, canonicalClone } from './engine/canonical-json.js?v=42162e3d88b3';
export { sha256Text, hashCanonical } from './engine/hash.js?v=42162e3d88b3';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
export function stableSortBy(items, selector) {
  return [...items].sort((a, b) => String(selector(a)).localeCompare(String(selector(b))));
}
