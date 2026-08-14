// ═══════════════════════════════════════════════════════════════
// replay-library.js — Local replay library management
// Stores completed match replays with certified verification.
// Supports public (sanitized) and private (full) export.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from './hash.js?v=73b458295383';
import { listReplays,   putReplay} from './persistence.js?v=73b458295383';

/**
 * Create a replay record from a completed session.
 * @param {PlaySession} session - The completed session
 * @returns {Promise<object>} The replay record
 */
export async function createReplayRecord(session) {
  const certifiedReplay = await session.createCertifiedReplay();
  const publicView = await session.createPublicReplay(certifiedReplay);

  const replayId = `R-${session.sessionId}`;
  const record = {
    replayId,
    sessionId: session.sessionId,
    completedAt: new Date().toISOString(),
    profileId: session.setup.profileId,
    mode: session.setup.mode,
    seed: session.setup.seed,
    humanPlayerId: session.setup.humanPlayerId,
    aiPolicyId: session.setup.aiPolicyId,
    winner: session.winner,
    terminationReason: session.terminalReason,
    fullTurnSequence: session.state?.fullTurnSequence ?? 0,
    decisionCount: session.decisionJournal.length,
    certifiedReplay,
    publicView,
    certifiedReplayHash: certifiedReplay.integrityHash,
    publicViewHash: publicView.publicContentHash,
    contentHash: hashCanonical({
      sessionId: session.sessionId,
      winner: session.winner,
      terminationReason: session.terminalReason,
      certifiedReplayHash: certifiedReplay.integrityHash,
    }),
  };

  return record;
}

/**
 * Save a replay record to IndexedDB.
 */
export async function saveReplay(record) {
  return putReplay(record);
}

/**
 * Verify a replay record's certified replay.
 * @returns {Promise<object>} { valid, error }
 */
