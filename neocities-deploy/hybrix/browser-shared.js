export { hashCanonical, sha256Text } from '../engine/hash.js?v=a45e6b3a7e27';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=a45e6b3a7e27';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
