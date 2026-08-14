// ═══════════════════════════════════════════════════════════════
// workspaces/meta-report.js — /meta workspace: Competitive Meta Report
//
// A player-facing aggregate view of the current ranked meta.
// Shows tier distribution, rating statistics, activity metrics,
// and competitive health — all derived from the canonical
// leaderboard data via the existing fetchLeaderboard() RPC.
//
// The browser fetches up to 200 leaderboard entries (the max) and
// computes the meta report client-side using the pure domain module.
// The server-side RPC already ranked the rows; we only aggregate.
// ═══════════════════════════════════════════════════════════════

import { app, esc, pct } from '../state.js';
import { fetchLeaderboard } from '../play/ranked/leaderboard-data.js';
import { isSupabaseConfigured } from '../play/network/supabase-client.js';
import { buildMetaReport, formatTierPercentage } from '@intrilex/account-domain/meta-report';
import { RankTier } from '@intrilex/account-domain/rank-tier';

const TIER_LABELS = {
  [RankTier.INITIATE]: 'Initiate',
  [RankTier.CIPHER]: 'Cipher',
  [RankTier.WARDEN]: 'Warden',
  [RankTier.VANGUARD]: 'Vanguard',
  [RankTier.ASCENDANT]: 'Ascendant',
  [RankTier.PARAGON]: 'Paragon',
  [RankTier.SOVEREIGN]: 'Sovereign',
  [RankTier.INTRILEX]: 'Intrilex',
};

const TIER_COLORS = {
  [RankTier.INITIATE]: '#8b949e',
  [RankTier.CIPHER]: '#5ad7e8',
  [RankTier.WARDEN]: '#4ade80',
  [RankTier.VANGUARD]: '#fbbf24',
  [RankTier.ASCENDANT]: '#f97316',
  [RankTier.PARAGON]: '#ef4444',
  [RankTier.SOVEREIGN]: '#a855f7',
  [RankTier.INTRILEX]: '#ffd700',
};

const _state = {
  loading: true,
  error: null,
  report: null,
  available: true,
  seasonId: null,
  _loadId: 0,
};

function renderLoading() {
  return `<div class="meta-loading" data-testid="meta-loading" role="status" aria-live="polite">
    <p>Computing meta report…</p>
  </div>`;
}

function renderError(msg) {
  return `<div class="meta-error notice danger" data-testid="meta-error" role="alert">
    <strong>Meta report unavailable.</strong>
    <p class="mono">${esc(msg)}</p>
  </div>`;
}

function renderOffline() {
  return `<div class="meta-offline notice" data-testid="meta-offline">
    <strong>Offline mode.</strong>
    <p>The meta report requires an online connection to fetch leaderboard data.</p>
    <a class="btn btn-sm" href="#/auth" data-testid="meta-signin">Sign In</a>
  </div>`;
}

function renderEmpty() {
  return `<div class="meta-empty" data-testid="meta-empty">
    <span class="meta-empty-icon" aria-hidden="true">📊</span>
    <strong>The ladder is open.</strong>
    <p>No ranked players have qualified yet. Once players complete placements, the meta report will populate.</p>
  </div>`;
}

function renderTierDistribution(report) {
  const maxCount = Math.max(...report.tierDistribution.map(b => b.count), 1);
  const bars = report.tierDistribution.map(bucket => {
    const label = TIER_LABELS[bucket.tier] ?? bucket.tier;
    const color = TIER_COLORS[bucket.tier] ?? '#8b949e';
    const barWidth = bucket.count > 0 ? Math.max(2, (bucket.count / maxCount) * 100) : 0;
    return `<div class="meta-tier-row" data-testid="meta-tier-row" data-tier="${esc(bucket.tier)}">
      <span class="meta-tier-label" style="color:${color}">${esc(label)}</span>
      <div class="meta-tier-bar-container">
        <div class="meta-tier-bar" style="width:${barWidth}%;background:${color}" role="img" aria-label="${bucket.count} players in ${label}"></div>
      </div>
      <span class="meta-tier-count">${bucket.count}</span>
      <span class="meta-tier-pct">${formatTierPercentage(bucket)}</span>
    </div>`;
  }).join('');
  return `<div class="meta-tier-distribution" data-testid="meta-tier-distribution">
    <h3 class="meta-section-title">Tier Distribution</h3>
    <div class="meta-tier-list">${bars}</div>
  </div>`;
}

