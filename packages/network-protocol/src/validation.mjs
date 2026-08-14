// ═══════════════════════════════════════════════════════════════
// validation.mjs — Strict protocol message validators
// ═══════════════════════════════════════════════════════════════

import { ReasonCode } from './reason-codes.mjs';

export const PROTOCOL_VERSION = 2;
export const MAX_MESSAGE_SIZE = 65536; // 64 KB

/**
 * @typedef {{ valid: true }} ValidationResultOk
 * @typedef {{ valid: false, code: string, message: string }} ValidationResultFail
 * @typedef {ValidationResultOk | ValidationResultFail} ValidationResult
 */

/**
 * @typedef {Object} ProtocolMessage
 * @property {number} [protocolVersion]
 * @property {string} [type]
 * @property {string} [requestId]
 * @property {*} [payload]
 */

/**
 * Forbidden property names that enable prototype pollution attacks.
 * A payload containing any of these keys (at any depth) is rejected before
 * further validation. This prevents `{"__proto__": {...}}` from poisoning
 * Object.prototype, `{"constructor": {"prototype": {...}}}` style attacks,
 * and `prototype`-based pollution vectors.
 */
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively check a value for prototype-pollution property names.
 * Rejects any object (at any nesting depth) that contains `__proto__`,
 * `constructor`, or `prototype` as an own enumerable key. Arrays are
 * traversed element-wise. Non-objects are safe.
 *
 * @param {*} value - The parsed JSON value to check
 * @param {number} [depth=0] - Current recursion depth (guard against stack overflow)
 * @returns {boolean} True if a forbidden key is found
 */
function containsPrototypePollution(value, depth = 0) {
  if (depth > 32) return false; // depth guard — JSON.parse already bounds nesting
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (containsPrototypePollution(item, depth + 1)) return true;
    }
    return false;
  }
  // Check own enumerable keys
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PROTO_KEYS.has(key)) return true;
    if (containsPrototypePollution(value[key], depth + 1)) return true;
  }
  return false;
}

const KNOWN_TYPES = new Set([
  // Client → Server
  'CREATE_MATCH', 'JOIN_MATCH', 'RESUME_MATCH',
  'READY', 'SUBMIT_ACTION', 'REQUEST_SYNC', 'LEAVE_MATCH',
  'QUEUE_JOIN', 'QUEUE_LEAVE',
  'SPECTATE_MATCH', 'SPECTATE_LEAVE',
  'MATCH_HISTORY',
  'GET_REPLAY',
  'SEND_CHAT',
  'CHAT_VISIBILITY',
  // Client → Server (auth handshake — v2)
  'AUTHENTICATE', 'AUTH_REFRESH',
  // Client → Server (guest migration — v2)
  'MIGRATE_GUEST',
  // Client → Server (rematch — v0.28.0)
  'REMATCH',
  // Client → Server (spectator discovery — v0.28.0)
  'LIST_SPECTATABLE',
  // Server → Client
  'MATCH_CREATED', 'MATCH_JOINED', 'MATCH_VIEW',
  'ACTION_RESULT', 'PARTICIPANT_STATUS', 'MATCH_STARTED',
  'MATCH_ENDED', 'ERROR',
  'QUEUE_JOINED', 'QUEUE_LEFT', 'QUEUE_MATCHED',
  'SPECTATE_JOINED', 'SPECTATE_LEFT',
  'MATCH_HISTORY_RESULT',
  'REPLAY_AVAILABLE', 'REPLAY_DATA',
  'CHAT_MESSAGE',
  'CHAT_VISIBILITY_CHANGE',
  'ACHIEVEMENTS_EARNED',
  // Server → Client (auth handshake — v2)
  'AUTHENTICATED',
  // Server → Client (guest migration — v2)
  'MIGRATION_RESULT',
  // Server → Client (rematch — v0.28.0)
  'REMATCH_INVITE',
  // Server → Client (spectator discovery — v0.28.0)
  'SPECTATABLE_LIST',
]);

const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const INVITE_CODE_PATTERN = /^[A-Z0-9]{6,8}$/;

