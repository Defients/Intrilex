// ═══════════════════════════════════════════════════════════════
// home-data.js — Homepage data layer (pure / injectable)
//
// Supplies the homepage with REAL data only:
//   - Live Pulse metrics  → match-server /api/public/home-stats (HTTP)
//   - Top Rating / Leaders → canonical leaderboard RPC, then the
//     player directory (highest-rated) as a real-data fallback
//   - Latest News          → data/changelog.md (same source as the
//                            Release Notes workspace)
//   - Preseason stats      → ranked seasons RPC + directory count
//
// This module never fabricates values: every fetch can legitimately
// fail, and each metric carries an explicit ok flag so the view can
// render '—' instead of an invented number.
//
// Purity contract: NO direct DOM access, NO module-level browser
// singletons. Fetchers/parsers take injected dependencies so the
// whole module is importable and testable under node --test.
// ═══════════════════════════════════════════════════════════════

/** Poll cadence for the Live Pulse strip (ms). */
export const HOME_PULSE_INTERVAL_MS = 25000;
/** HTTP timeout for the home-stats request (ms). */
export const HOME_STATS_TIMEOUT_MS = 8000;
/** How many leaderboard rows / news items the homepage shows. */
export const HOME_LEADERS_LIMIT = 5;
export const HOME_NEWS_LIMIT = 2;

/**
 * Convert a match-server WebSocket URL (ws:// / wss://) into its HTTP(S)
 * base for REST endpoints. Returns null for anything else.
 *   wss://match.intrilex.cards → https://match.intrilex.cards
 *   ws://localhost:3099        → http://localhost:3099
 * @param {string|null|undefined} wsUrl
 * @returns {string|null}
 */
export function matchServerHttpBase(wsUrl) {
  if (!wsUrl || typeof wsUrl !== 'string') return null;
  if (wsUrl.startsWith('wss://')) return 'https://' + wsUrl.slice('wss://'.length);
  if (wsUrl.startsWith('ws://')) return 'http://' + wsUrl.slice('ws://'.length);
  return null;
}

/**
 * @typedef {Object} HomeStats
 * @property {number|null} onlinePlayers   - active WS connections
 * @property {number|null} activeMatches   - live duels in progress
 * @property {number|null} queueSize       - players waiting in matchmaking
 * @property {number|null} duelsToday      - terminal results recorded today (server-local day)
 * @property {number|null} avgQueueSeconds - mean queue wait (recent samples)
 * @property {string|null} updatedAt       - server ISO timestamp
 */

/**
 * Fetch aggregated public homepage stats from the match server.
 * Thin wrapper around GET /api/public/home-stats — the server performs
 * the aggregation so the browser never does N+1 work.
 *
 * @param {Object} opts
 * @param {typeof fetch} opts.fetchImpl
 * @param {string|null} opts.httpBase - from matchServerHttpBase()
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.timeoutMs] - defaults to HOME_STATS_TIMEOUT_MS (tests may shorten)
 * @returns {Promise<{ ok: true, stats: HomeStats } | { ok: false, stats: null }>}
 */
export async function fetchHomeStats({ fetchImpl, httpBase, signal, timeoutMs = HOME_STATS_TIMEOUT_MS } = {}) {
  if (!httpBase || typeof fetchImpl !== 'function') return { ok: false, stats: null };
  const request = composedRequestSignal(signal, timeoutMs);
  try {
    const res = await fetchImpl(`${httpBase}/api/public/home-stats`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      // The request obeys BOTH the caller's lifetime signal (navigation
      // aborts it) and the HTTP timeout (a stalled request terminates
      // after HOME_STATS_TIMEOUT_MS).
      signal: request.signal,
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, stats: null };
    const body = await res.json();
    return {
      ok: true,
      stats: {
        onlinePlayers: numOrNull(body?.onlinePlayers),
        activeMatches: numOrNull(body?.activeMatches),
        queueSize: numOrNull(body?.queueSize),
        duelsToday: numOrNull(body?.duelsToday),
        avgQueueSeconds: numOrNull(body?.avgQueueSeconds),
        updatedAt: typeof body?.updatedAt === 'string' ? body.updatedAt : null,
      },
    };
  } catch {
    return { ok: false, stats: null };
  } finally {
    request.dispose();
  }
}

/**
 * Parse the project changelog into compact news items for the homepage.
 * Headings look like: `## Unreleased — October 6, 2026 Lint baseline cleanup`
 * or `## v0.28.0 — September 30, 2026 Homecoming`.
 *
 * @param {string} md - raw changelog markdown
 * @param {number} [max=HOME_NEWS_LIMIT]
 * @returns {Array<{ category: string, version: string|null, date: string|null, title: string, excerpt: string, href: string }>}
 */
