export { hashCanonical, sha256Text } from '../engine/hash.js?v=ad40772959f0';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=ad40772959f0';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
