// ═══════════════════════════════════════════════════════════════
// v0.21.0-pwa-service-worker.test.mjs
// PWA Service Worker and Web Manifest verification.
//
// Verifies that the built dist contains a valid service worker,
// web app manifest, and that index.html registers the SW and
// links the manifest for offline PWA capability.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'apps/lab-web/dist');
const srcDir = path.join(root, 'apps/lab-web/src');
const readDist = (rel) => readFile(path.join(distDir, rel), 'utf8');
const readSrc = (rel) => readFile(path.join(srcDir, rel), 'utf8');
const exists = (rel) => access(path.join(distDir, rel)).then(() => true).catch(() => false);

// ── Service Worker file ─────────────────────────────────────────

test('pwa: sw.js exists in dist', async () => {
  assert.ok(await exists('sw.js'), 'dist/sw.js must exist');
});

test('pwa: sw.js exists in src', async () => {
  await access(path.join(srcDir, 'sw.js'));
});

test('pwa: sw.js has install event handler', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /addEventListener\s*\(\s*['"]install['"]/);
});

test('pwa: sw.js has activate event handler', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /addEventListener\s*\(\s*['"]activate['"]/);
});

test('pwa: sw.js has fetch event handler', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /addEventListener\s*\(\s*['"]fetch['"]/);
});

test('pwa: sw.js has cache version key for cache invalidation', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /CACHE_VERSION|CACHE_NAME/i);
});

test('pwa: sw.js cleans old caches on activate', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /caches\.keys\s*\(/);
  assert.match(sw, /caches\.delete\s*\(/);
});

test('pwa: sw.js uses skipWaiting for immediate activation', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /skipWaiting/);
});

test('pwa: sw.js claims clients on activate', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /clients\.claim/);
});

test('pwa: sw.js implements stale-while-revalidate strategy', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /staleWhileRevalidate|stale-while-revalidate/i);
});

test('pwa: sw.js implements network-first fallback for HTML', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /networkFirst|network-first/i);
});

test('pwa: sw.js has offline fallback for navigation requests', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /index\.html.*Offline|Offline.*index\.html|503/);
});

test('pwa: sw.js only intercepts GET requests', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /method.*GET|GET.*method/i);
});

test('pwa: sw.js skips cross-origin requests', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /origin.*location\.origin|self\.location\.origin/i);
});

test('pwa: sw.js has cache eviction to prevent unbounded growth', async () => {
  const sw = await readDist('sw.js');
  assert.match(sw, /MAX_CACHE|evict/i);
});

// ── Web App Manifest ────────────────────────────────────────────

test('pwa: manifest.json exists in dist', async () => {
  assert.ok(await exists('manifest.json'), 'dist/manifest.json must exist');
});

test('pwa: manifest.json exists in src', async () => {
  await access(path.join(srcDir, 'manifest.json'));
});

test('pwa: manifest.json is valid JSON with required fields', async () => {
  const manifest = JSON.parse(await readDist('manifest.json'));
  assert.ok(manifest.name, 'manifest must have name');
  assert.ok(manifest.short_name, 'manifest must have short_name');
  assert.ok(manifest.start_url, 'manifest must have start_url');
  assert.ok(manifest.display, 'manifest must have display');
  assert.ok(manifest.background_color, 'manifest must have background_color');
  assert.ok(manifest.theme_color, 'manifest must have theme_color');
  assert.ok(manifest.icons, 'manifest must have icons array');
  assert.ok(Array.isArray(manifest.icons), 'icons must be an array');
  assert.ok(manifest.icons.length > 0, 'manifest must have at least one icon');
});

test('pwa: manifest theme_color matches HTML meta theme-color', async () => {
  const manifest = JSON.parse(await readDist('manifest.json'));
  const html = await readDist('index.html');
  const metaMatch = html.match(/name="theme-color"\s+content="([^"]+)"/);
  assert.ok(metaMatch, 'index.html must have theme-color meta tag');
  assert.equal(manifest.theme_color, metaMatch[1],
    `manifest theme_color (${manifest.theme_color}) must match HTML meta (${metaMatch[1]})`);
});

test('pwa: manifest background_color matches app dark theme', async () => {
  const manifest = JSON.parse(await readDist('manifest.json'));
  assert.equal(manifest.background_color, '#05080e',
    'background_color must match the app dark background');
});

test('pwa: manifest display is standalone', async () => {
  const manifest = JSON.parse(await readDist('manifest.json'));
  assert.equal(manifest.display, 'standalone',
    'display must be standalone for app-like experience');
});

test('pwa: manifest has icons with src, sizes, and type', async () => {
  const manifest = JSON.parse(await readDist('manifest.json'));
  for (const icon of manifest.icons) {
    assert.ok(icon.src, 'each icon must have src');
    assert.ok(icon.sizes, 'each icon must have sizes');
    assert.ok(icon.type, 'each icon must have type');
  }
});

test('pwa: manifest references icon.svg', async () => {
  const manifest = JSON.parse(await readDist('manifest.json'));
  const hasSvgIcon = manifest.icons.some(i => i.src.includes('icon.svg'));
  assert.ok(hasSvgIcon, 'manifest must reference icon.svg');
});

// ── Icon file ───────────────────────────────────────────────────

test('pwa: icon.svg exists in dist', async () => {
  assert.ok(await exists('icon.svg'), 'dist/icon.svg must exist');
});