/**
 * Exact supported engine rules profile IDs.
 * Sourced from the engine's canonical profile objects (engine 4.2.6):
 *   CORE_FOUNDATION_AUTHORITY_PROFILE.id         = "core-foundation-authority"
 *   CORE_ADVANCED_AUTHORITY_PROFILE.id           = "core-advanced-authority"
 *   CORE_UNRESTRICTED_AUTHORITY_PROFILE.id       = "core-unrestricted-authority"
 *   CORE_EFFECT_DECLARATION_PROFILE.id           = "core-effect-declaration-authority"
 *   CORE_RESPONSE_AUTHORITY_PROFILE.id           = "core-response-authority"
 *   CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id     = "core-private-choice-authority"
 *
 * PROTO-01: `startsWith('core-')` was insufficient — it accepted any
 * fabricated `core-*` string. This exact enumeration is the authoritative
 * ingress gate. The match server cross-checks this list against the
 * engine-adapter's profile exports at startup.
 */
export const SUPPORTED_PROFILE_IDS = Object.freeze(new Set([
  'core-foundation-authority',
  'core-advanced-authority',
  'core-unrestricted-authority',
  'core-effect-declaration-authority',
  'core-response-authority',
  'core-private-choice-authority',
]));

/**
 * Check if a value is an exact supported engine rules profile ID.
 * @param {unknown} v - Value to check
 * @returns {boolean}
 */
export function isSupportedProfileId(v) {
  return typeof v === 'string' && SUPPORTED_PROFILE_IDS.has(v);
}

/**
 * Server-recognized matchmaking/rating queue IDs.
 * RANK-01: The client may request one of these, but the server creates
 * authoritative classification after validation. A client can never
 * declare a result ranked by setting queueId — the server validates
 * ranked admission requirements before classifying.
 */
export const SUPPORTED_QUEUE_IDS = Object.freeze(new Set([
  'ranked',
  'casual',
  'private',
]));

/**
 * Server-owned match mode classifications.
 * RANK-01: Separate from rulesProfileId (which engine profile executes)
 * and queueId (which matchmaking/rating queue). The server sets this
 * immutably after validation — never inferred from profileId or UI labels.
 */
export const MATCH_MODES = Object.freeze(new Set([
  'private',
  'casual',
  'ranked',
  'tutorial',
  'simulation',
  'local-ai',
]));

/**
 * Check if a value is a supported queue ID.
 * @param {unknown} v - Value to check
 * @returns {boolean}
 */
export function isSupportedQueueId(v) {
  return typeof v === 'string' && SUPPORTED_QUEUE_IDS.has(v);
}

/**
 * Check if a value is a valid identifier.
 * @param {unknown} v - Value to check
 * @returns {boolean}
 */
function isValidId(v) { return typeof v === 'string' && ID_PATTERN.test(v); }

/**
 * Check if a value is a valid invite code.
 * @param {unknown} v - Value to check
 * @returns {boolean}
 */
function isValidInviteCode(v) { return typeof v === 'string' && INVITE_CODE_PATTERN.test(v); }

/**
 * Build a failure validation result.
 * @param {string} code - Reason code
 * @param {string} message - Error message
 * @returns {ValidationResultFail}
 */
function fail(code, message) {
  return { valid: false, code, message };
}

/**
 * Build a success validation result.
 * @returns {ValidationResultOk}
 */
function ok() { return { valid: true }; }

/**
 * Validate a protocol envelope.
 * @param {ProtocolMessage} msg - The parsed JSON message
 * @returns {ValidationResult}
 */
