// ═══════════════════════════════════════════════════════════════
// workspaces/human-tournaments.js — /tournaments workspace
//
// Player-facing human tournament discovery. Lists available
// tournaments from the match server, shows registration status,
// and allows players to register. Also renders a bracket viewer
// when a tournament is selected.
//
// This is distinct from the AI-vs-AI /tournament workspace which
// runs simulated brackets. This workspace connects to the live
// match server's TOURNAMENT_LIST / TOURNAMENT_GET / TOURNAMENT_REGISTER
// handlers.
// ═══════════════════════════════════════════════════════════════

import { app, esc, state } from '../state.js?v=75c53031ef21';
import { isSupabaseConfigured } from '../play/network/supabase-client.js?v=75c53031ef21';
import { renderTournamentBroadcast } from './tournament-broadcast.mjs?v=75c53031ef21';

const _state = {
  loading: true,
  error: null,
  tournaments: [],
  selectedTournament: null,
  selectedLoading: false,
  registering: false,
  registerResult: null,
  available: true,
  _loadId: 0,
};

const STATUS_LABELS = {
  SCHEDULED: 'Scheduled',
  REGISTRATION: 'Open Registration',
  IN_PROGRESS: 'In Progress',
  FINALIZING: 'Finalizing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS = {
  SCHEDULED: '#8b949e',
  REGISTRATION: '#5ad7e8',
  IN_PROGRESS: '#4ade80',
  FINALIZING: '#fbbf24',
  COMPLETED: '#a855f7',
  CANCELLED: '#ef4444',
};

function renderLoading() {
  return `<div class="ht-loading" data-testid="ht-loading" role="status" aria-live="polite">
    <p>Loading tournaments…</p>
  </div>`;
}

function renderError(msg) {
  return `<div class="ht-error notice danger" data-testid="ht-error" role="alert">
    <strong>Tournament list unavailable.</strong>
    <p class="mono">${esc(msg)}</p>
  </div>`;
}

function renderOffline() {
  return `<div class="ht-offline notice" data-testid="ht-offline">
    <strong>Offline mode.</strong>
    <p>Human tournaments require a connection to the Intrilex match server. Sign in and connect to view and register for tournaments.</p>
    <a class="btn btn-sm" href="#/auth" data-testid="ht-signin">Sign In</a>
  </div>`;
}

function renderEmpty() {
  return `<div class="ht-empty" data-testid="ht-empty">
    <span class="ht-empty-icon" aria-hidden="true">🏆</span>
    <strong>No active tournaments.</strong>
    <p>Tournaments are organized periodically. Check back soon or follow announcements for the next event.</p>
  </div>`;
}

