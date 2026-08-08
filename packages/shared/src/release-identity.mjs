// ═══════════════════════════════════════════════════════════════
// release-identity.mjs — Single release identity authority loader
//
// Loads config/release-identity.json and exposes derived fields.
// All version surfaces must import from this module or be generated
// from it. No hardcoded version literals in application code.
// ═══════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCanonical } from './canonical.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const identityPath = path.join(root, 'config', 'release-identity.json');

/** @type {Record<string, unknown> | null} */
let cached = null;

/**
 * Load the canonical release identity from config/release-identity.json.
 * Cached after first load.
 * @returns {Promise<Record<string, unknown>>} The release identity object
 */
export async function loadReleaseIdentity() {
  if (cached) return cached;
  const raw = await readFile(identityPath, 'utf8');
  cached = /** @type {Record<string, unknown>} */ (JSON.parse(raw));
  return cached;
}

/**
 * Synchronous accessor for tests that have already loaded the identity.
 * @param {Record<string, unknown>} identity - Pre-loaded identity object
 */
export function setReleaseIdentity(identity) {
  cached = identity;
}

/**
 * Compute the release identity hash — SHA-256 of the canonical identity
 * with volatile fields (releaseDate) excluded.
 * @param {Record<string, unknown>} [identity] - Pre-loaded identity (loads if omitted)
 * @returns {Promise<string>} 64-char hex SHA-256
 */
export async function releaseIdentityHash(identity) {
  const id = identity ?? await loadReleaseIdentity();
  const stable = { ...id };
  delete stable.releaseDate;
  return hashCanonical(stable);
}

export {
  loadReleaseIdentity as loadIdentity,
  releaseIdentityHash as identityHash,
};
