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
  validateMatchHistory, validateGetReplay,
  checkMessageSize, ReasonCode,
  matchCreated, matchJoined, matchView, actionResult,
  participantStatus, matchStarted, matchEnded, error as errorMsg,
  queueJoined, queueLeft, queueMatched,
  spectateMatch, spectateLeave, spectateJoined, spectateLeft,
  matchHistoryResult, envelope,
  replayAvailable, replayData,
} from '@intrilex/network-protocol';

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
// When empty, only localhost connections are accepted in dev mode
const ALLOWED_ORIGINS = process.env.INTRILEX_ALLOWED_ORIGINS
  ? process.env.INTRILEX_ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : []; // Empty = localhost-only default for invite-alpha
// Public history/spectator discovery — disabled by default for invite-alpha
// Enable explicitly with INTRILEX_PUBLIC_HISTORY=1 for trusted environments
const PUBLIC_HISTORY_ENABLED = process.env.INTRILEX_PUBLIC_HISTORY === '1' || false;
// Public matchmaking — disabled by default for v0.24.1
// Enable explicitly with INTRILEX_PUBLIC_MATCHMAKING=1
const PUBLIC_MATCHMAKING_ENABLED = process.env.INTRILEX_PUBLIC_MATCHMAKING === '1' || false;

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
const connections = new Map(); // connectionId → { ws, participantId, matchId, lastHeartbeat, isSpectator, spectatingMatchId, rateLimit, ip }
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
 * @returns {Promise<{ httpServer, wss, close }>}
 */
export function startServer(opts = {}) {
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? DEFAULT_HOST;
  const persistent = opts.persistent ?? true;

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

  // Initialize matchmaking queue
  matchmakingQueue = new MatchmakingQueue({
    onCreateMatch: (profileId, seed, players) => {
      // Create a match and add both players
      const matchId = `M-${randomBytes(12).toString('base64url')}`;
      const match = createAuthoritativeMatch({ matchId, profileId, seed });

      const results = players.map(({ connectionId }) => {
        const participantToken = randomBytes(32).toString('base64url');
        const participantId = `P-${randomBytes(8).toString('base64url')}`;
        match.addParticipant(participantId, participantToken);

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
        version: '0.24.2',
        protocolVersion: 1,
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
    connections.set(connectionId, { ws, participantId: null, matchId: null, lastHeartbeat: Date.now(), isSpectator: false, spectatingMatchId: null, ip });
    logEvent('connectionOpen', { connectionId, ip, total: connections.size });

    ws.on('message', (raw) => handleMessage(connectionId, ws, raw));
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
      resolve({
        httpServer,
        wss,
        close() {
          clearInterval(heartbeatTimer);
          clearInterval(cleanupTimer);
          // Close all active connections
          for (const conn of connections.values()) {
            try { conn.ws.terminate(); } catch { /* ignore */ }
          }
          connections.clear();
          if (matchmakingQueue) matchmakingQueue = null;
          if (matchStore) matchStore.close();
          matchStore = null;
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
        },
      });
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

  try {
    switch (type) {
      case 'CREATE_MATCH': return handleCreateMatch(connectionId, ws, payload, requestId);
      case 'JOIN_MATCH': return handleJoinMatch(connectionId, ws, payload, requestId);
      case 'RESUME_MATCH': return handleResumeMatch(connectionId, ws, payload, requestId);
      case 'READY': return handleReady(connectionId, ws, payload, requestId);
      case 'SUBMIT_ACTION': return handleSubmitAction(connectionId, ws, payload, requestId);
      case 'REQUEST_SYNC': return handleRequestSync(connectionId, ws, payload, requestId);
      case 'LEAVE_MATCH': return handleLeaveMatch(connectionId, ws, payload, requestId);
      case 'QUEUE_JOIN': return handleQueueJoin(connectionId, ws, payload, requestId);
      case 'QUEUE_LEAVE': return handleQueueLeave(connectionId, ws, payload, requestId);
      case 'SPECTATE_MATCH': return handleSpectateMatch(connectionId, ws, payload, requestId);
      case 'SPECTATE_LEAVE': return handleSpectateLeave(connectionId, ws, payload, requestId);
      case 'MATCH_HISTORY': return handleMatchHistory(connectionId, ws, payload, requestId);
      case 'GET_REPLAY': return handleGetReplay(connectionId, ws, payload, requestId);
      default:
        return send(ws, errorMsg(ReasonCode.MESSAGE_TYPE_UNKNOWN, `Unknown type: ${type}`, requestId));
    }
  } catch (err) {
    return send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, err.message, requestId));
  }
}

// ── Handlers ──

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
  });

  match.addParticipant(participantId, participantToken);
  matchStore.save(match);
  matchStore.registerInvite(inviteCode, matchId);

  // Bind connection to participant
  const conn = connections.get(connectionId);
  conn.participantId = participantId;
  conn.matchId = matchId;

  send(ws, matchCreated(matchId, inviteCode, participantToken, requestId));
  logEvent('matchCreate', { matchId, profileId: payload.profileId });
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

  const participantToken = randomBytes(32).toString('base64url');
  const participantId = `P-${randomBytes(8).toString('base64url')}`;

  const result = match.addParticipant(participantId, participantToken);
  matchStore.save(match);

  // Bind connection
  const conn = connections.get(connectionId);
  conn.participantId = participantId;
  conn.matchId = match.matchId;

  send(ws, matchJoined(match.matchId, participantToken, result.playerId, requestId));
  logEvent('matchJoin', { matchId: match.matchId, participantId });

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

  // Bind new connection FIRST, then supersede old — eliminates the race window
  // where neither connection is bound during reconnection.
  const conn = connections.get(connectionId);
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
  logEvent('reconnect', { matchId: match.matchId, participantId });
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

  const result = matchmakingQueue.enqueue(connectionId, payload.profileId);
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
  for (const [pid] of match.participants) {
    const targetConn = findConnectionByParticipant(pid, match.matchId);
    if (targetConn) {
      send(targetConn.ws, matchEnded(match.matchId, match.terminalReason, match.winner));
      // Send REPLAY_AVAILABLE so clients know they can request the certified replay
      send(targetConn.ws, replayAvailable(match.matchId, replayUrl, replayHash));
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
    const host = process.env.HOST || DEFAULT_HOST;
    startServer({ port, host }).then(() => {
      console.log(`Intrilex Match Authority Server running on ws://${host}:${port}`);
      console.log(`HTTP health: http://${host}:${port}`);
    });
  }
} catch { /* not running as CLI — imported as a module */ }
