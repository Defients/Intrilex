// ═══════════════════════════════════════════════════════════════
// network-protocol-client.mjs — Browser-safe protocol builders
//
// Lightweight client-side message constructors.
// No Node.js dependencies — uses only standard Web APIs.
// ═══════════════════════════════════════════════════════════════

const PROTOCOL_VERSION = 2;

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

export function queueJoin(profileId, queueId = 'ranked') {
  return envelope('QUEUE_JOIN', { profileId, queueId });
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

export function listSpectatable() {
  return envelope('LIST_SPECTATABLE', {});
}

export function matchHistory(limit = 20, status = null) {
  return envelope('MATCH_HISTORY', { limit, status });
}

export function sendChat(matchId, participantToken, text) {
  return envelope('SEND_CHAT', { matchId, participantToken, text });
}

export function chatVisibility(matchId, participantToken, hidden) {
  return envelope('CHAT_VISIBILITY', { matchId, participantToken, hidden });
}

export function rematch(matchId, participantToken) {
  return envelope('REMATCH', { matchId, participantToken });
}

// ── Tournament (v0.28.0 — Epoch 7) ──

export function tournamentList(limit = 20, status = null) {
  return envelope('TOURNAMENT_LIST', { limit, status });
}

export function tournamentGet(tournamentId) {
  return envelope('TOURNAMENT_GET', { tournamentId });
}

export function tournamentRegister(tournamentId) {
  return envelope('TOURNAMENT_REGISTER', { tournamentId });
}

export function tournamentStart(tournamentId) {
  return envelope('TOURNAMENT_START', { tournamentId });
}

export function tournamentReportResult(tournamentId, matchId, winnerId, scoreA, scoreB, matchRef = null) {
  return envelope('TOURNAMENT_REPORT_RESULT', { tournamentId, matchId, winnerId, scoreA, scoreB, matchRef });
}

export function reportPlayer(reportedPlayerId, reasonCode, description = null, matchRef = null) {
  return envelope('REPORT_PLAYER', { reportedPlayerId, reasonCode, description, matchRef });
}

// ── Auth handshake (v2) ──

export function authenticate(accessToken) {
  return envelope('AUTHENTICATE', { accessToken });
}

export function authRefresh(accessToken) {
  return envelope('AUTH_REFRESH', { accessToken });
}

// ── Guest migration (v2) ──

export function migrateGuest(sourceIdentity, targetIdentity, achievements) {
  return envelope('MIGRATE_GUEST', { sourceIdentity, targetIdentity, achievements });
}

export { PROTOCOL_VERSION };
