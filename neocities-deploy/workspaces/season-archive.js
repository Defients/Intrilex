// ═══════════════════════════════════════════════════════════════
// workspaces/season-archive.js — /seasons workspace: Season Archive
//
// A player-facing summary of all past ranked seasons. Shows each
// season's name, dates, status, and a link to view the full
// leaderboard for that season. The active season is highlighted.
//
// Uses the existing fetchSeasons() RPC from leaderboard-data.js.
// The actual standings are viewed via the leaderboard overlay's
// season picker — this page is an index/summary.
// ═══════════════════════════════════════════════════════════════

import { app, esc } from '../state.js?v=42162e3d88b3';
import { fetchSeasons } from '../play/ranked/leaderboard-data.js?v=42162e3d88b3';
import { isSupabaseConfigured } from '../play/network/supabase-client.js?v=42162e3d88b3';
import { SeasonStatus } from "../account-domain/seasons.mjs";

const _state = {
  loading: true,
  error: null,
  seasons: [],
  available: true,
  _loadId: 0,
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return iso; }
}

function formatSeasonDuration(startsAt, endsAt) {
  if (!startsAt || !endsAt) return '';
  try {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const days = Math.round((end - start) / 86400000);
    if (days > 0) return `${days} days`;
  } catch { /* ignore */ }
  return '';
}

function statusBadge(status) {
  switch (status) {
    case SeasonStatus.ACTIVE: return '<span class="season-archive-badge season-archive-active">Active</span>';
    case SeasonStatus.UPCOMING: return '<span class="season-archive-badge season-archive-upcoming">Upcoming</span>';
    case SeasonStatus.FINALIZING: return '<span class="season-archive-badge season-archive-finalizing">Finalizing</span>';
    case SeasonStatus.ARCHIVED: return '<span class="season-archive-badge season-archive-archived">Archived</span>';
    default: return '';
  }
}

function renderSeasonCard(s) {
  const duration = formatSeasonDuration(s.startsAt, s.endsAt);
  const isArchived = s.status === SeasonStatus.ARCHIVED;
  const isActive = s.status === SeasonStatus.ACTIVE;
  const viewLink = (isArchived || isActive)
    ? `<a class="season-archive-view-link" href="#/leaderboard" data-season-id="${esc(s.seasonId)}" data-testid="season-archive-view">View Leaderboard →</a>`
    : '';

  return `<div class="season-archive-card season-archive-${esc(s.status.toLowerCase())}" data-testid="season-archive-card" data-season-id="${esc(s.seasonId)}">
    <div class="season-archive-card-header">
      <div>
        <h3 class="season-archive-name" data-testid="season-archive-name">${esc(s.name)}</h3>
        <div class="season-archive-dates">
          <span data-testid="season-archive-start">${formatDate(s.startsAt)}</span>
          <span aria-hidden="true"> → </span>
          <span data-testid="season-archive-end">${formatDate(s.endsAt)}</span>
          ${duration ? `<span class="season-archive-duration">· ${esc(duration)}</span>` : ''}
        </div>
      </div>
      ${statusBadge(s.status)}
    </div>
    <div class="season-archive-card-footer">
      <span class="season-archive-ordinal">Season ${esc(s.ordinal)}</span>
      ${viewLink}
    </div>
  </div>`;
}

function renderLoading() {
  return `<div class="season-archive-loading" data-testid="season-archive-loading" role="status" aria-live="polite">
    <p>Loading season archive…</p>
  </div>`;
}

function renderError(msg) {
  return `<div class="season-archive-error notice danger" data-testid="season-archive-error" role="alert">
    <strong>Season archive temporarily unavailable.</strong>
    <p class="mono">${esc(msg)}</p>
  </div>`;
}

function renderOffline() {
  return `<div class="season-archive-offline notice" data-testid="season-archive-offline">
    <strong>Offline mode.</strong>
    <p>Season archive requires an online connection. Connect to Intrilex Online to view past season standings.</p>
    <a class="btn btn-sm" href="#/auth" data-testid="season-archive-signin">Sign In</a>
  </div>`;
}

function renderEmpty() {
  return `<div class="season-archive-empty" data-testid="season-archive-empty">
    <span class="season-archive-empty-icon" aria-hidden="true">🏆</span>
    <strong>No seasons yet.</strong>
    <p>The first ranked season is still underway. Archived seasons will appear here after they conclude.</p>
  </div>`;
}

function renderContent() {
  if (_state.loading) return renderLoading();
  if (!_state.available) return renderOffline();
  if (_state.error) return renderError(_state.error);
  if (_state.seasons.length === 0) return renderEmpty();

  const sorted = [..._state.seasons].sort((a, b) => {
    // Active first, then by ordinal descending
    if (a.status === SeasonStatus.ACTIVE && b.status !== SeasonStatus.ACTIVE) return -1;
    if (b.status === SeasonStatus.ACTIVE && a.status !== SeasonStatus.ACTIVE) return 1;
    return (b.ordinal ?? 0) - (a.ordinal ?? 0);
  });

  const cards = sorted.map(renderSeasonCard).join('');
  const activeCount = sorted.filter(s => s.status === SeasonStatus.ACTIVE).length;
  const archivedCount = sorted.filter(s => s.status === SeasonStatus.ARCHIVED).length;

  return `<div class="season-archive-summary" data-testid="season-archive-summary">
    <span data-testid="season-archive-count">${sorted.length} season${sorted.length === 1 ? '' : 's'}</span>
    ${activeCount > 0 ? `<span class="season-archive-count-active">${activeCount} active</span>` : ''}
    ${archivedCount > 0 ? `<span class="season-archive-count-archived">${archivedCount} archived</span>` : ''}
  </div>
  <div class="season-archive-grid" data-testid="season-archive-grid">
    ${cards}
  </div>`;
}

export async function renderSeasonArchive() {
  app.innerHTML = `<section class="panel season-archive-panel" data-testid="season-archive-panel">
    <div class="panel-header season-archive-header">
      <div>
        <h2 data-testid="season-archive-title">SEASON ARCHIVE</h2>
        <p class="season-archive-subtitle" data-testid="season-archive-subtitle">Past ranked seasons — champions, standings, and history.</p>
      </div>
    </div>
    <div class="panel-body season-archive-body" data-testid="season-archive-body">
      ${renderContent()}
    </div>
  </section>`;

  const body = app.querySelector('[data-testid="season-archive-body"]');
  if (!body) return;

  // Load seasons
  const loadId = ++_state._loadId;
  _state.loading = true;
  _state.error = null;

  if (!isSupabaseConfigured()) {
    _state.available = false;
    _state.loading = false;
    body.innerHTML = renderContent();
    return;
  }

  try {
    const { available, seasons } = await fetchSeasons('ranked');
    if (loadId !== _state._loadId) return; // stale
    _state.available = available;
    _state.seasons = seasons;
  } catch (err) {
    if (loadId !== _state._loadId) return;
    _state.error = err?.message ?? 'Failed to load season archive';
  } finally {
    if (loadId === _state._loadId) {
      _state.loading = false;
      body.innerHTML = renderContent();
      wireSeasonLinks(body);
    }
  }
}

function wireSeasonLinks(container) {
  for (const link of container.querySelectorAll('[data-season-id]')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // Store the selected season in sessionStorage so the leaderboard
      // overlay can pick it up when it loads.
      const seasonId = link.getAttribute('data-season-id');
      try { sessionStorage.setItem('intrilex:lb-season', seasonId); } catch { /* ignore */ }
      // Navigate to the leaderboard overlay
      location.hash = '#/leaderboard';
    });
  }
}
