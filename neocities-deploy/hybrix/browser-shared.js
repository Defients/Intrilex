export { hashCanonical, sha256Text } from '../engine/hash.js?v=dac162e115e4';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=dac162e115e4';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
