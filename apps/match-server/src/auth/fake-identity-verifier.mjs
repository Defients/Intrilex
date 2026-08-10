// ═══════════════════════════════════════════════════════════════
// fake-identity-verifier.mjs — Deterministic identity verifier for tests
//
// Registers identities by access token and returns them on verify().
// Exercises the full authorization logic without calling real Supabase.
//
// NEVER use in production.
// ═══════════════════════════════════════════════════════════════

import { resolveCapabilities } from '@intrilex/account-domain';
import { ReasonCode } from '@intrilex/network-protocol';

/**
 * @typedef {import('./identity-verifier.mjs').VerifiedIdentity} VerifiedIdentity
 * @typedef {import('./identity-verifier.mjs').VerifyResult} VerifyResult
 */

/**
 * FakeIdentityVerifier — deterministic test identity verifier.
 *
 * Usage:
 *   const verifier = new FakeIdentityVerifier();
 *   verifier.registerIdentity('token-A', { accountId: 'uuid-A', isAnonymous: false, ... });
 *   const result = await verifier.verify('token-A'); // → { valid: true, identity: {...} }
 */
export class FakeIdentityVerifier {
  constructor() {
    /** @type {Map<string, VerifiedIdentity>} */
    this._identities = new Map();
    /** @type {Map<string, number>} token → custom expiry override */
    this._expiries = new Map();
  }

  /**
   * Register a deterministic identity for a token.
   * @param {string} accessToken - The fake access token
   * @param {Partial<VerifiedIdentity> & { accountId: string }} identity - Identity fields
   * @param {number} [expiresInSeconds=3600] - Token lifetime in seconds
   * @returns {VerifiedIdentity}
   */
  registerIdentity(accessToken, identity, expiresInSeconds = 3600) {
    const isAnonymous = identity.isAnonymous ?? false;
    const provider = identity.provider ?? (isAnonymous ? 'anonymous' : 'discord');
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    /** @type {VerifiedIdentity} */
    const full = {
      accountId: identity.accountId,
      isAnonymous,
      provider,
      expiresAt,
      publicProfile: identity.publicProfile ?? {
        publicPlayerId: `PLY_${identity.accountId.slice(0, 12)}`,
        displayName: identity.publicProfile?.displayName ?? 'TestPlayer',
        handle: identity.publicProfile?.handle ?? null,
        avatarUrl: identity.publicProfile?.avatarUrl ?? null,
      },
      capabilities: identity.capabilities ?? resolveCapabilities({ isAnonymous }),
      accountStatus: identity.accountStatus ?? 'ACTIVE',
    };
    this._identities.set(accessToken, full);
    return full;
  }

  /**
   * Register an expired identity (for testing token expiration).
   * @param {string} accessToken
   * @param {Partial<VerifiedIdentity> & { accountId: string }} identity
   */
  registerExpiredIdentity(accessToken, identity) {
    const full = this.registerIdentity(accessToken, identity, -1);
    return full;
  }

  /**
   * Verify a token — returns the registered identity if valid.
   * @param {string} accessToken
   * @returns {Promise<VerifyResult>}
   */
  async verify(accessToken) {
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return { valid: false, code: ReasonCode.AUTH_TOKEN_MISSING, message: 'accessToken is required' };
    }
    const identity = this._identities.get(accessToken);
    if (!identity) {
      return { valid: false, code: ReasonCode.AUTH_TOKEN_INVALID, message: 'Unknown token' };
    }
    // Check expiration
    if (Date.now() >= identity.expiresAt) {
      return { valid: false, code: ReasonCode.AUTH_TOKEN_EXPIRED, message: 'Token expired' };
    }
    // Check account status
    if (identity.accountStatus === 'BANNED') {
      return { valid: false, code: ReasonCode.AUTH_ACCOUNT_BANNED, message: 'Account banned' };
    }
    if (identity.accountStatus === 'SUSPENDED') {
      return { valid: false, code: ReasonCode.AUTH_ACCOUNT_SUSPENDED, message: 'Account suspended' };
    }
    return { valid: true, identity };
  }

  /**
   * Close the verifier (no-op for fake).
   */
  close() {
    this._identities.clear();
  }
}
