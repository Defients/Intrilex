export { hashCanonical, sha256Text } from '../engine/hash.js?v=46b6024f32eb';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=46b6024f32eb';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
