// ═══════════════════════════════════════════════════════════════
// network-lobby-renderer.mjs — Online Direct Duel lobby renderer.
//
// Pure functions: session state → HTML string.
// Renders the lobby hub, create/join screens, waiting room,
// reconnection dialog, and connection-error states.
//
// NEVER receives raw engine state, seed, RNG, or commands.
// Only reads NetworkPlaySession public fields.
// ═══════════════════════════════════════════════════════════════

import { NetworkSessionState } from './network-session.mjs';
import { loadProfile } from '../local-profile.mjs';
import { ratingToTierDivision, RankTier } from '@intrilex/account-domain/rank-tier';
import { renderRankGlyph, rankLabel } from '../rank/rank-glyph.js';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Render a versus card for the local player showing their rank glyph + name +
 * tier. Opponent rank is added when their rating is known (server-supplied).
 * @param {object} [overrides] - { displayName, opponentDisplayName, opponentRating, opponentRatedMatches }
 * @returns {string} HTML
 */
function renderVersusCard(overrides = {}) {
  let local = null;
  try { local = loadProfile(); } catch { /* no profile */ }
  const localName = overrides.displayName ?? local?.displayName ?? 'You';
  const localRating = local?.rating;
  const localAssignment = localRating
    ? ratingToTierDivision(localRating.value, { ratedMatches: localRating.ratedMatches })
    : null;
  const localGlyph = localAssignment
    ? renderRankGlyph({ tier: localAssignment.tier, division: localAssignment.division, size: 72, showDivision: true, decorative: true, className: 'versus-glyph' })
    : renderRankGlyph({ tier: RankTier.UNRANKED, size: 72, decorative: true, className: 'versus-glyph' });
  const localTier = localAssignment
    ? (localAssignment.isPlacement ? 'Unranked' : rankLabel(localAssignment.tier, localAssignment.division))
    : 'Unranked';

  const oppName = overrides.opponentDisplayName ?? 'Opponent';
  const oppAssignment = (typeof overrides.opponentRating === 'number')
    ? ratingToTierDivision(overrides.opponentRating, { ratedMatches: overrides.opponentRatedMatches ?? 5 })
    : null;
  const oppGlyph = oppAssignment
    ? renderRankGlyph({ tier: oppAssignment.tier, division: oppAssignment.division, size: 72, showDivision: true, decorative: true, className: 'versus-glyph' })
    : renderRankGlyph({ tier: RankTier.UNRANKED, size: 72, decorative: true, className: 'versus-glyph' });
  const oppTier = oppAssignment
    ? (oppAssignment.isPlacement ? 'Unranked' : rankLabel(oppAssignment.tier, oppAssignment.division))
    : 'Waiting…';

  return `<div class="network-versus" data-testid="network-versus" aria-label="Versus">
    <div class="network-versus-side">
      ${localGlyph}
      <span class="network-versus-name">${esc(localName)}</span>
      <span class="network-versus-tier">${esc(localTier)}</span>
    </div>
    <span class="network-versus-sep" aria-hidden="true">VS</span>
    <div class="network-versus-side">
      ${oppGlyph}
      <span class="network-versus-name">${esc(oppName)}</span>
      <span class="network-versus-tier">${esc(oppTier)}</span>
    </div>
  </div>`;
}

/**
 * Render the online Direct Duel lobby hub — entry point for network play.
 * Shows create/join options and reconnection prompt if a saved match exists.
 * @param {object} options — { serverUrl, hasSavedMatch, savedMatchInfo, serverReachable }
 * @returns {string} HTML
 */
