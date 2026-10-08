export { hashCanonical, sha256Text } from '../engine/hash.js?v=8951e2c35a42';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=8951e2c35a42';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
