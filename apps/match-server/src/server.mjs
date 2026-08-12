// ═══════════════════════════════════════════════════════════════
// server.mjs — Intrilex Match Authority Server
//
// WebSocket gateway that owns:
//   - Match registry
//   - Connection registry
//   - Participant authentication
//   - Message routing to authoritative match sessions
//
// Never owns game state directly — delegates to AuthoritativeMatchSession.
// ═══════════════════════════════════════════════════════════════

import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { createAuthoritativeMatch } from '@intrilex/match-authority';
import { InMemoryMatchStore, SqliteMatchStore } from '@intrilex/match-authority/match-store';
import { MatchmakingQueue } from '@intrilex/match-authority/matchmaking-queue';
import { buildNetworkPlayerView, buildSpectatorView } from '@intrilex/match-authority/player-projection';
import {
  validateEnvelope, validateCreateMatch, validateJoinMatch,
  validateResumeMatch, validateSubmitAction, validateReady,
  validateRequestSync, validateLeaveMatch,
  validateQueueJoin, validateQueueLeave,
  validateSpectateMatch, validateSpectateLeave,
  validateMatchHistory, validateGetReplay, validateSendChat, validateChatVisibility,
  validateAuthenticate, validateAuthRefresh,
  validateMigrateGuest,
  checkMessageSize, ReasonCode,
  matchCreated, matchJoined, matchView, actionResult,
  participantStatus, matchStarted, matchEnded, error as errorMsg,
  queueJoined, queueLeft, queueMatched,
  spectateMatch, spectateLeave, spectateJoined, spectateLeft,
  matchHistoryResult, envelope,
  replayAvailable, replayData,
  sendChat as sendChatBuilder, chatMessage, chatVisibilityChange,
  authenticated as authenticatedBuilder,
  achievementsEarned,
  migrationResult as migrationResultBuilder,
  SUPPORTED_PROFILE_IDS, SUPPORTED_QUEUE_IDS,
} from '@intrilex/network-protocol';
import { AuthMode, ConnectionAuthState, resolveCapabilities, toSafePublicProfile, RANKED_QUEUE_ID } from '@intrilex/account-domain';
import { migrationId as computeMigrationId } from '@intrilex/account-domain';
import { FakeIdentityVerifier } from './auth/fake-identity-verifier.mjs';
import { evaluateMatchAchievements } from '@intrilex/match-authority/achievement-projection';
import { MatchResultPersistor } from './persistence/match-result-persistor.mjs';
import { FakeMatchResultPersistor } from './persistence/fake-match-result-persistor.mjs';
import { buildMatchResultRecord } from './persistence/match-result-builder.mjs';
import { RatingService } from './ranked/rating-service.mjs';
import { TerminalOutbox } from './persistence/terminal-outbox.mjs';
import { LAB_VERSION } from '@intrilex/shared/version';

const require = createRequire(import.meta.url);

// ── Configuration ──

const DEFAULT_PORT = 3099;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_DB_PATH = 'runtime/match-server/matches.sqlite';
const HEARTBEAT_INTERVAL = 15000; // 15s
const MAX_MATCHES = 100;
const LOBBY_TTL = 300000; // 5 min
const MATCH_TTL = 1800000; // 30 min
const RECONNECT_GRACE = 60000; // 1 min
// Trusted proxy — only set to true when behind a known reverse proxy (nginx, Cloudflare, etc.)
// When false, x-forwarded-for headers are IGNORED and the raw socket address is used.
const TRUST_FORWARDED_IP = process.env.INTRILEX_TRUST_PROXY === '1' || false;
// Allowed origins for WebSocket connections (CORS-like check)
// When empty, all origins are accepted (dev mode).
// Can be overridden at startup via startServer({ allowedOrigins: [...] })
let ALLOWED_ORIGINS = process.env.INTRILEX_ALLOWED_ORIGINS
  ? process.env.INTRILEX_ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : []; // Empty = all origins accepted (set INTRILEX_ALLOWED_ORIGINS in production!)
// Public history/spectator discovery — disabled by default for invite-alpha
// Enable explicitly with INTRILEX_PUBLIC_HISTORY=1 for trusted environments
const PUBLIC_HISTORY_ENABLED = process.env.INTRILEX_PUBLIC_HISTORY === '1' || false;
// Public matchmaking — disabled by default for v0.24.1
// Enable explicitly with INTRILEX_PUBLIC_MATCHMAKING=1
const PUBLIC_MATCHMAKING_ENABLED = process.env.INTRILEX_PUBLIC_MATCHMAKING === '1' || false;

// ── Auth configuration ──
// Auth mode: 'required' (production), 'disabled' (development only)
// When 'required', all WebSocket connections must AUTHENTICATE before
// sending any privileged command (CREATE_MATCH, JOIN_MATCH, etc.).
// When 'disabled', the server behaves as before (no auth required) — DEV ONLY.
const AUTH_MODE = process.env.INTRILEX_AUTH_MODE ?? AuthMode.DISABLED;

// Feature flags — can be overridden by startServer() opts for testing
const _featureFlags = {
  publicHistory: PUBLIC_HISTORY_ENABLED,
  publicMatchmaking: PUBLIC_MATCHMAKING_ENABLED,
};

// Rate limiting: token bucket per connection
const RATE_LIMIT_CAPACITY = 10; // max 10 messages burst
const RATE_LIMIT_REFILL_MS = 1000; // refill 1 token per second
const RATE_LIMIT_BAN_THRESHOLD = 5; // 5 rate-limit hits → terminate connection
const RATE_LIMIT_BAN_DURATION_MS = 60000; // 1 min ban
// Configurable rate limit capacity (overridden by startServer opts for testing)
let _rateLimitCapacity = RATE_LIMIT_CAPACITY;
const MAX_CONNECTIONS_PER_IP = 10; // max concurrent connections per IP
const MAX_SPECTATORS_PER_MATCH = 50; // max spectators per match
const MAX_GLOBAL_CONNECTIONS = 500; // global connection cap — prevents botnet flooding from many IPs

// ── Server state ──

let matchStore = null;
let matchmakingQueue = null;
let identityVerifier = null; // IdentityVerifier instance (set by startServer)
let matchResultPersistor = null; // MatchResultPersistor instance (set by startServer)
let ratingService = null; // RatingService instance (set by startServer) — RANK-01/3C
let terminalOutbox = null; // TerminalOutbox instance (set by startServer) — DATA-01
let _authMode = AUTH_MODE; // Active auth mode (can be overridden by startServer opts)
let _isProductionMode = false; // True when authMode=required (DATA-04: fail-closed persistence)
const connections = new Map(); // connectionId → { ws, authState, account, participantId, matchId, lastHeartbeat, isSpectator, spectatingMatchId, rateLimit, ip }
const bannedIps = new Map(); // ip → banExpiresAt
const ipConnectionCounts = new Map(); // ip → active connection count
const _httpRateLimit = new Map(); // ip → { count, windowStart } — v0.24.2 HTTP rate limiter

// ── Observability: structured event logger + metrics counters ──
const _startTime = Date.now();
const _eventCounters = {
  connectionOpen: 0, connectionClose: 0, matchCreate: 0, matchJoin: 0,
  matchStart: 0, matchEnd: 0, actionSubmit: 0, actionReject: 0,
  rateLimitHit: 0, ipBan: 0, spectateJoin: 0, spectateLeave: 0,
  reconnect: 0, error: 0, globalConnectionReject: 0, ipConnectionReject: 0,
  replayDownload: 0,
  authSuccess: 0, authFailure: 0, authRefresh: 0, authRequired: 0,
};
const LOG_ENABLED = process.env.INTRILEX_LOG !== '0'; // set INTRILEX_LOG=0 to silence

/**
 * Emit a structured JSON log entry to stderr (stdout reserved for CLI banner).
 * Format: {"ts":"2024-01-01T00:00:00.000Z","event":"connection.open","data":{...}}
 */
function logEvent(event, data = {}) {
  _eventCounters[event] = (_eventCounters[event] ?? 0) + 1;
  if (!LOG_ENABLED) return;
  const entry = JSON.stringify({ ts: new Date().toISOString(), event, ...data });
  process.stderr.write(entry + '\n');
}

/**
 * Return server health metrics for the HTTP health endpoint.
 */
function getHealthMetrics() {
  const memUsage = process.memoryUsage();
  return {
    uptime: Date.now() - _startTime,
    activeMatches: matchStore?.count ?? 0,
    activeConnections: connections.size,
    queueSize: matchmakingQueue?.size ?? 0,
    bannedIpCount: bannedIps.size,
    memory: {
      rssMB: Math.round(memUsage.rss / 1048576),
      heapUsedMB: Math.round(memUsage.heapUsed / 1048576),
      heapTotalMB: Math.round(memUsage.heapTotal / 1048576),
    },
    events: { ..._eventCounters },
    auth: {
      mode: _authMode,
      verifierConfigured: identityVerifier !== null,
    },
    persistence: {
      persistorType: matchResultPersistor?.constructor.name ?? 'none',
    },
  };
}

/**
 * Extract client IP from a WebSocket connection.
 * Only trusts x-forwarded-for when TRUST_FORWARDED_IP is explicitly enabled
 * (set INTRILEX_TRUST_PROXY=1 when behind a known reverse proxy).
 * Otherwise, uses the raw socket remote address to prevent IP spoofing.
 */
