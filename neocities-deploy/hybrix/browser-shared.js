export { hashCanonical, sha256Text } from '../engine/hash.js?v=e09244683def';
export { canonicalize, canonicalClone } from '../engine/canonical-json.js?v=e09244683def';
export function sanitizeCsvCell(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
