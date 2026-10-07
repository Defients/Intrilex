// ═══════════════════════════════════════════════════════════════
// home-page.test.mjs — Homepage (front door) contract tests
//
// Covers the canonical full-page homepage:
//   - view markup & structure (home-view.js)
//   - data layer behavior with injected fetchers (home-data.js)
//   - Live Pulse loading / success / partial-failure contracts
//   - Preseason Leaders canonical-source selection
//   - Latest News changelog parsing
//   - match-server /api/public/home-stats building blocks
//     (queue wait samples + terminal outbox counting)
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  matchServerHttpBase,
  fetchHomeStats,
  fetchTopRated,
  fetchPreseasonContext,
  parseChangelogEntries,
  buildPulseMetrics,
  formatUpdatedAgo,
  HOME_PULSE_INTERVAL_MS,
} from '../apps/lab-web/src/home/home-data.js';
import {
  renderHomePage,
  renderPulseMetricsHtml,
  renderLeadersHtml,
  renderLeadersEmpty,
  renderNewsHtml,
} from '../apps/lab-web/src/home/home-view.js';
import { MatchmakingQueue } from '../packages/match-authority/src/matchmaking-queue.mjs';
import { TerminalOutbox } from '../apps/match-server/src/persistence/terminal-outbox.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

// ── Page structure ────────────────────────────────────────────

test('renderHomePage emits canonical structure: header → hero → pulse → grid → footer', () => {
  const html = renderHomePage({ labVersion: '0.30.0', rulesVersion: '4.3.1' });
  const order = ['home-topbar', 'id="landing-main"', 'home-hero', 'home-pulse', 'home-grid', 'landing-footer'];
  let last = -1;
  for (const marker of order) {
    const idx = html.indexOf(marker);
    assert.ok(idx > last, `${marker} must appear after previous section`);
    last = idx;
  }
});

test('homepage grid has the three approved panels in order (leaders retired)', () => {
  const html = renderHomePage({ labVersion: '0', rulesVersion: '0' });
  const gridIdx = html.indexOf('home-grid');
  const section = html.slice(gridIdx);
  const preseason = section.indexOf('home-preseason"');
  const news = section.indexOf('home-news"');
  const explore = section.indexOf('home-explore"');
  assert.ok(preseason > -1 && news > preseason && explore > news,
    'panels must be PRESEASON → NEWS → EXPLORE');
  assert.equal(section.indexOf('home-leaders"'), -1,
    'PRESEASON LEADERS is retired from the homepage grid');
});

test('homepage uses PRESEASON framing, never Season 01 as the current era', () => {
  const html = renderHomePage({ labVersion: '0', rulesVersion: '0' });
  assert.match(html, /PRESEASON/);
  assert.match(html, /THE JOURNEY/);
  // "Season 01" may appear only as forward-looking copy, not as a heading/status.
  assert.doesNotMatch(html, />SEASON 01</);
});

test('homepage does not resurrect the removed How a Duel Works section', () => {
  const html = renderHomePage({ labVersion: '0', rulesVersion: '0' });
  assert.doesNotMatch(html, /how a duel works/i);
  assert.doesNotMatch(html, /how-to-play/i);
});

test('hero CTAs route to real play modes', () => {
  const html = renderHomePage({ labVersion: '0', rulesVersion: '0' });
  assert.match(html, /href="#\/play\/new"[^>]*data-testid="home-solo-btn"|data-testid="home-solo-btn"[^>]*href="#\/play\/new"/.test(html)
    ? /home-solo-btn/ : /$^/, 'solo button must exist');
  const solo = html.match(/<a class="home-mode-btn solo"[^>]*href="([^"]+)"/);
  const direct = html.match(/<a class="home-mode-btn direct"[^>]*href="([^"]+)"/);
  assert.equal(solo[1], '#/play/new');
  assert.equal(direct[1], '#/play/online');
});

test('header utility slot defaults to PLAY NOW (upgraded to CONTINUE DUEL by home.js)', () => {
  const html = renderHomePage({ labVersion: '0', rulesVersion: '0' });
  assert.match(html, /id="landing-continue-slot"/);
  assert.match(html, /PLAY NOW/);
});

test('homepage keeps Lab accessible via the Lab button', () => {
  const html = renderHomePage({ labVersion: '0', rulesVersion: '0' });
  assert.match(html, /href="#\/sim"/);
  assert.match(html, /lab-button/);
});

