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

import { app, esc, pct } from '../state.js?v=73653ac8207b';
import { renderRankGlyph, rankLabel } from '../play/rank/rank-glyph.js?v=73653ac8207b';
import { RankTier } from "../account-domain/rank-tier.mjs";
import { apexLabel } from "../account-domain/leaderboard.mjs";
import {
  DIRECTORY_SORTS,
  DIRECTORY_SORT_LABELS,
  DIRECTORY_PAGE_SIZE,
  DirectorySort,
} from "../account-domain/directory.mjs";
import {
  RECENT_OPPONENTS_PAGE_SIZE,
  formatHeadToHead,
  formatLastPlayed,
} from "../account-domain/recent-opponents.mjs";
import {
  RelationshipKind,
  RELATIONSHIPS_PAGE_SIZE,
  formatRelationshipHeadToHead,
  rivalryIntensityLabel,
  deriveRivalMilestones,
  detectNemesis,
  detectKryptonite,
} from "../account-domain/relationships.mjs";
import { fetchDirectory } from '../play/players/players-data.js?v=73653ac8207b';
import { fetchRecentOpponents } from '../play/players/recent-opponents-data.js?v=73653ac8207b';
import {
  fetchRelationships,
  fetchSuggestedRivals,
  DEFAULT_SUGGESTED_RIVALS_LIMIT,
} from '../play/players/relationships-data.js?v=73653ac8207b';

/** @typedef {'directory'|'opponents'|'rivals'} PlayerTab */
/** @typedef {'rivals'|'following'|'suggested'} RivalsSegment */

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
  // ── Rivals tab state ──
  rivals: {
    /** @type {RivalsSegment} */
    segment: 'rivals',
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
  if (view.rivals._abortCtrl) { view.rivals._abortCtrl.abort(); view.rivals._abortCtrl = null; }
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
  } else if (view.tab === 'rivals') {
    loadRivals(target);
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
  if (tab === 'opponents' || tab === 'directory' || tab === 'rivals') view.tab = tab;
  const q = params.get('q');
  if (q != null) view.search = q;
  const rank = params.get('rank');
  if (rank != null) view.tier = TIER_FILTERS.some(t => t.value === rank) ? rank : 'ALL';
  const sort = params.get('sort');
  if (sort != null) view.sort = DIRECTORY_SORTS.includes(sort) ? sort : DirectorySort.RATING;
  const seg = params.get('seg');
  if (seg === 'rivals' || seg === 'following' || seg === 'suggested') view.rivals.segment = seg;
  // offset is not URL-persisted (avoids stale deep-links to empty pages).
  // Reset on every sync so a deep-link entry doesn't carry over a stale
  // offset from a previous directory session.
  view.offset = 0;
  view.opp.offset = 0;
  view.rivals.offset = 0;
}

/**
 * Persist directory query state (q, rank, sort, tab) into the location hash
 * without triggering a re-render. Replaces the query string on
 * `#/players` and preserves the path.
 */
