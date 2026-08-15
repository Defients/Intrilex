// ═══════════════════════════════════════════════════════════════
// workspaces/leaderboard.js — /leaderboard workspace
//
// The canonical Ranked leaderboard. ONE prestigious board (section 73).
// Server-side ranking via RPCs — the browser never sorts the full table.
//
// Features: Top 100, My Rank (outside Top 100), search, tier filter,
// season picker (active + archives), top-3 emphasis, empty state,
// loading skeletons, error isolation, responsive collapse, accessibility
// (semantic table, aria-sort, keyboard, reduced motion, textual tier names).
// ═══════════════════════════════════════════════════════════════

import { app, esc, pct } from '../state.js?v=9ea1c2f9e91d';
import { renderRankGlyph, rankLabel } from '../play/rank/rank-glyph.js?v=9ea1c2f9e91d';
import { RankTier } from "../account-domain/rank-tier.mjs";
import { apexLabel, LeaderboardType } from "../account-domain/leaderboard.mjs";
import {
  fetchLeaderboard, fetchPlayerStanding, fetchSeasons,
} from '../play/ranked/leaderboard-data.js?v=9ea1c2f9e91d';

const TIER_FILTERS = [
  { value: 'ALL', label: 'All Tiers' },
  { value: RankTier.INITIATE, label: 'Initiate' },
  { value: RankTier.CIPHER, label: 'Cipher' },
  { value: RankTier.WARDEN, label: 'Warden' },
  { value: RankTier.VANGUARD, label: 'Vanguard' },
  { value: RankTier.ASCENDANT, label: 'Ascendant' },
  { value: RankTier.PARAGON, label: 'Paragon' },
  { value: RankTier.SOVEREIGN, label: 'Sovereign' },
  { value: RankTier.INTRILEX, label: 'Intrilex' },
];

// Module-level view state (persists across re-renders within a session)
const view = {
  seasonId: null,      // null = active season
  tier: 'ALL',
  search: '',
  seasons: [],
  loading: true,
  error: null,
  entries: [],
  standing: null,
  standingAvailable: false,
  available: true,
  _searchTimer: null,
  _mounted: false,
  _loadId: 0,          // monotonic request ID — stale responses are ignored
  _wiredTarget: null,  // tracks which element has delegation listeners
  _abortCtrl: null,    // AbortController for in-flight requests — aborted on new load
};

/**
 * Render the leaderboard workspace.
 * @param {HTMLElement} [root]
 */
export function renderLeaderboard(root) {
  const target = root ?? app;
  // Clear any pending search timer and abort in-flight requests from a previous visit
  clearTimeout(view._searchTimer);
  view._searchTimer = null;
  if (view._abortCtrl) { view._abortCtrl.abort(); view._abortCtrl = null; }
  view._mounted = true;
  target.innerHTML = renderShell();
  wireEvents(target);
  load(target);
}

/**
 * Teardown — clears pending timers and marks the view as unmounted.
 * Call when navigating away from the leaderboard workspace to prevent
 * stale timer callbacks and memory leaks.
 */
export function destroyLeaderboard() {
  clearTimeout(view._searchTimer);
  view._searchTimer = null;
  view._mounted = false;
  // Abort any in-flight requests
  if (view._abortCtrl) {
    view._abortCtrl.abort();
    view._abortCtrl = null;
  }
}

// ── Shell ──