export async function verifyReplayRecord(record) {
  try {
    const { verifyCertifiedReplay } = await import('../engine/browser-entry.js?v=73b458295383');
    verifyCertifiedReplay(record.certifiedReplay);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Create a replay record from a completed network session.
 * Fetches the certified replay from the server via NetworkPlaySession.getReplay().
 * @param {NetworkPlaySession} session - The completed network session
 * @returns {Promise<object|null>} The replay record, or null if replay unavailable
 */
export async function createNetworkReplayRecord(session) {
  const certifiedReplay = await session.getReplay();
  if (!certifiedReplay) return null;

  const replayId = `R-${session.matchId}`;
  const record = {
    replayId,
    sessionId: session.matchId,
    completedAt: new Date().toISOString(),
    profileId: null, // Network matches don't have a fixed profileId
    mode: 'network-duel',
    seed: null, // Seed is hidden from clients in network matches
    humanPlayerId: session.playerId,
    aiPolicyId: null,
    winner: session.currentView?.match?.winner ?? null,
    terminationReason: session.currentView?.match?.terminationReason ?? null,
    fullTurnSequence: session.currentView?.match?.fullTurnSequence ?? 0,
    decisionCount: 0, // Not tracked for network sessions
    certifiedReplay,
    publicView: null, // Network replays don't have a public view (server controls visibility)
    certifiedReplayHash: certifiedReplay.integrityHash ?? session.replayHash ?? null,
    publicViewHash: null,
    contentHash: hashCanonical({
      sessionId: session.matchId,
      winner: session.currentView?.match?.winner ?? null,
      certifiedReplayHash: certifiedReplay.integrityHash ?? session.replayHash ?? null,
    }),
    isNetworkMatch: true,
  };

  return record;
}

/**
 * Export a replay as a downloadable JSON file.
 * @param {object} record - The replay record
 * @param {string} kind - 'private' or 'public'
 * @returns {string} JSON string
 */
export function exportReplayJSON(record, kind = 'private') {
  if (kind === 'public') {
    return JSON.stringify({
      format: 'intrilex-public-replay-export',
      version: 1,
      replayId: record.replayId,
      completedAt: record.completedAt,
      profileId: record.profileId,
      winner: record.winner,
      publicView: record.publicView,
      publicViewHash: record.publicViewHash,
    }, null, 2);
  }
  return JSON.stringify({
    format: 'intrilex-private-replay-export',
    version: 1,
    replayId: record.replayId,
    completedAt: record.completedAt,
    profileId: record.profileId,
    seed: record.seed,
    humanPlayerId: record.humanPlayerId,
    aiPolicyId: record.aiPolicyId,
    winner: record.winner,
    certifiedReplay: record.certifiedReplay,
    certifiedReplayHash: record.certifiedReplayHash,
  }, null, 2);
}

/**
 * Trigger a browser download of a replay.
 */
export function downloadReplay(record, kind = 'private') {
  const json = exportReplayJSON(record, kind);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${kind === 'public' ? 'public' : 'private'}-replay-${record.replayId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * List all replays with summary info (for the library UI).
 */
export async function listReplaySummaries() {
  const records = await listReplays();
  return records.map(r => ({
    replayId: r.replayId,
    completedAt: r.completedAt,
    profileId: r.profileId,
    mode: r.mode,
    winner: r.winner,
    humanPlayerId: r.humanPlayerId,
    terminationReason: r.terminationReason,
    fullTurnSequence: r.fullTurnSequence,
    decisionCount: r.decisionCount,
    aiPolicyId: r.aiPolicyId,
    certified: Boolean(r.certifiedReplayHash),
  }));
}

/**
 * Render the replay library UI.
 */
export function renderReplayLibrary(summaries, options = {}) {
  if (!summaries || summaries.length === 0) {
    return `<div class="replay-library" data-testid="replay-library">
      <a class="play-hub-back" href="#/" aria-label="Back to home">← Back</a>
      <h1>Replay Library</h1>
      <p class="replay-empty">No completed matches yet. Play a match to build your library.</p>
      <a href="#/" class="secondary-button">Back to Home</a>
    </div>`;
  }

  const rows = summaries.map(s => {
    const isHumanWin = s.winner === (s.humanPlayerId ?? 'P1');
    const verified = s.certified ? '<span class="verified-badge" aria-label="Certified verified">✓</span>' : '';
    const resultLabel = isHumanWin ? 'Win' : s.winner ? 'Loss' : 'Draw';
    const resultClass = isHumanWin ? 'result-win' : s.winner ? 'result-loss' : 'result-draw';
    return `<tr data-replay-id="${esc(s.replayId)}" data-testid="replay-row" class="clickable-row" data-watch-replay="${esc(s.replayId)}">
      <td>${esc(new Date(s.completedAt).toLocaleDateString())}</td>
      <td>${esc(s.profileId === 'first-contact-trigger-closure' ? 'First Contact' : 'Advanced Core')}</td>
      <td class="${resultClass}"><strong>${resultLabel}</strong></td>
      <td>${esc(s.fullTurnSequence ?? 0)}</td>
      <td>${esc(s.decisionCount ?? 0)}</td>
      <td>${esc(s.aiPolicyId ?? '—')}</td>
      <td>${verified}</td>
      <td class="replay-actions">
        <button class="secondary-button" data-action="watch-replay" data-replay-id="${esc(s.replayId)}">Watch</button>
        <button class="secondary-button" data-action="export-private" data-replay-id="${esc(s.replayId)}">Export private</button>
        <button class="secondary-button" data-action="export-public" data-replay-id="${esc(s.replayId)}">Export public</button>
        <button class="secondary-button danger" data-action="delete-replay" data-replay-id="${esc(s.replayId)}">Delete</button>
      </td>
    </tr>`;
  }).join('');

  return `<div class="replay-library" data-testid="replay-library">
    <a class="play-hub-back" href="#/" aria-label="Back to home">← Back</a>
    <h1>Replay Library</h1>
    <table class="replay-table" data-testid="replay-table">
      <thead>
        <tr><th>Date</th><th>Profile</th><th>Result</th><th>Turns</th><th>Decisions</th><th>AI</th><th>Verified</th><th>Actions</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <a href="#/" class="secondary-button">Back to Home</a>
  </div>`;
}

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
