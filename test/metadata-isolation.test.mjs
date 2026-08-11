// ═══════════════════════════════════════════════════════════════
// metadata-isolation.test.mjs — Route identity & metadata isolation
//
// Verifies that:
//   1. The static index.html owns homepage identity (not Lab identity)
//   2. The observatory shell is semantically hidden in static HTML
//   3. Dialog headings are empty in static HTML (populated by JS)
//   4. The seo-metadata module defines per-route metadata
//   5. Icon-only buttons have contextual aria-labels
//   6. No Lab-specific text contaminates the static homepage HTML
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

// ── Static HTML identity ──

test('metadata: index.html title is homepage identity, not Lab identity', async () => {
  const html = await src('index.html');
  assert.match(html, /<title>Intrilex — Competitive Playing Card Game<\/title>/);
  assert.doesNotMatch(html, /<title>.*Simulation Lab.*<\/title>/);
});

test('metadata: index.html meta description is game-focused, not Lab-focused', async () => {
  const html = await src('index.html');
  const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
  assert.ok(descMatch, 'must have meta description');
  const desc = descMatch[1];
  assert.ok(desc.includes('card game') || desc.includes('playing card'), 'description must mention card game');
  assert.doesNotMatch(desc, /Simulation Lab/i);
});

test('metadata: index.html OG title is homepage identity', async () => {
  const html = await src('index.html');
  const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]*)"/);
  assert.ok(ogTitleMatch, 'must have og:title');
  assert.ok(ogTitleMatch[1].includes('Intrilex'), 'og:title must include Intrilex');
  assert.doesNotMatch(ogTitleMatch[1], /Simulation Lab/i);
});

test('metadata: index.html OG site_name is Intrilex, not Simulation Lab', async () => {
  const html = await src('index.html');
  const siteNameMatch = html.match(/<meta property="og:site_name" content="([^"]*)"/);
  assert.ok(siteNameMatch, 'must have og:site_name');
  assert.equal(siteNameMatch[1], 'Intrilex');
});

test('metadata: index.html Twitter title is homepage identity', async () => {
  const html = await src('index.html');
  const twTitleMatch = html.match(/<meta name="twitter:title" content="([^"]*)"/);
  assert.ok(twTitleMatch, 'must have twitter:title');
  assert.doesNotMatch(twTitleMatch[1], /Simulation Lab/i);
});

test('metadata: index.html JSON-LD WebApplication name is Intrilex', async () => {
  const html = await src('index.html');
  // The primary WebApplication name should be "Intrilex", not "Intrilex Simulation Lab"
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'must have JSON-LD structured data');
  const json = JSON.parse(jsonLdMatch[1]);
  const webApp = json['@graph']?.find(n => n['@type'] === 'WebApplication');
  assert.ok(webApp, 'must have WebApplication in @graph');
  assert.equal(webApp.name, 'Intrilex');
  assert.equal(webApp.alternateName, 'Intrilex Simulation Lab');
});

test('metadata: index.html application-name meta is Intrilex, not Simulation Lab', async () => {
  const html = await src('index.html');
  const appNameMatch = html.match(/<meta name="application-name" content="([^"]*)"/);
  assert.ok(appNameMatch, 'must have application-name meta');
  assert.equal(appNameMatch[1], 'Intrilex');
});

// ── Observatory shell semantic hiding ──

test('metadata: observatory shell has hidden attribute in static HTML', async () => {
  const html = await src('index.html');
  assert.match(html, /class="observatory-shell"[^>]*hidden/, 'observatory shell must have hidden attribute');
  assert.match(html, /class="observatory-shell"[^>]*inert/, 'observatory shell must have inert attribute');
  assert.match(html, /class="observatory-shell"[^>]*aria-hidden="true"/, 'observatory shell must have aria-hidden="true"');
});

test('metadata: observatory shell does not contain Lab text in static HTML', async () => {
  const html = await src('index.html');
  // The shell structure exists but Lab-specific text is populated by JS
  assert.doesNotMatch(html, /SIMULATION LAB · v/, 'brand block small must be empty');
  assert.doesNotMatch(html, /DETERMINISTIC MECHANICS OBSERVATORY/, 'eyebrow must be empty');
  assert.doesNotMatch(html, />Watch</, 'page-title h1 must be empty');
  assert.doesNotMatch(html, /Canonical match truth with evidence/, 'page-subtitle must be empty');
  assert.doesNotMatch(html, /Engine 4\.\d/, 'authority stamp engine text must be empty');
  assert.doesNotMatch(html, /Official Rules 4\.\d/, 'authority stamp rules text must be empty');
});

// ── Dialog heading hygiene ──