export function renderNetworkLobby(options = {}) {
  const serverUrl = options.serverUrl ?? '';
  const hasSavedMatch = options.hasSavedMatch ?? false;
  const savedMatchInfo = options.savedMatchInfo ?? null;
  const serverReachable = options.serverReachable;
  const connecting = options.connecting ?? false;

  const serverStatus = connecting
    ? `<span class="network-server-status connecting" data-testid="network-server-status">Connecting…</span>`
    : serverReachable === true
      ? `<span class="network-server-status online" data-testid="network-server-status">● Online</span>`
      : serverReachable === false
        ? `<span class="network-server-status offline" data-testid="network-server-status">● Offline</span>`
        : `<span class="network-server-status unknown" data-testid="network-server-status">● Unknown</span>`;

  const reconnectCard = hasSavedMatch && savedMatchInfo
    ? `<div class="network-reconnect-card" data-testid="network-reconnect-card">
        <h2>Reconnect to Match</h2>
        <p>You have an in-progress online match.</p>
        <p class="network-reconnect-detail">Match: <code>${esc(savedMatchInfo.matchId?.slice(0, 12) ?? '—')}…</code></p>
        <button class="primary-button" data-testid="network-reconnect" data-action="network-reconnect">Reconnect</button>
        <button class="text-button" data-testid="network-abandon" data-action="network-abandon">Abandon match</button>
      </div>`
    : '';

  return `<div class="network-lobby" data-testid="network-lobby">
    <a class="play-hub-back" href="#/play" aria-label="Back to Play hub">← Back</a>
    <h1 class="network-lobby-title">Direct Duel <span class="network-lobby-badge">Online</span></h1>
    <p class="network-lobby-subtitle">Play a server-authoritative 1v1 match against a remote human opponent. Share an invite code to start.</p>
    <div class="network-server-info" data-testid="network-server-info">
      <span class="network-server-label">Authority server:</span>
      <code class="network-server-url" data-testid="network-server-url">${esc(serverUrl)}</code>
      ${serverStatus}
    </div>
    ${reconnectCard}
    <div class="network-lobby-grid">
      <button class="play-hub-card network-lobby-card" data-testid="network-create" data-action="network-create">
        <span class="play-hub-icon" aria-hidden="true">⚔</span>
        <strong>Create Duel</strong>
        <p>Start a new match and invite an opponent with a code.</p>
      </button>
      <button class="play-hub-card network-lobby-card" data-testid="network-join" data-action="network-join">
        <span class="play-hub-icon" aria-hidden="true">🔗</span>
        <strong>Join with Code</strong>
        <p>Enter a 6-character invite code from a friend.</p>
      </button>
      <button class="play-hub-card network-lobby-card" data-testid="network-queue" data-action="network-queue">
        <span class="play-hub-icon" aria-hidden="true">🎯</span>
        <strong>Find Match</strong>
        <p>Auto-pair with a random opponent from the queue.</p>
      </button>
      <button class="play-hub-card network-lobby-card" data-testid="network-spectate" data-action="network-spectate">
        <span class="play-hub-icon" aria-hidden="true">👁</span>
        <strong>Spectate</strong>
        <p>Watch a live match by entering a Match ID.</p>
      </button>
      <button class="play-hub-card network-lobby-card" data-testid="network-history" data-action="network-history">
        <span class="play-hub-icon" aria-hidden="true">📜</span>
        <strong>Match History</strong>
        <p>Browse recent matches and spectate completed games.</p>
      </button>
    </div>
    <div class="network-lobby-notice">
      <p>All gameplay is server-authoritative. The server owns the engine, RNG, and command vault. Your client only receives authorized views and submits action IDs.</p>
    </div>
  </div>`;
}

/**
 * Render the "create duel" screen — shows the invite code and waiting room.
 * @param {object} session — NetworkPlaySession instance
 * @param {object} options — { error }
 * @returns {string} HTML
 */
