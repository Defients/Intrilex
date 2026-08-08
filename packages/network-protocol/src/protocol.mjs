// ═══════════════════════════════════════════════════════════════
// protocol.mjs — Network protocol message builders and constants
// ═══════════════════════════════════════════════════════════════

import { PROTOCOL_VERSION, MAX_MESSAGE_SIZE } from './validation.mjs';
export { PROTOCOL_VERSION, MAX_MESSAGE_SIZE };
export { ReasonCode, reasonCategory } from './reason-codes.mjs';
export { validateEnvelope, validateCreateMatch, validateJoinMatch, validateResumeMatch, validateSubmitAction, validateReady, validateRequestSync, validateLeaveMatch, validateQueueJoin, validateQueueLeave, validateSpectateMatch, validateSpectateLeave, validateMatchHistory, validateGetReplay, checkMessageSize } from './validation.mjs';

/**
 * @typedef {Object} ProtocolEnvelope
 * @property {number} protocolVersion
 * @property {string} type
 * @property {string} [requestId]
 * @property {Record<string, *>} payload
 */

/**
 * Build a protocol envelope.
 * @param {string} type - Message type
 * @param {Record<string, *>} payload - Message payload
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function envelope(type, payload, requestId) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type,
    ...(requestId ? { requestId } : {}),
    payload,
  };
}

// ── Client → Server message builders ──

/**
 * Build a CREATE_MATCH message.
 * @param {string} profileId - Profile identifier (e.g. "core-*")
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function createMatch(profileId, requestId) {
  return envelope('CREATE_MATCH', { profileId }, requestId);
}

/**
 * Build a JOIN_MATCH message.
 * @param {string} inviteCode - Match invite code
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function joinMatch(inviteCode, requestId) {
  return envelope('JOIN_MATCH', { inviteCode }, requestId);
}

/**
 * Build a RESUME_MATCH message.
 * @param {string} matchId - Match identifier
 * @param {string} participantToken - Participant authentication token
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function resumeMatch(matchId, participantToken, requestId) {
  return envelope('RESUME_MATCH', { matchId, participantToken }, requestId);
}

/**
 * Build a READY message.
 * @param {string} matchId - Match identifier
 * @param {string} participantToken - Participant authentication token
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function ready(matchId, participantToken, requestId) {
  return envelope('READY', { matchId, participantToken }, requestId);
}

/**
 * Build a SUBMIT_ACTION message.
 * @param {string} matchId - Match identifier
 * @param {string} participantToken - Participant authentication token
 * @param {string} clientCommandId - Client-side command identifier for idempotency
 * @param {number} expectedRevision - Expected state revision for optimistic concurrency
 * @param {string} decisionFrameHash - Hash of the decision frame for integrity check
 * @param {string} actionId - Action identifier from the legal action frame
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function submitAction(matchId, participantToken, clientCommandId, expectedRevision, decisionFrameHash, actionId, requestId) {
  return envelope('SUBMIT_ACTION', {
    matchId, participantToken, clientCommandId, expectedRevision, decisionFrameHash, actionId,
  }, requestId);
}

/**
 * Build a REQUEST_SYNC message.
 * @param {string} matchId - Match identifier
 * @param {string} participantToken - Participant authentication token
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function requestSync(matchId, participantToken, requestId) {
  return envelope('REQUEST_SYNC', { matchId, participantToken }, requestId);
}

/**
 * Build a LEAVE_MATCH message.
 * @param {string} matchId - Match identifier
 * @param {string} participantToken - Participant authentication token
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function leaveMatch(matchId, participantToken, requestId) {
  return envelope('LEAVE_MATCH', { matchId, participantToken }, requestId);
}

// ── Matchmaking queue message builders ──

/**
 * Build a QUEUE_JOIN message.
 * @param {string} profileId - Profile identifier
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function queueJoin(profileId, requestId) {
  return envelope('QUEUE_JOIN', { profileId }, requestId);
}

/**
 * Build a QUEUE_LEAVE message.
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function queueLeave(requestId) {
  return envelope('QUEUE_LEAVE', {}, requestId);
}

// ── Spectator message builders ──

/**
 * Build a SPECTATE_MATCH message.
 * @param {string} matchId - Match identifier
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function spectateMatch(matchId, requestId) {
  return envelope('SPECTATE_MATCH', { matchId }, requestId);
}

/**
 * Build a SPECTATE_LEAVE message.
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function spectateLeave(requestId) {
  return envelope('SPECTATE_LEAVE', {}, requestId);
}

/**
 * Build a SPECTATE_JOINED message.
 * @param {string} matchId - Match identifier
 * @param {Record<string, *>} view - Spectator view of the match
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function spectateJoined(matchId, view, requestId) {
  return envelope('SPECTATE_JOINED', { matchId, view }, requestId);
}

/**
 * Build a SPECTATE_LEFT message.
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function spectateLeft(requestId) {
  return envelope('SPECTATE_LEFT', {}, requestId);
}

/**
 * Build a QUEUE_JOINED message.
 * @param {number} position - Queue position
 * @param {number} estimatedWaitMs - Estimated wait time in milliseconds
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function queueJoined(position, estimatedWaitMs, requestId) {
  return envelope('QUEUE_JOINED', { position, estimatedWaitMs }, requestId);
}

/**
 * Build a QUEUE_LEFT message.
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function queueLeft(requestId) {
  return envelope('QUEUE_LEFT', {}, requestId);
}

/**
 * Build a QUEUE_MATCHED message.
 * @param {string} matchId - Match identifier
 * @param {string} participantToken - Participant authentication token
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function queueMatched(matchId, participantToken, requestId) {
  return envelope('QUEUE_MATCHED', { matchId, participantToken }, requestId);
}

// ── Match history ──

/**
 * Build a MATCH_HISTORY message.
 * @param {number} [limit] - Maximum number of results
 * @param {string} [status] - Filter by match status
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function matchHistory(limit, status, requestId) {
  return envelope('MATCH_HISTORY', { limit, status }, requestId);
}

/**
 * Build a MATCH_HISTORY_RESULT message.
 * @param {*[]} matches - Array of match history entries
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function matchHistoryResult(matches, requestId) {
  return envelope('MATCH_HISTORY_RESULT', { matches }, requestId);
}

// ── Server → Client message builders ──

/**
 * Build a MATCH_CREATED message.
 * @param {string} matchId - Match identifier
 * @param {string} inviteCode - Invite code for other participants
 * @param {string} participantToken - Participant authentication token
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function matchCreated(matchId, inviteCode, participantToken, requestId) {
  return envelope('MATCH_CREATED', { matchId, inviteCode, participantToken }, requestId);
}

/**
 * Build a MATCH_JOINED message.
 * @param {string} matchId - Match identifier
 * @param {string} participantToken - Participant authentication token
 * @param {number} seat - Seat number assigned to the participant
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function matchJoined(matchId, participantToken, seat, requestId) {
  return envelope('MATCH_JOINED', { matchId, participantToken, seat }, requestId);
}

/**
 * Build a MATCH_VIEW message.
 * @param {string} matchId - Match identifier
 * @param {Record<string, *>} view - Current match view
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function matchView(matchId, view, requestId) {
  return envelope('MATCH_VIEW', { matchId, view }, requestId);
}

/**
 * Build an ACTION_RESULT message.
 * @param {string} matchId - Match identifier
 * @param {Record<string, *>} result - Action execution result
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function actionResult(matchId, result, requestId) {
  return envelope('ACTION_RESULT', { matchId, ...result }, requestId);
}

/**
 * Build a PARTICIPANT_STATUS message.
 * @param {string} matchId - Match identifier
 * @param {string} status - Participant status
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function participantStatus(matchId, status, requestId) {
  return envelope('PARTICIPANT_STATUS', { matchId, status }, requestId);
}

/**
 * Build a MATCH_STARTED message.
 * @param {string} matchId - Match identifier
 * @param {Record<string, *>} view - Initial match view
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function matchStarted(matchId, view, requestId) {
  return envelope('MATCH_STARTED', { matchId, view }, requestId);
}

/**
 * Build a MATCH_ENDED message.
 * @param {string} matchId - Match identifier
 * @param {string} reason - Reason the match ended
 * @param {?string} winner - Winner identifier or null
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function matchEnded(matchId, reason, winner, requestId) {
  return envelope('MATCH_ENDED', { matchId, reason, winner }, requestId);
}

/**
 * Sent after MATCH_ENDED to notify participants that a certified replay
 * is available for download. The replayUrl points to the HTTP endpoint.
 * @param {string} matchId - Match identifier
 * @param {string} replayUrl - URL to download the replay
 * @param {string} replayHash - Hash of the replay for integrity verification
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function replayAvailable(matchId, replayUrl, replayHash, requestId) {
  return envelope('REPLAY_AVAILABLE', { matchId, replayUrl, replayHash }, requestId);
}

/**
 * Response to GET_REPLAY — contains the full certified replay blob.
 * @param {string} matchId - Match identifier
 * @param {*} replay - Full certified replay blob
 * @param {string} replayHash - Hash of the replay for integrity verification
 * @param {string} [requestId] - Optional request correlation ID
 * @returns {ProtocolEnvelope}
 */
export function replayData(matchId, replay, replayHash, requestId) {
  return envelope('REPLAY_DATA', { matchId, replay, replayHash }, requestId);
}

/**
 * Build an ERROR message.
 * @param {string} code - Error reason code
 * @param {string} message - Human-readable error message
 * @param {string} [requestId] - Optional request correlation ID
 * @param {Record<string, *>} [details] - Optional error details
 * @returns {ProtocolEnvelope}
 */
export function error(code, message, requestId, details) {
  return envelope('ERROR', { code, message, ...(details ? { details } : {}) }, requestId);
}
