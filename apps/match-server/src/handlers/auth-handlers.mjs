// ═══════════════════════════════════════════════════════════════
// auth-handlers.mjs — Authentication handshake + auth-attempt rate limiting
//
// Extracted from server.mjs to reduce file size and improve testability.
// Receives a context object with shared server state and helpers.
//
// Handlers:
//   - handleAuthenticate:  Verify a Supabase JWT and bind identity to connection
//   - handleAuthRefresh:   Refresh an expired token on an already-authenticated connection
//
// Security:
//   - Auth-attempt rate limiting per-IP (sliding window) — prevents Supabase API DoS
//   - IRX-H01: Re-auth with different accountId rejected (seat hijacking prevention)
//   - IRX-H12: Suspended/banned accounts rejected at auth time
//   - AUTHENTICATED response never echoes the access token
//   - Refresh token sub must match already-bound account (no account switching via refresh)
//   - Auth-attempt check runs BEFORE identityVerifier.verify() to protect the Supabase API
// ═══════════════════════════════════════════════════════════════

import {
  validateAuthenticate, validateAuthRefresh,
  ReasonCode,
  authenticated as authenticatedBuilder,
  error as errorMsg,
} from '@intrilex/network-protocol';
import {
  AuthMode, ConnectionAuthState, resolveCapabilities, toSafePublicProfile,
} from '@intrilex/account-domain';

/**
 * @typedef {Object} AuthHandlerContext
 * @property {Map<string, object>} connections - connectionId → connection state
 * @property {Map<string, number[]>} authAttempts - ip → timestamps of recent auth attempts
 * @property {Map<string, number>} bannedIps - ip → banExpiresAt
 * @property {() => object | null} getIdentityVerifier - accessor for the identity verifier
 * @property {() => string} getAuthMode - accessor for the active auth mode
 * @property {number} authAttemptMax - max auth attempts per IP per window
 * @property {number} authAttemptWindowMs - sliding window duration in ms
 * @property {number} authAttemptBanMs - ban duration for auth attempt flooding
 * @property {(ws: object, msg: object) => void} send - send a JSON message to a WebSocket
 * @property {(event: string, data?: object) => void} logEvent - structured log emitter
 */

/**
 * Check if an IP is allowed to make an auth attempt.
 * Uses a sliding window of recent auth attempt timestamps per IP.
 * If the IP has exceeded authAttemptMax within authAttemptWindowMs,
 * the IP is banned for authAttemptBanMs and all further attempts are rejected.
 *
 * This prevents DoS via Supabase API exhaustion — an attacker flooding
 * AUTHENTICATE requests from one IP would trigger Supabase rate limits
 * that lock out all legitimate users.
 *
 * @param {string} ip - Client IP address
 * @param {Map<string, number[]>} authAttempts - ip → timestamps
 * @param {Map<string, number>} bannedIps - ip → banExpiresAt
 * @param {number} authAttemptMax - max attempts per window
 * @param {number} authAttemptWindowMs - sliding window in ms
 * @param {number} authAttemptBanMs - ban duration in ms
 * @param {(event: string, data?: object) => void} logEvent - structured log emitter
 * @returns {{ allowed: boolean, banned: boolean }}
 */
export function checkAuthAttemptRate(ip, authAttempts, bannedIps, authAttemptMax, authAttemptWindowMs, authAttemptBanMs, logEvent) {
  if (!ip) return { allowed: true, banned: false }; // no IP tracking — allow
  const now = Date.now();
  let attempts = authAttempts.get(ip);
  if (!attempts) {
    attempts = [];
    authAttempts.set(ip, attempts);
  }
  // Prune entries outside the sliding window
  const cutoff = now - authAttemptWindowMs;
  while (attempts.length > 0 && attempts[0] < cutoff) {
    attempts.shift();
  }
  // Check if threshold already breached — IP should be banned
  if (attempts.length >= authAttemptMax) {
    // Ban the IP for auth attempt flooding
    bannedIps.set(ip, now + authAttemptBanMs);
    logEvent('ipBan', { ip, reason: 'auth_attempt_flood' });
    return { allowed: false, banned: true };
  }
  // Record this attempt
  attempts.push(now);
  return { allowed: true, banned: false };
}

/**
 * Create auth handlers bound to the given server context.
 *
 * @param {AuthHandlerContext} ctx
 * @returns {{ handleAuthenticate: Function, handleAuthRefresh: Function }}
 */