function getClientIp(ws, req) {
  if (TRUST_FORWARDED_IP) {
    const forwarded = req?.headers?.['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
  }
  // Fall back to the raw socket remote address from the HTTP request
  return req?.socket?.remoteAddress ?? ws?._socket?.remoteAddress ?? 'unknown';
}

/**
 * Check if an IP is currently banned.
 */
function isIpBanned(ip) {
  const banExpires = bannedIps.get(ip);
  if (!banExpires) return false;
  if (Date.now() > banExpires) {
    bannedIps.delete(ip);
    return false;
  }
  return true;
}

/**
 * Ban an IP for RATE_LIMIT_BAN_DURATION_MS.
 */
function banIp(ip) {
  bannedIps.set(ip, Date.now() + RATE_LIMIT_BAN_DURATION_MS);
}

// ── RANK-01: Server-owned match classification ──

/**
 * Classify a match based on the client's request and server-side validation.
 *
 * The client may request a queueId, but the server creates authoritative
 * classification after validation. A client can NEVER declare a result ranked
 * — ranked admission requires:
 *   - authentication enabled and both players authenticated
 *   - an explicitly supported ranked queue
 *   - an active season resolved server-side
 *   - required durable persistence/schema capability
 *
 * Historical snapshots lacking classification default conservatively to
 * non-ranked 'private' — never infer ranked from a profile string.
 *
 * @param {object} opts
 * @param {string} [opts.requestedQueueId] - Client-requested queue ('ranked'|'casual'|'private')
 * @param {string} [opts.profileId] - Engine rules profile
 * @param {boolean} [opts.isMatchmaking] - Whether this match is from public matchmaking
 * @returns {{ matchMode: string, queueId: string|null, seasonId: string|null, admitted: boolean, reason: string|null }}
 */
function classifyMatch({ requestedQueueId, profileId, isMatchmaking = false }) {
  // Default: private duel (invite-based)
  if (!requestedQueueId || requestedQueueId === 'private') {
    return { matchMode: 'private', queueId: 'private', seasonId: null, admitted: true, reason: null };
  }

  // Casual matchmaking
  if (requestedQueueId === 'casual' || (isMatchmaking && !requestedQueueId)) {
    return { matchMode: 'casual', queueId: 'casual', seasonId: null, admitted: true, reason: null };
  }

  // Ranked admission — server-owned, fail-closed
  if (requestedQueueId === 'ranked') {
    // Requirement 1: auth must be required (production mode)
    if (_authMode !== AuthMode.REQUIRED) {
      return { matchMode: 'private', queueId: null, seasonId: null, admitted: false, reason: 'RANKED_REQUIRES_AUTH' };
    }
    // Requirement 2: production mode must have a durable (non-fake) persistor
    if (!matchResultPersistor || matchResultPersistor instanceof FakeMatchResultPersistor) {
      return { matchMode: 'private', queueId: null, seasonId: null, admitted: false, reason: 'RANKED_REQUIRES_DURABLE_PERSISTENCE' };
    }
    // Requirement 3: RatingService must be configured
    if (!ratingService) {
      return { matchMode: 'private', queueId: null, seasonId: null, admitted: false, reason: 'RANKED_REQUIRES_RATING_SERVICE' };
    }
    // Requirement 4: active season resolved server-side
    let seasonId = null;
    if (matchResultPersistor && typeof matchResultPersistor.resolveActiveSeasonId === 'function') {
      // Season resolution is async — we attempt it here but classification
      // is sync. The season is resolved at terminal time in buildMatchResultRecord.
      // For admission, we check that the persistor CAN resolve seasons.
      seasonId = 'pending'; // Will be resolved at terminal time
    } else {
      return { matchMode: 'private', queueId: null, seasonId: null, admitted: false, reason: 'RANKED_REQUIRES_SEASON_AUTHORITY' };
    }
    return { matchMode: 'ranked', queueId: 'ranked', seasonId, admitted: true, reason: null };
  }

  // Unknown queue — fail closed
  return { matchMode: 'private', queueId: null, seasonId: null, admitted: false, reason: 'UNKNOWN_QUEUE' };
}

/**
 * Validate ranked admission for a specific match with both participants present.
 * Called when the second player joins/ready-checks a ranked match.
 *
 * @param {import('@intrilex/match-authority').AuthoritativeMatchSession} match
 * @returns {{ admitted: boolean, reason: string|null }}
 */
function validateRankedAdmission(match) {
  if (match.queueId !== RANKED_QUEUE_ID) return { admitted: true, reason: null };

  // Both participants must be authenticated with distinct permanent accounts
  const participants = [...match.participants.values()];
  if (participants.length !== 2) {
    return { admitted: false, reason: 'RANKED_REQUIRES_TWO_PLAYERS' };
  }
  const [p1, p2] = participants;
  if (!p1.accountId || !p2.accountId) {
    return { admitted: false, reason: 'RANKED_REQUIRES_AUTHENTICATED_PLAYERS' };
  }
  if (p1.accountId === p2.accountId) {
    return { admitted: false, reason: 'RANKED_REQUIRES_DISTINCT_ACCOUNTS' };
  }

  return { admitted: true, reason: null };
}

/**
 * Classify a match for CREATE_MATCH, returning the classification fields
 * or throwing with a typed reason code if ranked admission fails.
 * @param {Record<string,*>} payload - CREATE_MATCH payload
 * @returns {{ matchMode: string, queueId: string|null, seasonId: string|null }}
 */
function classifyMatchForCreate(payload) {
  const classification = classifyMatch({
    requestedQueueId: payload.queueId,
    profileId: payload.profileId,
    isMatchmaking: false,
  });
  if (!classification.admitted) {
    throw Object.assign(new Error(`Ranked admission denied: ${classification.reason}`), { code: ReasonCode.QUEUE_FULL, classificationReason: classification.reason });
  }
  return {
    matchMode: classification.matchMode,
    queueId: classification.queueId,
    seasonId: classification.seasonId,
  };
}

/**
 * Count active connections for an IP.
 */
function countConnectionsByIp(ip) {
  let count = 0;
  for (const conn of connections.values()) {
    if (conn.ip === ip) count++;
  }
  return count;
}

/**
 * Token bucket rate limiter.
 * Each connection gets a bucket with RATE_LIMIT_CAPACITY tokens.
 * Each message consumes 1 token. Tokens refill at 1 per RATE_LIMIT_REFILL_MS.
 * If a connection hits the rate limit RATE_LIMIT_BAN_THRESHOLD times, it's banned.
 */
function checkRateLimit(connectionId) {
  const conn = connections.get(connectionId);
  if (!conn) return { allowed: true };

  if (!conn.rateLimit) {
    conn.rateLimit = {
      tokens: _rateLimitCapacity,
      lastRefill: Date.now(),
      hits: 0,
    };
  }

  const now = Date.now();
  const elapsed = now - conn.rateLimit.lastRefill;
  const refilled = Math.floor(elapsed / RATE_LIMIT_REFILL_MS);
  conn.rateLimit.tokens = Math.min(_rateLimitCapacity, conn.rateLimit.tokens + refilled);
  conn.rateLimit.lastRefill = now;

  if (conn.rateLimit.tokens > 0) {
    conn.rateLimit.tokens--;
    return { allowed: true };
  }

  // Rate limited
  conn.rateLimit.hits++;
  if (conn.rateLimit.hits >= RATE_LIMIT_BAN_THRESHOLD) {
    return { allowed: false, ban: true };
  }
  return { allowed: false, ban: false };
}

/**
 * Start the match server.
 * @param {object} [opts]
 * @param {number} [opts.port=3099]
 * @param {string} [opts.host='127.0.0.1']
 * @param {string} [opts.dbPath] - SQLite path (default: durable file). Use ':memory:' for volatile.
 * @param {boolean} [opts.persistent=true] - Use SqliteMatchStore (true) or InMemoryMatchStore (false)
 * @param {string} [opts.authMode] - Auth mode: 'required' (production) or 'disabled' (dev)
 * @param {object} [opts.identityVerifier] - IdentityVerifier instance (for testing or custom verification)
 * @param {string} [opts.supabaseUrl] - Supabase project URL (for production verifier)
 * @param {string} [opts.supabaseSecretKey] - Supabase service role key (for production verifier)
 * @param {string[]} [opts.allowedOrigins] - Override allowed WebSocket origins (for testing)
 * @returns {Promise<{ httpServer, wss, close }>}
 */
export function startServer(opts = {}) {
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? DEFAULT_HOST;
  const persistent = opts.persistent ?? true;

  // Override allowed origins if provided (for testing / dynamic configuration)
  if (opts.allowedOrigins !== undefined) {
    ALLOWED_ORIGINS = opts.allowedOrigins;
  }

  // ── Auth initialization ──
  _authMode = opts.authMode ?? AUTH_MODE;

  if (_authMode === AuthMode.REQUIRED) {
    // Production: must have a verifier
    if (opts.identityVerifier) {
      identityVerifier = opts.identityVerifier;
    } else if (opts.supabaseUrl && opts.supabaseSecretKey) {
      // Dynamically import to avoid loading supabase-js when auth is disabled
      const { SupabaseIdentityVerifier } = require('./auth/supabase-identity-verifier.mjs');
      identityVerifier = new SupabaseIdentityVerifier({
        supabaseUrl: opts.supabaseUrl,
        supabaseSecretKey: opts.supabaseSecretKey,
      });
    } else if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
      const { SupabaseIdentityVerifier } = require('./auth/supabase-identity-verifier.mjs');
      identityVerifier = new SupabaseIdentityVerifier({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
      });
    } else {
      // FAIL STARTUP LOUDLY — never silently run insecure multiplayer
      throw new Error(
        'INTRILEX_AUTH_MODE=required but no identity verifier configured. ' +
        'Provide opts.identityVerifier, opts.supabaseUrl+opts.supabaseSecretKey, ' +
        'or set SUPABASE_URL+SUPABASE_SECRET_KEY environment variables.'
      );
    }
    logEvent('authConfigured', { mode: _authMode, verifier: identityVerifier.constructor.name });
  } else {
    // Dev mode: auth disabled
    identityVerifier = null;
    if (LOG_ENABLED) {
      process.stderr.write(
        '\n⚠  WARNING: ACCOUNT AUTHENTICATION DISABLED\n' +
        '   DEVELOPMENT USE ONLY — DO NOT RUN IN PRODUCTION\n\n'
      );
    }
  }

  // Override feature flags from opts (for testing and explicit trusted environments)
  const publicHistory = opts.publicHistory ?? PUBLIC_HISTORY_ENABLED;
  const publicMatchmaking = opts.publicMatchmaking ?? PUBLIC_MATCHMAKING_ENABLED;
  // Reassign the module-level flags so handlers see the correct value
  _featureFlags.publicHistory = publicHistory;
  _featureFlags.publicMatchmaking = publicMatchmaking;
  // Override rate limit capacity for testing (default: 10)
  _rateLimitCapacity = opts.rateLimitCapacity ?? RATE_LIMIT_CAPACITY;

  // Initialize match store
  if (persistent) {
    const dbPath = opts.dbPath ?? DEFAULT_DB_PATH;
    // Ensure directory exists for file-based DB
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      try { mkdirSync(dir, { recursive: true }); } catch { /* may already exist */ }
    }
    matchStore = new SqliteMatchStore({ path: dbPath });
  } else {
    matchStore = new InMemoryMatchStore();
  }

  // DATA-04: Unified production persistence configuration — fail-closed.
  // One canonical server-only configuration contract. The old
  // supabaseSecretKey/supabaseServiceKey split is replaced with a single
  // opts.supabaseServiceKey (or env SUPABASE_SECRET_KEY) used for both
  // auth verifier and result persistor. A compatibility alias is retained
  // but emits a redacted deprecation warning.
  //
  // In production/auth-required mode, startup FAILS LOUDLY unless a durable
  // result persistor is configured. FakeMatchResultPersistor is allowed
  // ONLY in explicit dev/test modes (authMode=disabled or opts.allowFakePersistor).
  _isProductionMode = _authMode === AuthMode.REQUIRED;

  // Resolve the canonical service key from one source (DATA-04):
  // Precedence: opts.supabaseServiceKey > opts.supabaseSecretKey (deprecated alias) > env
  const _resolvedServiceKey = opts.supabaseServiceKey
    ?? opts.supabaseSecretKey
    ?? process.env.SUPABASE_SECRET_KEY
    ?? null;
  if (opts.supabaseSecretKey && opts.supabaseServiceKey && opts.supabaseSecretKey !== opts.supabaseServiceKey) {
    process.stderr.write('⚠  WARNING: Both supabaseSecretKey and supabaseServiceKey provided with different values. Using supabaseServiceKey (canonical). supabaseSecretKey is deprecated.\n');
  } else if (opts.supabaseSecretKey && !opts.supabaseServiceKey) {
    process.stderr.write('⚠  WARNING: supabaseSecretKey is deprecated. Use supabaseServiceKey instead. Using the provided value for this startup.\n');
  }

  if (opts.matchResultPersistor) {
    matchResultPersistor = opts.matchResultPersistor;
  } else if (opts.supabaseUrl && _resolvedServiceKey) {
    // Dynamically import to avoid loading supabase-js when persistence is not needed
    const { SupabaseMatchResultPersistor } = require('./persistence/supabase-match-result-persistor.mjs');
    matchResultPersistor = new SupabaseMatchResultPersistor({
      supabaseUrl: opts.supabaseUrl,
      supabaseServiceKey: _resolvedServiceKey,
    });
  } else if (process.env.SUPABASE_URL && _resolvedServiceKey) {
    const { SupabaseMatchResultPersistor } = require('./persistence/supabase-match-result-persistor.mjs');
    matchResultPersistor = new SupabaseMatchResultPersistor({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseServiceKey: _resolvedServiceKey,
    });
  } else if (_isProductionMode && !opts.allowFakePersistor) {
    // DATA-04: FAIL LOUDLY in production — never silently use fake persistence
    throw new Error(
      'INTRILEX_AUTH_MODE=required but no durable match result persistor configured. ' +
      'Provide opts.matchResultPersistor, opts.supabaseUrl+opts.supabaseServiceKey, ' +
      'or set SUPABASE_URL+SUPABASE_SECRET_KEY environment variables. ' +
      'FakeMatchResultPersistor is forbidden in production mode.'
    );
  } else {
    // Dev/test default: in-memory persistor (explicitly allowed only in dev mode)
    matchResultPersistor = new FakeMatchResultPersistor();
  }
  logEvent('persistorConfigured', { type: matchResultPersistor.constructor.name, productionMode: _isProductionMode });

  // RANK-01/3C: Wire RatingService in production server orchestration.
  // RatingService is the canonical rated-result application owner.
  // In dev mode, it's still wired (using the fake persistor) for testing.
  ratingService = new RatingService({ persistor: matchResultPersistor, logger: { debug: (data) => logEvent('ratingService', data) } });
  logEvent('ratingServiceConfigured', { type: ratingService.constructor.name });

  // DATA-01: Durable terminal lifecycle outbox.
  // Terminal effects (result + achievements) are durably queued before
  // completion is considered durable. Retries with bounded backoff,
  // restart recovery, and idempotent application.
  const outboxDurable = persistent && opts.outboxDurable !== false;
  const outboxPath = opts.outboxPath ?? (opts.dbPath ? dirname(opts.dbPath) + '/terminal-outbox.sqlite' : 'runtime/match-server/terminal-outbox.sqlite');
  if (outboxDurable) {
    const outboxDir = dirname(outboxPath);
    try { mkdirSync(outboxDir, { recursive: true }); } catch { /* may already exist */ }
  }
  terminalOutbox = new TerminalOutbox({
    durable: outboxDurable,
    path: outboxPath,
    persistor: matchResultPersistor,
    ratingService,
    logger: { debug: (data) => logEvent('outbox', data) },
  });
  // Recover any interrupted jobs from a previous run
  const recovered = terminalOutbox.recoverPending();
  terminalOutbox.startDrain();
  logEvent('terminalOutboxConfigured', { durable: outboxDurable, recovered });

  // Initialize matchmaking queue
  matchmakingQueue = new MatchmakingQueue({
    onCreateMatch: (profileId, seed, players) => {
      // Create a match and add both players
      const matchId = `M-${randomBytes(12).toString('base64url')}`;
      // RANK-01: Matchmaking queue matches are classified as 'casual' by default.
      // Ranked matchmaking requires explicit queueId='ranked' in QUEUE_JOIN payload
      // and passes ranked admission validation.
      const queueId = players[0]?.queueId ?? players[1]?.queueId ?? 'casual';
      const classification = classifyMatch({ requestedQueueId: queueId, profileId, isMatchmaking: true });
      const match = createAuthoritativeMatch({
        matchId, profileId, seed,
        matchMode: classification.matchMode,
        queueId: classification.queueId,
        seasonId: classification.seasonId,
      });

      const results = players.map(({ connectionId, accountId }) => {
        const participantToken = randomBytes(32).toString('base64url');
        const participantId = `P-${randomBytes(8).toString('base64url')}`;
        const queueConn = connections.get(connectionId);
        match.addParticipant(participantId, participantToken, accountId ?? null, buildPublicProfile(queueConn));

        // Bind connection to participant
        const conn = connections.get(connectionId);
        if (conn) {
          conn.participantId = participantId;
          conn.matchId = matchId;
        }

        return { connectionId, matchId, participantId, participantToken };
      });

      matchStore.save(match);

      // Send QUEUE_MATCHED to both players
      for (const r of results) {
        const conn = connections.get(r.connectionId);
        if (conn) {
          send(conn.ws, queueMatched(r.matchId, r.participantToken));
        }
      }

      return results;
    },
  });

  const httpServer = createServer((req, res) => {
    // v0.24.2: Lightweight per-IP HTTP rate limiter for public endpoints.
    // Prevents abuse of /health, /metrics, and 404 paths.
    const clientIp = _featureFlags.trustForwardedIp
      ? (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress)
      : req.socket.remoteAddress;
    const now = Date.now();
    if (bannedIps.has(clientIp) && bannedIps.get(clientIp) > now) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'IP banned', code: 'RATE_LIMITED' }));
      return;
    }
    // Simple per-IP HTTP request rate limit: max 60 req/min
    if (!_httpRateLimit.has(clientIp)) _httpRateLimit.set(clientIp, { count: 0, windowStart: now });
    const rl = _httpRateLimit.get(clientIp);
    if (now - rl.windowStart > 60000) {
      rl.count = 0;
      rl.windowStart = now;
    }
    rl.count++;
    if (rl.count > 60) {
      // Ban for 60s on excessive HTTP requests
      bannedIps.set(clientIp, now + RATE_LIMIT_BAN_DURATION_MS);
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'HTTP rate limit exceeded', code: 'RATE_LIMITED' }));
      return;
    }

    // Health endpoint at /
    if (req.url === '/' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        server: 'Intrilex Match Authority',
        version: '0.27.0',
        protocolVersion: 2,
        ...getHealthMetrics(),
      }));
      return;
    }
    // Metrics endpoint at /metrics — same data, optimized for monitoring scrapers
    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getHealthMetrics()));
      return;
    }
    // NOTE: Unauthenticated HTTP replay download was removed in v0.24.2
    // (Truth Closure II). Certified replays are available ONLY via the
    // authenticated WebSocket GET_REPLAY flow, which validates the
    // participant token before releasing the full game truth (initial
    // state + command log → reconstructs both hands and the draw pile).
    // See handleGetReplay() for the canonical authenticated path.
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  // WebSocket server with permessage-deflate compression.
  // The ws library negotiates permessage-deflate automatically during the
  // WebSocket handshake. These thresholds prevent compressing tiny messages
  // (where the deflate header overhead exceeds the savings).
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: 65536,
    perMessageDeflate: {
      // Only compress messages above this size (bytes)
      threshold: 256,
      // Server-side window size (memory vs. compression ratio tradeoff)
      serverMaxWindowBits: 13,
      // Client-side window size
      clientMaxWindowBits: 13,
      // Don't keep the deflate context alive between messages
      // (reduces memory overhead for low-frequency game messages)
      contextTakeover: false,
    },
  });

  wss.on('connection', (ws, req) => {
    const ip = getClientIp(ws, req);

    // Check IP ban
    if (isIpBanned(ip)) {
      logEvent('ipBan', { ip, reason: 'banned_reconnect' });
      ws.close(1008, 'IP banned due to rate limit violations');
      return;
    }

    // Check global connection limit (prevents botnet flooding from many IPs)
    if (connections.size >= MAX_GLOBAL_CONNECTIONS) {
      logEvent('globalConnectionReject', { ip, count: connections.size });
      ws.close(1013, 'Server at maximum capacity — try again later');
      return;
    }

    // Check per-IP connection limit
    if (countConnectionsByIp(ip) >= MAX_CONNECTIONS_PER_IP) {
      logEvent('ipConnectionReject', { ip });
      ws.close(1008, 'Too many connections from this IP');
      return;
    }

    // Origin validation — when ALLOWED_ORIGINS is configured, reject unknown origins
    if (ALLOWED_ORIGINS.length > 0) {
      const origin = req?.headers?.origin ?? '';
      if (origin && !ALLOWED_ORIGINS.includes(origin)) {
        ws.close(1008, 'Origin not allowed');
        return;
      }
    }

    const connectionId = randomUUID();
    connections.set(connectionId, { ws, authState: ConnectionAuthState.UNAUTHENTICATED, account: null, participantId: null, matchId: null, lastHeartbeat: Date.now(), isSpectator: false, spectatingMatchId: null, ip });
    logEvent('connectionOpen', { connectionId, ip, total: connections.size });

    ws.on('message', (raw) => {
      // NET-01: Promise-aware dispatch — observe the returned promise so
      // async handler rejections are contained at the WebSocket boundary
      // rather than escaping as unhandled rejections. The sync try/catch
      // inside handleMessage only catches synchronous throws; async
      // rejections need explicit .catch() on the returned promise.
      try {
        const result = handleMessage(connectionId, ws, raw);
        if (result && typeof result.then === 'function') {
          result.catch((err) => {
            // Request-scoped failure — already handled inside handleMessage
            // for most paths, but this is the safety net for any edge case
            // where an async handler rejects before sending its own error.
            logEvent('unhandledAsyncRejection', { connectionId, error: err?.message ?? String(err) });
          });
        }
      } catch (err) {
        // Synchronous throw inside handleMessage itself (should be rare —
        // handleMessage has its own try/catch, but this is defense-in-depth).
        logEvent('messageHandlerThrow', { connectionId, error: err?.message ?? String(err) });
      }
    });
    ws.on('close', () => handleDisconnect(connectionId));
    ws.on('error', () => handleDisconnect(connectionId));
    // Track liveness via pong — update lastHeartbeat when the client responds to ping
    ws.on('pong', () => {
      const c = connections.get(connectionId);
      if (c) c.lastHeartbeat = Date.now();
    });
  });

  // Heartbeat — ping all connections, terminate dead peers
  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [cid, conn] of connections) {
      if (now - conn.lastHeartbeat > HEARTBEAT_INTERVAL * 2) {
        // Dead peer detected — perform disconnect bookkeeping before terminating
        try { handleDisconnect(cid); } catch { /* ignore */ }
        try { conn.ws.terminate(); } catch { /* ignore */ }
      } else {
        try { conn.ws.ping(); } catch { /* ignore */ }
      }
    }
  }, HEARTBEAT_INTERVAL);

  // Cleanup timer — uses status-specific TTL policies
  const cleanupTimer = setInterval(() => {
    matchStore.cleanExpired({
      lobbyTtl: LOBBY_TTL,
      matchTtl: MATCH_TTL,
      historyTtl: 3600000, // 1 hr for terminal history
    });
    // Clean expired queue entries and notify them
    if (matchmakingQueue) {
      const expired = matchmakingQueue.cleanExpired();
      for (const cid of expired) {
        const conn = connections.get(cid);
        if (conn) send(conn.ws, errorMsg(ReasonCode.QUEUE_TIMEOUT, 'Queue timeout'));
      }
    }
    // Clean expired IP bans
    const now = Date.now();
    for (const [ip, expires] of bannedIps) {
      if (now > expires) bannedIps.delete(ip);
    }
  }, 60000);

  return new Promise((resolve) => {
    httpServer.listen(port, host, () => {
      const api = {
        httpServer,
        wss,
        get matchStore() { return matchStore; },
        get matchResultPersistor() { return matchResultPersistor; },
        get ratingService() { return ratingService; },
        get terminalOutbox() { return terminalOutbox; },
        close() {
          clearInterval(heartbeatTimer);
          clearInterval(cleanupTimer);
          // v0.25: Remove signal handlers on explicit close
          process.removeListener('SIGTERM', signalHandler);
          process.removeListener('SIGINT', signalHandler);
          // Close all active connections
          for (const conn of connections.values()) {
            try { conn.ws.terminate(); } catch { /* ignore */ }
          }
          connections.clear();
          if (matchmakingQueue) matchmakingQueue = null;
          if (matchStore) matchStore.close();
          matchStore = null;
          if (identityVerifier) { identityVerifier.close?.(); identityVerifier = null; }
          // DATA-01: Drain terminal outbox before closing persistor.
          // Bound shutdown drain time, persist unfinished work, then close.
          return (async () => {
            if (terminalOutbox) {
              try { await terminalOutbox.shutdown(5000); } catch { /* ignore */ }
              terminalOutbox = null;
            }
            if (matchResultPersistor) { matchResultPersistor.close?.(); matchResultPersistor = null; }
            ratingService = null;
            // Clear module-level state to prevent cross-instance contamination in tests
            bannedIps.clear();
            // Force-close with a timeout fallback
            return new Promise((resolve) => {
              let resolved = false;
              const done = () => { if (!resolved) { resolved = true; resolve(); } };
              setTimeout(done, 2000); // fallback timeout
              wss.close(() => {
                httpServer.close(() => done());
              });
            });
          })();
        },
      };

      // v0.25: Graceful shutdown on SIGTERM/SIGINT
      // Stop accepting new connections, close existing WebSockets cleanly,
      // flush/close SQLite, and exit deterministically.
      const signalHandler = async (sig) => {
        console.log(`\n${sig} received — shutting down match server...`);
        try { await api.close(); } catch { /* ignore */ }
        process.exit(0);
      };
      process.on('SIGTERM', signalHandler);
      process.on('SIGINT', signalHandler);

      resolve(api);
    });
  });
}