export function renderNetworkCreateWaiting(session, options = {}) {
  const inviteCode = session?.inviteCode ?? '';
  const matchId = session?.matchId ?? '';
  const opponentConnected = session?.opponentConnectionState === 'CONNECTED';
  const isReady = session?.status === NetworkSessionState.READY;
  const error = options.error ?? null;

  const opponentStatus = opponentConnected
    ? `<span class="network-opponent-status connected" data-testid="network-opponent-status">● Opponent connected</span>`
    : `<span class="network-opponent-status waiting" data-testid="network-opponent-status">○ Waiting for opponent…</span>`;

  const readyButton = isReady
    ? `<button class="primary-button" disabled data-testid="network-ready">✓ Ready</button>`
    : opponentConnected
      ? `<button class="primary-button" data-testid="network-ready" data-action="network-ready">Mark Ready</button>`
      : `<button class="primary-button" disabled data-testid="network-ready" aria-disabled="true">Mark Ready</button>`;

  return `<div class="network-waiting" data-testid="network-waiting">
    <a class="play-hub-back" href="#/play/online" aria-label="Back to lobby">← Cancel</a>
    <h1>Waiting for Opponent</h1>
    ${renderVersusCard()}
    <div class="network-invite-card" data-testid="network-invite-card">
      <h2>Invite Code</h2>
      <div class="network-invite-code" data-testid="network-invite-code" role="textbox" aria-readonly="true" aria-label="Invite code">${esc(inviteCode)}</div>
      <button class="secondary-button" data-testid="network-copy-invite" data-action="network-copy-invite">Copy code</button>
      <p class="network-invite-hint">Share this code with your opponent. They can join via “Join with Code.”</p>
    </div>
    <div class="network-waiting-status" data-testid="network-waiting-status">
      ${opponentStatus}
    </div>
    ${error ? `<div class="network-error" role="alert" data-testid="network-error">${esc(error)}</div>` : ''}
    <div class="network-waiting-actions">
      ${readyButton}
      <button class="text-button" data-testid="network-leave" data-action="network-leave">Leave match</button>
    </div>
    <p class="network-match-id" data-testid="network-match-id">Match ID: <code>${esc(matchId)}</code></p>
  </div>`;
}

/**
 * Render the "join with code" form.
 * @param {object} options — { error, connecting }
 * @returns {string} HTML
 */
export function renderNetworkJoinForm(options = {}) {
  const error = options.error ?? null;
  const connecting = options.connecting ?? false;

  return `<div class="network-join" data-testid="network-join-form">
    <a class="play-hub-back" href="#/play/online" aria-label="Back to lobby">← Back</a>
    <h1>Join with Code</h1>
    <p class="network-join-subtitle">Enter the 6-character invite code from your opponent.</p>
    <form id="network-join-form-element" data-testid="network-join-form-element">
      <input
        type="text"
        name="inviteCode"
        class="network-invite-input"
        data-testid="network-invite-input"
        placeholder="ABC123"
        maxlength="8"
        pattern="[A-Za-z0-9]{6,8}"
        autocomplete="off"
        spellcheck="false"
        aria-label="Invite code"
        required
        ${connecting ? 'disabled' : ''}
      >
      <button type="submit" class="primary-button" data-testid="network-join-submit" ${connecting ? 'disabled' : ''}>
        ${connecting ? 'Joining…' : 'Join Match'}
      </button>
    </form>
    ${error ? `<div class="network-error" role="alert" data-testid="network-error">${esc(error)}</div>` : ''}
    <div class="network-join-help">
      <p>The invite code is 6 characters, letters and numbers. Ask your opponent to share it with you.</p>

    </div>
  </div>`;
}

/**
 * Render the "join waiting room" — after joining, before ready.
 * Shows opponent status and ready button.
 * @param {object} session — NetworkPlaySession instance
 * @param {object} options — { error }
 * @returns {string} HTML
 */
