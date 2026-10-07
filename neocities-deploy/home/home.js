// ═══════════════════════════════════════════════════════════════
// home.js — Homepage orchestrator (DOM bindings + data hydration)
//
// Owns the canonical Intrilex homepage (#/ and #/dev):
//   renderHome(root, ctx) → paints home-view.js markup, binds the
//   account menu / nav drawer / continue-card, then hydrates the
//   Live Pulse, Preseason Leaders, Latest News, and Preseason
//   micro-stats from real data sources via home-data.js.
//
// ctx supplies overlay openers + auth accessors from app.js so this
// module never reaches into app-level singletons.
// ═══════════════════════════════════════════════════════════════

import { esc } from '../state.js?v=037146099ebb';
import { LAB_VERSION, RULES_VERSION } from '../version.js?v=037146099ebb';
import { getMatchServerUrl } from '../play/network/match-server-config.js?v=037146099ebb';
import { fetchLeaderboard, fetchSeasons } from '../play/ranked/leaderboard-data.js?v=037146099ebb';
import { fetchDirectory } from '../play/players/players-data.js?v=037146099ebb';
import {
  renderHomePage,
  renderPulseMetricsHtml,
  renderPulseStatusText,
  renderLeadersHtml,
  renderLeadersEmpty,
  renderNewsHtml,
} from './home-view.js?v=037146099ebb';
import {
  HOME_PULSE_INTERVAL_MS,
  matchServerHttpBase,
  fetchHomeStats,
  fetchTopRated,
  fetchPreseasonContext,
  parseChangelogEntries,
  buildPulseMetrics,
  formatUpdatedAgo,
} from './home-data.js?v=037146099ebb';

// AbortController for the current homepage's listeners/timers.
// Aborted on each re-render to prevent accumulation (IRX-M41).
let _homeAbort = null;
let _pulseTimer = null;
let _pulseTicker = null;

/**
 * Render the homepage into the landing container and hydrate it.
 * @param {HTMLElement} root - the #landing-app container
 * @param {Object} ctx - overlay + auth callbacks supplied by app.js
 */
export function renderHome(root, ctx = {}) {
  if (!root) return;
  if (_homeAbort) _homeAbort.abort();
  _homeAbort = new AbortController();
  const { signal } = _homeAbort;
  stopPulseTimers();

  root.innerHTML = renderHomePage({ labVersion: LAB_VERSION, rulesVersion: RULES_VERSION });

  bindNavDrawer(root);
  bindAccountMenu(root, ctx, signal);
  // "How ranking works" → Ranking System overlay (same contract as the
  // retired launcher's rail card).
  root.querySelector('[data-ranking-system-card]')?.addEventListener('click', () => {
    ctx.openRankingSystemOverlay?.();
  });
  loadContinueCard(root);
  hydratePulse(root, signal);
  hydrateLeaders(root, signal);
  hydrateNews(root, signal);
  hydratePreseason(root, signal);
}

// ═══════════════════════════════════════════════════════════════
// BINDINGS
// ═══════════════════════════════════════════════════════════════

/** Mobile nav drawer (hamburger) — only wired to the toggle. */
function bindNavDrawer(root) {
  const toggle = root.querySelector('[data-home-nav-toggle]');
  const drawer = root.querySelector('[data-home-nav-drawer]');
  if (!toggle || !drawer) return;
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    drawer.hidden = !open;
  };
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });
  // Close drawer when any link inside it is activated.
  drawer.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
}

/**
 * Account dropdown menu — same contract as the retired launcher:
 * outside-click close, Escape close + focus restore, menu items
 * intercepted into landing overlays, dual-purpose sign-in/out.
 */
