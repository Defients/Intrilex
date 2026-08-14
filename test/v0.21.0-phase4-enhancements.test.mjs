// ═══════════════════════════════════════════════════════════════
// v0.21.0-phase4-enhancements.test.mjs
// Phase 4 Autonomous Enhancement verification.
//
// Verifies:
//   - CSP headers in index.html (security hardening)
//   - browserslist config in package.json (browser targeting)
//   - browser-analytics.js modularization (rank-attribution-browser.js + rank-power-model.js)
//   - dev-server.mjs watch mode support
//   - error-boundary.js module and integration
//   - sw-register.js extracted from inline script (CSP compliance)
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'apps/lab-web/dist');
const srcDir = path.join(root, 'apps/lab-web/src');
const readDist = (rel) => readFile(path.join(distDir, rel), 'utf8');
const readSrc = (rel) => readFile(path.join(srcDir, rel), 'utf8');
const exists = (rel) => access(path.join(distDir, rel)).then(() => true).catch(() => false);
const existsSrc = (rel) => access(path.join(srcDir, rel)).then(() => true).catch(() => false);

// ── P4.1: CSP Headers ───────────────────────────────────────────

test('p4: index.html has Content-Security-Policy meta tag', async () => {
  const html = await readDist('index.html');
  assert.match(html, /http-equiv="Content-Security-Policy"/);
});

test('p4: CSP script-src does not allow unsafe-inline', async () => {
  const html = await readDist('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
  const scriptSrc = csp.match(/script-src\s+([^;]+)/)?.[1] ?? '';
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), 'script-src must not allow unsafe-inline');
});