test('pwa: icon.svg exists in src', async () => {
  await access(path.join(srcDir, 'icon.svg'));
});

test('pwa: icon.svg is a valid SVG with viewBox', async () => {
  const svg = await readDist('icon.svg');
  assert.match(svg, /<svg[^>]*xmlns=/);
  assert.match(svg, /viewBox=/);
});

// ── index.html integration ──────────────────────────────────────

test('pwa: index.html links manifest.json', async () => {
  const html = await readDist('index.html');
  assert.match(html, /rel="manifest"\s+href="manifest\.json"/);
});

test('pwa: index.html has service worker registration', async () => {
  const html = await readDist('index.html');
  assert.match(html, /src="sw-register\.js"/);
});

test('pwa: sw-register.js exists in dist', async () => {
  assert.ok(await exists('sw-register.js'), 'dist/sw-register.js must exist');
});

test('pwa: sw-register.js registers service worker', async () => {
  const js = await readDist('sw-register.js');
  assert.match(js, /serviceWorker.*register\s*\(\s*['"]sw\.js['"]/);
});

test('pwa: index.html has favicon link to icon.svg', async () => {
  const html = await readDist('index.html');
  assert.match(html, /rel="icon"\s+href="icon\.svg"/);
});

test('pwa: index.html has apple-touch-icon link', async () => {
  const html = await readDist('index.html');
  assert.match(html, /rel="apple-touch-icon"/);
});

test('pwa: index.html has apple-mobile-web-app-capable meta', async () => {
  const html = await readDist('index.html');
  assert.match(html, /apple-mobile-web-app-capable/);
});

test('pwa: index.html has apple-mobile-web-app-title meta', async () => {
  const html = await readDist('index.html');
  assert.match(html, /apple-mobile-web-app-title/);
});

test('pwa: service worker registration is guarded by feature detection', async () => {
  const js = await readDist('sw-register.js');
  assert.match(js, /['"]serviceWorker['"]\s*in\s*navigator/);
});

test('pwa: service worker registration fires on window load', async () => {
  const js = await readDist('sw-register.js');
  assert.match(js, /addEventListener\s*\(\s*['"]load['"]/);
});

// ── Source HTML matches dist HTML for PWA features ───────────────

test('pwa: src/index.html has manifest link', async () => {
  const html = await readSrc('index.html');
  assert.match(html, /rel="manifest"\s+href="manifest\.json"/);
});

test('pwa: src/index.html has SW registration script reference', async () => {
  const html = await readSrc('index.html');
  assert.match(html, /src="sw-register\.js"/);
});

// ── Content Security Policy ─────────────────────────────────────

// Helper: extract the full CSP policy string from index.html
async function readCsp() {
  const html = await readDist('index.html');
  const m = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  return m ? m[1] : '';
}

test('pwa: index.html has Content-Security-Policy meta tag', async () => {
  const html = await readDist('index.html');
  assert.match(html, /http-equiv="Content-Security-Policy"/);
});

test('pwa: CSP restricts script-src to self only (no unsafe-inline)', async () => {
  const csp = await readCsp();
  assert.ok(csp, 'CSP meta tag must exist');
  const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/);
  assert.ok(scriptSrcMatch, 'CSP must include script-src directive');
  const scriptSrc = scriptSrcMatch[1];
  assert.ok(!scriptSrc.includes("'unsafe-inline'"),
    'CSP script-src must not allow unsafe-inline (XSS protection)');
  assert.ok(scriptSrc.includes("'self'"),
    'CSP script-src must allow self');
});

test('pwa: CSP restricts object-src to none', async () => {
  const csp = await readCsp();
  const objectSrcMatch = csp.match(/object-src\s+([^;]+)/);
  assert.ok(objectSrcMatch, 'CSP must include object-src directive');
  assert.ok(objectSrcMatch[1].includes("'none'"),
    'CSP object-src must be none (no Flash/plugins)');
});

test('pwa: CSP restricts frame-ancestors to none', async () => {
  const csp = await readCsp();
  const frameAncestorsMatch = csp.match(/frame-ancestors\s+([^;]+)/);
  assert.ok(frameAncestorsMatch, 'CSP must include frame-ancestors directive');
  assert.ok(frameAncestorsMatch[1].includes("'none'"),
    'CSP frame-ancestors must be none (clickjacking protection)');
});

test('pwa: CSP allows Google Fonts for style-src and font-src', async () => {
  const csp = await readCsp();
  assert.ok(csp.includes('fonts.googleapis.com'),
    'CSP must allow fonts.googleapis.com for styles');
  assert.ok(csp.includes('fonts.gstatic.com'),
    'CSP must allow fonts.gstatic.com for fonts');
});

test('pwa: CSP allows worker-src for service worker', async () => {
  const csp = await readCsp();
  const workerSrcMatch = csp.match(/worker-src\s+([^;]+)/);
  assert.ok(workerSrcMatch, 'CSP must include worker-src directive');
  assert.ok(workerSrcMatch[1].includes("'self'"),
    'CSP worker-src must allow self for service worker');
});

test('pwa: CSP allows manifest-src for PWA manifest', async () => {
  const csp = await readCsp();
  const manifestSrcMatch = csp.match(/manifest-src\s+([^;]+)/);
  assert.ok(manifestSrcMatch, 'CSP must include manifest-src directive');
  assert.ok(manifestSrcMatch[1].includes("'self'"),
    'CSP manifest-src must allow self for manifest.json');
});
