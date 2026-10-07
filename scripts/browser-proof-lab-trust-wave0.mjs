/* global document */
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');
const mirrors = new Set(['lab-trust-policy.mjs', 'profile-store.mjs', 'profile-contracts.mjs', 'discovery-domain.mjs']);
const sourceFiles = new Set(['/experiment-controls.js', '/experiments/experiment-controller.mjs', '/evolution/profile-workspace.js', '/workspaces/discover.js']);
// Existing built shell with current changed source modules overlaid using the
// build's import rewrites. No repo artifacts or user browser storage are changed.
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    let content;
    if (pathname === '/' || pathname === '/index.html') content = (await readFile(path.join(dist, 'index.html'), 'utf8')).replace(/src="app\.[a-f0-9]+\.js"/, 'src="app.js"');
    if (pathname === '/proof.html') content = '<!doctype html><title>Wave 0 native IndexedDB proof</title>';
    if (pathname === '/source/domain.mjs') content = (await readFile(path.join(root, 'packages/simulation-runtime/src/experiment-domain.mjs'), 'utf8')).replaceAll("'@intrilex/shared'", "'/shared-browser.js'");
    if (pathname === '/source/store.mjs') content = (await readFile(path.join(root, 'apps/lab-web/src/experiments/experiment-store.mjs'), 'utf8')).replaceAll("'../../../../packages/simulation-runtime/src/experiment-domain.mjs'", "'/source/domain.mjs'");
    if (pathname === '/source/controller.txt') content = await readFile(path.join(root, 'apps/lab-web/src/experiments/experiment-controller.mjs'), 'utf8');
    if (sourceFiles.has(pathname)) content = (await readFile(path.join(root, 'apps/lab-web/src', pathname.slice(1)), 'utf8')).replaceAll('../../../../packages/simulation-runtime/src/', '../evolution/');
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
  // Keep the desired behavior as an actual assertion, with a separately
  // reported expected failure. Strict mode makes this a failing release gate.
  try { assert.notEqual(result.ids[0], result.ids[1]); assert.equal(result.manifestCount, 2); }
  catch (error) {
    if (error.code !== 'ERR_ASSERTION') throw error;
    report.deferred.push({ ticket: 'R02', status: 'KNOWN_FAILURE', ...result });
  }
  assert.equal(report.deferred.length, 1, 'R02 changed: review/update the frozen audit regression instead of silently removing it');
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
  if (process.argv.includes('--strict')) process.exitCode = 1;
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