export function renderNetworkJoinWaiting(session, options = {}) {
  const matchId = session?.matchId ?? '';
  const isReady = session?.status === NetworkSessionState.READY;
  const opponentConnected = session?.opponentConnectionState === 'CONNECTED';
  const error = options.error ?? null;

  const opponentStatus = opponentConnected
    ? `<span class="network-opponent-status connected" data-testid="network-opponent-status">● Opponent connected</span>`
    : `<span class="network-opponent-status waiting" data-testid="network-opponent-status">○ Waiting for opponent…</span>`;

  const readyButton = isReady
    ? `<button class="primary-button" disabled data-testid="network-ready">✓ Ready</button>`
    : `<button class="primary-button" data-testid="network-ready" data-action="network-ready">Mark Ready</button>`;

  return `<div class="network-waiting" data-testid="network-join-waiting">
    <a class="play-hub-back" href="#/play/online" aria-label="Back to lobby">← Cancel</a>
    <h1>Joined Match</h1>
    ${renderVersusCard()}
    <p class="network-joined-seat">You are <strong data-testid="network-seat">${esc(session?.playerId ?? '—')}</strong></p>
    <div class="network-waiting-status" data-testid="network-waiting-status">
      ${opponentStatus}
    </div>
    ${error ? `<div class="network-error" role="alert" data-testid="network-error">${esc(error)}</div>` : ''}
    <div class="network-waiting-actions">
      ${readyButton}
      <button class="text-button" data-testid="network-leave" data-action="network-leave">Leave match</button>
    </div>
    <p class="network-match-id" data-testid="network-match-id">Match ID: <code>${esc(matchId)}</code></p>
  </div>`;
}

/**
 * Render the connection-lost / reconnect dialog.
 * Shown when the WebSocket drops mid-match.
 * @param {object} options — { matchId, canReconnect }
 * @returns {string} HTML
 */
export function renderNetworkReconnectDialog(options = {}) {
  const matchId = options.matchId ?? '';
  const canReconnect = options.canReconnect ?? true;

  return `<div class="network-reconnect-dialog" role="dialog" aria-modal="true" aria-label="Connection lost" data-testid="network-reconnect-dialog">
    <div class="network-reconnect-content">
      <h2>Connection Lost</h2>
      <p>Your connection to the authority server was interrupted.</p>
      <p class="network-reconnect-detail">Match: <code>${esc(matchId?.slice(0, 12) ?? '—')}…</code></p>
      <div class="network-reconnect-actions">
        ${canReconnect
          ? `<button class="primary-button" data-testid="network-reconnect-now" data-action="network-reconnect-now">Reconnect now</button>`
          : `<span class="network-reconnect-timer" data-testid="network-reconnect-timer">Reconnecting…</span>`}
        <button class="text-button" data-testid="network-forfeit" data-action="network-forfeit">Forfeit and leave</button>
      </div>
    </div>
  </div>`;
}

/**
 * Render a network error screen — for connection failures, server unreachable, etc.
 * @param {object} options — { title, message, canRetry }
 * @returns {string} HTML
 */
export function renderNetworkError(options = {}) {
  const title = options.title ?? 'Network Error';
  const message = options.message ?? 'An unexpected error occurred.';
  const canRetry = options.canRetry ?? true;

  return `<div class="network-error-screen" data-testid="network-error-screen" role="alert">
    <a class="play-hub-back" href="#/play/online" aria-label="Back to lobby">← Back</a>
    <h1>${esc(title)}</h1>
    <p class="network-error-message">${esc(message)}</p>
    <div class="network-error-actions">
      ${canRetry ? `<button class="primary-button" data-testid="network-retry" data-action="network-retry">Try again</button>` : ''}
      <a href="#/play" class="secondary-button">Back to Play</a>
    </div>
  </div>`;
}

/**
 * Render a network status banner for the active match board.
 * Shows opponent connection state during gameplay.
 * @param {object} session — NetworkPlaySession instance
 * @returns {string} HTML
 */
export function renderNetworkStatusBanner(session) {
  if (!session) return '';
  const oppState = session.opponentConnectionState;
  if (oppState === 'DISCONNECTED') {
    return `<div class="network-status-banner opponent-disconnected" role="status" data-testid="network-status-banner">
      <span>⚠ Opponent disconnected — waiting for reconnect…</span>
    </div>`;
  }
  return '';
}