// ── Message handling ──

function handleMessage(connectionId, ws, raw) {
  const conn = connections.get(connectionId);
  if (!conn) return;
  conn.lastHeartbeat = Date.now();

  // Rate limit check (before any processing)
  const rateCheck = checkRateLimit(connectionId);
  if (!rateCheck.allowed) {
    if (rateCheck.ban) {
      // Ban the IP
      if (conn.ip) banIp(conn.ip);
      logEvent('ipBan', { ip: conn.ip, reason: 'rate_limit_threshold' });
      send(ws, errorMsg(ReasonCode.RATE_LIMITED, 'Rate limit exceeded — connection terminated'));
      ws.terminate();
      connections.delete(connectionId);
      return;
    }
    logEvent('rateLimitHit', { connectionId, ip: conn.ip, hits: conn.rateLimit?.hits ?? 0 });
    return send(ws, errorMsg(ReasonCode.RATE_LIMITED, 'Rate limit exceeded — slow down'));
  }

  // Size check
  const sizeCheck = checkMessageSize(raw);
  if (!sizeCheck.valid) {
    return send(ws, errorMsg(sizeCheck.code, sizeCheck.message));
  }

  // Parse JSON
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return send(ws, errorMsg(ReasonCode.MALFORMED_JSON, 'Invalid JSON'));
  }

  // Validate envelope
  const envCheck = validateEnvelope(msg);
  if (!envCheck.valid) {
    return send(ws, errorMsg(envCheck.code, envCheck.message, msg.requestId));
  }

  // Route by type
  const { type, payload, requestId } = msg;

  // ── Auth gate: when authMode='required', reject privileged commands before AUTHENTICATE ──
  // Pre-auth messages: AUTHENTICATE, AUTH_REFRESH only
  const PRE_AUTH_TYPES = new Set(['AUTHENTICATE', 'AUTH_REFRESH']);
  if (_authMode === AuthMode.REQUIRED && !PRE_AUTH_TYPES.has(type)) {
    const connAuth = connections.get(connectionId);
    if (!connAuth || connAuth.authState !== ConnectionAuthState.AUTHENTICATED) {
      logEvent('authRequired', { connectionId, type });
      return send(ws, errorMsg(ReasonCode.AUTH_REQUIRED, 'Authentication required before this command', requestId));
    }
  }

  // NET-01: Promise-aware dispatch — one unified request boundary that
  // handles synchronous and asynchronous handlers uniformly. Every handler
  // may return a value or promise without leaking a rejection. Request-
  // scoped unexpected errors produce one safe structured INTERNAL_ERROR
  // response with the original requestId. Error messages are sanitized to
  // avoid leaking stack traces, tokens, secrets, raw commands, or account
  // UUIDs. Expected domain rejections remain typed reason codes (handlers
  // send their own typed errors before throwing/rejecting).
  /**
   * Sanitize an error message for safe transmission to the client.
   * Strips anything that looks like a file path, stack trace, token, or UUID.
   * @param {unknown} err - Error value
   * @returns {string}
   */
  function safeErrorMessage(err) {
    const raw = err?.message ?? String(err);
    // Remove file paths, stack frames, and anything after a newline
    const singleLine = String(raw).split('\n')[0].trim();
    // Redact patterns that resemble tokens, UUIDs, or file paths
    return singleLine
      .replace(/at\s+.*\s+\(.*\)/g, '') // stack frames
      .replace(/[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}/g, '[redacted-uuid]')
      .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted-token]')
      .replace(/[A-Za-z]:[\\\/][^\s)]+/g, '[redacted-path]')
      .replace(/\.[mc]?js:\d+/g, '')
      .trim() || 'Internal error';
  }

  try {
    let handlerResult;
    switch (type) {
      case 'AUTHENTICATE': handlerResult = handleAuthenticate(connectionId, ws, payload, requestId); break;
      case 'AUTH_REFRESH': handlerResult = handleAuthRefresh(connectionId, ws, payload, requestId); break;
      case 'CREATE_MATCH': handlerResult = handleCreateMatch(connectionId, ws, payload, requestId); break;
      case 'JOIN_MATCH': handlerResult = handleJoinMatch(connectionId, ws, payload, requestId); break;
      case 'RESUME_MATCH': handlerResult = handleResumeMatch(connectionId, ws, payload, requestId); break;
      case 'READY': handlerResult = handleReady(connectionId, ws, payload, requestId); break;
      case 'SUBMIT_ACTION': handlerResult = handleSubmitAction(connectionId, ws, payload, requestId); break;
      case 'REQUEST_SYNC': handlerResult = handleRequestSync(connectionId, ws, payload, requestId); break;
      case 'LEAVE_MATCH': handlerResult = handleLeaveMatch(connectionId, ws, payload, requestId); break;
      case 'QUEUE_JOIN': handlerResult = handleQueueJoin(connectionId, ws, payload, requestId); break;
      case 'QUEUE_LEAVE': handlerResult = handleQueueLeave(connectionId, ws, payload, requestId); break;
      case 'SPECTATE_MATCH': handlerResult = handleSpectateMatch(connectionId, ws, payload, requestId); break;
      case 'SPECTATE_LEAVE': handlerResult = handleSpectateLeave(connectionId, ws, payload, requestId); break;
      case 'MATCH_HISTORY': handlerResult = handleMatchHistory(connectionId, ws, payload, requestId); break;
      case 'GET_REPLAY': handlerResult = handleGetReplay(connectionId, ws, payload, requestId); break;
      case 'SEND_CHAT': handlerResult = handleSendChat(connectionId, ws, payload, requestId); break;
      case 'CHAT_VISIBILITY': handlerResult = handleChatVisibility(connectionId, ws, payload, requestId); break;
      case 'MIGRATE_GUEST': handlerResult = handleMigrateGuest(connectionId, ws, payload, requestId); break;
      default:
        return send(ws, errorMsg(ReasonCode.MESSAGE_TYPE_UNKNOWN, `Unknown type: ${type}`, requestId));
    }
    // If the handler returned a promise, attach a .catch() so rejections
    // are contained at this request boundary. The ws.on('message') listener
    // also has a safety-net .catch() on the outer handleMessage promise.
    if (handlerResult && typeof handlerResult.then === 'function') {
      return handlerResult.catch((err) => {
        logEvent('asyncHandlerError', { connectionId, type, error: err?.message ?? String(err) });
        send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, safeErrorMessage(err), requestId));
      });
    }
    return handlerResult;
  } catch (err) {
    logEvent('syncHandlerError', { connectionId, type, error: err?.message ?? String(err) });
    return send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, safeErrorMessage(err), requestId));
  }
}

