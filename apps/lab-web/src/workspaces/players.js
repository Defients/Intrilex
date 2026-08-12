// ═══════════════════════════════════════════════════════════════
// workspaces/players.js — Player Directory workspace
//
// The discovery surface between Profiles and the future social layer.
// Two tabs:
//   1. "All Players"   — discoverable players (opt-in directory)
//   2. "Recent Opponents" — players you've faced in completed matches,
//      with head-to-head W/L/D record (authenticated only)
//
// Server-side search/filter/sort/pagination via the get_player_directory
// and get_recent_opponents RPCs — the browser never loads every player
// and sorts client-side.
//
// Features: search (handle/display name), tier filter, sort (rating,
// games, recent, newest, name), cursor/offset pagination, player cards
// that open public profiles, loading skeletons, error isolation, empty
// states (no discoverable players / no search matches), offline mode,
// URL state (q/rank/sort/tab), responsive layout, accessibility
// (semantic landmarks, labels, keyboard, aria-live, reduced-motion).
//
// Privacy: cards expose only the safe public projection returned by the
// RPCs. Hidden/private players are never enumerable. No "online" status
// (no presence infrastructure). No fake social actions.
// ═══════════════════════════════════════════════════════════════

import { app, esc, pct } from '../state.js';
import { renderRankGlyph, rankLabel } from '../play/rank/rank-glyph.js';
import { RankTier } from '@intrilex/account-domain/rank-tier';
import { apexLabel } from '@intrilex/account-domain/leaderboard';
import {
  DIRECTORY_SORTS,
  DIRECTORY_SORT_LABELS,
  DIRECTORY_PAGE_SIZE,
  DirectorySort,
} from '@intrilex/account-domain/directory';
import {
  RECENT_OPPONENTS_PAGE_SIZE,
  formatHeadToHead,
  formatLastPlayed,
} from '@intrilex/account-domain/recent-opponents';
import { fetchDirectory } from '../play/players/players-data.js';
import { fetchRecentOpponents } from '../play/players/recent-opponents-data.js';

/** @typedef {'directory'|'opponents'} PlayerTab */

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
  /** @type {PlayerTab} */
  tab: 'directory',
  // ── Directory tab state ──
  search: '',
  tier: 'ALL',
  sort: DirectorySort.RATING,
  offset: 0,
  loading: true,
  error: null,
  entries: [],
  available: true,
  /** Whether the current page is the last page (fewer than page-size results). */
  isLastPage: false,
  /** Total matching players across all pages (from get_player_directory_count), or null when unavailable. */
  total: null,
  // ── Recent Opponents tab state ──
  opp: {
    offset: 0,
    loading: true,
    error: null,
    entries: [],
    available: true,
    authenticated: false,
    isLastPage: false,
    _loadId: 0,
    _abortCtrl: null,
    _loaded: false,
  },
  _searchTimer: null,
  _mounted: false,
  _loadId: 0,
  _wiredTarget: null,
  _abortCtrl: null,
};

/**
 * Render the Player Directory workspace.
 * @param {HTMLElement} [root]
 */
export function renderPlayers(root) {
  const target = root ?? app;
  clearTimeout(view._searchTimer);
  view._searchTimer = null;
  if (view._abortCtrl) { view._abortCtrl.abort(); view._abortCtrl = null; }
  if (view.opp._abortCtrl) { view.opp._abortCtrl.abort(); view.opp._abortCtrl = null; }
  view._mounted = true;
  // Sync state from the URL on entry so deep-links/shareable searches work
  syncStateFromUrl();
  target.innerHTML = renderShell();
  wireEvents(target);
  // Focus the search input on open for keyboard-first interaction.
  // requestAnimationFrame ensures the element is painted before focus.
  if (view.tab === 'directory') {
    requestAnimationFrame(() => {
      const s = target.querySelector('#pd-search');
      if (s) s.focus();
    });
  }
  loadActiveTab(target);
}

/**
 * Teardown — clears pending timers and marks the view as unmounted.
 */
export function destroyPlayers() {
  clearTimeout(view._searchTimer);
  view._searchTimer = null;
  view._mounted = false;
  if (view._abortCtrl) { view._abortCtrl.abort(); view._abortCtrl = null; }
  if (view.opp._abortCtrl) { view.opp._abortCtrl.abort(); view.opp._abortCtrl = null; }
}

/**
 * Load the active tab's data on initial render. Called once from
 * renderPlayers. The opponents tab uses a _loaded guard in switchTab
 * for subsequent tab switches (lazy loading — avoids an unnecessary
 * RPC when the user never visits the opponents tab).
 * @param {HTMLElement} target
 */