/**
 * Render the matchmaking queue waiting screen.
 * Shows queue position and estimated wait time.
 * @param {object} options — { position, estimatedWaitMs, error }
 * @returns {string} HTML
 */
export function renderNetworkQueueWaiting(options = {}) {
  const position = options.position ?? 1;
  const estimatedWaitMs = options.estimatedWaitMs ?? 5000;
  const estimatedWaitSec = Math.ceil(estimatedWaitMs / 1000);
  const error = options.error ?? null;

  return `<div class="network-queue-waiting" data-testid="network-queue-waiting">
    <a class="play-hub-back" href="#/play/online" aria-label="Back to lobby">← Cancel</a>
    <h1>Finding Match…</h1>
    <div class="network-queue-spinner" data-testid="network-queue-spinner" aria-label="Searching for opponent">
      <span class="network-queue-spinner-icon">🎯</span>
    </div>
    <div class="network-queue-info" data-testid="network-queue-info">
      <p class="network-queue-position" data-testid="network-queue-position">Position in queue: <strong>${position}</strong></p>
      <p class="network-queue-eta" data-testid="network-queue-eta">Estimated wait: ~${estimatedWaitSec}s</p>
    </div>
    ${error ? `<div class="network-error" role="alert" data-testid="network-error">${esc(error)}</div>` : ''}
    <div class="network-queue-actions">
      <button class="text-button" data-testid="network-queue-leave" data-action="network-queue-leave">Cancel matchmaking</button>
    </div>
    <p class="network-queue-hint">You'll be automatically paired with the next available opponent.</p>
  </div>`;
}

/**
 * Render the spectate match form — enter a Match ID to spectate.
 * @param {object} options — { error, connecting }
 * @returns {string} HTML
 */
export function renderNetworkSpectateForm(options = {}) {
  const error = options.error ?? null;
  const connecting = options.connecting ?? false;

  return `<div class="network-spectate" data-testid="network-spectate-form">
    <a class="play-hub-back" href="#/play/online" aria-label="Back to lobby">← Back</a>
    <h1>Spectate Match</h1>
    <p class="network-spectate-subtitle">Enter a Match ID to watch a live game (read-only).</p>
    <form id="network-spectate-form-element" data-testid="network-spectate-form-element">
      <input
        type="text"
        name="matchId"
        class="network-spectate-input"
        data-testid="network-spectate-input"
        placeholder="M-abc123def456"
        autocomplete="off"
        spellcheck="false"
        aria-label="Match ID"
        required
        ${connecting ? 'disabled' : ''}
      >
      <button type="submit" class="primary-button" data-testid="network-spectate-submit" ${connecting ? 'disabled' : ''}>
        ${connecting ? 'Connecting…' : 'Spectate'}
      </button>
    </form>
    ${error ? `<div class="network-error" role="alert" data-testid="network-error">${esc(error)}</div>` : ''}
    <div class="network-spectate-help">
      <p>Spectators see a read-only view of the match. You cannot submit actions. The Match ID is shown to players when they create or join a match.</p>
    </div>
  </div>`;
}

/**
 * Render the spectating view — shows the match from a spectator perspective.
 * @param {object} options — { matchId, view, error }
 * @returns {string} HTML
 */
