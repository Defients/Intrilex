import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static contract tests for the /release-notes workspace. These verify the
// source declares the expected exports, DOM hooks, router wiring, CSS, and
// changelog data pipeline — mirroring the project's browser-contract pattern.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (p) => readFile(path.join(root, p), 'utf8');

test('release-notes: workspace exports renderReleaseNotes', async () => {
  const js = await read('apps/lab-web/src/workspaces/release-notes.js');
  assert.match(js, /export async function renderReleaseNotes/);
});

test('release-notes: workspace imports renderMarkdown + slugify from rulebook-renderer (no duplication)', async () => {
  const js = await read('apps/lab-web/src/workspaces/release-notes.js');
  assert.match(js, /import \{ renderMarkdown, slugify \} from '\.\.\/rulebook-renderer\.js'/);
  // The local duplicate slugify must be removed — slugify is now shared.
  assert.doesNotMatch(js, /function slugify\(text\)/);
});

test('release-notes: rulebook-renderer exports slugify for reuse', async () => {
  const js = await read('apps/lab-web/src/rulebook-renderer.js');
  assert.match(js, /export function slugify\(text\)/);
});

test('release-notes: router defines /release-notes route (reachable from homepage, not in nav)', async () => {
  const js = await read('apps/lab-web/src/router.js');
  // The route is still declared in WORKSPACES so route() resolves it, but it
  // is intentionally excluded from the SECTIONS nav (the homepage links to it).
  assert.match(js, /\['\/release-notes','✧','Release Notes','What\\?'s new'\]/);
  assert.match(js, /'\/release-notes':'What\\?'s new/);
  // Must NOT appear in the rendered nav sections.
  assert.doesNotMatch(js, /routes: \['\/evidence', '\/release-notes/);
});

test('release-notes: app.js imports and dispatches /release-notes', async () => {
  const js = await read('apps/lab-web/src/app.js');
  assert.match(js, /import \{ renderReleaseNotes \} from '\.\/workspaces\/release-notes\.js'/);
  assert.match(js, /'\/release-notes': renderReleaseNotes/);
});

test('release-notes: landing rail links to #/release-notes', async () => {
  const js = await read('apps/lab-web/src/app.js');
  assert.match(js, /href="#\/release-notes"/);
});

test('release-notes: workspace renders version summary cards from version.js', async () => {
  const js = await read('apps/lab-web/src/workspaces/release-notes.js');
  assert.match(js, /import \{ LAB_VERSION, ENGINE_VERSION, RULES_VERSION \} from '\.\.\/version\.js'/);
  assert.match(js, /release-notes-summary/);
  assert.match(js, /release-notes-stat/);
  assert.match(js, /Lab version/);
  assert.match(js, /Engine/);
  assert.match(js, /Rules/);
  assert.match(js, /Releases/);
});

test('release-notes: workspace builds a quick-nav sidebar from ## version headers', async () => {
  const js = await read('apps/lab-web/src/workspaces/release-notes.js');
  // Parses ## v… headers into versionEntries
  assert.match(js, /match\(\/\^##\\s\+\(v/);
  assert.match(js, /versionEntries\.push/);
  assert.match(js, /release-notes-nav/);
  assert.match(js, /data-version-slug/);
  assert.match(js, /aria-label="Release navigation"/);
});

test('release-notes: workspace wires quick-nav click → smooth scroll + highlight', async () => {
  const js = await read('apps/lab-web/src/workspaces/release-notes.js');
  assert.match(js, /data-version-slug/);
  assert.match(js, /scrollIntoView/);
  assert.match(js, /release-notes-highlight/);
  assert.match(js, /preventDefault/);
});

test('release-notes: workspace shows a loading spinner while fetching', async () => {
  const js = await read('apps/lab-web/src/workspaces/release-notes.js');
  assert.match(js, /rules-loading/);
  assert.match(js, /loading-spinner/);
  assert.match(js, /Loading release notes/);
});

test('release-notes: workspace shows an error notice when changelog fetch fails', async () => {
  const js = await read('apps/lab-web/src/workspaces/release-notes.js');
  assert.match(js, /notice danger/);
  assert.match(js, /Changelog not found/);
  assert.match(js, /data\/changelog\.md/);
});

test('release-notes: workspace fetches data/changelog.md', async () => {
  const js = await read('apps/lab-web/src/workspaces/release-notes.js');
  assert.match(js, /fetch\('data\/changelog\.md'\)/);
});

test('release-notes: CSS defines all workspace classes', async () => {
  const css = await read('apps/lab-web/src/css/feature-components.css');
  for (const cls of [
    '.release-notes-summary',
    '.release-notes-stat',
    '.release-notes-panel',
    '.release-notes-panel-header',
    '.release-notes-body',
    '.release-notes-nav',
    '.release-notes-content',
    '.release-notes-highlight',
  ]) {
    assert.ok(css.includes(cls), `CSS missing ${cls}`);
  }
  // Highlight flash animation
  assert.match(css, /@keyframes release-notes-flash/);
  // Responsive collapse
  assert.match(css, /@media\(max-width:900px\)/);
});

test('release-notes: root CHANGELOG.md exists and is a valid changelog', async () => {
  const md = await read('CHANGELOG.md');
  assert.match(md, /^# Changelog/m);
  // At least one version entry
  assert.match(md, /^## v[\d.]+/m);
});

test('release-notes: build.mjs copies CHANGELOG.md → dist/data/changelog.md', async () => {
  const build = await read('scripts/build.mjs');
  assert.match(build, /CHANGELOG\.md.*data\/changelog\.md/);
});

test('release-notes: neocities sync script exists and mirrors dist → deploy', async () => {
  assert.ok(existsSync(path.join(root, 'scripts/sync-neocities.mjs')), 'sync-neocities.mjs missing');
  assert.ok(existsSync(path.join(root, 'scripts/upload-neocities.mjs')), 'upload-neocities.mjs missing');
  const sync = await read('scripts/sync-neocities.mjs');
  assert.match(sync, /dist.*neocities-deploy/);
  // Prunes stale data files no longer in dist
  assert.match(sync, /Pruned/);
});

test('release-notes: index.html declares OG + Twitter social share metadata', async () => {
  const html = await read('apps/lab-web/src/index.html');
  assert.match(html, /og:image/);
  assert.match(html, /og:image:width.*1200/);
  assert.match(html, /og:image:height.*630/);
  assert.match(html, /twitter:card/);
  assert.match(html, /twitter:image/);
  assert.match(html, /robots/);
});

test('release-notes: og-image.png asset exists after build', async () => {
  const assetPath = path.join(root, 'apps/lab-web/src/assets/og-image.png');
  assert.ok(existsSync(assetPath), 'og-image.png missing — run build to generate');
});

test('release-notes: robots.txt exists for SEO crawlers', async () => {
  const robotsPath = path.join(root, 'apps/lab-web/src/robots.txt');
  assert.ok(existsSync(robotsPath), 'robots.txt missing');
  const robots = await read('apps/lab-web/src/robots.txt');
  // Must allow crawling (empty or "User-agent: * / Allow: /")
  assert.match(robots, /User-agent:\s*\*/);
});