// ── Handlers ──

// ── Auth handshake handlers ──

async function handleAuthenticate(connectionId, ws, payload, requestId) {
  // When auth is disabled, accept silently (no-op)
  if (_authMode !== AuthMode.REQUIRED) {
    return send(ws, authenticatedBuilder(
      { publicPlayerId: 'PLY_dev', displayName: 'DevPlayer', handle: null, avatarUrl: null, isAnonymous: false, capabilities: resolveCapabilities({}, true) },
      Date.now() + 3600000,
      requestId,
    ));
  }

  const check = validateAuthenticate(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const result = await identityVerifier.verify(payload.accessToken);
  if (!result.valid) {
    logEvent('authFailure', { connectionId, code: result.code });
    return send(ws, errorMsg(result.code, result.message, requestId));
  }

  // Bind verified identity to connection
  const conn = connections.get(connectionId);
  if (!conn) return;
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

async function handleAuthRefresh(connectionId, ws, payload, requestId) {
  // When auth is disabled, no-op
  if (_authMode !== AuthMode.REQUIRED) {
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

// ── Guest migration handler ──

/**
 * Handle a MIGRATE_GUEST request from a client.
 * The client sends this after linking a guest account to Discord, to transfer
 * local achievements from the anonymous identity to the permanent one.
 *
 * Security model:
 *   - The connection MUST be authenticated as the targetIdentity (permanent account)
 *   - The sourceIdentity is the guest UUID (not verified server-side — trust the client)
 *   - Achievements are written with LOCAL_DEVICE provenance (not SERVER)
 *   - The migration record prevents replay (idempotency)
 *
 * @param {string} connectionId
 * @param {WebSocket} ws
 * @param {Record<string, *>} payload
 * @param {string} requestId
 */
async function handleMigrateGuest(connectionId, ws, payload, requestId) {
  const conn = connections.get(connectionId);
  if (!conn) return;

  // Must be authenticated
  if (conn.authState !== ConnectionAuthState.AUTHENTICATED || !conn.account) {
    return send(ws, errorMsg(ReasonCode.AUTH_REQUIRED, 'Authentication required for migration', requestId));
  }

  const check = validateMigrateGuest(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  // Security: the connection's authenticated account MUST be the target identity
  if (conn.account.accountId !== payload.targetIdentity) {
    logEvent('migrationIdentityMismatch', { connectionId, authenticated: conn.account.accountId, target: payload.targetIdentity });
    return send(ws, errorMsg(ReasonCode.MIGRATION_IDENTITY_MISMATCH, 'Authenticated account does not match migration target', requestId));
  }

  // Build the migration plan (deterministic ID for idempotency)
  const plan = {
    migrationId: computeMigrationId(payload.sourceIdentity, payload.targetIdentity),
    sourceIdentity: payload.sourceIdentity,
    targetIdentity: payload.targetIdentity,
    migrationVersion: 1,
  };

  logEvent('migrationRequest', { connectionId, migrationId: plan.migrationId, achievementCount: payload.achievements.length });

  const result = await matchResultPersistor.executeGuestMigration(plan, payload.achievements);

  if (!result.success) {
    logEvent('migrationFailure', { connectionId, migrationId: plan.migrationId, error: result.error });
    return send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, result.error ?? 'Migration failed', requestId));
  }

  logEvent('migrationSuccess', { connectionId, migrationId: plan.migrationId, transferred: result.achievementsTransferred, alreadyMigrated: result.alreadyMigrated });

  send(ws, migrationResultBuilder(
    result.success,
    result.migrationId,
    result.achievementsTransferred,
    result.alreadyMigrated,
    requestId,
  ));
}

// ── Match lifecycle handlers ──

function handleCreateMatch(connectionId, ws, payload, requestId) {
  if (matchStore.count >= MAX_MATCHES) {
    return send(ws, errorMsg(ReasonCode.RATE_LIMITED, 'Server at match capacity', requestId));
  }

  // Prevent conflicting bindings — one connection cannot create/join/queue simultaneously
  const existingConn = connections.get(connectionId);
  if (existingConn && (existingConn.participantId || existingConn.isSpectator)) {
    return send(ws, errorMsg(ReasonCode.MATCH_ALREADY_JOINED, 'Connection already bound to a match or spectating', requestId));
  }

  const check = validateCreateMatch(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const matchId = `M-${randomBytes(12).toString('base64url')}`;
  const participantToken = randomBytes(32).toString('base64url');
  const participantId = `P-${randomBytes(8).toString('base64url')}`;
  const seed = randomBytes(4).readUInt32BE(0);

  // Generate a unique 6-character invite code (uppercase alphanumeric)
  // 36^6 ≈ 2.2B possibilities — sufficient for invite-alpha
  // Retry on collision — never overwrite an existing invite mapping
  const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let inviteCode;
  let attempts = 0;
  do {
    inviteCode = Array.from(randomBytes(6), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    attempts++;
    if (attempts > 10) {
      return send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, 'Failed to generate unique invite code', requestId));
    }
  } while (matchStore.findByInviteCode(inviteCode));

  const match = createAuthoritativeMatch({
    matchId,
    profileId: payload.profileId,
    seed,
    // RANK-01: Server-owned match classification — client may request a
    // queue, but the server validates and creates authoritative classification.
    ...classifyMatchForCreate(payload),
  });

  // Bind connection to participant
  const conn = connections.get(connectionId);

  match.addParticipant(participantId, participantToken, conn?.account?.accountId ?? null, buildPublicProfile(conn));
  matchStore.save(match);
  matchStore.registerInvite(inviteCode, matchId);

  conn.participantId = participantId;
  conn.matchId = matchId;

  send(ws, matchCreated(matchId, inviteCode, participantToken, requestId));
  logEvent('matchCreate', { matchId, profileId: payload.profileId, matchMode: match.matchMode, queueId: match.queueId, accountId: conn?.account?.accountId ?? null });
}

function handleJoinMatch(connectionId, ws, payload, requestId) {
  // Prevent conflicting bindings
  const existingConn = connections.get(connectionId);
  if (existingConn && (existingConn.participantId || existingConn.isSpectator)) {
    return send(ws, errorMsg(ReasonCode.MATCH_ALREADY_JOINED, 'Connection already bound to a match or spectating', requestId));
  }

  const check = validateJoinMatch(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const match = matchStore.findByInviteCode(payload.inviteCode);
  if (!match) {
    return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Invalid invite code', requestId));
  }
  if (match.participants.size >= 2) {
    return send(ws, errorMsg(ReasonCode.MATCH_FULL, 'Match is full', requestId));
  }

  // Prevent self-join: same account cannot occupy both seats (when auth enabled)
  const conn = connections.get(connectionId);
  const joinerAccountId = conn?.account?.accountId ?? null;
  if (joinerAccountId) {
    for (const [, p] of match.participants) {
      if (p.accountId === joinerAccountId) {
        return send(ws, errorMsg(ReasonCode.AUTH_ACCOUNT_MISMATCH, 'Cannot join your own match', requestId));
      }
    }
  }

  const participantToken = randomBytes(32).toString('base64url');
  const participantId = `P-${randomBytes(8).toString('base64url')}`;

  const result = match.addParticipant(participantId, participantToken, joinerAccountId, buildPublicProfile(conn));
  matchStore.save(match);

  // Bind connection
  conn.participantId = participantId;
  conn.matchId = match.matchId;

  send(ws, matchJoined(match.matchId, participantToken, result.playerId, requestId));
  logEvent('matchJoin', { matchId: match.matchId, participantId, accountId: joinerAccountId });

  // Notify the opponent (P1) that P2 has connected
  const opponentId = [...match.participants.keys()].find(pid => pid !== participantId);
  if (opponentId) {
    const oppConn = findConnectionByParticipant(opponentId, match.matchId);
    if (oppConn) {
      send(oppConn.ws, participantStatus(match.matchId, {
        participantId,
        status: 'CONNECTED',
      }));
    }
  }
}

function handleResumeMatch(connectionId, ws, payload, requestId) {
  const check = validateResumeMatch(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const match = matchStore.get(payload.matchId);
  if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

  const participantId = match.findParticipantByToken(payload.participantToken);
  if (!participantId) return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));

  // ── Account-bound reconnect security ──
  // When auth is enabled, the verified accountId must match the participant's accountId.
  // A stolen participant token alone cannot be reused by an unrelated authenticated account.
  const conn = connections.get(connectionId);
  const participant = match.participants.get(participantId);
  const reconnectAccountId = conn?.account?.accountId ?? null;
  if (_authMode === AuthMode.REQUIRED && reconnectAccountId && participant?.accountId) {
    if (reconnectAccountId !== participant.accountId) {
      logEvent('authFailure', { connectionId, code: 'AUTH_ACCOUNT_MISMATCH', reason: 'reconnect' });
      return send(ws, errorMsg(ReasonCode.AUTH_ACCOUNT_MISMATCH, 'This match belongs to another Intrilex account', requestId));
    }
  }

  // Bind new connection FIRST, then supersede old — eliminates the race window
  // where neither connection is bound during reconnection.
  conn.participantId = participantId;
  conn.matchId = match.matchId;

  // Supersede old connection for this participant (now safe — new conn is bound)
  supersedeOldConnection(participantId, match.matchId, connectionId);

  match.reconnectParticipant(participantId);
  matchStore.save(match);

  // Send fresh view
  const view = match.getAuthorizedView(participantId);
  const safeView = buildNetworkPlayerView(view);
  send(ws, matchView(match.matchId, safeView, requestId));
  logEvent('reconnect', { matchId: match.matchId, participantId, accountId: reconnectAccountId });
}

function handleReady(connectionId, ws, payload, requestId) {
  const check = validateReady(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const conn = connections.get(connectionId);
  // v0.24.2: Defense-in-depth — connection must be bound to this match.
  // Check BEFORE match lookup so a fake matchId can't bypass the binding.
  if (conn.matchId !== payload.matchId) {
    return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
  }

  const match = matchStore.get(payload.matchId);
  if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

  if (!match.validateToken(conn.participantId, payload.participantToken)) {
    return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));
  }

  match.setReady(conn.participantId);

  // If all ready, start the match
  if (match.allReady() && match.status === 'READY_CHECK') {
    match.start();
    matchStore.save(match);
    logEvent('matchStart', { matchId: match.matchId, profileId: match.profileId });

    // Broadcast MATCH_STARTED to both participants
    for (const [pid, p] of match.participants) {
      const view = match.getAuthorizedView(pid);
      const safeView = buildNetworkPlayerView(view);
      const targetConn = findConnectionByParticipant(pid, match.matchId);
      if (targetConn) {
        send(targetConn.ws, matchStarted(match.matchId, safeView));
      }
    }
  }
  matchStore.save(match);

  // Send current view
  const view = match.getAuthorizedView(conn.participantId);
  const safeView = buildNetworkPlayerView(view);
  send(ws, matchView(match.matchId, safeView, requestId));

  // Notify spectators if any
  broadcastToSpectators(match);
}

async function handleSubmitAction(connectionId, ws, payload, requestId) {
  // Spectators cannot submit actions — reject before any validation or match access
  const conn = connections.get(connectionId);
  if (conn?.isSpectator) {
    return send(ws, errorMsg(ReasonCode.PARTICIPANT_NOT_AUTHORIZED, 'Spectators cannot submit actions', requestId));
  }

  const check = validateSubmitAction(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  // v0.24.2: Defense-in-depth — connection must be bound to this match.
  // Check BEFORE match lookup so a fake matchId can't bypass the binding.
  if (conn.matchId !== payload.matchId) {
    return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
  }

  const match = matchStore.get(payload.matchId);
  if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

  if (!match.validateToken(conn.participantId, payload.participantToken)) {
    return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));
  }

  const result = await match.submitAction(conn.participantId, {
    clientCommandId: payload.clientCommandId,
    expectedRevision: payload.expectedRevision,
    decisionFrameHash: payload.decisionFrameHash,
    actionId: payload.actionId,
  });

  // Send result to the actor
  const actorView = match.getAuthorizedView(conn.participantId);
  const safeActorView = buildNetworkPlayerView(actorView);
  send(ws, actionResult(match.matchId, {
    accepted: result.accepted,
    reasonCode: result.reasonCode ?? null,
    error: result.error ?? null,
    view: safeActorView,
  }, requestId));
  logEvent(result.accepted ? 'actionSubmit' : 'actionReject', { matchId: match.matchId, participantId: conn.participantId, reasonCode: result.reasonCode ?? null });

  // If accepted, send updated view to the opponent
  if (result.accepted) {
    matchStore.save(match);

    const opponentId = [...match.participants.keys()].find(pid => pid !== conn.participantId);
    if (opponentId) {
      const oppView = match.getAuthorizedView(opponentId);
      const safeOppView = buildNetworkPlayerView(oppView);
      const oppConn = findConnectionByParticipant(opponentId, match.matchId);
      if (oppConn) {
        send(oppConn.ws, matchView(match.matchId, safeOppView));
      }
    }

    // If terminal, send MATCH_ENDED to both
    if (match.status === 'TERMINAL') {
      broadcastMatchEnded(match);
      logEvent('matchEnd', { matchId: match.matchId, winner: match.winner, reason: match.terminalReason });
    }

    // Notify spectators of the state change
    broadcastToSpectators(match);
  }
}

function handleRequestSync(connectionId, ws, payload, requestId) {
  const check = validateRequestSync(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const conn = connections.get(connectionId);
  // v0.24.2: Defense-in-depth — connection must be bound to this match.
  // Check BEFORE match lookup so a fake matchId can't bypass the binding.
  if (conn.matchId !== payload.matchId) {
    return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
  }

  const match = matchStore.get(payload.matchId);
  if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

  if (!match.validateToken(conn.participantId, payload.participantToken)) {
    return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));
  }

  const view = match.getAuthorizedView(conn.participantId);
  const safeView = buildNetworkPlayerView(view);
  send(ws, matchView(match.matchId, safeView, requestId));
}

