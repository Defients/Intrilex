// ═══════════════════════════════════════════════════════════════
// supabase-identity-verifier.mjs — Production identity verifier
//
// Uses @supabase/supabase-js getClaims() for JWKS-backed cryptographic
// JWT signature verification. Falls back to getUser() for symmetric keys.
//
// After JWT verification, loads the player profile from the profiles
// table via the service-role admin client.
//
// Server-only — NEVER browser-bundled. Uses the secret key.
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { resolveCapabilities, sanitizeAvatarUrl, sanitizeDisplayName } from '@intrilex/account-domain';
import { ReasonCode } from '@intrilex/network-protocol';

/**
 * @typedef {import('./identity-verifier.mjs').VerifiedIdentity} VerifiedIdentity
 * @typedef {import('./identity-verifier.mjs').VerifyResult} VerifyResult
 */

/**
 * SupabaseIdentityVerifier — production identity verifier.
 *
 * @param {Object} opts
 * @param {string} opts.supabaseUrl - Supabase project URL
 * @param {string} opts.supabaseSecretKey - Service role secret key (server only)
 */
export class SupabaseIdentityVerifier {
  /**
   * @param {Object} opts
   * @param {string} opts.supabaseUrl
   * @param {string} opts.supabaseSecretKey
   */
  constructor({ supabaseUrl, supabaseSecretKey }) {
    if (!supabaseUrl || !supabaseSecretKey) {
      throw new Error('SupabaseIdentityVerifier requires supabaseUrl and supabaseSecretKey');
    }
    // Admin client — service role, no session persistence, no auto-refresh
    this._client = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    this._url = supabaseUrl;
  }

  /**
   * Verify a Supabase access token.
   *
   * 1. Cryptographic JWT verification via getClaims() (JWKS-backed for asymmetric keys)
   * 2. Extract accountId (sub), isAnonymous, provider from claims
   * 3. Load player profile from profiles table
   * 4. Build VerifiedIdentity with capabilities
   *
   * @param {string} accessToken - Supabase JWT access token
   * @returns {Promise<VerifyResult>}
   */
  async verify(accessToken) {
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return { valid: false, code: ReasonCode.AUTH_TOKEN_MISSING, message: 'accessToken is required' };
    }

    // Step 1: Cryptographic JWT verification
    let claimsResult;
    try {
      claimsResult = await this._client.auth.getClaims(accessToken);
    } catch (err) {
      // Network errors, JWKS fetch failures, etc.
      const msg = err?.message ?? 'Token verification failed';
      if (msg.includes('expired') || msg.includes('exp')) {
        return { valid: false, code: ReasonCode.AUTH_TOKEN_EXPIRED, message: 'Token expired' };
      }
      if (msg.includes('invalid') || msg.includes('signature') || msg.includes('JWT')) {
        return { valid: false, code: ReasonCode.AUTH_TOKEN_INVALID, message: 'Token verification failed' };
      }
      // Network/config errors
      return { valid: false, code: ReasonCode.AUTH_CONFIG_UNAVAILABLE, message: 'Auth service unavailable' };
    }

    if (claimsResult.error || !claimsResult.data) {
      const err = claimsResult.error;
      const msg = err?.message ?? 'Token verification failed';
      if (msg.includes('expired') || msg.includes('exp')) {
        return { valid: false, code: ReasonCode.AUTH_TOKEN_EXPIRED, message: 'Token expired' };
      }
      return { valid: false, code: ReasonCode.AUTH_TOKEN_INVALID, message: 'Token verification failed' };
    }

    const claims = claimsResult.data.claims;
    const accountId = claims.sub;
    if (!accountId || typeof accountId !== 'string') {
      return { valid: false, code: ReasonCode.AUTH_TOKEN_INVALID, message: 'Token missing subject (sub) claim' };
    }

    // Step 2: Extract identity metadata from claims
    const isAnonymous = Boolean(claims.is_anonymous);
    const provider = claims.app_metadata?.provider ?? (isAnonymous ? 'anonymous' : 'unknown');
    const expiresAt = claims.exp ? claims.exp * 1000 : Date.now() + 3600000;

    // Step 3: Load player profile from database
    const { data: profile, error: profileError } = await this._client
      .from('profiles')
      .select('public_player_id, display_name, handle, avatar_url')
      .eq('user_id', accountId)
      .maybeSingle();

    if (profileError) {
      // Profile load failed — but JWT is valid. Use fallback profile.
      // The server can still authenticate; profile will be provisioned by trigger.
      return {
        valid: true,
        identity: {
          accountId,
          isAnonymous,
          provider,
          expiresAt,
          publicProfile: {
            publicPlayerId: `PLY_pending`,
            displayName: 'Player',
            handle: null,
            avatarUrl: null,
          },
          capabilities: resolveCapabilities({ isAnonymous }),
          accountStatus: 'ACTIVE',
        },
      };
    }

    // Step 4: Check moderation status
    let accountStatus = 'ACTIVE';
    const { data: mod } = await this._client
      .from('account_moderation')
      .select('status, expires_at')
      .eq('user_id', accountId)
      .maybeSingle();

    if (mod) {
      // Check if ban/suspension has expired
      if (mod.expires_at && new Date(mod.expires_at).getTime() < Date.now()) {
        accountStatus = 'ACTIVE';
      } else {
        accountStatus = mod.status ?? 'ACTIVE';
      }
    }

    if (accountStatus === 'BANNED') {
      return { valid: false, code: ReasonCode.AUTH_ACCOUNT_BANNED, message: 'Account banned' };
    }
    if (accountStatus === 'SUSPENDED') {
      return { valid: false, code: ReasonCode.AUTH_ACCOUNT_SUSPENDED, message: 'Account suspended' };
    }

    // Step 5: Build verified identity
    /** @type {VerifiedIdentity} */
    const identity = {
      accountId,
      isAnonymous,
      provider,
      expiresAt,
      publicProfile: {
        publicPlayerId: profile?.public_player_id ?? 'PLY_pending',
        displayName: sanitizeDisplayName(profile?.display_name ?? 'Player').sanitized ?? 'Player',
        handle: profile?.handle ?? null,
        avatarUrl: sanitizeAvatarUrl(profile?.avatar_url ?? null),
      },
      capabilities: resolveCapabilities({ isAnonymous }),
      accountStatus,
    };

    return { valid: true, identity };
  }

  /**
   * Close the verifier and release resources.
   */
  close() {
    // supabase-js doesn't have an explicit close, but we can release the reference
    this._client = null;
  }
}
