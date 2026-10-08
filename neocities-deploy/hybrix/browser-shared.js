export { hashCanonical, sha256Text } from '../engine/hash.js?v=a90b812f827b';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=a90b812f827b';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
