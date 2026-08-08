// ═══════════════════════════════════════════════════════════════
// network-protocol-client.mjs — Browser-safe protocol builders
//
// Lightweight client-side message constructors.
// No Node.js dependencies — uses only standard Web APIs.
// ═══════════════════════════════════════════════════════════════

const PROTOCOL_VERSION = 1;

let _nextId = 0;
function nextRequestId() {
  return `req-${Date.now().toString(36)}-${(_nextId++).toString(36)}`;
}

function envelope(type, payload) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type,
    requestId: nextRequestId(),
    payload,
  };
}

export function createMatch(profileId) {
  return envelope('CREATE_MATCH', { profileId });
}

export function joinMatch(inviteCode) {
  return envelope('JOIN_MATCH', { inviteCode });
}

export function resumeMatch(matchId, participantToken) {
  return envelope('RESUME_MATCH', { matchId, participantToken });
}

export function ready(matchId, participantToken) {
  return envelope('READY', { matchId, participantToken });
}

export function submitAction(matchId, participantToken, clientCommandId, expectedRevision, decisionFrameHash, actionId) {
  return envelope('SUBMIT_ACTION', {
    matchId, participantToken, clientCommandId, expectedRevision, decisionFrameHash, actionId,
  });
}

export function requestSync(matchId, participantToken) {
  return envelope('REQUEST_SYNC', { matchId, participantToken });
}

export function leaveMatch(matchId, participantToken) {
  return envelope('LEAVE_MATCH', { matchId, participantToken });
}

export function queueJoin(profileId) {
  return envelope('QUEUE_JOIN', { profileId });
}

export function queueLeave() {
  return envelope('QUEUE_LEAVE', {});
}

export function spectateMatch(matchId) {
  return envelope('SPECTATE_MATCH', { matchId });
}

export function spectateLeave() {
  return envelope('SPECTATE_LEAVE', {});
}

export function matchHistory(limit = 20, status = null) {
  return envelope('MATCH_HISTORY', { limit, status });
}

export { PROTOCOL_VERSION };
