// ═══════════════════════════════════════════════════════════════
// identity.mjs — Account identity contracts
//
// Defines the permanent identity hierarchy:
//
//   Supabase user UUID (accountId)
//         ↓ permanent account identity
//   publicPlayerId (PLY_…) — safe public identity
//         ↓ participates in a specific match
//   participantId — per-match participant
//         ↓ possesses temporary match capability
//   participantToken — match capability proof
//         ↓
//   P1 / P2 — engine seat
//
// NEVER collapse these identities together.
// ═══════════════════════════════════════════════════════════════

import { randomBytes, createHash } from 'node:crypto';

/**
 * @typedef {Object} AccountIdentity
 * @property {string} accountId - Supabase user UUID (internal, never public)
 * @property {string|null} publicPlayerId - Safe public identity (PLY_…)
 * @property {boolean} isAnonymous - True for Supabase anonymous users
 * @property {'discord'|'email'|'anonymous'|'unknown'} provider - Auth provider
 * @property {string} displayName - User-editable display name
 * @property {string|null} handle - Globally unique handle
 * @property {string|null} avatarUrl - Avatar URL (sanitized)
 * @property {AccountCapabilities} capabilities - Capability set
 */

/**
 * @typedef {Object} VerifiedIdentity
 * @property {string} accountId - Supabase user UUID (from verified JWT sub)
 * @property {boolean} isAnonymous - Derived from verified JWT claims
 * @property {string} provider - Auth provider
 * @property {number} expiresAt - Token expiration (ms epoch)
 * @property {{ publicPlayerId: string, displayName: string, handle: (string|null), avatarUrl: (string|null) }} publicProfile - Safe public profile
 * @property {AccountCapabilities} capabilities - Capability set
 * @property {AccountStatus} [accountStatus] - Moderation status
 */

/**
 * @typedef {'ACTIVE'|'SUSPENDED'|'BANNED'} AccountStatus
 */

/**
 * @typedef {Object} AccountCapabilities
 * @property {boolean} onlineCasual
 * @property {boolean} createPrivateDuel
 * @property {boolean} joinPrivateDuel
 * @property {boolean} spectate
 * @property {boolean} ranked
 * @property {boolean} publicLeaderboard
 * @property {boolean} persistentCloudProgress
 * @property {boolean} accountManagement
 */

// ── Public player ID generation ──

const PUBLIC_PLAYER_ID_PREFIX = 'PLY_';
const PUBLIC_PLAYER_ID_RANDOM_BYTES = 8; // 64 bits of entropy → ~1.8e19 space

/**
 * Generate a cryptographically random public player ID.
 * Format: PLY_<base64url(8 bytes)> — e.g. PLY_aB3xK9mZ2qRs
 * @returns {string}
 */
export function generatePublicPlayerId() {
  const bytes = randomBytes(PUBLIC_PLAYER_ID_RANDOM_BYTES);
  return PUBLIC_PLAYER_ID_PREFIX + bytes.toString('base64url');
}

/**
 * Validate that a string is a well-formed public player ID.
 * @param {unknown} v
 * @returns {boolean}
 */
export function isValidPublicPlayerId(v) {
  if (typeof v !== 'string') return false;
  return /^PLY_[A-Za-z0-9_-]{8,32}$/.test(v);
}

// ── Account ID validation ──

/**
 * Validate that a string is a well-formed Supabase account ID (UUID).
 * @param {unknown} v
 * @returns {boolean}
 */
export function isValidAccountId(v) {
  if (typeof v !== 'string') return false;
  // UUID v1-v5 format: 8-4-4-4-12 hex digits
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ── Participant token hashing ──

/**
 * Hash a raw participant token for secure at-rest storage.
 * Uses SHA-256 — one-way digest of a high-entropy random token.
 * The raw token is NEVER persisted; only this hash is stored.
 *
 * @param {string} rawToken - The raw participant token
 * @returns {string} Hex-encoded SHA-256 digest
 */
export function hashParticipantToken(rawToken) {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Verify a raw participant token against a stored hash in constant time.
 * @param {string} rawToken - The raw token to verify
 * @param {string} storedHash - The stored SHA-256 hex digest
 * @returns {boolean}
 */
export function verifyParticipantTokenHash(rawToken, storedHash) {
  if (typeof rawToken !== 'string' || typeof storedHash !== 'string') return false;
  const computed = hashParticipantToken(rawToken);
  if (computed.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

// ── Safe profile projection ──

/**
 * Build a safe public profile projection from a VerifiedIdentity.
 * Never includes accountId, email, provider tokens, or private metadata.
 * @param {VerifiedIdentity} identity
 * @returns {{ publicPlayerId: string, displayName: string, handle: (string|null), avatarUrl: (string|null) }}
 */
export function toSafePublicProfile(identity) {
  return {
    publicPlayerId: identity.publicProfile.publicPlayerId,
    displayName: identity.publicProfile.displayName,
    handle: identity.publicProfile.handle ?? null,
    avatarUrl: identity.publicProfile.avatarUrl ?? null,
  };
}

// ── Auth state constants ──

export const AuthState = Object.freeze({
  UNCONFIGURED: 'UNCONFIGURED',
  INITIALIZING: 'INITIALIZING',
  SIGNED_OUT: 'SIGNED_OUT',
  ANONYMOUS: 'ANONYMOUS',
  AUTHENTICATED: 'AUTHENTICATED',
  LINKING: 'LINKING',
  ERROR: 'ERROR',
});

export const ConnectionAuthState = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  AUTHENTICATED: 'AUTHENTICATED',
});

export const AuthProvider = Object.freeze({
  DISCORD: 'discord',
  EMAIL: 'email',
  ANONYMOUS: 'anonymous',
  UNKNOWN: 'unknown',
});

export const AccountStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
});

// ── Auth mode constants ──

export const AuthMode = Object.freeze({
  REQUIRED: 'required',
  DISABLED: 'disabled',
  OPTIONAL: 'optional',
});