function loadActiveTab(target) {
  if (view.tab === 'directory') {
    load(target);
  } else if (view.tab === 'opponents') {
    loadOpponents(target);
  }
}

// ── URL state ──

/**
 * Read directory query state (q, rank, sort, tab) from the location hash.
 * Falls back to current view state when absent.
 */
function syncStateFromUrl() {
  const hash = location.hash.replace(/^#\/players\??/, '');
  const params = new URLSearchParams(hash);
  const tab = params.get('tab');
  if (tab === 'opponents' || tab === 'directory') view.tab = tab;
  const q = params.get('q');
  if (q != null) view.search = q;
  const rank = params.get('rank');
  if (rank != null) view.tier = TIER_FILTERS.some(t => t.value === rank) ? rank : 'ALL';
  const sort = params.get('sort');
  if (sort != null) view.sort = DIRECTORY_SORTS.includes(sort) ? sort : DirectorySort.RATING;
  // offset is not URL-persisted (avoids stale deep-links to empty pages).
  // Reset on every sync so a deep-link entry doesn't carry over a stale
  // offset from a previous directory session.
  view.offset = 0;
  view.opp.offset = 0;
}

/**
 * Persist directory query state (q, rank, sort, tab) into the location hash
 * without triggering a re-render. Replaces the query string on
 * `#/players` and preserves the path.
 */
function syncUrlFromState() {
  const params = new URLSearchParams();
  if (view.tab === 'opponents') params.set('tab', 'opponents');
  if (view.search) params.set('q', view.search);
  if (view.tier && view.tier !== 'ALL') params.set('rank', view.tier);
  if (view.sort && view.sort !== DirectorySort.RATING) params.set('sort', view.sort);
  const qs = params.toString();
  const next = qs ? `#/players?${qs}` : '#/players';
  if (location.hash !== next) {
    history.replaceState(null, '', next);
  }
}

// ── Shell ──

function renderShell() {
  const sortOpts = DIRECTORY_SORTS.map(s =>
    `<option value="${s}"${s === view.sort ? ' selected' : ''}>${esc(DIRECTORY_SORT_LABELS[s])}</option>`).join('');
  const tierOpts = TIER_FILTERS.map(t =>
    `<option value="${t.value}"${t.value === view.tier ? ' selected' : ''}>${esc(t.label)}</option>`).join('');

  const isDir = view.tab === 'directory';
  const dirSelected = isDir ? 'true' : 'false';
  const oppSelected = isDir ? 'false' : 'true';
  const dirTabindex = isDir ? '0' : '-1';
  const oppTabindex = isDir ? '-1' : '0';

  return `<section class="panel pd-panel" data-testid="players-panel">
    <div class="panel-header pd-header">
      <div>
        <h2 data-testid="players-title">PLAYERS</h2>
        <p class="pd-subtitle" data-testid="players-subtitle">Find players, inspect profiles, rankings, and battle history.</p>
      </div>
    </div>
    <div class="panel-body pd-body">
      <div class="pd-tabs" role="tablist" aria-label="Player discovery views">
        <button class="pd-tab ${isDir ? 'pd-tab-active' : ''}" role="tab" id="pd-tab-directory"
          aria-selected="${dirSelected}" aria-controls="pd-tabpanel-directory" tabindex="${dirTabindex}"
          data-action="switch-tab" data-tab="directory" data-testid="pd-tab-directory">
          <span class="pd-tab-icon" aria-hidden="true">◈</span> All Players
        </button>
        <button class="pd-tab ${!isDir ? 'pd-tab-active' : ''}" role="tab" id="pd-tab-opponents"
          aria-selected="${oppSelected}" aria-controls="pd-tabpanel-opponents" tabindex="${oppTabindex}"
          data-action="switch-tab" data-tab="opponents" data-testid="pd-tab-opponents">
          <span class="pd-tab-icon" aria-hidden="true">⚔</span> Recent Opponents
        </button>
      </div>
      <div id="pd-tabpanel-directory" role="tabpanel" aria-labelledby="pd-tab-directory" data-testid="pd-tabpanel-directory" ${isDir ? '' : 'hidden'}>
        <div class="pd-controls">
          <div class="pd-search-wrap">
            <input type="search" id="pd-search" class="pd-search" value="${esc(view.search)}"
              placeholder="Search by name or @handle…  (press / to focus)"
              aria-label="Search players by name or handle"
              autocomplete="off" spellcheck="false" data-testid="pd-search" />
            ${view.search ? '<button class="pd-search-clear" id="pd-search-clear" type="button" aria-label="Clear search" data-testid="pd-search-clear">&times;</button>' : ''}
          </div>
          <div class="pd-filter-wrap">
            <label for="pd-tier" class="pd-visually-hidden">Tier filter</label>
            <select id="pd-tier" class="pd-select" data-testid="pd-tier-select" aria-label="Filter by tier">${tierOpts}</select>
          </div>
          <div class="pd-sort-wrap">
            <label for="pd-sort" class="pd-visually-hidden">Sort by</label>
            <select id="pd-sort" class="pd-select" data-testid="pd-sort-select" aria-label="Sort players">${sortOpts}</select>
          </div>
        </div>
        <div class="pd-summary" data-testid="pd-summary" aria-live="polite"></div>
        <div class="pd-content" data-testid="pd-content" aria-busy="true"></div>
        <div class="pd-pagination" data-testid="pd-pagination"></div>
      </div>
      <div id="pd-tabpanel-opponents" role="tabpanel" aria-labelledby="pd-tab-opponents" data-testid="pd-tabpanel-opponents" ${isDir ? 'hidden' : ''}>
        <div class="pd-summary" data-testid="pd-opp-summary" aria-live="polite"></div>
        <div class="pd-opp-content" data-testid="pd-opp-content" aria-live="polite" aria-busy="true"></div>
        <div class="pd-pagination" data-testid="pd-opp-pagination"></div>
      </div>
    </div>
  </section>`;
}

// ── Data loading ──

async function load(target) {
  const loadId = ++view._loadId;
  if (view._abortCtrl) view._abortCtrl.abort();
  const abortCtrl = new AbortController();
  view._abortCtrl = abortCtrl;
  const signal = abortCtrl.signal;

  view.loading = true;
  view.error = null;
  renderContent(target);
  try {
    const res = await fetchDirectory({
      search: view.search,
      tier: view.tier,
      sort: view.sort,
      limit: DIRECTORY_PAGE_SIZE,
      offset: view.offset,
      signal,
    });
    if (loadId !== view._loadId) return; // stale
    view.available = res.available;
    view.entries = res.entries;
    view.total = res.total ?? null;
    // If we have a total, use it to determine the last page precisely.
    // Otherwise fall back to the page-size heuristic.
    if (view.total != null) {
      view.isLastPage = view.offset + res.entries.length >= view.total;
    } else {
      view.isLastPage = res.entries.length < DIRECTORY_PAGE_SIZE;
    }
  } catch (err) {
    if (loadId !== view._loadId) return; // stale
    if (err?.name === 'AbortError') return;
    view.error = err?.message ?? 'Directory temporarily unavailable.';
  } finally {
    if (loadId === view._loadId) {
      view.loading = false;
      renderContent(target);
      renderSummary(target);
      renderPagination(target);
    }
  }
}

// ── Recent Opponents data loading ──

/**
 * Load a page of recent opponents. Lazy: only called when the opponents
 * tab is active. Uses a separate abort controller and load ID from the
 * directory tab so switching tabs doesn't interfere.
 * @param {HTMLElement} target
 */
async function loadOpponents(target) {
  const loadId = ++view.opp._loadId;
  if (view.opp._abortCtrl) view.opp._abortCtrl.abort();
  const abortCtrl = new AbortController();
  view.opp._abortCtrl = abortCtrl;
  const signal = abortCtrl.signal;

  view.opp.loading = true;
  view.opp.error = null;
  renderOpponentsContent(target);
  try {
    const res = await fetchRecentOpponents({
      limit: RECENT_OPPONENTS_PAGE_SIZE,
      offset: view.opp.offset,
      signal,
    });
    if (loadId !== view.opp._loadId) return; // stale
    view.opp.available = res.available;
    view.opp.authenticated = res.authenticated;
    view.opp.entries = res.entries;
    view.opp.isLastPage = res.entries.length < RECENT_OPPONENTS_PAGE_SIZE;
    view.opp._loaded = true;
  } catch (err) {
    if (loadId !== view.opp._loadId) return; // stale
    if (err?.name === 'AbortError') return;
    view.opp.error = err?.message ?? 'Recent opponents temporarily unavailable.';
  } finally {
    if (loadId === view.opp._loadId) {
      view.opp.loading = false;
      renderOpponentsContent(target);
      renderOpponentsSummary(target);
      renderOpponentsPagination(target);
    }
  }
}

// ── Rendering ──

function renderSummary(target) {
  const el = target.querySelector('[data-testid="pd-summary"]');
  if (!el) return;
  if (!view.available || view.loading) { el.innerHTML = ''; return; }
  if (view.error) { el.innerHTML = ''; return; }
  const n = view.entries.length;
  if (n === 0) { el.innerHTML = ''; return; }
  const pageStart = view.offset + 1;
  const pageEnd = view.offset + n;
  const q = view.search ? ` for “${esc(view.search)}”` : '';
  const tierLabel = view.tier !== 'ALL' ? ` · ${esc(TIER_FILTERS.find(t => t.value === view.tier)?.label ?? view.tier)}` : '';
  const totalSuffix = view.total != null ? ` of ${view.total}` : '';
  el.innerHTML = `<div class="pd-count" data-testid="pd-count">
    Showing ${pageStart}–${pageEnd}${totalSuffix}${q}${tierLabel}
  </div>`;
}

function renderContent(target) {
  const el = target.querySelector('[data-testid="pd-content"]');
  if (!el) return;
  el.setAttribute('aria-busy', String(view.loading));

  if (view.loading) { el.innerHTML = renderSkeleton(); return; }
  if (!view.available) { el.innerHTML = renderUnavailable(); return; }
  if (view.error) { el.innerHTML = renderError(view.error); return; }
  if (view.entries.length === 0) { el.innerHTML = renderEmpty(); return; }
  el.innerHTML = renderCards(view.entries);
}

function renderSkeleton() {
  const cards = Array.from({ length: 8 }, () =>
    `<div class="pd-card pd-skeleton-card" aria-hidden="true">
      <span class="pd-skeleton pd-sk-avatar"></span>
      <div class="pd-skeleton-rows">
        <span class="pd-skeleton pd-sk-name"></span>
        <span class="pd-skeleton pd-sk-meta"></span>
        <span class="pd-skeleton pd-sk-stats"></span>
      </div>
    </div>`).join('');
  return `<div class="pd-grid" role="status" aria-label="Loading players">${cards}</div>`;
}

function renderUnavailable() {
  return `<div class="pd-empty" data-testid="pd-unavailable">
    <strong>Player Directory unavailable in local mode.</strong>
    <p>Connect to Intrilex Online to discover other players. Your games are unaffected.</p>
    <p class="pd-empty-hint">The directory is browseable by everyone — no sign-in required when online.</p>
  </div>`;
}

function renderError(msg) {
  return `<div class="pd-empty pd-error" role="alert" data-testid="pd-error">
    <strong>Directory temporarily unavailable.</strong>
    <p class="pd-error-detail mono">${esc(msg)}</p>
    <button class="btn btn-sm" data-action="retry" data-testid="pd-retry">Retry</button>
  </div>`;
}

function renderEmpty() {
  if (view.search) {
    return `<div class="pd-empty" data-testid="pd-empty-search">
      <span class="pd-empty-icon" aria-hidden="true">⌕</span>
      <strong>No players found for “${esc(view.search)}”.</strong>
      <p>Try another name or @handle, or clear your search and filters.</p>
      <button class="btn btn-sm" data-action="clear-search" data-testid="pd-clear-search">Clear search</button>
    </div>`;
  }
  return `<div class="pd-empty" data-testid="pd-empty">
    <span class="pd-empty-icon" aria-hidden="true">◈</span>
    <strong>No discoverable players yet.</strong>
    <p>Players appear here once they opt into the Player Directory from their profile privacy settings.</p>
  </div>`;
}

function renderCards(entries) {
  const cards = entries.map(renderCard).join('');
  return `<ul class="pd-grid" data-testid="pd-grid" role="list">${cards}</ul>`;
}

/**
 * Render a single player card. The whole card is a link to the public
 * profile route (#/player/:publicPlayerId), with a nested button for
 * keyboard semantics.
 * @param {import('@intrilex/account-domain/directory').DirectoryEntry} entry
 */
function renderCard(entry) {
  const id = entry.player;
  const rank = entry.rank;
  const rec = entry.record;
  const pid = esc(id.publicPlayerId);
  const name = esc(id.displayName || 'Player');
  const handle = id.handle ? `<span class="pd-handle">@${esc(id.handle)}</span>` : '<span class="pd-handle pd-handle-none">no handle</span>';

  // Rank glyph + label
  const glyphSize = 40;
  const glyph = rank.isPlacement
    ? renderRankGlyph({ tier: RankTier.UNRANKED, size: glyphSize, decorative: true })
    : renderRankGlyph({
        tier: rank.tier, division: rank.division, size: glyphSize,
        showDivision: true, decorative: true,
      });
  const rankText = rank.isPlacement
    ? 'UNRANKED'
    : rank.isApex
      ? apexLabel(null)
      : rankLabel(rank.tier, rank.division);
  const irText = rank.rating != null ? `${rank.rating} IR` : 'No ranked history';

  // Record line
  const wl = `${rec.wins}–${rec.losses}${rec.draws ? `–${rec.draws}` : ''}`;
  const winPct = rec.games > 0 ? pct(rec.winRate) : '—';
  const gamesLine = rec.games > 0
    ? `${wl} · ${winPct} win rate · ${rec.games} game${rec.games === 1 ? '' : 's'}`
    : 'No matches yet';

  // Achievements (only when public — null means hidden)
  const achLine = entry.earnedAchievements != null
    ? `<span class="pd-ach">${entry.earnedAchievements} achievement${entry.earnedAchievements === 1 ? '' : 's'}</span>`
    : '';

  return `<li class="pd-card" role="listitem" data-testid="pd-card" data-pid="${pid}">
    <a class="pd-card-link" href="#/player/${encodeURIComponent(id.publicPlayerId)}" data-testid="pd-card-link" aria-label="View ${name}'s profile">
      <span class="pd-card-glyph" aria-hidden="true">${glyph}</span>
      <span class="pd-card-body">
        <span class="pd-card-name">${name}</span>
        ${handle}
        <span class="pd-card-rank" data-tier="${esc(rank.tier)}">${esc(rankText)}</span>
        <span class="pd-card-ir mono">${esc(irText)}</span>
        <span class="pd-card-stats mono">${esc(gamesLine)}</span>
        ${achLine}
      </span>
    </a>
  </li>`;
}

function renderPagination(target) {
  const el = target.querySelector('[data-testid="pd-pagination"]');
  if (!el) return;
  if (!view.available || view.loading || view.error) { el.innerHTML = ''; return; }
  const hasPrev = view.offset > 0;
  const hasNext = view.entries.length >= DIRECTORY_PAGE_SIZE && !view.isLastPage;
  if (!hasPrev && !hasNext) { el.innerHTML = ''; return; }
  const page = Math.floor(view.offset / DIRECTORY_PAGE_SIZE) + 1;
  el.innerHTML = `<div class="pd-pagination-bar">
    <button class="btn btn-sm pd-page-btn" data-action="prev" data-testid="pd-prev" ${hasPrev ? '' : 'disabled aria-disabled="true"'}>&larr; Prev</button>
    <span class="pd-page-num" aria-label="Page ${page}">Page ${page}</span>
    <button class="btn btn-sm pd-page-btn" data-action="next" data-testid="pd-next" ${hasNext ? '' : 'disabled aria-disabled="true"'}>Next &rarr;</button>
  </div>`;
}

// ── Recent Opponents rendering ──

function renderOpponentsSummary(target) {
  const el = target.querySelector('[data-testid="pd-opp-summary"]');
  if (!el) return;
  if (!view.opp.available || view.opp.loading) { el.innerHTML = ''; return; }
  if (view.opp.error) { el.innerHTML = ''; return; }
  const n = view.opp.entries.length;
  if (n === 0) { el.innerHTML = ''; return; }
  const pageStart = view.opp.offset + 1;
  const pageEnd = view.opp.offset + n;
  el.innerHTML = `<div class="pd-count" data-testid="pd-opp-count">
    Opponents ${pageStart}–${pageEnd}
  </div>`;
}

function renderOpponentsContent(target) {
  const el = target.querySelector('[data-testid="pd-opp-content"]');
  if (!el) return;
  el.setAttribute('aria-busy', String(view.opp.loading));

  if (view.opp.loading) {
    el.innerHTML = renderOppSkeleton();
    return;
  }
  if (!view.opp.available) {
    el.innerHTML = view.opp.authenticated
      ? renderOppUnavailable()
      : renderOppSignInRequired();
    return;
  }
  if (view.opp.error) {
    el.innerHTML = renderOppError(view.opp.error);
    return;
  }
  if (view.opp.entries.length === 0) {
    el.innerHTML = renderOppEmpty();
    return;
  }
  el.innerHTML = renderOppCards(view.opp.entries);
}

function renderOppSkeleton() {
  const cards = Array.from({ length: 6 }, () =>
    `<div class="pd-card pd-skeleton-card" aria-hidden="true">
      <span class="pd-skeleton pd-sk-avatar"></span>
      <div class="pd-skeleton-rows">
        <span class="pd-skeleton pd-sk-name"></span>
        <span class="pd-skeleton pd-sk-meta"></span>
        <span class="pd-skeleton pd-sk-stats"></span>
      </div>
    </div>`).join('');
  return `<div class="pd-grid" role="status" aria-label="Loading recent opponents">${cards}</div>`;
}

function renderOppUnavailable() {
  return `<div class="pd-empty" data-testid="pd-opp-unavailable">
    <strong>Recent Opponents unavailable in local mode.</strong>
    <p>Connect to Intrilex Online and sign in to see players you've faced.</p>
  </div>`;
}

function renderOppSignInRequired() {
  return `<div class="pd-empty" data-testid="pd-opp-signin-required">
    <span class="pd-empty-icon" aria-hidden="true">⊕</span>
    <strong>Sign in to see your recent opponents.</strong>
    <p>Your match history is tied to your account. Sign in with Discord or Google to view players you've faced.</p>
    <a class="btn btn-sm" href="#/auth" data-testid="pd-opp-signin-link">Sign In</a>
  </div>`;
}

function renderOppError(msg) {
  return `<div class="pd-empty pd-error" role="alert" data-testid="pd-opp-error">
    <strong>Recent opponents temporarily unavailable.</strong>
    <p class="pd-error-detail mono">${esc(msg)}</p>
    <button class="btn btn-sm" data-action="opp-retry" data-testid="pd-opp-retry">Retry</button>
  </div>`;
}

function renderOppEmpty() {
  return `<div class="pd-empty" data-testid="pd-opp-empty">
    <span class="pd-empty-icon" aria-hidden="true">⚔</span>
    <strong>No opponents yet.</strong>
    <p>Play online matches to build your opponent history. Players you face will appear here with your head-to-head record.</p>
    <a class="btn btn-sm" href="#/play/online" data-testid="pd-opp-play-link">Play Online</a>
  </div>`;
}

function renderOppCards(entries) {
  const cards = entries.map(renderOppCard).join('');
  return `<ul class="pd-grid pd-opp-grid" data-testid="pd-opp-grid" role="list">${cards}</ul>`;
}

/**
 * Render a single recent opponent card. Shows the safe public projection
 * plus the head-to-head record (from the caller's perspective) and the
 * last-played time. The whole card links to the opponent's public profile.
 * @param {import('@intrilex/account-domain/recent-opponents').OpponentEntry} entry
 */
function renderOppCard(entry) {
  const id = entry.player;
  const rank = entry.rank;
  const h2h = entry.headToHead;
  const pid = esc(id.publicPlayerId);
  const name = esc(id.displayName || 'Player');
  const handle = id.handle ? `<span class="pd-handle">@${esc(id.handle)}</span>` : '<span class="pd-handle pd-handle-none">no handle</span>';

  // Rank glyph + label
  const glyphSize = 40;
  const glyph = rank.isPlacement
    ? renderRankGlyph({ tier: RankTier.UNRANKED, size: glyphSize, decorative: true })
    : renderRankGlyph({
        tier: rank.tier, division: rank.division, size: glyphSize,
        showDivision: true, decorative: true,
      });
  const rankText = rank.isPlacement
    ? 'UNRANKED'
    : rank.isApex
      ? apexLabel(null)
      : rankLabel(rank.tier, rank.division);
  const irText = rank.rating != null ? `${rank.rating} IR` : 'No ranked history';

  // Head-to-head record (caller's perspective)
  const h2hText = formatHeadToHead(h2h);
  const h2hWinRate = h2h.games > 0 ? pct(h2h.winRate) : '—';
  const lastPlayed = formatLastPlayed(h2h.lastPlayedAt);
  const h2hLine = h2h.games > 0
    ? `<span class="pd-h2h-record mono">${esc(h2hText)}</span> <span class="pd-h2h-meta">· ${esc(h2hWinRate)} win rate · ${esc(lastPlayed)}</span>`
    : '<span class="pd-h2h-record pd-h2h-none">No completed games</span>';

  // Dominant color: green if caller wins more, red if caller loses more
  const h2hDominant = h2h.games > 0
    ? (h2h.wins > h2h.losses ? 'win' : h2h.losses > h2h.wins ? 'loss' : 'even')
    : '';

  // Achievements (only when public — null means hidden)
  const achLine = entry.earnedAchievements != null
    ? `<span class="pd-ach">${entry.earnedAchievements} achievement${entry.earnedAchievements === 1 ? '' : 's'}</span>`
    : '';

  return `<li class="pd-card pd-opp-card" role="listitem" data-testid="pd-opp-card" data-pid="${pid}"${h2hDominant ? ` data-h2h-dominant="${esc(h2hDominant)}"` : ''}>
    <a class="pd-card-link" href="#/player/${encodeURIComponent(id.publicPlayerId)}" data-testid="pd-opp-card-link" aria-label="View ${name}'s profile — head-to-head ${esc(h2hText)}">
      <span class="pd-card-glyph" aria-hidden="true">${glyph}</span>
      <span class="pd-card-body">
        <span class="pd-card-name">${name}</span>
        ${handle}
        <span class="pd-card-rank" data-tier="${esc(rank.tier)}">${esc(rankText)}</span>
        <span class="pd-card-ir mono">${esc(irText)}</span>
        <span class="pd-h2h mono" data-testid="pd-h2h">${h2hLine}</span>
        ${achLine}
      </span>
    </a>
  </li>`;
}

function renderOpponentsPagination(target) {
  const el = target.querySelector('[data-testid="pd-opp-pagination"]');
  if (!el) return;
  if (!view.opp.available || view.opp.loading || view.opp.error) { el.innerHTML = ''; return; }
  const hasPrev = view.opp.offset > 0;
  const hasNext = view.opp.entries.length >= RECENT_OPPONENTS_PAGE_SIZE && !view.opp.isLastPage;
  if (!hasPrev && !hasNext) { el.innerHTML = ''; return; }
  const page = Math.floor(view.opp.offset / RECENT_OPPONENTS_PAGE_SIZE) + 1;
  el.innerHTML = `<div class="pd-pagination-bar">
    <button class="btn btn-sm pd-page-btn" data-action="opp-prev" data-testid="pd-opp-prev" ${hasPrev ? '' : 'disabled aria-disabled="true"'}>&larr; Prev</button>
    <span class="pd-page-num" aria-label="Page ${page}">Page ${page}</span>
    <button class="btn btn-sm pd-page-btn" data-action="opp-next" data-testid="pd-opp-next" ${hasNext ? '' : 'disabled aria-disabled="true"'}>Next &rarr;</button>
  </div>`;
}

// ── Events ──

function wireEvents(target) {
  const search = target.querySelector('#pd-search');
  if (search) {
    search.addEventListener('input', () => {
      clearTimeout(view._searchTimer);
      view._searchTimer = setTimeout(() => {
        view.search = search.value.trim();
        view.offset = 0;
        syncUrlFromState();
        // Re-render the clear button + selected controls without a full teardown
        updateSearchClear(target);
        load(target);
      }, 300);
    });
    // Enter commits the search immediately (debounce bypass)
    search.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        clearTimeout(view._searchTimer);
        view.search = search.value.trim();
        view.offset = 0;
        syncUrlFromState();
        updateSearchClear(target);
        load(target);
      }
    });
  }
  // NOTE: #pd-search-clear click is handled by the data-action="clear-search"
  // delegation below — no separate listener needed here.
  const tier = target.querySelector('#pd-tier');
  if (tier) {
    tier.addEventListener('change', () => {
      view.tier = tier.value;
      view.offset = 0;
      syncUrlFromState();
      load(target);
    });
  }
  const sort = target.querySelector('#pd-sort');
  if (sort) {
    sort.addEventListener('change', () => {
      view.sort = sort.value;
      view.offset = 0;
      syncUrlFromState();
      load(target);
    });
  }
  // Target-level delegation (added once per target to prevent accumulation)
  if (view._wiredTarget !== target) {
    view._wiredTarget = target;
    // WAI-ARIA tabs: Arrow Left/Right moves focus between tabs, Home/End
    // jumps to first/last. Activation follows focus (selecting the focused
    // tab). This is the recommended "automatic activation" pattern.
    const tablist = target.querySelector('.pd-tabs');
    if (tablist) {
      tablist.addEventListener('keydown', (ev) => {
        const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
        if (tabs.length < 2) return;
        const current = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
        let next = current;
        if (ev.key === 'ArrowRight') next = (current + 1) % tabs.length;
        else if (ev.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = tabs.length - 1;
        else return;
        ev.preventDefault();
        const tab = tabs[next];
        if (tab) {
          // Automatic activation: switch to the focused tab
          const tabName = tab.dataset.tab;
          if (tabName && tabName !== view.tab) switchTab(target, tabName);
          else tab.focus();
        }
      });
    }
    // Pagination + actions
    target.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'switch-tab') {
        const newTab = btn.dataset.tab;
        if (newTab !== view.tab && (newTab === 'directory' || newTab === 'opponents')) {
          switchTab(target, newTab);
        }
      } else if (action === 'prev') {
        view.offset = Math.max(0, view.offset - DIRECTORY_PAGE_SIZE);
        load(target);
        scrollToTop(target);
      } else if (action === 'next') {
        view.offset = view.offset + DIRECTORY_PAGE_SIZE;
        load(target);
        scrollToTop(target);
      } else if (action === 'opp-prev') {
        view.opp.offset = Math.max(0, view.opp.offset - RECENT_OPPONENTS_PAGE_SIZE);
        loadOpponents(target);
        scrollToTop(target);
      } else if (action === 'opp-next') {
        view.opp.offset = view.opp.offset + RECENT_OPPONENTS_PAGE_SIZE;
        loadOpponents(target);
        scrollToTop(target);
      } else if (action === 'retry') {
        load(target);
      } else if (action === 'opp-retry') {
        loadOpponents(target);
      } else if (action === 'clear-search') {
        view.search = '';
        view.offset = 0;
        syncUrlFromState();
        const s = target.querySelector('#pd-search');
        if (s) s.value = '';
        updateSearchClear(target);
        load(target);
        if (s) s.focus();
      }
    });
    // Keyboard shortcut: '/' focuses the search input (like GitHub/Slack).
    // Ignored when the user is already typing in any input/textarea/select
    // or when a modifier key is held (Ctrl/Cmd/Meta/Alt).
    // If the opponents tab is active, switch to the directory tab first
    // (the search input lives in the directory panel).
    target.addEventListener('keydown', (ev) => {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const tag = (ev.target?.tagName ?? '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (ev.target?.isContentEditable) return;
      ev.preventDefault();
      if (view.tab !== 'directory') {
        switchTab(target, 'directory');
      }
      requestAnimationFrame(() => {
        const s = target.querySelector('#pd-search');
        if (s) s.focus();
      });
    });
  }
}

