import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');
const dist = (rel) => readFile(path.join(root, 'apps/lab-web/dist', rel), 'utf8');
const cssSrc = async () => (await Promise.all(['tokens-base','feature-components','pages-polish'].map(f => readFile(path.join(root, 'apps/lab-web/src/css', `${f}.css`), 'utf8')))).join('\n');

// ── Routes ──
test('LANDING_MODES set contains /, /play, /rules', async () => {
  const js = await src('router.js');
  assert.match(js, /LANDING_MODES\s*=\s*new Set\(\['\/'/);
  assert.match(js, /'\/play'/);
  assert.match(js, /'\/rules'/);
});

test('route() maps /sim to /watch', async () => {
  const js = await src('router.js');
  assert.match(js, /r === '\/sim'\) return '\/watch'/);
});

test('route() returns landing modes for /, /play, /rules', async () => {
  const js = await src('router.js');
  assert.match(js, /LANDING_MODES\.has\(r\) \|\| isPlayRoute\(r\)\) return r/);
});

// ── Render functions ──
test('renderLanding() exists and renders three CTA cards', async () => {
  const js = await src('app.js');
  assert.match(js, /function renderLanding\(\)/);
  assert.match(js, /landing-card.*play/);
  assert.match(js, /landing-card.*rules/);
  assert.match(js, /landing-card.*sim/);
});

test('renderPlayMode() exists and lazy-loads the play module', async () => {
  const js = await src('app.js');
  assert.match(js, /function renderPlayMode/);
  assert.match(js, /import\('\.\/play\/play-app\.js'\)/);
});

test('renderRules() exists and calls renderRulesPage', async () => {
  const js = await src('app.js');
  assert.match(js, /function renderRules\(\)/);
  assert.match(js, /renderRulesPage/);
});

test('renderLandingMode() dispatches to render functions for / and /rules', async () => {
  const js = await src('app.js');
  assert.ok(js.includes('function renderLandingMode(r)'), 'must have renderLandingMode function');
  assert.ok(js.includes("if (r === '/') renderLanding()"), 'must dispatch / to renderLanding');
  assert.ok(js.includes("if (r === '/rules') renderRules()"), 'must dispatch /rules to renderRules');
});

// ── Render guard ──
test('render() hides observatory shell and shows landing container for landing modes', async () => {
  const js = await src('app.js');
  assert.match(js, /LANDING_MODES\.has\(r\)/);
  assert.match(js, /shell\.style\.display = 'none'/);
  assert.match(js, /landingContainer\.style\.display = 'block'/);
});

test('render() shows observatory shell and hides landing container for observatory modes', async () => {
  const js = await src('app.js');
  assert.match(js, /shell\.style\.display = ''/);
  assert.match(js, /landingContainer\.style\.display = 'none'/);
});

test('render() loads replay on first observatory entry after landing boot', async () => {
  const js = await src('app.js');
  assert.match(js, /loadReplay\(state\.fixtureId\)\.then\(render\)/);
});

// ── Boot guard ──
test('boot() skips loadReplay for landing and play modes', async () => {
  const js = await src('data-loader.js');
  assert.match(js, /isPlayRoute\(r\)/);
  assert.match(js, /!LANDING_MODES\.has\(r\)\) await loadReplay/);
});

// ── Rulebook renderer ──
test('rulebook-renderer.js exports renderMarkdown and renderRulesPage', async () => {
  const js = await src('rulebook-renderer.js');
  assert.match(js, /export function renderMarkdown/);
  assert.match(js, /export async function renderRulesPage/);
});

test('renderMarkdown handles ATX headers', async () => {
  const js = await src('rulebook-renderer.js');
  assert.ok(js.includes('headerMatch'), 'must have headerMatch variable');
  assert.ok(js.includes('#{1,6}'), 'must match ATX headers with #{1,6} pattern');
});

test('renderMarkdown handles pipe tables', async () => {
  const js = await src('rulebook-renderer.js');
  assert.ok(js.includes('isTableSeparator'), 'must have isTableSeparator function');
  assert.ok(js.includes('parseTableRow'), 'must have parseTableRow function');
});

test('renderMarkdown handles ordered and unordered lists', async () => {
  const js = await src('rulebook-renderer.js');
  assert.ok(js.includes('[-*+]'), 'must handle unordered list markers');
  assert.ok(js.includes('\\d+'), 'must handle ordered list markers');
});

test('renderMarkdown handles bold, italic, and inline code', async () => {
  const js = await src('rulebook-renderer.js');
  assert.match(js, /\\\*\\\*\(\[\^\*\]\+\)\\\*\\\*/);
  assert.match(js, /renderInline/);
  assert.match(js, /codeSpans/);
});