function bindAccountMenu(root, ctx, signal) {
  const accountTrigger = root.querySelector('[data-account-trigger]');
  const accountDropdown = root.querySelector('[data-account-dropdown]');
  const accountMenu = root.querySelector('[data-account-menu]');
  if (!accountTrigger || !accountDropdown || !accountMenu) return;

  const toggleMenu = (open) => {
    const isOpen = open ?? !accountMenu.classList.contains('open');
    accountMenu.classList.toggle('open', isOpen);
    accountTrigger.setAttribute('aria-expanded', String(isOpen));
  };
  accountTrigger.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (e) => {
    if (!accountMenu.contains(e.target)) toggleMenu(false);
  }, { signal });
  accountMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { toggleMenu(false); accountTrigger.focus(); }
  });
  accountDropdown.querySelectorAll('.account-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu(false);
      if (item.hasAttribute('data-account-signin')) {
        // IRX-M32: Auth module is lazy-loaded. Check cached state synchronously
        // via the module ref if already loaded; otherwise open the auth overlay.
        const authMod = ctx.getAuthController?.cached;
        if (authMod && (authMod.getAuthState() === 'AUTHENTICATED' || authMod.getAuthState() === 'ANONYMOUS')) {
          authMod.signOut().then((ok) => {
            if (ok) ctx.showToast?.('Signed out', { type: 'info' });
            else ctx.showToast?.('Sign-out failed', { type: 'error' });
          }).catch(() => ctx.showToast?.('Sign-out failed', { type: 'error' }));
        } else {
          ctx.openAuthOverlay?.();
        }
        return;
      }
      const href = item.getAttribute('href') || '';
      if (href === '#/profile') ctx.openProfileOverlay?.();
      else if (href === '#/history') ctx.openMatchHistoryOverlay?.();
      else if (href === '#/achievements') ctx.openAchievementsOverlay?.();
      else if (href === '#/settings') ctx.openSettingsOverlay?.();
      else if (href === '#/auth') ctx.openAuthOverlay?.();
    });
  });
}

/**
 * Async-load saved match state and upgrade the header utility slot to
 * "CONTINUE DUEL · Turn X" when a resumable save exists. Without a
 * save, the slot keeps the default PLAY NOW link.
 * Same persistence contract as the retired launcher (IRX-M42).
 */
async function loadContinueCard(root) {
  const slot = root.querySelector('#landing-continue-slot');
  if (!slot) return;
  try {
    const { isIndexedDBAvailable, listSaves } = await import('../play/persistence.js?v=037146099ebb');
    if (!isIndexedDBAvailable()) return;
    const saves = await listSaves();
    // Guard: user may have navigated away during the async work.
    if (!slot.isConnected) return;
    if (!saves || saves.length === 0) return;
    const save = saves.find(s => s.stableBoundary?.decisionFrameHash) ?? saves[0];
    if (!save) return;
    const sum = save.summary;
    const turn = sum?.turn ? `Turn ${sum.turn}` : (save.stableBoundary?.turn ? `Turn ${save.stableBoundary.turn}` : '');
    const score = (sum && typeof sum.humanScore === 'number') ? `${sum.humanScore}–${sum.opponentScore}` : '';
    const meta = [turn, score].filter(Boolean).join(' · ');
    slot.innerHTML = `<button class="landing-continue-btn" data-save-id="${esc(save.saveId)}" aria-label="Continue duel${meta ? ': ' + esc(meta) : ''}">
      <svg class="landing-continue-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 4v5h5"/></svg>
      <span class="landing-continue-label">CONTINUE DUEL</span>
      ${meta ? `<span class="landing-continue-meta">${esc(meta)}</span>` : ''}
    </button>`;
    const continueBtn = slot.querySelector('.landing-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        const saveId = continueBtn.dataset.saveId;
        if (!saveId) return;
        try { sessionStorage.setItem('intrilex-continue-save', saveId); } catch { /* unavailable */ }
        location.hash = '#/play/match';
      });
    }
  } catch { /* persistence unavailable — PLAY NOW remains */ }
}

// ═══════════════════════════════════════════════════════════════
// LIVE PULSE — real server metrics + top rating, 25s poll
// ═══════════════════════════════════════════════════════════════

function stopPulseTimers() {
  if (_pulseTimer) { clearInterval(_pulseTimer); _pulseTimer = null; }
  if (_pulseTicker) { clearInterval(_pulseTicker); _pulseTicker = null; }
}

