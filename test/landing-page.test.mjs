import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');
const dist = (rel) => readFile(path.join(root, 'apps/lab-web/dist', rel), 'utf8');
const cssSrc = async () => (await Promise.all(['tokens-base','feature-components','pages-polish','landing-revamp','landing-mobile'].map(f => readFile(path.join(root, 'apps/lab-web/src/css', `${f}.css`), 'utf8')))).join('\n');

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
test('renderWipLanding() exists and renders WIP coming soon hero and newsletter', async () => {
  const js = await src('app.js');
  assert.match(js, /function renderWipLanding\(\)/);
  assert.match(js, /wip-coming-soon/);
  assert.match(js, /wip-newsletter/);
  assert.match(js, /wip-dev-preview-btn/);
});

test('renderLanding() exists and renders play panel and rules card', async () => {
  const js = await src('app.js');
  assert.match(js, /function renderLanding\(\)/);
  assert.match(js, /landing-card.*play/);
  assert.match(js, /landing-card.*rules/);
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

test('renderLandingMode() dispatches to render functions for /, /dev, and /rules', async () => {
  const js = await src('app.js');
  assert.ok(js.includes('function renderLandingMode(r)'), 'must have renderLandingMode function');
  assert.ok(js.includes("if (r === '/') renderWipLanding()"), 'must dispatch / to renderWipLanding');
  assert.ok(js.includes("else if (r === '/dev') renderLanding()"), 'must dispatch /dev to renderLanding');
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
  assert.match(dev, /4173\/#\/['"]/);
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
  assert.match(js, /renderLanding/);
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
  const js = await src('app.js');
  assert.match(js, /TACTICAL PLAYING CARD GAME/);
  assert.doesNotMatch(js, /DETERMINISTIC CARD ENGINE.*V\$\{RULES_VERSION\}/);
});

test('default selected mode is local', async () => {
  const js = await src('app.js');
  assert.match(js, /_landingSelectedMode = 'local'/);
  assert.match(js, /class="landing-mode-tile selected"[^>]*data-mode="local"/);
});

test('mode tiles have selected-state check indicator', async () => {
  const js = await src('app.js');
  assert.match(js, /landing-mode-check/);
  const css = await cssSrc();
  assert.match(css, /\.landing-mode-check/);
  assert.match(css, /\.landing-mode-tile\.selected \.landing-mode-check/);
});

test('primary CTA is mode-aware with dynamic labels', async () => {
  const js = await src('app.js');
  assert.match(js, /START LOCAL DUEL/);
  assert.match(js, /START ONLINE DUEL/);
  assert.match(js, /modeLabels\[/);
});

test('initial CTA text matches default local mode', async () => {
  const js = await src('app.js');
  assert.match(js, /<span>START LOCAL DUEL<\/span>/);
});

test('Online Duel copy does not overpromise with worldwide', async () => {
  const js = await src('app.js');
  assert.match(js, /Compete against players online/);
  assert.doesNotMatch(js, /players worldwide/);
});

test('Learn Intrilex rail card removed (no redundant CTA to tutorial)', async () => {
  const js = await src('app.js');
  assert.doesNotMatch(js, /LEARN INTRILEX/);
  assert.doesNotMatch(js, /landing-rail-card learn/);
});

test('right rail order: What\'s New, Rules, Ranking System, Players, Leaderboard, Forums', async () => {
  const js = await src('app.js');
  const railStart = js.indexOf('landing-secondary-rail');
  const railSection = js.slice(railStart);
  const whatsNewIdx = railSection.indexOf("WHAT'S NEW");
  const rulesIdx = railSection.indexOf('landing-rail-card rules');
  const rankingIdx = railSection.indexOf('data-ranking-system-card');
  const playersIdx = railSection.indexOf('data-players-card');
  const leaderboardIdx = railSection.indexOf('data-leaderboard-card');
  const forumsIdx = railSection.indexOf('intrilex.discourse.group');
  assert.ok(whatsNewIdx > -1 && whatsNewIdx < rulesIdx, "What's New must come before Rules");
  assert.ok(rulesIdx > -1 && rulesIdx < rankingIdx, 'Rules must come before Ranking System');
  assert.ok(rankingIdx > -1 && rankingIdx < playersIdx, 'Ranking System must come before Players');
  assert.ok(playersIdx > -1 && playersIdx < leaderboardIdx, 'Players must come before Leaderboard');
  assert.ok(leaderboardIdx > -1 && leaderboardIdx < forumsIdx, 'Leaderboard must come before Forums');
});

test('Continue Duel slot is in the topbar, not the rail', async () => {
  const js = await src('app.js');
  const topbarStart = js.indexOf('landing-topbar');
  const topbarEnd = js.indexOf('</header>', topbarStart);
  const topbarSection = js.slice(topbarStart, topbarEnd);
  assert.ok(topbarSection.includes('landing-continue-slot'), 'Continue slot must be in the topbar');
  // Continue slot must NOT be inside the rail's landing-cards div
  const railCardsStart = js.indexOf('class="landing-cards"');
  const railCardsEnd = js.indexOf('</div>', js.indexOf('landing-rail-card forums', railCardsStart));
  const railCardsSection = js.slice(railCardsStart, railCardsEnd);
  assert.ok(!railCardsSection.includes('landing-continue-slot'), 'Continue slot must not be in the rail cards');
});

test('Forums card links to intrilex.discourse.group', async () => {
  const js = await src('app.js');
  assert.match(js, /href="https:\/\/intrilex\.discourse\.group\/"/);
});

test('Rules card copy says complete official rulebook', async () => {
  const js = await src('app.js');
  assert.match(js, /Read the complete official rulebook/);
});

test('What\'s New card shows version from canonical sources', async () => {
  const js = await src('app.js');
  assert.match(js, /v\$\{LAB_VERSION\}/);
  assert.match(js, /WHAT'S NEW/);
});

test('footer credit uses muted color, not bright red', async () => {
  const css = await cssSrc();
  assert.match(css, /\.landing-footer-credit-name\{[^}]*color:#c4405a/);
  assert.match(css, /\.landing-footer-credit\{[^}]*opacity:\.85/);
  assert.doesNotMatch(css, /\.landing-footer-credit-name\{[^}]*color:#CC0011/);
});

test('mode tiles have radiogroup and radio semantics', async () => {
  const js = await src('app.js');
  assert.match(js, /role="radiogroup"/);
  assert.match(js, /role="radio"/);
  assert.match(js, /aria-checked="true"/);
  assert.match(js, /aria-checked="false"/);
});

test('mode tiles support arrow-key navigation', async () => {
  const js = await src('app.js');
  assert.match(js, /ArrowRight/);
  assert.match(js, /ArrowLeft/);
});

test('landing-mode-tile has position relative for check indicator', async () => {
  const css = await cssSrc();
  assert.match(css, /\.landing-mode-tile\{[^}]*position:relative/);
});

// ── Homepage revamp regression tests (IRX-M41/M42) ──
test('landing-rail-card entrance animation uses backwards fill-mode (not both) so hover transforms work', async () => {
  const css = await cssSrc();
  // The animation must NOT use 'both' fill-mode, otherwise the retained
  // transform:translateY(0) overrides :hover transform:translateX(2px).
  const railCardAnimMatch = css.match(/\.landing-rail-card\{[^}]*animation:revamp-fade-up[^}]*\}/);
  assert.ok(railCardAnimMatch, 'must have entrance animation on .landing-rail-card');
  assert.match(railCardAnimMatch[0], /backwards/);
  assert.doesNotMatch(railCardAnimMatch[0], /\bboth\b/);
});

test('bindLandingEvents uses AbortController to prevent document listener accumulation', async () => {
  const js = await src('app.js');
  assert.match(js, /_landingListenerAbort/);
  assert.match(js, /new AbortController\(\)/);
  assert.match(js, /\{ signal \}/);
  assert.match(js, /_landingListenerAbort\.abort\(\)/);
});

test('loadContinueCard guards against stale slot after navigation', async () => {
  const js = await src('app.js');
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

// ── W.I.P. Landing Page (Coming Soon) ──
test('WIP landing page has required elements in app.js', async () => {
  const js = await src('app.js');
  assert.match(js, /class="landing-app wip-landing"/);
  assert.match(js, /class="wip-coming-soon"/);
  assert.match(js, /class="wip-tagline"/);
  assert.match(js, /class="wip-notice"/);
  assert.match(js, /class="wip-features"/);
  assert.match(js, /class="wip-newsletter"/);
  assert.match(js, /class="wip-community"/);
  assert.match(js, /class="wip-dev-preview-btn"/);
  assert.match(js, /href="#\/dev"/);
});

test('WIP newsletter binds form submission and localStorage save', async () => {
  const js = await src('app.js');
  assert.match(js, /function bindWipLandingEvents\(\)/);
  assert.match(js, /localStorage\.setItem\('intrilex:newsletter-email'/);
  assert.match(js, /showToast\(.*thank you/i);
});

test('WIP landing CSS classes exist in landing-revamp.css', async () => {
  const css = await cssSrc();
  assert.match(css, /\.wip-landing/);
  assert.match(css, /\.wip-topbar/);
  assert.match(css, /\.wip-dev-preview-btn/);
  assert.match(css, /\.wip-hero/);
  assert.match(css, /\.wip-coming-soon/);
  assert.match(css, /\.wip-logo/);
  assert.match(css, /\.wip-tagline/);
  assert.match(css, /\.wip-notice/);
  assert.match(css, /\.wip-features/);
  assert.match(css, /\.wip-feature-pill/);
  assert.match(css, /\.wip-newsletter/);
  assert.match(css, /\.wip-newsletter-form/);
  assert.match(css, /\.wip-newsletter-input/);
  assert.match(css, /\.wip-newsletter-btn/);
  assert.match(css, /\.wip-community/);
  assert.match(css, /\.wip-community-btn/);
});

test('WIP landing responsive styles exist in landing-mobile.css', async () => {
  const css = await cssSrc();
  const mobileSection = css.slice(css.indexOf('W.I.P. CINEMATIC LANDING RESPONSIVE OVERRIDES'));
  assert.ok(mobileSection.length > 0, 'WIP responsive section must exist in landing-mobile.css');
  assert.match(mobileSection, /\.wip-landing/);
  assert.match(mobileSection, /\.wip-features/);
  assert.match(mobileSection, /\.wip-newsletter-form/);
});

