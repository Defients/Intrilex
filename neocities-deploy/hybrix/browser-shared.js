export { hashCanonical, sha256Text } from '../engine/hash.js?v=c4e7aaac019e';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=c4e7aaac019e';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