export function renderNetworkSpectating(options = {}) {
  const matchId = options.matchId ?? '';
  const view = options.view ?? null;
  const error = options.error ?? null;
  const status = view?.status ?? '—';
  const phase = view?.match?.phase ?? '—';
  const activePlayer = view?.match?.activePlayerId ?? '—';
  const winner = view?.match?.winner ?? null;

  return `<div class="network-spectating" data-testid="network-spectating">
    <a class="play-hub-back" href="#/play/online" aria-label="Back to lobby">← Leave</a>
    <h1>Spectating <span class="network-spectating-badge">Read-only</span></h1>
    <div class="network-spectating-info" data-testid="network-spectating-info">
      <p>Match ID: <code>${esc(matchId?.slice(0, 16) ?? '—')}</code></p>
      <p>Status: <strong data-testid="network-spectating-status">${esc(status)}</strong></p>
      <p>Phase: <span data-testid="network-spectating-phase">${esc(phase)}</span></p>
      <p>Active player: <span data-testid="network-spectating-active">${esc(activePlayer)}</span></p>
      ${winner ? `<p class="network-spectating-winner" data-testid="network-spectating-winner">Winner: <strong>${esc(winner)}</strong></p>` : ''}
    </div>
    ${error ? `<div class="network-error" role="alert" data-testid="network-error">${esc(error)}</div>` : ''}
    <div class="network-spectating-actions">
      <button class="text-button" data-testid="network-spectate-leave" data-action="network-spectate-leave">Stop spectating</button>
    </div>
    <div class="network-spectating-notice">
      <p>You are watching this match in read-only mode. The view is the same as Player 1's authorized view — no hidden information is exposed.</p>
    </div>
  </div>`;
}

/**
 * Render the match history / replay browser screen.
 * Shows a list of recent matches with status, creation time, and a spectate button.
 * @param {object} options — { matches, loading, error }
 * @returns {string} HTML
 */
export function renderNetworkMatchHistory(options = {}) {
  const matches = options.matches ?? [];
  const loading = options.loading ?? false;
  const error = options.error ?? null;

  const matchList = loading
    ? `<div class="network-history-loading" data-testid="network-history-loading">Loading match history…</div>`
    : matches.length === 0
      ? `<div class="network-history-empty" data-testid="network-history-empty">
          <p>No matches found. Create or join a match to see it here.</p>
        </div>`
      : `<div class="network-history-list" data-testid="network-history-list">
          ${matches.map(m => {
            const ageSec = Math.floor((Date.now() - m.updatedAt) / 1000);
            const ageStr = ageSec < 60 ? `${ageSec}s ago`
              : ageSec < 3600 ? `${Math.floor(ageSec / 60)}m ago`
              : ageSec < 86400 ? `${Math.floor(ageSec / 3600)}h ago`
              : `${Math.floor(ageSec / 86400)}d ago`;
            const canSpectate = m.status === 'RUNNING' || m.status === 'TERMINAL';
            return `<div class="network-history-item" data-testid="network-history-item">
              <div class="network-history-item-info">
                <code class="network-history-match-id">${esc(m.matchId?.slice(0, 16) ?? '—')}</code>
                <span class="network-history-status status-${esc(m.status?.toLowerCase() ?? 'unknown')}">${esc(m.status)}</span>
                <span class="network-history-age">${esc(ageStr)}</span>
                <span class="network-history-players">${m.participants?.length ?? 0} players</span>
              </div>
              <div class="network-history-item-actions">
                ${canSpectate
                  ? `<button class="secondary-button" data-testid="network-history-spectate" data-match-id="${esc(m.matchId)}">Spectate</button>`
                  : `<span class="network-history-no-spectate">Not spectatable</span>`}
              </div>
            </div>`;
          }).join('')}
        </div>`;

  return `<div class="network-history" data-testid="network-history">
    <a class="play-hub-back" href="#/play/online" aria-label="Back to lobby">← Back</a>
    <h1>Match History</h1>
    <p class="network-history-subtitle">Recent matches on this server. Spectate any running or completed match.</p>
    ${error ? `<div class="network-error" role="alert" data-testid="network-error">${esc(error)}</div>` : ''}
    ${matchList}
    <div class="network-history-actions">
      <button class="text-button" data-testid="network-history-refresh" data-action="network-history-refresh">Refresh</button>
    </div>
  </div>`;
}