/**
 * Switch between the Directory and Recent Opponents tabs. Updates the
 * tab attributes (aria-selected, tabindex, hidden), persists the active
 * tab to the URL, and lazy-loads the opponents data on first visit.
 * @param {HTMLElement} target
 * @param {PlayerTab} newTab
 */
function switchTab(target, newTab) {
  view.tab = newTab;
  syncUrlFromState();
  // Update tab button states
  const dirTab = target.querySelector('#pd-tab-directory');
  const oppTab = target.querySelector('#pd-tab-opponents');
  const dirPanel = target.querySelector('#pd-tabpanel-directory');
  const oppPanel = target.querySelector('#pd-tabpanel-opponents');
  if (dirTab && oppTab && dirPanel && oppPanel) {
    const isDir = newTab === 'directory';
    dirTab.classList.toggle('pd-tab-active', isDir);
    oppTab.classList.toggle('pd-tab-active', !isDir);
    dirTab.setAttribute('aria-selected', String(isDir));
    oppTab.setAttribute('aria-selected', String(!isDir));
    dirTab.setAttribute('tabindex', isDir ? '0' : '-1');
    oppTab.setAttribute('tabindex', isDir ? '-1' : '0');
    dirPanel.hidden = !isDir;
    oppPanel.hidden = isDir;
    // Focus the newly-active tab button for WAI-ARIA roving tabindex
    const activeTab = isDir ? dirTab : oppTab;
    activeTab.focus();
  }
  // Lazy-load opponents on first visit
  if (newTab === 'opponents' && !view.opp._loaded) {
    loadOpponents(target);
  }
}

/**
 * Show/hide the search clear button without re-rendering the whole shell.
 * The click handler is delegated via wireEvents (data-action="clear-search"),
 * so the dynamically-created button only needs the correct attributes.
 * @param {HTMLElement} target
 */
function updateSearchClear(target) {
  const wrap = target.querySelector('.pd-search-wrap');
  if (!wrap) return;
  const existing = wrap.querySelector('#pd-search-clear');
  if (view.search && !existing) {
    const btn = document.createElement('button');
    btn.className = 'pd-search-clear';
    btn.id = 'pd-search-clear';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Clear search');
    btn.dataset.testid = 'pd-search-clear';
    btn.dataset.action = 'clear-search';
    btn.innerHTML = '&times;';
    wrap.appendChild(btn);
  } else if (!view.search && existing) {
    existing.remove();
  }
}

function scrollToTop(target) {
  const panel = target.closest('.pd-panel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