export function createAuthHandlers(ctx) {
  const {
    connections, authAttempts, bannedIps,
    getIdentityVerifier, getAuthMode,
    authAttemptMax, authAttemptWindowMs, authAttemptBanMs,
    send, logEvent,
  } = ctx;

  /**
   * Handle AUTHENTICATE — verify a Supabase JWT and bind identity to the connection.
   *
   * When auth is disabled (dev mode), accepts silently with a dev identity.
   * When auth is required:
   *   1. Validate payload format
   *   2. Check auth-attempt rate limit (per-IP, before Supabase API call)
   *   3. Call identityVerifier.verify() (Supabase JWKS)
   *   4. IRX-H01: Reject re-auth with different accountId (seat hijacking prevention)
   *   5. Bind identity to connection
   *   6. IRX-H12: Reject suspended/banned accounts
   *   7. Send AUTHENTICATED with safe public profile (never echo the token)
   *
   * @param {string} connectionId
   * @param {object} ws
   * @param {Record<string, *>} payload
   * @param {string} requestId
   */
  async function handleAuthenticate(connectionId, ws, payload, requestId) {
    const authMode = getAuthMode();
    // When auth is disabled, accept silently (no-op)
    if (authMode !== AuthMode.REQUIRED) {
      return send(ws, authenticatedBuilder(
        { publicPlayerId: 'PLY_dev', displayName: 'DevPlayer', handle: null, avatarUrl: null, isAnonymous: false, capabilities: resolveCapabilities({}, true) },
        Date.now() + 3600000,
        requestId,
      ));
    }

    const check = validateAuthenticate(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    // Auth-attempt rate limiting — check BEFORE calling identityVerifier.verify()
    // to prevent Supabase API exhaustion DoS. Tracked per-IP.
    const conn0 = connections.get(connectionId);
    const ip0 = conn0?.ip;
    const authRateCheck = checkAuthAttemptRate(ip0, authAttempts, bannedIps, authAttemptMax, authAttemptWindowMs, authAttemptBanMs, logEvent);
    if (!authRateCheck.allowed) {
      logEvent('authFailure', { connectionId, code: 'RATE_LIMITED', reason: 'auth_attempt_flood', ip: ip0 });
      send(ws, errorMsg(ReasonCode.RATE_LIMITED, 'Too many authentication attempts — try again later', requestId));
      if (authRateCheck.banned) ws.close(1013, 'Auth attempt flood');
      return;
    }

    const identityVerifier = getIdentityVerifier();
    const result = await identityVerifier.verify(payload.accessToken);
    if (!result.valid) {
      logEvent('authFailure', { connectionId, code: result.code });
      return send(ws, errorMsg(result.code, result.message, requestId));
    }

    // Bind verified identity to connection
    const conn = connections.get(connectionId);
    if (!conn) return;
    // IRX-H01: Prevent re-authentication from switching to a different account.
    // If the connection is already authenticated and bound to a match seat,
    // a re-AUTHENTICATE with a different accountId must be rejected to prevent
    // seat hijacking. The same subject may re-authenticate (e.g. token refresh).
    if (conn.authState === ConnectionAuthState.AUTHENTICATED && conn.account) {
      if (conn.account.accountId !== result.identity.accountId) {
        logEvent('authFailure', { connectionId, code: 'AUTH_ACCOUNT_SWITCH', reason: 're_auth_different_account', existingAccount: conn.account.accountId, newAccount: result.identity.accountId });
        return send(ws, errorMsg(ReasonCode.AUTH_REQUIRED, 'Already authenticated as a different account — disconnect and reconnect to switch accounts', requestId));
      }
    }
    conn.authState = ConnectionAuthState.AUTHENTICATED;
    conn.account = {
      accountId: result.identity.accountId,
      publicPlayerId: result.identity.publicProfile.publicPlayerId,
      isAnonymous: result.identity.isAnonymous,
      provider: result.identity.provider,
      tokenExpiresAt: result.identity.expiresAt,
      capabilities: result.identity.capabilities,
      accountStatus: result.identity.accountStatus ?? 'ACTIVE',
      displayName: result.identity.publicProfile.displayName,
      handle: result.identity.publicProfile.handle,
      avatarUrl: result.identity.publicProfile.avatarUrl,
    };

    logEvent('authSuccess', { connectionId, accountId: result.identity.accountId, isAnonymous: result.identity.isAnonymous });

    // IRX-H12: Enforce account status — reject suspended/banned accounts
    const acctStatus = conn.account.accountStatus ?? 'ACTIVE';
    if (acctStatus === 'SUSPENDED') {
      logEvent('authRejected', { connectionId, code: 'AUTH_ACCOUNT_SUSPENDED', accountId: result.identity.accountId });
      conn.authState = ConnectionAuthState.SIGNED_OUT;
      conn.account = null;
      return send(ws, errorMsg(ReasonCode.AUTH_ACCOUNT_SUSPENDED, 'This account is suspended', requestId));
    }
    if (acctStatus === 'BANNED') {
      logEvent('authRejected', { connectionId, code: 'AUTH_ACCOUNT_BANNED', accountId: result.identity.accountId });
      conn.authState = ConnectionAuthState.SIGNED_OUT;
      conn.account = null;
      return send(ws, errorMsg(ReasonCode.AUTH_ACCOUNT_BANNED, 'This account is banned', requestId));
    }

    // Send AUTHENTICATED with safe public profile — NEVER echo the access token
    send(ws, authenticatedBuilder(
      toSafePublicProfile(result.identity) ? {
        publicPlayerId: result.identity.publicProfile.publicPlayerId,
        displayName: result.identity.publicProfile.displayName,
        handle: result.identity.publicProfile.handle,
        avatarUrl: result.identity.publicProfile.avatarUrl,
        isAnonymous: result.identity.isAnonymous,
        capabilities: result.identity.capabilities,
      } : {
        publicPlayerId: result.identity.publicProfile.publicPlayerId,
        displayName: result.identity.publicProfile.displayName,
        handle: null,
        avatarUrl: null,
        isAnonymous: result.identity.isAnonymous,
        capabilities: result.identity.capabilities,
      },
      result.identity.expiresAt,
      requestId,
    ));
  }

  /**
   * Handle AUTH_REFRESH — refresh an expired token on an already-authenticated connection.
   *
   * The refreshed token's subject must match the already-bound account.
   * If it doesn't, the connection is disconnected (no account switching via refresh).
   *
   * @param {string} connectionId
   * @param {object} ws
   * @param {Record<string, *>} payload
   * @param {string} requestId
   */
  async function handleAuthRefresh(connectionId, ws, payload, requestId) {
    const authMode = getAuthMode();
    // When auth is disabled, no-op
    if (authMode !== AuthMode.REQUIRED) {
      return send(ws, authenticatedBuilder(
        { publicPlayerId: 'PLY_dev', displayName: 'DevPlayer', handle: null, avatarUrl: null, isAnonymous: false, capabilities: resolveCapabilities({}, true) },
        Date.now() + 3600000,
        requestId,
      ));
    }

    const check = validateAuthRefresh(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    const conn = connections.get(connectionId);
    if (!conn) return;

    // Must already be authenticated to refresh
    if (conn.authState !== ConnectionAuthState.AUTHENTICATED || !conn.account) {
      return send(ws, errorMsg(ReasonCode.AUTH_REQUIRED, 'Must authenticate before refresh', requestId));
    }

    // Auth-attempt rate limiting on refresh too — same Supabase API is called.
    const authRateCheck = checkAuthAttemptRate(conn.ip, authAttempts, bannedIps, authAttemptMax, authAttemptWindowMs, authAttemptBanMs, logEvent);
    if (!authRateCheck.allowed) {
      logEvent('authFailure', { connectionId, code: 'RATE_LIMITED', reason: 'auth_refresh_flood', ip: conn.ip });
      send(ws, errorMsg(ReasonCode.RATE_LIMITED, 'Too many token refresh attempts — try again later', requestId));
      if (authRateCheck.banned) ws.close(1013, 'Auth refresh flood');
      return;
    }

    const identityVerifier = getIdentityVerifier();
    const result = await identityVerifier.verify(payload.accessToken);
    if (!result.valid) {
      logEvent('authFailure', { connectionId, code: result.code, reason: 'refresh' });
      return send(ws, errorMsg(result.code, result.message, requestId));
    }

    // Refreshed token sub must match already-bound account
    if (result.identity.accountId !== conn.account.accountId) {
      logEvent('authFailure', { connectionId, code: 'AUTH_ACCOUNT_MISMATCH', reason: 'refresh_different_account' });
      // Disconnect — do not allow account switching via refresh
      send(ws, errorMsg(ReasonCode.AUTH_ACCOUNT_MISMATCH, 'Token refresh account mismatch — disconnecting', requestId));
      // Use close() not terminate() to allow the ERROR message to flush
      ws.close();
      connections.delete(connectionId);
      return;
    }

    // Update token expiration on the connection
    conn.account.tokenExpiresAt = result.identity.expiresAt;
    logEvent('authRefresh', { connectionId, accountId: conn.account.accountId });

    send(ws, authenticatedBuilder(
      {
        publicPlayerId: conn.account.publicPlayerId,
        displayName: conn.account.displayName,
        handle: conn.account.handle,
        avatarUrl: conn.account.avatarUrl,
        isAnonymous: conn.account.isAnonymous,
        capabilities: conn.account.capabilities,
      },
      result.identity.expiresAt,
      requestId,
    ));
  }

  return { handleAuthenticate, handleAuthRefresh };
}
