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
import { createAuthHandlers, checkAuthAttemptRate } from './handlers/auth-handlers.mjs';
import { createSpectatorHandlers } from './handlers/spectator-handlers.mjs';
import { createMatchmakingHandlers } from './handlers/matchmaking-handlers.mjs';
import { createMatchHandlers } from './handlers/match-handlers.mjs';
import { createTournamentHandlers } from './handlers/tournament-handlers.mjs';
import { createReportHandlers } from './handlers/report-handlers.mjs';
import { InMemoryTournamentRepository, SupabaseTournamentRepository } from './persistence/tournament-repository.mjs';
import { startHealthMonitor } from './monitoring/health-monitor.mjs';

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
// IRX-H10: Pending forfeit timeouts — when a participant disconnects during
// a RUNNING match, a timeout is scheduled. If they don't reconnect within
// RECONNECT_GRACE, the match is terminalized as a forfeit.
const pendingForfeits = new Map(); // matchId → { timer, forfeitingParticipantId }
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

// Auth-attempt rate limiting: per-IP sliding window.
// Prevents DoS via Supabase API exhaustion — an attacker flooding AUTHENTICATE
// requests could trigger Supabase rate limits that lock out all legitimate users.
// Tracked per-IP (not per-connection) because the attack vector is opening many
// connections from one IP. Each failed or successful auth attempt counts.
const AUTH_ATTEMPT_WINDOW_MS = 60000; // 1 min sliding window
const AUTH_ATTEMPT_MAX = 10; // max 10 auth attempts per IP per window
const AUTH_ATTEMPT_BAN_MS = 300000; // 5 min ban on threshold breach
// Configurable for testing (overridden by startServer opts)
let _authAttemptMax = AUTH_ATTEMPT_MAX;
let _authAttemptWindowMs = AUTH_ATTEMPT_WINDOW_MS;
let _authAttemptBanMs = AUTH_ATTEMPT_BAN_MS;

// ── Server state ──

let matchStore = null;
let matchmakingQueue = null;
let identityVerifier = null; // IdentityVerifier instance (set by startServer)
let matchResultPersistor = null; // MatchResultPersistor instance (set by startServer)
let ratingService = null; // RatingService instance (set by startServer) — RANK-01/3C
let terminalOutbox = null; // TerminalOutbox instance (set by startServer) — DATA-01
let blockChecker = null; // IRX-H19: Block-check function (accountIdA, accountIdB) → Promise<boolean>
// IRX-H19: Block enforcement uses BLOCKED_BY_PLAYER reason code in handler modules
// (match-handlers.mjs for join/create, matchmaking-handlers.mjs for queue).
// handleJoinMatch calls blockChecker(joinerAccountId, p.accountId) in match-handlers.mjs.
// handleQueueJoin calls blockChecker(accountId, partnerAccountId) in matchmaking-handlers.mjs.
let _authMode = AUTH_MODE; // Active auth mode (can be overridden by startServer opts)
let _isProductionMode = false; // True when authMode=required (DATA-04: fail-closed persistence)
const connections = new Map(); // connectionId → { ws, authState, account, participantId, matchId, lastHeartbeat, isSpectator, spectatingMatchId, rateLimit, ip }
const bannedIps = new Map(); // ip → banExpiresAt
const ipConnectionCounts = new Map(); // ip → active connection count
const _httpRateLimit = new Map(); // ip → { count, windowStart } — v0.24.2 HTTP rate limiter
const _authAttempts = new Map(); // ip → number[] (timestamps of recent auth attempts)
// Extracted handler modules — set by startServer() via create*Handlers()
let _authHandlers = null;
let _spectatorHandlers = null;
let _matchmakingHandlers = null;
let _matchHandlers = null;
let _tournamentHandlers = null;
let _tournamentRepository = null; // TournamentRepository (InMemory or Supabase)
let _reportHandlers = null;

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
 * Emit a structured JSON log entry to stderr.
 *
 * stderr is used (not stdout) because:
 *   - stdout is reserved for the CLI startup banner and health-endpoint output,
 *     so structured logs on stderr avoid interleaving with human-readable output
 *   - log aggregators and process managers (systemd, Docker) capture stderr
 *     separately, allowing log-level filtering without affecting stdout pipes
 *   - JSON Lines on stderr is a common convention for server-side structured logging
 *
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
 * IRX-M02: Sanitized health metrics for public endpoints.
 * Removes internal event counter names, persistor type, and banned IP count
 * that could reveal implementation details to attackers.
 */