test('renderMarkdown handles fenced code blocks', async () => {
  const js = await src('rulebook-renderer.js');
  assert.match(js, /```.*\.test\(line\)/);
});

test('renderMarkdown handles blockquotes', async () => {
  const js = await src('rulebook-renderer.js');
  assert.match(js, /\/\^>\\s\?\/\.test\(line\)/);
});

test('renderMarkdown handles horizontal rules', async () => {
  const js = await src('rulebook-renderer.js');
  assert.ok(js.includes('---+'), 'must detect horizontal rule with ---+');
  assert.ok(js.includes('<hr>'), 'must render hr element');
});

test('buildToc extracts h1 and h2 headers', async () => {
  const js = await src('rulebook-renderer.js');
  assert.ok(js.includes('function buildToc'), 'must have buildToc function');
  assert.ok(js.includes('level: 1'), 'must extract level 1 headers');
  assert.ok(js.includes('level: 2'), 'must extract level 2 headers');
});

test('renderCollapsibleParts wraps # PART sections in details elements', async () => {
  const js = await src('rulebook-renderer.js');
  assert.match(js, /function renderCollapsibleParts/);
  assert.match(js, /\/\^PART\/i\.test/);
  assert.match(js, /<details class="rules-part"/);
});

test('renderRulesPage fetches data/rulebook.md and renders TOC + content', async () => {
  const js = await src('rulebook-renderer.js');
  assert.match(js, /fetch\('data\/rulebook\.md'\)/);
  assert.match(js, /rules-page/);
  assert.match(js, /rules-toc/);
  assert.match(js, /rules-content/);
});

// ── HTML container ──
test('index.html contains landing-app container', async () => {
  const html = await src('index.html');
  assert.match(html, /id="landing-app"/);
});

// ── Workspace search/filter ──
test('renderNavigation includes a search input for filtering workspaces', async () => {
  const js = await src('router.js');
  assert.match(js, /id="nav-search"/, 'must render a search input with id="nav-search"');
  assert.match(js, /filterWorkspaces/, 'must export filterWorkspaces function');
});

test('filterWorkspaces hides non-matching workspace links', async () => {
  const js = await src('router.js');
  assert.match(js, /export function filterWorkspaces/, 'must export filterWorkspaces');
  assert.match(js, /data-search/, 'must use data-search attribute for filtering');
  assert.match(js, /haystack\.includes\(q\)/, 'must filter by substring match');
  assert.match(js, /visibleCount/, 'must track visible count per section');
});

test('workspace links include data-search attribute with searchable text', async () => {
  const js = await src('router.js');
  assert.match(js, /data-search="\$\{esc\(/, 'must include escaped data-search attribute');
});

test('experiment-controls wires "/" keyboard shortcut to focus nav search', async () => {
  const js = await src('experiment-controls.js');
  assert.match(js, /e\.key === '\/'/, 'must listen for "/" key');
  assert.match(js, /nav-search/, 'must focus #nav-search');
});

test('pages-polish.css has nav-search styles', async () => {
  const css = await cssSrc();
  assert.match(css, /\.nav-search/, 'must have .nav-search CSS rule');
  assert.match(css, /\.nav-search-wrap/, 'must have .nav-search-wrap wrapper');
});

// ── Simulation Lab back-to-landing navigation ──
test('index.html brand-block is a link to landing page', async () => {
  const html = await src('index.html');
  assert.match(html, /<a class="brand-block" href="#\/"/, 'brand-block must be an anchor linking to #/');
});

test('index.html has a visible back-home button in the observatory header', async () => {
  const html = await src('index.html');
  assert.match(html, /sim-back-home/, 'must have a sim-back-home button class');
  assert.match(html, /href="#\/"/, 'back-home button must link to #/');
});

test('dev-server.mjs default URL points to landing page', async () => {
  const dev = await readFile(path.join(root, 'scripts/dev-server.mjs'), 'utf8');
  assert.match(dev, /4173\/#\/['"]/);
  assert.ok(!dev.includes('#/match'), 'dev server must not default to #/match');
});

// ── Onboarding tour ──
test('onboarding-tour.js exports shouldShowTour and startTour', async () => {
  const js = await src('onboarding-tour.js');
  assert.match(js, /export function shouldShowTour/, 'must export shouldShowTour');
  assert.match(js, /export function startTour/, 'must export startTour');
});

test('onboarding-tour.js persists completion in localStorage', async () => {
  const js = await src('onboarding-tour.js');
  assert.match(js, /localStorage\.setItem/, 'must persist completion via localStorage.setItem');
  assert.match(js, /localStorage\.getItem/, 'must check completion via localStorage.getItem');
  assert.match(js, /TOUR_KEY/, 'must use a TOUR_KEY constant');
});

test('onboarding-tour.js has at least 4 tour steps', async () => {
  const js = await src('onboarding-tour.js');
  assert.match(js, /TOUR_STEPS\s*=\s*\[/, 'must define TOUR_STEPS array');
  assert.match(js, /data-route="\/watch"/, 'must include Watch workspace step');
  assert.match(js, /data-route="\/replays"/, 'must include Replays workspace step');
  assert.match(js, /data-route="\/ranks"/, 'must include Ranks workspace step');
  assert.match(js, /data-route="\/traces"/, 'must include Traces workspace step');
});

test('onboarding-tour.js supports keyboard navigation (Escape, arrows)', async () => {
  const js = await src('onboarding-tour.js');
  assert.match(js, /e\.key === 'Escape'/, 'must handle Escape to close');
  assert.match(js, /ArrowRight/, 'must handle ArrowRight for next step');
  assert.match(js, /ArrowLeft/, 'must handle ArrowLeft for previous step');
});

test('onboarding-tour.js can be re-triggered via ?tour=1 URL parameter', async () => {
  const js = await src('onboarding-tour.js');
  assert.match(js, /tour.*===.*'1'/, 'must check for tour=1 URL parameter');
});

test('app.js imports and triggers onboarding tour', async () => {
  const js = await src('app.js');
  assert.match(js, /from '\.\/onboarding-tour\.js'/, 'must import from onboarding-tour.js');
  assert.match(js, /shouldShowTour\(\)/, 'must call shouldShowTour()');
  assert.match(js, /startTour\(\)/, 'must call startTour()');
});

test('pages-polish.css has tour overlay styles', async () => {
  const css = await cssSrc();
  assert.match(css, /\.tour-overlay/, 'must have .tour-overlay CSS rule');
  assert.match(css, /\.tour-spotlight/, 'must have .tour-spotlight CSS rule');
  assert.match(css, /\.tour-tooltip/, 'must have .tour-tooltip CSS rule');
});

test('CSS has brand-block link and back-home styles', async () => {
  const css = await cssSrc();
  assert.match(css, /a\.brand-block/, 'must style brand-block as link');
  assert.match(css, /sim-back-home/, 'must have sim-back-home class');
});

// ── CSS presence ──
test('styles.css has landing page classes', async () => {
  const css = await cssSrc();
  assert.match(css, /\.landing-app/);
  assert.match(css, /\.landing-hero/);
  assert.match(css, /\.landing-card/);
  assert.match(css, /\.landing-eyebrow/);
  assert.match(css, /\.landing-title/);
  assert.match(css, /\.landing-tagline/);
  assert.match(css, /\.landing-cards/);
  assert.match(css, /\.landing-footer/);
});

test('styles.css has play stub classes', async () => {
  const css = await cssSrc();
  assert.match(css, /\.play-stub/);
  assert.match(css, /\.play-feature-card/);
  assert.match(css, /\.play-feature-badge/);
  assert.match(css, /\.back-button/);
});

test('styles.css has rules page classes', async () => {
  const css = await cssSrc();
  assert.match(css, /\.rules-page/);
  assert.match(css, /\.rules-toc/);
  assert.match(css, /\.rules-content/);
  assert.match(css, /\.rules-part/);
  assert.match(css, /\.rules-frontmatter/);
});

test('styles.css has per-card accent colors', async () => {
  const css = await cssSrc();
  assert.match(css, /\.landing-card\.play/);
  assert.match(css, /\.landing-card\.rules/);
  assert.match(css, /\.landing-card\.sim/);
});

// ── CSS responsive ──
test('styles.css has responsive breakpoint for landing and rules', async () => {
  const css = await cssSrc();
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /\.landing-cards\{grid-template-columns:1fr/);
  assert.match(css, /\.rules-page\{grid-template-columns:1fr/);
});

// ── CSS reduced-motion ──
test('styles.css has reduced-motion support for landing animations', async () => {
  const css = await cssSrc();
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.landing-aurora\{animation:none\}/);
  assert.match(css, /\.landing-card:hover\{transform:none\}/);
});

// ── Build step ──
test('build.mjs copies rulebook to dist/data/rulebook.md', async () => {
  const build = await readFile(path.join(root, 'scripts/build.mjs'), 'utf8');
  assert.match(build, /docs\/INTRILEX_v4\.3\.1_COMPLETE_PLAYER_RULEBOOK\.md/);
  assert.match(build, /dist, 'data\/rulebook\.md'/);
});

// ── Built artifacts ──
test('dist/data/rulebook.md exists and contains PART headers', async () => {
  await access(path.join(root, 'apps/lab-web/dist/data/rulebook.md'));
  const rulebook = await dist('data/rulebook.md');
  assert.match(rulebook, /^#\s+PART/m);
});

test('dist/rulebook-renderer.js exists', async () => {
  await access(path.join(root, 'apps/lab-web/dist/rulebook-renderer.js'));
});

test('dist/app.js contains landing page render functions', async () => {
  const js = await dist('app.js');
  assert.match(js, /renderLanding/);
  assert.match(js, /renderPlay/);
  assert.match(js, /renderRules/);
});

// ── Import chain ──
test('app.js imports renderRulesPage from rulebook-renderer.js', async () => {
  const js = await src('app.js');
  assert.match(js, /import \{ renderRulesPage \} from '.\/rulebook-renderer\.js'/);
});
