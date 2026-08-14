export { hashCanonical, sha256Text } from '../engine/hash.js?v=e2bd7e8507fa';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=e2bd7e8507fa';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
