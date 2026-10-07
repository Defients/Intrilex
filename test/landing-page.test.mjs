import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');
const dist = (rel) => readFile(path.join(root, 'apps/lab-web/dist', rel), 'utf8');
const cssSrc = async () => (await Promise.all(['tokens-base','feature-components','pages-polish','landing-revamp','landing-mobile'].map(f => readFile(path.join(root, 'apps/lab-web/src/css', `${f}.css`), 'utf8')))).join('\n');
const rulesCss = async () => readFile(path.join(root, 'apps/lab-web/src/css/rules-illustrated.css'), 'utf8');

// ── Routes ──
test('LANDING_MODES set contains /, /dev, /play, /rules', async () => {
  const js = await src('router.js');
  assert.match(js, /LANDING_MODES\s*=\s*new Set\(\['\/'/);
  assert.match(js, /'\/dev'/);
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
test('homepage renders via renderHome() from the home module', async () => {
  const js = await src('app.js');
  assert.match(js, /import \{ renderHome \} from '\.\/home\/home\.js'/);
  const view = await src('home/home-view.js');
  assert.match(view, /export function renderHomePage\(/);
  assert.match(view, /home-app/);
});

test('retired Intrilex Brain feature is absent from the landing page', async () => {
  const [js, styles] = await Promise.all([src('app.js'), src('styles.css')]);
  assert.doesNotMatch(js, /Explore the Intrilex Brain|brain-container|brain-controller|brain-2d/);
  assert.doesNotMatch(styles, /css\/brain\.css/);
});

test('retired WIP/launcher renderers are gone — homepage is canonical', async () => {
  const js = await src('app.js');
  assert.doesNotMatch(js, /function renderWipLanding\(\)/);
  assert.doesNotMatch(js, /function renderLanding\(\)/);
  const view = await src('home/home-view.js');
  assert.doesNotMatch(view, /wip-coming-soon|wip-newsletter|landing-mode-tile/);
});

test('homepage markup contains hero, mode CTAs, pulse, and ecosystem panels', async () => {
  const view = await src('home/home-view.js');
  assert.match(view, /home-hero/);
  assert.match(view, /home-mode-btn solo/);
  assert.match(view, /home-mode-btn direct/);
  assert.match(view, /home-pulse/);
  assert.match(view, /home-preseason/);
  assert.match(view, /home-news/);
  assert.match(view, /home-explore/);
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

test('renderLandingMode() dispatches / and /dev to the homepage and /rules to the rulebook', async () => {
  const js = await src('app.js');
  assert.ok(js.includes('function renderLandingMode(r)'), 'must have renderLandingMode function');
  assert.ok(js.includes('renderHome(landingContainer, homeCtx)'), 'must render the homepage');
  assert.ok(js.includes("if (r === '/' || r === '/dev')"), 'must dispatch / and /dev to the homepage');
  assert.ok(js.includes("if (r === '/rules') renderRules()"), 'must dispatch /rules to renderRules');
  assert.ok(js.includes("r === '/leaderboard'"), 'must dispatch /leaderboard overlay route');
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
  assert.match(js, /loadReplay\(state\.fixtureId\)\.then\(/);
});

// ── Boot guard ──
test('boot() skips loadReplay for landing and play modes', async () => {
  const js = await src('data-loader.js');
  assert.match(js, /isPlayRoute\(r\)/);
  assert.match(js, /!LANDING_MODES\.has\(r\).*await loadReplay/);
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
  assert.match(dev, /INTRILEX_DEV_PORT\s*\?\?\s*4173/, 'The default port is 4173 and remains configurable');
  assert.match(dev, /http:\/\/127\.0\.0\.1:\$\{devPort\}\/#\//, 'The advertised URL follows the configured port and lands at home');
  assert.ok(!dev.includes('#/match'), 'dev server must not default to #/match');
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
  assert.match(js, /renderHome|renderLanding/);
  assert.match(js, /renderPlay/);
  assert.match(js, /renderRules/);
});

// ── Import chain ──
test('app.js imports renderRulesPage from rulebook-renderer.js', async () => {
  const js = await src('app.js');
  assert.match(js, /import \{ renderRulesPage \} from '.\/rulebook-renderer\.js'/);
});

// ── Homepage polish pass (v0.24.2 final polish) ──
test('header brand sub uses timeless descriptor, not version string', async () => {
  const view = await src('home/home-view.js');
  assert.match(view, /TACTICAL PLAYING CARD GAME/);
  assert.doesNotMatch(view, /DETERMINISTIC CARD ENGINE.*V\$\{RULES_VERSION\}/);
});

test('hero has two real mode CTAs: Solo Duel and Direct Duel', async () => {
  const view = await src('home/home-view.js');
  assert.match(view, /PLAY SOLO DUEL/);
  assert.match(view, /PLAY DIRECT DUEL/);
  assert.match(view, /href="#\/play\/new"/);
  assert.match(view, /href="#\/play\/online"/);
  assert.match(view, /data-testid="home-solo-btn"/);
  assert.match(view, /data-testid="home-direct-btn"/);
});

test('Direct Duel copy does not overpromise with worldwide', async () => {
  const view = await src('home/home-view.js');
  assert.match(view, /Compete against real players online/);
  assert.doesNotMatch(view, /players worldwide/);
});

test('Learn Intrilex rail card removed (no redundant CTA to tutorial)', async () => {
  const js = await src('app.js');
  assert.doesNotMatch(js, /LEARN INTRILEX/);
  assert.doesNotMatch(js, /landing-rail-card learn/);
});

test('Continue Duel slot is in the topbar', async () => {
  const view = await src('home/home-view.js');
  const topbarStart = view.indexOf('home-topbar');
  const topbarEnd = view.indexOf('</header>', topbarStart);
  const topbarSection = view.slice(topbarStart, topbarEnd);
  assert.ok(topbarSection.includes('landing-continue-slot'), 'Continue slot must be in the topbar');
  assert.ok(topbarSection.includes('PLAY NOW'), 'Default utility action must be PLAY NOW');
});

test('Forums card removed (no discourse.group links)', async () => {
  const js = await src('app.js');
  const view = await src('home/home-view.js');
  assert.doesNotMatch(js, /discourse\.group/);
  assert.doesNotMatch(view, /discourse\.group/);
  assert.doesNotMatch(view, /landing-rail-card forums/);
});

test('Rules copy points at the official rulebook', async () => {
  const view = await src('home/home-view.js');
  assert.match(view, /official rules/i);
  assert.match(view, /href="#\/rules"/);
});

test('footer links carry the canonical version', async () => {
  const view = await src('home/home-view.js');
  assert.match(view, /v\$\{esc\(labVersion\)\}/);
});

test('footer credit uses muted color, not bright red', async () => {
  const css = await cssSrc();
  assert.match(css, /\.landing-footer-credit-name\{[^}]*color:#c4405a/);
  assert.match(css, /\.landing-footer-credit\{[^}]*opacity:\.85/);
  assert.doesNotMatch(css, /\.landing-footer-credit-name\{[^}]*color:#CC0011/);
});

// ── Homepage regression tests (IRX-M41/M42 heritage) ──
test('home.js uses AbortController to prevent document listener accumulation', async () => {
  const js = await src('home/home.js');
  assert.match(js, /_homeAbort/);
  assert.match(js, /new AbortController\(\)/);
  assert.match(js, /\{ signal \}/);
  assert.match(js, /_homeAbort\.abort\(\)/);
});

test('loadContinueCard guards against stale slot after navigation', async () => {
  const js = await src('home/home.js');
  assert.match(js, /slot\.isConnected/);
});

test('showPreAlphaOverlay guards against firing on wrong route', async () => {
  const js = await src('app.js');
  assert.match(js, /landingContainer\.isConnected/);
});

test('landing-revamp.css has -webkit-backdrop-filter alongside backdrop-filter', async () => {
  const css = await cssSrc();
  // Every backdrop-filter in landing-revamp must have the -webkit- prefix
  const revampSection = css.slice(css.indexOf('HOMEPAGE REVAMP'));
  const bdMatches = revampSection.match(/backdrop-filter/g) || [];
  const webkitMatches = revampSection.match(/-webkit-backdrop-filter/g) || [];
  assert.ok(webkitMatches.length > 0, 'must have at least one -webkit-backdrop-filter');
  assert.equal(bdMatches.length, webkitMatches.length * 2, 'every backdrop-filter must have a -webkit- counterpart');
});

// ── Mobile responsive layer (landing-mobile.css) ──
test('landing-mobile.css exists and is imported in styles.css', async () => {
  const styles = await src('styles.css');
  assert.match(styles, /@import\s+'\.\/css\/landing-mobile\.css'/);
  await access(path.join(root, 'apps/lab-web/src/css/landing-mobile.css'));
});

test('landing-mobile.css has phone breakpoint at 768px', async () => {
  const css = await cssSrc();
  assert.match(css, /@media\s*\(max-width:768px\)/);
});

test('landing-mobile.css has small-phone breakpoint at 430px', async () => {
  const css = await cssSrc();
  assert.match(css, /@media\s*\(max-width:430px\)/);
});

test('landing-mobile.css breaks the fixed viewport lock on mobile', async () => {
  const css = await cssSrc();
  // The desktop layout uses position:fixed; the mobile layer must override
  // to position:relative or position:absolute to allow scrolling
  const mobileSection = css.slice(css.indexOf('LANDING MOBILE'));
  assert.ok(mobileSection.length > 0, 'landing-mobile.css section must exist');
  assert.match(mobileSection, /position:relative|position:absolute/);
  assert.match(mobileSection, /overflow-y:auto|overflow:visible/);
});

test('landing-mobile.css stacks two-column grid into single column on phone', async () => {
  const css = await cssSrc();
  const mobileSection = css.slice(css.indexOf('LANDING MOBILE'));
  assert.match(mobileSection, /\.landing-content\{[^}]*flex-direction:column/);
});

test('landing-mobile.css has touch-friendly targets (min 44px)', async () => {
  const css = await cssSrc();
  const mobileSection = css.slice(css.indexOf('LANDING MOBILE'));
  // Touch targets must use --touch-target (44px) or explicit min-height
  assert.match(mobileSection, /--touch-target/);
  assert.match(mobileSection, /min-height:var\(--touch-target\)/);
});

test('landing-mobile.css has safe-area insets for notches', async () => {
  const css = await cssSrc();
  const mobileSection = css.slice(css.indexOf('LANDING MOBILE'));
  assert.match(mobileSection, /safe-area-inset-top|var\(--safe-area-top\)/);
  assert.match(mobileSection, /safe-area-inset-bottom|var\(--safe-area-bottom\)/);
});

test('landing-mobile.css transforms account dropdown to bottom sheet on mobile', async () => {
  const css = await cssSrc();
  const mobileSection = css.slice(css.indexOf('LANDING MOBILE'));
  assert.match(mobileSection, /\.account-dropdown\{[^}]*bottom:0/);
  assert.match(mobileSection, /transform:translateY\(100%\)/);
});

test('landing-mobile.css has prefers-reduced-data support', async () => {
  const css = await cssSrc();
  const mobileSection = css.slice(css.indexOf('LANDING MOBILE'));
  assert.match(mobileSection, /@media\s*\(prefers-reduced-data:reduce\)/);
});

test('landing-mobile.css has landscape phone orientation support', async () => {
  const css = await cssSrc();
  const mobileSection = css.slice(css.indexOf('LANDING MOBILE'));
  assert.match(mobileSection, /orientation:landscape/);
});

// ── Homepage structure (canonical full-page experience) ──
test('homepage section order: hero → pulse → grid → footer', async () => {
  const view = await src('home/home-view.js');
  const heroIdx = view.indexOf('home-hero"');
  const pulseIdx = view.indexOf('home-pulse"');
  const gridIdx = view.indexOf('home-grid"');
  assert.ok(heroIdx > -1 && pulseIdx > heroIdx && gridIdx > pulseIdx,
    'canonical order must be hero → live pulse → ecosystem grid');
});

test('homepage primary nav has all approved destinations', async () => {
  const view = await src('home/home-view.js');
  for (const label of ['PLAY', 'LEARN', 'CARDS', 'RANKINGS', 'TOURNAMENTS', 'NEWS', 'COMMUNITY']) {
    assert.ok(view.includes(`label: '${label}'`), `nav must include ${label}`);
  }
});

test('homepage Explore panel wires the four approved destinations', async () => {
  const view = await src('home/home-view.js');
  const exploreIdx = view.indexOf('EXPLORE_DESTINATIONS = [');
  const exploreEnd = view.indexOf('];', exploreIdx);
  const explore = view.slice(exploreIdx, exploreEnd);
  for (const href of ['#/rules', '#/cards', '#/leaderboard']) {
    assert.ok(explore.includes(`href: '${href}'`), `explore must link to ${href}`);
  }
  assert.match(explore, /reddit\.com\/r\/intrilex/);
  assert.doesNotMatch(explore, /#\/tournaments|#\/players/,
    'TOURNAMENTS and PLAYERS are retired from the homepage Explore block');
});

test('home.css is imported and styles the homepage', async () => {
  const styles = await src('styles.css');
  assert.match(styles, /@import\s+'\.\/css\/home\.css'/);
  const css = await readFile(path.join(root, 'apps/lab-web/src/css/home.css'), 'utf8');
  assert.match(css, /\.home-hero/);
  assert.match(css, /\.home-pulse/);
  assert.match(css, /\.home-grid/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:reduce\)/);
});

test('homepage unlocks the fixed landing viewport so the page scrolls', async () => {
  const css = await readFile(path.join(root, 'apps/lab-web/src/css/home.css'), 'utf8');
  const appRule = css.match(/\.home-app\{[^}]*\}/);
  assert.ok(appRule, 'must have .home-app rule');
  assert.match(appRule[0], /position:relative/);
  assert.match(appRule[0], /overflow:visible/);
});

test('home.css has responsive breakpoints for tablet and phone', async () => {
  const css = await readFile(path.join(root, 'apps/lab-web/src/css/home.css'), 'utf8');
  assert.match(css, /@media\s*\(max-width:1100px\)/);
  assert.match(css, /@media\s*\(max-width:900px\)/);
  assert.match(css, /@media\s*\(max-width:640px\)/);
  assert.match(css, /@media\s*\(max-width:430px\)/);
});

test('homepage has mobile nav drawer + toggle', async () => {
  const view = await src('home/home-view.js');
  assert.match(view, /data-home-nav-toggle/);
  assert.match(view, /data-home-nav-drawer/);
  const js = await src('home/home.js');
  assert.match(js, /aria-expanded/);
});

test('home.css uses -webkit-backdrop-filter alongside backdrop-filter', async () => {
  const css = await readFile(path.join(root, 'apps/lab-web/src/css/home.css'), 'utf8');
  // '/backdrop-filter/' matches both plain and prefixed occurrences, so a
  // fully-prefixed file has exactly 2 matches per rule (1 webkit + 1 plain).
  const bdMatches = css.match(/backdrop-filter/g) || [];
  const webkitMatches = css.match(/-webkit-backdrop-filter/g) || [];
  assert.ok(webkitMatches.length > 0, 'must have -webkit-backdrop-filter rules');
  assert.equal(bdMatches.length, webkitMatches.length * 2,
    'every backdrop-filter must have a -webkit- counterpart');
});

// ── Showcase view mode (tri-state toggle) ──
test('rulebook-renderer.js has showcase mode functions', async () => {
  const js = await src('rulebook-renderer.js');
  assert.match(js, /function renderShowcaseParts/);
  assert.match(js, /function generateShowcaseHero/);
  assert.match(js, /function generateShowcasePartHeader/);
  assert.match(js, /function generateShowcaseCardFrame/);
  assert.match(js, /function enhanceShowcaseContent/);
  assert.match(js, /rules-showcase/);
});

test('rulebook-renderer.js has tri-state toggle with showcase button', async () => {
  const js = await src('rulebook-renderer.js');
  assert.match(js, /rules-toggle-showcase/);
  assert.match(js, /RULES_VIEW_MODE/);
  assert.match(js, /toggleTo\('showcase'\)/);
  assert.match(js, /toggleTo\('illustrated'\)/);
  assert.match(js, /toggleTo\('text'\)/);
});

test('rulebook-renderer.js has showcase mini-nav with scroll-spy', async () => {
  const js = await src('rulebook-renderer.js');
  assert.match(js, /showcase-mini-nav/);
  assert.match(js, /showcase-mini-nav-dot/);
  assert.match(js, /showcase-part\[id\]/);
});

test('state.js persists rulesViewMode', async () => {
  const js = await src('state.js');
  assert.match(js, /rulesViewMode/);
  assert.match(js, /PERSISTABLE_SETTINGS.*rulesViewMode/);
  assert.match(js, /rulesViewMode:\s*'illustrated'/);
});

test('rules-illustrated.css has showcase mode classes', async () => {
  const css = await rulesCss();
  assert.match(css, /body\.rules-showcase/);
  assert.match(css, /\.showcase-hero/);
  assert.match(css, /\.showcase-part/);
  assert.match(css, /\.showcase-drop-cap/);
  assert.match(css, /\.showcase-pullquote/);
  assert.match(css, /\.showcase-key-rule/);
  assert.match(css, /\.showcase-card-gallery/);
  assert.match(css, /\.showcase-divider/);
  assert.match(css, /\.showcase-mini-nav/);
  assert.match(css, /\.showcase-table/);
});

test('rules-illustrated.css showcase has responsive and reduced-motion support', async () => {
  const css = await rulesCss();
  const showcaseSection = css.slice(css.indexOf('SHOWCASE MODE'));
  assert.ok(showcaseSection.length > 0, 'showcase CSS section must exist');
  assert.match(showcaseSection, /@media\(max-width:900px\)/);
  assert.match(showcaseSection, /@media\(max-width:600px\)/);
  assert.match(showcaseSection, /@media\(prefers-reduced-motion:reduce\)/);
});