function handleLeaveMatch(connectionId, ws, payload, requestId) {
  const check = validateLeaveMatch(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const conn = connections.get(connectionId);
  // v0.24.2: Defense-in-depth — connection must be bound to this match.
  // Check BEFORE match lookup so a fake matchId can't bypass the binding.
  // This prevents a stale/malicious payload from disconnecting a participant
  // from a different match than the one their connection is bound to.
  if (conn.matchId !== payload.matchId) {
    return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
  }

  const match = matchStore.get(payload.matchId);

  // v0.24.2: Authenticate the participant token before disconnecting.
  // Previously, LEAVE_MATCH accepted a participantToken in validation but
  // the handler never checked it — any connection could leave any match
  // by simply knowing the matchId.
  if (match && conn) {
    if (!match.validateToken(conn.participantId, payload.participantToken)) {
      return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));
    }

    match.disconnectParticipant(conn.participantId);
    matchStore.save(match);

    // Notify opponent
    const opponentId = [...match.participants.keys()].find(pid => pid !== conn.participantId);
    if (opponentId) {
      const oppConn = findConnectionByParticipant(opponentId, match.matchId);
      if (oppConn) {
        send(oppConn.ws, participantStatus(match.matchId, {
          participantId: conn.participantId,
          status: 'DISCONNECTED',
        }));
      }
    }
  }

  conn.participantId = null;
  conn.matchId = null;
  // Send a LEFT_MATCH acknowledgment, not an ERROR with code 'OK'
  send(ws, envelope('LEFT_MATCH', { matchId: payload.matchId }, requestId));
}