test('metadata: command palette dialog heading is empty in static HTML', async () => {
  const html = await src('index.html');
  // The dialog structure exists but heading text is populated by JS
  const dialogMatch = html.match(/<dialog id="command-palette"[\s\S]*?<\/dialog>/);
  assert.ok(dialogMatch, 'must have command-palette dialog');
  assert.doesNotMatch(dialogMatch[0], /QUICK NAVIGATION/, 'eyebrow must be empty');
  assert.doesNotMatch(dialogMatch[0], /Command palette/, 'title must be empty');
});

test('metadata: integrity dialog heading is empty in static HTML', async () => {
  const html = await src('index.html');
  const dialogMatch = html.match(/<dialog id="integrity-dialog"[\s\S]*?<\/dialog>/);
  assert.ok(dialogMatch, 'must have integrity-dialog');
  assert.doesNotMatch(dialogMatch[0], /RELEASE AUTHORITY/, 'eyebrow must be empty');
  assert.doesNotMatch(dialogMatch[0], /Integrity and capability/, 'title must be empty');
});

test('metadata: advanced card rules dialog heading is empty in static HTML', async () => {
  const html = await src('index.html');
  const dialogMatch = html.match(/<dialog id="advanced-card-rules-dialog"[\s\S]*?<\/dialog>/);
  assert.ok(dialogMatch, 'must have advanced-card-rules-dialog');
  assert.doesNotMatch(dialogMatch[0], /Advanced Card Details/, 'eyebrow must be empty');
  assert.doesNotMatch(dialogMatch[0], /Card rules/, 'title must be empty');
});

// ── Icon-only button accessible names ──

test('a11y: command palette close button has contextual aria-label', async () => {
  const html = await src('index.html');
  const dialogMatch = html.match(/<dialog id="command-palette"[\s\S]*?<\/dialog>/);
  assert.ok(dialogMatch);
  assert.match(dialogMatch[0], /aria-label="Close command palette"/);
  assert.doesNotMatch(dialogMatch[0], /aria-label="Close"/);
});

test('a11y: integrity dialog close button has contextual aria-label', async () => {
  const html = await src('index.html');
  const dialogMatch = html.match(/<dialog id="integrity-dialog"[\s\S]*?<\/dialog>/);
  assert.ok(dialogMatch);
  assert.match(dialogMatch[0], /aria-label="Close integrity dialog"/);
  assert.doesNotMatch(dialogMatch[0], /aria-label="Close"/);
});

test('a11y: advanced card rules close button has contextual aria-label', async () => {
  const html = await src('index.html');
  const dialogMatch = html.match(/<dialog id="advanced-card-rules-dialog"[\s\S]*?<\/dialog>/);
  assert.ok(dialogMatch);
  assert.match(dialogMatch[0], /aria-label="Close advanced card details"/);
});

// ── seo-metadata.js module ──

test('metadata: seo-metadata.js exports applyRouteMetadata and helpers', async () => {
  const js = await src('seo-metadata.js');
  assert.match(js, /export function applyRouteMetadata/);
  assert.match(js, /export function populateObservatoryShellText/);
  assert.match(js, /export function populateDialogHeading/);
  // Convenience wrappers were removed as dead code
  assert.doesNotMatch(js, /export function applyHomeMetadata/);
  assert.doesNotMatch(js, /export function applyLabMetadata/);
});

test('metadata: seo-metadata.js defines homepage route with game-focused title', async () => {
  const js = await src('seo-metadata.js');
  assert.match(js, /title: 'Intrilex — Competitive Playing Card Game'/);
  assert.match(js, /canonicalPath: '\/'/);
});

test('metadata: seo-metadata.js defines Lab route with Lab-focused title', async () => {
  const js = await src('seo-metadata.js');
  assert.match(js, /title: 'Intrilex Simulation Lab — Deterministic Match Analysis'/);
});

test('metadata: seo-metadata.js defines legal routes with legal-focused titles', async () => {
  const js = await src('seo-metadata.js');
  assert.match(js, /title: 'Intrilex — Privacy Policy'/);
  assert.match(js, /title: 'Intrilex — Terms of Service'/);
});

test('metadata: seo-metadata.js defines play routes', async () => {
  const js = await src('seo-metadata.js');
  assert.match(js, /'\/play'/);
  assert.match(js, /'\/play\/online'/);
  assert.match(js, /'\/play\/new'/);
});

test('metadata: seo-metadata.js imports version constants from version.js', async () => {
  const js = await src('seo-metadata.js');
  assert.match(js, /import.*LAB_VERSION.*ENGINE_VERSION.*RULES_VERSION.*from.*\.\/version\.js/);
});

