export { hashCanonical, sha256Text } from '../engine/hash.js?v=8e7dcad7e473';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=8e7dcad7e473';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