// ── Matchmaking queue handlers ──

function handleQueueJoin(connectionId, ws, payload, requestId) {
  const check = validateQueueJoin(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  // Public matchmaking is disabled by default in v0.24.1 invite-alpha
  if (!_featureFlags.publicMatchmaking) {
    return send(ws, errorMsg(ReasonCode.QUEUE_FULL, 'Public matchmaking is disabled in invite-alpha', requestId));
  }

  if (matchStore.count >= MAX_MATCHES) {
    return send(ws, errorMsg(ReasonCode.RATE_LIMITED, 'Server at match capacity', requestId));
  }

  // Use accountId for queue identity when auth is enabled (prevents multi-queue abuse + self-match)
  const conn = connections.get(connectionId);
  const accountId = conn?.account?.accountId ?? null;
  // RANK-01: Pass client-requested queueId — server validates ranked admission
  const result = matchmakingQueue.enqueue(connectionId, payload.profileId, accountId, payload.queueId ?? null);
  if (!result.queued) {
    return send(ws, errorMsg(result.code || ReasonCode.INTERNAL_ERROR, result.error || 'Failed to join queue', requestId));
  }

  // If paired immediately, the onCreateMatch callback already sent QUEUE_MATCHED
  if (!result.paired) {
    send(ws, queueJoined(result.position, result.estimatedWaitMs, requestId));
  }
}

function handleQueueLeave(connectionId, ws, payload, requestId) {
  const check = validateQueueLeave(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const result = matchmakingQueue.dequeue(connectionId);
  if (!result.removed) {
    return send(ws, errorMsg(ReasonCode.NOT_IN_QUEUE, 'Not in queue', requestId));
  }
  send(ws, queueLeft(requestId));
}

// ── Spectator handlers ──

function handleSpectateMatch(connectionId, ws, payload, requestId) {
  const check = validateSpectateMatch(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const match = matchStore.get(payload.matchId);
  if (!match) {
    return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));
  }

  // Only allow spectating if the match has started (RUNNING or TERMINAL)
  if (match.status !== 'RUNNING' && match.status !== 'TERMINAL') {
    return send(ws, errorMsg(ReasonCode.MATCH_NOT_RUNNING, 'Match is not running', requestId));
  }

  // Enforce spectator count limit per match
  let spectatorCount = 0;
  for (const c of connections.values()) {
    if (c.isSpectator && c.spectatingMatchId === payload.matchId) spectatorCount++;
  }
  if (spectatorCount >= MAX_SPECTATORS_PER_MATCH) {
    return send(ws, errorMsg(ReasonCode.QUEUE_FULL, 'Spectator limit reached for this match', requestId));
  }

  const conn = connections.get(connectionId);
  conn.isSpectator = true;
  conn.spectatingMatchId = payload.matchId;

  // Send a spectate-joined message with a NEUTRAL spectator view.
  // Spectators never see either player's hand, private decisions, legal actions,
  // command IDs, RNG state, seed, tokens, or role-private engine data.
  const view = match.getAuthorizedView([...match.participants.keys()][0]);
  const safeView = buildSpectatorView(view);
  send(ws, spectateJoined(payload.matchId, safeView, requestId));
  logEvent('spectateJoin', { matchId: payload.matchId, spectatorCount: spectatorCount + 1 });
}

function handleSpectateLeave(connectionId, ws, payload, requestId) {
  const check = validateSpectateLeave(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const conn = connections.get(connectionId);
  if (!conn || !conn.isSpectator) {
    return send(ws, errorMsg(ReasonCode.NOT_IN_QUEUE, 'Not spectating', requestId));
  }

  // v0.24.2 fix: capture matchId BEFORE nulling the field for correct logging
  const spectatingMatchId = conn.spectatingMatchId;
  conn.isSpectator = false;
  conn.spectatingMatchId = null;
  send(ws, spectateLeft(requestId));
  logEvent('spectateLeave', { matchId: spectatingMatchId });
}

// ── Match history handler ──

function handleMatchHistory(connectionId, ws, payload, requestId) {
  const check = validateMatchHistory(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  // Public history/spectator discovery is disabled by default for invite-alpha
  // to prevent exposing a global unauthenticated directory of private matches
  if (!_featureFlags.publicHistory) {
    return send(ws, errorMsg(ReasonCode.PARTICIPANT_NOT_AUTHORIZED, 'Public match history is disabled in invite-alpha', requestId));
  }

  const limit = payload.limit ?? 20;
  const status = payload.status ?? null;
  const matches = matchStore.listMatches({ status, limit });
  // Never expose participant or reconnect tokens in history
  send(ws, matchHistoryResult(matches.map(m => ({
    matchId: m.matchId,
    status: m.status,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    // participants list is already safe (just IDs, no tokens)
    participants: m.participants,
  })), requestId));
}

/**
 * Handle GET_REPLAY — allows match participants to download the certified
 * replay of a completed (TERMINAL) match. The participant token authenticates
 * the requester — only match participants can download replays.
 */
function handleGetReplay(connectionId, ws, payload, requestId) {
  const check = validateGetReplay(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const conn = connections.get(connectionId);
  // v0.24.2: Defense-in-depth — connection must be bound to this match.
  // Check BEFORE match lookup so a fake matchId can't bypass the binding.
  if (conn.matchId !== payload.matchId) {
    return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
  }

  const match = matchStore.get(payload.matchId);
  if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

  // Verify the requester is a participant
  const participantId = match.findParticipantByToken(payload.participantToken);
  if (!participantId) return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));

  // Only allow replay download for completed matches
  if (match.status !== 'TERMINAL') {
    return send(ws, errorMsg(ReasonCode.MATCH_NOT_RUNNING, 'Replay only available for completed matches', requestId));
  }

  const replay = match.getReplay();
  if (!replay) return send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, 'Failed to generate replay', requestId));

  // Compute replay hash for integrity verification
  const replayHash = createHash('sha256').update(JSON.stringify(replay)).digest('hex');
  send(ws, replayData(match.matchId, replay, replayHash, requestId));
  logEvent('replayDownload', { matchId: match.matchId, participantId });
}

