export { hashCanonical, sha256Text } from '../engine/hash.js?v=7d7375aa53c1';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=7d7375aa53c1';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
