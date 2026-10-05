export { hashCanonical, sha256Text } from '../engine/hash.js?v=2d119ab0ddda';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=2d119ab0ddda';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