test('homepage escapes user-supplied leader names', () => {
  const html = renderLeadersHtml([{ position: 1, name: '<img src=x onerror=alert(1)>', rating: 1500, tier: 'VANGUARD', publicPlayerId: 'PLY_1' }]);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

// ── matchServerHttpBase ───────────────────────────────────────

test('matchServerHttpBase converts ws→http and wss→https', () => {
  assert.equal(matchServerHttpBase('wss://match.intrilex.cards'), 'https://match.intrilex.cards');
  assert.equal(matchServerHttpBase('ws://localhost:3099'), 'http://localhost:3099');
  assert.equal(matchServerHttpBase('ws://127.0.0.1:3099'), 'http://127.0.0.1:3099');
  assert.equal(matchServerHttpBase('https://x.example'), null);
  assert.equal(matchServerHttpBase(null), null);
  assert.equal(matchServerHttpBase(''), null);
});

// ── fetchHomeStats ────────────────────────────────────────────

test('fetchHomeStats returns normalized stats on success', async () => {
  const fetchImpl = async (url, opts) => {
    assert.equal(url, 'https://match.intrilex.cards/api/public/home-stats');
    assert.equal(opts.method, 'GET');
    return { ok: true, json: async () => ({
      onlinePlayers: 7, activeMatches: 3, queueSize: 1,
      duelsToday: 42, avgQueueSeconds: 12.5, updatedAt: '2026-10-07T12:00:00Z',
      // Extra/internal fields must be ignored
      _internal: 'nope',
    }) };
  };
  const res = await fetchHomeStats({ fetchImpl, httpBase: 'https://match.intrilex.cards' });
  assert.equal(res.ok, true);
  assert.equal(res.stats.onlinePlayers, 7);
  assert.equal(res.stats.activeMatches, 3);
  assert.equal(res.stats.duelsToday, 42);
  assert.equal(res.stats.avgQueueSeconds, 12.5);
  assert.equal(res.stats.updatedAt, '2026-10-07T12:00:00Z');
  assert.ok(!('_internal' in res.stats));
});

test('fetchHomeStats degrades gracefully: no base, http error, network throw, bad fields', async () => {
  // No base URL → not configured
  assert.equal((await fetchHomeStats({ fetchImpl: async () => ({}), httpBase: null })).ok, false);
  assert.equal((await fetchHomeStats({ fetchImpl: async () => ({}), httpBase: 42 })).ok, false);
  assert.equal((await fetchHomeStats({ fetchImpl: null, httpBase: 'http://localhost:3099' })).ok, false);
  // HTTP error
  assert.equal((await fetchHomeStats({
    fetchImpl: async () => ({ ok: false }),
    httpBase: 'http://localhost:3099',
  })).ok, false);
  // Network failure
  assert.equal((await fetchHomeStats({
    fetchImpl: async () => { throw new Error('conn refused'); },
    httpBase: 'http://localhost:3099',
  })).ok, false);
  // Success body with garbage fields → nulls, not NaN
  const res = await fetchHomeStats({
    fetchImpl: async () => ({ ok: true, json: async () => ({ onlinePlayers: 'many', duelsToday: NaN }) }),
    httpBase: 'http://localhost:3099',
  });
  assert.equal(res.ok, true);
  assert.equal(res.stats.onlinePlayers, null);
  assert.equal(res.stats.duelsToday, null);
});

test('fetchHomeStats aborts when the caller lifetime signal aborts (navigation)', async () => {
  const controller = new AbortController();
  let requestSignal = null;
  const settled = fetchHomeStats({
    fetchImpl: (url, opts) => {
      requestSignal = opts.signal;
      return new Promise((_, reject) =>
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    },
    httpBase: 'http://localhost:3099',
    signal: controller.signal,
  });
  controller.abort();
  const res = await settled;
  assert.equal(res.ok, false, 'caller abort resolves to the degraded contract, not a leaked AbortError');
  assert.equal(requestSignal.aborted, true);
  assert.notEqual(requestSignal, controller.signal, 'request signal is composed, not the raw caller signal');
});

test('fetchHomeStats terminates a stalled request after the HTTP timeout', async () => {
  const controller = new AbortController();
  const settled = fetchHomeStats({
    fetchImpl: (url, opts) => new Promise((_, reject) =>
      opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    httpBase: 'http://localhost:3099',
    signal: controller.signal,
    timeoutMs: 20,
  });
  // The race timer keeps Node's event loop alive — AbortSignal.timeout's
  // internal timer is unref'd and would otherwise let the loop drain.
  const res = await Promise.race([settled, new Promise(r => setTimeout(() => r({ timeout: 'did-not-abort' }), 1000))]);
  assert.equal(res.ok, false, 'timeout resolves to the degraded contract');
  assert.equal(controller.signal.aborted, false, 'timeout must not abort the caller signal');
});

test('fetchHomeStats still succeeds when both signals stay quiet', async () => {
  const controller = new AbortController();
  const res = await fetchHomeStats({
    fetchImpl: async (url, opts) => {
      assert.equal(opts.signal.aborted, false);
      return { ok: true, json: async () => ({ onlinePlayers: 3 }) };
    },
    httpBase: 'http://localhost:3099',
    signal: controller.signal,
    timeoutMs: 5000,
  });
  assert.equal(res.ok, true);
  assert.equal(res.stats.onlinePlayers, 3);
});

// ── fetchTopRated ─────────────────────────────────────────────

const L = (name, rating, pos) => ({ publicPlayerId: 'PLY_' + name, displayName: name, rating, position: pos, tier: 'VANGUARD' });

test('fetchTopRated prefers the canonical leaderboard', async () => {
  const res = await fetchTopRated({
    fetchLeaderboardFn: async () => ({ available: true, entries: [L('Ada', 2041, 1), L('Bo', 1987, 2)] }),
    fetchDirectoryFn: async () => { throw new Error('must not be called'); },
  });
  assert.equal(res.available, true);
  assert.equal(res.source, 'leaderboard');
  assert.equal(res.entries[0].name, 'Ada');
  assert.equal(res.entries[0].rating, 2041);
});

test('fetchTopRated falls back to the player directory when the ladder is empty', async () => {
  const res = await fetchTopRated({
    fetchLeaderboardFn: async () => ({ available: true, entries: [] }),
    fetchDirectoryFn: async ({ sort, limit }) => {
      assert.equal(sort, 'rating');
      assert.equal(limit, 5);
      return { available: true, entries: [
        { player: { publicPlayerId: 'PLY_1', displayName: 'Cal', handle: 'cal', avatarUrl: null }, rank: { rating: 1700, tier: 'WARDEN' } },
      ] };
    },
  });
  assert.equal(res.available, true);
  assert.equal(res.source, 'directory');
  assert.equal(res.entries[0].name, 'Cal');
  assert.equal(res.entries[0].rating, 1700);
});

test('fetchTopRated survives a leaderboard RPC throw and an empty directory', async () => {
  const res = await fetchTopRated({
    fetchLeaderboardFn: async () => { throw new Error('rpc down'); },
    fetchDirectoryFn: async () => ({ available: true, entries: [] }),
  });
  assert.equal(res.available, true);
  assert.equal(res.entries.length, 0);
});

test('fetchTopRated reports unavailable when nothing is configured', async () => {
  const res = await fetchTopRated({
    fetchLeaderboardFn: async () => ({ available: false, entries: [] }),
    fetchDirectoryFn: async () => ({ available: false, entries: [] }),
  });
  assert.equal(res.available, false);
});

// ── fetchPreseasonContext ─────────────────────────────────────

test('fetchPreseasonContext aggregates seasons + directory count, tolerating failure', async () => {
  const res = await fetchPreseasonContext({
    fetchSeasonsFn: async () => ({ available: true, seasons: [{ name: 'Preseason', status: 'active' }] }),
    fetchDirectoryFn: async () => ({ available: true, total: 128 }),
  });
  assert.equal(res.playersListed, 128);
  assert.equal(res.seasonsCount, 1);
  assert.equal(res.seasonStatus, 'active');

  const broken = await fetchPreseasonContext({
    fetchSeasonsFn: async () => { throw new Error('nope'); },
    fetchDirectoryFn: async () => ({ available: false, total: null }),
  });
  assert.equal(broken.playersListed, null);
  assert.equal(broken.seasonsCount, null);
});

// ── parseChangelogEntries ─────────────────────────────────────

const SAMPLE_CHANGELOG = `# Changelog

## Unreleased — October 6, 2026 Lint baseline cleanup

- The lint suite is now clean: all 420 **pre-existing** warnings resolved.
- \`eslint.config.mjs\` gains caughtErrorsIgnorePattern.

## v0.28.0 — September 30, 2026 Homecoming

- Ported the full rules-assisted tabletop into the default Play board.
- Second bullet.
`;

test('parseChangelogEntries extracts category, date, title, excerpt', () => {
  const items = parseChangelogEntries(SAMPLE_CHANGELOG);
  assert.equal(items.length, 2);
  assert.equal(items[0].category, 'UPDATE');
  assert.equal(items[0].date, 'October 6, 2026');
  assert.equal(items[0].title, 'Lint baseline cleanup');
  assert.match(items[0].excerpt, /lint suite is now clean/);
  assert.doesNotMatch(items[0].excerpt, /\*\*/); // markdown stripped
  assert.equal(items[1].category, 'RELEASE');
  assert.equal(items[1].version, 'v0.28.0');
  assert.equal(items[1].title, 'Homecoming');
  assert.ok(items.every(i => i.href === '#/release-notes'));
});

test('parseChangelogEntries caps results and tolerates garbage', () => {
  assert.equal(parseChangelogEntries('').length, 0);
  assert.equal(parseChangelogEntries(null).length, 0);
  assert.equal(parseChangelogEntries('# no h2 headings\nbody text').length, 0);
  const long = `${Array.from({ length: 6 }, (_, i) => `## v0.${i}.0 — January 1, 2026 Item ${i}\n\n- x\n`).join('\n')}`;
  assert.equal(parseChangelogEntries(long, 3).length, 3);
});

// ── buildPulseMetrics ─────────────────────────────────────────

test('buildPulseMetrics maps real stats into five metrics', () => {
  const m = buildPulseMetrics({
    stats: { onlinePlayers: 184, activeMatches: 12, queueSize: 3, duelsToday: 1942, avgQueueSeconds: 18, updatedAt: 'x' },
    leaders: [{ name: 'NyxArcanum', rating: 2041, publicPlayerId: 'PLY_9' }],
  });
  const byKey = Object.fromEntries(m.map(x => [x.key, x]));
  assert.equal(m.length, 5);
  assert.equal(byKey.online.value, '184');
  assert.equal(byKey.liveDuels.value, '12');
  assert.equal(byKey.duelsToday.value, '1,942');
  assert.equal(byKey.topRating.value, '2,041');
  assert.equal(byKey.topRating.sub, 'NyxArcanum');
  assert.equal(byKey.topRating.href, '#/player/PLY_9');
  assert.equal(byKey.avgQueue.value, '18s');
  assert.ok(m.every(x => x.ok));
});

test('buildPulseMetrics marks failed sources ok:false so the view shows — not 0', () => {
  const m = buildPulseMetrics({ stats: null, leaders: null });
  assert.equal(m.length, 5);
  assert.ok(m.every(x => !x.ok));
  assert.ok(m.every(x => x.value == null));
});

test('buildPulseMetrics supports partial failure (server ok, leaders failed)', () => {
  const m = buildPulseMetrics({
    stats: { onlinePlayers: 3, activeMatches: 1, queueSize: 0, duelsToday: 9, avgQueueSeconds: null, updatedAt: 'x' },
    leaders: [],
  });
  const byKey = Object.fromEntries(m.map(x => [x.key, x]));
  assert.equal(byKey.online.ok, true);
  assert.equal(byKey.topRating.ok, false);
  assert.equal(byKey.avgQueue.ok, false); // no queue samples yet → '—'
});

test('renderPulseMetricsHtml hides failed metrics entirely and links players', () => {
  const html = renderPulseMetricsHtml(buildPulseMetrics({
    stats: { onlinePlayers: 5, activeMatches: 0, queueSize: 0, duelsToday: 0, avgQueueSeconds: 4, updatedAt: 'x' },
    leaders: [{ name: 'Ada', rating: 1800, publicPlayerId: 'PLY_1' }],
  }));
  assert.match(html, />5</);
  assert.match(html, /href="#\/player\/PLY_1"/);

  // Unavailable values are hidden, never rendered as '—' placeholders.
  const partial = renderPulseMetricsHtml(buildPulseMetrics({ stats: null, leaders: [{ name: 'Ada', rating: 1800 }] }));
  assert.doesNotMatch(partial, />—</, 'no metric may render an em-dash placeholder');
  assert.equal((partial.match(/data-metric="/g) ?? []).length, 1, 'only the topRating metric survives');
  const failed = renderPulseMetricsHtml(buildPulseMetrics({ stats: null, leaders: null }));
  assert.equal(failed, '', 'a fully dead feed renders nothing');
});

// ── formatUpdatedAgo ──────────────────────────────────────────

test('formatUpdatedAgo renders relative freshness labels', () => {
  const now = 1_760_000_000_000;
  assert.equal(formatUpdatedAgo(now - 2000, now), 'Updated just now');
  assert.equal(formatUpdatedAgo(now - 12_000, now), 'Updated 12s ago');
  assert.equal(formatUpdatedAgo(now - 4 * 60_000, now), 'Updated 4m ago');
  assert.equal(formatUpdatedAgo('garbage', now), 'Updated —');
});

// ── Server-side building blocks ───────────────────────────────

test('MatchmakingQueue records real wait samples for avgQueueSeconds', () => {
  const q = new MatchmakingQueue({ onCreateMatch: () => [
    { connectionId: 'a', matchId: 'm1', participantId: 'p1', participantToken: 't1' },
    { connectionId: 'b', matchId: 'm1', participantId: 'p2', participantToken: 't2' },
  ] });
  assert.equal(q.averageWaitMs, null); // no pairings yet → no fabricated stat
  q.enqueue('a', 'core-v4');
  const res = q.enqueue('b', 'core-v4');
  assert.ok(res.paired, 'two entries must pair');
  const avg = q.averageWaitMs;
  assert.ok(typeof avg === 'number' && avg >= 0, 'avg wait must be a real number after pairing');
});

test('TerminalOutbox.countJobsSince counts result jobs for duels-today', async () => {
  const outbox = new TerminalOutbox({ durable: false, persistor: null, logger: { debug: () => {} } });
  const rec = { matchId: 'm-today', participants: [], winnerParticipantId: null, result: 'WIN' };
  assert.equal(outbox.countJobsSince('result', 0), 0);
  outbox.enqueueResult(rec);
  assert.equal(outbox.countJobsSince('result', 0), 1);
  assert.equal(outbox.countJobsSince('result', Date.now() + 60_000), 0);
  await outbox.shutdown?.();
});

// ── View renderers: leaders + news ────────────────────────────

test('renderLeadersHtml applies gold/silver/bronze to top 3', () => {
  const html = renderLeadersHtml([
    { position: 1, name: 'A', rating: 2000, publicPlayerId: 'PLY_1' },
    { position: 2, name: 'B', rating: 1900, publicPlayerId: 'PLY_2' },
    { position: 3, name: 'C', rating: 1800, publicPlayerId: 'PLY_3' },
    { position: 4, name: 'D', rating: 1700, publicPlayerId: null },
  ]);
  assert.match(html, /home-leader-rank gold/);
  assert.match(html, /home-leader-rank silver/);
  assert.match(html, /home-leader-rank bronze/);
  // D has no public id → row is a span, not a link
  const dRow = html.split('>D<')[0];
  assert.doesNotMatch(html.slice(html.lastIndexOf('PLY_3')), /PLY_null|PLY_undefined/);
  void dRow;
});

test('renderNewsHtml renders items and an honest empty state', () => {
  const items = parseChangelogEntries(SAMPLE_CHANGELOG);
  const html = renderNewsHtml(items);
  assert.match(html, /UPDATE/);
  assert.match(html, /October 6, 2026/);
  assert.match(html, /Lint baseline cleanup/);
  assert.match(html, /href="#\/release-notes"/);
  assert.match(renderNewsHtml(null), /home-news-empty/);
  assert.match(renderLeadersEmpty(), /home-leader-empty/);
});

// ── Wiring ────────────────────────────────────────────────────

test('home.js wires the continue-save handoff contract', async () => {
  const js = await src('home/home.js');
  assert.match(js, /intrilex-continue-save/);
  assert.match(js, /#\/play\/match/);
  assert.match(js, /CONTINUE DUEL/);
});

test('home.js polls the pulse on a sane interval, not aggressively', async () => {
  const js = await src('home/home.js');
  assert.match(js, /HOME_PULSE_INTERVAL_MS/);
  assert.ok(HOME_PULSE_INTERVAL_MS >= 15_000 && HOME_PULSE_INTERVAL_MS <= 60_000,
    'pulse interval should be 15–60s');
});

test('home.js degrades honestly: pulse hides when dead, news shows empty state', async () => {
  const js = await src('home/home.js');
  // The pulse strip collapses entirely when no real metric exists.
  assert.match(js, /pulseEl\.hidden = !anyReal/);
  assert.match(js, /renderNewsHtml\(null\)/);
});

test('match server exposes the aggregated public stats endpoint', async () => {
  const server = await readFile(path.join(root, 'apps/match-server/src/server.mjs'), 'utf8');
  assert.match(server, /\/api\/public\/home-stats/);
  assert.match(server, /Access-Control-Allow-Origin/);
  assert.match(server, /duelsToday/);
  assert.match(server, /avgQueueSeconds/);
});

test('CSP connect-src permits the production match server HTTPS endpoint', async () => {
  const html = await src('index.html');
  assert.match(html, /connect-src[^;]*https:\/\/match\.intrilex\.cards/);
});