test('metadata: seo-metadata.js populateObservatoryShellText sets Lab version text', async () => {
  const js = await src('seo-metadata.js');
  assert.match(js, /SIMULATION LAB · v\$\{LAB_VERSION\}/);
  assert.match(js, /Engine \$\{ENGINE_VERSION\}/);
  assert.match(js, /Official Rules \$\{RULES_VERSION\}/);
  assert.match(js, /DETERMINISTIC MECHANICS OBSERVATORY/);
});

// ── app.js integration ──

test('metadata: app.js imports and uses seo-metadata module', async () => {
  const js = await src('app.js');
  assert.match(js, /import.*applyRouteMetadata.*from.*\.\/seo-metadata\.js/);
  assert.match(js, /applyRouteMetadata\(r\)/);
});

test('metadata: app.js does not hardcode Lab description as default', async () => {
  const js = await src('app.js');
  // The old ad-hoc metadata restore block is gone
  assert.doesNotMatch(js, /Intrilex Simulation Lab — deterministic card-game simulation.*defaultDesc/);
  assert.doesNotMatch(js, /Restore default SEO meta when leaving legal routes/);
});

test('metadata: app.js hideShell uses hidden + inert + aria-hidden', async () => {
  const js = await src('app.js');
  assert.match(js, /function hideShell/);
  assert.match(js, /setAttribute\('hidden'/);
  assert.match(js, /setAttribute\('inert'/);
  assert.match(js, /setAttribute\('aria-hidden', 'true'\)/);
});

test('a11y: hideShell redirects skip-link to #landing-app (visible content)', async () => {
  const js = await src('app.js');
  assert.match(js, /skip.*href.*#landing-app/);
});

test('a11y: showShell restores skip-link to #main (observatory content)', async () => {
  const js = await src('app.js');
  assert.match(js, /skip.*href.*#main/);
});

test('metadata: app.js showShell removes hidden + inert + aria-hidden and populates text', async () => {
  const js = await src('app.js');
  assert.match(js, /function showShell/);
  assert.match(js, /removeAttribute\('hidden'\)/);
  assert.match(js, /removeAttribute\('inert'\)/);
  assert.match(js, /removeAttribute\('aria-hidden'\)/);
  assert.match(js, /populateObservatoryShellText/);
});

// ── experiment-controls.js integration ──

test('metadata: experiment-controls.js populates command palette heading on open', async () => {
  const js = await src('experiment-controls.js');
  assert.match(js, /populateDialogHeading.*command-palette.*QUICK NAVIGATION.*Command palette/);
});

// ── integrity.js integration ──

test('metadata: integrity.js populates integrity dialog heading on open', async () => {
  const js = await src('integrity.js');
  assert.match(js, /populateDialogHeading.*integrity-dialog.*RELEASE AUTHORITY.*Integrity and capability/);
});

// ── advanced-card-rules-controller.mjs integration ──

test('metadata: advanced-card-rules-controller populates dialog eyebrow on open', async () => {
  const js = await src('play/advanced-card-rules/advanced-card-rules-controller.mjs');
  assert.match(js, /Advanced Card Details/);
  assert.match(js, /eyebrowEl.*textContent/);
});

// ── manifest.json identity ──

test('metadata: manifest.json name is Intrilex, not Simulation Lab', async () => {
  const manifest = JSON.parse(await src('manifest.json'));
  assert.equal(manifest.name, 'Intrilex');
  assert.equal(manifest.short_name, 'Intrilex');
  assert.doesNotMatch(manifest.description, /Simulation Lab/i);
});

// ── robots.txt ──

test('metadata: robots.txt does not reference Simulation Lab', async () => {
  const robots = await src('robots.txt');
  assert.doesNotMatch(robots, /Simulation Lab/i);
  assert.match(robots, /Sitemap: https:\/\/intrilex\.cards\/sitemap\.xml/);
});

// ── sitemap.xml ──

test('metadata: sitemap.xml exists with root URL', async () => {
  const sitemap = await src('sitemap.xml');
  assert.match(sitemap, /https:\/\/intrilex\.cards\//);
  assert.match(sitemap, /<urlset/);
});

// ── Metadata cleanup lifecycle ──

test('metadata: app.js render() applies route metadata before route dispatch', async () => {
  const js = await src('app.js');
  // applyRouteMetadata is called at the top of render(), before any route dispatch
  const renderIdx = js.indexOf('export function render()');
  const applyIdx = js.indexOf('applyRouteMetadata(r)');
  assert.ok(renderIdx > -1 && applyIdx > -1, 'must have render() and applyRouteMetadata call');
  assert.ok(applyIdx > renderIdx, 'applyRouteMetadata must be inside render()');
  // Ensure it's before the isPlayRoute check
  const playRouteIdx = js.indexOf('isPlayRoute(r)', applyIdx);
  assert.ok(playRouteIdx > -1, 'isPlayRoute check must follow applyRouteMetadata');
});
