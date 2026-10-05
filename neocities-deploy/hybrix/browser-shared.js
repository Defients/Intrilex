export { hashCanonical, sha256Text } from '../engine/hash.js?v=3e5b5b85f4e1';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=3e5b5b85f4e1';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
