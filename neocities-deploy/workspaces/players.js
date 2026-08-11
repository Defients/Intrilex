// ═══════════════════════════════════════════════════════════════
// workspaces/players.js — Player Directory workspace
//
// The discovery surface between Profiles and the future social layer.
// Lists discoverable players (opt-in) with a safe public projection.
//
// Server-side search/filter/sort/pagination via the get_player_directory
// RPC — the browser never loads every player and sorts client-side.
//
// Features: search (handle/display name), tier filter, sort (rating,
// games, recent, newest, name), cursor/offset pagination, player cards
// that open public profiles, loading skeletons, error isolation, empty
// states (no discoverable players / no search matches), offline mode,
// URL state (q/rank/sort), responsive layout, accessibility (semantic
// landmarks, labels, keyboard, aria-live, reduced-motion).
//
// Privacy: cards expose only the safe public projection returned by the
// RPC. Hidden/private players are never enumerable. No "online" status
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
import { fetchDirectory } from '../play/players/players-data.js';

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
  view._mounted = true;
  // Sync state from the URL on entry so deep-links/shareable searches work
  syncStateFromUrl();
  target.innerHTML = renderShell();
  wireEvents(target);
  load(target);
}

/**
 * Teardown — clears pending timers and marks the view as unmounted.
 */
export function destroyPlayers() {
  clearTimeout(view._searchTimer);
  view._searchTimer = null;
  view._mounted = false;
  if (view._abortCtrl) { view._abortCtrl.abort(); view._abortCtrl = null; }
}

// ── URL state ──

/**
 * Read directory query state (q, rank, sort) from the location hash.
 * Falls back to current view state when absent.
 */
function syncStateFromUrl() {
  const hash = location.hash.replace(/^#\/players\??/, '');
  const params = new URLSearchParams(hash);
  const q = params.get('q');
  if (q != null) view.search = q;
  const rank = params.get('rank');
  if (rank != null) view.tier = TIER_FILTERS.some(t => t.value === rank) ? rank : 'ALL';
  const sort = params.get('sort');
  if (sort != null) view.sort = DIRECTORY_SORTS.includes(sort) ? sort : DirectorySort.RATING;
  // offset is not URL-persisted (avoids stale deep-links to empty pages)
}

/**
 * Persist directory query state (q, rank, sort) into the location hash
 * without triggering a re-render. Replaces the query string on
 * `#/players` and preserves the path.
 */
function syncUrlFromState() {
  const params = new URLSearchParams();
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

  return `<section class="panel pd-panel" data-testid="players-panel">
    <div class="panel-header pd-header">
      <div>
        <h2 data-testid="players-title">PLAYERS</h2>
        <p class="pd-subtitle" data-testid="players-subtitle">Find players, inspect profiles, rankings, and battle history.</p>
      </div>
    </div>
    <div class="panel-body pd-body">
      <div class="pd-controls">
        <div class="pd-search-wrap">
          <input type="search" id="pd-search" class="pd-search" value="${esc(view.search)}"
            placeholder="Search by name or @handle…"
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
    view.isLastPage = res.entries.length < DIRECTORY_PAGE_SIZE;
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
  el.innerHTML = `<div class="pd-count" data-testid="pd-count">
    Showing ${pageStart}–${pageEnd}${q}${tierLabel}
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
        leaderboardPosition: rank.isApex ? undefined : undefined,
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
  const clearBtn = target.querySelector('#pd-search-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      view.search = '';
      view.offset = 0;
      syncUrlFromState();
      const s = target.querySelector('#pd-search');
      if (s) s.value = '';
      updateSearchClear(target);
      load(target);
      if (s) s.focus();
    });
  }
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
    // Pagination
    target.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'prev') {
        view.offset = Math.max(0, view.offset - DIRECTORY_PAGE_SIZE);
        load(target);
        scrollToTop(target);
      } else if (action === 'next') {
        view.offset = view.offset + DIRECTORY_PAGE_SIZE;
        load(target);
        scrollToTop(target);
      } else if (action === 'retry') {
        load(target);
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
  }
}

/**
 * Show/hide the search clear button without re-rendering the whole shell.
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
    btn.innerHTML = '&times;';
    btn.addEventListener('click', () => {
      view.search = '';
      view.offset = 0;
      syncUrlFromState();
      const s = target.querySelector('#pd-search');
      if (s) { s.value = ''; s.focus(); }
      updateSearchClear(target);
      load(target);
    });
    wrap.appendChild(btn);
  } else if (!view.search && existing) {
    existing.remove();
  }
}

function scrollToTop(target) {
  const panel = target.closest('.pd-panel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
