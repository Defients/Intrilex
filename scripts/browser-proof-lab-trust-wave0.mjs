/* global document */
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');
const mirrors = new Set(['lab-trust-policy.mjs', 'profile-store.mjs', 'profile-contracts.mjs', 'discovery-domain.mjs', 'experiment-domain.mjs', 'experiment-portability.mjs']);
const sourceFiles = new Set(['/experiment-controls.js', '/experiments/experiment-controller.mjs', '/experiments/experiment-store.mjs', '/evolution/profile-workspace.js', '/workspaces/discover.js']);
// Bundle current source in memory using the existing built engine/assets.
// Resolve version-query imports once so state modules are not duplicated.
// No generated repo files or user browser storage are changed by this proof.
const portableSource = async name => (await readFile(path.join(root, 'packages/simulation-runtime/src', name), 'utf8'))
  .replaceAll("'@intrilex/shared'", "'../shared-browser.js'")
  .replaceAll("'@intrilex/statistics/estimators'", "'../shared-analytics/estimators.mjs'")
  .replaceAll("'../../policies/src/weighted-heuristic.mjs'", "'./weighted-heuristic.mjs'");
const browserBundle = await build({
  entryPoints: [path.join(dist, 'app.js')], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2020',
  jsx: 'automatic', alias: { '@intrilex/shared': path.join(dist, 'shared-browser.js') },
  define: { __INTRILEX_TACTICAL_CSS__: '"/client/game-table.css"' }, logLevel: 'silent',
  plugins: [{ name: 'wave0-source-overlay', setup(bundler) {
    bundler.onResolve({ filter: /\?v=|lab-trust-policy\.mjs$/ }, async args => {
      if (args.pluginData?.resolved) return undefined;
      const clean = args.path.split('?')[0];
      if (clean.endsWith('/lab-trust-policy.mjs')) return { path: path.join(dist, 'evolution/lab-trust-policy.mjs') };
      // This optional theme import is absent from the existing build and
      // already has a runtime catch. Preserve that behavior; do not invent
      // a module or change unrelated settings to run the containment proof.
      if (clean.endsWith('landing/seasonal-theme.js')) return { path: '/landing/seasonal-theme.js', external: true };
      return bundler.resolve(clean, { resolveDir: args.resolveDir, kind: args.kind, pluginData: { resolved: true } });
    });
    bundler.onLoad({ filter: /\.(mjs|js)$/ }, async args => {
      const relative = path.relative(dist, args.path).replaceAll('\\', '/');
      if (sourceFiles.has('/' + relative)) return { contents: (await readFile(path.join(root, 'apps/lab-web/src', relative), 'utf8'))
        .replaceAll('../../../../packages/simulation-runtime/src/', '../evolution/').replaceAll('../../../../packages/shared/src/canonical.mjs', '../shared-browser.js'),
        resolveDir: path.dirname(args.path), loader: 'js' };
      if (relative.startsWith('evolution/') && mirrors.has(path.basename(relative))) return { contents: await portableSource(path.basename(relative)), resolveDir: path.dirname(args.path), loader: 'js' };
      return undefined;
    });
  } }],
});
const bundleText = browserBundle.outputFiles.find(file => file.path.endsWith('.js') || file.path === '<stdout>')?.text;
assert.ok(bundleText, 'browser proof must compile a current application bundle');
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    let content;
    if (pathname === '/' || pathname === '/index.html') content = (await readFile(path.join(dist, 'index.html'), 'utf8')).replace(/src="app\.[a-f0-9]+\.js"/, 'src="wave0-proof-app.js"');
    if (pathname === '/wave0-proof-app.js') content = bundleText;
    if (pathname === '/proof.html') content = '<!doctype html><title>Wave 0 native IndexedDB proof</title>';
    if (pathname === '/source/domain.mjs') content = (await readFile(path.join(root, 'packages/simulation-runtime/src/experiment-domain.mjs'), 'utf8')).replaceAll("'@intrilex/shared'", "'/shared-browser.js'");
    if (pathname === '/source/store.mjs') content = (await readFile(path.join(root, 'apps/lab-web/src/experiments/experiment-store.mjs'), 'utf8')).replaceAll("'../../../../packages/simulation-runtime/src/experiment-domain.mjs'", "'/source/domain.mjs'");
    if (pathname === '/source/controller.txt') content = await readFile(path.join(root, 'apps/lab-web/src/experiments/experiment-controller.mjs'), 'utf8');
    if (sourceFiles.has(pathname)) content = (await readFile(path.join(root, 'apps/lab-web/src', pathname.slice(1)), 'utf8'))
      .replaceAll('../../../../packages/simulation-runtime/src/', '../evolution/')
      .replaceAll('../../../../packages/shared/src/canonical.mjs', '/shared-browser.js')
      .replaceAll('../../../../packages/', '/packages/');
    if (pathname.startsWith('/evolution/') && mirrors.has(path.basename(pathname))) content = (await readFile(path.join(root, 'packages/simulation-runtime/src', path.basename(pathname)), 'utf8'))
      .replaceAll("'@intrilex/shared'", "'../shared-browser.js'").replaceAll("'@intrilex/statistics/estimators'", "'../shared-analytics/estimators.mjs'").replaceAll("'../../policies/src/weighted-heuristic.mjs'", "'./weighted-heuristic.mjs'");
    const target = path.resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(dist + path.sep)) throw Error('outside test root');
    const body = content ?? await readFile(target);
    res.writeHead(200, { 'Content-Type': /\.(mjs|js)$/.test(pathname) ? 'text/javascript' : pathname.endsWith('.html') || pathname === '/' ? 'text/html' : pathname.endsWith('.css') ? 'text/css' : pathname.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const report = { containment: [], deferred: [], pageErrors: [] };
try {
  browser = await chromium.launch({ channel: process.env.INTRILEX_BROWSER_CHANNEL || 'chrome', headless: true });
  report.browser = browser.version();
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(base + '/proof.html');
  const result = await page.evaluate(async () => {
    const domain = await import('/source/domain.mjs'), { ExperimentStore } = await import('/source/store.mjs'), { hashCanonical } = await import('/shared-browser.js');
    const src = (await (await fetch('/source/controller.txt')).text()).replace(/import\s[^;]*?from\s*'[^']*';/gs, '').replace(/^export /gm, '');
    async function make(store) {
      const deps = { ...domain, ExperimentStore, hashCanonical, summariesCarryDecisionEvidence: () => false, console, structuredClone, TextEncoder,
        state: { bootState: null, observatory: {}, aggregate: {} }, showToast() {}, updateRailContext() {}, rerender() {}, RULES_VERSION: '4.3.1', ENGINE_VERSION: '4.2.6', LAB_VERSION: 'wave0', Worker: class { constructor() { throw Error('disabled'); } } };
      const api = new Function('deps', 'with(deps){' + src + ';return {initExperiments,beginExperimentRun};}')(deps);
      await api.initExperiments({ store }); return api;
    }
    const sa = new ExperimentStore(), sb = new ExperimentStore(), a = await make(sa), b = await make(sb);
    const config = { matchCount: 2, ordinalStart: 0, ordinalEnd: 2, policyIds: ['control', 'tempo'], profileId: 'core-advanced-authority' };
    const [ra, rb] = await Promise.all([a.beginExperimentRun({ config }), b.beginExperimentRun({ config: { ...config, policyIds: ['value', 'tempo'] } })]);
    return { nativeIndexedDB: sa.persisted && sb.persisted, ids: [ra.runId, rb.runId], manifestCount: (await sa.listManifests()).length };
  });
  assert.equal(result.nativeIndexedDB, true);
  // R02 is now a genuine assertion: cross-connection manifest allocation is
  // fenced — two independent controllers cannot claim the same run occurrence.
  assert.notEqual(result.ids[0], result.ids[1], 'two controllers must allocate distinct run occurrences');
  assert.equal(result.manifestCount, 2);
  report.containment.push({ status: 'PASS', name: 'cross-connection run allocation is fenced (R02)', ids: result.ids });
  await context.close();

  const blocked = await browser.newContext();
  await blocked.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true }));
  const ui = await blocked.newPage(); ui.on('pageerror', error => report.pageErrors.push(error.message));
  await ui.goto(base + '/#/evolution', { waitUntil: 'domcontentloaded' });
  await ui.waitForSelector('#experiment-button', { timeout: 45000 });
  await ui.click('#experiment-button'); await ui.fill('#exp-count', '2'); await ui.click('#run-experiment');
  await ui.waitForFunction(() => /durable run cannot start/.test(document.querySelector('#experiment-status')?.textContent ?? ''), {}, { timeout: 15000 });
  const text = await ui.locator('#experiment-status').textContent();
  assert.doesNotMatch(text, /\bpersisted\b|\bcommitted\b/);
  assert.equal(await ui.locator('#run-experiment').isEnabled(), true);
  assert.equal(await ui.locator('#cancel-experiment').isDisabled(), true);
  assert.deepEqual(report.pageErrors, []);
  report.containment.push({ status: 'PASS', name: 'memory-only campaign blocked in actual UI', text });
  const domainGuard = await ui.evaluate(async () => {
    const policy = await import('/evolution/lab-trust-policy.mjs');
    const contracts = await import('/evolution/profile-contracts.mjs');
    const m = { kind: 'MEASUREMENT_RESULT', body: { eraId: 'x', packId: 'y', status: 'COMPLETE' } };
    return { policy: policy.LAB_TRUST_POLICY, comparison: contracts.canCompareMeasurements(m, m, { purpose: 'CONFIRMATORY' }) };
  });
  assert.equal(domainGuard.policy.automaticPromotion, false);
  assert.equal(domainGuard.comparison.ok, false);
  report.containment.push({ status: 'PASS', name: 'browser policy and confirmatory gate match source' });
  await blocked.close();
  if (process.argv.includes('--strict') && report.deferred.length) process.exitCode = 1;
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
