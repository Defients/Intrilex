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

const KNOWN_TYPES = new Set([
  // Client → Server
  'CREATE_MATCH', 'JOIN_MATCH', 'RESUME_MATCH',
  'READY', 'SUBMIT_ACTION', 'REQUEST_SYNC', 'LEAVE_MATCH',
  'QUEUE_JOIN', 'QUEUE_LEAVE',
  'SPECTATE_MATCH', 'SPECTATE_LEAVE',
  'MATCH_HISTORY',
  'GET_REPLAY',
  'SEND_CHAT',
  // Client → Server (auth handshake — v2)
  'AUTHENTICATE', 'AUTH_REFRESH',
  // Server → Client
  'MATCH_CREATED', 'MATCH_JOINED', 'MATCH_VIEW',
  'ACTION_RESULT', 'PARTICIPANT_STATUS', 'MATCH_STARTED',
  'MATCH_ENDED', 'ERROR',
  'QUEUE_JOINED', 'QUEUE_LEFT', 'QUEUE_MATCHED',
  'SPECTATE_JOINED', 'SPECTATE_LEFT',
  'MATCH_HISTORY_RESULT',
  'REPLAY_AVAILABLE', 'REPLAY_DATA',
  'CHAT_MESSAGE',
  'ACHIEVEMENTS_EARNED',
  // Server → Client (auth handshake — v2)
  'AUTHENTICATED',
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
