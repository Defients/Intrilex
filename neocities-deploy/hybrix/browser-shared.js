export { hashCanonical, sha256Text } from '../engine/hash.js?v=09c7519902ec';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=09c7519902ec';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