function getPublicHealthMetrics() {
  const memUsage = process.memoryUsage();
  return {
    uptime: Date.now() - _startTime,
    activeMatches: matchStore?.count ?? 0,
    activeConnections: connections.size,
    queueSize: matchmakingQueue?.size ?? 0,
    memory: {
      rssMB: Math.round(memUsage.rss / 1048576),
      heapUsedMB: Math.round(memUsage.heapUsed / 1048576),
      heapTotalMB: Math.round(memUsage.heapTotal / 1048576),
    },
    totalEvents: Object.values(_eventCounters).reduce((sum, val) => sum + val, 0),
    auth: {
      mode: _authMode,
      verifierConfigured: identityVerifier !== null,
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
 * @param {function} [opts.blockChecker] - IRX-H19: async (accountIdA, accountIdB) → boolean, checks if either player blocked the other
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
  // Auth-attempt rate limiting overrides for testing
  _authAttemptMax = opts.authAttemptMax ?? AUTH_ATTEMPT_MAX;
  _authAttemptWindowMs = opts.authAttemptWindowMs ?? AUTH_ATTEMPT_WINDOW_MS;
  _authAttemptBanMs = opts.authAttemptBanMs ?? AUTH_ATTEMPT_BAN_MS;

  // IRX-H19: Block checker — async function (accountIdA, accountIdB) → boolean
  // When provided, the server checks if either player has blocked the other
  // before allowing match join or matchmaking pairing. When not provided,
  // block enforcement is disabled (dev mode only — production should always
  // provide a blockChecker).
  blockChecker = opts.blockChecker ?? null;
  if (_authMode === AuthMode.REQUIRED && !blockChecker && LOG_ENABLED) {
    process.stderr.write(
      '\n⚠  WARNING: No blockChecker configured — blocked players can join matches.\n' +
      '   Provide opts.blockChecker in production to enforce player blocks.\n\n'
    );
  }

  // Initialize match store
  if (persistent) {
    const dbPath = opts.dbPath ?? DEFAULT_DB_PATH;
    // Ensure directory exists for file-based DB
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      try { mkdirSync(dir, { recursive: true }); } catch (err) { if (err.code !== 'EEXIST') logEvent('mkdirError', { path: dir, error: err.message }); }
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

  // T3: node:sqlite startup probe — verify the experimental API is functional.
  // node:sqlite is experimental in Node 22; a version drift or missing flag
  // could silently break restart recovery. This probe fails loudly at startup
  // in production rather than corrupting match state later.
  // Only probe SqliteMatchStore instances — InMemoryMatchStore is used in tests/dev.
  // Skip when allowFakePersistor is set (explicit test/dev mode).
  if (persistent && matchStore && matchStore.constructor?.name === 'SqliteMatchStore' && !opts.allowFakePersistor) {
    try {
      const requiredMethods = ['get', 'save', 'delete'];
      for (const m of requiredMethods) {
        if (typeof matchStore[m] !== 'function') {
          throw new Error(`SqliteMatchStore missing required method: ${m}`);
        }
      }
      logEvent('sqliteStartupProbeOk', { storeType: matchStore.constructor.name });
    } catch (probeErr) {
      logEvent('sqliteStartupProbeFailed', { error: probeErr?.message });
      if (_isProductionMode) {
        throw new Error(`SQLite startup probe failed: ${probeErr?.message}. ` +
          'The node:sqlite experimental API may be unavailable on this Node version. ' +
          'Consider pinning Node 22+ or using --experimental-sqlite flag.');
      }
      console.warn('⚠  SQLite startup probe failed, falling back to InMemoryMatchStore:', probeErr?.message);
      matchStore = new InMemoryMatchStore();
    }
  }

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
    try { mkdirSync(outboxDir, { recursive: true }); } catch (err) { if (err.code !== 'EEXIST') logEvent('mkdirError', { path: outboxDir, error: err.message }); }
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
        version: '0.28.0',
        protocolVersion: 2,
        ...getPublicHealthMetrics(),
      }));
      return;
    }
    // Metrics endpoint at /metrics — sanitized for public exposure (IRX-M02)
    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getPublicHealthMetrics()));
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

  // ── Create extracted handler modules (auth, spectator, matchmaking) ──
  // These were extracted from server.mjs to reduce file size and improve
  // testability. Each module receives a context object with shared server
  // state and helper functions. Getters are used for state that is reassigned
  // by startServer (matchStore, matchmakingQueue, identityVerifier, etc.).
  _authHandlers = createAuthHandlers({
    connections,
    authAttempts: _authAttempts,
    bannedIps,
    getIdentityVerifier: () => identityVerifier,
    getAuthMode: () => _authMode,
    authAttemptMax: _authAttemptMax,
    authAttemptWindowMs: _authAttemptWindowMs,
    authAttemptBanMs: _authAttemptBanMs,
    send,
    logEvent,
  });
  _spectatorHandlers = createSpectatorHandlers({
    connections,
    getMatchStore: () => matchStore,
    maxSpectatorsPerMatch: MAX_SPECTATORS_PER_MATCH,
    getAuthMode: () => _authMode,
    send,
    logEvent,
  });
  _matchmakingHandlers = createMatchmakingHandlers({
    connections,
    getMatchStore: () => matchStore,
    getMatchmakingQueue: () => matchmakingQueue,
    getBlockChecker: () => blockChecker,
    getPublicMatchmaking: () => _featureFlags.publicMatchmaking,
    maxMatches: MAX_MATCHES,
    send,
    logEvent,
  });
  _matchHandlers = createMatchHandlers({
    connections,
    getMatchStore: () => matchStore,
    getAuthMode: () => _authMode,
    getBlockChecker: () => blockChecker,
    pendingForfeits,
    maxMatches: MAX_MATCHES,
    buildPublicProfile,
    classifyMatchForCreate,
    findConnectionByParticipant,
    supersedeOldConnection,
    broadcastMatchEnded,
    broadcastToSpectators: (match) => _spectatorHandlers?.broadcastToSpectators(match),
    send,
    logEvent,
  });
  // Tournament repository: Supabase in production, in-memory in dev
  if (opts.tournamentRepository) {
    _tournamentRepository = opts.tournamentRepository;
  } else if (matchResultPersistor && opts.supabaseUrl && _resolvedServiceKey) {
    // Reuse the same Supabase client configuration for tournament persistence
    const { createClient } = require('@supabase/supabase-js');
    const tournamentClient = createClient(opts.supabaseUrl, _resolvedServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    _tournamentRepository = new SupabaseTournamentRepository({ client: tournamentClient });
  } else if (process.env.SUPABASE_URL && _resolvedServiceKey) {
    const { createClient } = require('@supabase/supabase-js');
    const tournamentClient = createClient(process.env.SUPABASE_URL, _resolvedServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    _tournamentRepository = new SupabaseTournamentRepository({ client: tournamentClient });
  } else {
    _tournamentRepository = new InMemoryTournamentRepository();
  }

  // Operator account IDs for TOURNAMENT_START / TOURNAMENT_REPORT_RESULT
  const _operatorAccountIds = new Set(opts.operatorAccountIds ?? []);
  if (process.env.INTRILEX_OPERATOR_ACCOUNTS) {
    for (const id of process.env.INTRILEX_OPERATOR_ACCOUNTS.split(',').map(s => s.trim()).filter(Boolean)) {
      _operatorAccountIds.add(id);
    }
  }

  _tournamentHandlers = createTournamentHandlers({
    connections,
    tournamentRepository: _tournamentRepository,
    operatorAccountIds: _operatorAccountIds,
    send,
    logEvent,
  });

  // B12: Report handler — requires Supabase client for the submit_player_report RPC
  let _reportSupabaseClient = null;
  if (opts.supabaseUrl && _resolvedServiceKey) {
    const { createClient: _createReportClient } = require('@supabase/supabase-js');
    _reportSupabaseClient = _createReportClient(opts.supabaseUrl, _resolvedServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } else if (process.env.SUPABASE_URL && _resolvedServiceKey) {
    const { createClient: _createReportClient } = require('@supabase/supabase-js');
    _reportSupabaseClient = _createReportClient(process.env.SUPABASE_URL, _resolvedServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  _reportHandlers = createReportHandlers({
    connections,
    supabaseClient: _reportSupabaseClient,
    send,
    logEvent,
  });

  // WebSocket server with permessage-deflate compression.
  // The ws library negotiates permessage-deflate automatically during the
  // WebSocket handshake. These thresholds prevent compressing tiny messages
  // (where the deflate header overhead exceeds the savings).
  // IRX-M35: Compression attack surface — explicit budgets.
  // maxPayload limits the COMPRESSED frame size to 64KB.
  // The decompressed budget (1MB) is enforced per-message in the message handler.
  const MAX_DECOMPRESSED_SIZE = 1024 * 1024; // 1MB decompressed budget
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
    // IRX-M33: Previously, an empty/missing Origin header bypassed the check
    // entirely (the `origin && ...` condition skipped validation when origin
    // was falsy). Now, when ALLOWED_ORIGINS is configured, a missing Origin
    // header is rejected — non-browser clients must send an allowed Origin.
    if (ALLOWED_ORIGINS.length > 0) {
      const origin = req?.headers?.origin ?? '';
      if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
        ws.close(1008, 'Origin not allowed');
        return;
      }
    }

    const connectionId = randomUUID();
    connections.set(connectionId, { ws, authState: ConnectionAuthState.UNAUTHENTICATED, account: null, participantId: null, matchId: null, lastHeartbeat: Date.now(), isSpectator: false, spectatingMatchId: null, ip });
    logEvent('connectionOpen', { connectionId, ip, total: connections.size });

    ws.on('message', (raw) => {
      // IRX-M35: Enforce decompressed size budget to prevent compression bombs.
      // maxPayload limits compressed size, but a small compressed frame can
      // decompress to a very large payload. Reject messages exceeding 1MB.
      if (raw.length > MAX_DECOMPRESSED_SIZE) {
        logEvent('messageTooLarge', { connectionId, size: raw.length, limit: MAX_DECOMPRESSED_SIZE });
        return;
      }
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
        try { handleDisconnect(cid); } catch (err) { logEvent('heartbeatDisconnectError', { cid, error: err?.message }); }
        try { conn.ws.terminate(); } catch { /* ignore — ws may already be closed */ }
      } else {
        try { conn.ws.ping(); } catch { /* ignore — ws may be closing */ }
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
    // Clean stale auth-attempt trackers (no attempts in the window)
    const authCutoff = now - _authAttemptWindowMs;
    for (const [ip, attempts] of _authAttempts) {
      // Remove entries outside the window; if none remain, drop the IP entirely
      while (attempts.length > 0 && attempts[0] < authCutoff) attempts.shift();
      if (attempts.length === 0) _authAttempts.delete(ip);
    }
  }, 60000);

  // ── Health monitor — periodic threshold checks + structured alerts ──
  const healthMonitor = startHealthMonitor({
    getHealthMetrics,
    logEvent,
    intervalMs: opts.healthMonitorIntervalMs ?? 60000,
    maxGlobalConnections: MAX_GLOBAL_CONNECTIONS,
    maxMatches: MAX_MATCHES,
  });

  // IRX-H04: Moderation table startup probe — verify account_moderation exists
  // and is queryable with the configured service-role key. Without this table,
  // every authentication fails closed with an opaque client-facing message.
  // Probing at boot surfaces the misconfiguration loudly (in production, the
  // server refuses to start) instead of silently failing per-connection.
  // Skip when: no verifier (dev mode), explicit opt-out, or a non-Supabase
  // verifier (e.g. FakeIdentityVerifier in tests).
  const skipModerationProbe = opts.skipModerationProbe === true
    || !identityVerifier
    || typeof identityVerifier.probeModerationTable !== 'function';

  return new Promise((resolve, reject) => {
    (async () => {
      if (!skipModerationProbe) {
        let probeResult;
        try {
          probeResult = await identityVerifier.probeModerationTable();
        } catch (err) {
          probeResult = { ok: false, error: { message: err?.message ?? String(err) } };
        }
        if (!probeResult.ok) {
          const errInfo = probeResult.error ?? {};
          logEvent('moderationProbeFailed', {
            code: errInfo.code,
            message: errInfo.message,
            hint: errInfo.hint,
          });
          if (_isProductionMode) {
            reject(new Error(
              'Moderation table startup probe failed: ' + (errInfo.message ?? 'unknown error') +
              (errInfo.hint ? ` (hint: ${errInfo.hint})` : '') +
              '. Ensure the account_moderation table exists (migration 0006) and the ' +
              'service-role key has access. Set opts.skipModerationProbe=true to bypass ' +
              '(NOT recommended in production).'
            ));
            return;
          }
          process.stderr.write(
            '\n⚠  WARNING: Moderation table probe failed: ' + (errInfo.message ?? 'unknown error') + '\n' +
            '   Authentication will fail closed (IRX-H04) until this is fixed.\n\n'
          );
        } else {
          logEvent('moderationProbeOk', {});
        }
      }

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
            healthMonitor.stop();
            // v0.25: Remove signal handlers on explicit close
            process.removeListener('SIGTERM', signalHandler);
            process.removeListener('SIGINT', signalHandler);
            // Close all active connections
            for (const conn of connections.values()) {
              try { conn.ws.terminate(); } catch { /* ignore */ }
            }
            connections.clear();
            // IRX-H10: Clear all pending forfeit timers
            for (const { timer } of pendingForfeits.values()) {
              clearTimeout(timer);
            }
            pendingForfeits.clear();
            if (matchmakingQueue) matchmakingQueue = null;
            if (matchStore) matchStore.close();
            matchStore = null;
            if (identityVerifier) { identityVerifier.close?.(); identityVerifier = null; }
            blockChecker = null; // IRX-H19: Clear block checker on shutdown
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
              _authAttempts.clear();
              _authHandlers = null;
              _spectatorHandlers = null;
              _matchmakingHandlers = null;
              _matchHandlers = null;
              _tournamentHandlers = null;
              _reportHandlers = null;
              if (_tournamentRepository && typeof _tournamentRepository.clear === 'function') {
                _tournamentRepository.clear();
              }
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
    })().catch(reject);
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
    // IRX-H03: Revalidate token expiry on every privileged action.
    // Previously, token expiry was checked only at handshake time. A player
    // whose token expired mid-match could continue playing indefinitely.
    if (connAuth.account?.tokenExpiresAt && Date.now() > connAuth.account.tokenExpiresAt) {
      logEvent('authTokenExpired', { connectionId, type, accountId: connAuth.account.accountId });
      return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_EXPIRED, 'Token expired — please re-authenticate', requestId));
    }
    // IRX-H03: Revalidate account status on every privileged action.
    // A player suspended/banned mid-match must not continue playing.
    if (connAuth.account?.accountStatus === 'SUSPENDED') {
      logEvent('authAccountSuspendedMidMatch', { connectionId, type, accountId: connAuth.account.accountId });
      return send(ws, errorMsg(ReasonCode.AUTH_ACCOUNT_SUSPENDED, 'Account suspended — session terminated', requestId));
    }
    if (connAuth.account?.accountStatus === 'BANNED') {
      logEvent('authAccountBannedMidMatch', { connectionId, type, accountId: connAuth.account.accountId });
      return send(ws, errorMsg(ReasonCode.AUTH_ACCOUNT_BANNED, 'Account banned — session terminated', requestId));
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
      case 'AUTHENTICATE': handlerResult = _authHandlers.handleAuthenticate(connectionId, ws, payload, requestId); break;
      case 'AUTH_REFRESH': handlerResult = _authHandlers.handleAuthRefresh(connectionId, ws, payload, requestId); break;
      case 'CREATE_MATCH': handlerResult = _matchHandlers.handleCreateMatch(connectionId, ws, payload, requestId); break;
      case 'JOIN_MATCH': handlerResult = _matchHandlers.handleJoinMatch(connectionId, ws, payload, requestId); break;
      case 'RESUME_MATCH': handlerResult = _matchHandlers.handleResumeMatch(connectionId, ws, payload, requestId); break;
      case 'READY': handlerResult = _matchHandlers.handleReady(connectionId, ws, payload, requestId); break;
      case 'SUBMIT_ACTION': handlerResult = _matchHandlers.handleSubmitAction(connectionId, ws, payload, requestId); break;
      case 'REQUEST_SYNC': handlerResult = _matchHandlers.handleRequestSync(connectionId, ws, payload, requestId); break;
      case 'LEAVE_MATCH': handlerResult = _matchHandlers.handleLeaveMatch(connectionId, ws, payload, requestId); break;
      case 'REMATCH': handlerResult = _matchHandlers.handleRematch(connectionId, ws, payload, requestId); break;
      case 'QUEUE_JOIN': handlerResult = _matchmakingHandlers.handleQueueJoin(connectionId, ws, payload, requestId); break;
      case 'QUEUE_LEAVE': handlerResult = _matchmakingHandlers.handleQueueLeave(connectionId, ws, payload, requestId); break;
      case 'SPECTATE_MATCH': handlerResult = _spectatorHandlers.handleSpectateMatch(connectionId, ws, payload, requestId); break;
      case 'SPECTATE_LEAVE': handlerResult = _spectatorHandlers.handleSpectateLeave(connectionId, ws, payload, requestId); break;
      case 'LIST_SPECTATABLE': handlerResult = _spectatorHandlers.handleListSpectatable(connectionId, ws, payload, requestId); break;
      case 'TOURNAMENT_LIST': handlerResult = _tournamentHandlers.handleTournamentList(connectionId, ws, payload, requestId); break;
      case 'TOURNAMENT_GET': handlerResult = _tournamentHandlers.handleTournamentGet(connectionId, ws, payload, requestId); break;
      case 'TOURNAMENT_REGISTER': handlerResult = _tournamentHandlers.handleTournamentRegister(connectionId, ws, payload, requestId); break;
      case 'TOURNAMENT_START': handlerResult = _tournamentHandlers.handleTournamentStart(connectionId, ws, payload, requestId); break;
      case 'TOURNAMENT_REPORT_RESULT': handlerResult = _tournamentHandlers.handleTournamentReportResult(connectionId, ws, payload, requestId); break;
      case 'REPORT_PLAYER': handlerResult = _reportHandlers.handleReportPlayer(connectionId, ws, payload, requestId); break;
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
// Auth handshake handlers (handleAuthenticate, handleAuthRefresh) are
// extracted to handlers/auth-handlers.mjs and wired via createAuthHandlers().
// Spectator handlers (handleSpectateMatch, handleSpectateLeave,
// broadcastToSpectators) are extracted to handlers/spectator-handlers.mjs.
// Matchmaking handlers (handleQueueJoin, handleQueueLeave) are extracted
// to handlers/matchmaking-handlers.mjs.

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

  logEvent('migrationRequest', { connectionId, migrationId: plan.migrationId, achievementCount: payload.achievements.length, hasProgress: Boolean(payload.achievementProgress) });

  const result = await matchResultPersistor.executeGuestMigration(plan, payload.achievements);

  if (!result.success) {
    logEvent('migrationFailure', { connectionId, migrationId: plan.migrationId, error: result.error });
    return send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, result.error ?? 'Migration failed', requestId));
  }

  // IRX-H31: Also persist achievement progress if provided
  if (payload.achievementProgress && payload.achievementProgress.length > 0) {
    try {
      const progressRows = payload.achievementProgress.map(p => ({
        accountId: payload.targetIdentity,
        achievementId: p.achievementId,
        progress: p.progress,
        target: p.target ?? null,
        updatedAt: new Date().toISOString(),
        matchId: null,
      }));
      await matchResultPersistor.persistAchievementProgress(progressRows);
      logEvent('migrationProgressTransferred', { connectionId, migrationId: plan.migrationId, progressCount: progressRows.length });
    } catch (err) {
      // Non-fatal — unlocks were already transferred successfully
      logEvent('migrationProgressError', { connectionId, migrationId: plan.migrationId, error: err?.message ?? String(err) });
    }
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

// Match lifecycle handlers (handleCreateMatch, handleJoinMatch, handleResumeMatch,
// handleReady, handleSubmitAction, handleRequestSync, handleLeaveMatch) are
// extracted to handlers/match-handlers.mjs and wired via createMatchHandlers().

// Matchmaking queue handlers (handleQueueJoin, handleQueueLeave) are extracted
// to handlers/matchmaking-handlers.mjs and wired via createMatchmakingHandlers().
// Spectator handlers (handleSpectateMatch, handleSpectateLeave,
// broadcastToSpectators) are extracted to handlers/spectator-handlers.mjs.

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
          // IRX-H10: For a RUNNING match, include the reconnect-grace window so
          // the waiting client can show a countdown. The forfeit timer is
          // scheduled below using the same RECONNECT_GRACE value.
          const statusObj = {
            participantId: conn.participantId,
            status: 'DISCONNECTED',
          };
          if (match.status === 'RUNNING') {
            statusObj.graceMs = RECONNECT_GRACE;
          }
          send(oppConn.ws, participantStatus(match.matchId, statusObj));
        }
      }

      // IRX-H10: If the match is RUNNING and the opponent is still connected,
      // schedule a forfeit timeout. If the disconnected player doesn't reconnect
      // within RECONNECT_GRACE, the match is terminalized as a forfeit.
      if (match.status === 'RUNNING' && opponentId) {
        const oppConn = findConnectionByParticipant(opponentId, conn.matchId);
        if (oppConn) {
          // Cancel any existing forfeit timer for this match
          const existing = pendingForfeits.get(match.matchId);
          if (existing) clearTimeout(existing.timer);
          // Schedule forfeit
          const timer = setTimeout(async () => {
            const pending = pendingForfeits.get(match.matchId);
            if (!pending) return;
            pendingForfeits.delete(match.matchId);
            // Guard: server may have been shut down
            if (!matchStore) return;
            const currentMatch = matchStore.get(match.matchId);
            if (!currentMatch || currentMatch.status !== 'RUNNING') return;
            // Verify the participant is still disconnected
            const p = currentMatch.participants.get(conn.participantId);
            if (!p || p.connectionState !== 'DISCONNECTED') return;
            // Forfeit — the remaining player wins
            const forfeited = currentMatch.forfeit(conn.participantId);
            if (forfeited) {
              matchStore.save(currentMatch);
              logEvent('matchForfeit', { matchId: currentMatch.matchId, forfeitingParticipant: conn.participantId, winner: currentMatch.winner });
              await broadcastMatchEnded(currentMatch);
              // Notify the remaining player
              const winnerConn = findConnectionByParticipant(opponentId, currentMatch.matchId);
              if (winnerConn) {
                send(winnerConn.ws, matchEnded(currentMatch.matchId, currentMatch.terminalReason, currentMatch.winner));
              }
            }
          }, RECONNECT_GRACE);
          pendingForfeits.set(match.matchId, { timer, forfeitingParticipantId: conn.participantId });
          logEvent('forfeitTimerStarted', { matchId: match.matchId, participantId: conn.participantId, graceMs: RECONNECT_GRACE });
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

async function broadcastMatchEnded(match) {
  // Generate the replay ONCE and compute its hash from the actual replay object.
  // Do NOT hash an empty-string fallback — if replay generation fails, send no hash.
  const replay = match.getReplay();
  // IRX-H41: Verify the replay before sending it to clients. If the replay
  // fails verification (tampered, corrupted, or inconsistent), do NOT send
  // a replay hash — clients will know no certified replay is available.
  let replayHash = null;
  if (replay) {
    try {
      const verification = match.verifyReplay();
      if (verification.valid) {
        replayHash = createHash('sha256').update(JSON.stringify(replay)).digest('hex');
      } else {
        logEvent('replayVerificationFailed', { matchId: match.matchId, error: verification.error });
      }
    } catch (err) {
      logEvent('replayVerificationError', { matchId: match.matchId, error: err?.message ?? String(err) });
    }
  }
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

  // IRX-H13: DURABLE PERSISTENCE BEFORE BROADCAST.
  // The terminal result MUST be durably enqueued BEFORE clients are told
  // the match is terminal. Previously, the broadcast happened first and the
  // outbox enqueue was a fire-and-forget .then() — if the server crashed
  // after broadcasting but before the async enqueue completed, clients
  // observed finality that could vanish on crash. Now we await the build
  // and enqueue first, then broadcast.
  //
  // RANK-01: Use the server-owned match.queueId (not profileId.includes('ranked')).
  // The outbox routes ranked records through RatingService.applyRatedResult()
  // which fails closed for ineligible records.
  if (terminalOutbox && matchResultPersistor) {
    /** @type {Awaited<ReturnType<typeof buildMatchResultRecord>> | null} */
    let record = null;
    try {
      let effectiveQueueId = match.queueId ?? 'casual';
      let effectiveSeasonId = match.seasonId && match.seasonId !== 'pending' ? match.seasonId : undefined;

      // IRX-H07: If this is a ranked match and the season cannot be resolved,
      // downgrade to casual rather than fabricating a season. A ranked record
      // without a valid season must never enter account truth.
      if (effectiveQueueId === 'ranked' && !effectiveSeasonId && matchResultPersistor?.resolveActiveSeasonId) {
        try {
          effectiveSeasonId = await matchResultPersistor.resolveActiveSeasonId('ranked');
        } catch (err) {
          logEvent('rankedSeasonResolveError', { matchId: match.matchId, error: err?.message });
          effectiveSeasonId = null;
        }
        if (!effectiveSeasonId) {
          logEvent('rankedSeasonMissing', { matchId: match.matchId, action: 'downgrade_to_casual' });
          effectiveQueueId = 'casual';
        }
      }

      record = await buildMatchResultRecord({
        match,
        persistor: matchResultPersistor,
        queueId: effectiveQueueId,
        seasonId: effectiveSeasonId,
        serverVersion: LAB_VERSION,
      });
      ratingRecord = record;
      if (record) {
        // Enqueue result job — idempotency key is matchId
        terminalOutbox.enqueueResult(record);

        // Enqueue achievement jobs — idempotency key is matchId:accountId
        const achUnlocks = [];
        const achProgress = [];
        for (const [pid] of match.participants) {
          const achResult = achievementResults[pid];
          if (!achResult) continue;
          const participant = match.participants.get(pid);
          const accountId = participant?.accountId;
          if (!accountId) continue; // Skip anonymous players
          // IRX-H31: Persist both unlocks AND progress updates.
          // Previously, participants with no new unlocks were skipped entirely,
          // discarding their progress updates (e.g., counters, set progress).
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
          for (const prog of (achResult.progressUpdates || [])) {
            achProgress.push({
              accountId,
              achievementId: prog.achievementId,
              progress: prog.progress,
              target: prog.target || null,
              updatedAt: new Date().toISOString(),
              matchId: match.matchId,
            });
          }
        }
        if (achUnlocks.length > 0) {
          terminalOutbox.enqueueAchievements(achUnlocks, match.matchId);
        }
        if (achProgress.length > 0) {
          terminalOutbox.enqueueAchievementProgress(achProgress, match.matchId);
        }
        // Trigger an immediate drain attempt (don't wait for the interval)
        terminalOutbox._drainOnce().catch(err => {
          logEvent('outboxDrainError', { matchId: match.matchId, error: err?.message ?? String(err) });
        });
      }
    } catch (err) {
      logEvent('matchResultBuildError', { matchId: match.matchId, error: err?.message ?? String(err) });
    }
  }

  // IRX-H13: Broadcast to clients AFTER durable persistence is enqueued.
  // Clients only learn the match is terminal once the result is durably stored.
  // IRX-H23: Include per-participant rating data in MATCH_ENDED for ranked matches.
  /** @type {Awaited<ReturnType<typeof buildMatchResultRecord>> | null} */
  let ratingRecord = null;
  let ratingData = null;
  try {
    if (ratingRecord && ratingRecord.participants) {
      ratingData = ratingRecord.participants
        .filter(p => p.ratingBefore !== null || p.ratingAfter !== null)
        .map(p => ({
          participantId: p.participantId,
          ratingBefore: p.ratingBefore ?? null,
          ratingAfter: p.ratingAfter ?? null,
          ratingDelta: p.ratingDelta ?? null,
        }));
      if (ratingData.length === 0) ratingData = null;
    }
  } catch (err) {
    logEvent('ratingDataExtractError', { matchId: match.matchId, error: err?.message });
    ratingData = null;
  }

  for (const [pid] of match.participants) {
    const targetConn = findConnectionByParticipant(pid, match.matchId);
    if (targetConn) {
      send(targetConn.ws, matchEnded(match.matchId, match.terminalReason, match.winner, undefined, ratingData));
      // Send REPLAY_AVAILABLE so clients know they can request the certified replay
      send(targetConn.ws, replayAvailable(match.matchId, replayUrl, replayHash));
      // Send server-authoritative achievement unlocks for this participant
      const achResult = achievementResults[pid];
      if (achResult && achResult.newUnlocks.length > 0) {
        send(targetConn.ws, achievementsEarned(match.matchId, achResult.newUnlocks, achResult.progressUpdates));
      }
    }
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
    // IRX-H02: In production, auth must be explicitly required.
    // Missing, misspelled, or 'optional' auth mode in production is fail-closed.
    if (isProduction && AUTH_MODE !== AuthMode.REQUIRED) {
      console.error(`FATAL: NODE_ENV=production but INTRILEX_AUTH_MODE is '${AUTH_MODE}' (not 'required').`);
      console.error('       Production servers must have INTRILEX_AUTH_MODE=required.');
      process.exit(1);
    }
    // IRX-H02: Validate auth mode against closed enum — reject unknown values.
    const validAuthModes = new Set([AuthMode.REQUIRED, AuthMode.DISABLED]);
    if (!validAuthModes.has(AUTH_MODE)) {
      console.error(`FATAL: INTRILEX_AUTH_MODE='${AUTH_MODE}' is not a valid mode.`);
      console.error(`       Valid modes: 'required' (production), 'disabled' (development).`);
      process.exit(1);
    }
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
    }).catch(err => {
      // IRX-M37: Log sanitized fatal error and exit nonzero on startup failure.
      console.error('FATAL: Server startup failed:', err.message);
      process.exit(1);
    });
  }
} catch (err) {
  // IRX-M37: Don't silently swallow startup errors. If this is a CLI invocation,
  // log the error and exit nonzero. If imported as a module, re-throw.
  const _scriptPath = fileURLToPath(import.meta.url);
  const _argvPath = process.argv[1] || '';
  const _isMain = _scriptPath === _argvPath || _scriptPath.replace(/\\/g, '/') === _argvPath.replace(/\\/g, '/');
  if (_isMain && _argvPath) {
    console.error('FATAL: Server initialization error:', err.message);
    process.exit(1);
  }
}