function renderShell() {
  return `<section class="panel lb-panel" data-testid="leaderboard-panel">
    <div class="panel-header lb-header">
      <div>
        <h2 data-testid="leaderboard-title">RANKED</h2>
        <p class="lb-subtitle" data-testid="leaderboard-subtitle">Season Leaderboard</p>
      </div>
      <div class="lb-season-picker">
        <label for="lb-season" class="lb-visually-hidden">Season</label>
        <select id="lb-season" class="lb-select" data-testid="lb-season-select" aria-label="Season picker"></select>
      </div>
    </div>
    <div class="panel-body lb-body">
      <div class="lb-controls">
        <div class="lb-search-wrap">
          <input type="search" id="lb-search" class="lb-search" placeholder="Search player…"
            aria-label="Search leaderboard by player name or handle"
            autocomplete="off" spellcheck="false" data-testid="lb-search" />
        </div>
        <div class="lb-filter-wrap">
          <label for="lb-tier" class="lb-visually-hidden">Tier filter</label>
          <select id="lb-tier" class="lb-select" data-testid="lb-tier-select" aria-label="Filter by tier">
            ${TIER_FILTERS.map(t => `<option value="${t.value}">${esc(t.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="lb-summary" data-testid="lb-summary" aria-live="polite"></div>
      <div class="lb-content" data-testid="lb-content" aria-busy="true"></div>
    </div>
  </section>`;
}

// ── Data loading ──

async function load(target) {
  const loadId = ++view._loadId;
  // Abort any previous in-flight requests
  if (view._abortCtrl) view._abortCtrl.abort();
  const abortCtrl = new AbortController();
  view._abortCtrl = abortCtrl;
  const signal = abortCtrl.signal;

  view.loading = true;
  view.error = null;
  renderContent(target);
  try {
    // Load seasons for the picker (once)
    if (view.seasons.length === 0) {
      try {
        const { available, seasons } = await fetchSeasons('ranked', signal);
        if (loadId !== view._loadId) return; // stale
        view.available = view.available && available;
        view.seasons = seasons;
      } catch { /* seasons optional */ }
    }
    if (loadId !== view._loadId) return; // stale
    renderSeasonPicker(target);

    // Load leaderboard + standing in parallel
    const [lbRes, standRes] = await Promise.allSettled([
      fetchLeaderboard({ seasonId: view.seasonId, tier: view.tier, search: view.search, limit: 100, offset: 0, signal }),
      fetchPlayerStanding({ seasonId: view.seasonId, signal }),
    ]);

    // Ignore stale responses — a newer load() has been triggered
    if (loadId !== view._loadId) return;

    if (lbRes.status === 'fulfilled') {
      view.available = lbRes.value.available;
      view.entries = lbRes.value.entries;
    } else {
      view.error = lbRes.reason?.message ?? 'Leaderboard query failed';
    }
    if (standRes.status === 'fulfilled') {
      view.standing = standRes.value.standing;
      view.standingAvailable = standRes.value.available;
    } else {
      view.standing = null;
    }
  } catch (err) {
    if (loadId !== view._loadId) return; // stale
    view.error = err?.message ?? 'Leaderboard temporarily unavailable.';
  } finally {
    if (loadId === view._loadId) {
      view.loading = false;
      renderContent(target);
      renderSummary(target);
    }
  }
}

// ── Rendering ──

function renderSeasonPicker(target) {
  const sel = target.querySelector('#lb-season');
  if (!sel) return;
  const opts = [];
  if (view.seasons.length === 0) {
    opts.push('<option value="">Active Season</option>');
  } else {
    for (const s of view.seasons) {
      const tag = s.status === 'ACTIVE' ? ' (Active)' : s.status === 'ARCHIVED' ? ' (Archived)' : '';
      const selected = (view.seasonId === s.seasonId) || (view.seasonId === null && s.status === 'ACTIVE');
      opts.push(`<option value="${esc(s.seasonId)}"${selected ? ' selected' : ''}>${esc(s.name)}${esc(tag)}</option>`);
    }
  }
  sel.innerHTML = opts.join('');
}

function renderSummary(target) {
  const el = target.querySelector('[data-testid="lb-summary"]');
  if (!el) return;
  if (view.standing) {
    const s = view.standing;
    const label = s.rank.isApex ? apexLabel(s.position) : rankLabel(s.rank.tier, s.rank.division);
    el.innerHTML = `<div class="lb-my-rank-summary" data-testid="lb-my-rank-summary">
      <span class="lb-my-rank-label">Your Rank:</span>
      <strong>#${esc(String(s.position))}</strong>
      <span class="lb-my-rank-detail">${esc(label)} · ${s.rank.rating} IR</span>
    </div>`;
  } else if (view.standingAvailable) {
    el.innerHTML = `<div class="lb-my-rank-summary"><span class="lb-my-rank-label">Your Rank:</span>
      <span class="lb-my-rank-detail">Complete placements to enter the ladder.</span></div>`;
  } else {
    el.innerHTML = '';
  }
}

function renderContent(target) {
  const el = target.querySelector('[data-testid="lb-content"]');
  if (!el) return;
  el.setAttribute('aria-busy', String(view.loading));

  if (view.loading) {
    el.innerHTML = renderSkeleton();
    return;
  }
  if (!view.available) {
    el.innerHTML = renderUnavailable();
    return;
  }
  if (view.error) {
    el.innerHTML = renderError(view.error);
    return;
  }
  if (view.entries.length === 0) {
    el.innerHTML = renderEmpty();
    return;
  }
  el.innerHTML = renderTable(view.entries);
}

function renderSkeleton() {
  const rows = Array.from({ length: 8 }, () =>
    `<div class="lb-skeleton-row" aria-hidden="true"><span class="lb-skeleton lb-sk-pos"></span><span class="lb-skeleton lb-sk-player"></span><span class="lb-skeleton lb-sk-rank"></span><span class="lb-skeleton lb-sk-ir"></span></div>`
  ).join('');
  return `<div class="lb-skeleton-wrap" role="status" aria-label="Loading leaderboard">${rows}</div>`;
}

function renderUnavailable() {
  return `<div class="lb-empty" data-testid="lb-unavailable">
    <strong>Leaderboard unavailable in local mode.</strong>
    <p>Connect to Intrilex Online to view the Ranked ladder. Your Ranked games are unaffected.</p>
  </div>`;
}

function renderError(msg) {
  return `<div class="lb-empty lb-error" role="alert" data-testid="lb-error">
    <strong>Leaderboard temporarily unavailable.</strong>
    <p>Your Ranked games are unaffected.</p>
    <p class="lb-error-detail mono">${esc(msg)}</p>
  </div>`;
}

function renderEmpty() {
  return `<div class="lb-empty" data-testid="lb-empty">
    <span class="lb-empty-icon" aria-hidden="true">◈</span>
    <strong>The ladder is open.</strong>
    <p>No Ranked players have qualified for this season yet.</p>
    <p>Complete your placements to claim a position.</p>
  </div>`;
}

function renderTable(entries) {
  const headerCells = [
    '<th scope="col" class="lb-col-pos">#</th>',
    '<th scope="col" class="lb-col-player">Player</th>',
    '<th scope="col" class="lb-col-rank" aria-sort="descending">Rank</th>',
    '<th scope="col" class="lb-col-ir">IR</th>',
    '<th scope="col" class="lb-col-wl">W–L</th>',
    '<th scope="col" class="lb-col-win">Win%</th>',
    '<th scope="col" class="lb-col-games">Games</th>',
  ].join('');

  const rows = entries.map((e, i) => renderRow(e, i < 3)).join('');
  const standingRow = view.standing && !entries.some(e => e.player.publicPlayerId === view.standing.player.publicPlayerId)
    ? `<tfoot><tr class="lb-row lb-row-self lb-row-standing" data-testid="lb-standing-row">
      ${renderRowCells(view.standing, true, true)}</tr></tfoot>` : '';

  return `<div class="lb-table-wrap" role="region" aria-label="Ranked leaderboard" tabindex="0">
    <table class="lb-table" data-testid="lb-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
      ${standingRow}
    </table>
  </div>`;
}

function renderRow(entry, isTop3) {
  const isSelf = view.standing && view.standing.player.publicPlayerId === entry.player.publicPlayerId;
  const classes = ['lb-row'];
  if (isTop3) classes.push('lb-row-top3', `lb-row-top${entry.position}`);
  if (isSelf) classes.push('lb-row-self');
  return `<tr class="${classes.join(' ')}" data-testid="lb-row" data-pid="${esc(entry.player.publicPlayerId)}" tabindex="0">
    ${renderRowCells(entry, isTop3, isSelf)}
  </tr>`;
}

function renderRowCells(entry, isTop3, isSelf) {
  const pos = entry.position;
  const glyphSize = isTop3 ? 56 : 36;
  const posLabel = isSelf ? `<span class="lb-you-badge" aria-label="This is you">YOU</span>#${pos}` : `#${pos}`;
  const apexPos = entry.rank.isApex ? apexLabel(pos) : null;
  const rankText = apexPos ?? rankLabel(entry.rank.tier, entry.rank.division);
  const glyph = renderRankGlyph({
    tier: entry.rank.tier, division: entry.rank.division, size: glyphSize,
    showDivision: true, decorative: true, className: isTop3 ? 'lb-glyph-top3' : '',
    leaderboardPosition: entry.rank.isApex ? `#${pos}` : undefined,
  });
  const name = esc(entry.player.displayName || 'Player');
  const handle = entry.player.handle ? `<span class="lb-handle">@${esc(entry.player.handle)}</span>` : '';
  const games = entry.record.games;
  const wl = `${entry.record.wins}–${entry.record.losses}${entry.record.draws ? `–${entry.record.draws}` : ''}`;
  const winPct = pct(entry.record.winRate);

  return `<td class="lb-col-pos" data-label="#">${posLabel}</td>
    <td class="lb-col-player" data-label="Player">
      <div class="lb-player-cell">
        <span class="lb-player-glyph" aria-hidden="true">${glyph}</span>
        <span class="lb-player-name"><span class="lb-name">${name}</span>${handle}</span>
      </div>
    </td>
    <td class="lb-col-rank" data-label="Rank">
      <span class="lb-rank-text" data-tier="${esc(entry.rank.tier)}">${esc(rankText)}</span>
    </td>
    <td class="lb-col-ir mono" data-label="IR">${entry.rank.rating}</td>
    <td class="lb-col-wl mono" data-label="W–L">${wl}</td>
    <td class="lb-col-win mono" data-label="Win%">${winPct}</td>
    <td class="lb-col-games mono" data-label="Games">${games}</td>`;
}

// ── Events ──

function wireEvents(target) {
  // Search (debounced)
  const search = target.querySelector('#lb-search');
  if (search) {
    search.addEventListener('input', () => {
      clearTimeout(view._searchTimer);
      view._searchTimer = setTimeout(() => {
        view.search = search.value;
        load(target);
      }, 300);
    });
  }
  // Tier filter
  const tier = target.querySelector('#lb-tier');
  if (tier) {
    tier.addEventListener('change', () => {
      view.tier = tier.value;
      load(target);
    });
  }
  // Season picker
  const season = target.querySelector('#lb-season');
  if (season) {
    season.addEventListener('change', () => {
      view.seasonId = season.value || null;
      load(target);
    });
  }
  // Target-level delegation listeners — add once per target to prevent accumulation
  if (view._wiredTarget !== target) {
    view._wiredTarget = target;
    // Row click → public profile (section 30)
    target.addEventListener('click', (ev) => {
      const row = ev.target.closest('[data-testid="lb-row"], [data-testid="lb-standing-row"]');
      if (!row) return;
      const pid = row.dataset.pid;
      if (pid) {
        location.hash = `#/player/${encodeURIComponent(pid)}`;
      }
    });
    // Keyboard activation for rows
    target.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const row = ev.target.closest('[data-testid="lb-row"], [data-testid="lb-standing-row"]');
      if (!row) return;
      ev.preventDefault();
      const pid = row.dataset.pid;
      if (pid) location.hash = `#/player/${encodeURIComponent(pid)}`;
    });
  }
}

export { LeaderboardType };
