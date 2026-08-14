export { hashCanonical, sha256Text } from '../engine/hash.js?v=73b458295383';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=73b458295383';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