async function hydratePulse(root, signal) {
  const metricsEl = root.querySelector('[data-home-pulse-metrics]');
  const updatedEl = root.querySelector('[data-home-pulse-updated]');
  const dotEl = root.querySelector('[data-home-pulse-dot]');
  const pulseEl = root.querySelector('[data-home-pulse]');
  if (!metricsEl) return;

  const httpBase = matchServerHttpBase(getMatchServerUrl());
  let lastOkAt = null;
  let lastLeaders = null;

  const refresh = async () => {
    // Server metrics and the top-rated lookup are independent: a
    // failure in either leaves the other's metrics intact (partial).
    const [statsRes, leadersRes] = await Promise.all([
      fetchHomeStats({ fetchImpl: fetch, httpBase, signal }),
      fetchTopRated({ fetchLeaderboardFn: fetchLeaderboard, fetchDirectoryFn: fetchDirectory, signal })
        .then(r => r.entries)
        .catch(() => null),
    ]);
    if (signal.aborted || !metricsEl.isConnected) return;

    if (Array.isArray(leadersRes) && leadersRes.length) lastLeaders = leadersRes;
    const metrics = buildPulseMetrics({ stats: statsRes.stats, leaders: lastLeaders });
    metricsEl.innerHTML = renderPulseMetricsHtml(metrics);

    const anyReal = metrics.some(m => m.ok);
    const allReal = metrics.every(m => m.ok);
    if (statsRes.ok || anyReal) lastOkAt = Date.now();
    const live = statsRes.ok;
    if (dotEl) dotEl.classList.toggle('off', !live);
    if (pulseEl) pulseEl.classList.toggle('degraded', !live);
    if (updatedEl) {
      updatedEl.textContent = renderPulseStatusText({
        live,
        partial: live && !allReal,
        updatedLabel: formatUpdatedAgo(lastOkAt),
      });
    }
  };

  await refresh();
  if (signal.aborted || !metricsEl.isConnected) return;

  // Poll every 25s; tick the "Updated Xs ago" label locally each second.
  _pulseTimer = setInterval(refresh, HOME_PULSE_INTERVAL_MS);
  _pulseTicker = setInterval(() => {
    if (!updatedEl?.isConnected || !lastOkAt) return;
    if (!updatedEl.textContent.startsWith('Updated')) return;
    updatedEl.textContent = formatUpdatedAgo(lastOkAt);
  }, 1000);
}

// ═══════════════════════════════════════════════════════════════
// PRESEASON LEADERS — canonical ladder, directory fallback
// ═══════════════════════════════════════════════════════════════

async function hydrateLeaders(root, signal) {
  const list = root.querySelector('[data-home-leaders]');
  if (!list) return;
  try {
    const res = await fetchTopRated({ fetchLeaderboardFn: fetchLeaderboard, fetchDirectoryFn: fetchDirectory, signal });
    if (signal.aborted || !list.isConnected) return;
    if (!res.available) {
      list.innerHTML = renderLeadersEmpty('Rankings unavailable — check back soon.');
      return;
    }
    if (!res.entries.length) {
      list.innerHTML = renderLeadersEmpty();
      return;
    }
    list.innerHTML = renderLeadersHtml(res.entries);
  } catch {
    if (list.isConnected) list.innerHTML = renderLeadersEmpty('Rankings unavailable — check back soon.');
  }
}

// ═══════════════════════════════════════════════════════════════
// LATEST NEWS — real changelog entries (same source as Release Notes)
// ═══════════════════════════════════════════════════════════════

async function hydrateNews(root, signal) {
  const box = root.querySelector('[data-home-news]');
  if (!box) return;
  try {
    const res = await fetch('data/changelog.md', { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    if (signal.aborted || !box.isConnected) return;
    box.innerHTML = renderNewsHtml(parseChangelogEntries(md));
  } catch {
    if (box.isConnected) box.innerHTML = renderNewsHtml(null);
  }
}

// ═══════════════════════════════════════════════════════════════
// PRESEASON — season status + directory player count (real data)
// ═══════════════════════════════════════════════════════════════

async function hydratePreseason(root, signal) {
  const playersEl = root.querySelector('[data-home-stat="players"]');
  const seasonsEl = root.querySelector('[data-home-stat="seasons"]');
  const badge = root.querySelector('[data-home-preseason-badge]');
  try {
    const ctx = await fetchPreseasonContext({ fetchSeasonsFn: fetchSeasons, fetchDirectoryFn: fetchDirectory, signal });
    if (signal.aborted) return;
    if (playersEl?.isConnected && ctx.playersListed != null) playersEl.textContent = ctx.playersListed.toLocaleString('en-US');
    if (seasonsEl?.isConnected && ctx.seasonsCount != null) seasonsEl.textContent = String(ctx.seasonsCount);
    if (badge?.isConnected && ctx.seasonStatus === 'active') badge.hidden = false;
  } catch { /* stats remain '—' */ }
}