function renderTournamentCard(t) {
  const color = STATUS_COLORS[t.status] ?? '#8b949e';
  const label = STATUS_LABELS[t.status] ?? t.status;
  const isRegistration = t.status === 'REGISTRATION';
  const isFull = t.registeredPlayers >= t.maxPlayers;
  const formatLabel = t.format === 'SINGLE_ELIM' ? 'Single Elim' : t.format === 'SWISS' ? 'Swiss' : t.format;
  return `<div class="ht-card" data-testid="ht-card" data-tournament-id="${esc(t.tournamentId)}">
    <div class="ht-card-header">
      <div>
        <h3 class="ht-card-name" data-testid="ht-card-name">${esc(t.name)}</h3>
        <div class="ht-card-meta">
          <span class="ht-card-format">${esc(formatLabel)}</span>
          <span class="ht-card-bestof">Bo${esc(t.bestOf)}</span>
          <span class="ht-card-players">${t.registeredPlayers}/${t.maxPlayers} players</span>
        </div>
      </div>
      <span class="ht-status-badge" style="color:${color};border-color:${color}40;background:${color}15" data-testid="ht-status-badge">${esc(label)}</span>
    </div>
    <div class="ht-card-footer">
      <span class="ht-card-date">${esc(formatDate(t.createdAt))}</span>
      ${isRegistration ? `<button class="ht-register-btn primary-button" data-tournament-id="${esc(t.tournamentId)}" data-testid="ht-register-btn" ${isFull ? 'disabled' : ''}>${isFull ? 'Full' : 'Register'}</button>` : ''}
      <button class="ht-view-btn secondary-button" data-tournament-id="${esc(t.tournamentId)}" data-testid="ht-view-btn">Details</button>
    </div>
  </div>`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function renderTournamentList() {
  if (_state.tournaments.length === 0) return renderEmpty();
  const cards = _state.tournaments.map(renderTournamentCard).join('');
  return `<div class="ht-grid" data-testid="ht-grid">${cards}</div>`;
}

function renderBracketMatch(m) {
  const statusLabel = m.status === 'COMPLETED' ? 'Done' : m.status === 'IN_PROGRESS' ? 'Live' : m.status === 'BYE' ? 'BYE' : 'Pending';
  const winnerA = m.winnerId === m.playerAId && m.status === 'COMPLETED';
  const winnerB = m.winnerId === m.playerBId && m.status === 'COMPLETED';
  const playerA = _state.selectedTournament?.players?.find(p => p.publicPlayerId === m.playerAId);
  const playerB = _state.selectedTournament?.players?.find(p => p.publicPlayerId === m.playerBId);
  return `<div class="ht-bracket-match" data-testid="ht-bracket-match">
    <div class="ht-bracket-round">R${m.round}</div>
    <div class="ht-bracket-players">
      <div class="ht-bracket-player ${winnerA ? 'ht-bracket-winner' : ''}">
        <span>${playerA ? esc(playerA.displayName) : m.playerAId ? esc(m.playerAId.slice(0, 8)) : '—'}</span>
        ${m.scoreA != null ? `<span class="ht-bracket-score">${m.scoreA}</span>` : ''}
      </div>
      <div class="ht-bracket-player ${winnerB ? 'ht-bracket-winner' : ''}">
        <span>${playerB ? esc(playerB.displayName) : m.playerBId ? esc(m.playerBId.slice(0, 8)) : '—'}</span>
        ${m.scoreB != null ? `<span class="ht-bracket-score">${m.scoreB}</span>` : ''}
      </div>
    </div>
    <span class="ht-bracket-status ht-bracket-status-${m.status.toLowerCase()}">${statusLabel}</span>
  </div>`;
}

function renderTournamentDetail() {
  const t = _state.selectedTournament;
  if (!t) return '';
  const formatLabel = t.format === 'SINGLE_ELIM' ? 'Single Elimination' : t.format === 'SWISS' ? 'Swiss' : t.format;
  const statusLabel = STATUS_LABELS[t.status] ?? t.status;
  const statusColor = STATUS_COLORS[t.status] ?? '#8b949e';
  const matches = t.matches ?? [];
  const sortedMatches = [...matches].sort((a, b) => a.round - b.round || a.matchId.localeCompare(b.matchId));
  const isRegistration = t.status === 'REGISTRATION';
  const isFull = (t.players?.length ?? 0) >= t.maxPlayers;

  return `<div class="ht-detail" data-testid="ht-detail">
    <button class="ht-back-btn secondary-button" data-testid="ht-back-btn">← Back to list</button>
    <div class="ht-detail-header">
      <div>
        <h2 class="ht-detail-name" data-testid="ht-detail-name">${esc(t.name)}</h2>
        <div class="ht-detail-meta">
          <span>${esc(formatLabel)}</span>
          <span>Best of ${esc(t.bestOf)}</span>
          <span>${t.players?.length ?? 0}/${t.maxPlayers} players</span>
          ${t.swissRounds ? `<span>${t.swissRounds} Swiss rounds</span>` : ''}
        </div>
      </div>
      <span class="ht-status-badge" style="color:${statusColor};border-color:${statusColor}40;background:${statusColor}15">${esc(statusLabel)}</span>
    </div>
    ${isRegistration ? `<div class="ht-detail-register" data-testid="ht-detail-register">
      ${_state.registerResult?.success ? `<div class="notice"><strong>Registered!</strong> You are seed #${_state.registerResult.seed}. ${_state.registerResult.registeredPlayers}/${_state.registerResult.maxPlayers} players registered.</div>` : ''}
      ${_state.registerResult && !_state.registerResult.success ? `<div class="notice warning"><strong>Registration failed:</strong> ${esc(_state.registerResult.error)}</div>` : ''}
      <button class="ht-register-btn primary-button" data-tournament-id="${esc(t.tournamentId)}" data-testid="ht-detail-register-btn" ${_state.registering || isFull ? 'disabled' : ''}>${_state.registering ? 'Registering…' : isFull ? 'Tournament Full' : 'Register for Tournament'}</button>
    </div>` : ''}
    ${matches.length > 0 ? `<div class="ht-bracket" data-testid="ht-bracket">
      <h3 class="ht-section-title">Bracket</h3>
      <div class="ht-bracket-list">${sortedMatches.map(renderBracketMatch).join('')}</div>
    </div>` : '<p class="ht-no-matches">Matches will be generated when the tournament starts.</p>'}
    ${(() => {
      // V3: Show broadcast view for in-progress matches
      const liveMatch = sortedMatches.find(m => m.status === 'IN_PROGRESS');
      if (!liveMatch) return '';
      const playerA = t.players?.find(p => p.playerId === liveMatch.playerAId) ?? {};
      const playerB = t.players?.find(p => p.playerId === liveMatch.playerBId) ?? {};
      return renderTournamentBroadcast({
        tournament: { name: t.name, status: t.status },
        match: { matchId: liveMatch.matchId, status: liveMatch.status },
        playerA: { name: playerA.displayName ?? 'Player A', rating: playerA.rating ?? 0, tier: playerA.tier ?? '' },
        playerB: { name: playerB.displayName ?? 'Player B', rating: playerB.rating ?? 0, tier: playerB.tier ?? '' },
        round: liveMatch.round,
        totalRounds: t.swissRounds ?? 1,
        eventFeed: [],
        spectatorCount: 0,
      });
    })()}
    ${t.players && t.players.length > 0 ? `<div class="ht-participants" data-testid="ht-participants">
      <h3 class="ht-section-title">Participants (${t.players.length})</h3>
      <div class="ht-participant-list">${t.players.map(p => `<span class="ht-participant">${esc(p.displayName)}${p.handle ? ` <small>@${esc(p.handle)}</small>` : ''} <span class="ht-seed">#${p.seed}</span></span>`).join('')}</div>
    </div>` : ''}
  </div>`;
}

function renderContent() {
  if (_state.selectedTournament) return renderTournamentDetail();
  if (_state.loading) return renderLoading();
  if (!_state.available) return renderOffline();
  if (_state.error) return renderError(_state.error);
  return renderTournamentList();
}

export async function renderHumanTournaments() {
  app.innerHTML = `<section class="panel ht-panel" data-testid="ht-panel">
    <div class="panel-header ht-header">
      <div>
        <h2 data-testid="ht-title">TOURNAMENTS</h2>
        <p class="ht-subtitle" data-testid="ht-subtitle">Human ranked tournaments — register, compete, and climb the bracket.</p>
      </div>
    </div>
    <div class="panel-body ht-body" data-testid="ht-body">
      ${renderContent()}
    </div>
  </section>`;

  const body = app.querySelector('[data-testid="ht-body"]');
  if (!body) return;

  if (_state.selectedTournament) {
    wireDetailButtons(body);
  } else {
    wireListButtons(body);
    if (!_state.loading && _state.available && !_state.error) {
      loadTournaments(body);
    }
  }
}

async function loadTournaments(body) {
  const loadId = ++_state._loadId;
  _state.loading = true;
  _state.error = null;

  if (!isSupabaseConfigured()) {
    _state.available = false;
    _state.loading = false;
    body.innerHTML = renderContent();
    wireListButtons(body);
    return;
  }

  const session = state.networkSession;
  if (!session) {
    _state.available = false;
    _state.loading = false;
    body.innerHTML = renderContent();
    wireListButtons(body);
    return;
  }

  try {
    const tournaments = await session.requestTournamentList(20, null);
    if (loadId !== _state._loadId) return;
    _state.tournaments = tournaments ?? [];
    _state.available = tournaments !== null;
  } catch (err) {
    if (loadId !== _state._loadId) return;
    _state.error = err?.message ?? 'Failed to load tournaments';
  } finally {
    if (loadId === _state._loadId) {
      _state.loading = false;
      body.innerHTML = renderContent();
      wireListButtons(body);
    }
  }
}

async function loadTournamentDetail(tournamentId, body) {
  _state.selectedLoading = true;
  _state.selectedTournament = null;
  _state.registerResult = null;
  body.innerHTML = renderContent();

  const session = state.networkSession;
  if (!session) {
    body.innerHTML = '<div class="notice danger">Not connected to server.</div>';
    return;
  }

  try {
    const t = await session.requestTournamentGet(tournamentId);
    _state.selectedTournament = t;
  } catch (err) {
    body.innerHTML = `<div class="notice danger">Failed to load tournament: ${esc(err.message)}</div>`;
    return;
  } finally {
    _state.selectedLoading = false;
    body.innerHTML = renderContent();
    wireDetailButtons(body);
  }
}

async function handleRegister(tournamentId, body) {
  _state.registering = true;
  _state.registerResult = null;
  body.innerHTML = renderContent();
  wireDetailButtons(body);

  const session = state.networkSession;
  if (!session) {
    _state.registerResult = { success: false, error: 'Not connected to server' };
    _state.registering = false;
    body.innerHTML = renderContent();
    wireDetailButtons(body);
    return;
  }

  try {
    const result = await session.requestTournamentRegister(tournamentId);
    _state.registerResult = result;
    if (result.success) {
      // Reload tournament details to get updated player list
      _state.selectedLoading = true;
      body.innerHTML = renderContent();
      wireDetailButtons(body);
      try {
        const updated = await session.requestTournamentGet(tournamentId);
        if (updated) _state.selectedTournament = updated;
      } catch (reloadErr) {
        console.warn('[tournaments] failed to reload after registration:', reloadErr?.message ?? reloadErr);
      } finally {
        _state.selectedLoading = false;
      }
    }
  } catch (err) {
    _state.registerResult = { success: false, error: err.message };
  } finally {
    _state.registering = false;
    body.innerHTML = renderContent();
    wireDetailButtons(body);
  }
}

function wireListButtons(body) {
  for (const btn of body.querySelectorAll('[data-testid="ht-view-btn"]')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-tournament-id');
      _state.selectedTournament = null;
      loadTournamentDetail(id, body);
    });
  }
  for (const btn of body.querySelectorAll('[data-testid="ht-register-btn"]')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-tournament-id');
      // Load detail first, then register
      loadTournamentDetail(id, body).then(() => {
        if (_state.selectedTournament) handleRegister(id, body);
      });
    });
  }
}

