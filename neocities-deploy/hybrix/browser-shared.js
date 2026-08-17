export { hashCanonical, sha256Text } from '../engine/hash.js?v=4f30833b427f';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=4f30833b427f';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