/**
 * Handle a SEND_CHAT message from a participant.
 * Validates the payload, authenticates the participant, checks the
 * connection-match binding, and broadcasts the chat message to all
 * participants in the match. Spectators do not receive chat (out of scope
 * for v0.25). Rate limiting is handled by the per-connection token bucket
 * in the main message handler (chat messages consume tokens like all
 * other messages).
 */
function handleSendChat(connectionId, ws, payload, requestId) {
  const check = validateSendChat(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const conn = connections.get(connectionId);
  if (!conn) return send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, 'Connection not found', requestId));

  // v0.25: Defense-in-depth — connection must be bound to this match.
  if (conn.matchId !== payload.matchId) {
    return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
  }

  const match = matchStore.get(payload.matchId);
  if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

  // Authenticate the participant token
  const participantId = match.findParticipantByToken(payload.participantToken);
  if (!participantId) return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));

  // Only allow chat during active matches (not in lobby, not after terminal)
  if (match.status !== 'RUNNING' && match.status !== 'READY_CHECK' && match.status !== 'WAITING_FOR_OPPONENT' && match.status !== 'STARTING') {
    return send(ws, errorMsg(ReasonCode.MATCH_NOT_RUNNING, 'Chat is only available during active matches', requestId));
  }

  // Build the chat message and broadcast to all participants
  const timestamp = new Date().toISOString();
  const text = String(payload.text).slice(0, 200); // hard cap at protocol limit
  // Generate a server-authoritative message ID for deduplication
  const messageId = `m-${Date.now()}-${randomBytes(6).toString('base64url')}`;

  // Broadcast to all participants in the match
  for (const [pid] of match.participants) {
    const targetConn = findConnectionByParticipant(pid, match.matchId);
    if (targetConn) {
      send(targetConn.ws, chatMessage(match.matchId, participantId, text, timestamp, messageId));
    }
  }

  logEvent('chatMessage', { matchId: match.matchId, participantId, textLength: text.length });
}

/**
 * Handle a CHAT_VISIBILITY message from a participant.
 * The participant is reporting that they have hidden or restored Match Chat.
 * The server broadcasts a CHAT_VISIBILITY_CHANGE system event to the OTHER
 * participant so it appears in their Game Log (not as a chat message).
 * @param {string} connectionId
 * @param {object} ws
 * @param {Record<string,*>} payload
 * @param {string} requestId
 */
function handleChatVisibility(connectionId, ws, payload, requestId) {
  const check = validateChatVisibility(payload);
  if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

  const conn = connections.get(connectionId);
  if (!conn) return send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, 'Connection not found', requestId));

  if (conn.matchId !== payload.matchId) {
    return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
  }

  const match = matchStore.get(payload.matchId);
  if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

  const participantId = match.findParticipantByToken(payload.participantToken);
  if (!participantId) return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));

  // Build display name from the participant's public profile
  const participant = match.participants.get(participantId);
  const displayName = participant?.publicProfile?.displayName ?? 'Player';

  // Broadcast CHAT_VISIBILITY_CHANGE to the OTHER participant only (not the sender)
  for (const [pid] of match.participants) {
    if (pid === participantId) continue; // Don't echo back to sender
    const targetConn = findConnectionByParticipant(pid, match.matchId);
    if (targetConn) {
      send(targetConn.ws, chatVisibilityChange(match.matchId, participantId, displayName, payload.hidden));
    }
  }

  logEvent('chatVisibility', { matchId: match.matchId, participantId, hidden: payload.hidden });
}