export function parseChangelogEntries(md, max = HOME_NEWS_LIMIT) {
  if (typeof md !== 'string' || !md) return [];
  const items = [];
  const sections = md.split(/\r?\n(?=## )/);
  for (const section of sections) {
    if (items.length >= max) break;
    const firstLineEnd = section.indexOf('\n');
    const heading = (firstLineEnd === -1 ? section : section.slice(0, firstLineEnd)).trim();
    if (!heading.startsWith('## ')) continue;
    const body = heading.slice(3).trim();

    // Split "vX.Y.Z — Month D, YYYY Title" / "Unreleased — Month D, YYYY Title"
    const dashSplit = body.split(/\s+—\s+/);
    const versionToken = dashSplit[0]?.trim() ?? '';
    const rest = dashSplit.slice(1).join(' — ').trim();
    const version = /^v?\d+\.\d+\.\d+/.test(versionToken) ? versionToken : null;
    const isUnreleased = /^unreleased/i.test(versionToken);

    // rest = "October 6, 2026 Lint baseline cleanup" — date ends after
    // "Month D, YYYY"; everything after is the title.
    const dateMatch = /^([A-Z][a-z]+ \d{1,2}, \d{4})\s*(.*)$/.exec(rest);
    const date = dateMatch ? dateMatch[1] : null;
    const title = (dateMatch ? dateMatch[2] : rest).trim() || versionToken;

    // Excerpt: first non-empty body line that isn't a subheading.
    const lines = section.slice(firstLineEnd === -1 ? section.length : firstLineEnd).split('\n');
    let excerpt = '';
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      excerpt = stripMarkdown(t.replace(/^[-*]\s+/, ''));
      break;
    }
    if (excerpt.length > 160) excerpt = excerpt.slice(0, 157).trimEnd() + '…';

    items.push({
      category: version ? 'RELEASE' : (isUnreleased ? 'UPDATE' : 'ANNOUNCEMENT'),
      version,
      date,
      title,
      excerpt,
      href: '#/release-notes',
    });
  }
  return items;
}

/**
 * Fetch the top rated players for PRESEASON LEADERS.
 * Primary source: canonical ranked leaderboard RPC (server-side ordering).
 * Fallback: player directory sorted by rating (still real data — useful
 * during preseason when nobody has completed placements).
 *
 * @param {Object} opts
 * @param {Function} opts.fetchLeaderboardFn - from play/ranked/leaderboard-data.js
 * @param {Function} opts.fetchDirectoryFn   - from play/players/players-data.js
 * @param {number} [opts.limit]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ available: boolean, source: 'leaderboard'|'directory'|null, entries: Array }>}
 */
export async function fetchTopRated({ fetchLeaderboardFn, fetchDirectoryFn, limit = HOME_LEADERS_LIMIT, signal } = {}) {
  // 1. Canonical ranked ladder (placements complete).
  try {
    if (typeof fetchLeaderboardFn === 'function') {
      const res = await fetchLeaderboardFn({ limit, offset: 0, signal });
      if (res?.available && Array.isArray(res.entries) && res.entries.length > 0) {
        return {
          available: true,
          source: 'leaderboard',
          entries: res.entries.map((e, i) => ({
            position: e.position ?? i + 1,
            name: e.displayName ?? 'Player',
            handle: e.handle ?? null,
            avatarUrl: e.avatarUrl ?? null,
            rating: typeof e.rating === 'number' ? e.rating : null,
            tier: e.tier ?? null,
            publicPlayerId: e.publicPlayerId ?? null,
          })),
        };
      }
    }
  } catch {
    // fall through to directory fallback
  }

  // 2. Player directory sorted by rating — real data, includes players
  //    still in placements (preseason reality).
  try {
    if (typeof fetchDirectoryFn === 'function') {
      const res = await fetchDirectoryFn({ sort: 'rating', limit, offset: 0, signal });
      if (res?.available && Array.isArray(res.entries) && res.entries.length > 0) {
        return {
          available: true,
          source: 'directory',
          entries: res.entries.map((e, i) => ({
            position: i + 1,
            name: e.player?.displayName ?? 'Player',
            handle: e.player?.handle ?? null,
            avatarUrl: e.player?.avatarUrl ?? null,
            rating: typeof e.rank?.rating === 'number' ? e.rank.rating : null,
            tier: e.rank?.tier ?? null,
            publicPlayerId: e.player?.publicPlayerId ?? null,
          })),
        };
      }
      return { available: res?.available ?? false, source: null, entries: [] };
    }
  } catch {
    // fall through
  }
  return { available: false, source: null, entries: [] };
}

/**
 * Fetch preseason context for the era panel micro-stats.
 * @param {Object} opts
 * @param {Function} opts.fetchSeasonsFn  - leaderboard-data.js fetchSeasons
 * @param {Function} opts.fetchDirectoryFn - players-data.js fetchDirectory
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ seasonName: string|null, seasonStatus: string|null, playersListed: number|null, seasonsCount: number|null }>}
 */
export async function fetchPreseasonContext({ fetchSeasonsFn, fetchDirectoryFn, signal } = {}) {
  const out = { seasonName: null, seasonStatus: null, playersListed: null, seasonsCount: null };
  await Promise.allSettled([
    (async () => {
      if (typeof fetchSeasonsFn !== 'function') return;
      const res = await fetchSeasonsFn('ranked', signal);
      if (res?.available && Array.isArray(res.seasons)) {
        out.seasonsCount = res.seasons.length;
        const active = res.seasons.find(s => s.status === 'active' || s.status === 'ACTIVE');
        if (active) {
          out.seasonName = active.name ?? null;
          out.seasonStatus = 'active';
        }
      }
    })(),
    (async () => {
      if (typeof fetchDirectoryFn !== 'function') return;
      // limit=1: we only need the total count, not rows.
      const res = await fetchDirectoryFn({ limit: 1, offset: 0, signal });
      if (res?.available && typeof res.total === 'number') out.playersListed = res.total;
    })(),
  ]);
  return out;
}

/**
 * Build the normalized metric list for the Live Pulse strip.
 * Every entry carries ok; the view renders '—' when ok is false.
 *
 * @param {Object} opts
 * @param {HomeStats|null} opts.stats   - null when stats fetch failed
 * @param {Array|null} opts.leaders     - top-rated entries (may be null)
 * @returns {Array<{ key: string, label: string, ok: boolean, value: string|null, sub: string|null, href: string|null }>}
 */
export function buildPulseMetrics({ stats, leaders } = {}) {
  const s = stats ?? null;
  const top = Array.isArray(leaders) && leaders.length ? leaders[0] : null;
  const fmtNum = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : null);
  return [
    {
      key: 'online',
      label: 'ONLINE PLAYERS',
      ok: s != null && s.onlinePlayers != null,
      value: s?.onlinePlayers != null ? fmtNum(s.onlinePlayers) : null,
      sub: 'connected now',
      href: null,
    },
    {
      key: 'liveDuels',
      label: 'LIVE DUELS',
      ok: s != null && s.activeMatches != null,
      value: s?.activeMatches != null ? fmtNum(s.activeMatches) : null,
      sub: 'in progress',
      href: null,
    },
    {
      key: 'duelsToday',
      label: 'DUELS TODAY',
      ok: s != null && s.duelsToday != null,
      value: s?.duelsToday != null ? fmtNum(s.duelsToday) : null,
      sub: 'completed',
      href: null,
    },
    {
      key: 'topRating',
      label: 'TOP RATING',
      ok: top != null && top.rating != null,
      value: top?.rating != null ? fmtNum(top.rating) : null,
      sub: top?.name ?? null,
      href: top?.publicPlayerId ? `#/player/${encodeURIComponent(top.publicPlayerId)}` : null,
    },
    {
      key: 'avgQueue',
      label: 'AVG QUEUE',
      ok: s != null && s.avgQueueSeconds != null,
      value: s?.avgQueueSeconds != null ? `${Math.round(s.avgQueueSeconds)}s` : null,
      sub: s != null && s.queueSize != null && s.queueSize > 0 ? `${fmtNum(s.queueSize)} waiting` : 'matchmaking',
      href: null,
    },
  ];
}