function renderStatCards(report) {
  const cards = [
    { label: 'Ranked Players', value: report.totalPlayers, testid: 'meta-stat-players' },
    { label: 'Rated Games', value: report.totalGames, testid: 'meta-stat-games' },
    { label: 'Average IR', value: report.avgRating, testid: 'meta-stat-avg-rating' },
    { label: 'Median IR', value: report.medianRating, testid: 'meta-stat-median-rating' },
    { label: 'Active (10+ games)', value: report.activePlayerCount, testid: 'meta-stat-active' },
    { label: 'Apex (Intrilex)', value: report.apexCount, testid: 'meta-stat-apex' },
    { label: 'Rating Spread', value: report.ratingSpread, testid: 'meta-stat-spread' },
    { label: 'Avg Win Rate', value: pct(report.avgWinRate), testid: 'meta-stat-winrate' },
  ];
  return `<div class="meta-stat-grid" data-testid="meta-stat-grid">
    ${cards.map(c => `<div class="meta-stat-card" data-testid="${c.testid}">
      <span class="meta-stat-label">${esc(c.label)}</span>
      <span class="meta-stat-value">${esc(String(c.value))}</span>
    </div>`).join('')}
  </div>`;
}

function renderHealthBadge(report) {
  const healthClass = `meta-health-${report.competitiveHealth.toLowerCase()}`;
  return `<span class="meta-health-badge ${healthClass}" data-testid="meta-health-badge">${esc(report.competitiveHealth)}</span>`;
}

function renderContent() {
  if (_state.loading) return renderLoading();
  if (!_state.available) return renderOffline();
  if (_state.error) return renderError(_state.error);
  if (!_state.report || _state.report.totalPlayers === 0) return renderEmpty();

  const r = _state.report;
  return `<div class="meta-summary" data-testid="meta-summary">
    <p class="meta-summary-text" data-testid="meta-summary-text">${esc(r.summary)}</p>
    ${renderHealthBadge(r)}
  </div>
  ${renderStatCards(r)}
  ${renderTierDistribution(r)}
  <div class="meta-footer" data-testid="meta-footer">
    <p>Report generated from ${r.totalPlayers} ranked players${r.seasonId ? ` · Season ${esc(r.seasonId)}` : ''}. All statistics are deterministic and derived from the canonical leaderboard.</p>
  </div>`;
}

export async function renderMetaReport() {
  app.innerHTML = `<section class="panel meta-panel" data-testid="meta-panel">
    <div class="panel-header meta-header">
      <div>
        <h2 data-testid="meta-title">META REPORT</h2>
        <p class="meta-subtitle" data-testid="meta-subtitle">Competitive landscape — tier distribution, rating statistics, and activity metrics.</p>
      </div>
    </div>
    <div class="panel-body meta-body" data-testid="meta-body">
      ${renderContent()}
    </div>
  </section>`;

  const body = app.querySelector('[data-testid="meta-body"]');
  if (!body) return;

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
    // Fetch the maximum leaderboard (200 entries) for the most complete meta
    const { available, entries, seasonId } = await fetchLeaderboard({
      limit: 200, offset: 0, signal: undefined,
    });
    if (loadId !== _state._loadId) return; // stale
    _state.available = available;
    _state.seasonId = seasonId;
    _state.report = buildMetaReport(entries, { seasonId });
  } catch (err) {
    if (loadId !== _state._loadId) return;
    _state.error = err?.message ?? 'Failed to compute meta report';
  } finally {
    if (loadId === _state._loadId) {
      _state.loading = false;
      body.innerHTML = renderContent();
    }
  }
}