export function validateEnvelope(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return fail(ReasonCode.MALFORMED_JSON, 'Message must be a JSON object');
  }
  // Prototype-pollution firewall — reject any message whose envelope or
  // payload contains __proto__, constructor, or prototype keys at any depth.
  // This is checked BEFORE any other field access to prevent pollution from
  // reaching downstream validators or handlers.
  if (containsPrototypePollution(msg)) {
    return fail(ReasonCode.PROTOTYPE_POLLUTION_DETECTED, 'Message contains forbidden prototype-pollution keys');
  }
  if (typeof msg.protocolVersion !== 'number' || msg.protocolVersion !== PROTOCOL_VERSION) {
    return fail(ReasonCode.PROTOCOL_VERSION_UNSUPPORTED, `Unsupported protocol version: ${msg.protocolVersion}`);
  }
  if (typeof msg.type !== 'string' || !KNOWN_TYPES.has(msg.type)) {
    return fail(ReasonCode.MESSAGE_TYPE_UNKNOWN, `Unknown message type: ${msg.type}`);
  }
  if (msg.requestId !== undefined && (typeof msg.requestId !== 'string' || msg.requestId.length > 128)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'requestId must be a string <= 128 chars');
  }
  if (msg.payload === undefined) {
    return fail(ReasonCode.MISSING_REQUIRED_FIELD, 'payload is required');
  }
  if (typeof msg.payload !== 'object' || msg.payload === null || Array.isArray(msg.payload)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'payload must be a JSON object');
  }
  return ok();
}

/**
 * Validate a CREATE_MATCH payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateCreateMatch(payload) {
  if (!isSupportedProfileId(payload.profileId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'profileId must be an exact supported engine profile');
  }
  // RANK-01: Client may request a queue, but server validates ranked admission.
  if (payload.queueId !== undefined && !isSupportedQueueId(payload.queueId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'queueId must be a supported queue ID');
  }
  return ok();
}

/**
 * Validate a JOIN_MATCH payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateJoinMatch(payload) {
  if (!isValidInviteCode(payload.inviteCode)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'inviteCode must be a 6-char alphanumeric code');
  }
  return ok();
}

/**
 * Validate a RESUME_MATCH payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateResumeMatch(payload) {
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId is invalid');
  }
  if (typeof payload.participantToken !== 'string' || payload.participantToken.length < 16) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'participantToken is invalid');
  }
  return ok();
}

/**
 * Validate a SUBMIT_ACTION payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateSubmitAction(payload) {
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId is invalid');
  }
  if (typeof payload.participantToken !== 'string' || payload.participantToken.length < 16) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'participantToken is invalid');
  }
  if (typeof payload.clientCommandId !== 'string' || payload.clientCommandId.length < 4 || payload.clientCommandId.length > 64) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'clientCommandId must be 4-64 chars');
  }
  if (typeof payload.expectedRevision !== 'number' || payload.expectedRevision < 0 || !Number.isInteger(payload.expectedRevision)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'expectedRevision must be a non-negative integer');
  }
  if (typeof payload.decisionFrameHash !== 'string' || payload.decisionFrameHash.length < 8) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'decisionFrameHash must be a string >= 8 chars');
  }
  if (typeof payload.actionId !== 'string' || payload.actionId.length < 4) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'actionId must be a string >= 4 chars');
  }
  return ok();
}

/**
 * Validate a READY payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateReady(payload) {
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId is invalid');
  }
  if (typeof payload.participantToken !== 'string' || payload.participantToken.length < 16) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'participantToken is invalid');
  }
  return ok();
}

/**
 * Validate a REQUEST_SYNC payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateRequestSync(payload) {
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId is invalid');
  }
  if (typeof payload.participantToken !== 'string' || payload.participantToken.length < 16) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'participantToken is invalid');
  }
  return ok();
}

/**
 * Validate a LEAVE_MATCH payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateLeaveMatch(payload) {
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId is invalid');
  }
  if (typeof payload.participantToken !== 'string' || payload.participantToken.length < 16) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'participantToken is invalid');
  }
  return ok();
}

/**
 * Validate a QUEUE_JOIN payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateQueueJoin(payload) {
  if (!isSupportedProfileId(payload.profileId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'profileId must be an exact supported engine profile');
  }
  // RANK-01: Client may request a queue, but server validates ranked admission.
  if (payload.queueId !== undefined && !isSupportedQueueId(payload.queueId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'queueId must be a supported queue ID');
  }
  return ok();
}

/**
 * Validate a QUEUE_LEAVE payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateQueueLeave(payload) {
  // QUEUE_LEAVE has no required fields
  return ok();
}

/**
 * Validate a SPECTATE_MATCH payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateSpectateMatch(payload) {
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId is invalid');
  }
  return ok();
}

/**
 * Validate a SPECTATE_LEAVE payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateSpectateLeave(payload) {
  // SPECTATE_LEAVE has no required fields
  return ok();
}

/**
 * Validate a MATCH_HISTORY payload.
 * Optional fields: status (filter by status), limit (max results, default 20)
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateMatchHistory(payload) {
  if (payload.status !== undefined && payload.status !== null && typeof payload.status !== 'string') {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'status must be a string or null');
  }
  if (payload.limit !== undefined && payload.limit !== null) {
    if (typeof payload.limit !== 'number' || payload.limit < 1 || payload.limit > 100) {
      return fail(ReasonCode.INVALID_FIELD_TYPE, 'limit must be a number between 1 and 100');
    }
  }
  return ok();
}

/**
 * Validate a GET_REPLAY request.
 * Requires a matchId. The participantToken authenticates the requester
 * (only match participants can download replays).
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateGetReplay(payload) {
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId must be a valid identifier');
  }
  if (typeof payload.participantToken !== 'string' || payload.participantToken.length < 10) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'participantToken must be a non-empty string');
  }
  return ok();
}

/**
 * Validate a REMATCH payload.
 * Requires a matchId (the completed match) and a participant token.
 * The server validates that the match is TERMINAL, the requester is a
 * participant, and the opponent is still connected before creating a
 * new match.
 * @param {Record<string,*>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateRematch(payload) {
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId must be a valid identifier');
  }
  if (typeof payload.participantToken !== 'string' || payload.participantToken.length < 10) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'participantToken must be a non-empty string');
  }
  return ok();
}

/**
 * Validate a LIST_SPECTATABLE payload. The payload is empty — the server
 * returns all currently spectatable matches. No client-side filtering.
 * @param {Record<string,*>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateListSpectatable(payload) {
  if (payload !== null && typeof payload !== 'object') {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'payload must be a JSON object');
  }
  return ok();
}

/**
 * Validate a TOURNAMENT_LIST payload.
 * Optional fields: status (filter), limit (max results, default 20)
 * @param {Record<string,*>} payload
 * @returns {ValidationResult}
 */