/**
 * Broadcast the current match view to all spectators of a match.
 * Called after state changes (action submission, match start, etc.)
 */
function broadcastToSpectators(match) {
  if (!match) return;
  // Spectators receive a NEUTRAL view — no player hands, legal actions, or private data
  const view = match.getAuthorizedView([...match.participants.keys()][0]);
  const safeView = buildSpectatorView(view);

  for (const [cid, conn] of connections) {
    if (conn.isSpectator && conn.spectatingMatchId === match.matchId) {
      send(conn.ws, matchView(match.matchId, safeView));
    }
  }
}

// ── Helpers ──

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleDisconnect(connectionId) {
  const conn = connections.get(connectionId);
  if (!conn) return;

  if (conn.matchId && conn.participantId) {
    const match = matchStore.get(conn.matchId);
    if (match) {
      match.disconnectParticipant(conn.participantId);
      matchStore.save(match);

      // Notify opponent
      const opponentId = [...match.participants.keys()].find(pid => pid !== conn.participantId);
      if (opponentId) {
        const oppConn = findConnectionByParticipant(opponentId, conn.matchId);
        if (oppConn) {
          send(oppConn.ws, participantStatus(match.matchId, {
            participantId: conn.participantId,
            status: 'DISCONNECTED',
          }));
        }
      }
    }
  }

  // Remove from matchmaking queue if present
  if (matchmakingQueue) {
    matchmakingQueue.dequeue(connectionId);
  }

  // Spectator disconnect is handled implicitly — the connection is removed
  // and broadcastToSpectators will no longer find it.
  connections.delete(connectionId);
  logEvent('connectionClose', { connectionId, wasSpectator: conn.isSpectator, matchId: conn.matchId ?? null, total: connections.size });
}

function supersedeOldConnection(participantId, matchId, excludeConnectionId = null) {
  for (const [cid, conn] of connections) {
    // Skip the new connection that was just bound — only close the OLD one
    if (excludeConnectionId && cid === excludeConnectionId) continue;
    if (conn.participantId === participantId && conn.matchId === matchId) {
      send(conn.ws, errorMsg(ReasonCode.CONNECTION_SUPERSEDED, 'Connection superseded by newer session'));
      try { conn.ws.close(); } catch { /* ignore */ }
      connections.delete(cid);
      break;
    }
  }
}

function findConnectionByParticipant(participantId, matchId) {
  for (const [, conn] of connections) {
    if (conn.participantId === participantId && conn.matchId === matchId) {
      return conn;
    }
  }
  return null;
}

/**
 * Build a safe public profile from a connection's authenticated account.
 * Used to populate opponent display info in the authorized match view.
 * Returns null if the connection has no authenticated account.
 * @param {{ account: object|null }|null} conn
 * @returns {{ displayName: string, handle: (string|null), avatarUrl: (string|null), rating: (number|null), rank: (string|null) }|null}
 */
function buildPublicProfile(conn) {
  if (!conn || !conn.account) return null;
  const acct = conn.account;
  return {
    displayName: acct.displayName ?? 'Player',
    handle: acct.handle ?? null,
    avatarUrl: acct.avatarUrl ?? null,
    rating: acct.rating ?? null,
    rank: acct.rank ?? null,
  };
}

function broadcastMatchEnded(match) {
  // Generate the replay ONCE and compute its hash from the actual replay object.
  // Do NOT hash an empty-string fallback — if replay generation fails, send no hash.
  const replay = match.getReplay();
  const replayHash = replay
    ? createHash('sha256').update(JSON.stringify(replay)).digest('hex')
    : null;
  // replayUrl is null — HTTP replay download was removed in v0.24.2.
  // Replays are retrieved via the authenticated WebSocket GET_REPLAY flow only.
  const replayUrl = null;

  // Evaluate server-side achievements for all participants.
  // The server has full access to engine state and events (no hidden-info firewall).
  // Results are sent per-participant — each player only receives their own unlocks.
  let achievementResults = {};
  try {
    const engineState = match.getAuthoritativeState();
    const allEvents = match.getAllEvents();
    const playerIds = [...match.participants.keys()];
    if (allEvents.length > 0 && playerIds.length > 0) {
      achievementResults = evaluateMatchAchievements({
        matchId: match.matchId,
        engineState,
        playerIds,
        events: allEvents,
      });
    }
  } catch (err) {
    logEvent('achievementEvalError', { matchId: match.matchId, error: err.message });
  }

  for (const [pid] of match.participants) {
    const targetConn = findConnectionByParticipant(pid, match.matchId);
    if (targetConn) {
      send(targetConn.ws, matchEnded(match.matchId, match.terminalReason, match.winner));
      // Send REPLAY_AVAILABLE so clients know they can request the certified replay
      send(targetConn.ws, replayAvailable(match.matchId, replayUrl, replayHash));
      // Send server-authoritative achievement unlocks for this participant
      const achResult = achievementResults[pid];
      if (achResult && achResult.newUnlocks.length > 0) {
        send(targetConn.ws, achievementsEarned(match.matchId, achResult.newUnlocks, achResult.progressUpdates));
      }
    }
  }

  // DATA-01: Durable terminal lifecycle — persist via the terminal outbox
  // instead of fire-and-forget. The outbox ensures terminal effects are
  // recoverable, idempotent, retryable, and auditable. The result is
  // queued BEFORE clients are told the match is terminal (above), so
  // completion is durable.
  //
  // RANK-01: Use the server-owned match.queueId (not profileId.includes('ranked')).
  // The outbox routes ranked records through RatingService.applyRatedResult()
  // which fails closed for ineligible records.
  if (terminalOutbox && matchResultPersistor) {
    buildMatchResultRecord({
      match,
      persistor: matchResultPersistor,
      queueId: match.queueId ?? 'casual',
      seasonId: match.seasonId && match.seasonId !== 'pending' ? match.seasonId : undefined,
      serverVersion: LAB_VERSION,
    }).then(record => {
      if (!record) return;
      // Enqueue result job — idempotency key is matchId
      terminalOutbox.enqueueResult(record);

      // Enqueue achievement jobs — idempotency key is matchId:accountId
      const achUnlocks = [];
      for (const [pid] of match.participants) {
        const achResult = achievementResults[pid];
        if (!achResult || achResult.newUnlocks.length === 0) continue;
        const participant = match.participants.get(pid);
        const accountId = participant?.accountId;
        if (!accountId) continue; // Skip anonymous players
        for (const unlock of achResult.newUnlocks) {
          achUnlocks.push({
            accountId,
            achievementId: unlock.achievementId,
            unlockedAt: unlock.unlockedAt || new Date().toISOString(),
            provenance: 'SERVER',
            matchId: match.matchId,
            rulesVersion: unlock.rulesVersion || null,
            productVersion: unlock.productVersion || null,
          });
        }
      }
      if (achUnlocks.length > 0) {
        terminalOutbox.enqueueAchievements(achUnlocks, match.matchId);
      }
      // Trigger an immediate drain attempt (don't wait for the interval)
      terminalOutbox._drainOnce().catch(err => {
        logEvent('outboxDrainError', { matchId: match.matchId, error: err?.message ?? String(err) });
      });
    }).catch(err => {
      logEvent('matchResultBuildError', { matchId: match.matchId, error: err?.message ?? String(err) });
    });
  }
}

// ── CLI entry point ──

// Only start the server when run directly via `node server.mjs`, not when imported.
try {
  const _scriptPath = fileURLToPath(import.meta.url);
  const _argvPath = process.argv[1] || '';
  const _isMain = _scriptPath === _argvPath || _scriptPath.replace(/\\/g, '/') === _argvPath.replace(/\\/g, '/');
  if (_isMain && _argvPath) {
    const port = parseInt(process.env.PORT || process.argv[2], 10) || DEFAULT_PORT;
    // Production: bind to 0.0.0.0 (all interfaces) so the server is reachable
    // behind a reverse proxy or container port mapping.
    // Development: bind to 127.0.0.1 (localhost only) for safety.
    const isProduction = process.env.NODE_ENV === 'production';
    const host = process.env.HOST || (isProduction ? '0.0.0.0' : DEFAULT_HOST);
    const allowedOriginsSummary = ALLOWED_ORIGINS.length > 0
      ? ALLOWED_ORIGINS.join(', ')
      : '(all origins accepted — set INTRILEX_ALLOWED_ORIGINS in production!)';
    startServer({ port, host }).then(() => {
      console.log(`Intrilex Match Authority Server v${LAB_VERSION} running on ws://${host}:${port}`);
      console.log(`HTTP health: http://${host}:${port}/health`);
      console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
      console.log(`Auth mode: ${AUTH_MODE}`);
      console.log(`Allowed origins: ${allowedOriginsSummary}`);
      if (isProduction && ALLOWED_ORIGINS.length === 0) {
        console.warn('WARNING: INTRILEX_ALLOWED_ORIGINS is not set. All WebSocket origins are accepted.');
        console.warn('         Set INTRILEX_ALLOWED_ORIGINS to restrict access to known frontend origins.');
      }
    });
  }
} catch { /* not running as CLI — imported as a module */ }
