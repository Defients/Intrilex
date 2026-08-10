// ═══════════════════════════════════════════════════════════════
// identity-verifier.mjs — Identity verification interface
//
// The match server verifies Supabase access tokens through this
// abstraction. Production uses SupabaseIdentityVerifier (JWKS-backed
// cryptographic verification via getClaims). Tests use
// FakeIdentityVerifier with deterministic identities.
//
// This prevents every network test from calling real Supabase cloud
// while still exercising the full authorization logic.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} VerifiedIdentity
 * @property {string} accountId - Supabase user UUID (from verified JWT sub)
 * @property {boolean} isAnonymous - Derived from verified JWT claims
 * @property {string} provider - Auth provider ('discord'|'email'|'anonymous'|'unknown')
 * @property {number} expiresAt - Token expiration (ms epoch)
 * @property {{ publicPlayerId: string, displayName: string, handle: (string|null), avatarUrl: (string|null) }} publicProfile - Safe public profile
 * @property {import('@intrilex/account-domain').AccountCapabilities} capabilities - Capability set
 * @property {string} [accountStatus] - Moderation status ('ACTIVE'|'SUSPENDED'|'BANNED')
 */

/**
 * @typedef {Object} VerifyResult
 * @property {boolean} valid
 * @property {VerifiedIdentity} [identity] - Present when valid
 * @property {string} [code] - Reason code when invalid
 * @property {string} [message] - Human-readable error when invalid
 */

/**
 * Identity verifier interface.
 *
 * @interface IdentityVerifier
 * @method verify
 * @method close
 */

/**
 * Verify a Supabase access token and return a trusted identity.
 *
 * The server MUST call this — never trust client-supplied identity.
 * Decode ≠ verify. This interface performs full cryptographic verification.
 *
 * @param {string} accessToken - Supabase JWT access token
 * @returns {Promise<VerifyResult>}
 */
// eslint-disable-next-line no-unused-vars
export async function verify(accessToken) {
  throw new Error('IdentityVerifier.verify() must be implemented');
}