export function validateTournamentList(payload) {
  if (payload !== null && typeof payload !== 'object') {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'payload must be a JSON object');
  }
  if (payload.status !== undefined && payload.status !== null && typeof payload.status !== 'string') {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'status must be a string or null');
  }
  if (payload.limit !== undefined && payload.limit !== null) {
    if (typeof payload.limit !== 'number' || payload.limit < 1 || payload.limit > 100) {
      return fail(ReasonCode.INVALID_FIELD_TYPE, 'limit must be a number between 1 and 100');
    }
  }
  return ok();
}

/**
 * Validate a TOURNAMENT_REGISTER payload.
 * Requires a tournamentId.
 * @param {Record<string,*>} payload
 * @returns {ValidationResult}
 */
export function validateTournamentRegister(payload) {
  if (!isValidId(payload.tournamentId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'tournamentId must be a valid identifier');
  }
  return ok();
}

/**
 * Validate a TOURNAMENT_GET payload.
 * Requires a tournamentId.
 * @param {Record<string,*>} payload
 * @returns {ValidationResult}
 */
export function validateTournamentGet(payload) {
  if (!isValidId(payload.tournamentId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'tournamentId must be a valid identifier');
  }
  return ok();
}

/**
 * Validate a TOURNAMENT_START payload.
 * Requires a tournamentId. Operator-only — the server checks authorization
 * separately (not via protocol validation).
 * @param {Record<string,*>} payload
 * @returns {ValidationResult}
 */
export function validateTournamentStart(payload) {
  if (!isValidId(payload.tournamentId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'tournamentId must be a valid identifier');
  }
  return ok();
}

/**
 * Validate a TOURNAMENT_REPORT_RESULT payload.
 * Requires tournamentId, matchId, winnerId, scoreA, scoreB.
 * @param {Record<string,*>} payload
 * @returns {ValidationResult}
 */