function syncUrlFromState() {
  const params = new URLSearchParams();
  if (view.tab === 'opponents') params.set('tab', 'opponents');
  else if (view.tab === 'rivals') params.set('tab', 'rivals');
  if (view.tab === 'rivals' && view.rivals.segment !== 'rivals') {
    params.set('seg', view.rivals.segment);
  }
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
  const isOpp = view.tab === 'opponents';
  const isRiv = view.tab === 'rivals';
  const dirSelected = isDir ? 'true' : 'false';
  const oppSelected = isOpp ? 'true' : 'false';
  const rivSelected = isRiv ? 'true' : 'false';
  const dirTabindex = isDir ? '0' : '-1';
  const oppTabindex = isOpp ? '0' : '-1';
  const rivTabindex = isRiv ? '0' : '-1';

  // Rivals tab segmented control (Rivals / Following / Suggested)
  const seg = view.rivals.segment;
  const segBtn = (value, label, testid) =>
    `<button class="pd-seg-btn ${seg === value ? 'pd-seg-btn-active' : ''}" type="button"
       data-action="rivals-segment" data-segment="${value}" data-testid="${testid}"
       aria-pressed="${seg === value ? 'true' : 'false'}">${label}</button>`;

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
        <button class="pd-tab ${isOpp ? 'pd-tab-active' : ''}" role="tab" id="pd-tab-opponents"
          aria-selected="${oppSelected}" aria-controls="pd-tabpanel-opponents" tabindex="${oppTabindex}"
          data-action="switch-tab" data-tab="opponents" data-testid="pd-tab-opponents">
          <span class="pd-tab-icon" aria-hidden="true">⚔</span> Recent Opponents
        </button>
        <button class="pd-tab ${isRiv ? 'pd-tab-active' : ''}" role="tab" id="pd-tab-rivals"
          aria-selected="${rivSelected}" aria-controls="pd-tabpanel-rivals" tabindex="${rivTabindex}"
          data-action="switch-tab" data-tab="rivals" data-testid="pd-tab-rivals">
          <span class="pd-tab-icon" aria-hidden="true">⚡</span> Rivals
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
      <div id="pd-tabpanel-opponents" role="tabpanel" aria-labelledby="pd-tab-opponents" data-testid="pd-tabpanel-opponents" ${isOpp ? '' : 'hidden'}>
        <div class="pd-summary" data-testid="pd-opp-summary" aria-live="polite"></div>
        <div class="pd-opp-content" data-testid="pd-opp-content" aria-live="polite" aria-busy="true"></div>
        <div class="pd-pagination" data-testid="pd-opp-pagination"></div>
      </div>
      <div id="pd-tabpanel-rivals" role="tabpanel" aria-labelledby="pd-tab-rivals" data-testid="pd-tabpanel-rivals" ${isRiv ? '' : 'hidden'}>
        <div class="pd-seg" role="group" aria-label="Rivals view segment">
          ${segBtn('rivals', 'Rivals', 'pd-seg-rivals')}
          ${segBtn('following', 'Following', 'pd-seg-following')}
          ${segBtn('suggested', 'Suggested', 'pd-seg-suggested')}
        </div>
        <div class="pd-summary" data-testid="pd-riv-summary" aria-live="polite"></div>
        <div class="pd-riv-content" data-testid="pd-riv-content" aria-live="polite" aria-busy="true"></div>
        <div class="pd-pagination" data-testid="pd-riv-pagination"></div>
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

// ── Rivals tab data loading ──

/**
 * Load the active Rivals segment. The 'suggested' segment is a single
 * page (no pagination — it's a bounded recommendation list); 'rivals'
 * and 'following' are paginated lists of the caller's relationships.
 * @param {HTMLElement} target
 */
async function loadRivals(target) {
  const seg = view.rivals.segment;
  if (seg === 'suggested') {
    await loadSuggestedRivals(target);
    return;
  }
  const kind = seg === 'rivals' ? RelationshipKind.RIVAL : RelationshipKind.FOLLOW;
  const loadId = ++view.rivals._loadId;
  if (view.rivals._abortCtrl) view.rivals._abortCtrl.abort();
  const abortCtrl = new AbortController();
  view.rivals._abortCtrl = abortCtrl;
  const signal = abortCtrl.signal;

  view.rivals.loading = true;
  view.rivals.error = null;
  renderRivalsContent(target);
  try {
    const res = await fetchRelationships({
      kind,
      limit: RELATIONSHIPS_PAGE_SIZE,
      offset: view.rivals.offset,
      signal,
    });
    if (loadId !== view.rivals._loadId) return; // stale
    view.rivals.available = res.available;
    view.rivals.authenticated = res.authenticated;
    view.rivals.entries = res.entries;
    view.rivals.isLastPage = res.entries.length < RELATIONSHIPS_PAGE_SIZE;
    view.rivals._loaded = true;
  } catch (err) {
    if (loadId !== view.rivals._loadId) return; // stale
    if (err?.name === 'AbortError') return;
    view.rivals.error = err?.message ?? 'Relationships temporarily unavailable.';
  } finally {
    if (loadId === view.rivals._loadId) {
      view.rivals.loading = false;
      renderRivalsContent(target);
      renderRivalsSummary(target);
      renderRivalsPagination(target);
    }
  }
}

/**
 * Load the suggested-rivals list (single page, no pagination).
 * @param {HTMLElement} target
 */
async function loadSuggestedRivals(target) {
  const loadId = ++view.rivals._loadId;
  if (view.rivals._abortCtrl) view.rivals._abortCtrl.abort();
  const abortCtrl = new AbortController();
  view.rivals._abortCtrl = abortCtrl;
  const signal = abortCtrl.signal;

  view.rivals.loading = true;
  view.rivals.error = null;
  renderRivalsContent(target);
  try {
    const res = await fetchSuggestedRivals({ limit: DEFAULT_SUGGESTED_RIVALS_LIMIT, signal });
    if (loadId !== view.rivals._loadId) return; // stale
    view.rivals.available = res.available;
    view.rivals.authenticated = res.authenticated;
    view.rivals.entries = res.entries;
    view.rivals.isLastPage = true; // suggested is a single bounded page
    view.rivals._loaded = true;
  } catch (err) {
    if (loadId !== view.rivals._loadId) return; // stale
    if (err?.name === 'AbortError') return;
    view.rivals.error = err?.message ?? 'Suggested rivals temporarily unavailable.';
  } finally {
    if (loadId === view.rivals._loadId) {
      view.rivals.loading = false;
      renderRivalsContent(target);
      renderRivalsSummary(target);
      renderRivalsPagination(target);
    }
  }
}

// ── Rivals tab rendering ──

function renderRivalsSummary(target) {
  const el = target.querySelector('[data-testid="pd-riv-summary"]');
  if (!el) return;
  if (!view.rivals.available || view.rivals.loading) { el.innerHTML = ''; return; }
  if (view.rivals.error) { el.innerHTML = ''; return; }
  const n = view.rivals.entries.length;
  if (n === 0) { el.innerHTML = ''; return; }
  const seg = view.rivals.segment;
  if (seg === 'suggested') {
    el.innerHTML = `<div class="pd-count" data-testid="pd-riv-count">Top ${n} suggested rival${n === 1 ? '' : 's'} by head-to-head intensity</div>`;
    return;
  }
  const pageStart = view.rivals.offset + 1;
  const pageEnd = view.rivals.offset + n;
  const label = seg === 'rivals' ? 'Rivals' : 'Followed players';
  el.innerHTML = `<div class="pd-count" data-testid="pd-riv-count">${label} ${pageStart}–${pageEnd}</div>`;
}

function renderRivalsContent(target) {
  const el = target.querySelector('[data-testid="pd-riv-content"]');
  if (!el) return;
  el.setAttribute('aria-busy', String(view.rivals.loading));

  if (view.rivals.loading) {
    el.innerHTML = renderRivalsSkeleton();
    return;
  }
  if (!view.rivals.available) {
    el.innerHTML = view.rivals.authenticated
      ? renderRivalsUnavailable()
      : renderRivalsSignInRequired();
    return;
  }
  if (view.rivals.error) {
    el.innerHTML = renderRivalsError(view.rivals.error);
    return;
  }
  if (view.rivals.entries.length === 0) {
    el.innerHTML = renderRivalsEmpty();
    return;
  }
  el.innerHTML = renderRivalsCards(view.rivals.entries);
}

function renderRivalsSkeleton() {
  const cards = Array.from({ length: 6 }, () =>
    `<div class="pd-card pd-skeleton-card" aria-hidden="true">
      <span class="pd-skeleton pd-sk-avatar"></span>
      <div class="pd-skeleton-rows">
        <span class="pd-skeleton pd-sk-name"></span>
        <span class="pd-skeleton pd-sk-meta"></span>
        <span class="pd-skeleton pd-sk-stats"></span>
      </div>
    </div>`).join('');
  return `<div class="pd-grid" role="status" aria-label="Loading relationships">${cards}</div>`;
}

function renderRivalsUnavailable() {
  return `<div class="pd-empty" data-testid="pd-riv-unavailable">
    <strong>Rivals unavailable in local mode.</strong>
    <p>Connect to Intrilex Online and sign in to track your rivals and follows.</p>
  </div>`;
}

function renderRivalsSignInRequired() {
  return `<div class="pd-empty" data-testid="pd-riv-signin-required">
    <span class="pd-empty-icon" aria-hidden="true">⊕</span>
    <strong>Sign in to manage your rivals and follows.</strong>
    <p>Relationships are tied to your account. Sign in with Discord or Google to track players you compete with.</p>
    <a class="btn btn-sm" href="#/auth" data-testid="pd-riv-signin-link">Sign In</a>
  </div>`;
}

function renderRivalsError(msg) {
  return `<div class="pd-empty pd-error" role="alert" data-testid="pd-riv-error">
    <strong>Relationships temporarily unavailable.</strong>
    <p class="pd-error-detail mono">${esc(msg)}</p>
    <button class="btn btn-sm" data-action="riv-retry" data-testid="pd-riv-retry">Retry</button>
  </div>`;
}

function renderRivalsEmpty() {
  const seg = view.rivals.segment;
  if (seg === 'suggested') {
    return `<div class="pd-empty" data-testid="pd-riv-empty-suggested">
      <span class="pd-empty-icon" aria-hidden="true">⚡</span>
      <strong>No suggested rivals yet.</strong>
      <p>Play online matches to build a head-to-head history. We'll surface your most competitive opponents here.</p>
      <a class="btn btn-sm" href="#/play/online" data-testid="pd-riv-play-link">Play Online</a>
    </div>`;
  }
  if (seg === 'rivals') {
    return `<div class="pd-empty" data-testid="pd-riv-empty-rivals">
      <span class="pd-empty-icon" aria-hidden="true">⚡</span>
      <strong>No rivals yet.</strong>
      <p>Mark a player as a rival from their profile to track your head-to-head here. Rivals are players you want to beat.</p>
      <a class="btn btn-sm" href="#/players" data-testid="pd-riv-browse-link">Browse Players</a>
    </div>`;
  }
  return `<div class="pd-empty" data-testid="pd-riv-empty-following">
    <span class="pd-empty-icon" aria-hidden="true">◈</span>
    <strong>Not following anyone yet.</strong>
    <p>Follow players from their profile to keep them in one place. Following is private — only you see your list.</p>
    <a class="btn btn-sm" href="#/players" data-testid="pd-riv-browse-link2">Browse Players</a>
  </div>`;
}

function renderRivalsCards(entries) {
  const cards = entries.map(renderRivalsCard).join('');
  return `<ul class="pd-grid pd-riv-grid" data-testid="pd-riv-grid" role="list">${cards}</ul>`;
}

/**
 * Render a single relationship card. Shows the safe public projection
 * plus the head-to-head (caller's perspective), rivalry intensity
 * badge, and mutual-rival marker. The whole card links to the target's
 * public profile. Suggested-rival cards include a "Rival" button.
 * @param {import('@intrilex/account-domain/relationships').RelationshipEntry} entry
 */
function renderRivalsCard(entry) {
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

  // Head-to-head (caller's perspective)
  const h2hText = formatRelationshipHeadToHead(h2h);
  const h2hWinRate = h2h.games > 0 ? pct(h2h.winRate) : '—';
  const h2hLine = h2h.games > 0
    ? `<span class="pd-h2h-record mono">${esc(h2hText)}</span> <span class="pd-h2h-meta">· ${esc(h2hWinRate)} win rate</span>`
    : '<span class="pd-h2h-record pd-h2h-none">No completed games</span>';

  // Rivalry intensity badge (only meaningful for rivals/suggested)
  const seg = view.rivals.segment;
  const showIntensity = seg === 'rivals' || seg === 'suggested';
  const intensityBadge = showIntensity && h2h.games > 0
    ? `<span class="pd-intensity-badge pd-intensity-${esc(entry.intensity)}" data-testid="pd-intensity">${esc(rivalryIntensityLabel(entry.intensity))}</span>`
    : '';

  // Mutual rival marker
  const mutualBadge = entry.isMutualRival
    ? `<span class="pd-mutual-badge" data-testid="pd-mutual-rival" title="You both rival each other">⇌ Mutual Rival</span>`
    : '';

  // Nemesis / Kryptonite badges (v0.28.0 — Epoch 4)
  const nemesis = detectNemesis(h2h);
  const kryptonite = detectKryptonite(h2h);
  const nemesisBadge = nemesis
    ? `<span class="pd-nemesis-badge pd-nemesis" data-testid="pd-nemesis" title="${esc(nemesis.description)}">${nemesis.icon} ${esc(nemesis.label)}</span>`
    : '';
  const kryptoniteBadge = kryptonite
    ? `<span class="pd-nemesis-badge pd-kryptonite" data-testid="pd-kryptonite" title="${esc(kryptonite.description)}">${kryptonite.icon} ${esc(kryptonite.label)}</span>`
    : '';

  // Rival milestones (v0.28.0 — Epoch 4) — show top 3 earned milestones
  const milestones = deriveRivalMilestones(h2h);
  const milestoneBadges = milestones.slice(0, 3).map(m =>
    `<span class="pd-milestone-badge" data-testid="pd-milestone" title="${esc(m.description)}">${m.icon} ${esc(m.label)}</span>`
  ).join('');

  // Achievements (only when public — null means hidden)
  const achLine = entry.earnedAchievements != null
    ? `<span class="pd-ach">${entry.earnedAchievements} achievement${entry.earnedAchievements === 1 ? '' : 's'}</span>`
    : '';

  // Suggested-rival cards get a "Rival" button to act immediately
  const actionBtn = seg === 'suggested'
    ? `<button class="btn btn-sm pd-riv-action" data-action="riv-add-rival" data-pid="${pid}" data-testid="pd-riv-add-rival" aria-label="Mark ${name} as rival">+ Rival</button>`
    : '';

  return `<li class="pd-card pd-riv-card" role="listitem" data-testid="pd-riv-card" data-pid="${pid}">
    <a class="pd-card-link" href="#/player/${encodeURIComponent(id.publicPlayerId)}" data-testid="pd-riv-card-link" aria-label="View ${name}'s profile — head-to-head ${esc(h2hText)}">
      <span class="pd-card-glyph" aria-hidden="true">${glyph}</span>
      <span class="pd-card-body">
        <span class="pd-card-name">${name}</span>
        ${handle}
        <span class="pd-card-rank" data-tier="${esc(rank.tier)}">${esc(rankText)}</span>
        <span class="pd-card-ir mono">${esc(irText)}</span>
        <span class="pd-h2h mono" data-testid="pd-riv-h2h">${h2hLine}</span>
        ${intensityBadge}${mutualBadge}${nemesisBadge}${kryptoniteBadge}
        ${milestoneBadges}
        ${achLine}
      </span>
    </a>
    ${actionBtn}
  </li>`;
}

function renderRivalsPagination(target) {
  const el = target.querySelector('[data-testid="pd-riv-pagination"]');
  if (!el) return;
  // Suggested segment is a single bounded page — no pagination.
  if (view.rivals.segment === 'suggested') { el.innerHTML = ''; return; }
  if (!view.rivals.available || view.rivals.loading || view.rivals.error) { el.innerHTML = ''; return; }
  const hasPrev = view.rivals.offset > 0;
  const hasNext = view.rivals.entries.length >= RELATIONSHIPS_PAGE_SIZE && !view.rivals.isLastPage;
  if (!hasPrev && !hasNext) { el.innerHTML = ''; return; }
  const page = Math.floor(view.rivals.offset / RELATIONSHIPS_PAGE_SIZE) + 1;
  el.innerHTML = `<div class="pd-pagination-bar">
    <button class="btn btn-sm pd-page-btn" data-action="riv-prev" data-testid="pd-riv-prev" ${hasPrev ? '' : 'disabled aria-disabled="true"'}>&larr; Prev</button>
    <span class="pd-page-num" aria-label="Page ${page}">Page ${page}</span>
    <button class="btn btn-sm pd-page-btn" data-action="riv-next" data-testid="pd-riv-next" ${hasNext ? '' : 'disabled aria-disabled="true"'}>Next &rarr;</button>
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
        if (newTab !== view.tab && (newTab === 'directory' || newTab === 'opponents' || newTab === 'rivals')) {
          switchTab(target, newTab);
        }
      } else if (action === 'rivals-segment') {
        const newSeg = btn.dataset.segment;
        if (newSeg !== view.rivals.segment && (newSeg === 'rivals' || newSeg === 'following' || newSeg === 'suggested')) {
          view.rivals.segment = newSeg;
          view.rivals.offset = 0;
          view.rivals._loaded = false; // force reload on segment change
          syncUrlFromState();
          updateRivalsSegmentButtons(target);
          loadRivals(target);
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
      } else if (action === 'riv-prev') {
        view.rivals.offset = Math.max(0, view.rivals.offset - RELATIONSHIPS_PAGE_SIZE);
        loadRivals(target);
        scrollToTop(target);
      } else if (action === 'riv-next') {
        view.rivals.offset = view.rivals.offset + RELATIONSHIPS_PAGE_SIZE;
        loadRivals(target);
        scrollToTop(target);
      } else if (action === 'riv-add-rival') {
        // Suggested-rival quick action: mark as rival and remove the card.
        // The button lives inside the card <li>; we don't navigate (the
        // click is on the button, not the anchor).
        ev.stopPropagation();
        const pid = btn.dataset.pid;
        if (pid) handleQuickRival(target, pid, btn);
      } else if (action === 'retry') {
        load(target);
      } else if (action === 'opp-retry') {
        loadOpponents(target);
      } else if (action === 'riv-retry') {
        loadRivals(target);
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
 * Switch between the Directory, Recent Opponents, and Rivals tabs.
 * Updates the tab attributes (aria-selected, tabindex, hidden),
 * persists the active tab to the URL, and lazy-loads the tab's data
 * on first visit.
 * @param {HTMLElement} target
 * @param {PlayerTab} newTab
 */
function switchTab(target, newTab) {
  view.tab = newTab;
  syncUrlFromState();
  const tabs = [
    ['directory', '#pd-tab-directory', '#pd-tabpanel-directory'],
    ['opponents', '#pd-tab-opponents', '#pd-tabpanel-opponents'],
    ['rivals', '#pd-tab-rivals', '#pd-tabpanel-rivals'],
  ];
  let activeTabEl = null;
  for (const [name, tabSel, panelSel] of tabs) {
    const tabEl = target.querySelector(tabSel);
    const panelEl = target.querySelector(panelSel);
    if (!tabEl || !panelEl) continue;
    const isActive = name === newTab;
    tabEl.classList.toggle('pd-tab-active', isActive);
    tabEl.setAttribute('aria-selected', String(isActive));
    tabEl.setAttribute('tabindex', isActive ? '0' : '-1');
    panelEl.hidden = !isActive;
    if (isActive) activeTabEl = tabEl;
  }
  // Focus the newly-active tab button for WAI-ARIA roving tabindex
  if (activeTabEl) activeTabEl.focus();
  // Lazy-load on first visit
  if (newTab === 'opponents' && !view.opp._loaded) {
    loadOpponents(target);
  } else if (newTab === 'rivals' && !view.rivals._loaded) {
    loadRivals(target);
  }
}

/**
 * Update the segmented-control button states for the Rivals tab without
 * re-rendering the whole shell.
 * @param {HTMLElement} target
 */
function updateRivalsSegmentButtons(target) {
  const seg = view.rivals.segment;
  for (const btn of target.querySelectorAll('[data-action="rivals-segment"]')) {
    const isActive = btn.dataset.segment === seg;
    btn.classList.toggle('pd-seg-btn-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  }
}

/**
 * Handle the "quick add rival" action from a suggested-rival card.
 * Calls setRival and removes the card on success (the player moves to
 * the Rivals segment). Shows inline feedback on failure.
 * @param {HTMLElement} target
 * @param {string} pid - The target's public player id.
 * @param {HTMLButtonElement} btn - The clicked button.
 */
async function handleQuickRival(target, pid, btn) {
  // Lazy import to avoid loading the data layer until first interaction.
  const { setRival } = await import('../play/players/relationships-data.js?v=73653ac8207b');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Adding…';
  try {
    const res = await setRival(pid);
    if (res.ok) {
      // Remove the card from the suggested list (it's now a rival).
      const card = btn.closest('[data-testid="pd-riv-card"]');
      if (card) {
        card.style.transition = 'opacity 180ms ease, transform 180ms ease';
        card.style.opacity = '0';
        card.style.transform = 'translateX(8px)';
        setTimeout(() => {
          card.remove();
          // If the grid is now empty, re-render the empty state.
          const grid = target.querySelector('[data-testid="pd-riv-grid"]');
          if (grid && grid.children.length === 0) {
            view.rivals.entries = [];
            renderRivalsContent(target);
            renderRivalsSummary(target);
          }
        }, 200);
      }
    } else {
      btn.disabled = false;
      btn.textContent = original;
      // Brief inline error; the next render will clear it.
      btn.classList.add('pd-riv-action-error');
      btn.title = res.error ?? 'Could not mark as rival';
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    btn.classList.add('pd-riv-action-error');
    btn.title = err?.message ?? 'Could not mark as rival';
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
