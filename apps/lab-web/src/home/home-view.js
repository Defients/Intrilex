// ═══════════════════════════════════════════════════════════════
// home-view.js — Homepage markup builders (pure string → HTML)
//
// Replaces the retired W.I.P. "coming soon" page and the v0.24.2
// launcher card as the canonical front door of Intrilex.
//
// Composition (canonical):
//   HEADER → CINEMATIC HERO → LIVE PULSE
//   → PRESEASON | LATEST NEWS | EXPLORE
//   → FOOTER
//
// Shared chrome (video bg, aurora, orbital, topbar brand, account
// menu, continue slot, footer) intentionally reuses the existing
// landing-* classes so updateAccountDropdown(), the mobile
// bottom-sheet CSS, and the continue-card contract keep working.
//
// Purity contract: no DOM, no fetch, no timers — every function is
// a pure string builder so the module is importable under node:test.
// Dynamic regions ship as skeletons; home.js hydrates them via
// data-home-* hooks after render.
// ═══════════════════════════════════════════════════════════════

// Same escape semantics as state.js esc() — duplicated deliberately
// so this module stays DOM-free and Node-testable.
const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ACCOUNT_AVATAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>`;

const LAB_ICON_SVG = `<svg class="lab-button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M9 3h6M10 3v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9.5V3"/>
  <circle cx="12" cy="15" r="1.5"/>
  <path d="M9.5 15.5l2-1M14.5 15.5l-2-1" opacity=".6"/>
</svg>`;

const REDDIT_SVG = `<svg class="reddit-emblem" viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="12" fill="#FF4500"/>
  <path fill="#fff" d="M19.9 12a1.6 1.6 0 0 0-2.7-1.1 7.9 7.9 0 0 0-4.3-1.4l.9-2.9 2.4.6a1.2 1.2 0 1 0 .1-.6l-2.8-.7a.3.3 0 0 0-.4.2l-1 3.4a7.9 7.9 0 0 0-4.3 1.4A1.6 1.6 0 1 0 6 13.4a3 3 0 0 0 0 .5c0 2.4 2.7 4.3 6 4.3s6-1.9 6-4.3a3 3 0 0 0 0-.5 1.6 1.6 0 0 0 1.9-1.4zM9.3 13a1.1 1.1 0 1 1 1.1 1.1A1.1 1.1 0 0 1 9.3 13zm6.1 2.9a4 4 0 0 1-2.6.8h-1.6a4 4 0 0 1-2.6-.8.3.3 0 0 1 .4-.4 3.4 3.4 0 0 0 2.2.6h1.6a3.4 3.4 0 0 0 2.2-.6.3.3 0 0 1 .4.4zm-.8-1.8A1.1 1.1 0 1 1 15.7 13a1.1 1.1 0 0 1-1.1 1.1z"/>