export function validateTournamentReportResult(payload) {
  if (!isValidId(payload.tournamentId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'tournamentId must be a valid identifier');
  }
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId must be a valid identifier');
  }
  if (typeof payload.winnerId !== 'string' || payload.winnerId.length === 0) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'winnerId must be a non-empty string');
  }
  if (payload.scoreA !== undefined && payload.scoreA !== null) {
    if (typeof payload.scoreA !== 'number' || payload.scoreA < 0 || !Number.isInteger(payload.scoreA)) {
      return fail(ReasonCode.INVALID_FIELD_TYPE, 'scoreA must be a non-negative integer');
    }
  }
  if (payload.scoreB !== undefined && payload.scoreB !== null) {
    if (typeof payload.scoreB !== 'number' || payload.scoreB < 0 || !Number.isInteger(payload.scoreB)) {
      return fail(ReasonCode.INVALID_FIELD_TYPE, 'scoreB must be a non-negative integer');
    }
  }
  return ok();
}

/**
 * Validate a SEND_CHAT payload.
 * Chat messages are short text (1-200 chars) from authenticated participants.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateSendChat(payload) {
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId is invalid');
  }
  if (typeof payload.participantToken !== 'string' || payload.participantToken.length < 16) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'participantToken is invalid');
  }
  if (typeof payload.text !== 'string' || payload.text.length === 0 || payload.text.length > 200) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'text must be a string of 1-200 chars');
  }
  return ok();
}

/**
 * Validate a CHAT_VISIBILITY payload.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateChatVisibility(payload) {
  if (!isValidId(payload.matchId)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchId is invalid');
  }
  if (typeof payload.participantToken !== 'string' || payload.participantToken.length < 16) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'participantToken is invalid');
  }
  if (typeof payload.hidden !== 'boolean') {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'hidden must be a boolean');
  }
  return ok();
}

/**
 * Check message size before parsing.
 * @param {string|Buffer} raw - Raw message string or buffer
 * @returns {ValidationResult}
 */
export function checkMessageSize(raw) {
  if (typeof raw === 'string' && raw.length > MAX_MESSAGE_SIZE) {
    return { valid: false, code: ReasonCode.MESSAGE_TOO_LARGE, message: `Message exceeds ${MAX_MESSAGE_SIZE} bytes` };
  }
  if (Buffer.isBuffer(raw) && raw.length > MAX_MESSAGE_SIZE) {
    return { valid: false, code: ReasonCode.MESSAGE_TOO_LARGE, message: `Message exceeds ${MAX_MESSAGE_SIZE} bytes` };
  }
  return { valid: true };
}

// ── Auth handshake validators (v2) ──

/** Maximum access token length — JWTs are typically <2KB but allow headroom */
const MAX_TOKEN_LENGTH = 8192;

/**
 * Validate an AUTHENTICATE payload.
 * The access token is a Supabase JWT — never logged or echoed.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateAuthenticate(payload) {
  if (typeof payload.accessToken !== 'string' || payload.accessToken.length === 0) {
    return fail(ReasonCode.AUTH_TOKEN_MISSING, 'accessToken is required');
  }
  if (payload.accessToken.length > MAX_TOKEN_LENGTH) {
    return fail(ReasonCode.MESSAGE_TOO_LARGE, 'accessToken exceeds maximum length');
  }
  // JWT format check: three dot-separated base64url segments
  const parts = payload.accessToken.split('.');
  if (parts.length !== 3) {
    return fail(ReasonCode.AUTH_TOKEN_INVALID, 'accessToken must be a JWT with 3 segments');
  }
  return ok();
}

/**
 * Validate an AUTH_REFRESH payload.
 * Same format as AUTHENTICATE — a fresh access token from Supabase.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateAuthRefresh(payload) {
  if (typeof payload.accessToken !== 'string' || payload.accessToken.length === 0) {
    return fail(ReasonCode.AUTH_TOKEN_MISSING, 'accessToken is required');
  }
  if (payload.accessToken.length > MAX_TOKEN_LENGTH) {
    return fail(ReasonCode.MESSAGE_TOO_LARGE, 'accessToken exceeds maximum length');
  }
  const parts = payload.accessToken.split('.');
  if (parts.length !== 3) {
    return fail(ReasonCode.AUTH_TOKEN_INVALID, 'accessToken must be a JWT with 3 segments');
  }
  return ok();
}

// ── Player report validator (B12) ──

/** Valid reason codes for player reports */
const VALID_REPORT_REASONS = new Set([
  'HARASSMENT', 'CHEATING', 'INAPPROPRIATE_NAME',
  'SPAM', 'DISCONNECT_ABUSE', 'OTHER',
]);

