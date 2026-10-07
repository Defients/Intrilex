export { hashCanonical, sha256Text } from '../engine/hash.js?v=ef8ac632ff7c';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=ef8ac632ff7c';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