function wireDetailButtons(body) {
  const backBtn = body.querySelector('[data-testid="ht-back-btn"]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      _state.selectedTournament = null;
      _state.registerResult = null;
      app.innerHTML = `<section class="panel ht-panel" data-testid="ht-panel">
        <div class="panel-header ht-header"><div><h2 data-testid="ht-title">TOURNAMENTS</h2><p class="ht-subtitle" data-testid="ht-subtitle">Human ranked tournaments — register, compete, and climb the bracket.</p></div></div>
        <div class="panel-body ht-body" data-testid="ht-body">${renderContent()}</div>
      </section>`;
      const newBody = app.querySelector('[data-testid="ht-body"]');
      if (newBody) { wireListButtons(newBody); loadTournaments(newBody); }
    });
  }
  const regBtn = body.querySelector('[data-testid="ht-detail-register-btn"]');
  if (regBtn) {
    regBtn.addEventListener('click', () => {
      const id = regBtn.getAttribute('data-tournament-id');
      handleRegister(id, body);
    });
  }
}

/**
 * Reset the tournament workspace state — called when navigating away.
 */
export function destroyHumanTournaments() {
  _state.selectedTournament = null;
  _state.registerResult = null;
  _state.registering = false;
  _state.loading = true;
  _state.error = null;
  _state.tournaments = [];
}