/**
 * Validate a REPORT_PLAYER payload.
 * @param {Record<string,*>} payload
 * @returns {ValidationResult}
 */
export function validateReportPlayer(payload) {
  if (typeof payload.reportedPlayerId !== 'string' || payload.reportedPlayerId.length === 0) {
    return fail(ReasonCode.MISSING_REQUIRED_FIELD, 'reportedPlayerId is required');
  }
  if (typeof payload.reasonCode !== 'string' || !VALID_REPORT_REASONS.has(payload.reasonCode)) {
    return fail(ReasonCode.INVALID_FIELD_TYPE, 'reasonCode must be a valid report reason');
  }
  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== 'string') {
      return fail(ReasonCode.INVALID_FIELD_TYPE, 'description must be a string');
    }
    if (payload.description.length > 1000) {
      return fail(ReasonCode.MESSAGE_TOO_LARGE, 'description must be at most 1000 characters');
    }
  }
  if (payload.matchRef !== undefined && payload.matchRef !== null) {
    if (typeof payload.matchRef !== 'string' || payload.matchRef.length > 64) {
      return fail(ReasonCode.INVALID_FIELD_TYPE, 'matchRef must be a string of at most 64 characters');
    }
  }
  return ok();
}

// ── Guest migration validators (v2) ──

/** UUID pattern for Supabase user IDs */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Maximum number of achievements in a single migration payload */
const MAX_MIGRATION_ACHIEVEMENTS = 200;

/**
 * Validate a MIGRATE_GUEST payload.
 * Contains the source (guest) identity, target (permanent) identity,
 * and the local achievement data to migrate.
 * @param {Record<string, *>} payload - Message payload
 * @returns {ValidationResult}
 */
export function validateMigrateGuest(payload) {
  if (typeof payload.sourceIdentity !== 'string' || !UUID_PATTERN.test(payload.sourceIdentity)) {
    return fail(ReasonCode.MISSING_REQUIRED_FIELD, 'sourceIdentity must be a valid UUID');
  }
  if (typeof payload.targetIdentity !== 'string' || !UUID_PATTERN.test(payload.targetIdentity)) {
    return fail(ReasonCode.MISSING_REQUIRED_FIELD, 'targetIdentity must be a valid UUID');
  }
  if (payload.sourceIdentity === payload.targetIdentity) {
    return fail(ReasonCode.MIGRATION_PLAN_INVALID, 'source and target identities must differ');
  }
  if (!Array.isArray(payload.achievements)) {
    return fail(ReasonCode.MISSING_REQUIRED_FIELD, 'achievements must be an array');
  }
  if (payload.achievements.length > MAX_MIGRATION_ACHIEVEMENTS) {
    return fail(ReasonCode.MESSAGE_TOO_LARGE, `achievements array exceeds maximum of ${MAX_MIGRATION_ACHIEVEMENTS}`);
  }
  for (const a of payload.achievements) {
    if (!a || typeof a.achievementId !== 'string' || a.achievementId.length === 0) {
      return fail(ReasonCode.INVALID_FIELD_TYPE, 'each achievement must have a non-empty achievementId');
    }
    if (typeof a.unlockedAt !== 'string' || a.unlockedAt.length === 0) {
      return fail(ReasonCode.INVALID_FIELD_TYPE, 'each achievement must have an unlockedAt ISO string');
    }
  }
  return ok();
}