test('p4: CSP object-src is none', async () => {
  const html = await readDist('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
  assert.match(csp, /object-src\s+'none'/);
});

test('p4: CSP does not include frame-ancestors (ignored via meta — use HTTP header instead)', async () => {
  const html = await readDist('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
  // frame-ancestors is ignored in <meta> CSP per the spec — it must be
  // delivered via HTTP header. Keeping it generates a console warning.
  // We verify it is absent to avoid console noise on production.
  assert.doesNotMatch(csp, /frame-ancestors/);
});

test('p4: CSP worker-src allows self for service worker', async () => {
  const html = await readDist('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
  assert.match(csp, /worker-src\s+'self'/);
});

// ── P4.1b: SW registration extracted to external file ───────────

test('p4: sw-register.js exists in dist', async () => {
  assert.ok(await exists('sw-register.js'), 'dist/sw-register.js must exist');
});

test('p4: sw-register.js exists in src', async () => {
  assert.ok(await existsSrc('sw-register.js'), 'src/sw-register.js must exist');
});

test('p4: sw-register.js registers service worker', async () => {
  const js = await readDist('sw-register.js');
  assert.match(js, /serviceWorker.*register\s*\(\s*['"]sw\.js['"]/);
});

test('p4: index.html references sw-register.js or sw-kill.js (no inline script)', async () => {
  const html = await readDist('index.html');
  // v0.27.1+: PWA was replaced with a self-unregistering kill switch.
  // index.html may reference either sw-register.js (full PWA) or sw-kill.js (kill switch).
  assert.ok(html.match(/src="sw-register\.js"/) || html.match(/src="sw-kill\.js"/),
    'index.html must reference either sw-register.js or sw-kill.js');
  // Verify no inline SW registration script remains
  assert.doesNotMatch(html, /<script>\s*if\s*\(\s*['"]serviceWorker['"]/,
    'index.html must not have inline SW registration script');
});

// ── P4.2: Browserslist Config ───────────────────────────────────

test('p4: package.json has browserslist field', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.browserslist, 'package.json must have browserslist field');
  assert.ok(Array.isArray(pkg.browserslist), 'browserslist must be an array');
  assert.ok(pkg.browserslist.length >= 3, 'browserslist must have at least 3 entries');
});

test('p4: browserslist excludes dead browsers', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const hasNotDead = pkg.browserslist.some(e => e.includes('not dead'));
  assert.ok(hasNotDead, 'browserslist must exclude dead browsers');
});

test('p4: browserslist excludes IE', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const hasNotIE = pkg.browserslist.some(e => e.includes('not ie'));
  assert.ok(hasNotIE, 'browserslist must exclude IE');
});

test('p4: bundle.mjs documents browserslist alignment', async () => {
  const bundle = await readFile(path.join(root, 'scripts/bundle.mjs'), 'utf8');
  assert.match(bundle, /browserslist/i, 'bundle.mjs must document browserslist alignment');
});

test('p4: bundle.mjs content-hashes __intrilex-config file', async () => {
  // The config file is content-hashed so the SW can cache it as immutable.
  // When config changes between builds, the hash changes → new filename →
  // SW fetches fresh config instead of serving a stale cached version.
  const bundle = await readFile(path.join(root, 'scripts/bundle.mjs'), 'utf8');
  assert.match(bundle, /configHash/, 'bundle.mjs must compute a config hash');
  assert.match(bundle, /__intrilex-config\.\$\{configHash\}\.js/, 'bundle.mjs must write hashed config filename');
});

test('p4: dist index.html references hashed __intrilex-config file', async () => {
  const html = await readDist('index.html');
  assert.match(html, /__intrilex-config\.[a-f0-9]+\.js/, 'index.html must reference hashed config file');
  // Must NOT reference the unhashed name in the <script> tag
  assert.doesNotMatch(html, /<script[^>]+src="\/__intrilex-config\.js"/, 'index.html must not reference unhashed config in script tag');
});

test('p4: sync-neocities.mjs prunes stale hashed config files', async () => {
  const sync = await readFile(path.join(root, 'scripts/sync-neocities.mjs'), 'utf8');
  // The source contains a regex literal: __intrilex-config\.[a-f0-9]+\.js
  // Match the literal text (backslashes are literal in the source).
  assert.ok(sync.includes('__intrilex-config'), 'sync-neocities.mjs must reference __intrilex-config');
  assert.ok(sync.includes('staleConfig'), 'sync-neocities.mjs must prune stale config files');
  assert.ok(sync.includes('configJs'), 'sync-neocities.mjs must extract configJs ref from HTML');
});

// ── frame-ancestors via HTTP header (RFC2) ──────────────────────

test('p4: _headers file exists in neocities-deploy for frame-ancestors', async () => {
  const headersPath = path.join(root, 'neocities-deploy', '_headers');
  const content = await readFile(headersPath, 'utf8');
  assert.match(content, /frame-ancestors\s+'none'/, '_headers must set frame-ancestors none');
  assert.match(content, /X-Frame-Options:\s*DENY/i, '_headers must set X-Frame-Options DENY');
});

test('p4: Caddyfile sets CSP frame-ancestors header for match server', async () => {
  const caddy = await readFile(path.join(root, 'deploy', 'Caddyfile.match.intrilex'), 'utf8');
  assert.match(caddy, /frame-ancestors\s+'none'/, 'Caddyfile must set frame-ancestors none header');
  assert.match(caddy, /X-Frame-Options\s+DENY/i, 'Caddyfile must set X-Frame-Options DENY');
});

// ── P4.3: browser-analytics.js Modularization ───────────────────

test('p4: rank-attribution-browser.js exists in src', async () => {
  assert.ok(await existsSrc('rank-attribution-browser.js'));
});

test('p4: rank-power-model.js exists in src', async () => {
  assert.ok(await existsSrc('rank-power-model.js'));
});

test('p4: rank-attribution-browser.js exports classifyPlayForm', async () => {
  const src = await readSrc('rank-attribution-browser.js');
  assert.match(src, /export function classifyPlayForm/);
});

test('p4: rank-attribution-browser.js exports attributeAction', async () => {
  const src = await readSrc('rank-attribution-browser.js');
  assert.match(src, /export function attributeAction/);
});

test('p4: rank-power-model.js exports computePowerAxes', async () => {
  const src = await readSrc('rank-power-model.js');
  assert.match(src, /export function computePowerAxes/);
});

test('p4: rank-power-model.js exports buildRankPowerModel', async () => {
  const src = await readSrc('rank-power-model.js');
  assert.match(src, /export function buildRankPowerModel/);
});

test('p4: browser-analytics.js imports from rank-attribution-browser.js', async () => {
  const src = await readSrc('browser-analytics.js');
  assert.match(src, /from\s+['"]\.\/rank-attribution-browser\.js['"]/);
});

test('p4: browser-analytics.js imports from rank-power-model.js', async () => {
  const src = await readSrc('browser-analytics.js');
  assert.match(src, /from\s+['"]\.\/rank-power-model\.js['"]/);
});

test('p4: browser-analytics.js re-exports classifyPlayForm', async () => {
  const src = await readSrc('browser-analytics.js');
  assert.match(src, /classifyPlayForm/);
  // Verify it's in the re-export block
  assert.match(src, /export\s*\{[^}]*classifyPlayForm/s);
});

test('p4: browser-analytics.js re-exports buildRankPowerModel', async () => {
  const src = await readSrc('browser-analytics.js');
  assert.match(src, /export\s*\{[^}]*buildRankPowerModel/s);
});

test('p4: browser-analytics.js is under 1100 lines (reduced from 1387)', async () => {
  const src = await readSrc('browser-analytics.js');
  const lines = src.split('\n').length;
  assert.ok(lines < 1100, `browser-analytics.js must be under 1100 lines, got ${lines}`);
});

test('p4: rank-attribution-browser.js is under 200 lines', async () => {
  const src = await readSrc('rank-attribution-browser.js');
  const lines = src.split('\n').length;
  assert.ok(lines < 200, `rank-attribution-browser.js must be under 200 lines, got ${lines}`);
});

test('p4: rank-power-model.js is under 350 lines', async () => {
  const src = await readSrc('rank-power-model.js');
  const lines = src.split('\n').length;
  assert.ok(lines < 350, `rank-power-model.js must be under 350 lines, got ${lines}`);
});

test('p4: dist/browser-analytics.js still exports classifyPlayForm', async () => {
  const dist = await readDist('browser-analytics.js');
  assert.match(dist, /classifyPlayForm/);
});

// ── P4.4: Dev Server Watch Mode ─────────────────────────────────

test('p4: dev-server.mjs supports --watch flag', async () => {
  const src = await readFile(path.join(root, 'scripts/dev-server.mjs'), 'utf8');
  assert.match(src, /--watch/);
  assert.match(src, /watchMode/);
});

test('p4: dev-server.mjs has SSE endpoint for hot reload', async () => {
  const src = await readFile(path.join(root, 'scripts/dev-server.mjs'), 'utf8');
  assert.match(src, /__devreload/);
  assert.match(src, /text\/event-stream/);
});

test('p4: dev-server.mjs watches src directory for changes', async () => {
  const src = await readFile(path.join(root, 'scripts/dev-server.mjs'), 'utf8');
  assert.match(src, /watch\s*\(/);
  assert.match(src, /srcDir/);
});

test('p4: dev-server.mjs injects hot-reload script in watch mode', async () => {
  const src = await readFile(path.join(root, 'scripts/dev-server.mjs'), 'utf8');
  assert.match(src, /EventSource/);
  assert.match(src, /location\.reload/);
});

test('p4: dev-server.mjs debounces rebuilds', async () => {
  const src = await readFile(path.join(root, 'scripts/dev-server.mjs'), 'utf8');
  assert.match(src, /setTimeout|debounce/i);
});

test('p4: package.json has dev:watch script', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['dev:watch'], 'package.json must have dev:watch script');
  assert.match(pkg.scripts['dev:watch'], /--watch/);
});

// ── P4.5: Error Boundary ────────────────────────────────────────

test('p4: error-boundary.js exists in src', async () => {
  assert.ok(await existsSrc('error-boundary.js'));
});

test('p4: error-boundary.js exists in dist', async () => {
  assert.ok(await exists('error-boundary.js'), 'dist/error-boundary.js must exist');
});

test('p4: error-boundary.js exports installGlobalErrorBoundary', async () => {
  const src = await readSrc('error-boundary.js');
  assert.match(src, /export function installGlobalErrorBoundary/);
});

test('p4: error-boundary.js exports renderErrorOverlay', async () => {
  const src = await readSrc('error-boundary.js');
  assert.match(src, /export function renderErrorOverlay/);
});

test('p4: error-boundary.js exports withErrorBoundary', async () => {
  const src = await readSrc('error-boundary.js');
  assert.match(src, /export function withErrorBoundary/);
});

test('p4: error-boundary.js handles unhandledrejection event', async () => {
  const src = await readSrc('error-boundary.js');
  assert.match(src, /unhandledrejection/);
});

test('p4: error-boundary.js has max error count safeguard', async () => {
  const src = await readSrc('error-boundary.js');
  assert.match(src, /MAX_ERRORS_BEFORE_RELOAD/);
});

test('p4: error-boundary.js has retry and reload buttons', async () => {
  const src = await readSrc('error-boundary.js');
  assert.match(src, /error-boundary-retry/);
  assert.match(src, /error-boundary-reload/);
});

test('p4: error-boundary.js has HTML escaper for XSS safety', async () => {
  const src = await readSrc('error-boundary.js');
  assert.match(src, /function esc/);
  assert.match(src, /&amp;/);
  assert.match(src, /&lt;/);
});

test('p4: app.js imports error-boundary module', async () => {
  const src = await readSrc('app.js');
  assert.match(src, /from\s+['"]\.\/error-boundary\.js['"]/);
});

test('p4: app.js installs global error boundary', async () => {
  const src = await readSrc('app.js');
  assert.match(src, /installGlobalErrorBoundary/);
});

test('p4: app.js imports and calls diagnoseConfig on bootstrap', async () => {
  const src = await readSrc('app.js');
  // Accept both static import and lazy-loaded dynamic import patterns
  // (IRX-M32: match-server-config was moved to lazy loading to reduce initial bundle)
  assert.ok(
    /from\s+['"]\.\/play\/network\/match-server-config\.js['"]/.test(src) ||
    /import\s*\(\s*['"]\.\/play\/network\/match-server-config\.js['"]\s*\)/.test(src),
    'app.js must import from match-server-config.js (static or dynamic)'
  );
  assert.match(src, /diagnoseConfig/, 'app.js must reference diagnoseConfig');
  // Must be called at module load time — either directly or via lazy-load + .then()
  assert.ok(
    /\ndiagnoseConfig\(\)/.test(src) ||
    /\(\{[^}]*diagnoseConfig[^}]*\}\)\s*=>\s*diagnoseConfig\(\)/.test(src),
    'app.js must call diagnoseConfig() at module load time (directly or via lazy-load)'
  );
});

test('p4: app.js uses withErrorBoundary for play route', async () => {
  const src = await readSrc('app.js');
  assert.match(src, /withErrorBoundary/);
});

test('p4: error boundary CSS exists in pages-polish.css', async () => {
  const src = await readSrc('css/pages-polish.css');
  assert.match(src, /\.error-boundary/);
  assert.match(src, /\.error-boundary-card/);
  assert.match(src, /\.error-boundary-retry/);
});