</svg>`;

/** Primary header navigation — all real destinations. */
const PRIMARY_NAV = [
  { href: '#/play', label: 'PLAY' },
  { href: '#/play/academy', label: 'LEARN' },
  { href: '#/cards', label: 'CARDS' },
  { href: '#/leaderboard', label: 'RANKINGS' },
  { href: '#/tournaments', label: 'TOURNAMENTS' },
  { href: '#/release-notes', label: 'NEWS' },
  { href: 'https://reddit.com/r/intrilex', label: 'COMMUNITY', external: true },
];

/** EXPLORE lower panel — four real ecosystem routes (2 × 2). */
const EXPLORE_DESTINATIONS = [
  { href: '#/rules', label: 'RULES', sub: 'Official rulebook', icon: '§' },
  { href: '#/cards', label: 'CARDS', sub: 'Card library', icon: '🃏' },
  { href: '#/leaderboard', label: 'RANKINGS', sub: 'Global ladder', icon: '★' },
  { href: 'https://reddit.com/r/intrilex', label: 'COMMUNITY', sub: 'Reddit & more', icon: REDDIT_SVG, external: true },
];

/**
 * Render the full homepage shell. Dynamic regions (pulse, leaders,
 * news, preseason stats) render as skeletons and are hydrated by
 * home.js via the data-home-* hooks.
 *
 * @param {Object} [opts]
 * @param {string} [opts.labVersion]
 * @param {string} [opts.rulesVersion]
 * @returns {string} HTML
 */
export function renderHomePage({ labVersion = '', rulesVersion = '' } = {}) {
  return `<div class="landing-app home-app">
    <video class="landing-video-bg" autoplay muted loop playsinline preload="metadata" aria-hidden="true" data-mobile-skip>
      <source src="assets/landing1.mp4" type="video/mp4" />
    </video>
    <div class="landing-video-overlay" aria-hidden="true"></div>
    <div class="landing-aurora" aria-hidden="true"></div>
    <div class="landing-grid-bg" aria-hidden="true"></div>
    <div class="landing-orbital" aria-hidden="true"></div>
    <a class="skip skip-link" href="#landing-main">Skip to content</a>
    <header class="landing-topbar home-topbar">
      <a class="landing-brand" href="#/" aria-label="Intrilex home">
        <img src="assets/intrilex-name.png" alt="INTRILEX" class="landing-brand-logo" />
        <small class="landing-brand-sub">TACTICAL PLAYING CARD GAME</small>
      </a>
      <nav class="home-nav" aria-label="Primary">
        <ul class="home-nav-list">${PRIMARY_NAV.map(n => `<li><a class="home-nav-link" href="${esc(n.href)}"${n.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(n.label)}</a></li>`).join('')}</ul>
      </nav>
      <nav class="landing-utility-nav home-utility" aria-label="Utility navigation">
        <div id="landing-continue-slot" aria-live="polite"><a class="landing-continue-btn home-play-now" href="#/play" aria-label="Play now"><svg class="landing-continue-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l14 9-14 9V3z"/></svg><span class="landing-continue-label">PLAY NOW</span></a></div>
        <a href="#/sim" class="lab-button" aria-label="Open Simulation Lab">
          ${LAB_ICON_SVG}
          <span class="lab-button-label">Lab</span>
          <svg class="lab-button-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l5 5-5 5"/></svg>
        </a>
        <button class="home-nav-toggle" data-home-nav-toggle aria-expanded="false" aria-controls="home-nav-drawer" aria-label="Open navigation menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <div class="account-menu" data-account-menu>
          <button class="account-trigger" data-account-trigger aria-label="Account menu" aria-expanded="false" aria-haspopup="menu">
            <span class="account-avatar" aria-hidden="true">${ACCOUNT_AVATAR_SVG}</span>
            <span class="account-name">Guest</span>
            <svg class="account-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l5 5 5-5"/></svg>
          </button>
          <div class="account-dropdown" data-account-dropdown role="menu" aria-label="Account">
            <div class="account-dropdown-header">
              <span class="account-dropdown-avatar" aria-hidden="true">${ACCOUNT_AVATAR_SVG}</span>
              <div class="account-dropdown-id">
                <strong>Guest Player</strong>
                <small>Not signed in</small>
              </div>
            </div>
            <div class="account-dropdown-divider"></div>
            <a class="account-dropdown-item" href="#/profile" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
              <span>Profile</span>
            </a>
            <a class="account-dropdown-item" href="#/history" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <span>Match History</span>
            </a>
            <a class="account-dropdown-item" href="#/achievements" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg>
              <span>Achievements</span>
            </a>
            <a class="account-dropdown-item" href="#/settings" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06-.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06-.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 1 4 0v.09a1.65 1.65 0 0 0 1-1.51 1.65 1.65 0 0 0-1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.65V21h.01z"/></svg>
              <span>Settings</span>
            </a>
            <div class="account-dropdown-divider"></div>
            <a class="account-dropdown-item sign-in" href="#/auth" role="menuitem" data-account-signin>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>
              <span>Sign In</span>
            </a>
          </div>
        </div>
      </nav>
      <div class="home-nav-drawer" id="home-nav-drawer" data-home-nav-drawer hidden>
        <ul class="home-nav-drawer-list">${PRIMARY_NAV.map(n => `<li><a class="home-nav-link" href="${esc(n.href)}"${n.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(n.label)}</a></li>`).join('')}</ul>
      </div>
    </header>
    <main id="landing-main" class="home-main" tabindex="-1">
      <section class="home-hero" aria-labelledby="home-hero-title">
        <div class="home-hero-copy">
          <p class="home-eyebrow">TACTICAL PLAYING CARD GAME</p>
          <h1 class="home-title" id="home-hero-title">STRATEGY LIVES<br /><span class="home-title-accent">BEYOND LUCK</span></h1>
          <p class="home-tagline">A tactical card game of public score, disruption, and perfectly timed commitment.</p>
          <div class="home-modes">
            <a class="home-mode-btn solo" href="#/play/new" data-testid="home-solo-btn">
              <span class="home-mode-kicker" aria-hidden="true">&#9679;</span>
              <span class="home-mode-text"><strong>PLAY SOLO DUEL</strong><small>Battle against adaptive AI</small></span>
              <span class="home-mode-arrow" aria-hidden="true">&rarr;</span>
            </a>
            <a class="home-mode-btn direct" href="#/play/online" data-testid="home-direct-btn">
              <span class="home-mode-kicker" aria-hidden="true">&#9679;</span>
              <span class="home-mode-text"><strong>PLAY DIRECT DUEL</strong><small>Compete against real players online</small></span>
              <span class="home-mode-arrow" aria-hidden="true">&rarr;</span>
            </a>
          </div>
          <p class="home-hero-footnote">New to Intrilex? <a href="#/play/academy">Start with the Academy</a> &middot; <a href="#/rules">Read the official rules</a></p>
        </div>
        <div class="home-hero-visual" aria-hidden="true">
          <div class="home-hero-halo"></div>
          <div class="home-hero-ring"></div>
          <div class="home-hero-suits"><span class="suit s-spade">&#9824;</span><span class="suit s-heart">&#9829;</span><span class="suit s-diamond">&#9830;</span><span class="suit s-club">&#9827;</span></div>
          <div class="home-card-fan">
            <img class="home-fan-card c1" src="assets/card-art/as.webp" alt="" />
            <img class="home-fan-card c2" src="assets/card-art/kh.webp" alt="" />
            <img class="home-fan-card c3" src="assets/card-art/qs.webp" alt="" />
            <img class="home-fan-card c4" src="assets/card-art/jd.webp" alt="" />
            <img class="home-fan-card c5" src="assets/card-art/rj.webp" alt="" />
          </div>
          <img class="home-hero-crest" src="assets/intrilex-crest.png" alt="" />
        </div>
      </section>
      <section class="home-pulse" aria-label="Live game activity" data-home-pulse hidden>
        <div class="home-pulse-head">
          <span class="home-pulse-dot" data-home-pulse-dot aria-hidden="true"></span>
          <strong class="home-pulse-title">LIVE</strong>
          <span class="home-pulse-updated" data-home-pulse-updated role="status"></span>
        </div>
        <div class="home-pulse-metrics" data-home-pulse-metrics></div>
      </section>
      <section class="home-grid" aria-label="Intrilex ecosystem">
        <article class="home-panel home-preseason" aria-labelledby="home-preseason-title">
          <div class="home-preseason-sigil" aria-hidden="true"><img src="assets/intrilex-crest.png" alt="" /></div>
          <header class="home-panel-head">
            <span class="home-panel-eyebrow" id="home-preseason-title">PRESEASON</span>
            <span class="home-live-badge" data-home-preseason-badge hidden><span class="home-live-badge-dot" aria-hidden="true"></span>LIVE NOW</span>
          </header>
          <h2 class="home-preseason-title">THE JOURNEY<br />BEGINS</h2>
          <p class="home-preseason-copy">Help shape the future of Intrilex. Play, compete, and be part of the growing community as we prepare for Season 01.</p>
          <div class="home-preseason-links">
            <span class="home-preseason-rules">Rules v${esc(rulesVersion)}</span>
            <a class="home-panel-link" href="#/seasons">Season archive &rarr;</a>
            <button type="button" class="home-text-link" data-ranking-system-card data-testid="ranking-system-button">Ranking System &mdash; how ranking works</button>
          </div>
        </article>
        <article class="home-panel home-news" aria-labelledby="home-news-title">
          <header class="home-panel-head">
            <span class="home-panel-eyebrow" id="home-news-title">LATEST NEWS</span>
            <a class="home-panel-link" href="#/release-notes">View all news &rarr;</a>
          </header>
          <div class="home-news-list" data-home-news>${renderNewsSkeleton()}</div>
        </article>
        <article class="home-panel home-explore" aria-labelledby="home-explore-title">
          <header class="home-panel-head">
            <span class="home-panel-eyebrow" id="home-explore-title">EXPLORE</span>
          </header>
          <div class="home-explore-grid">
            ${EXPLORE_DESTINATIONS.map(d => `<a class="home-explore-item" href="${esc(d.href)}"${d.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>
              <span class="home-explore-icon" aria-hidden="true">${d.icon}</span>
              <span class="home-explore-text"><strong>${esc(d.label)}</strong><small>${esc(d.sub)}</small></span>
              <span class="home-explore-arrow" aria-hidden="true">&rarr;</span>
            </a>`).join('')}
          </div>
        </article>
      </section>
    </main>
    <footer class="landing-footer home-footer">
      <span class="landing-footer-brand"><img src="assets/intrilex-icon.png" alt="IX" class="landing-footer-crest" /> INTRILEX</span>
      <nav class="landing-footer-legal" aria-label="Legal">
        <a href="#/privacy">Privacy</a>
        <a href="#/terms">Terms</a>
        <a href="#/release-notes">v${esc(labVersion)}</a>
      </nav>
      <a class="landing-footer-credit" href="https://deffy.me" target="_blank" rel="noopener noreferrer" aria-label="Created and Designed by Ðeffy Urz">
        <span class="landing-footer-credit-prefix">Created &amp; Designed by</span>
        <span class="landing-footer-credit-name">Ðeffy Urz</span>
      </a>
    </footer>
  </div>`;
}

// ── Live Pulse ──

/** Skeleton placeholders shown while the first stats fetch is in flight. */
export function renderPulseSkeleton() {
  const keys = ['online', 'liveDuels', 'duelsToday', 'topRating', 'avgQueue'];
  return keys.map(k => `<div class="home-metric skeleton" data-metric="${k}"><span class="home-metric-shimmer" aria-hidden="true"></span><span class="home-metric-label">${esc(metricLabel(k))}</span></div>`).join('');
}

/**
 * Render hydrated pulse metrics. Entries come from
 * home-data.js buildPulseMetrics(). Metrics whose source failed
 * (ok:false) are omitted entirely — the strip never shows '—' or
 * fabricated values.
 * @param {Array} metrics
 * @returns {string} HTML
 */
export function renderPulseMetricsHtml(metrics) {
  return (metrics ?? []).filter(m => m.ok && m.value != null).map(m => {
    const sub = m.sub ? esc(m.sub) : '';
    const inner = `<span class="home-metric-value">${esc(m.value)}</span>
      <span class="home-metric-label">${esc(m.label)}</span>
      ${sub ? `<span class="home-metric-sub">${sub}</span>` : ''}`;
    return m.href
      ? `<a class="home-metric linked" data-metric="${esc(m.key)}" href="${esc(m.href)}">${inner}</a>`
      : `<div class="home-metric" data-metric="${esc(m.key)}">${inner}</div>`;
  }).join('');
}

/** Pulse status text/dot state. */
export function renderPulseStatusText({ live, updatedLabel, partial }) {
  if (!live) return '';
  if (partial) return updatedLabel;
  return updatedLabel;
}

// ── Leaders ──

export function renderLeadersSkeleton() {
  return Array.from({ length: 3 }, () => `<li class="home-leader-row skeleton"><span class="home-leader-rank">–</span><span class="home-leader-name">…</span><span class="home-leader-rating">—</span></li>`).join('');
}

/**
 * Render the top-N leaderboard rows. Rank 1/2/3 get gold/silver/bronze.
 * @param {Array} entries - normalized entries from fetchTopRated()
 * @returns {string} HTML
 */
export function renderLeadersHtml(entries) {
  return (entries ?? []).map(e => {
    const medal = e.position === 1 ? ' gold' : e.position === 2 ? ' silver' : e.position === 3 ? ' bronze' : '';
    const name = esc(e.name);
    const rating = e.rating != null ? esc(String(e.rating)) : '—';
    const tier = e.tier && e.tier !== 'UNRANKED' ? `<span class="home-leader-tier">${esc(e.tier)}</span>` : '';
    const inner = `<span class="home-leader-rank${medal}">${e.position}</span>
      <span class="home-leader-id"><span class="home-leader-name">${name}</span>${tier}</span>
      <span class="home-leader-rating">${rating}</span>`;
    return e.publicPlayerId
      ? `<li><a class="home-leader-row" href="#/player/${encodeURIComponent(e.publicPlayerId)}">${inner}</a></li>`
      : `<li><span class="home-leader-row">${inner}</span></li>`;
  }).join('');
}

/** Honest empty/unavailable state for the leaders panel. */
export function renderLeadersEmpty(message = 'No rated players yet — placements are underway.') {
  return `<li class="home-leader-empty">${esc(message)}</li>`;
}

// ── News ──

export function renderNewsSkeleton() {
  return Array.from({ length: 2 }, () => `<div class="home-news-item skeleton"><span class="home-news-cat">·</span><span class="home-news-title">…</span></div>`).join('');
}

/**
 * Render changelog-derived news items.
 * @param {Array} items - from parseChangelogEntries()
 * @returns {string} HTML
 */
export function renderNewsHtml(items) {
  if (!items?.length) {
    return `<div class="home-news-empty">Release notes are published with each update.</div>`;
  }
  return items.map(n => `<a class="home-news-item" href="${esc(n.href)}">
    <span class="home-news-meta"><span class="home-news-cat">${esc(n.category)}</span>${n.date ? `<time class="home-news-date">${esc(n.date)}</time>` : ''}</span>
    <span class="home-news-title">${esc(n.version ? `${n.version} — ${n.title}` : n.title)}</span>
    ${n.excerpt ? `<span class="home-news-excerpt">${esc(n.excerpt)}</span>` : ''}
  </a>`).join('');
}

function metricLabel(key) {
  return {
    online: 'ONLINE PLAYERS',
    liveDuels: 'LIVE DUELS',
    duelsToday: 'DUELS TODAY',
    topRating: 'TOP RATING',
    avgQueue: 'AVG QUEUE',
  }[key] ?? key;
}