/**
 * Human "Updated Xs ago" label for the pulse timestamp.
 * @param {number|string|Date|null} updatedAt
 * @param {number} [now=Date.now()]
 * @returns {string}
 */
export function formatUpdatedAgo(updatedAt, now = Date.now()) {
  const t = updatedAt instanceof Date ? updatedAt.getTime()
    : typeof updatedAt === 'string' ? Date.parse(updatedAt)
    : typeof updatedAt === 'number' ? updatedAt : NaN;
  if (!Number.isFinite(t)) return 'Updated —';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'Updated just now';
  if (s < 60) return `Updated ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Updated ${m}m ago`;
  const h = Math.floor(m / 60);
  return `Updated ${h}h ago`;
}

// ── internal helpers ──

/**
 * Compose the caller's lifetime signal with the HTTP timeout so the
 * request honours both. Prefers AbortSignal.any; where unavailable, a
 * manual controller forwards the caller's abort while a timer bounds the
 * request. dispose() releases the timer/listener — callers must invoke it
 * once the fetch settles.
 */
function composedRequestSignal(callerSignal, timeoutMs = HOME_STATS_TIMEOUT_MS) {
  const noop = () => {};
  if (typeof AbortSignal === 'undefined') return { signal: undefined, dispose: noop };
  const hasTimeoutApi = typeof AbortSignal.timeout === 'function';
  if (callerSignal && hasTimeoutApi && typeof AbortSignal.any === 'function') {
    // Modern path: one composed signal — caller abort OR timeout wins.
    return {
      signal: AbortSignal.any([callerSignal, AbortSignal.timeout(timeoutMs)]),
      dispose: noop,
    };
  }
  if (!callerSignal && hasTimeoutApi) {
    return { signal: AbortSignal.timeout(timeoutMs), dispose: noop };
  }
  // Fallback: manual composition — forward the caller's abort and bound
  // the request with our own timer (also covers engines without
  // AbortSignal.timeout/any).
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort(callerSignal.reason);
  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('home-stats timeout')), timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener?.('abort', onCallerAbort);
    },
  };
}

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim();
}
